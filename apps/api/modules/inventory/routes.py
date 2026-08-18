"""Barang Saya HTTP routes — factory avoids circular imports with main.get_current_user."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
import storage_service
from modules.inventory import queries, service
from modules.inventory.schemas import (
    ContainerCreate, ContainerUpdate, ItemCreate, ItemMove, ItemQuantity, ItemStatus,
    ItemUpdate, LocationCreate, LocationUpdate,
)

def create_inventory_router(*, get_current_user: Callable[..., Any], publish_realtime: Callable[..., None]) -> APIRouter:
    router = APIRouter(prefix="/inventory", tags=["inventory"])

    # ── items ────────────────────────────────────────────────────────────────
    @router.get("/items")
    async def list_items(
        q: Optional[str] = Query(default=None),
        status: Optional[str] = Query(default=None),
        category: Optional[str] = Query(default=None),
        location_id: Optional[int] = Query(default=None),
        container_id: Optional[int] = Query(default=None),
        no_location: bool = Query(default=False),
        has_image: Optional[bool] = Query(default=None),
        has_transaction: Optional[bool] = Query(default=None),
        has_warranty: Optional[bool] = Query(default=None),
        sort: str = Query(default="recent_updated"),
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows, total = await queries.search_items(
            db, user_id=current_user.id, query=q, status=status, category=category,
            location_id=location_id, container_id=container_id, no_location=no_location,
            has_image=has_image, has_transaction=has_transaction, has_warranty=has_warranty,
            sort=sort, limit=limit, offset=offset,
        )
        loc_ids = {r.location_id for r in rows if r.location_id}
        cont_ids = {r.container_id for r in rows if r.container_id}
        loc_names = {}
        if loc_ids:
            res = await db.execute(
                select(models.InventoryLocation.id, models.InventoryLocation.name).where(
                    models.InventoryLocation.id.in_(loc_ids),
                    models.InventoryLocation.user_id == current_user.id,
                )
            )
            loc_names = {r[0]: r[1] for r in res}
        cont_names = {}
        if cont_ids:
            res = await db.execute(
                select(models.InventoryContainer.id, models.InventoryContainer.name).where(
                    models.InventoryContainer.id.in_(cont_ids),
                    models.InventoryContainer.user_id == current_user.id,
                )
            )
            cont_names = {r[0]: r[1] for r in res}
        items = []
        for r in rows:
            path = await queries.location_full_path(db, location_id=r.location_id, user_id=current_user.id) if r.location_id else None
            items.append(service.serialize_item(r, location_path=path, container_name=cont_names.get(r.container_id)))
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    @router.post("/items")
    async def create_item(
        payload: ItemCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_item(db, current_user=current_user, payload=payload)
        path = await queries.location_full_path(db, location_id=row.location_id, user_id=current_user.id)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_item(row, location_path=path)

    @router.get("/items/{item_id}")
    async def get_item(
        item_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
        path = await queries.location_full_path(db, location_id=row.location_id, user_id=current_user.id)
        cont_name = None
        if row.container_id:
            cont = await queries.get_container_or_404(db, container_id=row.container_id, user_id=current_user.id)
            cont_name = cont.name
        return service.serialize_item(row, location_path=path, container_name=cont_name)

    @router.patch("/items/{item_id}")
    async def update_item(
        item_id: int,
        payload: ItemUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_item(db, current_user=current_user, item_id=item_id, payload=payload)
        path = await queries.location_full_path(db, location_id=row.location_id, user_id=current_user.id)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_item(row, location_path=path)

    @router.delete("/items/{item_id}")
    async def delete_item(
        item_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_item(db, current_user=current_user, item_id=item_id)
        publish_realtime(current_user.id, "changed", "inventory")
        return {"detail": "Item dipadam."}

    @router.post("/items/{item_id}/move")
    async def move_item(
        item_id: int,
        payload: ItemMove,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.move_item(db, current_user=current_user, item_id=item_id, payload=payload)
        path = await queries.location_full_path(db, location_id=row.location_id, user_id=current_user.id)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_item(row, location_path=path)

    @router.post("/items/{item_id}/quantity")
    async def change_quantity(
        item_id: int,
        payload: ItemQuantity,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.change_quantity(db, current_user=current_user, item_id=item_id, payload=payload)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_item(row)

    @router.post("/items/{item_id}/status")
    async def change_status(
        item_id: int,
        payload: ItemStatus,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.change_status(db, current_user=current_user, item_id=item_id, payload=payload)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_item(row)

    @router.get("/items/{item_id}/movements")
    async def list_item_movements(
        item_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await service.list_movements(db, current_user=current_user, item_id=item_id)
        return [service.serialize_movement(r) for r in rows]

    @router.post("/items/{item_id}/image")
    async def upload_item_image(
        item_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
        payload = await file.read()
        try:
            mime_type, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not mime_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Gambar barang mesti fail imej.")
        from uuid import uuid4
        safe_stem = "".join(ch if ch.isalnum() else "_" for ch in (file.filename or "item")[:60]) or "item"
        object_key = f"inventory/{current_user.id}/{item_id}/{uuid4().hex}-{safe_stem}{extension}"
        try:
            storage_service.upload_receipt_object(object_key, payload, mime_type, filename=file.filename)
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Upload failed.") from exc
        row.image_object_key = object_key
        await db.commit()
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_item(row)

    @router.get("/items/{item_id}/image")
    async def get_item_image(
        item_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
        if not row.image_object_key:
            raise HTTPException(status_code=404, detail="Gambar tidak dijumpai.")
        try:
            payload, content_type = storage_service.download_receipt_object(row.image_object_key)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="File not found.") from exc
        return Response(content=payload, media_type=content_type or "image/jpeg",
                        headers={"Content-Disposition": 'inline; filename="item-image"'})

    # ── summary ──────────────────────────────────────────────────────────────
    @router.get("/summary")
    async def summary(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await queries.get_summary(db, user_id=current_user.id)

    # ── locations ────────────────────────────────────────────────────────────
    @router.get("/locations")
    async def list_locations(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await queries.list_locations(db, user_id=current_user.id)
        # aggregate item counts per location (direct)
        counts = (await db.execute(
            select(
                models.InventoryItem.location_id,
                func.count(models.InventoryItem.id),
                func.coalesce(func.sum(models.InventoryItem.quantity), 0),
            ).where(
                models.InventoryItem.user_id == current_user.id,
                models.InventoryItem.deleted_at.is_(None),
                models.InventoryItem.location_id.is_not(None),
            ).group_by(models.InventoryItem.location_id)
        )).all()
        count_map = {c[0]: (int(c[1]), int(c[2])) for c in counts}
        children = (await db.execute(
            select(models.InventoryLocation.parent_id, func.count(models.InventoryLocation.id)).where(
                models.InventoryLocation.user_id == current_user.id,
                models.InventoryLocation.deleted_at.is_(None),
                models.InventoryLocation.parent_id.is_not(None),
            ).group_by(models.InventoryLocation.parent_id)
        )).all()
        child_map = {c[0]: int(c[1]) for c in children}
        result = []
        for r in rows:
            types, units = count_map.get(r.id, (0, 0))
            result.append(service.serialize_location(r, item_types=types, item_units=units, child_count=child_map.get(r.id, 0)))
        return result

    @router.post("/locations")
    async def create_location(
        payload: LocationCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_location(db, current_user=current_user, payload=payload)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_location(row)

    @router.patch("/locations/{location_id}")
    async def update_location(
        location_id: int,
        payload: LocationUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_location(db, current_user=current_user, location_id=location_id, payload=payload)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_location(row)

    @router.delete("/locations/{location_id}")
    async def delete_location(
        location_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_location(db, current_user=current_user, location_id=location_id)
        publish_realtime(current_user.id, "changed", "inventory")
        return {"detail": "Lokasi dipadam."}

    @router.get("/locations/{location_id}/items")
    async def list_location_items(
        location_id: int,
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows, total = await queries.search_items(
            db, user_id=current_user.id, location_id=location_id, limit=limit, offset=offset
        )
        path = await queries.location_full_path(db, location_id=location_id, user_id=current_user.id)
        return {
            "location_path": path,
            "items": [service.serialize_item(r, location_path=path) for r in rows],
            "total": total,
        }

    # ── containers ───────────────────────────────────────────────────────────
    @router.get("/containers")
    async def list_containers(
        location_id: Optional[int] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await queries.list_containers(db, user_id=current_user.id, location_id=location_id)
        counts = (await db.execute(
            select(
                models.InventoryItem.container_id,
                func.count(models.InventoryItem.id),
                func.coalesce(func.sum(models.InventoryItem.quantity), 0),
            ).where(
                models.InventoryItem.user_id == current_user.id,
                models.InventoryItem.deleted_at.is_(None),
                models.InventoryItem.container_id.is_not(None),
            ).group_by(models.InventoryItem.container_id)
        )).all()
        count_map = {c[0]: (int(c[1]), int(c[2])) for c in counts}
        result = []
        for r in rows:
            types, units = count_map.get(r.id, (0, 0))
            path = await queries.location_full_path(db, location_id=r.location_id, user_id=current_user.id) if r.location_id else None
            result.append(service.serialize_container(r, item_types=types, item_units=units, location_path=path))
        return result

    @router.post("/containers")
    async def create_container(
        payload: ContainerCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_container(db, current_user=current_user, payload=payload)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_container(row)

    @router.patch("/containers/{container_id}")
    async def update_container(
        container_id: int,
        payload: ContainerUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_container(db, current_user=current_user, container_id=container_id, payload=payload)
        publish_realtime(current_user.id, "changed", "inventory")
        return service.serialize_container(row)

    @router.delete("/containers/{container_id}")
    async def delete_container(
        container_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_container(db, current_user=current_user, container_id=container_id)
        publish_realtime(current_user.id, "changed", "inventory")
        return {"detail": "Bekas dipadam."}

    @router.get("/containers/{container_id}/items")
    async def list_container_items(
        container_id: int,
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        container = await queries.get_container_or_404(db, container_id=container_id, user_id=current_user.id)
        rows, total = await queries.search_items(
            db, user_id=current_user.id, container_id=container_id, limit=limit, offset=offset
        )
        path = await queries.location_full_path(db, location_id=container.location_id, user_id=current_user.id)
        return {
            "container_name": container.name,
            "location_path": path,
            "items": [service.serialize_item(r, location_path=path, container_name=container.name) for r in rows],
            "total": total,
        }

    return router
