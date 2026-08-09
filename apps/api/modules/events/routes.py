"""My Event HTTP routes."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from modules.events import queries, service
from modules.events.schemas import EventCreate, EventUpdate


def create_events_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/events", tags=["events"])

    @router.get("")
    async def list_events(
        search: Optional[str] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await queries.list_events(db, user_id=current_user.id, search=search)
        return [service.serialize_event(r) for r in rows]

    @router.post("")
    async def create_event(
        payload: EventCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_event(db, current_user=current_user, payload=payload)
        return service.serialize_event(row)

    @router.get("/{event_id}")
    async def get_event(
        event_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_event_or_404(db, event_id=event_id, user_id=current_user.id)
        return service.serialize_event(row)

    @router.patch("/{event_id}")
    async def update_event(
        event_id: int,
        payload: EventUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_event(
            db, current_user=current_user, event_id=event_id, payload=payload
        )
        return service.serialize_event(row)

    @router.delete("/{event_id}")
    async def delete_event(
        event_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_event(db, current_user=current_user, event_id=event_id)
        return {"ok": True}

    @router.post("/{event_id}/image")
    async def upload_image(
        event_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.upload_event_image(
            db, current_user=current_user, event_id=event_id, file=file
        )
        return service.serialize_event(row)

    @router.get("/{event_id}/image")
    async def get_image(
        event_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload, content_type, file_name = await service.get_event_image_bytes(
            db, current_user=current_user, event_id=event_id
        )
        return Response(
            content=payload,
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )

    @router.delete("/{event_id}/image")
    async def delete_image(
        event_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.delete_event_image(
            db, current_user=current_user, event_id=event_id
        )
        return service.serialize_event(row)

    return router
