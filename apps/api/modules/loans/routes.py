from __future__ import annotations

from datetime import date, datetime
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import whatsapp_service


async def get_loans_route(
    *,
    include_settled: bool,
    db: AsyncSession,
    current_user: models.User,
    serialize_loan_response: Callable[..., schemas.LoanResponse],
) -> list[schemas.LoanResponse]:
    result = await db.execute(
        select(models.Loan)
        .where(models.Loan.user_id == current_user.id)
        .order_by(models.Loan.status.asc(), models.Loan.updated_at.desc(), models.Loan.id.desc())
    )
    loans = list(result.scalars().all())
    if not loans:
        return []
    loan_ids = [int(loan.id) for loan in loans]
    aggregate_result = await db.execute(
        select(
            models.LoanPayment.loan_id,
            func.count(models.LoanPayment.id),
            func.max(models.LoanPayment.created_at),
        )
        .where(models.LoanPayment.loan_id.in_(loan_ids), models.LoanPayment.user_id == current_user.id)
        .group_by(models.LoanPayment.loan_id)
    )
    aggregate_by_loan: dict[int, tuple[int, datetime | None]] = {
        int(loan_id): (int(count or 0), last_payment_at)
        for loan_id, count, last_payment_at in aggregate_result.all()
    }
    response: list[schemas.LoanResponse] = []
    for loan in loans:
        if not include_settled and float(loan.outstanding_amount or 0) <= 0.004:
            continue
        payment_count, last_payment_at = aggregate_by_loan.get(int(loan.id), (0, None))
        response.append(serialize_loan_response(loan, payment_count=payment_count, last_payment_at=last_payment_at))
    return response


async def create_loan_route(
    *,
    payload: schemas.LoanCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    serialize_loan_response: Callable[..., schemas.LoanResponse],
    current_business_date_fn: Callable[[], date],
) -> schemas.LoanResponse:
    loan_name = (payload.name or "").strip()
    if not loan_name:
        raise HTTPException(status_code=400, detail="Loan name is required.")
    opening_amount = float(payload.opening_amount or 0)
    if opening_amount <= 0:
        raise HTTPException(status_code=400, detail="Opening amount must be greater than zero.")
    monthly_payment = float(payload.monthly_payment or 0)
    if payload.monthly_payment is not None and monthly_payment <= 0:
        raise HTTPException(status_code=400, detail="monthly_payment must be greater than zero.")
    if monthly_payment - opening_amount > 0.004:
        raise HTTPException(status_code=400, detail="monthly_payment cannot be greater than opening_amount.")
    household_id = await ensure_current_user_household(db, current_user)
    loan_key = whatsapp_service.counterparty_key(loan_name)
    existing_result = await db.execute(
        select(models.Loan).where(models.Loan.user_id == current_user.id, models.Loan.key == loan_key)
    )
    if existing_result.scalars().first():
        raise HTTPException(status_code=400, detail="Loan already exists.")
    start_date = current_business_date_fn()
    if payload.start_date:
        try:
            start_date = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="start_date must be in YYYY-MM-DD format.")
    loan = models.Loan(
        user_id=current_user.id,
        household_id=household_id,
        name=loan_name,
        key=loan_key,
        opening_amount=opening_amount,
        outstanding_amount=opening_amount,
        monthly_payment=monthly_payment if monthly_payment > 0 else None,
        category_id=payload.category_id,
        start_date=start_date,
        notes=(payload.notes or "").strip() or None,
        status="active",
    )
    db.add(loan)
    await db.commit()
    await db.refresh(loan)
    return serialize_loan_response(loan)


