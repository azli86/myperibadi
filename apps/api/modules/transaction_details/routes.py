from __future__ import annotations

import asyncio
from pathlib import Path
import urllib.parse
from typing import Awaitable, Callable, Optional

import fitz
from fastapi import HTTPException, Request, Response, UploadFile
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import storage_service
import budget_service


async def get_receipts_route(
    *,
    request: Request,
    current_user: models.User,
    db: AsyncSession,
    serialize_attachment: Callable[..., schemas.AttachmentResponse],
    month_key: Optional[str] = None,
    category_id: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 60,
    offset: int = 0,
) -> list[dict]:
    household_id = current_user.default_household_id
    if household_id is None:
        return []

    start_day = int(getattr(current_user, "cycle_start_day", 1) or 1)
    if month_key:
        month_key = budget_service.normalize_month_key(month_key, start_day)
        month_start, month_end_exclusive = budget_service.month_bounds(month_key, start_day)
    else:
        cycle = await budget_service.resolve_user_cycle(db, user=current_user)
        month_key = cycle["month_key"]
        month_start, month_end_exclusive = cycle["start"], cycle["end"]

    if limit is None or limit <= 0:
        limit = 60
    limit = min(limit, 200)
    if offset is None or offset < 0:
        offset = 0

    stmt = (
        select(
            models.Attachment,
            models.Transaction.id.label("txn_id"),
            models.Transaction.amount,
            models.Transaction.txn_date,
            models.Transaction.vendor_or_source,
            models.Transaction.category_id,
            models.Transaction.notes,
            models.Category.name.label("category_name"),
        )
        .join(models.Transaction, models.Attachment.transaction_id == models.Transaction.id)
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .where(
            or_(
                models.Transaction.household_id == household_id,
                and_(
                    models.Transaction.household_id.is_(None),
                    models.Transaction.user_id == current_user.id,
                ),
            )
        )
    )

    if month_key:
        stmt = stmt.where(models.Transaction.txn_date >= month_start)
        stmt = stmt.where(models.Transaction.txn_date < month_end_exclusive)

    if category_id is not None:
        stmt = stmt.where(models.Transaction.category_id == category_id)

    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                models.Transaction.vendor_or_source.ilike(like),
                models.Transaction.notes.ilike(like),
            )
        )

    stmt = stmt.order_by(models.Attachment.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)

    receipts: list[dict] = []
    for attachment, txn_id, amount, txn_date, vendor, cat_id, notes, cat_name in result.all():
        serialized = serialize_attachment(attachment, request).model_dump()
        serialized["transaction"] = {
            "id": txn_id,
            "amount": float(amount) if amount is not None else None,
            "txn_date": txn_date.strftime("%Y-%m-%d") if txn_date else None,
            "vendor_or_source": vendor,
            "category_id": cat_id,
            "category_name": cat_name,
            "notes": notes,
        }
        receipts.append(serialized)

    return receipts


