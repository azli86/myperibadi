import re
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from time_utils import current_business_date, cycle_bounds, clamp_day, current_cycle_key

MONTH_KEY_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MONTH_TOKEN_PATTERN = re.compile(r"@(\d{4}-\d{2})\b")

MONTHLY_SALARY_CODE = models.MONTHLY_SALARY_CATEGORY_CODE


async def get_category_cycle_bounds(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
    ref: date,
) -> Optional[tuple[str, date, date]]:
    """Return (month_key, start, end_exclusive) for the salary-anchored cycle
    containing `ref`. Returns None if no Monthly Salary transaction exists yet."""
    if not household_id:
        return None
    sal = (
        select(models.Transaction.txn_date)
        .join(models.Category, models.Transaction.category_id == models.Category.id)
        .where(
            models.Transaction.user_id == user_id,
            models.Transaction.type == "income",
            models.Category.system_code == MONTHLY_SALARY_CODE,
            models.Transaction.txn_date <= ref,
        )
        .order_by(models.Transaction.txn_date.desc())
        .limit(1)
    )
    start_res = await db.execute(sal)
    start = start_res.scalar_one_or_none()
    if start is None:
        return None
    next_res = await db.execute(
        sal.where(models.Transaction.txn_date > start).order_by(models.Transaction.txn_date.asc()).limit(1)
    )
    nxt = next_res.scalar_one_or_none()
    end_exclusive = nxt if nxt else (ref + timedelta(days=1))
    month_key = f"{start.year}-{start.month:02d}"
    return month_key, start, end_exclusive


async def get_salary_dates(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
) -> list[date]:
    if not household_id:
        return []
    res = await db.execute(
        select(models.Transaction.txn_date)
        .join(models.Category, models.Transaction.category_id == models.Category.id)
        .where(
            models.Transaction.user_id == user_id,
            models.Transaction.type == "income",
            models.Category.system_code == MONTHLY_SALARY_CODE,
        )
        .order_by(models.Transaction.txn_date.asc())
    )
    return [d for d in res.scalars().all() if d]


async def get_category_cycle_bounds_for_month(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int],
    month_key: str,
) -> Optional[tuple[date, date]]:
    """Salary cycle whose start month === month_key: start = first Monthly Salary
    income txn in that month, end_exclusive = next salary (or today+1)."""
    if not household_id:
        return None
    try:
        yt, mt = month_key.split("-")
        yt_i, mt_i = int(yt), int(mt)
    except (ValueError, AttributeError):
        return None
    base = (
        select(models.Transaction.txn_date)
        .join(models.Category, models.Transaction.category_id == models.Category.id)
        .where(
            models.Transaction.user_id == user_id,
            models.Transaction.type == "income",
            models.Category.system_code == MONTHLY_SALARY_CODE,
        )
    )
    month_q = base.where(
        func.extract("year", models.Transaction.txn_date) == yt_i,
        func.extract("month", models.Transaction.txn_date) == mt_i,
    ).order_by(models.Transaction.txn_date.asc()).limit(1)
    start_res = await db.execute(month_q)
    start = start_res.scalar_one_or_none()
    if start is None:
        return None
    next_res = await db.execute(
        base.where(models.Transaction.txn_date > start).order_by(models.Transaction.txn_date.asc()).limit(1)
    )
    nxt = next_res.scalar_one_or_none()
    end_exclusive = nxt if nxt else (current_business_date() + timedelta(days=1))
    return start, end_exclusive


async def resolve_user_cycle(
    db: AsyncSession,
    *,
    user,
    ref: Optional[date] = None,
) -> dict[str, Any]:
    """Resolve the active cycle (day-based or salary-category-based) for a user."""
    ref = ref or current_business_date()
    mode = (getattr(user, "cycle_mode", None) or "day").strip().lower()
    if mode == "category":
        cat_cycle = await get_category_cycle_bounds(
            db, user_id=user.id, household_id=getattr(user, "default_household_id", None), ref=ref
        )
        if cat_cycle:
            month_key, start, end = cat_cycle
            return {
                "mode": "category",
                "month_key": month_key,
                "start": start,
                "end": end,
            }
    start_day = int(getattr(user, "cycle_start_day", 1) or 1)
    start, end = cycle_bounds(start_day, ref)
    return {
        "mode": "day",
        "month_key": f"{start.year}-{start.month:02d}",
        "start": start,
        "end": end,
    }