async def update_loan_route(
    *,
    loan_id: int,
    payload: schemas.LoanUpdate,
    db: AsyncSession,
    current_user: models.User,
    get_loan_payment_summary: Callable[..., Awaitable[tuple[int, datetime | None]]],
    serialize_loan_response: Callable[..., schemas.LoanResponse],
) -> schemas.LoanResponse:
    loan_result = await db.execute(
        select(models.Loan).where(models.Loan.id == loan_id, models.Loan.user_id == current_user.id)
    )
    loan = loan_result.scalars().first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        payment_count, last_payment_at = await get_loan_payment_summary(db, loan_id=int(loan.id), user_id=current_user.id)
        return serialize_loan_response(loan, payment_count=payment_count, last_payment_at=last_payment_at)

    current_opening_amount = float(loan.opening_amount or 0)
    current_outstanding_amount = float(loan.outstanding_amount or 0)
    paid_amount = max(0.0, current_opening_amount - current_outstanding_amount)

    if "name" in updates:
        loan_name = str(payload.name or "").strip()
        if not loan_name:
            raise HTTPException(status_code=400, detail="Loan name is required.")
        loan_key = whatsapp_service.counterparty_key(loan_name)
        existing_result = await db.execute(
            select(models.Loan).where(
                models.Loan.user_id == current_user.id,
                models.Loan.key == loan_key,
                models.Loan.id != loan.id,
            )
        )
        if existing_result.scalars().first():
            raise HTTPException(status_code=400, detail="Loan already exists.")
        loan.name = loan_name
        loan.key = loan_key

    new_opening_amount = current_opening_amount
    if "opening_amount" in updates:
        new_opening_amount = float(payload.opening_amount or 0)
        if new_opening_amount <= 0:
            raise HTTPException(status_code=400, detail="Opening amount must be greater than zero.")
        loan.opening_amount = new_opening_amount
        loan.outstanding_amount = max(0.0, new_opening_amount - paid_amount)

    if "monthly_payment" in updates:
        if payload.monthly_payment is None:
            loan.monthly_payment = None
        else:
            monthly_payment = float(payload.monthly_payment or 0)
            if monthly_payment <= 0:
                raise HTTPException(status_code=400, detail="monthly_payment must be greater than zero.")
            if monthly_payment - float(loan.opening_amount or new_opening_amount) > 0.004:
                raise HTTPException(status_code=400, detail="monthly_payment cannot be greater than opening_amount.")
            loan.monthly_payment = monthly_payment

    if "start_date" in updates and payload.start_date:
        try:
            loan.start_date = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="start_date must be in YYYY-MM-DD format.")

    if "notes" in updates:
        loan.notes = (payload.notes or "").strip() or None

    if "category_id" in updates:
        loan.category_id = payload.category_id

    loan.status = "settled" if float(loan.outstanding_amount or 0) <= 0.004 else "active"
    await db.commit()
    await db.refresh(loan)
    payment_count, last_payment_at = await get_loan_payment_summary(db, loan_id=int(loan.id), user_id=current_user.id)
    return serialize_loan_response(loan, payment_count=payment_count, last_payment_at=last_payment_at)


async def get_loan_route(
    *,
    loan_id: int,
    db: AsyncSession,
    current_user: models.User,
    get_loan_payment_summary: Callable[..., Awaitable[tuple[int, datetime | None]]],
    serialize_loan_response: Callable[..., schemas.LoanResponse],
) -> schemas.LoanResponse:
    loan_result = await db.execute(
        select(models.Loan).where(models.Loan.id == loan_id, models.Loan.user_id == current_user.id)
    )
    loan = loan_result.scalars().first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    payment_count, last_payment_at = await get_loan_payment_summary(db, loan_id=int(loan.id), user_id=current_user.id)
    return serialize_loan_response(loan, payment_count=payment_count, last_payment_at=last_payment_at)


async def delete_loan_route(
    *,
    loan_id: int,
    db: AsyncSession,
    current_user: models.User,
) -> dict[str, bool]:
    loan_result = await db.execute(
        select(models.Loan).where(models.Loan.id == loan_id, models.Loan.user_id == current_user.id)
    )
    loan = loan_result.scalars().first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    payment_count_result = await db.execute(
        select(func.count(models.LoanPayment.id)).where(
            models.LoanPayment.loan_id == loan_id,
            models.LoanPayment.user_id == current_user.id,
        )
    )
    payment_count = int(payment_count_result.scalar() or 0)
    if payment_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete loan with existing transactions. Delete loan transactions first.")

    await db.delete(loan)
    await db.commit()
    return {"ok": True}


