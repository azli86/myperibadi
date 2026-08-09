from __future__ import annotations

from datetime import date
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas


async def get_categories_route(
    *,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    is_primary_reporting_excluded_signature: Callable[..., bool],
    current_business_date_fn: Callable[[], date],
) -> list[dict[str, object]]:
    household_id = await ensure_current_user_household(db, current_user)
    stmt = (
        select(
            models.Category.id,
            models.Category.name,
            models.Category.icon_name,
            models.Category.kind,
            models.Category.is_internal,
            models.Category.system_code,
            func.count(models.CategoryKeyword.id).label("keywordCount"),
        )
        .outerjoin(models.CategoryKeyword)
        .where(
            models.Category.household_id == household_id,
            models.Category.is_internal == False,
        )
        .group_by(models.Category.id)
    )
    result = await db.execute(stmt)
    rows = result.all()

    business_today = current_business_date_fn()
    month_start = business_today.replace(day=1)
    if month_start.month == 12:
        month_end = date(month_start.year + 1, 1, 1)
    else:
        month_end = date(month_start.year, month_start.month + 1, 1)

    txn_result = await db.execute(
        select(
            models.Transaction,
            models.Category.is_internal.label("category_is_internal"),
            models.Category.system_code.label("category_system_code"),
        )
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .where(
            models.Transaction.user_id == current_user.id,
            models.Transaction.category_id.is_not(None),
            models.Transaction.txn_date >= month_start,
            models.Transaction.txn_date < month_end,
        )
    )
    category_amount_month: dict[int, float] = {}
    category_count_month: dict[int, int] = {}
    for txn, category_is_internal, category_system_code in txn_result.all():
        if is_primary_reporting_excluded_signature(
            txn,
            category_system_code=category_system_code,
            category_is_internal=bool(category_is_internal),
        ):
            continue
        if txn.category_id is None:
            continue
        category_id = int(txn.category_id)
        category_amount_month[category_id] = category_amount_month.get(category_id, 0.0) + float(txn.amount)
        category_count_month[category_id] = category_count_month.get(category_id, 0) + 1

    return [
        {
            "id": row.id,
            "name": row.name,
            "icon_name": row.icon_name,
            "kind": row.kind,
            "keywordCount": row.keywordCount,
            "amountMonth": category_amount_month.get(int(row.id), 0.0),
            "transactionCountMonth": category_count_month.get(int(row.id), 0),
            "is_internal": row.is_internal,
            "system_code": row.system_code,
        }
        for row in rows
    ]


async def get_category_keywords_route(
    *,
    cat_id: int,
    db: AsyncSession,
    current_user: models.User,
    get_accessible_category: Callable[..., Awaitable[models.Category]],
) -> list[models.CategoryKeyword]:
    await get_accessible_category(cat_id, current_user, db)
    result = await db.execute(select(models.CategoryKeyword).where(models.CategoryKeyword.category_id == cat_id))
    return result.scalars().all()