def normalize_month_key(month_key: Optional[str], start_day: int = 1) -> str:
    if month_key is None:
        return current_cycle_key(start_day)
    normalized = month_key.strip()
    if not MONTH_KEY_PATTERN.fullmatch(normalized):
        raise ValueError("Month must be in YYYY-MM format.")
    return normalized


def extract_month_token(text: str) -> tuple[Optional[str], str, bool]:
    raw = (text or "").strip()
    match = MONTH_TOKEN_PATTERN.search(raw)
    if not match:
        return None, raw, False
    month_key = match.group(1)
    if not MONTH_KEY_PATTERN.fullmatch(month_key):
        return None, raw, True

    cleaned = f"{raw[:match.start()]} {raw[match.end():]}".strip()
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return month_key, cleaned, False


def month_bounds(month_key: str, start_day: int = 1) -> tuple[date, date]:
    month_start = datetime.strptime(f"{month_key}-01", "%Y-%m-%d").date()
    if start_day <= 1:
        if month_start.month == 12:
            month_end_exclusive = date(month_start.year + 1, 1, 1)
        else:
            month_end_exclusive = date(month_start.year, month_start.month + 1, 1)
        return month_start, month_end_exclusive
    # cycle: month_key labels the cycle's start month
    start = date(month_start.year, month_start.month, clamp_day(month_start.year, month_start.month, start_day))
    nxt = (start.replace(day=1) + timedelta(days=32)).replace(day=1)
    month_end_exclusive = date(nxt.year, nxt.month, clamp_day(nxt.year, nxt.month, start_day))
    return start, month_end_exclusive


def budget_status(progress_percent: float, budget_amount: float) -> str:
    if budget_amount <= 0:
        return "normal"
    if progress_percent >= 100:
        return "over_budget"
    if progress_percent >= 80:
        return "warning"
    return "normal"


def normalize_lookup_value(value: str) -> str:
    return " ".join((value or "").strip().lower().split())


async def get_usage_map(
    db: AsyncSession,
    *,
    user_id: str,
    month_key: str,
    start_day: int = 1,
    explicit_bounds: Optional[tuple[date, date]] = None,
) -> dict[int, float]:
    month_start, month_end_exclusive = explicit_bounds if explicit_bounds else month_bounds(month_key, start_day)
    result = await db.execute(
        select(
            models.Transaction.category_id,
            func.sum(models.Transaction.amount).label("used_amount"),
        )
        .join(models.Category, models.Transaction.category_id == models.Category.id)
        .where(
            models.Transaction.user_id == user_id,
            models.Transaction.type == "expense",
            models.Transaction.txn_date >= month_start,
            models.Transaction.txn_date < month_end_exclusive,
            models.Transaction.category_id.is_not(None),
            models.Category.is_internal == False,
        )
        .group_by(models.Transaction.category_id)
    )
    usage_map: dict[int, float] = {}
    for row in result.all():
        cat_id = row[0]
        used_amount = row[1] or 0
        if cat_id is None:
            continue
        usage_map[int(cat_id)] = float(used_amount)
    return usage_map


