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
    # Derived from the date window (+ wallet) rather than stored, so editing dates
    # updates these immediately.
    spent: float = 0
    transaction_count: int = 0
    created_at: datetime
    updated_at: datetime

class EventTransactionResponse(BaseModel):
    id: int
    reference_id: Optional[str] = None
    type: str
    txn_date: Optional[str] = None
    vendor_or_source: str
    amount: float
    currency: str = "RM"
    wallet_id: Optional[int] = None
    wallet_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_icon: Optional[str] = None
    # Whether this transaction counts towards the event budget.
    included: bool = True

class EventTransactionToggle(BaseModel):
    included: bool


class EventDetailResponse(EventResponse):
    pass
