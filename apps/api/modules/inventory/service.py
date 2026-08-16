"""Barang Saya — application service. All channels (web/whatsapp/telegram/chat) share this logic."""

from __future__ import annotations

import secrets
from datetime import date, datetime, timezone
from typing import Any, Optional, Sequence

from fastapi import HTTPException, UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

import models
import storage_service
from modules.inventory import queries
from modules.inventory.schemas import (
    ContainerCreate, ContainerUpdate, ItemCreate, ItemMove, ItemQuantity, ItemStatus,
    ItemUpdate, LocationCreate, LocationUpdate, STATUS_LABELS_BM,
)

def _clean_name(name: str) -> str:
    cleaned = " ".join((name or "").split())
    if not cleaned:
        raise HTTPException(status_code=400, detail="Nama barang wajib diisi.")
    return cleaned

def _parse_date(value: Optional[str], field: str = "purchase_date") -> Optional[date]:
    if value is None or value == "":
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD") from exc

def _record_movement(
    *,
    user_id: str,
    item: models.InventoryItem,
    movement_type: str,
    to_location_id: Optional[int] = None,
    to_container_id: Optional[int] = None,
    from_location_id: Optional[int] = None,
    from_container_id: Optional[int] = None,
    quantity_before: Optional[int] = None,
    quantity_after: Optional[int] = None,
    status_before: Optional[str] = None,
    status_after: Optional[str] = None,
    notes: Optional[str] = None,
    source_channel: str = "web",
) -> models.InventoryMovement:
    return models.InventoryMovement(
        user_id=user_id,
        inventory_item_id=item.id,
        movement_type=movement_type,
        from_location_id=from_location_id,
        from_container_id=from_container_id,
        to_location_id=to_location_id,
        to_container_id=to_container_id,
        quantity_before=quantity_before,
        quantity_after=quantity_after,
        status_before=status_before,
        status_after=status_after,
        notes=notes,
        source_channel=source_channel,
        moved_at=datetime.utcnow(),
    )

async def _validate_container_consistency(
    db: AsyncSession, *, user_id: str, location_id: Optional[int], container_id: Optional[int]
) -> None:
    """If a container is picked, its location (or ancestor) must match the item location."""
    if container_id is None:
        return
    container = await queries.get_container_or_404(db, container_id=container_id, user_id=user_id)
    if container.location_id is None:
        return
    if location_id is None:
        raise HTTPException(status_code=400, detail="Pilih lokasi sebelum memilih bekas.")
    if container.location_id != location_id:
        # allow item location being an ancestor? No — keep strict simple rule: direct match.
        raise HTTPException(status_code=400, detail="Bekas ini tidak berada dalam lokasi yang dipilih.")

# ── items ─────────────────────────────────────────────────────────────────────

async def create_item(
    db: AsyncSession, *, current_user: models.User, payload: ItemCreate, source_channel: str = "web"
) -> models.InventoryItem:
    name = _clean_name(payload.name)
    await _validate_container_consistency(
        db, user_id=current_user.id, location_id=payload.location_id, container_id=payload.container_id
    )
    item = models.InventoryItem(
        user_id=current_user.id,
        name=name,
        description=payload.description,
        category=payload.category,
        quantity=payload.quantity,
        unit=payload.unit or "unit",
        status=payload.status,
        brand=payload.brand,
        model=payload.model,
        serial_number=payload.serial_number,
        purchase_date=_parse_date(payload.purchase_date),
        purchase_price=payload.purchase_price,
        location_id=payload.location_id,
        container_id=payload.container_id,
        transaction_id=payload.transaction_id,
        warranty_id=payload.warranty_id,
        notes=payload.notes,
    )
    db.add(item)
    await db.flush()
    db.add(_record_movement(
        user_id=current_user.id, item=item, movement_type="created",
        to_location_id=item.location_id, to_container_id=item.container_id,
        quantity_before=None, quantity_after=item.quantity, status_before=None, status_after=item.status,
        source_channel=source_channel,
    ))
    await db.commit()
    await db.refresh(item)
    return item

