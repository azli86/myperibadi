"""Pydantic schemas for My Vehicle API."""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


VehicleStatus = Literal["active", "maintenance", "sold", "inactive"]
ExpenseCategory = Literal[
    "Fuel",
    "Service",
    "Repair",
    "Spare Parts",
    "Tyres",
    "Battery",
    "Road Tax",
    "Insurance",
    "Parking",
    "Toll",
    "Car Wash",
    "Summons",
    "Accessories",
    "Other",
]
DocType = Literal["road_tax", "insurance", "other"]
ReminderType = Literal["service", "road_tax", "insurance", "custom", "odometer"]
ReminderStatus = Literal["pending", "completed", "dismissed"]
MaintenanceStatus = Literal["upcoming", "due_soon", "overdue", "completed"]


class VehicleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=190)
    vehicle_type: Optional[str] = Field(default=None, max_length=40)
    registration_number: Optional[str] = Field(default=None, max_length=40)
    brand: Optional[str] = Field(default=None, max_length=80)
    model: Optional[str] = Field(default=None, max_length=80)
    variant: Optional[str] = Field(default=None, max_length=80)
    year: Optional[int] = None
    color: Optional[str] = Field(default=None, max_length=40)
    fuel_type: Optional[str] = Field(default=None, max_length=40)
    engine_capacity: Optional[str] = Field(default=None, max_length=40)
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    current_odometer: Optional[float] = None
    status: VehicleStatus = "active"
    notes: Optional[str] = None


class VehicleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=190)
    vehicle_type: Optional[str] = Field(default=None, max_length=40)
    registration_number: Optional[str] = Field(default=None, max_length=40)
    brand: Optional[str] = Field(default=None, max_length=80)
    model: Optional[str] = Field(default=None, max_length=80)
    variant: Optional[str] = Field(default=None, max_length=80)
    year: Optional[int] = None
    color: Optional[str] = Field(default=None, max_length=40)
    fuel_type: Optional[str] = Field(default=None, max_length=40)
    engine_capacity: Optional[str] = Field(default=None, max_length=40)
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    current_odometer: Optional[float] = None
    status: Optional[VehicleStatus] = None
    notes: Optional[str] = None


class VehicleResponse(BaseModel):
    id: int
    name: str
    vehicle_type: Optional[str] = None
    registration_number: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    variant: Optional[str] = None
    year: Optional[int] = None
    color: Optional[str] = None
    fuel_type: Optional[str] = None
    engine_capacity: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    current_odometer: Optional[float] = None
    has_image: bool = False
    image_url: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FuelLogCreate(BaseModel):
    log_date: str
    odometer: Optional[float] = None
    price_per_litre: Optional[float] = None
    litres: Optional[float] = None
    total_amount: float
    is_full_tank: bool = True
    station: Optional[str] = None
    location: Optional[str] = None
    payment_wallet: Optional[str] = None
    notes: Optional[str] = None
    create_transaction: bool = True
    wallet_id: Optional[int] = None


class FuelLogUpdate(BaseModel):
    log_date: Optional[str] = None
    odometer: Optional[float] = None
    price_per_litre: Optional[float] = None
    litres: Optional[float] = None
    total_amount: Optional[float] = None
    is_full_tank: Optional[bool] = None
    station: Optional[str] = None
    location: Optional[str] = None
    payment_wallet: Optional[str] = None
    notes: Optional[str] = None


class FuelLogResponse(BaseModel):
    id: int
    vehicle_id: int
    log_date: str
    odometer: Optional[float] = None
    price_per_litre: Optional[float] = None
    litres: Optional[float] = None
    total_amount: float
    is_full_tank: bool
    station: Optional[str] = None
    location: Optional[str] = None
    payment_wallet: Optional[str] = None
    notes: Optional[str] = None
    receipt_attachment_id: Optional[int] = None
    distance_travelled: Optional[float] = None
    km_per_litre: Optional[float] = None
    cost_per_km: Optional[float] = None
    wallet_id: Optional[int] = None
    transaction_id: Optional[int] = None
    transaction_reference_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ExpenseCreate(BaseModel):
    category: str
    expense_date: str
    amount: float
    odometer: Optional[float] = None
    notes: Optional[str] = None
    wallet_id: Optional[int] = None
    transaction_id: Optional[int] = None
    create_transaction: bool = True


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    expense_date: Optional[str] = None
    amount: Optional[float] = None
    odometer: Optional[float] = None
    notes: Optional[str] = None


class ExpenseResponse(BaseModel):
    id: int
    vehicle_id: int
    category: str
    expense_date: str
    amount: float
    odometer: Optional[float] = None
    notes: Optional[str] = None
    wallet_id: Optional[int] = None
    transaction_id: Optional[int] = None
    transaction_reference_id: Optional[str] = None
    receipt_attachment_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class MaintenanceCreate(BaseModel):
    service_type: str
    service_date: str
    odometer: Optional[float] = None
    workshop: Optional[str] = None
    labour_cost: Optional[float] = None
    parts_cost: Optional[float] = None
    total_cost: Optional[float] = None
    replaced_items: Optional[str] = None
    next_service_date: Optional[str] = None
    next_service_odometer: Optional[float] = None
    notes: Optional[str] = None
    status: MaintenanceStatus = "completed"
    create_transaction: bool = True
    wallet_id: Optional[int] = None