async def create_category_route(
    *,
    cat_in: schemas.CategoryCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    validate_category_icon_name: Callable[[str | None], str | None],
    suggest_category_icon_name: Callable[[str | None, str | None], str],
    validate_category_kind: Callable[[str], str],
) -> dict[str, object]:
    name = (cat_in.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    household_id = await ensure_current_user_household(db, current_user)
    db_cat = models.Category(
        name=name,
        icon_name=validate_category_icon_name(cat_in.icon_name) or suggest_category_icon_name(name, cat_in.kind),
        kind=validate_category_kind(cat_in.kind),
        household_id=household_id,
        is_default=False,
    )
    db.add(db_cat)
    await db.commit()
    await db.refresh(db_cat)
    return {
        "id": db_cat.id,
        "name": db_cat.name,
        "icon_name": db_cat.icon_name,
        "kind": db_cat.kind,
        "keywordCount": 0,
    }


async def add_category_keyword_route(
    *,
    cat_id: int,
    kw_in: schemas.KeywordCreate,
    db: AsyncSession,
    current_user: models.User,
    get_mutable_category: Callable[..., Awaitable[models.Category]],
    validate_keyword_text: Callable[[str], str],
    validate_keyword_match_type: Callable[[str], str],
) -> models.CategoryKeyword:
    category = await get_mutable_category(cat_id, current_user, db)
    keyword = validate_keyword_text(kw_in.keyword)

    if keyword.lower() in models.MONTHLY_SALARY_LOCKED_KEYWORDS:
        raise HTTPException(
            status_code=400,
            detail="Kata kunci ini dikhaskan untuk kategori sistem Monthly Salary.",
        )
    if category.system_code == models.MONTHLY_SALARY_CATEGORY_CODE:
        raise HTTPException(
            status_code=400,
            detail="Kategori Monthly Salary tidak boleh tambah kata kunci lain.",
        )

    existing_kw = await db.execute(
        select(models.CategoryKeyword).where(
            models.CategoryKeyword.category_id == cat_id,
            func.lower(models.CategoryKeyword.keyword) == keyword.lower(),
        )
    )
    if existing_kw.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Kata kunci ini sudah wujud untuk kategori ini.")

    db_kw = models.CategoryKeyword(
        category_id=cat_id,
        keyword=keyword,
        match_type=validate_keyword_match_type(kw_in.match_type),
    )
    db.add(db_kw)
    await db.commit()
    await db.refresh(db_kw)
    return db_kw


async def delete_category_route(
    *,
    cat_id: int,
    db: AsyncSession,
    current_user: models.User,
    get_mutable_category: Callable[..., Awaitable[models.Category]],
) -> dict[str, str]:
    category = await get_mutable_category(cat_id, current_user, db)
    if category.system_code == models.MONTHLY_SALARY_CATEGORY_CODE:
        raise HTTPException(
            status_code=400,
            detail="Kategori Monthly Salary tidak boleh dipadam.",
        )

    # BNPL-linked categories cannot be deleted while they carry BNPL transactions.
    linked_bnpl = (await db.execute(
        select(models.Bnpl.id).where(models.Bnpl.category_id == cat_id).limit(1)
    )).scalar_one_or_none()
    if linked_bnpl is not None:
        txn_count = await db.scalar(
            select(func.count(models.Transaction.id)).where(
                models.Transaction.bnpl_id.is_not(None),
                models.Transaction.category_id == cat_id,
            )
        )
        if txn_count:
            raise HTTPException(
                status_code=400,
                detail="Kategori tidak boleh dipadam kerana ia dilink dengan transaksi BNPL.",
            )

    await db.execute(models.CategoryKeyword.__table__.delete().where(models.CategoryKeyword.category_id == cat_id))
    await db.execute(models.CategoryBudget.__table__.delete().where(models.CategoryBudget.category_id == cat_id))
    await db.execute(models.Category.__table__.delete().where(models.Category.id == cat_id))
    await db.commit()
    return {"message": "Category deleted"}


async def delete_keyword_route(
    *,
    kw_id: int,
    db: AsyncSession,
    current_user: models.User,
    get_mutable_keyword: Callable[..., Awaitable[models.CategoryKeyword]],
) -> dict[str, str]:
    await get_mutable_keyword(kw_id, current_user, db)
    kw_row = await db.execute(
        select(models.CategoryKeyword).where(models.CategoryKeyword.id == kw_id)
    )
    kw = kw_row.scalar_one_or_none()
    if kw is not None:
        cat_row = await db.execute(
            select(models.Category.system_code).where(models.Category.id == kw.category_id)
        )
        if (cat_row.scalar_one_or_none() or "") == models.MONTHLY_SALARY_CATEGORY_CODE:
            raise HTTPException(
                status_code=400,
                detail="Kata kunci Monthly Salary tidak boleh dipadam.",
            )
    await db.execute(models.CategoryKeyword.__table__.delete().where(models.CategoryKeyword.id == kw_id))
    await db.commit()
    return {"message": "Keyword deleted"}


async def update_category_route(
    *,
    cat_id: int,
    cat_in: schemas.CategoryBase,
    db: AsyncSession,
    current_user: models.User,
    get_mutable_category: Callable[..., Awaitable[models.Category]],
    validate_category_kind: Callable[[str], str],
    validate_category_icon_name: Callable[[str | None], str | None],
    suggest_category_icon_name: Callable[[str | None, str | None], str],
) -> dict[str, object]:
    category = await get_mutable_category(cat_id, current_user, db)
    name = (cat_in.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    category.name = name
    category.kind = validate_category_kind(cat_in.kind)
    category.icon_name = validate_category_icon_name(cat_in.icon_name) or suggest_category_icon_name(name, cat_in.kind)
    await db.commit()
    await db.refresh(category)

    keyword_count_result = await db.execute(
        select(func.count(models.CategoryKeyword.id)).where(models.CategoryKeyword.category_id == category.id)
    )
    keyword_count = keyword_count_result.scalar_one() or 0
    return {
        "id": category.id,
        "name": category.name,
        "icon_name": category.icon_name,
        "kind": category.kind,
        "keywordCount": keyword_count,
    }


async def update_keyword_route(
    *,
    kw_id: int,
    kw_in: schemas.KeywordBase,
    db: AsyncSession,
    current_user: models.User,
    get_mutable_keyword: Callable[..., Awaitable[models.CategoryKeyword]],
    validate_keyword_text: Callable[[str], str],
    validate_keyword_match_type: Callable[[str], str],
) -> dict[str, str]:
    kw = await get_mutable_keyword(kw_id, current_user, db)
    keyword = validate_keyword_text(kw_in.keyword)

    cat_row = await db.execute(
        select(models.Category.system_code).where(models.Category.id == kw.category_id)
    )
    if (cat_row.scalar_one_or_none() or "") == models.MONTHLY_SALARY_CATEGORY_CODE:
        raise HTTPException(
            status_code=400,
            detail="Kata kunci Monthly Salary tidak boleh diubah.",
        )
    if keyword.lower() in models.MONTHLY_SALARY_LOCKED_KEYWORDS:
        raise HTTPException(
            status_code=400,
            detail="Kata kunci ini dikhaskan untuk kategori sistem Monthly Salary.",
        )

    await db.execute(
        update(models.CategoryKeyword)
        .where(models.CategoryKeyword.id == kw_id)
        .values(keyword=keyword, match_type=validate_keyword_match_type(kw_in.match_type))
    )
    await db.commit()
    return {"message": "Updated"}

async def get_category_layout_route(
    *,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    **_: object,
) -> dict[str, object]:
    household_id = await ensure_current_user_household(db, current_user)
    row = (
        await db.execute(
            select(models.CategoryLayout.data).where(
                models.CategoryLayout.household_id == household_id
            )
        )
    ).scalar_one_or_none()
    return {"data": row or "{}"}


async def put_category_layout_route(
    *,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    payload: schemas.CategoryLayoutIn,
    **_: object,
) -> dict[str, str]:
    household_id = await ensure_current_user_household(db, current_user)
    existing = (
        await db.execute(
            select(models.CategoryLayout.household_id).where(
                models.CategoryLayout.household_id == household_id
            )
        )
    ).scalar_one_or_none()
    data = payload.data if payload.data else "{}"
    if existing is None:
        db.add(models.CategoryLayout(household_id=household_id, data=data))
    else:
        await db.execute(
            update(models.CategoryLayout)
            .where(models.CategoryLayout.household_id == household_id)
            .values(data=data)
        )
    await db.commit()
    return {"message": "Saved"}