async def update_item(
    db: AsyncSession, *, current_user: models.User, item_id: int, payload: ItemUpdate, source_channel: str = "web"
) -> models.InventoryItem:
    item = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    data = payload.model_dump(exclude_unset=True)

    location_changed = False
    if "name" in data:
        item.name = _clean_name(data["name"])
    for field in ("description", "category", "brand", "model", "serial_number", "notes", "unit"):
        if field in data:
            setattr(item, field, data[field])
    if "purchase_date" in data:
        item.purchase_date = _parse_date(data["purchase_date"])
    if "purchase_price" in data:
        item.purchase_price = data["purchase_price"]

    if "location_id" in data:
        item.location_id = data["location_id"]
        location_changed = True
    if "container_id" in data:
        item.container_id = data["container_id"]
        location_changed = True
    if "transaction_id" in data:
        item.transaction_id = data["transaction_id"]
    if "warranty_id" in data:
        item.warranty_id = data["warranty_id"]
    await _validate_container_consistency(
        db, user_id=current_user.id, location_id=item.location_id, container_id=item.container_id
    )

    q_before, s_before = item.quantity, item.status
    if "quantity" in data:
        item.quantity = data["quantity"]
    if "status" in data:
        item.status = data["status"]

    if location_changed:
        db.add(_record_movement(
            user_id=current_user.id, item=item, movement_type="moved",
            from_location_id=None, from_container_id=None,  # callers wanting precise from-values use move_item
            to_location_id=item.location_id, to_container_id=item.container_id,
            source_channel=source_channel, notes="edited via form",
        ))
    if item.quantity != q_before:
        db.add(_record_movement(
            user_id=current_user.id, item=item, movement_type="quantity_changed",
            quantity_before=q_before, quantity_after=item.quantity, source_channel=source_channel,
        ))
    if item.status != s_before:
        db.add(_record_movement(
            user_id=current_user.id, item=item, movement_type="status_changed",
            status_before=s_before, status_after=item.status, source_channel=source_channel,
        ))
    await db.commit()
    await db.refresh(item)
    return item

async def delete_item(db: AsyncSession, *, current_user: models.User, item_id: int) -> None:
    item = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    item.deleted_at = datetime.utcnow()
    await db.commit()

async def move_item(
    db: AsyncSession, *, current_user: models.User, item_id: int, payload: ItemMove, source_channel: str = "web"
) -> models.InventoryItem:
    """Full move updates the row. Partial move splits into a new item row (safe, simple)."""
    item = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    await _validate_container_consistency(
        db, user_id=current_user.id, location_id=payload.location_id, container_id=payload.container_id
    )
    move_qty = payload.quantity or item.quantity
    if move_qty > item.quantity:
        raise HTTPException(status_code=400, detail=f"Kuantiti melebihi stok ({item.quantity} {item.unit}).")

    from_loc, from_cont = item.location_id, item.container_id
    if move_qty == item.quantity:
        item.location_id = payload.location_id
        item.container_id = payload.container_id
        db.add(_record_movement(
            user_id=current_user.id, item=item, movement_type="moved",
            from_location_id=from_loc, from_container_id=from_cont,
            to_location_id=payload.location_id, to_container_id=payload.container_id,
            quantity_before=item.quantity, quantity_after=item.quantity,
            notes=payload.notes, source_channel=source_channel,
        ))
    else:
        # partial: keep remainder on original row, split moved qty into a new row with same metadata
        item.quantity -= move_qty
        new_item = models.InventoryItem(
            user_id=current_user.id, name=item.name, description=item.description,
            category=item.category, quantity=move_qty, unit=item.unit, status=item.status,
            brand=item.brand, model=item.model, serial_number=item.serial_number,
            purchase_date=item.purchase_date, purchase_price=item.purchase_price,
            location_id=payload.location_id, container_id=payload.container_id,
            notes=item.notes,
        )
        db.add(new_item)
        await db.flush()
        db.add(_record_movement(
            user_id=current_user.id, item=item, movement_type="moved",
            from_location_id=from_loc, from_container_id=from_cont,
            to_location_id=payload.location_id, to_container_id=payload.container_id,
            quantity_before=item.quantity + move_qty, quantity_after=item.quantity,
            notes=(payload.notes or "") + " (separa)", source_channel=source_channel,
        ))
        db.add(_record_movement(
            user_id=current_user.id, item=new_item, movement_type="moved",
            from_location_id=from_loc, from_container_id=from_cont,
            to_location_id=payload.location_id, to_container_id=payload.container_id,
            quantity_before=0, quantity_after=move_qty,
            notes=(payload.notes or "") + " (pecahan baru)", source_channel=source_channel,
        ))
    await db.commit()
    await db.refresh(item)
    return item

async def change_quantity(
    db: AsyncSession, *, current_user: models.User, item_id: int, payload: ItemQuantity, source_channel: str = "web"
) -> models.InventoryItem:
    item = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    before = item.quantity
    if payload.operation == "add":
        item.quantity = before + payload.amount
    elif payload.operation == "subtract":
        if payload.amount > before:
            raise HTTPException(status_code=400, detail="Kuantiti tidak boleh negatif.")
        item.quantity = before - payload.amount
    else:
        item.quantity = payload.amount
    db.add(_record_movement(
        user_id=current_user.id, item=item, movement_type="quantity_changed",
        quantity_before=before, quantity_after=item.quantity, source_channel=source_channel,
    ))
    await db.commit()
    await db.refresh(item)
    return item

