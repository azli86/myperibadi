"""My Places HTTP routes."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from modules.places import service
from modules.places.schemas import (
    PlaceCategoryCreate,
    PlaceCategoryUpdate,
    PlaceCreate,
    PlaceShareGroupCreate,
    PlaceShareGroupUpdate,
    PlaceShareWhatsApp,
    PlaceUpdate,
)


def create_places_router(
    *,
    get_current_user: Callable[..., Any],
    send_worker_message: Callable[..., Any] | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/places", tags=["places"])

    @router.get("/categories")
    async def list_categories(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await service.list_categories(db, user_id=current_user.id)
        return [service.serialize_category(row) for row in rows]

    @router.post("/categories")
    async def create_category(
        payload: PlaceCategoryCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_category(
            db,
            user_id=current_user.id,
            name=payload.name,
            color=payload.color,
        )
        return service.serialize_category(row)

    @router.patch("/categories/{category_id}")
    async def update_category(
        category_id: int,
        payload: PlaceCategoryUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_category(
            db,
            user_id=current_user.id,
            category_id=category_id,
            name=payload.name,
            color=payload.color,
            sort_order=payload.sort_order,
        )
        return service.serialize_category(row)

    @router.delete("/categories/{category_id}")
    async def delete_category(
        category_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_category(db, user_id=current_user.id, category_id=category_id)
        return {"ok": True}

    # ── share groups (convoi) ────────────────────────────────────────────────
    @router.get("/groups")
    async def list_share_groups(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await service.list_share_groups(db, user_id=current_user.id)
        return [service.serialize_share_group(row) for row in rows]

    @router.post("/groups")
    async def create_share_group(
        payload: PlaceShareGroupCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_share_group(
            db,
            user_id=current_user.id,
            name=payload.name,
            phones=payload.phones,
        )
        return service.serialize_share_group(row)

    @router.patch("/groups/{group_id}")
    async def update_share_group(
        group_id: int,
        payload: PlaceShareGroupUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_share_group(
            db,
            user_id=current_user.id,
            group_id=group_id,
            name=payload.name,
            phones=payload.phones,
        )
        return service.serialize_share_group(row)

    @router.delete("/groups/{group_id}")
    async def delete_share_group(
        group_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_share_group(db, user_id=current_user.id, group_id=group_id)
        return {"ok": True}

    @router.get("")
    async def list_places(
        category_id: Optional[int] = Query(default=None),
        limit: int = Query(default=500, ge=1, le=2000),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await service.list_places(
            db,
            user_id=current_user.id,
            category_id=category_id,
            limit=limit,
        )
        return [service.serialize_place(row) for row in rows]

    @router.post("")
    async def create_place(
        payload: PlaceCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_place(
            db,
            user_id=current_user.id,
            title=payload.title,
            latitude=payload.latitude,
            longitude=payload.longitude,
            category_id=payload.category_id,
            category_name=payload.category_name,
            location_name=payload.location_name,
            source_channel=payload.source_channel or "web",
        )
        return service.serialize_place(row)

    @router.get("/{place_id}")
    async def get_place(
        place_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.get_place_or_404(db, user_id=current_user.id, place_id=place_id)
        return service.serialize_place(row)

    @router.patch("/{place_id}")
    async def update_place(
        place_id: int,
        payload: PlaceUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        data = payload.model_dump(exclude_unset=True)
        clear_category = "category_id" in data and data.get("category_id") is None and "category_name" not in data
        row = await service.update_place(
            db,
            user_id=current_user.id,
            place_id=place_id,
            title=payload.title,
            latitude=payload.latitude,
            longitude=payload.longitude,
            category_id=payload.category_id,
            category_name=payload.category_name,
            location_name=payload.location_name,
            clear_category=clear_category,
        )
        return service.serialize_place(row)

    @router.delete("/{place_id}")
    async def delete_place(
        place_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_place(db, user_id=current_user.id, place_id=place_id)
        return {"ok": True}

    @router.post("/{place_id}/share-whatsapp")
    async def share_place_whatsapp(
        place_id: int,
        payload: PlaceShareWhatsApp,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        from fastapi import HTTPException

        if send_worker_message is None:
            raise HTTPException(status_code=503, detail="WhatsApp send not configured")
        return await service.share_place_whatsapp(
            db,
            user_id=current_user.id,
            place_id=place_id,
            phones=payload.phones or [],
            group_id=payload.group_id,
            send_worker_message=send_worker_message,
        )

    return router
