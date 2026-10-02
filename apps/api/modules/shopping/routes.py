"""Shopping list HTTP routes."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from modules.shopping import service


class ShoppingItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    quantity: Optional[str] = Field(default=None, max_length=40)
    note: Optional[str] = Field(default=None, max_length=200)


class ShoppingItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    quantity: Optional[str] = Field(default=None, max_length=40)
    note: Optional[str] = Field(default=None, max_length=200)
    done: Optional[bool] = None


def create_shopping_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/shopping", tags=["shopping"])

    async def overview(db: AsyncSession, user: models.User) -> dict[str, Any]:
        items = await service.list_items(db, user.id)
        return {
            "items": [service.serialize(i) for i in items],
            "open_count": sum(1 for i in items if not i.done),
            "done_count": sum(1 for i in items if i.done),
        }

    @router.get("")
    async def get_list(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await overview(db, current_user)

    @router.post("/items")
    async def add_item(
        body: ShoppingItemIn,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        try:
            await service.add_item(db, current_user.id, body.name, (body.quantity or "").strip() or None, body.note)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        await db.commit()
        return await overview(db, current_user)

    @router.patch("/items/{item_id}")
    async def update_item(
        item_id: int,
        body: ShoppingItemUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        item = await db.get(models.ShoppingItem, item_id)
        if not item or item.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Not found")
        if body.name is not None:
            name = body.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Name is required.")
            item.name = name
        if body.quantity is not None:
            item.quantity = body.quantity.strip() or None
        if body.note is not None:
            item.note = body.note.strip() or None
        if body.done is not None:
            service.set_done(item, body.done)
        await db.commit()
        return await overview(db, current_user)

    @router.delete("/items/{item_id}")
    async def delete_item(
        item_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        item = await db.get(models.ShoppingItem, item_id)
        if not item or item.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Not found")
        await db.delete(item)
        await db.commit()
        return await overview(db, current_user)

    @router.post("/clear-done")
    async def clear_done(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.clear_done(db, current_user.id)
        await db.commit()
        return await overview(db, current_user)

    return router
