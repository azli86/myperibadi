"""Business logic for My Event."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import storage_service
from modules.events import queries, storage
from modules.events.schemas import EventCreate, EventUpdate


def _parse_date(value: Optional[str], field: str = "date") -> Optional[date]:
    if value is None or value == "":
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD") from exc


def _fmt_date(value: Optional[date | datetime]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().strftime("%Y-%m-%d")
    return value.strftime("%Y-%m-%d")


def _num(value: Any) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def compute_event_status(row: models.Event, *, today: Optional[date] = None) -> str:
    if row.status and row.status not in ("", "upcoming"):
        return row.status
    ref = today or date.today()
    if row.end_date and row.end_date < ref:
        return "ended"
    if row.end_date and row.end_date == ref:
        return "today"
    return "upcoming"


def serialize_event(row: models.Event) -> dict:
    return {
        "id": int(row.id),
        "name": row.name,
        "icon_name": row.icon_name,
        "start_date": _fmt_date(row.start_date),
        "end_date": _fmt_date(row.end_date),
        "currency": row.currency or "RM",
        "wallet_id": int(row.wallet_id) if row.wallet_id else None,
        "budget": _num(row.budget),
        "notes": row.notes,
        "status": compute_event_status(row),
        "has_image": bool(row.image_object_key),
        "image_url": storage_service.public_cdn_url(row.image_object_key),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def create_event(
    db: AsyncSession,
    *,
    current_user: models.User,
    payload: EventCreate,
) -> models.Event:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Event name is required.")
    end_date = _parse_date(payload.end_date, "end_date")
    start_date = _parse_date(payload.start_date, "start_date")
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date cannot be after end date.")
    if payload.budget is not None and float(payload.budget) < 0:
        raise HTTPException(status_code=400, detail="Budget cannot be negative.")

    currency = (payload.currency or "").strip() or "RM"
    wallet_id = payload.wallet_id
    if wallet_id:
        await queries.get_wallet_or_404(db, wallet_id=wallet_id, user_id=current_user.id)
        wallet = await db.get(models.Wallet, wallet_id)
        if wallet and wallet.currency:
            currency = wallet.currency

    household_id = await queries.ensure_household(db, current_user)
    row = models.Event(
        user_id=current_user.id,
        household_id=household_id,
        name=name,
        icon_name=(payload.icon_name or "").strip() or None,
        start_date=start_date,
        end_date=end_date,
        currency=currency,
        wallet_id=wallet_id,
        budget=payload.budget,
        notes=(payload.notes or "").strip() or None,
        status="upcoming",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_event(
    db: AsyncSession,
    *,
    current_user: models.User,
    event_id: int,
    payload: EventUpdate,
) -> models.Event:
    row = await queries.get_event_or_404(db, event_id=event_id, user_id=current_user.id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Event name is required.")
        row.name = name

    if "icon_name" in data:
        row.icon_name = (payload.icon_name or "").strip() or None
    if "notes" in data:
        row.notes = (payload.notes or "").strip() or None

    if "start_date" in data:
        row.start_date = _parse_date(payload.start_date, "start_date")
    if "end_date" in data:
        row.end_date = _parse_date(payload.end_date, "end_date")
    if row.start_date and row.end_date and row.start_date > row.end_date:
        raise HTTPException(status_code=400, detail="Start date cannot be after end date.")

    if "budget" in data:
        if payload.budget is not None and float(payload.budget) < 0:
            raise HTTPException(status_code=400, detail="Budget cannot be negative.")
        row.budget = payload.budget

    if "currency" in data:
        row.currency = (payload.currency or "").strip() or row.currency or "RM"

    if "wallet_id" in data:
        wallet_id = payload.wallet_id
        if wallet_id:
            await queries.get_wallet_or_404(db, wallet_id=wallet_id, user_id=current_user.id)
            wallet = await db.get(models.Wallet, wallet_id)
            if wallet and wallet.currency:
                row.currency = wallet.currency
        row.wallet_id = wallet_id

    if "status" in data:
        row.status = (payload.status or "upcoming").strip() or "upcoming"

    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def delete_event(
    db: AsyncSession,
    *,
    current_user: models.User,
    event_id: int,
) -> None:
    row = await queries.get_event_or_404(db, event_id=event_id, user_id=current_user.id)
    if row.image_object_key:
        try:
            storage.delete(row.image_object_key)
        except Exception:
            pass
    await db.delete(row)
    await db.commit()


async def upload_event_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    event_id: int,
    file: UploadFile,
) -> models.Event:
    event = await queries.get_event_or_404(db, event_id=event_id, user_id=current_user.id)
    payload = await file.read()
    try:
        mime_type, extension = storage.validate_file(file.filename, file.content_type, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not mime_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Event image must be an image file.")
    object_key = storage.build_object_key(
        user_id=current_user.id,
        event_id=int(event.id),
        filename=file.filename,
        extension=extension,
    )
    try:
        storage.upload(object_key, payload, mime_type, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc
    old_key = event.image_object_key
    event.image_object_key = object_key
    event.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(event)
    if old_key and old_key != object_key:
        try:
            storage.delete(old_key)
        except Exception:
            pass
    return event


async def get_event_image_bytes(
    db: AsyncSession,
    *,
    current_user: models.User,
    event_id: int,
) -> tuple[bytes, str, str]:
    event = await queries.get_event_or_404(db, event_id=event_id, user_id=current_user.id)
    if not event.image_object_key:
        raise HTTPException(status_code=404, detail="Event image not found.")
    try:
        payload, content_type = storage.download(event.image_object_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"File not found: {exc}") from exc
    return payload, content_type or "image/jpeg", "event-image"


async def delete_event_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    event_id: int,
) -> models.Event:
    event = await queries.get_event_or_404(db, event_id=event_id, user_id=current_user.id)
    if event.image_object_key:
        try:
            storage.delete(event.image_object_key)
        except Exception:
            pass
        event.image_object_key = None
        event.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(event)
    return event