async def get_budget_items(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: int,
    month_key: str,
    start_day: int = 1,
    explicit_bounds: Optional[tuple[date, date]] = None,
) -> list[dict[str, Any]]:
    categories_result = await db.execute(
        select(models.Category)
        .where(
            models.Category.household_id == household_id,
            models.Category.kind == "expense",
            models.Category.is_internal == False,
        )
        .order_by(models.Category.name.asc())
    )
    categories = categories_result.scalars().all()

    budget_result = await db.execute(
        select(models.CategoryBudget).where(
            models.CategoryBudget.household_id == household_id,
            models.CategoryBudget.month_key == month_key,
        )
    )
    budget_rows = budget_result.scalars().all()
    budget_by_category = {int(row.category_id): row for row in budget_rows}
    usage_map = await get_usage_map(db, user_id=user_id, month_key=month_key, start_day=start_day, explicit_bounds=explicit_bounds)

    items: list[dict[str, Any]] = []
    for category in categories:
        budget_row = budget_by_category.get(int(category.id))
        budget_amount = float(budget_row.budget_amount) if budget_row else 0.0
        used_amount = usage_map.get(int(category.id), 0.0)
        remaining_amount = budget_amount - used_amount
        progress_percent = (used_amount / budget_amount * 100.0) if budget_amount > 0 else 0.0
        status = budget_status(progress_percent, budget_amount)

        items.append(
            {
                "id": int(budget_row.id) if budget_row else None,
                "category_id": int(category.id),
                "category_name": category.name,
                "category_icon_name": category.icon_name,
                "month_key": month_key,
                "budget_amount": round(budget_amount, 2),
                "used_amount": round(used_amount, 2),
                "remaining_amount": round(remaining_amount, 2),
                "progress_percent": round(progress_percent, 2),
                "status": status,
            }
        )
    return items


async def get_budget_summary(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: int,
    month_key: str,
    start_day: int = 1,
    explicit_bounds: Optional[tuple[date, date]] = None,
) -> dict[str, Any]:
    items = await get_budget_items(
        db,
        user_id=user_id,
        household_id=household_id,
        month_key=month_key,
        start_day=start_day,
        explicit_bounds=explicit_bounds,
    )
    total_budget = sum(item["budget_amount"] for item in items)
    total_used = sum(item["used_amount"] for item in items)
    remaining_amount = total_budget - total_used
    month_start, month_end_exclusive = explicit_bounds if explicit_bounds else month_bounds(month_key, start_day)
    cycle_income = float(await db.scalar(
        select(func.coalesce(func.sum(models.Transaction.amount), 0)).where(
            models.Transaction.user_id == user_id,
            models.Transaction.type == "income",
            models.Transaction.txn_date >= month_start,
            models.Transaction.txn_date < month_end_exclusive,
        )
    ) or 0)
    unallocated_amount = cycle_income - total_budget
    overall_progress_percent = (total_used / total_budget * 100.0) if total_budget > 0 else 0.0

    active_budget_items = [item for item in items if item["budget_amount"] > 0]
    alert_count = sum(1 for item in active_budget_items if item["progress_percent"] >= 80)
    over_budget_count = sum(1 for item in active_budget_items if item["progress_percent"] >= 100)

    return {
        "month_key": month_key,
        "total_budget": round(total_budget, 2),
        "cycle_income": round(cycle_income, 2),
        "unallocated_amount": round(unallocated_amount, 2),
        "total_used": round(total_used, 2),
        "remaining_amount": round(remaining_amount, 2),
        "overall_progress_percent": round(overall_progress_percent, 2),
        "alert_count": alert_count,
        "over_budget_count": over_budget_count,
    }


async def find_expense_category_by_name(
    db: AsyncSession,
    *,
    household_id: int,
    raw_name: str,
) -> tuple[Optional[models.Category], list[str]]:
    categories_result = await db.execute(
        select(models.Category)
        .where(
            models.Category.household_id == household_id,
            models.Category.kind == "expense",
            models.Category.is_internal == False,
        )
        .order_by(models.Category.name.asc())
    )
    categories = categories_result.scalars().all()
    if not categories:
        return None, []

    target = normalize_lookup_value(raw_name)
    if not target:
        return None, [c.name for c in categories[:10]]

    exact_matches = [c for c in categories if normalize_lookup_value(c.name) == target]
    if len(exact_matches) == 1:
        return exact_matches[0], []
    if len(exact_matches) > 1:
        return None, [c.name for c in exact_matches]

    partial_matches = [
        c for c in categories
        if target in normalize_lookup_value(c.name) or normalize_lookup_value(c.name) in target
    ]
    if len(partial_matches) == 1:
        return partial_matches[0], []
    if partial_matches:
        return None, [c.name for c in partial_matches[:10]]

    return None, [c.name for c in categories[:10]]
