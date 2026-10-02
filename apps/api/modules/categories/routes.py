from __future__ import annotations

from datetime import date
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import func, or_, select, update
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
            models.Category.is_default,
            func.count(func.distinct(models.CategoryKeyword.id)).label("keywordCount"),
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

    # How many records each category holds in all, so deleting one can say what moves.
    usage = {int(cid): int(n) for cid, n in (await db.execute(
        select(models.Transaction.category_id, func.count(models.Transaction.id))
        .where(models.Transaction.category_id.is_not(None))
        .group_by(models.Transaction.category_id)
        .where(models.Transaction.category_id.in_([int(r.id) for r in rows] or [0]))
    )).all()}

    return [
        {
            "id": row.id,
            "name": row.name,
            "icon_name": row.icon_name,
            "kind": row.kind,
            "keywordCount": row.keywordCount,
            "amountMonth": category_amount_month.get(int(row.id), 0.0),
            "transactionCountMonth": category_count_month.get(int(row.id), 0),
            "transactionCount": usage.get(int(row.id), 0),
            "is_default": bool(row.is_default),
            "is_internal": row.is_internal,
            "system_code": row.system_code,
        }
        for row in rows
    ]


async def _name_taken(db: AsyncSession, household_id: int, name: str, kind: str, exclude_id: int | None = None) -> bool:
    """Whether a visible category of the same kind already has this name, ignoring case and
    spacing. Two with one name cannot be told apart in a list, a budget or a bot reply."""
    stmt = select(models.Category.id).where(
        models.Category.household_id == household_id,
        models.Category.is_internal == False,
        models.Category.kind == kind,
        func.lower(func.trim(models.Category.name)) == name.strip().lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(models.Category.id != exclude_id)
    return (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None


async def _keyword_owner(db: AsyncSession, household_id: int, keyword: str, exclude_kw_id: int | None = None):
    """The category in this household that already uses the keyword, if any. The bot picks a
    category by keyword, so one word on two categories makes the choice arbitrary."""
    stmt = (
        select(models.Category.name, models.CategoryKeyword.id)
        .join(models.CategoryKeyword, models.CategoryKeyword.category_id == models.Category.id)
        .where(
            models.Category.household_id == household_id,
            models.Category.is_internal == False,
            func.lower(models.CategoryKeyword.keyword) == keyword.strip().lower(),
        )
    )
    if exclude_kw_id is not None:
        stmt = stmt.where(models.CategoryKeyword.id != exclude_kw_id)
    return (await db.execute(stmt.limit(1))).first()


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
    kind = validate_category_kind(cat_in.kind)
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Nama kategori terlalu panjang (maksimum 100 aksara).")
    if await _name_taken(db, household_id, name, kind):
        raise HTTPException(status_code=400, detail="Kategori dengan nama ini sudah wujud.")
    db_cat = models.Category(
        name=name,
        icon_name=validate_category_icon_name(cat_in.icon_name) or suggest_category_icon_name(name, cat_in.kind),
        kind=kind,
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

    owner = await _keyword_owner(db, category.household_id, keyword)
    if owner is not None:
        if owner.name == category.name:
            raise HTTPException(status_code=400, detail="Kata kunci ini sudah wujud untuk kategori ini.")
        raise HTTPException(
            status_code=400,
            detail=f"Kata kunci ini sudah digunakan oleh kategori “{owner.name}”. Satu kata kunci hanya boleh dimiliki satu kategori.",
        )

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
    reassign_to: int | None = None,
) -> dict[str, object]:
    """Delete a category, moving what uses it to another of the same kind.

    The records point at the category with a foreign key, so deleting one that is in use
    used to fail inside the database with a server error and nothing happened. Now the
    transactions, loans, subscriptions and BNPL plans on it move to `reassign_to`, or to the
    household's default category of that kind."""
    category = await get_mutable_category(cat_id, current_user, db)
    if category.system_code == models.MONTHLY_SALARY_CATEGORY_CODE:
        raise HTTPException(
            status_code=400,
            detail="Kategori Monthly Salary tidak boleh dipadam.",
        )
    if category.is_default:
        raise HTTPException(
            status_code=400,
            detail="Kategori lalai tidak boleh dipadam kerana ia menjadi tempat transaksi tanpa kategori.",
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

    used_by = {
        "transactions": await db.scalar(select(func.count(models.Transaction.id)).where(models.Transaction.category_id == cat_id)) or 0,
        "loans": await db.scalar(select(func.count(models.Loan.id)).where(models.Loan.category_id == cat_id)) or 0,
        "subscriptions": await db.scalar(select(func.count(models.Subscription.id)).where(models.Subscription.category_id == cat_id)) or 0,
        "bnpl": await db.scalar(select(func.count(models.Bnpl.id)).where(models.Bnpl.category_id == cat_id)) or 0,
    }
    in_use = sum(used_by.values())

    target_id: int | None = None
    if in_use:
        if reassign_to is not None:
            target = (await db.execute(
                select(models.Category).where(
                    models.Category.id == reassign_to,
                    models.Category.household_id == category.household_id,
                    models.Category.is_internal == False,
                )
            )).scalars().first()
            if target is None or target.id == cat_id:
                raise HTTPException(status_code=400, detail="Kategori tujuan tidak sah.")
            if target.kind != category.kind:
                raise HTTPException(status_code=400, detail="Kategori tujuan mesti jenis yang sama (belanja atau pendapatan).")
        else:
            target = (await db.execute(
                select(models.Category).where(
                    models.Category.household_id == category.household_id,
                    models.Category.kind == category.kind,
                    models.Category.is_default == True,
                    models.Category.is_internal == False,
                ).limit(1)
            )).scalars().first()
            if target is None:
                raise HTTPException(status_code=400, detail="Pilih kategori lain untuk menerima transaksi sedia ada.")
        target_id = int(target.id)
        for model in (models.Transaction, models.Loan, models.Subscription, models.Bnpl):
            await db.execute(update(model).where(model.category_id == cat_id).values(category_id=target_id))

    await db.execute(models.CategoryKeyword.__table__.delete().where(models.CategoryKeyword.category_id == cat_id))
    await db.execute(models.CategoryBudget.__table__.delete().where(models.CategoryBudget.category_id == cat_id))
    await db.execute(models.Category.__table__.delete().where(models.Category.id == cat_id))
    await db.commit()
    return {"message": "Category deleted", "moved_to": target_id, "moved": in_use}


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
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Nama kategori terlalu panjang (maksimum 100 aksara).")
    new_kind = validate_category_kind(cat_in.kind)
    if await _name_taken(db, category.household_id, name, new_kind, exclude_id=category.id):
        raise HTTPException(status_code=400, detail="Kategori dengan nama ini sudah wujud.")
    if new_kind != category.kind:
        # A category's kind is the kind of every transaction filed under it. Flipping it would
        # leave expenses under an income category (and the reverse), skewing every report.
        used = await db.scalar(select(func.count(models.Transaction.id)).where(models.Transaction.category_id == category.id)) or 0
        if used:
            raise HTTPException(status_code=400, detail=f"Jenis kategori tidak boleh ditukar kerana ia mempunyai {used} transaksi.")
        if category.system_code or category.is_default:
            raise HTTPException(status_code=400, detail="Jenis kategori ini tidak boleh ditukar.")

    category.name = name
    category.kind = new_kind
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

    category_row = (await db.execute(select(models.Category).where(models.Category.id == kw.category_id))).scalars().first()
    owner = await _keyword_owner(db, category_row.household_id, keyword, exclude_kw_id=kw_id)
    if owner is not None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Kata kunci ini sudah wujud untuk kategori ini."
                if owner.name == category_row.name
                else f"Kata kunci ini sudah digunakan oleh kategori “{owner.name}”. Satu kata kunci hanya boleh dimiliki satu kategori."
            ),
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
