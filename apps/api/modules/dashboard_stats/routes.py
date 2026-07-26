from __future__ import annotations

from datetime import date
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas


async def get_dashboard_stats_route(
    *,
    current_user: models.User,
    db: AsyncSession,
    ensure_wallet: Callable[[AsyncSession, str], Awaitable[models.Wallet]],
    ensure_current_user_household: Callable[[AsyncSession, models.User], Awaitable[int]],
    backfill_wallet_transfer_categories: Callable[..., Awaitable[None]],
    is_primary_reporting_excluded_signature: Callable[..., bool],
    is_wallet_transfer_signature: Callable[..., bool],
    current_business_date: Callable[[], date],
) -> schemas.DashboardStats:
    await ensure_wallet(db, current_user.id)
    household_id = await ensure_current_user_household(db, current_user)
    await backfill_wallet_transfer_categories(db, user_id=current_user.id, household_id=household_id)

    res = await db.execute(
        select(
            models.Transaction,
            models.Category.is_internal.label("category_is_internal"),
            models.Category.system_code.label("category_system_code"),
        )
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .where(models.Transaction.user_id == current_user.id)
    )
    txn_rows = res.all()

    reporting_txns = [
        txn
        for txn, category_is_internal, category_system_code in txn_rows
        if not is_primary_reporting_excluded_signature(
            txn,
            category_system_code=category_system_code,
            category_is_internal=category_is_internal,
        )
    ]

    cash_balance_txns = [
        txn
        for txn, category_is_internal, category_system_code in txn_rows
        if not is_wallet_transfer_signature(
            txn,
            category_system_code=category_system_code,
            category_is_internal=category_is_internal,
        )
    ]

    balance = sum((float(txn.amount) if txn.type == "income" else -float(txn.amount)) for txn in cash_balance_txns)

    business_today = current_business_date()
    month_start = business_today.replace(day=1)
    if month_start.month == 12:
        month_end = date(month_start.year + 1, 1, 1)
    else:
        month_end = date(month_start.year, month_start.month + 1, 1)

    monthly_income = sum(
        float(txn.amount)
        for txn in reporting_txns
        if txn.type == "income" and month_start <= txn.txn_date < month_end
    )
    monthly_expense = sum(
        float(txn.amount)
        for txn in reporting_txns
        if txn.type == "expense" and month_start <= txn.txn_date < month_end
    )

    return schemas.DashboardStats(
        balance=balance,
        income_month=monthly_income,
        expense_month=monthly_expense,
        safe_balance=balance,
    )
