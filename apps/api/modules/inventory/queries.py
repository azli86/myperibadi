"""Barang Saya — read queries. Ownership always enforced by user_id."""

from __future__ import annotations

from typing import Any, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.inventory.schemas import STATUS_LABELS_BM

MAX_LOCATION_DEPTH = 6

async def get_item_or_404(db: AsyncSession, *, item_id: int, user_id: str) -> models.InventoryItem:
    row = (
        await db.execute(
            select(models.InventoryItem).where(
                models.InventoryItem.id == item_id,
                models.InventoryItem.user_id == user_id,
                models.InventoryItem.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai.")
    return row

async def get_location_or_404(db: AsyncSession, *, location_id: int, user_id: str) -> models.InventoryLocation:
    row = (
        await db.execute(
            select(models.InventoryLocation).where(
                models.InventoryLocation.id == location_id,
                models.InventoryLocation.user_id == user_id,
                models.InventoryLocation.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Lokasi tidak dijumpai.")
    return row

async def get_container_or_404(db: AsyncSession, *, container_id: int, user_id: str) -> models.InventoryContainer:
    row = (
        await db.execute(
            select(models.InventoryContainer).where(
                models.InventoryContainer.id == container_id,
                models.InventoryContainer.user_id == user_id,
                models.InventoryContainer.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Bekas tidak dijumpai.")
    return row

async def list_locations(db: AsyncSession, *, user_id: str) -> Sequence[models.InventoryLocation]:
    return (
        await db.execute(
            select(models.InventoryLocation)
            .where(models.InventoryLocation.user_id == user_id, models.InventoryLocation.deleted_at.is_(None))
            .order_by(models.InventoryLocation.name)
        )
    ).scalars().all()

async def list_containers(db: AsyncSession, *, user_id: str, location_id: Optional[int] = None) -> Sequence[models.InventoryContainer]:
    stmt = select(models.InventoryContainer).where(
        models.InventoryContainer.user_id == user_id,
        models.InventoryContainer.deleted_at.is_(None),
    )
    if location_id is not None:
        stmt = stmt.where(models.InventoryContainer.location_id == location_id)
    return (await db.execute(stmt.order_by(models.InventoryContainer.name))).scalars().all()

async def search_items(
    db: AsyncSession,
    *,
    user_id: str,
    query: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    location_id: Optional[int] = None,
    container_id: Optional[int] = None,
    no_location: bool = False,
    has_image: Optional[bool] = None,
    has_transaction: Optional[bool] = None,
    has_warranty: Optional[bool] = None,
    sort: str = "recent_updated",
    limit: int = 50,
    offset: int = 0,
) -> tuple[Sequence[models.InventoryItem], int]:
    stmt = select(models.InventoryItem).where(
        models.InventoryItem.user_id == user_id,
        models.InventoryItem.deleted_at.is_(None),
    )
    count_stmt = select(func.count(models.InventoryItem.id)).where(
        models.InventoryItem.user_id == user_id,
        models.InventoryItem.deleted_at.is_(None),
    )
    if query:
        like = f"%{query.strip().lower()}%"
        cond = (
            func.lower(models.InventoryItem.name).like(like)
            | func.lower(func.coalesce(models.InventoryItem.description, "")).like(like)
            | func.lower(func.coalesce(models.InventoryItem.category, "")).like(like)
            | func.lower(func.coalesce(models.InventoryItem.brand, "")).like(like)
            | func.lower(func.coalesce(models.InventoryItem.model, "")).like(like)
            | func.lower(func.coalesce(models.InventoryItem.serial_number, "")).like(like)
            | func.lower(func.coalesce(models.InventoryItem.notes, "")).like(like)
            | func.lower(func.coalesce(models.InventoryLocation.name, "")).like(like)
            | func.lower(func.coalesce(models.InventoryContainer.name, "")).like(like)
        )
        stmt = stmt.outerjoin(
            models.InventoryLocation,
            models.InventoryItem.location_id == models.InventoryLocation.id,
        ).outerjoin(
            models.InventoryContainer,
            models.InventoryItem.container_id == models.InventoryContainer.id,
        )
        count_stmt = count_stmt.outerjoin(
            models.InventoryLocation,
            models.InventoryItem.location_id == models.InventoryLocation.id,
        ).outerjoin(
            models.InventoryContainer,
            models.InventoryItem.container_id == models.InventoryContainer.id,
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if status:
        stmt = stmt.where(models.InventoryItem.status == status)
        count_stmt = count_stmt.where(models.InventoryItem.status == status)
    if category:
        stmt = stmt.where(func.lower(models.InventoryItem.category) == category.strip().lower())
        count_stmt = count_stmt.where(func.lower(models.InventoryItem.category) == category.strip().lower())
    if location_id is not None:
        stmt = stmt.where(models.InventoryItem.location_id == location_id)
        count_stmt = count_stmt.where(models.InventoryItem.location_id == location_id)
    if container_id is not None:
        stmt = stmt.where(models.InventoryItem.container_id == container_id)
        count_stmt = count_stmt.where(models.InventoryItem.container_id == container_id)
    if no_location:
        stmt = stmt.where(models.InventoryItem.location_id.is_(None))
        count_stmt = count_stmt.where(models.InventoryItem.location_id.is_(None))
    if has_image is not None:
        cond_img = models.InventoryItem.image_object_key.is_not(None)
        stmt = stmt.where(cond_img if has_image else ~cond_img)
        count_stmt = count_stmt.where(cond_img if has_image else ~cond_img)
    if has_transaction is not None:
        cond_txn = models.InventoryItem.transaction_id.is_not(None)
        stmt = stmt.where(cond_txn if has_transaction else ~cond_txn)
        count_stmt = count_stmt.where(cond_txn if has_transaction else ~cond_txn)
    if has_warranty is not None:
        cond_wty = models.InventoryItem.warranty_id.is_not(None)
        stmt = stmt.where(cond_wty if has_warranty else ~cond_wty)
        count_stmt = count_stmt.where(cond_wty if has_warranty else ~cond_wty)

    order_map = {
        "recent_created": models.InventoryItem.created_at.desc(),
        "recent_updated": models.InventoryItem.updated_at.desc(),
        "name_asc": models.InventoryItem.name.asc(),
        "quantity_desc": models.InventoryItem.quantity.desc(),
        "purchase_date_desc": models.InventoryItem.purchase_date.desc().nullslast(),
    }
    stmt = stmt.order_by(order_map.get(sort, order_map["recent_updated"])).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar() or 0)
    return rows, total

async def get_summary(db: AsyncSession, *, user_id: str) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(
                func.count(models.InventoryItem.id),
                func.coalesce(func.sum(models.InventoryItem.quantity), 0),
                func.count().filter(models.InventoryItem.status == "available"),
                func.count().filter(models.InventoryItem.status == "loaned"),
                func.count().filter(models.InventoryItem.status == "missing"),
                func.count().filter(models.InventoryItem.status == "damaged"),
                func.count().filter(models.InventoryItem.status == "disposed"),
                func.count().filter(models.InventoryItem.status == "used_up"),
                func.count().filter(models.InventoryItem.location_id.is_(None)),
            ).where(
                models.InventoryItem.user_id == user_id,
                models.InventoryItem.deleted_at.is_(None),
            )
        )
    ).one()
    return {
        "total_types": int(rows[0] or 0),
        "total_units": int(rows[1] or 0),
        "available": int(rows[2] or 0),
        "loaned": int(rows[3] or 0),
        "missing": int(rows[4] or 0),
        "damaged": int(rows[5] or 0),
        "disposed": int(rows[6] or 0),
        "used_up": int(rows[7] or 0),
        "no_location": int(rows[8] or 0),
    }

async def location_full_path(db: AsyncSession, *, location_id: Optional[int], user_id: str) -> Optional[str]:
    """Walk up the parent chain cycle-safely; returns 'Rumah → Stor → Rak 2'."""
    if location_id is None:
        return None
    names: list[str] = []
    seen: set[int] = set()
    current_id: Optional[int] = location_id
    while current_id is not None and current_id not in seen and len(names) <= MAX_LOCATION_DEPTH * 2:
        seen.add(current_id)
        row = (
            await db.execute(
                select(models.InventoryLocation.name, models.InventoryLocation.parent_id).where(
                    models.InventoryLocation.id == current_id,
                    models.InventoryLocation.user_id == user_id,
                    models.InventoryLocation.deleted_at.is_(None),
                )
            )
        ).first()
        if row is None:
            break
        names.append(row[0])
        current_id = row[1]
    return " → ".join(reversed(names)) if names else None