async def get_transaction_detail_route(
    *,
    txn_id: str,
    request: Request,
    current_user: models.User,
    db: AsyncSession,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    backfill_wallet_transfer_categories: Callable[..., Awaitable[None]],
    serialize_attachment: Callable[..., schemas.AttachmentResponse],
    serialize_transaction_item: Callable[..., dict],
    is_wallet_transfer_signature: Callable[..., bool],
    is_debt_movement_signature: Callable[..., bool],
) -> dict:
    household_id = await ensure_current_user_household(db, current_user)
    await backfill_wallet_transfer_categories(db, user_id=current_user.id, household_id=household_id)
    id_cond = models.Transaction.id == int(txn_id) if txn_id.isdigit() else False

    stmt = (
        select(
            models.Transaction,
            models.Category.name.label("category_name"),
            models.Category.icon_name.label("category_icon_name"),
            models.Category.is_internal.label("category_is_internal"),
            models.Category.system_code.label("category_system_code"),
            func.coalesce(models.Wallet.label, models.Wallet.name).label("wallet_name"),
        )
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .outerjoin(models.Wallet, models.Transaction.wallet_id == models.Wallet.id)
        .where(or_(id_cond, models.Transaction.reference_id == txn_id))
        .where(models.Transaction.user_id == current_user.id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn = row[0]

    att_result = await db.execute(
        select(models.Attachment)
        .where(models.Attachment.transaction_id == txn.id)
        .order_by(models.Attachment.created_at.desc())
    )
    attachments = [serialize_attachment(att, request).model_dump() for att in att_result.scalars().all()]

    item_result = await db.execute(
        select(models.TransactionItem)
        .where(models.TransactionItem.transaction_id == txn.id)
        .order_by(models.TransactionItem.sort_order.asc(), models.TransactionItem.id.asc())
    )
    items = [serialize_transaction_item(item) for item in item_result.scalars().all()]

    category_is_internal = bool(row[3])
    category_system_code = row[4]
    is_wallet_transfer = is_wallet_transfer_signature(
        txn,
        category_system_code=category_system_code,
        category_is_internal=category_is_internal,
    )
    is_debt_movement = is_debt_movement_signature(category_system_code=category_system_code)

    # Detect refund linkage — both directions
    is_refund = False
    has_been_refunded = False
    refund_reference_id: str | None = None
    refund_txn_date: str | None = None

    # Check if THIS transaction is a refund
    notes_text = (txn.notes or "").strip()
    vendor_text = (txn.vendor_or_source or "").strip()
    if notes_text.startswith("Refund for transaction #") or vendor_text.startswith("Refund: "):
        is_refund = True

    # Check if this transaction HAS BEEN refunded (a refund tx points to this one)
    search_note_patterns = [
        f"Refund for transaction #{txn.reference_id}",
        f"Refund for transaction #{txn.id}",
    ]
    for pattern in search_note_patterns:
        refund_result = await db.execute(
            select(models.Transaction).where(
                models.Transaction.user_id == current_user.id,
                models.Transaction.notes == pattern,
                models.Transaction.id != txn.id,
            )
        )
        refund_txn = refund_result.scalars().first()
        if refund_txn:
            has_been_refunded = True
            refund_reference_id = refund_txn.reference_id
            refund_txn_date = refund_txn.txn_date.strftime("%Y-%m-%d") if refund_txn.txn_date else None
            break

    return {
        "id": txn.id,
        "reference_id": txn.reference_id,
        "user_id": txn.user_id,
        "wallet_id": txn.wallet_id,
        "wallet_name": row[5] if row[5] else "Cash",
        "type": txn.type,
        "txn_date": txn.txn_date.strftime("%Y-%m-%d") if txn.txn_date else None,
        "vendor_or_source": txn.vendor_or_source,
        "amount": float(txn.amount),
        "category_id": txn.category_id,
        "subscription_id": txn.subscription_id,
        "category_name": row[1],
        "category_icon_name": row[2],
        "category_is_internal": category_is_internal,
        "category_system_code": category_system_code,
        "is_wallet_transfer": is_wallet_transfer,
        "is_debt_movement": is_debt_movement,
        "is_refund": is_refund,
        "has_been_refunded": has_been_refunded,
        "refund_reference_id": refund_reference_id,
        "refund_txn_date": refund_txn_date,
        "notes": txn.notes,
        "latitude": float(txn.latitude) if txn.latitude is not None else None,
        "longitude": float(txn.longitude) if txn.longitude is not None else None,
        "location_name": txn.location_name,
        "source_channel": txn.source_channel,
        "created_at": txn.created_at.isoformat() if txn.created_at else None,
        "attachments": attachments,
        "items": items,
    }


async def get_transaction_attachments_route(
    *,
    txn_id: str,
    request: Request,
    current_user: models.User,
    db: AsyncSession,
    get_user_transaction: Callable[..., Awaitable[models.Transaction]],
    serialize_attachment: Callable[..., schemas.AttachmentResponse],
) -> list[schemas.AttachmentResponse]:
    txn = await get_user_transaction(txn_id, current_user.id, db)
    result = await db.execute(
        select(models.Attachment)
        .where(models.Attachment.transaction_id == txn.id)
        .order_by(models.Attachment.created_at.desc())
    )
    attachments = result.scalars().all()
    return [serialize_attachment(att, request) for att in attachments]


async def upload_transaction_attachment_route(
    *,
    txn_id: str,
    request: Request,
    file: UploadFile,
    current_user: models.User,
    db: AsyncSession,
    get_user_transaction: Callable[..., Awaitable[models.Transaction]],
    serialize_attachment: Callable[..., schemas.AttachmentResponse],
    delete_storage_object_safe: Callable[[str], Awaitable[None]],
) -> schemas.AttachmentResponse:
    txn = await get_user_transaction(txn_id, current_user.id, db)
    payload = await file.read()

    try:
        mime_type, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
    except storage_service.StorageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    object_key = storage_service.build_receipt_object_key(current_user.id, txn.id, file.filename, extension)

    try:
        await asyncio.to_thread(storage_service.upload_receipt_object, object_key, payload, mime_type)
    except storage_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    safe_name = Path(file.filename or f"receipt{extension}").name
    attachment = models.Attachment(
        transaction_id=txn.id,
        uploaded_by_user_id=current_user.id,
        file_name=safe_name or f"receipt{extension}",
        file_path=object_key,
        mime_type=mime_type,
        size_bytes=len(payload),
    )
    db.add(attachment)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await delete_storage_object_safe(object_key)
        raise HTTPException(status_code=500, detail="Failed to save attachment metadata.")

    await db.refresh(attachment)
    return serialize_attachment(attachment, request)


async def get_attachment_file_route(
    *,
    attachment_id: int,
    current_user: models.User,
    db: AsyncSession,
    get_user_attachment: Callable[..., Awaitable[models.Attachment]],
) -> Response:
    attachment = await get_user_attachment(attachment_id, current_user.id, db)
    file_path = attachment.file_path
    stored_mime_type = attachment.mime_type
    stored_file_name = attachment.file_name
    stored_attachment_id = attachment.id
    # R2 downloads can be slow. Release the DB connection before network I/O so
    # a gallery of concurrent thumbnails cannot exhaust the connection pool.
    await db.close()

    try:
        payload, detected_mime = await asyncio.to_thread(storage_service.download_receipt_object, file_path)
    except storage_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    media_type = stored_mime_type or detected_mime or "application/octet-stream"
    safe_name = Path(stored_file_name or f"attachment-{stored_attachment_id}").name.replace('"', "")
    disposition = "inline" if media_type.startswith("image/") or media_type == "application/pdf" else "attachment"
    quoted_name = urllib.parse.quote(safe_name)

    return Response(
        content=payload,
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quoted_name}",
        },
    )


