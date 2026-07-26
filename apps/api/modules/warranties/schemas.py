"""Pydantic schemas for Waranti Saya API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


ClaimResolution = Literal["repaired", "replaced", "rejected", "other"]


class DeviceCreate(BaseModel):
    device_name: str = Field(min_length=1, max_length=190)
    category: Optional[str] = Field(default=None, max_length=80)
    brand: Optional[str] = Field(default=None, max_length=80)
    model: Optional[str] = Field(default=None, max_length=80)
    serial_number: str = Field(min_length=1, max_length=120)
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    store_or_seller: Optional[str] = Field(default=None, max_length=190)
    receipt_or_order_number: Optional[str] = Field(default=None, max_length=120)
    warranty_start_date: Optional[str] = None
    warranty_duration_months: Optional[int] = None
    # Accepted for compatibility; server always recalculates from start + duration
    warranty_expiry_date: Optional[str] = None
    notes: Optional[str] = None


class DeviceUpdate(BaseModel):
    device_name: Optional[str] = Field(default=None, max_length=190)
    category: Optional[str] = Field(default=None, max_length=80)
    brand: Optional[str] = Field(default=None, max_length=80)
    model: Optional[str] = Field(default=None, max_length=80)
    serial_number: Optional[str] = Field(default=None, max_length=120)
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    store_or_seller: Optional[str] = Field(default=None, max_length=190)
    receipt_or_order_number: Optional[str] = Field(default=None, max_length=120)
    warranty_start_date: Optional[str] = None
    warranty_duration_months: Optional[int] = None
    # Accepted for compatibility; server always recalculates from start + duration
    warranty_expiry_date: Optional[str] = None
    notes: Optional[str] = None


class ClaimCreate(BaseModel):
    claim_date: Optional[str] = None
    problem_description: Optional[str] = None
    service_centre: Optional[str] = Field(default=None, max_length=190)
    reference_number: Optional[str] = Field(default=None, max_length=120)
    date_sent: Optional[str] = None
    expected_completion_date: Optional[str] = None
    date_received: Optional[str] = None
    resolution: Optional[ClaimResolution] = None
    notes: Optional[str] = None


class ClaimUpdate(BaseModel):
    claim_date: Optional[str] = None
    problem_description: Optional[str] = None
    service_centre: Optional[str] = Field(default=None, max_length=190)
    reference_number: Optional[str] = Field(default=None, max_length=120)
    date_sent: Optional[str] = None
    expected_completion_date: Optional[str] = None
    date_received: Optional[str] = None
    resolution: Optional[ClaimResolution] = None
    notes: Optional[str] = None
