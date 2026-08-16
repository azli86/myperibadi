"""Pydantic schemas for Barang Saya (Personal Inventory) API."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

InventoryStatus = Literal["available", "loaned", "missing", "damaged", "disposed", "used_up"]
MovementType = Literal["created", "moved", "quantity_changed", "status_changed"]
SourceChannel = Literal["web", "whatsapp", "telegram", "chat", "system"]

STATUS_LABELS_BM = {
    "available": "Ada",
    "loaned": "Dipinjam",
    "missing": "Hilang",
    "damaged": "Rosak",
    "disposed": "Dibuang",
    "used_up": "Sudah Habis",
}

class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=190)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=80)
    quantity: int = Field(default=1, ge=0, le=1_000_000)
    unit: str = Field(default="unit", max_length=20)
    status: InventoryStatus = "available"
    brand: Optional[str] = Field(default=None, max_length=80)
    model: Optional[str] = Field(default=None, max_length=80)
    serial_number: Optional[str] = Field(default=None, max_length=120)
    purchase_date: Optional[str] = None  # YYYY-MM-DD
    purchase_price: Optional[float] = Field(default=None, ge=0)
    location_id: Optional[int] = None
    container_id: Optional[int] = None
    transaction_id: Optional[int] = None
    warranty_id: Optional[int] = None
    notes: Optional[str] = None

class ItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=80)
    quantity: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    unit: Optional[str] = Field(default=None, max_length=20)
    status: Optional[InventoryStatus] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = Field(default=None, ge=0)
    location_id: Optional[int] = None
    container_id: Optional[int] = None
    transaction_id: Optional[int] = None
    warranty_id: Optional[int] = None
    notes: Optional[str] = None

class ItemMove(BaseModel):
    location_id: Optional[int] = None
    container_id: Optional[int] = None
    quantity: int = Field(default=0, ge=0)  # 0 = move all
    notes: Optional[str] = None

class ItemQuantity(BaseModel):
    # operation: add | subtract | set
    operation: Literal["add", "subtract", "set"]
    amount: int = Field(ge=0, le=1_000_000)

class ItemStatus(BaseModel):
    status: InventoryStatus

class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=190)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    icon: Optional[str] = Field(default=None, max_length=40)
    color: Optional[str] = Field(default=None, max_length=20)

class LocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    icon: Optional[str] = None
    color: Optional[str] = None

class ContainerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=190)
    description: Optional[str] = None
    location_id: Optional[int] = None

class ContainerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    description: Optional[str] = None
    location_id: Optional[int] = None
