"""Pydantic schemas for My Places API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PlaceCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    color: Optional[str] = Field(default=None, max_length=20)


class PlaceCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    color: Optional[str] = Field(default=None, max_length=20)
    sort_order: Optional[int] = None


class PlaceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=190)
    latitude: float
    longitude: float
    category_id: Optional[int] = None
    category_name: Optional[str] = Field(default=None, max_length=120)
    location_name: Optional[str] = Field(default=None, max_length=190)
    source_channel: Optional[str] = Field(default=None, max_length=30)


class PlaceUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=190)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = Field(default=None, max_length=120)
    location_name: Optional[str] = Field(default=None, max_length=190)


class PlaceCategoryOut(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    sort_order: int = 0
    created_at: Optional[datetime] = None


class PlaceOut(BaseModel):
    id: int
    title: str
    latitude: float
    longitude: float
    location_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    source_channel: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PlaceShareWhatsApp(BaseModel):
    """Send place pin via group and/or raw phone list (linked QR session)."""

    phones: list[str] = Field(default_factory=list, max_length=20)
    group_id: Optional[int] = None


class PlaceShareGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phones: list[str] = Field(min_length=1, max_length=20)


class PlaceShareGroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    phones: Optional[list[str]] = Field(default=None, min_length=1, max_length=20)
