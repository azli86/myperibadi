"""Split Bill HTTP routes."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
import storage_service
from modules.split_bills import queries, service
from modules.split_bills.schemas import (
    SplitBillCreate,
    SplitBillPaymentCreate,
    SplitBillUpdate,
)


def create_split_bills_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/split-bills", tags=["split-bills"])

    @router.get("")
    async def list_split_bills(
        search: Optional[str] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await queries.list_splits(db, user_id=current_user.id, search=search)
        return [service.serialize_split(r) for r in rows]

    @router.post("")
    async def create_split_bill(
        payload: SplitBillCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_split(db, current_user=current_user, payload=payload)
        return service.serialize_split_detail(row)

    @router.get("/{split_id}")
    async def get_split_bill(
        split_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_split_or_404(db, split_id=split_id, user_id=current_user.id)
        return service.serialize_split_detail(row)

    @router.patch("/{split_id}")
    async def update_split_bill(
        split_id: int,
        payload: SplitBillUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_split(
            db, current_user=current_user, split_id=split_id, payload=payload
        )
        return service.serialize_split_detail(row)

    @router.delete("/{split_id}")
    async def delete_split_bill(
        split_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_split(db, current_user=current_user, split_id=split_id)
        return {"ok": True}

    @router.post("/{split_id}/payments")
    async def record_payment(
        split_id: int,
        payload: SplitBillPaymentCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.record_payment(
            db, current_user=current_user, split_id=split_id, payload=payload
        )
        return service.serialize_split_detail(row)

    @router.post("/{split_id}/payments/{payment_id}/media")
    async def upload_payment_media(
        split_id: int,
        payment_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload = await file.read()
        row = await service.attach_payment_media(
            db,
            current_user=current_user,
            split_id=split_id,
            payment_id=payment_id,
            payload=payload,
            filename=file.filename,
            content_type=file.content_type,
        )
        return service.serialize_split_detail(row)

    @router.get("/{split_id}/payments/{payment_id}/media")
    async def get_payment_media(
        split_id: int,
        payment_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await queries.get_split_or_404(db, split_id=split_id, user_id=current_user.id)
        payment = next((p for p in row.payments if int(p.id) == payment_id), None)
        if not payment or not payment.media_object_key:
            raise HTTPException(status_code=404, detail="Payment media not found.")
        payload, content_type = storage_service.download_receipt_object(payment.media_object_key)
        return Response(
            content=payload,
            media_type=content_type or "image/jpeg",
            headers={"Content-Disposition": "inline; filename=payment-media"},
        )

    @router.post("/{split_id}/complete")
    async def mark_completed(
        split_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.mark_completed(
            db, current_user=current_user, split_id=split_id
        )
        return service.serialize_split_detail(row)

    return router