async def change_status(
    db: AsyncSession, *, current_user: models.User, item_id: int, payload: ItemStatus, source_channel: str = "web"
) -> models.InventoryItem:
    item = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    before = item.status
    item.status = payload.status
    db.add(_record_movement(
        user_id=current_user.id, item=item, movement_type="status_changed",
        status_before=before, status_after=item.status, source_channel=source_channel,
    ))
    await db.commit()
    await db.refresh(item)
    return item

async def list_movements(db: AsyncSession, *, current_user: models.User, item_id: int) -> Sequence[models.InventoryMovement]:
    await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    return (
        await db.execute(
            select(models.InventoryMovement)
            .where(models.InventoryMovement.user_id == current_user.id, models.InventoryMovement.inventory_item_id == item_id)
            .order_by(models.InventoryMovement.created_at.desc(), models.InventoryMovement.id.desc())
            .limit(200)
        )
    ).scalars().all()

# ── locations ─────────────────────────────────────────────────────────────────

async def _ensure_no_cycle(db: AsyncSession, *, user_id: str, location_id: int, new_parent_id: Optional[int]) -> None:
    if new_parent_id == location_id:
        raise HTTPException(status_code=400, detail="Lokasi tidak boleh menjadi parent kepada dirinya sendiri.")
    seen = {location_id}
    cursor = new_parent_id
    depth = 0
    while cursor is not None:
        if cursor in seen:
            raise HTTPException(status_code=400, detail="Hierarchy lokasi membentuk kitaran.")
        seen.add(cursor)
        depth += 1
        if depth > queries.MAX_LOCATION_DEPTH:
            raise HTTPException(status_code=400, detail=f"Kedalaman lokasi melebihi {queries.MAX_LOCATION_DEPTH} tingkat.")
        row = (
            await db.execute(
                select(models.InventoryLocation.parent_id).where(
                    models.InventoryLocation.id == cursor,
                    models.InventoryLocation.user_id == user_id,
                )
            )
        ).first()
        cursor = row[0] if row else None

