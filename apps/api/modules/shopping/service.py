"""Shopping list logic shared by the API and the bot commands."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models

MAX_OPEN_ITEMS = 300
NAME_MAX = 160

# "susu 2", "telur x12", "beras 5kg", "2 susu" -> name and quantity.
_TRAILING_QTY = re.compile(r"^(?P<name>.+?)\s+(?:x\s*)?(?P<qty>\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|pcs|biji|pek|botol|tin|kotak|ikat|helai|x)?)$", re.IGNORECASE)
_LEADING_QTY = re.compile(r"^(?P<qty>\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|pcs|biji|pek|botol|tin|kotak|ikat|helai|x)?)\s+(?P<name>.+)$", re.IGNORECASE)


def split_name_and_quantity(text: str) -> tuple[str, Optional[str]]:
    """Pull a quantity off either end of what the user typed."""
    raw = re.sub(r"\s+", " ", (text or "").strip())
    match = _TRAILING_QTY.match(raw) or _LEADING_QTY.match(raw)
    if match:
        name = match.group("name").strip(" ,-")
        qty = re.sub(r"(\d)([a-zA-Z])", r"\1 \2", match.group("qty").strip().replace(" ", ""))
        if name:
            return name[:NAME_MAX], qty[:40]
    return raw[:NAME_MAX], None


def serialize(item: models.ShoppingItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        "quantity": item.quantity,
        "note": item.note,
        "done": bool(item.done),
        "done_at": item.done_at.isoformat() if item.done_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


async def list_items(db: AsyncSession, user_id: str) -> list[models.ShoppingItem]:
    """To buy first (oldest first, so the order added is kept), then bought."""
    result = await db.execute(
        select(models.ShoppingItem)
        .where(models.ShoppingItem.user_id == user_id)
        .order_by(models.ShoppingItem.done.asc(), models.ShoppingItem.id.asc())
    )
    return list(result.scalars().all())


async def add_item(db: AsyncSession, user_id: str, name: str, quantity: Optional[str] = None, note: Optional[str] = None) -> models.ShoppingItem:
    """Add an item, or bring back one already on the list as bought."""
    name = re.sub(r"\s+", " ", (name or "").strip())[:NAME_MAX]
    if not name:
        raise ValueError("Name is required.")
    name = name[0].upper() + name[1:]
    open_count = await db.scalar(
        select(func.count()).select_from(models.ShoppingItem).where(models.ShoppingItem.user_id == user_id, models.ShoppingItem.done == False)  # noqa: E712
    )
    existing = (
        await db.execute(
            select(models.ShoppingItem).where(
                models.ShoppingItem.user_id == user_id,
                func.lower(models.ShoppingItem.name) == name.lower(),
            ).order_by(models.ShoppingItem.done.asc(), models.ShoppingItem.id.desc()).limit(1)
        )
    ).scalars().first()
    if existing and not existing.done:
        # Already waiting to be bought: update the amount rather than repeat it.
        if quantity:
            existing.quantity = quantity[:40]
        if note:
            existing.note = note[:200]
        return existing
    if int(open_count or 0) >= MAX_OPEN_ITEMS:
        raise ValueError(f"The list is full ({MAX_OPEN_ITEMS} items). Tick some off first.")
    if existing and existing.done:
        existing.done = False
        existing.done_at = None
        if quantity:
            existing.quantity = quantity[:40]
        if note:
            existing.note = note[:200]
        return existing
    item = models.ShoppingItem(user_id=user_id, name=name, quantity=(quantity or None), note=((note or "").strip()[:200] or None))
    db.add(item)
    await db.flush()
    return item


async def find_item(db: AsyncSession, user_id: str, ref: str, *, done: bool) -> Optional[models.ShoppingItem]:
    """An item by its number in the list shown (1 = first to buy) or by name."""
    ref = (ref or "").strip()
    if not ref:
        return None
    items = [i for i in await list_items(db, user_id) if bool(i.done) == done]
    if ref.isdigit():
        index = int(ref) - 1
        return items[index] if 0 <= index < len(items) else None
    lowered = ref.lower()
    exact = next((i for i in items if i.name.lower() == lowered), None)
    if exact:
        return exact
    partial = [i for i in items if lowered in i.name.lower()]
    return partial[0] if len(partial) == 1 else None


def set_done(item: models.ShoppingItem, done: bool) -> None:
    item.done = done
    item.done_at = datetime.utcnow() if done else None


async def clear_done(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        delete(models.ShoppingItem).where(models.ShoppingItem.user_id == user_id, models.ShoppingItem.done == True)  # noqa: E712
    )
    return int(result.rowcount or 0)
