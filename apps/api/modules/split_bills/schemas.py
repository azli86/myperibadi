"""Pydantic schemas for Split Bill API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class SplitBillCreate(BaseModel):
    title: str = Field(min_length=1, max_length=190)
    transaction_id: Optional[int] = None
    currency: Optional[str] = Field(default=None, max_length=10)
    total_amount: Optional[float] = None
    people_count: int = Field(default=2, ge=1)
    am_i_included: bool = True
    share_amount: Optional[float] = None
    collect_amount: Optional[float] = None
    notes: Optional[str] = None
    original_txn_date: Optional[str] = None


class SplitBillUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=190)
    people_count: Optional[int] = Field(default=None, ge=1)
    am_i_included: Optional[bool] = None
    share_amount: Optional[float] = None
    collect_amount: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class SplitBillPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    wallet_id: Optional[int] = None
    payment_date: Optional[str] = None
    payment_time: Optional[str] = None
    notes: Optional[str] = None


class SplitBillResponse(BaseModel):
    id: int
    title: str
    transaction_id: Optional[int] = None
    currency: str = "RM"
    total_amount: Optional[float] = None
    people_count: int = 1
    share_amount: Optional[float] = None
    collect_amount: Optional[float] = None
    amount_received: float = 0.0
    balance_amount: float = 0.0
    am_i_included: bool = True
    status: str = "active"
    notes: Optional[str] = None
    original_txn_date: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SplitBillDetailResponse(SplitBillResponse):
    payments: list[dict] = []