async def get_loan_payments_route(
    *,
    loan_id: int,
    db: AsyncSession,
    current_user: models.User,
) -> list[schemas.LoanPaymentResponse]:
    loan_result = await db.execute(
        select(models.Loan).where(models.Loan.id == loan_id, models.Loan.user_id == current_user.id)
    )
    loan = loan_result.scalars().first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    result = await db.execute(
        select(models.LoanPayment)
        .where(models.LoanPayment.loan_id == loan_id, models.LoanPayment.user_id == current_user.id)
        .order_by(models.LoanPayment.payment_date.desc(), models.LoanPayment.created_at.desc(), models.LoanPayment.id.desc())
    )
    rows = list(result.scalars().all())
    wallet_ids = sorted({int(row.wallet_id) for row in rows if row.wallet_id is not None})
    txn_ids = sorted({int(row.transaction_id) for row in rows if row.transaction_id is not None})
    wallet_by_id: dict[int, models.Wallet] = {}
    txn_by_id: dict[int, models.Transaction] = {}
    if wallet_ids:
        wallet_result = await db.execute(select(models.Wallet).where(models.Wallet.id.in_(wallet_ids)))
        wallet_by_id = {int(wallet.id): wallet for wallet in wallet_result.scalars().all()}
    if txn_ids:
        txn_result = await db.execute(select(models.Transaction).where(models.Transaction.id.in_(txn_ids)))
        txn_by_id = {int(txn.id): txn for txn in txn_result.scalars().all()}
    return [
        schemas.LoanPaymentResponse(
            id=int(row.id),
            loan_id=int(row.loan_id),
            wallet_id=row.wallet_id,
            wallet_name=whatsapp_service.wallet_display_name(wallet_by_id.get(int(row.wallet_id))) if row.wallet_id is not None and int(row.wallet_id) in wallet_by_id else None,
            transaction_id=row.transaction_id,
            transaction_reference_id=txn_by_id.get(int(row.transaction_id)).reference_id if row.transaction_id is not None and int(row.transaction_id) in txn_by_id else None,
            amount=float(row.amount),
            payment_date=row.payment_date.strftime("%Y-%m-%d"),
            notes=row.notes,
            source_channel=row.source_channel,
            created_at=row.created_at,
        )
        for row in rows
    ]


