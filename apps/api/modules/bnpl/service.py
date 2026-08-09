"""Business logic for My BNPL."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import storage_service
from modules.bnpl import queries, storage

BNPL_PROVIDERS = {
    "spaylater": "SPayLater",
    "atome": "Atome",
    "grab": "Grab PayLater",
    "shopeepaylater": "Shopee PayLater",
    "boost": "Boost PayLater",
    "lazada": "Lazada PayLater",
    "tng": "TNG eWallet PayLater",
    "gopay": "GoPayLater",
    "other": "Lain-lain",
}

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

def _num(value: Any) -> float:
    return round(float(value or 0), 2)

def serialize_bnpl(row: models.Bnpl, *, category_name: Optional[str] = None, paid_amount: Optional[float] = None) -> dict:
    if paid_amount is None:
        paid_amount = _num(row.total_amount - row.outstanding_amount)
    return {
        "id": int(row.id),
        "name": row.name,
        "key": row.key,
        "provider": row.provider,
        "category_id": int(row.category_id),
        "category_name": category_name,
        "icon_name": row.icon_name,
        "has_image": bool(row.image_object_key),
        "image_url": storage_service.public_cdn_url(row.image_object_key),
        "total_amount": _num(row.total_amount),
        "installment_count": int(row.installment_count),
        "monthly_amount": _num(row.monthly_amount),
        "due_day_of_month": int(row.due_day_of_month),
        "start_date": _fmt_date(row.start_date),
        "last_payment_date": _fmt_date(row.last_payment_date),
        "outstanding_amount": _num(row.outstanding_amount),
        "paid_amount": _num(paid_amount),
        "status": row.status,
        "notes": row.notes,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }

async def _category_name(db: AsyncSession, category_id: int) -> Optional[str]:
    row = await db.get(models.Category, category_id)
    return row.name if row else None

async def create_bnpl(
    db: AsyncSession,
    *,
    current_user: models.User,
    payload: BnplCreate,
) -> models.Bnpl:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="BNPL name is required.")
    provider = (payload.provider or "").strip()
    if not provider:
        raise HTTPException(status_code=400, detail="BNPL provider is required.")
    total_amount = _num(payload.total_amount)
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Total amount must be greater than zero.")
    monthly_amount = _num(payload.monthly_amount)
    if monthly_amount <= 0:
        raise HTTPException(status_code=400, detail="Monthly amount must be greater than zero.")
    installment_count = int(payload.installment_count)
    if installment_count < 1 or installment_count > 60:
        raise HTTPException(status_code=400, detail="Installment count must be between 1 and 60.")
    due_day = int(payload.due_day_of_month)
    if due_day < 1 or due_day > 31:
        raise HTTPException(status_code=400, detail="due_day_of_month must be between 1 and 31.")

    household_id = await queries.ensure_household(db, current_user)
    await queries.get_category_or_404(db, category_id=payload.category_id, household_id=household_id)

    start_date = _parse_date(payload.start_date, "start_date") or date.today()

    import whatsapp_service

    key = whatsapp_service.counterparty_key(name)

    existing = await db.scalar(
        select(models.Bnpl).where(models.Bnpl.user_id == current_user.id, models.Bnpl.key == key)
    )
    if existing:
        raise HTTPException(status_code=400, detail="A BNPL with this name already exists.")

    row = models.Bnpl(
        user_id=current_user.id,
        household_id=household_id,
        name=name,
        key=key,
        provider=provider,
        category_id=payload.category_id,
        icon_name=(payload.icon_name or "").strip() or None,
        total_amount=total_amount,
        installment_count=installment_count,
        monthly_amount=monthly_amount,
        due_day_of_month=due_day,
        start_date=start_date,
        outstanding_amount=total_amount,
        status="active",
        notes=(payload.notes or "").strip() or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row

async def update_bnpl(
    db: AsyncSession,
    *,
    current_user: models.User,
    bnpl_id: int,
    payload: BnplUpdate,
) -> models.Bnpl:
    row = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="BNPL name is required.")
        row.name = name
        import whatsapp_service

        row.key = whatsapp_service.counterparty_key(name)
    if "provider" in data:
        row.provider = (payload.provider or "").strip()
    if "notes" in data:
        row.notes = (payload.notes or "").strip() or None
    if "icon_name" in data:
        row.icon_name = (payload.icon_name or "").strip() or None

    if "category_id" in data:
        household_id = await queries.ensure_household(db, current_user)
        await queries.get_category_or_404(db, category_id=payload.category_id, household_id=household_id)
        row.category_id = payload.category_id

    if "total_amount" in data and payload.total_amount is not None:
        if _num(payload.total_amount) <= 0:
            raise HTTPException(status_code=400, detail="Total amount must be greater than zero.")
        row.total_amount = _num(payload.total_amount)
    if "installment_count" in data and payload.installment_count is not None:
        row.installment_count = int(payload.installment_count)
    if "monthly_amount" in data and payload.monthly_amount is not None:
        if _num(payload.monthly_amount) <= 0:
            raise HTTPException(status_code=400, detail="Monthly amount must be greater than zero.")
        row.monthly_amount = _num(payload.monthly_amount)
    if "due_day_of_month" in data and payload.due_day_of_month is not None:
        row.due_day_of_month = int(payload.due_day_of_month)
    if "start_date" in data:
        row.start_date = _parse_date(payload.start_date, "start_date") or row.start_date
    if "status" in data:
        row.status = (payload.status or "active").strip() or "active"

    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row

async def delete_bnpl(
    db: AsyncSession,
    *,
    current_user: models.User,
    bnpl_id: int,
) -> None:
    row = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    if row.image_object_key:
        try:
            storage.delete(row.image_object_key)
        except Exception:
            pass
    await db.delete(row)
    await db.commit()

async def upload_bnpl_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    bnpl_id: int,
    file: UploadFile,
) -> models.Bnpl:
    bnpl = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    payload = await file.read()
    try:
        mime_type, extension = storage.validate_file(file.filename, file.content_type, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not mime_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="BNPL image must be an image file.")
    object_key = storage.build_object_key(
        user_id=current_user.id,
        bnpl_id=int(bnpl.id),
        filename=file.filename,
        extension=extension,
    )
    try:
        storage.upload(object_key, payload, mime_type, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc
    old_key = bnpl.image_object_key
    bnpl.image_object_key = object_key
    bnpl.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(bnpl)
    if old_key and old_key != object_key:
        try:
            storage.delete(old_key)
        except Exception:
            pass
    return bnpl

async def get_bnpl_image_bytes(
    db: AsyncSession,
    *,
    current_user: models.User,
    bnpl_id: int,
) -> tuple[bytes, str, str]:
    bnpl = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    if not bnpl.image_object_key:
        raise HTTPException(status_code=404, detail="BNPL image not found.")
    try:
        payload, content_type = storage.download(bnpl.image_object_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"File not found: {exc}") from exc
    return payload, content_type or "image/jpeg", "bnpl-image"

async def delete_bnpl_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    bnpl_id: int,
) -> models.Bnpl:
    bnpl = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    if bnpl.image_object_key:
        try:
            storage.delete(bnpl.image_object_key)
        except Exception:
            pass
        bnpl.image_object_key = None
        bnpl.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(bnpl)
    return bnpl

async def pay_bnpl(
    db: AsyncSession,
    *,
    current_user: models.User,
    bnpl_id: int,
    wallet_id: Optional[int],
    amount: Optional[float],
    notes: Optional[str],
    payment_date: Optional[date] = None,
    source_channel: Optional[str] = "web",
    vendor_override: Optional[str] = None,
) -> models.Bnpl:
    """Record a BNPL installment payment as an expense transaction in the linked category."""
    bnpl = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    if bnpl.status == "settled":
        raise HTTPException(status_code=400, detail="This BNPL is already settled.")

    household_id = bnpl.household_id or (await queries.ensure_household(db, current_user))
    wallet = None
    if wallet_id:
        wallet = await queries.get_wallet_or_404(db, wallet_id=wallet_id, user_id=current_user.id)
    if not wallet:
        wallet = await queries.get_default_wallet(db, user_id=current_user.id, household_id=household_id)
    if not wallet:
        raise HTTPException(status_code=400, detail="No wallet found. Create a wallet first.")

    pay_amount = round(float(amount or bnpl.monthly_amount), 2)
    if pay_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")
    remaining = _num(bnpl.outstanding_amount)
    applied = min(pay_amount, remaining)

    pay_date = payment_date or date.today()

    vendor = (vendor_override or "").strip() or bnpl.name
    txn = models.Transaction(
        wallet_id=wallet.id,
        user_id=current_user.id,
        reference_id=models.generate_txn_reference(pay_date),
        type="expense",
        txn_date=pay_date,
        vendor_or_source=vendor[:50],
        amount=applied,
        category_id=bnpl.category_id,
        bnpl_id=bnpl.id,
        notes=(notes or "").strip() or None,
        source_channel=source_channel,
    )
    db.add(txn)
    await db.flush()

    payment = models.BnplPayment(
        user_id=current_user.id,
        household_id=household_id,
        bnpl_id=bnpl.id,
        wallet_id=wallet.id,
        transaction_id=txn.id,
        amount=applied,
        payment_date=pay_date,
        notes=(notes or "").strip() or None,
        source_channel=source_channel,
    )
    db.add(payment)

    bnpl.outstanding_amount = round(remaining - applied, 2)
    bnpl.last_payment_date = pay_date
    if _num(bnpl.outstanding_amount) <= 0:
        bnpl.status = "settled"
        bnpl.outstanding_amount = 0.0
    bnpl.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(bnpl)
    return bnpl

async def find_active_bnpl_for_category(
    db: AsyncSession,
    *,
    user_id: str,
    category_id: int,
) -> Optional[models.Bnpl]:
    result = await db.execute(
        select(models.Bnpl).where(
            models.Bnpl.user_id == user_id,
            models.Bnpl.category_id == category_id,
            models.Bnpl.status == "active",
        ).limit(1)
    )
    return result.scalars().first()

async def apply_bnpl_auto_payment(
    db: AsyncSession,
    *,
    user_id: str,
    category_id: int,
    amount: float,
    txn_date: date,
    txn_wallet_id: int,
    txn_id: int,
    source_channel: str = "web",
) -> Optional[models.Bnpl]:
    """If the given expense is recorded in a category linked to an active BNPL,
    apply one installment automatically against the existing transaction.
    Returns the updated Bnpl (or None). Does not create a second transaction.
    """
    bnpl = await find_active_bnpl_for_category(db, user_id=user_id, category_id=category_id)
    if not bnpl:
        return None
    remaining = float(bnpl.outstanding_amount or 0)
    applied = min(float(amount or 0), remaining)
    if applied <= 0:
        return None
    bnpl.outstanding_amount = round(remaining - applied, 2)
    bnpl.last_payment_date = txn_date
    if float(bnpl.outstanding_amount or 0) <= 0:
        bnpl.status = "settled"
        bnpl.outstanding_amount = 0.0
    bnpl.updated_at = datetime.utcnow()

    txn = await db.get(models.Transaction, txn_id)
    if txn:
        txn.bnpl_id = bnpl.id

    db.add(
        models.BnplPayment(
            user_id=user_id,
            household_id=bnpl.household_id,
            bnpl_id=bnpl.id,
            wallet_id=txn_wallet_id,
            transaction_id=txn_id,
            amount=applied,
            payment_date=txn_date,
            source_channel=source_channel,
        )
    )
    await db.commit()
    return bnpl

