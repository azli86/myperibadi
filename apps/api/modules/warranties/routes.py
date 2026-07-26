"""Waranti Saya HTTP routes."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from modules.warranties import queries, service
from modules.warranties.schemas import ClaimCreate, ClaimUpdate, DeviceCreate, DeviceUpdate


def create_warranties_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/warranties", tags=["warranties"])

    @router.get("")
    async def list_devices(
        search: Optional[str] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await queries.list_devices(db, user_id=current_user.id, search=search)
        return [service.serialize_device(r) for r in rows]

    @router.post("")
    async def create_device(
        payload: DeviceCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_device(db, current_user=current_user, payload=payload)
        return service.serialize_device(row)

    @router.get("/attachments/{attachment_id}/file")
    async def get_attachment_file(
        attachment_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload, content_type, file_name = await service.get_attachment_bytes(
            db, current_user=current_user, attachment_id=attachment_id
        )
        return Response(
            content=payload,
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )

    @router.delete("/attachments/{attachment_id}")
    async def delete_attachment(
        attachment_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_attachment(db, current_user=current_user, attachment_id=attachment_id)
        return {"ok": True}

    @router.get("/{device_id}")
    async def get_device(
        device_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
        return service.serialize_device(row)

    @router.patch("/{device_id}")
    async def update_device(
        device_id: int,
        payload: DeviceUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_device(
            db, current_user=current_user, device_id=device_id, payload=payload
        )
        return service.serialize_device(row)

    @router.delete("/{device_id}")
    async def delete_device(
        device_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_device(db, current_user=current_user, device_id=device_id)
        return {"ok": True}

    @router.post("/{device_id}/image")
    async def upload_image(
        device_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.upload_device_image(
            db, current_user=current_user, device_id=device_id, file=file
        )
        return service.serialize_device(row)

    @router.get("/{device_id}/image")
    async def get_image(
        device_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload, content_type, file_name = await service.get_device_image_bytes(
            db, current_user=current_user, device_id=device_id
        )
        return Response(
            content=payload,
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )

    @router.delete("/{device_id}/image")
    async def delete_image(
        device_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.delete_device_image(
            db, current_user=current_user, device_id=device_id
        )
        return service.serialize_device(row)

    @router.post("/{device_id}/receipt")
    async def upload_receipt(
        device_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.upload_receipt(
            db, current_user=current_user, device_id=device_id, file=file
        )
        return service.serialize_device(row)

    @router.get("/{device_id}/claims")
    async def list_claims(
        device_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await queries.get_device_or_404(db, device_id=device_id, user_id=current_user.id)
        rows = await queries.list_claims(db, device_id=device_id, user_id=current_user.id)
        return [service.serialize_claim(r) for r in rows]

    @router.post("/{device_id}/claims")
    async def create_claim(
        device_id: int,
        payload: ClaimCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_claim(
            db, current_user=current_user, device_id=device_id, payload=payload
        )
        return service.serialize_claim(row)

    @router.patch("/{device_id}/claims/{claim_id}")
    async def update_claim(
        device_id: int,
        claim_id: int,
        payload: ClaimUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_claim(
            db,
            current_user=current_user,
            device_id=device_id,
            claim_id=claim_id,
            payload=payload,
        )
        return service.serialize_claim(row)

    @router.delete("/{device_id}/claims/{claim_id}")
    async def delete_claim(
        device_id: int,
        claim_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_claim(
            db, current_user=current_user, device_id=device_id, claim_id=claim_id
        )
        return {"ok": True}

    @router.post("/{device_id}/claims/{claim_id}/attachment")
    async def upload_claim_attachment(
        device_id: int,
        claim_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.upload_claim_attachment(
            db,
            current_user=current_user,
            device_id=device_id,
            claim_id=claim_id,
            file=file,
        )
        return service.serialize_claim(row)

    return router
