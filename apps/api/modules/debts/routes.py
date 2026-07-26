from __future__ import annotations

from datetime import date, datetime
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import whatsapp_service


async def get_debt_summaries_route(
    *,
    include_settled: bool,
    db: AsyncSession,
    current_user: models.User,
) -> list[dict]:
    summaries = await whatsapp_service.get_debt_summaries(db, user_id=current_user.id)
    if not include_settled:
        summaries = [row for row in summaries if abs(float(row.get("balance", 0.0))) > 0.004]
    return summaries


async def get_debt_entries_route(
    *,
    counterparty_name: str,
    limit: int,
    db: AsyncSession,
    current_user: models.User,
) -> list[schemas.DebtEventResponse]:
    key = whatsapp_service.counterparty_key(counterparty_name)
    result = await db.execute(
        select(models.Debt)
        .where(
            models.Debt.user_id == current_user.id,
            models.Debt.counterparty_key == key,
        )
        .order_by(models.Debt.txn_date.desc(), models.Debt.created_at.desc(), models.Debt.id.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    if not rows:
        return []

    wallet_ids = sorted({int(row.wallet_id) for row in rows if row.wallet_id is not None})
    wallet_by_id: dict[int, models.Wallet] = {}
    if wallet_ids:
        wallet_result = await db.execute(select(models.Wallet).where(models.Wallet.id.in_(wallet_ids)))
        wallet_by_id = {int(wallet.id): wallet for wallet in wallet_result.scalars().all()}

    txn_ids = sorted({int(row.transaction_id) for row in rows if row.transaction_id is not None})
    txn_ref_by_id: dict[int, str] = {}
    if txn_ids:
        txn_result = await db.execute(select(models.Transaction.id, models.Transaction.reference_id).where(models.Transaction.id.in_(txn_ids)))
        txn_ref_by_id = {int(txn_id): ref_id for txn_id, ref_id in txn_result.all() if ref_id}

    response: list[schemas.DebtEventResponse] = []
    for row in rows:
        wallet = wallet_by_id.get(int(row.wallet_id)) if row.wallet_id is not None else None
        response.append(
            schemas.DebtEventResponse(
                id=row.id,
                user_id=row.user_id,
                household_id=row.household_id,
                wallet_id=row.wallet_id,
                wallet_name=whatsapp_service.wallet_display_name(wallet) if wallet else None,
                transaction_id=row.transaction_id,
                transaction_reference_id=txn_ref_by_id.get(int(row.transaction_id)) if row.transaction_id is not None else None,
                counterparty_name=row.counterparty_name,
                counterparty_key=row.counterparty_key,
                event_type=row.event_type,
                amount=float(row.amount),
                signed_delta=whatsapp_service.debt_signed_delta(row.event_type, float(row.amount)),
                txn_date=row.txn_date.strftime("%Y-%m-%d"),
                notes=row.notes,
                source_channel=row.source_channel,
                created_at=row.created_at,
            )
        )
    return response


async def create_debt_entry_route(
    *,
    payload: schemas.DebtEventCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
) -> schemas.DebtEventResponse:
    household_id = await ensure_current_user_household(db, current_user)

    txn_date: date | None = None
    if payload.txn_date:
        try:
            txn_date = datetime.strptime(payload.txn_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="txn_date must be in YYYY-MM-DD format.")

    try:
        debt_row, txn = await whatsapp_service.create_debt_event(
            db,
            user_id=current_user.id,
            household_id=household_id,
            debtor_id=payload.debtor_id,
            counterparty_name=payload.counterparty_name,
            event_type=payload.event_type,
            amount=payload.amount,
            wallet_id=payload.wallet_id,
            txn_date=txn_date,
            notes=payload.notes,
            source_channel="web",
            allow_auto_register=True,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail == "WALLET_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Wallet not found.")
        if detail == "DEBTOR_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Borrower not found.")
        if detail.startswith("INSUFFICIENT_BALANCE:"):
            parts = detail.split(":")
            available = float(parts[2]) if len(parts) >= 3 else 0.0
            raise HTTPException(status_code=400, detail=f"Insufficient wallet balance (available: RM {available:,.2f}).")
        if detail in {"INVALID_COUNTERPARTY", "INVALID_EVENT_TYPE", "INVALID_AMOUNT"}:
            raise HTTPException(status_code=400, detail=detail)
        raise HTTPException(status_code=400, detail="Failed to create debt event.")

    wallet = None
    if debt_row.wallet_id is not None:
        wallet_result = await db.execute(select(models.Wallet).where(models.Wallet.id == debt_row.wallet_id))
        wallet = wallet_result.scalars().first()

    return schemas.DebtEventResponse(
        id=debt_row.id,
        user_id=debt_row.user_id,
        household_id=debt_row.household_id,
        wallet_id=debt_row.wallet_id,
        wallet_name=whatsapp_service.wallet_display_name(wallet) if wallet else None,
        transaction_id=debt_row.transaction_id,
        transaction_reference_id=txn.reference_id if txn else None,
        debtor_id=debt_row.debtor_id,
        counterparty_name=debt_row.counterparty_name,
        counterparty_key=debt_row.counterparty_key,
        event_type=debt_row.event_type,
        amount=float(debt_row.amount),
        signed_delta=whatsapp_service.debt_signed_delta(debt_row.event_type, float(debt_row.amount)),
        txn_date=debt_row.txn_date.strftime("%Y-%m-%d"),
        notes=debt_row.notes,
        source_channel=debt_row.source_channel,
        created_at=debt_row.created_at,
    )


async def delete_debt_entry_route(
    *,
    debt_id: int,
    db: AsyncSession,
    current_user: models.User,
    delete_storage_object_safe: Callable[[str], Awaitable[None]],
) -> dict[str, str]:
    debt_result = await db.execute(
        select(models.Debt).where(
            models.Debt.id == debt_id,
            models.Debt.user_id == current_user.id,
        )
    )
    debt_row = debt_result.scalars().first()
    if not debt_row:
        raise HTTPException(status_code=404, detail="Debt entry not found.")

    txn: models.Transaction | None = None
    if debt_row.transaction_id is not None:
        txn_result = await db.execute(
            select(models.Transaction).where(
                models.Transaction.id == debt_row.transaction_id,
                models.Transaction.user_id == current_user.id,
            )
        )
        txn = txn_result.scalars().first()

    if txn is not None:
        attachment_result = await db.execute(
            select(models.Attachment).where(models.Attachment.transaction_id == txn.id)
        )
        attachments = attachment_result.scalars().all()
        attachment_ids = [int(attachment.id) for attachment in attachments]
        if attachment_ids:
            await db.execute(
                update(models.ChatMessage)
                .where(models.ChatMessage.attachment_id.in_(attachment_ids))
                .values(attachment_id=None)
            )
        for attachment in attachments:
            await delete_storage_object_safe(attachment.file_path)
        await db.execute(models.Attachment.__table__.delete().where(models.Attachment.transaction_id == txn.id))

    await db.execute(models.Debt.__table__.delete().where(models.Debt.id == debt_row.id))
    if txn is not None:
        await db.execute(models.Transaction.__table__.delete().where(models.Transaction.id == txn.id))
    await db.commit()
    return {"message": "Debt entry deleted"}