async def create_location(db: AsyncSession, *, current_user: models.User, payload: LocationCreate) -> models.InventoryLocation:
    if payload.parent_id is not None:
        await queries.get_location_or_404(db, location_id=payload.parent_id, user_id=current_user.id)
    row = models.InventoryLocation(
        user_id=current_user.id,
        name=_clean_name(payload.name),
        description=payload.description,
        parent_id=payload.parent_id,
        icon=payload.icon,
        color=payload.color,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row

async def update_location(db: AsyncSession, *, current_user: models.User, location_id: int, payload: LocationUpdate) -> models.InventoryLocation:
    row = await queries.get_location_or_404(db, location_id=location_id, user_id=current_user.id)
    data = payload.model_dump(exclude_unset=True)
    if "parent_id" in data:
        await _ensure_no_cycle(db, user_id=current_user.id, location_id=location_id, new_parent_id=data["parent_id"])
        if data["parent_id"] is not None:
            await queries.get_location_or_404(db, location_id=data["parent_id"], user_id=current_user.id)
    for field, value in data.items():
        setattr(row, field, _clean_name(value) if field == "name" else value)
    await db.commit()
    await db.refresh(row)
    return row

async def delete_location(db: AsyncSession, *, current_user: models.User, location_id: int) -> None:
    row = await queries.get_location_or_404(db, location_id=location_id, user_id=current_user.id)
    child_loc = (await db.execute(
        select(func.count(models.InventoryLocation.id)).where(
            models.InventoryLocation.parent_id == location_id,
            models.InventoryLocation.deleted_at.is_(None),
        )
    )).scalar()
    if int(child_loc or 0) > 0:
        raise HTTPException(status_code=400, detail="Lokasi ini mempunyai sub-lokasi. Pindahkan dahulu.")
    cont = (await db.execute(
        select(func.count(models.InventoryContainer.id)).where(
            models.InventoryContainer.location_id == location_id,
            models.InventoryContainer.deleted_at.is_(None),
        )
    )).scalar()
    if int(cont or 0) > 0:
        raise HTTPException(status_code=400, detail="Lokasi ini mempunyai bekas. Pindahkan bekas dahulu.")
    items = (await db.execute(
        select(func.count(models.InventoryItem.id)).where(
            models.InventoryItem.location_id == location_id,
            models.InventoryItem.deleted_at.is_(None),
        )
    )).scalar()
    if int(items or 0) > 0:
        raise HTTPException(status_code=400, detail="Lokasi ini mempunyai barang. Pindahkan barang dahulu.")
    row.deleted_at = datetime.utcnow()
    await db.commit()

# ── containers ────────────────────────────────────────────────────────────────

async def create_container(db: AsyncSession, *, current_user: models.User, payload: ContainerCreate) -> models.InventoryContainer:
    if payload.location_id is not None:
        await queries.get_location_or_404(db, location_id=payload.location_id, user_id=current_user.id)
    row = models.InventoryContainer(
        user_id=current_user.id,
        name=_clean_name(payload.name),
        description=payload.description,
        location_id=payload.location_id,
        code=secrets.token_hex(4),  # reserved for future QR
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row

async def update_container(db: AsyncSession, *, current_user: models.User, container_id: int, payload: ContainerUpdate) -> models.InventoryContainer:
    row = await queries.get_container_or_404(db, container_id=container_id, user_id=current_user.id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("location_id") is not None:
        await queries.get_location_or_404(db, location_id=data["location_id"], user_id=current_user.id)
    for field, value in data.items():
        setattr(row, field, _clean_name(value) if field == "name" else value)
    await db.commit()
    await db.refresh(row)
    return row

async def delete_container(db: AsyncSession, *, current_user: models.User, container_id: int) -> None:
    row = await queries.get_container_or_404(db, container_id=container_id, user_id=current_user.id)
    items = (await db.execute(
        select(func.count(models.InventoryItem.id)).where(
            models.InventoryItem.container_id == container_id,
            models.InventoryItem.deleted_at.is_(None),
        )
    )).scalar()
    if int(items or 0) > 0:
        raise HTTPException(status_code=400, detail="Bekas ini masih mengandungi barang. Pindahkan barang dahulu.")
    row.deleted_at = datetime.utcnow()
    await db.commit()

# ── linking ───────────────────────────────────────────────────────────────────

async def link_transaction(db: AsyncSession, *, current_user: models.User, item_id: int, transaction_id: Optional[int]) -> models.InventoryItem:
    item = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    if transaction_id is not None:
        txn = (await db.execute(
            select(models.Transaction.id).where(models.Transaction.id == transaction_id, models.Transaction.user_id == current_user.id)
        )).first()
        if txn is None:
            raise HTTPException(status_code=404, detail="Transaksi tidak dijumpai.")
    item.transaction_id = transaction_id
    await db.commit()
    await db.refresh(item)
    return item

async def link_warranty(db: AsyncSession, *, current_user: models.User, item_id: int, warranty_id: Optional[int]) -> models.InventoryItem:
    item = await queries.get_item_or_404(db, item_id=item_id, user_id=current_user.id)
    if warranty_id is not None:
        wty = (await db.execute(
            select(models.WarrantyDevice.id).where(models.WarrantyDevice.id == warranty_id, models.WarrantyDevice.user_id == current_user.id)
        )).first()
        if wty is None:
            raise HTTPException(status_code=404, detail="Waranti tidak dijumpai.")
    item.warranty_id = warranty_id
    await db.commit()
    await db.refresh(item)
    return item

# ── serialization ─────────────────────────────────────────────────────────────

def serialize_item(row: models.InventoryItem, *, location_path: Optional[str] = None, container_name: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "name": row.name,
        "description": row.description,
        "category": row.category,
        "quantity": row.quantity,
        "unit": row.unit,
        "status": row.status,
        "status_label": STATUS_LABELS_BM.get(row.status, row.status),
        "brand": row.brand,
        "model": row.model,
        "serial_number": row.serial_number,
        "purchase_date": row.purchase_date.strftime("%Y-%m-%d") if row.purchase_date else None,
        "purchase_price": float(row.purchase_price) if row.purchase_price is not None else None,
        "has_image": bool(row.image_object_key),
        "location_id": row.location_id,
        "container_id": row.container_id,
        "location_path": location_path,
        "container_name": container_name,
        "transaction_id": row.transaction_id,
        "warranty_id": row.warranty_id,
        "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }

def serialize_movement(row: models.InventoryMovement) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "movement_type": row.movement_type,
        "quantity_before": row.quantity_before,
        "quantity_after": row.quantity_after,
        "status_before": STATUS_LABELS_BM.get(row.status_before, row.status_before) if row.status_before else None,
        "status_after": STATUS_LABELS_BM.get(row.status_after, row.status_after) if row.status_after else None,
        "notes": row.notes,
        "source_channel": row.source_channel,
        "moved_at": row.moved_at.isoformat() if row.moved_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }

def serialize_location(row: models.InventoryLocation, *, item_types: int = 0, item_units: int = 0, child_count: int = 0) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "name": row.name,
        "description": row.description,
        "parent_id": row.parent_id,
        "icon": row.icon,
        "color": row.color,
        "item_types": item_types,
        "item_units": item_units,
        "child_count": child_count,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }

def serialize_container(row: models.InventoryContainer, *, item_types: int = 0, item_units: int = 0, location_path: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "name": row.name,
        "description": row.description,
        "location_id": row.location_id,
        "code": row.code,
        "item_types": item_types,
        "item_units": item_units,
        "location_path": location_path,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