async def create_loan_payment_route(
    *,
    loan_id: int,
    payload: schemas.LoanPaymentCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    get_accessible_wallet: Callable[..., Awaitable[models.Wallet]],
    ensure_wallet_can_cover_expense: Callable[..., Awaitable[None]],
    get_loan_payment_category_id: Callable[..., Awaitable[int | None]],
    current_business_date_fn: Callable[[], date],
) -> schemas.LoanPaymentResponse:
    loan_result = await db.execute(
        select(models.Loan).where(models.Loan.id == loan_id, models.Loan.user_id == current_user.id)
    )
    loan = loan_result.scalars().first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")
    outstanding_amount = float(loan.outstanding_amount or 0)
    if outstanding_amount <= 0.004:
        raise HTTPException(status_code=400, detail="Loan already settled.")
    if amount - outstanding_amount > 0.004:
        raise HTTPException(status_code=400, detail="Payment exceeds outstanding loan balance.")
    payment_date = current_business_date_fn()
    if payload.payment_date:
        try:
            payment_date = datetime.strptime(payload.payment_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="payment_date must be in YYYY-MM-DD format.")
    household_id = await ensure_current_user_household(db, current_user)
    wallet = await get_accessible_wallet(payload.wallet_id, current_user, db)
    await ensure_wallet_can_cover_expense(
        db,
        wallet=wallet,
        current_user=current_user,
        amount=amount,
    )
    category_id = await get_loan_payment_category_id(db, current_user.id, household_id)
    txn = models.Transaction(
        wallet_id=wallet.id,
        user_id=current_user.id,
        household_id=household_id,
        reference_id=models.generate_txn_reference(payment_date),
        type="expense",
        txn_date=payment_date,
        vendor_or_source=f"Loan Payment {loan.name}"[:190],
        amount=amount,
        category_id=category_id,
        notes=(payload.notes or f"Loan payment for {loan.name}").strip()[:255],
        source_channel="web",
    )
    db.add(txn)
    await db.flush()
    payment = models.LoanPayment(
        user_id=current_user.id,
        household_id=household_id,
        loan_id=int(loan.id),
        wallet_id=wallet.id,
        transaction_id=txn.id,
        amount=amount,
        payment_date=payment_date,
        notes=(payload.notes or "").strip() or None,
        source_channel="web",
    )
    db.add(payment)
    remaining = max(0.0, round(outstanding_amount - amount, 2))
    loan.outstanding_amount = remaining
    loan.status = "settled" if remaining <= 0.004 else "active"
    await db.commit()
    await db.refresh(payment)
    return schemas.LoanPaymentResponse(
        id=int(payment.id),
        loan_id=int(payment.loan_id),
        wallet_id=payment.wallet_id,
        wallet_name=whatsapp_service.wallet_display_name(wallet),
        transaction_id=payment.transaction_id,
        transaction_reference_id=txn.reference_id,
        amount=float(payment.amount),
        payment_date=payment.payment_date.strftime("%Y-%m-%d"),
        notes=payment.notes,
        source_channel=payment.source_channel,
        created_at=payment.created_at,
    )


async def delete_loan_payment_route(
    *,
    loan_id: int,
    payment_id: int,
    delete_transaction: bool,
    db: AsyncSession,
    current_user: models.User,
    delete_storage_object_safe: Callable[[str], Awaitable[None]],
) -> dict[str, bool]:
    loan_result = await db.execute(
        select(models.Loan).where(models.Loan.id == loan_id, models.Loan.user_id == current_user.id)
    )
    loan = loan_result.scalars().first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    payment_result = await db.execute(
        select(models.LoanPayment).where(
            models.LoanPayment.id == payment_id,
            models.LoanPayment.loan_id == loan_id,
            models.LoanPayment.user_id == current_user.id,
        )
    )
    payment = payment_result.scalars().first()
    if not payment:
        raise HTTPException(status_code=404, detail="Loan payment not found.")

    payment_amount = float(payment.amount or 0)
    transaction_id = int(payment.transaction_id) if payment.transaction_id is not None else None
    await db.delete(payment)

    if delete_transaction and transaction_id is not None:
        txn_result = await db.execute(
            select(models.Transaction).where(
                models.Transaction.id == transaction_id,
                models.Transaction.user_id == current_user.id,
            )
        )
        txn = txn_result.scalars().first()
        if txn:
            attachment_result = await db.execute(
                select(models.Attachment).where(models.Attachment.transaction_id == txn.id)
            )
            attachments = attachment_result.scalars().all()
            attachment_ids = [attachment.id for attachment in attachments]
            if attachment_ids:
                await db.execute(
                    update(models.ChatMessage)
                    .where(models.ChatMessage.attachment_id.in_(attachment_ids))
                    .values(attachment_id=None)
                )
            for attachment in attachments:
                await delete_storage_object_safe(attachment.file_path)
            await db.execute(models.Attachment.__table__.delete().where(models.Attachment.transaction_id == txn.id))
            await db.execute(models.TransactionItem.__table__.delete().where(models.TransactionItem.transaction_id == txn.id))
            await db.execute(models.Transaction.__table__.delete().where(models.Transaction.id == txn.id))

    loan.outstanding_amount = round(float(loan.outstanding_amount or 0) + payment_amount, 2)
    loan.status = "active" if float(loan.outstanding_amount or 0) > 0.004 else "settled"
    await db.commit()
    return {"ok": True}