class MaintenanceUpdate(BaseModel):
    service_type: Optional[str] = None
    service_date: Optional[str] = None
    odometer: Optional[float] = None
    workshop: Optional[str] = None
    labour_cost: Optional[float] = None
    parts_cost: Optional[float] = None
    total_cost: Optional[float] = None
    replaced_items: Optional[str] = None
    next_service_date: Optional[str] = None
    next_service_odometer: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[MaintenanceStatus] = None


class MaintenanceResponse(BaseModel):
    id: int
    vehicle_id: int
    service_type: str
    service_date: str
    odometer: Optional[float] = None
    workshop: Optional[str] = None
    labour_cost: Optional[float] = None
    parts_cost: Optional[float] = None
    total_cost: Optional[float] = None
    replaced_items: Optional[str] = None
    next_service_date: Optional[str] = None
    next_service_odometer: Optional[float] = None
    notes: Optional[str] = None
    status: str
    receipt_attachment_id: Optional[int] = None
    wallet_id: Optional[int] = None
    transaction_id: Optional[int] = None
    transaction_reference_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class VehicleTransactionLinkResponse(BaseModel):
    vehicle_id: Optional[int] = None
    vehicle_name: Optional[str] = None
    registration_number: Optional[str] = None
    kind: Optional[str] = None  # fuel | expense | maintenance
    record_id: Optional[int] = None
    label: Optional[str] = None
    transaction_id: Optional[int] = None
    transaction_reference_id: Optional[str] = None


class DocumentCreate(BaseModel):
    doc_type: DocType
    title: str
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    amount: Optional[float] = None
    provider: Optional[str] = None
    reference_number: Optional[str] = None
    coverage_info: Optional[str] = None
    notes: Optional[str] = None


class DocumentUpdate(BaseModel):
    doc_type: Optional[DocType] = None
    title: Optional[str] = None
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    amount: Optional[float] = None
    provider: Optional[str] = None
    reference_number: Optional[str] = None
    coverage_info: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class DocumentResponse(BaseModel):
    id: int
    vehicle_id: int
    doc_type: str
    title: str
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    amount: Optional[float] = None
    provider: Optional[str] = None
    reference_number: Optional[str] = None
    coverage_info: Optional[str] = None
    notes: Optional[str] = None
    status: str
    file_attachment_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class ReminderCreate(BaseModel):
    reminder_type: ReminderType = "custom"
    title: str
    due_date: Optional[str] = None
    due_odometer: Optional[float] = None
    notes: Optional[str] = None


class ReminderUpdate(BaseModel):
    reminder_type: Optional[ReminderType] = None
    title: Optional[str] = None
    due_date: Optional[str] = None
    due_odometer: Optional[float] = None
    status: Optional[ReminderStatus] = None
    notes: Optional[str] = None


class ReminderResponse(BaseModel):
    id: int
    vehicle_id: int
    vehicle_name: Optional[str] = None
    registration_number: Optional[str] = None
    reminder_type: str
    title: str
    due_date: Optional[str] = None
    due_odometer: Optional[float] = None
    status: str
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    notes: Optional[str] = None
    days_overdue: Optional[int] = None
    km_overdue: Optional[float] = None
    is_overdue: bool = False
    is_due_soon: bool = False
    created_at: datetime
    updated_at: datetime


class OdometerCreate(BaseModel):
    reading_date: str
    odometer: float
    notes: Optional[str] = None


class OdometerResponse(BaseModel):
    id: int
    vehicle_id: int
    reading_date: str
    odometer: float
    source: str
    source_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime


class AttachmentResponse(BaseModel):
    id: int
    vehicle_id: int
    parent_type: str
    parent_id: Optional[int] = None
    file_name: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    created_at: datetime


class VehicleSummaryResponse(BaseModel):
    vehicle_id: Optional[int] = None
    vehicle_name: Optional[str] = None
    registration_number: Optional[str] = None
    current_odometer: Optional[float] = None
    month_key: str
    total_cost: float = 0
    fuel_cost: float = 0
    maintenance_cost: float = 0
    expense_cost: float = 0
    distance_travelled: Optional[float] = None
    avg_km_per_litre: Optional[float] = None
    next_service_date: Optional[str] = None
    next_service_odometer: Optional[float] = None
    road_tax_expiry: Optional[str] = None
    insurance_expiry: Optional[str] = None
    vehicles: Optional[List["VehicleSummaryResponse"]] = None


class OverdueItem(BaseModel):
    id: int
    vehicle_id: int
    vehicle_name: str
    registration_number: Optional[str] = None
    type: str
    title: str
    due_date: Optional[str] = None
    due_odometer: Optional[float] = None
    days_overdue: Optional[int] = None
    km_overdue: Optional[float] = None
    target_tab: str = "reminders"


class OverdueDashboardResponse(BaseModel):
    total_overdue: int
    items: List[OverdueItem]
