"""Business logic for Split Bill."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import storage_service
from modules.split_bills import queries
from modules.split_bills.schemas import (
    SplitBillCreate,
    SplitBillPaymentCreate,
    SplitBillUpdate,
)

_STATUS_ORDER = {"active": 0, "partial": 1, "completed": 2}


def _dec(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _num(value: Any) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _fmt_date(value: Optional[date | datetime]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().strftime("%Y-%m-%d")
    return value.strftime("%Y-%m-%d")


def _parse_date(value: Optional[str], field: str = "date") -> Optional[date]:
    if value is None or value == "":
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD") from exc


def _parse_time(value: Optional[str]) -> Optional[time]:
    if value is None or value == "":
        return None
    try:
        return datetime.strptime(str(value).strip(), "%H:%M").time()
    except ValueError:
        return None


def compute_split_status(row: models.SplitBill) -> str:
    if row.status in ("completed", "cancelled"):
        return row.status
    balance = _dec(row.balance_amount)
    collect = _dec(row.collect_amount)
    if collect > 0 and balance <= 0:
        return "completed"
    received = _dec(row.amount_received)
    if received > 0:
        return "partial"
    return "active"


def recompute_amounts(row: models.SplitBill) -> None:
    """Recalculate received, balance and status from payment rows."""
    total_received = Decimal("0")
    for pay in row.payments:
        if pay.amount is not None:
            total_received += _dec(pay.amount)
    row.amount_received = float(total_received.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    collect = _dec(row.collect_amount)
    row.balance_amount = float(
        (collect - total_received).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    )
    row.status = compute_split_status(row)
    row.updated_at = datetime.utcnow()


def serialize_payment(pay: models.SplitBillPayment, request: Any = None) -> dict:
    return {
        "id": int(pay.id),
        "split_bill_id": int(pay.split_bill_id),
        "wallet_id": int(pay.wallet_id) if pay.wallet_id else None,
        "transaction_id": int(pay.transaction_id) if pay.transaction_id else None,
        "amount": _num(pay.amount),
        "payment_date": _fmt_date(pay.payment_date),
        "payment_time": pay.payment_time.strftime("%H:%M") if pay.payment_time else None,
        "notes": pay.notes,
        "has_media": bool(pay.media_object_key),
        "media_url": storage_service.public_cdn_url(pay.media_object_key),
        "created_at": pay.created_at,
    }


def serialize_split(row: models.SplitBill) -> dict:
    return {
        "id": int(row.id),
        "title": row.title,
        "transaction_id": int(row.transaction_id) if row.transaction_id else None,
        "currency": row.currency or "RM",
        "total_amount": _num(row.total_amount),
        "people_count": int(row.people_count),
        "share_amount": _num(row.share_amount),
        "collect_amount": _num(row.collect_amount),
        "amount_received": _num(row.amount_received),
        "balance_amount": _num(row.balance_amount),
        "am_i_included": bool(row.am_i_included),
        "status": compute_split_status(row),
        "notes": row.notes,
        "original_txn_date": _fmt_date(row.original_txn_date),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def serialize_split_detail(row: models.SplitBill) -> dict:
    data = serialize_split(row)
    data["payments"] = [serialize_payment(p) for p in row.payments]
    return data


async def create_split(
    db: AsyncSession,
    *,
    current_user: models.User,
    payload: SplitBillCreate,
) -> models.SplitBill:
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required.")

    household_id = await queries.ensure_household(db, current_user)

    transaction = None
    if payload.transaction_id:
        transaction = await queries.get_transaction_or_404(
            db, transaction_id=payload.transaction_id, user_id=current_user.id
        )
        existing = await queries.get_split_for_transaction(
            db, transaction_id=payload.transaction_id, user_id=current_user.id
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"This transaction already has an active split bill (ID {existing.id}).",
            )

    currency = (payload.currency or "").strip() or "RM"
    total_amount = payload.total_amount
    if transaction is not None:
        total_amount = float(transaction.amount)
        wallet = await db.get(models.Wallet, transaction.wallet_id)
        if wallet and wallet.currency:
            currency = wallet.currency
        if payload.total_amount is not None:
            total_amount = float(payload.total_amount)

    people_count = max(1, int(payload.people_count))
    share = payload.share_amount
    if share is None and total_amount is not None and people_count > 0:
        share = round(float(Decimal(str(total_amount)) / people_count), 2)

    am_i_included = bool(payload.am_i_included)
    collect = payload.collect_amount
    if collect is None and total_amount is not None:
        if am_i_included and people_count > 1:
            collect = round(float(Decimal(str(total_amount)) * Decimal(people_count - 1) / people_count), 2)
        elif not am_i_included:
            collect = round(float(Decimal(str(total_amount))), 2)
        else:
            collect = 0.0

    if collect is None:
        collect = 0.0
    collect = max(0.0, float(collect))

    row = models.SplitBill(
        user_id=current_user.id,
        household_id=household_id,
        transaction_id=payload.transaction_id,
        title=title,
        currency=currency,
        total_amount=total_amount,
        people_count=people_count,
        share_amount=share,
        collect_amount=collect,
        amount_received=0.0,
        balance_amount=collect,
        am_i_included=am_i_included,
        status="active",
        notes=(payload.notes or "").strip() or None,
        original_txn_date=(
            transaction.txn_date
            if transaction is not None
            else _parse_date(payload.original_txn_date, "original_txn_date")
        ),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await queries.get_split_or_404(
        db, split_id=int(row.id), user_id=current_user.id
    )


async def update_split(
    db: AsyncSession,
    *,
    current_user: models.User,
    split_id: int,
    payload: SplitBillUpdate,
) -> models.SplitBill:
    row = await queries.get_split_or_404(db, split_id=split_id, user_id=current_user.id)
    data = payload.model_dump(exclude_unset=True)

    if "title" in data:
        title = (payload.title or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required.")
        row.title = title

    if "notes" in data:
        row.notes = (payload.notes or "").strip() or None

    if "people_count" in data and payload.people_count:
        row.people_count = max(1, int(payload.people_count))

    if "am_i_included" in data:
        row.am_i_included = bool(payload.am_i_included)

    if "share_amount" in data:
        row.share_amount = payload.share_amount
    if "collect_amount" in data:
        row.collect_amount = max(0.0, float(payload.collect_amount) if payload.collect_amount is not None else 0.0)

    if "status" in data and payload.status:
        row.status = payload.status

    recompute_amounts(row)
    await db.commit()
    await db.refresh(row)
    return await queries.get_split_or_404(
        db, split_id=int(row.id), user_id=current_user.id
    )


async def delete_split(
    db: AsyncSession,
    *,
    current_user: models.User,
    split_id: int,
) -> None:
    row = await queries.get_split_or_404(db, split_id=split_id, user_id=current_user.id)
    await db.delete(row)
    await db.commit()


async def record_payment(
    db: AsyncSession,
    *,
    current_user: models.User,
    split_id: int,
    payload: SplitBillPaymentCreate,
) -> models.SplitBill:
    split = await queries.get_split_or_404(db, split_id=split_id, user_id=current_user.id)
    if split.status == "completed":
        raise HTTPException(status_code=409, detail="This split bill is already completed.")

    amount = round(float(payload.amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")

    wallet = None
    if payload.wallet_id:
        wallet = await queries.get_wallet_or_404(db, wallet_id=payload.wallet_id, user_id=current_user.id)

    if split.transaction_id:
        # Reimbursement income into the same wallet as the original expense
        original = await db.get(models.Transaction, split.transaction_id)
        if original and original.wallet_id:
            wallet = await db.get(models.Wallet, original.wallet_id)

    if wallet is None:
        raise HTTPException(status_code=400, detail="A receiving wallet is required.")

    household_id = split.household_id or await queries.ensure_household(db, current_user)
    payment_date = _parse_date(payload.payment_date, "payment_date") or date.today()
    payment_time = _parse_time(payload.payment_time)

    # Reimbursement transaction (income)
    category = await queries.find_or_create_reimbursement_category(
        db, household_id=household_id
    )
    txn = models.Transaction(
        user_id=current_user.id,
        reference_id=models.generate_txn_reference(payment_date),
        wallet_id=wallet.id,
        household_id=household_id,
        type="income",
        txn_date=payment_date,
        txn_time=payment_time,
        vendor_or_source=f"Split: {split.title[:120]}",
        amount=amount,
        category_id=category.id,
        notes=(payload.notes or "").strip() or None,
        source_channel="web",
    )
    db.add(txn)
    await db.flush()

    payment = models.SplitBillPayment(
        user_id=current_user.id,
        household_id=household_id,
        split_bill_id=split.id,
        wallet_id=wallet.id,
        transaction_id=txn.id,
        amount=amount,
        payment_date=payment_date,
        payment_time=payment_time,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(split, ["payments"])

    recompute_amounts(split)
    await db.commit()
    await db.refresh(split)
    return await queries.get_split_or_404(
        db, split_id=int(split.id), user_id=current_user.id
    )


async def mark_completed(
    db: AsyncSession,
    *,
    current_user: models.User,
    split_id: int,
) -> models.SplitBill:
    split = await queries.get_split_or_404(db, split_id=split_id, user_id=current_user.id)
    if _dec(split.balance_amount) > 0:
        raise HTTPException(
            status_code=400,
            detail="Split bill still has an outstanding balance. Record all payments first.",
        )
    split.status = "completed"
    split.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(split)
    return await queries.get_split_or_404(
        db, split_id=int(split.id), user_id=current_user.id
    )


async def attach_payment_media(
    db: AsyncSession,
    *,
    current_user: models.User,
    split_id: int,
    payment_id: int,
    payload: bytes,
    filename: Optional[str],
    content_type: Optional[str],
) -> models.SplitBill:
    split = await queries.get_split_or_404(db, split_id=split_id, user_id=current_user.id)
    payment = next((p for p in split.payments if int(p.id) == payment_id), None)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    if not payload:
        raise HTTPException(status_code=400, detail="File is empty.")

    try:
        mime_type, extension = storage_service.validate_receipt_file(
            filename, content_type, payload
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    object_key = storage_service.build_receipt_object_key(
        current_user.id, payment.id, filename or "payment", extension
    )
    storage_service.upload_receipt_object(object_key, payload, mime_type, filename=filename)
    payment.media_object_key = object_key
    await db.commit()
    await db.refresh(split)
    return await queries.get_split_or_404(
        db, split_id=int(split.id), user_id=current_user.id
    )
