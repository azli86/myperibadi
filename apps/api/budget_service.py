import re
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from time_utils import current_business_date

MONTH_KEY_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MONTH_TOKEN_PATTERN = re.compile(r"@(\d{4}-\d{2})\b")


def normalize_month_key(month_key: Optional[str]) -> str:
    if month_key is None:
        return current_business_date().strftime("%Y-%m")
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


def month_bounds(month_key: str) -> tuple[date, date]:
    month_start = datetime.strptime(f"{month_key}-01", "%Y-%m-%d").date()
    if month_start.month == 12:
        month_end_exclusive = date(month_start.year + 1, 1, 1)
    else:
        month_end_exclusive = date(month_start.year, month_start.month + 1, 1)
    return month_start, month_end_exclusive


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
) -> dict[int, float]:
    month_start, month_end_exclusive = month_bounds(month_key)
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
    usage_map = await get_usage_map(db, user_id=user_id, month_key=month_key)

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
) -> dict[str, Any]:
    items = await get_budget_items(
        db,
        user_id=user_id,
        household_id=household_id,
        month_key=month_key,
    )
    total_budget = sum(item["budget_amount"] for item in items)
    total_used = sum(item["used_amount"] for item in items)
    remaining_amount = total_budget - total_used
    overall_progress_percent = (total_used / total_budget * 100.0) if total_budget > 0 else 0.0

    active_budget_items = [item for item in items if item["budget_amount"] > 0]
    alert_count = sum(1 for item in active_budget_items if item["progress_percent"] >= 80)
    over_budget_count = sum(1 for item in active_budget_items if item["progress_percent"] >= 100)

    return {
        "month_key": month_key,
        "total_budget": round(total_budget, 2),
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
