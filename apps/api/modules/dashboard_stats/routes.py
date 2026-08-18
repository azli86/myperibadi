from __future__ import annotations

from datetime import date
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
from time_utils import cycle_bounds
import budget_service


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
    user_id = current_user.id  # capture before ensure_wallet commit (expires attrs)
    await ensure_wallet(db, user_id)
    await db.refresh(current_user)  # ensure_wallet committed → restore expired attrs
    household_id = await ensure_current_user_household(db, current_user)
    await backfill_wallet_transfer_categories(db, user_id=user_id, household_id=household_id)

    res = await db.execute(
        select(
            models.Transaction,
            models.Category.is_internal.label("category_is_internal"),
            models.Category.system_code.label("category_system_code"),
            models.Wallet.is_saving.label("wallet_is_saving"),
        )
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .outerjoin(models.Wallet, models.Transaction.wallet_id == models.Wallet.id)
        .where(models.Transaction.user_id == user_id)
    )
    txn_rows = res.all()

    reporting_txns = [
        txn
        for txn, category_is_internal, category_system_code, wallet_is_saving in txn_rows
        if not is_primary_reporting_excluded_signature(
            txn,
            category_system_code=category_system_code,
            category_is_internal=category_is_internal,
        )
        and not wallet_is_saving
    ]

    # Total balance = sum of ALL transactions (transfers included) on NON-saving
    # wallets. This equals the sum of the non-saving wallet card balances:
    #  - transfer between two non-saving wallets is net zero (both legs counted)
    #  - transfer into a saving wallet reduces the total (money left spendable)
    #  - anything on a saving wallet is excluded from the total
    cash_balance_txns = [
        txn
        for txn, category_is_internal, category_system_code, wallet_is_saving in txn_rows
        if not wallet_is_saving
    ]

    balance = sum((float(txn.amount) if txn.type == "income" else -float(txn.amount)) for txn in cash_balance_txns)

    business_today = current_business_date()
    cycle = await budget_service.resolve_user_cycle(db, user=current_user)
    month_start, month_end = cycle["start"], cycle["end"]

    monthly_income = sum(
        float(txn.amount)
        for txn in reporting_txns
        if txn.type == "income"
        and txn.transaction_kind != "reimbursement"
        and month_start <= txn.txn_date < month_end
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
