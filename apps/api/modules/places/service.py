"""My Places business logic."""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import models


def category_name_key(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", (name or "").strip().lower())
    return cleaned[:120]


def serialize_category(row: models.PlaceCategory) -> dict:
    return {
        "id": int(row.id),
        "name": row.name,
        "color": row.color,
        "sort_order": int(row.sort_order or 0),
        "created_at": row.created_at,
    }


def serialize_place(row: models.Place) -> dict:
    category = row.category
    return {
        "id": int(row.id),
        "title": row.title,
        "latitude": float(row.latitude),
        "longitude": float(row.longitude),
        "location_name": row.location_name,
        "category_id": int(row.category_id) if row.category_id is not None else None,
        "category_name": category.name if category else None,
        "category_color": category.color if category else None,
        "source_channel": row.source_channel,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def list_categories(db: AsyncSession, *, user_id: str) -> list[models.PlaceCategory]:
    result = await db.execute(
        select(models.PlaceCategory)
        .where(models.PlaceCategory.user_id == user_id)
        .order_by(models.PlaceCategory.sort_order.asc(), models.PlaceCategory.name.asc())
    )
    return list(result.scalars().all())


async def get_or_create_category(
    db: AsyncSession,
    *,
    user_id: str,
    name: str,
    color: Optional[str] = None,
) -> models.PlaceCategory:
    cleaned_name = re.sub(r"\s+", " ", (name or "").strip())
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="Category name is required")
    key = category_name_key(cleaned_name)
    result = await db.execute(
        select(models.PlaceCategory).where(
            models.PlaceCategory.user_id == user_id,
            models.PlaceCategory.name_key == key,
        )
    )
    existing = result.scalars().first()
    if existing:
        return existing
    row = models.PlaceCategory(
        user_id=user_id,
        name=cleaned_name[:120],
        name_key=key,
        color=(color or None),
        sort_order=0,
    )
    db.add(row)
    await db.flush()
    return row


async def create_category(
    db: AsyncSession,
    *,
    user_id: str,
    name: str,
    color: Optional[str] = None,
) -> models.PlaceCategory:
    cleaned_name = re.sub(r"\s+", " ", (name or "").strip())
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="Category name is required")
    key = category_name_key(cleaned_name)
    result = await db.execute(
        select(models.PlaceCategory).where(
            models.PlaceCategory.user_id == user_id,
            models.PlaceCategory.name_key == key,
        )
    )
    if result.scalars().first():
        raise HTTPException(status_code=409, detail="Category already exists")
    row = models.PlaceCategory(
        user_id=user_id,
        name=cleaned_name[:120],
        name_key=key,
        color=(color or None),
        sort_order=0,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_category(
    db: AsyncSession,
    *,
    user_id: str,
    category_id: int,
    name: Optional[str] = None,
    color: Optional[str] = None,
    sort_order: Optional[int] = None,
) -> models.PlaceCategory:
    result = await db.execute(
        select(models.PlaceCategory).where(
            models.PlaceCategory.id == category_id,
            models.PlaceCategory.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    if name is not None:
        cleaned_name = re.sub(r"\s+", " ", name.strip())
        if not cleaned_name:
            raise HTTPException(status_code=400, detail="Category name is required")
        key = category_name_key(cleaned_name)
        clash = await db.execute(
            select(models.PlaceCategory).where(
                models.PlaceCategory.user_id == user_id,
                models.PlaceCategory.name_key == key,
                models.PlaceCategory.id != category_id,
            )
        )
        if clash.scalars().first():
            raise HTTPException(status_code=409, detail="Category already exists")
        row.name = cleaned_name[:120]
        row.name_key = key
    if color is not None:
        row.color = color or None
    if sort_order is not None:
        row.sort_order = int(sort_order)
    await db.commit()
    await db.refresh(row)
    return row


async def delete_category(db: AsyncSession, *, user_id: str, category_id: int) -> None:
    result = await db.execute(
        select(models.PlaceCategory).where(
            models.PlaceCategory.id == category_id,
            models.PlaceCategory.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    places = await db.execute(
        select(models.Place).where(
            models.Place.user_id == user_id,
            models.Place.category_id == category_id,
        )
    )
    for place in places.scalars().all():
        place.category_id = None
    await db.delete(row)
    await db.commit()


async def list_places(
    db: AsyncSession,
    *,
    user_id: str,
    category_id: Optional[int] = None,
    category_name: Optional[str] = None,
    limit: int = 500,
) -> list[models.Place]:
    stmt = (
        select(models.Place)
        .options(selectinload(models.Place.category))
        .where(models.Place.user_id == user_id)
        .order_by(models.Place.updated_at.desc(), models.Place.id.desc())
        .limit(max(1, min(limit, 2000)))
    )
    if category_id is not None:
        stmt = stmt.where(models.Place.category_id == category_id)
    elif category_name:
        key = category_name_key(category_name)
        cat = (
            await db.execute(
                select(models.PlaceCategory).where(
                    models.PlaceCategory.user_id == user_id,
                    models.PlaceCategory.name_key == key,
                )
            )
        ).scalars().first()
        if not cat:
            return []
        stmt = stmt.where(models.Place.category_id == cat.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_place_or_404(db: AsyncSession, *, user_id: str, place_id: int) -> models.Place:
    result = await db.execute(
        select(models.Place)
        .options(selectinload(models.Place.category))
        .where(models.Place.id == place_id, models.Place.user_id == user_id)
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Place not found")
    return row


async def create_place(
    db: AsyncSession,
    *,
    user_id: str,
    title: str,
    latitude: float,
    longitude: float,
    category_id: Optional[int] = None,
    category_name: Optional[str] = None,
    location_name: Optional[str] = None,
    source_channel: Optional[str] = None,
) -> models.Place:
    cleaned_title = re.sub(r"\s+", " ", (title or "").strip())
    if not cleaned_title:
        raise HTTPException(status_code=400, detail="Title is required")
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    resolved_category_id = category_id
    if category_name and not resolved_category_id:
        cat = await get_or_create_category(db, user_id=user_id, name=category_name)
        resolved_category_id = int(cat.id)
    elif resolved_category_id is not None:
        cat_result = await db.execute(
            select(models.PlaceCategory).where(
                models.PlaceCategory.id == resolved_category_id,
                models.PlaceCategory.user_id == user_id,
            )
        )
        if not cat_result.scalars().first():
            raise HTTPException(status_code=404, detail="Category not found")

    row = models.Place(
        user_id=user_id,
        category_id=resolved_category_id,
        title=cleaned_title[:190],
        latitude=lat,
        longitude=lon,
        location_name=(location_name or "").strip()[:190] or None,
        source_channel=(source_channel or "").strip()[:30] or None,
    )
    db.add(row)
    await db.commit()
    result = await db.execute(
        select(models.Place)
        .options(selectinload(models.Place.category))
        .where(models.Place.id == row.id)
    )
    return result.scalars().first() or row


async def update_place(
    db: AsyncSession,
    *,
    user_id: str,
    place_id: int,
    title: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    category_id: Optional[int] = None,
    category_name: Optional[str] = None,
    location_name: Optional[str] = None,
    clear_category: bool = False,
) -> models.Place:
    row = await get_place_or_404(db, user_id=user_id, place_id=place_id)
    if title is not None:
        cleaned_title = re.sub(r"\s+", " ", title.strip())
        if not cleaned_title:
            raise HTTPException(status_code=400, detail="Title is required")
        row.title = cleaned_title[:190]
    if latitude is not None or longitude is not None:
        lat = float(latitude if latitude is not None else row.latitude)
        lon = float(longitude if longitude is not None else row.longitude)
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            raise HTTPException(status_code=400, detail="Invalid coordinates")
        row.latitude = lat
        row.longitude = lon
    if location_name is not None:
        row.location_name = location_name.strip()[:190] or None
    if clear_category:
        row.category_id = None
    elif category_name:
        cat = await get_or_create_category(db, user_id=user_id, name=category_name)
        row.category_id = int(cat.id)
    elif category_id is not None:
        cat_result = await db.execute(
            select(models.PlaceCategory).where(
                models.PlaceCategory.id == category_id,
                models.PlaceCategory.user_id == user_id,
            )
        )
        if not cat_result.scalars().first():
            raise HTTPException(status_code=404, detail="Category not found")
        row.category_id = category_id
    await db.commit()
    return await get_place_or_404(db, user_id=user_id, place_id=place_id)


async def delete_place(db: AsyncSession, *, user_id: str, place_id: int) -> None:
    row = await get_place_or_404(db, user_id=user_id, place_id=place_id)
    await db.delete(row)
    await db.commit()


def normalize_whatsapp_phone(raw: str) -> Optional[str]:
    digits = re.sub(r"\D", "", (raw or "").strip())
    if not digits:
        return None
    # Malaysia local 01xxxxxxxx → 601xxxxxxxx
    if digits.startswith("0") and len(digits) >= 9:
        digits = "60" + digits[1:]
    if len(digits) < 8 or len(digits) > 15:
        return None
    return digits


def parse_whatsapp_phones(phones: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in phones:
        # allow multi-line / comma paste in one field
        parts = re.split(r"[\s,;]+", (raw or "").strip())
        for part in parts:
            phone = normalize_whatsapp_phone(part)
            if not phone or phone in seen:
                continue
            seen.add(phone)
            out.append(phone)
            if len(out) >= 20:
                return out
    return out


def build_place_share_text(place: models.Place) -> str:
    title = (place.title or "Pin").strip() or "Pin"
    lat = float(place.latitude)
    lon = float(place.longitude)
    return f"📍 {title}\nhttps://www.google.com/maps?q={lat},{lon}"


def _phones_to_json(phones: list[str]) -> str:
    return json.dumps(phones, ensure_ascii=False)


def _phones_from_json(raw: str | None) -> list[str]:
    try:
        data = json.loads(raw or "[]")
        if not isinstance(data, list):
            return []
        return [str(x) for x in data if str(x).strip()]
    except Exception:
        return []


def serialize_share_group(row: models.PlaceShareGroup) -> dict:
    phones = parse_whatsapp_phones(_phones_from_json(row.phones_json))
    return {
        "id": int(row.id),
        "name": row.name,
        "phones": phones,
        "phone_count": len(phones),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def list_share_groups(db: AsyncSession, *, user_id: str) -> list[models.PlaceShareGroup]:
    result = await db.execute(
        select(models.PlaceShareGroup)
        .where(models.PlaceShareGroup.user_id == user_id)
        .order_by(models.PlaceShareGroup.name.asc(), models.PlaceShareGroup.id.desc())
    )
    return list(result.scalars().all())


async def get_share_group_or_404(
    db: AsyncSession, *, user_id: str, group_id: int
) -> models.PlaceShareGroup:
    result = await db.execute(
        select(models.PlaceShareGroup).where(
            models.PlaceShareGroup.id == group_id,
            models.PlaceShareGroup.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")
    return row


async def create_share_group(
    db: AsyncSession,
    *,
    user_id: str,
    name: str,
    phones: list[str],
) -> models.PlaceShareGroup:
    cleaned_name = re.sub(r"\s+", " ", (name or "").strip())
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="Group name is required")
    targets = parse_whatsapp_phones(phones)
    if not targets:
        raise HTTPException(status_code=400, detail="No valid phone numbers")
    key = category_name_key(cleaned_name)
    clash = await db.execute(
        select(models.PlaceShareGroup).where(
            models.PlaceShareGroup.user_id == user_id,
            models.PlaceShareGroup.name_key == key,
        )
    )
    if clash.scalars().first():
        raise HTTPException(status_code=409, detail="Group name already exists")
    row = models.PlaceShareGroup(
        user_id=user_id,
        name=cleaned_name[:120],
        name_key=key,
        phones_json=_phones_to_json(targets),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_share_group(
    db: AsyncSession,
    *,
    user_id: str,
    group_id: int,
    name: Optional[str] = None,
    phones: Optional[list[str]] = None,
) -> models.PlaceShareGroup:
    row = await get_share_group_or_404(db, user_id=user_id, group_id=group_id)
    if name is not None:
        cleaned_name = re.sub(r"\s+", " ", name.strip())
        if not cleaned_name:
            raise HTTPException(status_code=400, detail="Group name is required")
        key = category_name_key(cleaned_name)
        clash = await db.execute(
            select(models.PlaceShareGroup).where(
                models.PlaceShareGroup.user_id == user_id,
                models.PlaceShareGroup.name_key == key,
                models.PlaceShareGroup.id != group_id,
            )
        )
        if clash.scalars().first():
            raise HTTPException(status_code=409, detail="Group name already exists")
        row.name = cleaned_name[:120]
        row.name_key = key
    if phones is not None:
        targets = parse_whatsapp_phones(phones)
        if not targets:
            raise HTTPException(status_code=400, detail="No valid phone numbers")
        row.phones_json = _phones_to_json(targets)
    await db.commit()
    await db.refresh(row)
    return row


async def delete_share_group(db: AsyncSession, *, user_id: str, group_id: int) -> None:
    row = await get_share_group_or_404(db, user_id=user_id, group_id=group_id)
    await db.delete(row)
    await db.commit()


async def share_place_whatsapp(
    db: AsyncSession,
    *,
    user_id: str,
    place_id: int,
    phones: list[str] | None = None,
    group_id: Optional[int] = None,
    send_worker_message: Callable[..., Any],
) -> dict:
    place = await get_place_or_404(db, user_id=user_id, place_id=place_id)
    targets: list[str] = []
    group_name: Optional[str] = None

    if group_id is not None:
        group = await get_share_group_or_404(db, user_id=user_id, group_id=group_id)
        group_name = group.name
        targets.extend(parse_whatsapp_phones(_phones_from_json(group.phones_json)))

    if phones:
        targets.extend(parse_whatsapp_phones(phones))

    # de-dupe preserve order
    seen: set[str] = set()
    unique: list[str] = []
    for phone in targets:
        if phone in seen:
            continue
        seen.add(phone)
        unique.append(phone)
        if len(unique) >= 20:
            break
    targets = unique

    if not targets:
        raise HTTPException(status_code=400, detail="No valid phone numbers")

    text = build_place_share_text(place)
    sent: list[dict] = []
    failed: list[dict] = []

    for phone in targets:
        try:
            data, status = send_worker_message(
                user_id,
                {"to": phone, "text": text},
                30.0,
            )
            if status and int(status) >= 400:
                detail = ""
                if isinstance(data, dict):
                    detail = str(data.get("detail") or data.get("status") or "")
                failed.append({"phone": phone, "error": detail or f"HTTP_{status}"})
            else:
                sent.append({"phone": phone})
        except Exception as exc:
            failed.append({"phone": phone, "error": str(exc) or "send failed"})

    return {
        "ok": len(sent) > 0,
        "text": text,
        "group_id": group_id,
        "group_name": group_name,
        "sent": sent,
        "failed": failed,
        "sent_count": len(sent),
        "failed_count": len(failed),
    }
