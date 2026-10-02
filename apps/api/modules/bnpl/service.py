"""Business logic for My BNPL."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import select

from time_utils import clamp_day, current_business_date
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

def due_info(row: models.Bnpl, today: Optional[date] = None) -> dict:
    """The next instalment date, and whether this month's is already late."""
    today = today or current_business_date()
    if row.status == "settled":
        return {"next_due_date": None, "overdue": False, "days_overdue": 0}
    last = row.last_payment_date
    paid_this_month = bool(last and last.year == today.year and last.month == today.month)
    this_due = date(today.year, today.month, clamp_day(today.year, today.month, int(row.due_day_of_month)))
    start = row.start_date.date() if isinstance(row.start_date, datetime) else row.start_date
    if start and start > this_due and not paid_this_month:
        # The plan has not begun: the first instalment falls in the start month.
        first = date(start.year, start.month, clamp_day(start.year, start.month, int(row.due_day_of_month)))
        return {"next_due_date": _fmt_date(first), "overdue": False, "days_overdue": 0}
    if paid_this_month:
        ny, nm = (today.year + (today.month // 12), today.month % 12 + 1)
        nxt = date(ny, nm, clamp_day(ny, nm, int(row.due_day_of_month)))
        return {"next_due_date": _fmt_date(nxt), "overdue": False, "days_overdue": 0}
    late = (today - this_due).days
    return {"next_due_date": _fmt_date(this_due), "overdue": late > 0, "days_overdue": max(0, late)}


def serialize_bnpl(row: models.Bnpl, *, category_name: Optional[str] = None, paid_amount: Optional[float] = None) -> dict:
    if paid_amount is None:
        paid_amount = _num(row.total_amount - row.outstanding_amount)
    return {
        **due_info(row),
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

    if monthly_amount > total_amount + 0.005:
        raise HTTPException(status_code=400, detail="Monthly amount cannot be more than the total.")
    household_id = await queries.ensure_household(db, current_user)
    await queries.get_category_or_404(db, category_id=payload.category_id, household_id=household_id)

    start_date = _parse_date(payload.start_date, "start_date") or current_business_date()

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
        import whatsapp_service

        key = whatsapp_service.counterparty_key(name)
        clash = await db.scalar(
            select(models.Bnpl.id).where(models.Bnpl.user_id == current_user.id, models.Bnpl.key == key, models.Bnpl.id != row.id)
        )
        if clash:
            # The name is unique per user; saving a duplicate failed inside the database.
            raise HTTPException(status_code=400, detail="A BNPL with this name already exists.")
        row.name = name
        row.key = key
    if "provider" in data:
        provider = (payload.provider or "").strip()
        if not provider:
            raise HTTPException(status_code=400, detail="BNPL provider is required.")
        row.provider = provider
    if "notes" in data:
        row.notes = (payload.notes or "").strip() or None
    if "icon_name" in data:
        row.icon_name = (payload.icon_name or "").strip() or None

    if "category_id" in data and payload.category_id is not None:
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
    if _num(row.monthly_amount) > _num(row.total_amount) + 0.005:
        raise HTTPException(status_code=400, detail="Monthly amount cannot be more than the total.")
    if "status" in data and payload.status:
        if payload.status not in ("active", "settled"):
            raise HTTPException(status_code=400, detail="Status must be 'active' or 'settled'.")
        row.status = payload.status

    # What is still owed follows the total and what has been paid: editing the total used to
    # leave the old outstanding in place, so the page showed a balance that matched neither.
    paid = await queries.count_payments(db, bnpl_id=row.id)
    owed = max(0.0, round(float(row.total_amount) - paid, 2))
    if "status" in data and payload.status == "settled":
        owed = 0.0
    row.outstanding_amount = owed
    row.status = "settled" if owed <= 0 else "active"

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

    pay_date = payment_date or current_business_date()

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



def serialize_payment(pay: models.BnplPayment) -> dict:
    return {
        "id": int(pay.id),
        "bnpl_id": int(pay.bnpl_id),
        "wallet_id": int(pay.wallet_id) if pay.wallet_id else None,
        "transaction_id": int(pay.transaction_id) if pay.transaction_id else None,
        "amount": _num(pay.amount),
        "payment_date": _fmt_date(pay.payment_date),
        "notes": pay.notes,
        "source_channel": pay.source_channel,
    }


async def list_payments(db: AsyncSession, *, current_user: models.User, bnpl_id: int) -> list[dict]:
    await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    rows = (
        await db.execute(
            select(models.BnplPayment)
            .where(models.BnplPayment.bnpl_id == bnpl_id)
            .order_by(models.BnplPayment.payment_date.desc(), models.BnplPayment.id.desc())
        )
    ).scalars().all()
    return [serialize_payment(p) for p in rows]


async def delete_payment(db: AsyncSession, *, current_user: models.User, bnpl_id: int, payment_id: int) -> models.Bnpl:
    """Take back a payment recorded by mistake: the expense it created is removed, so the
    wallet balance and what is owed both go back."""
    bnpl = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
    pay = await db.scalar(
        select(models.BnplPayment).where(models.BnplPayment.id == payment_id, models.BnplPayment.bnpl_id == bnpl.id)
    )
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found.")
    txn_id = pay.transaction_id
    await db.delete(pay)
    await db.flush()
    if txn_id:
        txn = await db.get(models.Transaction, txn_id)
        if txn is not None and txn.user_id == current_user.id and txn.bnpl_id == bnpl.id:
            await db.delete(txn)
    await db.flush()
    paid = await queries.count_payments(db, bnpl_id=bnpl.id)
    bnpl.outstanding_amount = max(0.0, round(float(bnpl.total_amount) - paid, 2))
    bnpl.status = "settled" if bnpl.outstanding_amount <= 0 else "active"
    last = await db.scalar(select(models.BnplPayment.payment_date).where(models.BnplPayment.bnpl_id == bnpl.id).order_by(models.BnplPayment.payment_date.desc()).limit(1))
    bnpl.last_payment_date = last
    bnpl.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(bnpl)
    return bnpl
