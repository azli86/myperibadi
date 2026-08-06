from __future__ import annotations

from datetime import date, datetime
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import location_service
import models
import schemas


async def get_wa_status_route(
    *,
    db: AsyncSession,
    current_user: models.User,
) -> dict[str, str | None]:
    result = await db.execute(select(models.WhatsAppLink).where(models.WhatsAppLink.user_id == current_user.id))
    link = result.scalars().first()
    if not link:
        return {"status": "disconnected", "phone": None}
    return {"status": "connected", "phone": link.phone}


async def get_transactions_route(
    *,
    current_user: models.User,
    db: AsyncSession,
    start_date: date | None,
    end_date: date | None,
    limit: int,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    backfill_wallet_transfer_categories: Callable[..., Awaitable[None]],
    is_wallet_transfer_signature: Callable[..., bool],
    is_debt_movement_signature: Callable[..., bool],
) -> list[schemas.TransactionResponse]:
    household_id = await ensure_current_user_household(db, current_user)
    await backfill_wallet_transfer_categories(db, user_id=current_user.id, household_id=household_id)

    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    filters = [models.Transaction.user_id == current_user.id]
    if start_date:
        filters.append(models.Transaction.txn_date >= start_date)
    if end_date:
        filters.append(models.Transaction.txn_date <= end_date)

    stmt = (
        select(
            models.Transaction,
            models.Category.name.label("category_name"),
            models.Category.icon_name.label("category_icon_name"),
            models.Category.is_internal.label("category_is_internal"),
            models.Category.system_code.label("category_system_code"),
            func.coalesce(models.Wallet.label, models.Wallet.name).label("wallet_name"),
            func.count(models.Attachment.id).label("attachment_count"),
        )
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .outerjoin(models.Wallet, models.Transaction.wallet_id == models.Wallet.id)
        .outerjoin(models.Attachment, models.Attachment.transaction_id == models.Transaction.id)
        .where(*filters)
        .group_by(
            models.Transaction.id,
            models.Category.name,
            models.Category.icon_name,
            models.Category.is_internal,
            models.Category.system_code,
            models.Wallet.label,
            models.Wallet.name,
        )
        .order_by(models.Transaction.txn_date.desc(), models.Transaction.txn_time.desc().nulls_last(), models.Transaction.id.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()

    response: list[schemas.TransactionResponse] = []
    for row in rows:
        txn = row[0]
        category_name = row[1]
        category_icon_name = row[2]
        category_is_internal = bool(row[3])
        category_system_code = row[4]
        is_wallet_transfer = is_wallet_transfer_signature(
            txn,
            category_system_code=category_system_code,
            category_is_internal=category_is_internal,
        )
        is_debt_movement = is_debt_movement_signature(category_system_code=category_system_code)
        response.append(
            schemas.TransactionResponse(
                id=txn.id,
                reference_id=txn.reference_id,
                user_id=txn.user_id,
                type=txn.type,
                amount=float(txn.amount),
                vendor_or_source=txn.vendor_or_source,
                category_id=txn.category_id,
                wallet_name=row[5],
                category_name=category_name,
                category_icon_name=category_icon_name,
                category_is_internal=category_is_internal,
                category_system_code=category_system_code,
                is_wallet_transfer=is_wallet_transfer,
                is_debt_movement=is_debt_movement,
                txn_date=txn.txn_date.strftime("%Y-%m-%d"),
                txn_time=txn.txn_time.strftime("%H:%M") if txn.txn_time else None,
                notes=txn.notes,
                wallet_id=txn.wallet_id,
                latitude=float(txn.latitude) if txn.latitude is not None else None,
                longitude=float(txn.longitude) if txn.longitude is not None else None,
                location_name=txn.location_name,
                source_channel=txn.source_channel,
                attachment_count=int(row[6] or 0),
                created_at=txn.created_at,
            )
        )
    return response


async def get_transaction_map_points_route(
    *,
    month: str | None,
    limit: int,
    current_user: models.User,
    db: AsyncSession,
) -> list[schemas.TransactionMapPoint]:
    stmt = (
        select(
            models.Transaction,
            models.Category.name.label("category_name"),
            models.Category.icon_name.label("category_icon_name"),
            func.coalesce(models.Wallet.label, models.Wallet.name).label("wallet_name"),
        )
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .outerjoin(models.Wallet, models.Transaction.wallet_id == models.Wallet.id)
        .where(models.Transaction.user_id == current_user.id)
        .where(models.Transaction.latitude.is_not(None), models.Transaction.longitude.is_not(None))
        .order_by(models.Transaction.txn_date.desc(), models.Transaction.txn_time.desc().nulls_last(), models.Transaction.created_at.desc())
        .limit(limit)
    )

    if month:
        try:
            month_start = datetime.strptime(f"{month}-01", "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="month must be in YYYY-MM format.")
        if month_start.month == 12:
            month_end = date(month_start.year + 1, 1, 1)
        else:
            month_end = date(month_start.year, month_start.month + 1, 1)
        stmt = stmt.where(models.Transaction.txn_date >= month_start, models.Transaction.txn_date < month_end)

    result = await db.execute(stmt)
    rows = result.all()

    return [
        schemas.TransactionMapPoint(
            id=row[0].id,
            reference_id=row[0].reference_id,
            type=row[0].type,
            amount=float(row[0].amount),
            txn_date=row[0].txn_date.strftime("%Y-%m-%d"),
            vendor_or_source=row[0].vendor_or_source,
            category_name=row[1],
            category_icon_name=row[2],
            wallet_name=row[3],
            latitude=float(row[0].latitude),
            longitude=float(row[0].longitude),
            location_name=row[0].location_name,
        )
        for row in rows
        if row[0].latitude is not None and row[0].longitude is not None
    ]


async def sync_transaction_location_names_route(
    *,
    limit: int,
    current_user: models.User,
    db: AsyncSession,
) -> dict[str, int]:
    stmt = (
        select(models.Transaction)
        .where(models.Transaction.user_id == current_user.id)
        .where(models.Transaction.latitude.is_not(None), models.Transaction.longitude.is_not(None))
        .where(or_(models.Transaction.location_name.is_(None), func.trim(models.Transaction.location_name) == ""))
        .order_by(models.Transaction.txn_date.desc(), models.Transaction.txn_time.desc().nulls_last(), models.Transaction.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    updated = 0
    skipped = 0
    for txn in transactions:
        resolved_name = await location_service.reverse_geocode_short_name(txn.latitude, txn.longitude)
        if resolved_name:
            txn.location_name = resolved_name
            updated += 1
        else:
            skipped += 1

    if updated:
        await db.commit()
    else:
        await db.rollback()

    return {"checked": len(transactions), "updated": updated, "skipped": skipped}
