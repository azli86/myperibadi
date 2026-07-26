"""User-scoped query helpers for Waranti Saya."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import models


async def ensure_household(db: AsyncSession, current_user: models.User) -> Optional[int]:
    household_id = current_user.default_household_id
    if household_id:
        return int(household_id)
    try:
        import whatsapp_service

        household_id = await whatsapp_service.ensure_standard_categories(db, current_user.id)
        await db.commit()
        await db.refresh(current_user)
        return int(household_id) if household_id else None
    except Exception:
        return None


async def get_device_or_404(
    db: AsyncSession,
    *,
    device_id: int,
    user_id: str,
) -> models.WarrantyDevice:
    result = await db.execute(
        select(models.WarrantyDevice).where(
            models.WarrantyDevice.id == device_id,
            models.WarrantyDevice.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Device not found.")
    return row


async def get_claim_or_404(
    db: AsyncSession,
    *,
    claim_id: int,
    device_id: int,
    user_id: str,
) -> models.WarrantyClaim:
    result = await db.execute(
        select(models.WarrantyClaim).where(
            models.WarrantyClaim.id == claim_id,
            models.WarrantyClaim.device_id == device_id,
            models.WarrantyClaim.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found.")
    return row


async def get_attachment_or_404(
    db: AsyncSession,
    *,
    attachment_id: int,
    user_id: str,
) -> models.WarrantyAttachment:
    result = await db.execute(
        select(models.WarrantyAttachment).where(
            models.WarrantyAttachment.id == attachment_id,
            models.WarrantyAttachment.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    return row


async def find_serial_duplicate(
    db: AsyncSession,
    *,
    user_id: str,
    serial_number: str,
    exclude_device_id: Optional[int] = None,
) -> Optional[models.WarrantyDevice]:
    serial = (serial_number or "").strip()
    if not serial:
        return None
    query: Select = select(models.WarrantyDevice).where(
        models.WarrantyDevice.user_id == user_id,
        func.lower(models.WarrantyDevice.serial_number) == serial.lower(),
    )
    if exclude_device_id is not None:
        query = query.where(models.WarrantyDevice.id != exclude_device_id)
    result = await db.execute(query)
    return result.scalars().first()


async def list_devices(
    db: AsyncSession,
    *,
    user_id: str,
    search: Optional[str] = None,
) -> list[models.WarrantyDevice]:
    query: Select = select(models.WarrantyDevice).where(models.WarrantyDevice.user_id == user_id)
    term = (search or "").strip()
    if term:
        like = f"%{term}%"
        query = query.where(
            or_(
                models.WarrantyDevice.device_name.ilike(like),
                models.WarrantyDevice.brand.ilike(like),
                models.WarrantyDevice.model.ilike(like),
                models.WarrantyDevice.serial_number.ilike(like),
            )
        )
    query = query.order_by(
        models.WarrantyDevice.warranty_expiry_date.asc().nullslast(),
        models.WarrantyDevice.device_name.asc(),
        models.WarrantyDevice.id.asc(),
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def list_claims(
    db: AsyncSession,
    *,
    device_id: int,
    user_id: str,
) -> list[models.WarrantyClaim]:
    result = await db.execute(
        select(models.WarrantyClaim)
        .where(
            models.WarrantyClaim.device_id == device_id,
            models.WarrantyClaim.user_id == user_id,
        )
        .order_by(
            models.WarrantyClaim.claim_date.desc().nullslast(),
            models.WarrantyClaim.id.desc(),
        )
    )
    return list(result.scalars().all())
