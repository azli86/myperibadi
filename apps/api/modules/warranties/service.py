"""Business logic for Waranti Saya."""

from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import storage_service
from modules.warranties import queries, storage
from modules.warranties.schemas import ClaimCreate, ClaimUpdate, DeviceCreate, DeviceUpdate


def _parse_date(value: Optional[str], field: str = "date") -> Optional[date]:
    if value is None or value == "":
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD") from exc


def _fmt_date(value: Optional[date | datetime]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().strftime("%Y-%m-%d")
    return value.strftime("%Y-%m-%d")


def _num(value: Any) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _add_months(start: date, months: int) -> date:
    if months < 0:
        raise HTTPException(status_code=400, detail="Warranty duration cannot be negative.")
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def compute_warranty_status(expiry: Optional[date], *, today: Optional[date] = None) -> str:
    if expiry is None:
        return "unknown"
    ref = today or date.today()
    remaining = (expiry - ref).days
    if remaining < 0:
        return "expired"
    if remaining <= 30:
        return "expiring_soon"
    return "active"


def remaining_days(expiry: Optional[date], *, today: Optional[date] = None) -> Optional[int]:
    if expiry is None:
        return None
    ref = today or date.today()
    return (expiry - ref).days


def serialize_device(row: models.WarrantyDevice) -> dict:
    expiry = row.warranty_expiry_date
    status = compute_warranty_status(expiry)
    return {
        "id": int(row.id),
        "device_name": row.device_name,
        "category": row.category,
        "brand": row.brand,
        "model": row.model,
        "serial_number": row.serial_number,
        "purchase_date": _fmt_date(row.purchase_date),
        "purchase_price": _num(row.purchase_price),
        "store_or_seller": row.store_or_seller,
        "receipt_or_order_number": row.receipt_or_order_number,
        "warranty_start_date": _fmt_date(row.warranty_start_date),
        "warranty_duration_months": int(row.warranty_duration_months)
        if row.warranty_duration_months is not None
        else None,
        "warranty_expiry_date": _fmt_date(expiry),
        "remaining_days": remaining_days(expiry),
        "warranty_status": status,
        "notes": row.notes,
        "has_image": bool(row.image_object_key),
        "image_url": storage_service.public_cdn_url(row.image_object_key),
        "receipt_attachment_id": int(row.receipt_attachment_id) if row.receipt_attachment_id else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def serialize_claim(row: models.WarrantyClaim) -> dict:
    return {
        "id": int(row.id),
        "device_id": int(row.device_id),
        "claim_date": _fmt_date(row.claim_date),
        "problem_description": row.problem_description,
        "service_centre": row.service_centre,
        "reference_number": row.reference_number,
        "date_sent": _fmt_date(row.date_sent),
        "expected_completion_date": _fmt_date(row.expected_completion_date),
        "date_received": _fmt_date(row.date_received),
        "resolution": row.resolution,
        "notes": row.notes,
        "attachment_id": int(row.attachment_id) if row.attachment_id else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def create_device(
    db: AsyncSession,
    *,
    current_user: models.User,
    payload: DeviceCreate,
) -> models.WarrantyDevice:
    name = (payload.device_name or "").strip()
    serial = (payload.serial_number or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Device name is required.")
    if not serial:
        raise HTTPException(status_code=400, detail="Serial number is required.")

    dup = await queries.find_serial_duplicate(db, user_id=current_user.id, serial_number=serial)
    if dup:
        raise HTTPException(status_code=400, detail="Serial number already exists.")

    purchase_date = _parse_date(payload.purchase_date, "purchase_date")
    warranty_start = _parse_date(payload.warranty_start_date, "warranty_start_date") or purchase_date
    if not warranty_start:
        raise HTTPException(status_code=400, detail="Warranty start date is required.")
    duration = payload.warranty_duration_months
    if duration is None or int(duration) <= 0:
        raise HTTPException(status_code=400, detail="Warranty duration is required.")
    if int(duration) < 0:
        raise HTTPException(status_code=400, detail="Warranty duration cannot be negative.")
    # Expiry is always calculated from start + duration
    expiry = _add_months(warranty_start, int(duration))
    if payload.purchase_price is not None and float(payload.purchase_price) < 0:
        raise HTTPException(status_code=400, detail="Purchase price cannot be negative.")

    household_id = await queries.ensure_household(db, current_user)
    row = models.WarrantyDevice(
        user_id=current_user.id,
        household_id=household_id,
        device_name=name,
        category=(payload.category or "").strip() or None,
        brand=(payload.brand or "").strip() or None,
        model=(payload.model or "").strip() or None,
        serial_number=serial,
        purchase_date=purchase_date,
        purchase_price=payload.purchase_price,
        store_or_seller=(payload.store_or_seller or "").strip() or None,
        receipt_or_order_number=(payload.receipt_or_order_number or "").strip() or None,
        warranty_start_date=warranty_start,
        warranty_duration_months=duration,
        warranty_expiry_date=expiry,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_device(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
    payload: DeviceUpdate,
) -> models.WarrantyDevice:
    row = await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
    data = payload.model_dump(exclude_unset=True)

    if "device_name" in data:
        name = (payload.device_name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Device name is required.")
        row.device_name = name

    if "serial_number" in data:
        serial = (payload.serial_number or "").strip()
        if not serial:
            raise HTTPException(status_code=400, detail="Serial number is required.")
        dup = await queries.find_serial_duplicate(
            db, user_id=current_user.id, serial_number=serial, exclude_device_id=int(row.id)
        )
        if dup:
            raise HTTPException(status_code=400, detail="Serial number already exists.")
        row.serial_number = serial

    for field in (
        "category",
        "brand",
        "model",
        "store_or_seller",
        "receipt_or_order_number",
        "notes",
    ):
        if field in data:
            value = data[field]
            if isinstance(value, str):
                value = value.strip() or None
            setattr(row, field, value)

    if "purchase_price" in data:
        if payload.purchase_price is not None and float(payload.purchase_price) < 0:
            raise HTTPException(status_code=400, detail="Purchase price cannot be negative.")
        row.purchase_price = payload.purchase_price

    if "purchase_date" in data:
        row.purchase_date = _parse_date(payload.purchase_date, "purchase_date")

    if "warranty_start_date" in data:
        row.warranty_start_date = _parse_date(payload.warranty_start_date, "warranty_start_date")

    if "warranty_duration_months" in data:
        duration = payload.warranty_duration_months
        if duration is None or int(duration) <= 0:
            raise HTTPException(status_code=400, detail="Warranty duration is required.")
        if int(duration) < 0:
            raise HTTPException(status_code=400, detail="Warranty duration cannot be negative.")
        row.warranty_duration_months = duration

    # Always recompute expiry from start + duration
    final_start = row.warranty_start_date or row.purchase_date
    if not final_start:
        raise HTTPException(status_code=400, detail="Warranty start date is required.")
    if row.warranty_duration_months is None or int(row.warranty_duration_months) <= 0:
        raise HTTPException(status_code=400, detail="Warranty duration is required.")
    if not row.warranty_start_date:
        row.warranty_start_date = final_start
    row.warranty_expiry_date = _add_months(final_start, int(row.warranty_duration_months))

    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def delete_device(db: AsyncSession, *, current_user: models.User, device_id: int) -> None:
    row = await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
    attachments = await db.execute(
        select(models.WarrantyAttachment).where(
            models.WarrantyAttachment.device_id == device_id,
            models.WarrantyAttachment.user_id == current_user.id,
        )
    )
    for att in attachments.scalars().all():
        try:
            storage.delete(att.object_key)
        except Exception:
            pass
    if row.image_object_key:
        try:
            storage.delete(row.image_object_key)
        except Exception:
            pass
    await db.delete(row)
    await db.commit()


async def create_claim(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
    payload: ClaimCreate,
) -> models.WarrantyClaim:
    await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
    claim = models.WarrantyClaim(
        device_id=device_id,
        user_id=current_user.id,
        claim_date=_parse_date(payload.claim_date, "claim_date") or date.today(),
        problem_description=(payload.problem_description or "").strip() or None,
        service_centre=(payload.service_centre or "").strip() or None,
        reference_number=(payload.reference_number or "").strip() or None,
        date_sent=_parse_date(payload.date_sent, "date_sent"),
        expected_completion_date=_parse_date(payload.expected_completion_date, "expected_completion_date"),
        date_received=_parse_date(payload.date_received, "date_received"),
        resolution=(payload.resolution or None),
        notes=(payload.notes or "").strip() or None,
    )
    db.add(claim)
    await db.commit()
    await db.refresh(claim)
    return claim


async def update_claim(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
    claim_id: int,
    payload: ClaimUpdate,
) -> models.WarrantyClaim:
    claim = await queries.get_claim_or_404(
        db, claim_id=claim_id, device_id=device_id, user_id=current_user.id
    )
    data = payload.model_dump(exclude_unset=True)

    if "claim_date" in data:
        claim.claim_date = _parse_date(payload.claim_date, "claim_date")
    if "date_sent" in data:
        claim.date_sent = _parse_date(payload.date_sent, "date_sent")
    if "expected_completion_date" in data:
        claim.expected_completion_date = _parse_date(
            payload.expected_completion_date, "expected_completion_date"
        )
    if "date_received" in data:
        claim.date_received = _parse_date(payload.date_received, "date_received")

    for field in ("problem_description", "service_centre", "reference_number", "notes"):
        if field in data:
            value = data[field]
            if isinstance(value, str):
                value = value.strip() or None
            setattr(claim, field, value)

    if "resolution" in data:
        claim.resolution = payload.resolution

    claim.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(claim)
    return claim


async def delete_claim(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
    claim_id: int,
) -> None:
    claim = await queries.get_claim_or_404(
        db, claim_id=claim_id, device_id=device_id, user_id=current_user.id
    )
    if claim.attachment_id:
        att = await queries.get_attachment_or_404(
            db, attachment_id=int(claim.attachment_id), user_id=current_user.id
        )
        try:
            storage.delete(att.object_key)
        except Exception:
            pass
        await db.delete(att)
    await db.delete(claim)
    await db.commit()


async def upload_device_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
    file: UploadFile,
) -> models.WarrantyDevice:
    device = await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
    payload = await file.read()
    try:
        mime_type, extension = storage.validate_file(file.filename, file.content_type, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not mime_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Device image must be an image file.")
    object_key = storage.build_object_key(
        user_id=current_user.id,
        device_id=int(device.id),
        kind="images",
        parent_id=None,
        filename=file.filename,
        extension=extension,
    )
    try:
        storage.upload(object_key, payload, mime_type, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc
    old_key = device.image_object_key
    device.image_object_key = object_key
    att = models.WarrantyAttachment(
        device_id=device.id,
        user_id=current_user.id,
        parent_type="device_image",
        parent_id=int(device.id),
        file_name=file.filename or f"image{extension}",
        object_key=object_key,
        mime_type=mime_type,
        size_bytes=len(payload),
    )
    db.add(att)
    device.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(device)
    if old_key and old_key != object_key:
        try:
            storage.delete(old_key)
        except Exception:
            pass
    return device


async def get_device_image_bytes(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
) -> tuple[bytes, str, str]:
    device = await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
    if not device.image_object_key:
        raise HTTPException(status_code=404, detail="Device image not found.")
    try:
        payload, content_type = storage.download(device.image_object_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"File not found: {exc}") from exc
    return payload, content_type or "image/jpeg", "device-image"


async def delete_device_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
) -> models.WarrantyDevice:
    device = await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
    if device.image_object_key:
        try:
            storage.delete(device.image_object_key)
        except Exception:
            pass
        device.image_object_key = None
        device.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(device)
    return device


async def upload_receipt(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
    file: UploadFile,
) -> models.WarrantyDevice:
    device = await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
    payload = await file.read()
    try:
        mime_type, extension = storage.validate_file(file.filename, file.content_type, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    object_key = storage.build_object_key(
        user_id=current_user.id,
        device_id=int(device.id),
        kind="receipts",
        parent_id=None,
        filename=file.filename,
        extension=extension,
    )
    try:
        storage.upload(object_key, payload, mime_type, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc

    if device.receipt_attachment_id:
        try:
            old = await queries.get_attachment_or_404(
                db, attachment_id=int(device.receipt_attachment_id), user_id=current_user.id
            )
            storage.delete(old.object_key)
            await db.delete(old)
        except Exception:
            pass

    att = models.WarrantyAttachment(
        device_id=device.id,
        user_id=current_user.id,
        parent_type="receipt",
        parent_id=int(device.id),
        file_name=file.filename or f"receipt{extension}",
        object_key=object_key,
        mime_type=mime_type,
        size_bytes=len(payload),
    )
    db.add(att)
    await db.flush()
    device.receipt_attachment_id = int(att.id)
    device.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(device)
    return device


async def upload_claim_attachment(
    db: AsyncSession,
    *,
    current_user: models.User,
    device_id: int,
    claim_id: int,
    file: UploadFile,
) -> models.WarrantyClaim:
    claim = await queries.get_claim_or_404(
        db, claim_id=claim_id, device_id=device_id, user_id=current_user.id
    )
    payload = await file.read()
    try:
        mime_type, extension = storage.validate_file(file.filename, file.content_type, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    object_key = storage.build_object_key(
        user_id=current_user.id,
        device_id=device_id,
        kind="claims",
        parent_id=claim_id,
        filename=file.filename,
        extension=extension,
    )
    try:
        storage.upload(object_key, payload, mime_type, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc

    if claim.attachment_id:
        try:
            old = await queries.get_attachment_or_404(
                db, attachment_id=int(claim.attachment_id), user_id=current_user.id
            )
            storage.delete(old.object_key)
            await db.delete(old)
        except Exception:
            pass

    att = models.WarrantyAttachment(
        device_id=device_id,
        user_id=current_user.id,
        parent_type="claim",
        parent_id=claim_id,
        file_name=file.filename or f"claim{extension}",
        object_key=object_key,
        mime_type=mime_type,
        size_bytes=len(payload),
    )
    db.add(att)
    await db.flush()
    claim.attachment_id = int(att.id)
    claim.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(claim)
    return claim


async def get_attachment_bytes(
    db: AsyncSession,
    *,
    current_user: models.User,
    attachment_id: int,
) -> tuple[bytes, str, str]:
    att = await queries.get_attachment_or_404(
        db, attachment_id=attachment_id, user_id=current_user.id
    )
    try:
        payload, content_type = storage.download(att.object_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"File not found: {exc}") from exc
    return payload, content_type or att.mime_type or "application/octet-stream", att.file_name


async def delete_attachment(
    db: AsyncSession,
    *,
    current_user: models.User,
    attachment_id: int,
) -> None:
    att = await queries.get_attachment_or_404(
        db, attachment_id=attachment_id, user_id=current_user.id
    )
    if att.parent_type == "receipt":
        device = await queries.get_device_or_404(
            db, device_id=int(att.device_id), user_id=current_user.id
        )
        if device.receipt_attachment_id and int(device.receipt_attachment_id) == int(att.id):
            device.receipt_attachment_id = None
    elif att.parent_type == "claim" and att.parent_id:
        claim = await queries.get_claim_or_404(
            db,
            claim_id=int(att.parent_id),
            device_id=int(att.device_id),
            user_id=current_user.id,
        )
        if claim.attachment_id and int(claim.attachment_id) == int(att.id):
            claim.attachment_id = None
    try:
        storage.delete(att.object_key)
    except Exception:
        pass
    await db.delete(att)
    await db.commit()
