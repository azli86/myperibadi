from __future__ import annotations

from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import budget_service
import models
import schemas


async def get_budgets_route(
    *,
    month: str | None,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
) -> list[dict]:
    try:
        month_key = budget_service.normalize_month_key(month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    household_id = await ensure_current_user_household(db, current_user)
    items = await budget_service.get_budget_items(
        db,
        user_id=current_user.id,
        household_id=household_id,
        month_key=month_key,
    )
    return items


async def create_budget_route(
    *,
    budget_in: schemas.BudgetCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    get_accessible_category: Callable[..., Awaitable[models.Category]],
    validate_budget_amount: Callable[[float], float],
) -> dict:
    try:
        month_key = budget_service.normalize_month_key(budget_in.month_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    budget_amount = validate_budget_amount(budget_in.budget_amount)
    household_id = await ensure_current_user_household(db, current_user)
    category = await get_accessible_category(budget_in.category_id, current_user, db)
    if category.is_internal:
        raise HTTPException(status_code=403, detail="Internal category cannot be used for budgets.")
    if category.kind != "expense":
        raise HTTPException(status_code=400, detail="Budget can only be set for expense categories.")

    existing_result = await db.execute(
        select(models.CategoryBudget).where(
            models.CategoryBudget.household_id == household_id,
            models.CategoryBudget.category_id == budget_in.category_id,
            models.CategoryBudget.month_key == month_key,
        )
    )
    existing_budget = existing_result.scalars().first()
    if existing_budget:
        existing_budget.budget_amount = budget_amount
        target_budget_id = existing_budget.id
    else:
        new_budget = models.CategoryBudget(
            household_id=household_id,
            category_id=budget_in.category_id,
            month_key=month_key,
            budget_amount=budget_amount,
        )
        db.add(new_budget)
        await db.flush()
        target_budget_id = new_budget.id

    await db.commit()

    items = await budget_service.get_budget_items(
        db,
        user_id=current_user.id,
        household_id=household_id,
        month_key=month_key,
    )
    for item in items:
        if item["id"] == int(target_budget_id):
            return item
    raise HTTPException(status_code=500, detail="Failed to load saved budget.")


async def update_budget_route(
    *,
    budget_id: int,
    budget_in: schemas.BudgetUpdate,
    db: AsyncSession,
    current_user: models.User,
    get_mutable_budget: Callable[..., Awaitable[models.CategoryBudget]],
    ensure_current_user_household: Callable[..., Awaitable[int]],
    validate_budget_amount: Callable[[float], float],
) -> dict:
    if budget_in.month_key is None and budget_in.budget_amount is None:
        raise HTTPException(status_code=400, detail="No changes provided.")

    budget = await get_mutable_budget(budget_id, current_user, db)
    household_id = await ensure_current_user_household(db, current_user)

    target_month_key = budget.month_key
    if budget_in.month_key is not None:
        try:
            target_month_key = budget_service.normalize_month_key(budget_in.month_key)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    if budget_in.budget_amount is not None:
        budget.budget_amount = validate_budget_amount(budget_in.budget_amount)
    budget.month_key = target_month_key

    collision_result = await db.execute(
        select(models.CategoryBudget).where(
            models.CategoryBudget.household_id == household_id,
            models.CategoryBudget.category_id == budget.category_id,
            models.CategoryBudget.month_key == target_month_key,
            models.CategoryBudget.id != budget.id,
        )
    )
    if collision_result.scalars().first():
        raise HTTPException(status_code=409, detail="Budget already exists for this category and month.")

    await db.commit()

    items = await budget_service.get_budget_items(
        db,
        user_id=current_user.id,
        household_id=household_id,
        month_key=target_month_key,
    )
    for item in items:
        if item["id"] == int(budget.id):
            return item
    raise HTTPException(status_code=500, detail="Failed to load updated budget.")


async def delete_budget_route(
    *,
    budget_id: int,
    db: AsyncSession,
    current_user: models.User,
    get_mutable_budget: Callable[..., Awaitable[models.CategoryBudget]],
) -> dict[str, str]:
    budget = await get_mutable_budget(budget_id, current_user, db)
    await db.execute(models.CategoryBudget.__table__.delete().where(models.CategoryBudget.id == budget.id))
    await db.commit()
    return {"message": "Budget deleted"}


async def get_budget_summary_route(
    *,
    month: str | None,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
) -> dict:
    try:
        month_key = budget_service.normalize_month_key(month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    household_id = await ensure_current_user_household(db, current_user)
    summary = await budget_service.get_budget_summary(
        db,
        user_id=current_user.id,
        household_id=household_id,
        month_key=month_key,
    )
    return summary
