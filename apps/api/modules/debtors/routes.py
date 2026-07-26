from __future__ import annotations

from datetime import datetime
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import whatsapp_service


async def get_debtors_route(
    *,
    db: AsyncSession,
    current_user: models.User,
) -> list[schemas.DebtorResponse]:
    summaries = await whatsapp_service.get_debt_summaries(db, user_id=current_user.id)
    response = []
    for summary in summaries:
        if summary.get("debtor_id"):
            response.append(
                schemas.DebtorResponse(
                    id=summary["debtor_id"],
                    name=summary["counterparty_name"],
                    key=summary["counterparty_key"],
                    is_active=True,
                    created_at=summary["last_activity_at"] or datetime.utcnow(),
                    balance=summary["balance"],
                    event_count=summary["event_count"],
                )
            )
    return response


async def create_debtor_route(
    *,
    payload: schemas.DebtorCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
) -> schemas.DebtorResponse:
    key = whatsapp_service.counterparty_key(payload.name)
    result = await db.execute(
        select(models.Debtor).where(models.Debtor.user_id == current_user.id, models.Debtor.key == key)
    )
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Borrower already registered.")

    household_id = await ensure_current_user_household(db, current_user)
    db_debtor = models.Debtor(
        user_id=current_user.id,
        household_id=household_id,
        name=payload.name,
        key=key,
    )
    db.add(db_debtor)
    await db.flush()

    if payload.opening_balance and payload.opening_balance > 0:
        event_type = "opening_receivable" if payload.opening_type == "receivable" else "opening_payable"
        await whatsapp_service.create_debt_event(
            db,
            user_id=current_user.id,
            household_id=household_id,
            debtor_id=db_debtor.id,
            event_type=event_type,
            amount=payload.opening_balance,
            txn_date=whatsapp_service.current_business_date(),
            notes="Opening Balance",
            source_channel="web_portal",
        )

    await db.commit()
    await db.refresh(db_debtor)
    return schemas.DebtorResponse(
        id=db_debtor.id,
        name=db_debtor.name,
        key=db_debtor.key,
        is_active=db_debtor.is_active,
        created_at=db_debtor.created_at,
        balance=0.0,
        event_count=0,
    )


async def delete_debtor_route(
    *,
    debtor_id: int,
    db: AsyncSession,
    current_user: models.User,
) -> dict[str, str]:
    result = await db.execute(
        select(models.Debtor).where(models.Debtor.id == debtor_id, models.Debtor.user_id == current_user.id)
    )
    debtor = result.scalars().first()
    if not debtor:
        raise HTTPException(status_code=404, detail="Borrower not found.")

    debt_count_res = await db.execute(
        select(func.count(models.Debt.id)).where(models.Debt.debtor_id == debtor_id)
    )
    if debt_count_res.scalar() > 0:
        raise HTTPException(status_code=400, detail="Cannot delete borrower with active history. Use archive instead (TBD).")

    await db.delete(debtor)
    await db.commit()
    return {"message": "Borrower deleted"}