async def get_attachment_pdf_preview_route(
    *,
    attachment_id: int,
    current_user: models.User,
    db: AsyncSession,
    get_user_attachment: Callable[..., Awaitable[models.Attachment]],
) -> Response:
    attachment = await get_user_attachment(attachment_id, current_user.id, db)
    if attachment.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Attachment is not a PDF.")
    file_path = attachment.file_path
    await db.close()

    try:
        payload, _ = await asyncio.to_thread(storage_service.download_receipt_object, file_path)

        def render_first_page() -> bytes:
            document = fitz.open(stream=payload, filetype="pdf")
            try:
                if document.page_count < 1:
                    raise ValueError("PDF has no pages.")
                page = document.load_page(0)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
                return pixmap.tobytes("png")
            finally:
                document.close()

        preview = await asyncio.to_thread(render_first_page)
    except storage_service.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except storage_service.StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to preview PDF: {exc}")

    return Response(
        content=preview,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=60"},
    )


async def delete_attachment_route(
    *,
    attachment_id: int,
    current_user: models.User,
    db: AsyncSession,
    get_user_attachment: Callable[..., Awaitable[models.Attachment]],
    delete_storage_object_safe: Callable[[str], Awaitable[None]],
) -> dict[str, str]:
    attachment = await get_user_attachment(attachment_id, current_user.id, db)
    await delete_storage_object_safe(attachment.file_path)

    await db.execute(update(models.ChatMessage).where(models.ChatMessage.attachment_id == attachment.id).values(attachment_id=None))
    await db.execute(models.Attachment.__table__.delete().where(models.Attachment.id == attachment.id))
    await db.commit()
    return {"message": "Attachment deleted"}
