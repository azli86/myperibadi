"""My BNPL HTTP routes."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
import schemas
from modules.bnpl import queries, service
from schemas import BnplCreate, BnplPayCreate, BnplUpdate

def create_bnpl_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/bnpl", tags=["bnpl"])

    @router.get("")
    async def list_bnpl(
        include_settled: bool = Query(default=False),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await queries.list_bnpl(db, user_id=current_user.id, include_settled=include_settled)
        out = []
        for r in rows:
            paid = await queries.count_payments(db, bnpl_id=r.id)
            out.append(service.serialize_bnpl(r, category_name=await service._category_name(db, r.category_id), paid_amount=paid))
        return out

    @router.post("")
    async def create_bnpl(
        payload: BnplCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_bnpl(db, current_user=current_user, payload=payload)
        return service.serialize_bnpl(row, category_name=await service._category_name(db, row.category_id))

    @router.get("/{bnpl_id}")
    async def get_bnpl(
        bnpl_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_bnpl_or_404(db, bnpl_id=bnpl_id, user_id=current_user.id)
        paid = await queries.count_payments(db, bnpl_id=row.id)
        return service.serialize_bnpl(row, category_name=await service._category_name(db, row.category_id), paid_amount=paid)

    @router.patch("/{bnpl_id}")
    async def update_bnpl(
        bnpl_id: int,
        payload: BnplUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_bnpl(db, current_user=current_user, bnpl_id=bnpl_id, payload=payload)
        return service.serialize_bnpl(row, category_name=await service._category_name(db, row.category_id))

    @router.delete("/{bnpl_id}")
    async def delete_bnpl(
        bnpl_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_bnpl(db, current_user=current_user, bnpl_id=bnpl_id)
        return {"ok": True}

    @router.post("/{bnpl_id}/pay")
    async def pay_bnpl(
        bnpl_id: int,
        payload: BnplPayCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.pay_bnpl(
            db,
            current_user=current_user,
            bnpl_id=bnpl_id,
            wallet_id=payload.wallet_id,
            amount=payload.amount,
            notes=payload.notes,
        )
        paid = await queries.count_payments(db, bnpl_id=row.id)
        return service.serialize_bnpl(row, category_name=await service._category_name(db, row.category_id), paid_amount=paid)

    @router.post("/{bnpl_id}/image")
    async def upload_image(
        bnpl_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.upload_bnpl_image(
            db, current_user=current_user, bnpl_id=bnpl_id, file=file
        )
        return service.serialize_bnpl(row, category_name=await service._category_name(db, row.category_id))

    @router.get("/{bnpl_id}/image")
    async def get_image(
        bnpl_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload, content_type, file_name = await service.get_bnpl_image_bytes(
            db, current_user=current_user, bnpl_id=bnpl_id
        )
        return Response(
            content=payload,
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )

    @router.delete("/{bnpl_id}/image")
    async def delete_image(
        bnpl_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.delete_bnpl_image(
            db, current_user=current_user, bnpl_id=bnpl_id
        )
        return service.serialize_bnpl(row, category_name=await service._category_name(db, row.category_id))

    return router
