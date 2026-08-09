"""Pydantic schemas for My Event API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=190)
    icon_name: Optional[str] = Field(default=None, max_length=80)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currency: Optional[str] = Field(default=None, max_length=10)
    wallet_id: Optional[int] = None
    budget: Optional[float] = None
    notes: Optional[str] = None


class EventUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=190)
    icon_name: Optional[str] = Field(default=None, max_length=80)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currency: Optional[str] = Field(default=None, max_length=10)
    wallet_id: Optional[int] = None
    budget: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class EventResponse(BaseModel):
    id: int
    name: str
    icon_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currency: str = "RM"
    wallet_id: Optional[int] = None
    budget: Optional[float] = None
    notes: Optional[str] = None
    status: str = "upcoming"
    has_image: bool = False
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EventDetailResponse(EventResponse):
    pass
