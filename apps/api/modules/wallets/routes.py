from __future__ import annotations

from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas


async def get_wallets_route(
    *,
    db: AsyncSession,
    current_user: models.User,
    ensure_wallet: Callable[..., Awaitable[models.Wallet]],
) -> list[models.Wallet]:
    await ensure_wallet(db, current_user.id)
    result = await db.execute(
        select(models.Wallet)
        .where(models.Wallet.owner_user_id == current_user.id)
        .order_by(models.Wallet.created_at.asc(), models.Wallet.id.asc())
    )
    wallets = result.scalars().all()

    wallet_ids = [w.id for w in wallets]
    balance_by_wallet: dict[int, float] = {}
    tx_count_by_wallet: dict[int, int] = {}
    if wallet_ids:
        aggregate_result = await db.execute(
            select(
                models.Transaction.wallet_id,
                func.sum(
                    case(
                        (models.Transaction.type == "income", models.Transaction.amount),
                        else_=-models.Transaction.amount,
                    )
                ).label("balance"),
                func.count(models.Transaction.id).label("transaction_count"),
            )
            .where(models.Transaction.wallet_id.in_(wallet_ids), models.Transaction.user_id == current_user.id)
            .group_by(models.Transaction.wallet_id)
        )
        for wallet_id, balance, transaction_count in aggregate_result.all():
            balance_by_wallet[int(wallet_id)] = float(balance or 0)
            tx_count_by_wallet[int(wallet_id)] = int(transaction_count or 0)

    for wallet in wallets:
        wallet.balance = balance_by_wallet.get(wallet.id, 0.0)
        wallet.transaction_count = tx_count_by_wallet.get(wallet.id, 0)

    return wallets


async def create_wallet_route(
    *,
    wallet_in: schemas.WalletCreate,
    db: AsyncSession,
    current_user: models.User,
    resolve_wallet_type: Callable[..., str],
) -> models.Wallet:
    wallet_name = (wallet_in.name or "").strip()
    if not wallet_name:
        raise HTTPException(status_code=400, detail="Wallet prefix is required")
    wallet_label = (wallet_in.label or "").strip()
    if not wallet_label:
        raise HTTPException(status_code=400, detail="Wallet label is required")
    wallet_type = resolve_wallet_type(wallet_in.type)

    db_wallet = models.Wallet(
        owner_user_id=current_user.id,
        household_id=current_user.default_household_id if wallet_type == "shared" else None,  # legacy shared only
        name=wallet_name,
        label=wallet_label,
        card_color=(wallet_in.card_color or "").strip() or None,
        type=wallet_type,
        currency=(wallet_in.currency or "MYR").upper(),
        status="active",
        is_bot_default=wallet_in.is_bot_default or False,
    )

    if db_wallet.is_bot_default:
        await db.execute(
            update(models.Wallet)
            .where(models.Wallet.owner_user_id == current_user.id)
            .values(is_bot_default=False)
        )

    db.add(db_wallet)
    await db.commit()
    await db.refresh(db_wallet)
    return db_wallet


async def update_wallet_route(
    *,
    wallet_id: int,
    wallet_in: schemas.WalletUpdate,
    db: AsyncSession,
    current_user: models.User,
    resolve_wallet_type: Callable[..., str],
) -> models.Wallet:
    result = await db.execute(
        select(models.Wallet).where(
            models.Wallet.id == wallet_id,
            models.Wallet.owner_user_id == current_user.id,
        )
    )
    wallet = result.scalars().first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    if wallet_in.name is not None:
        wallet_name = wallet_in.name.strip()
        if not wallet_name:
            raise HTTPException(status_code=400, detail="Wallet prefix cannot be empty")
        wallet.name = wallet_name

    if wallet_in.label is not None:
        wallet_label = wallet_in.label.strip()
        if not wallet_label:
            raise HTTPException(status_code=400, detail="Wallet label cannot be empty")
        wallet.label = wallet_label

    if wallet_in.card_color is not None:
        wallet.card_color = wallet_in.card_color.strip() or None

    if wallet_in.type is not None:
        next_type = resolve_wallet_type(wallet_in.type, current_type=wallet.type)
        wallet.type = next_type
        wallet.household_id = current_user.default_household_id if next_type == "shared" else None

    if wallet_in.currency is not None:
        wallet.currency = wallet_in.currency.upper()

    if wallet_in.status is not None:
        wallet.status = wallet_in.status

    if wallet_in.is_bot_default is not None:
        if wallet_in.is_bot_default:
            await db.execute(
                update(models.Wallet)
                .where(models.Wallet.owner_user_id == current_user.id)
                .values(is_bot_default=False)
            )
        wallet.is_bot_default = wallet_in.is_bot_default

    await db.commit()
    await db.refresh(wallet)
    return wallet


async def delete_wallet_route(
    *,
    wallet_id: int,
    db: AsyncSession,
    current_user: models.User,
) -> dict[str, str]:
    result = await db.execute(
        select(models.Wallet).where(
            models.Wallet.id == wallet_id,
            models.Wallet.owner_user_id == current_user.id,
        )
    )
    wallet = result.scalars().first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    tx_count_result = await db.execute(
        select(func.count(models.Transaction.id)).where(models.Transaction.wallet_id == wallet.id)
    )
    tx_count = tx_count_result.scalar_one() or 0
    if tx_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete wallet with existing transactions")

    await db.execute(models.Wallet.__table__.delete().where(models.Wallet.id == wallet.id))
    await db.commit()
    return {"message": "Wallet deleted"}
