"""Pydantic schemas for the Income Tax module."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class TaxProfileUpdate(BaseModel):
    residency_status: Optional[Literal["resident", "non_resident"]] = None
    marital_status: Optional[Literal["single", "married", "divorced", "widowed"]] = None
    income_source: Optional[Literal["employment", "business", "both"]] = None
    disabled_status: Optional[bool] = None
    spouse_income_status: Optional[Literal["has_income", "no_income"]] = None
    assessment_type: Optional[Literal["separate", "joint"]] = None
    tax_identifier: Optional[str] = None  # masked/encrypted TIN
    zakat_tracking_enabled: Optional[bool] = None


class EmployerCreate(BaseModel):
    assessment_year: int
    employer_name: str = Field(min_length=1, max_length=190)
    employer_tax_number: Optional[str] = None
    employment_start: Optional[str] = None
    employment_end: Optional[str] = None


class EmployerUpdate(BaseModel):
    employer_name: Optional[str] = Field(default=None, max_length=190)
    employer_tax_number: Optional[str] = None
    employment_start: Optional[str] = None
    employment_end: Optional[str] = None


class EAReview(BaseModel):
    assessment_year: int
    employer_id: Optional[int] = None
    employer_name: Optional[str] = None
    employer_tax_number: Optional[str] = None
    employee_name: Optional[str] = None
    employee_ic: Optional[str] = None
    salary: Optional[float] = None
    bonus: Optional[float] = None
    commission: Optional[float] = None
    allowances: Optional[float] = None
    benefits: Optional[float] = None
    perquisites: Optional[float] = None
    benefit_in_kind: Optional[float] = None
    living_accommodation: Optional[float] = None
    total_employment_income: Optional[float] = None
    pcb_amount: Optional[float] = None
    cp38_amount: Optional[float] = None
    epf_amount: Optional[float] = None
    socso_amount: Optional[float] = None
    zakat_amount: Optional[float] = None
    confidence: Optional[float] = None


class IncomeCreate(BaseModel):
    assessment_year: int
    income_type: Literal["employment", "business"] = "employment"
    source_type: Literal["ea", "manual", "transaction"] = "manual"
    employer_id: Optional[int] = None
    employer_name: Optional[str] = None
    gross_amount: Optional[float] = None
    taxable_amount: Optional[float] = None
    business_name: Optional[str] = None
    business_expenses: Optional[float] = None
    notes: Optional[str] = None


class IncomeUpdate(BaseModel):
    employer_id: Optional[int] = None
    employer_name: Optional[str] = None
    gross_amount: Optional[float] = None
    taxable_amount: Optional[float] = None
    business_name: Optional[str] = None
    business_expenses: Optional[float] = None
    status: Optional[Literal["draft", "confirmed"]] = None
    notes: Optional[str] = None


class DependantCreate(BaseModel):
    dependant_type: Literal["under18", "education18plus", "disabled_child", "disabled_education"]
    relief_percentage: Literal[50, 100] = 100


class DependantUpdate(BaseModel):
    dependant_type: Optional[Literal["under18", "education18plus", "disabled_child", "disabled_education"]] = None
    relief_percentage: Optional[Literal[50, 100]] = None
    eligibility_status: Optional[Literal["pending", "eligible", "not_eligible"]] = None


class ReliefCreate(BaseModel):
    assessment_year: int
    relief_code: str
    claimed_amount: float = 0
    eligible_amount: Optional[float] = 0
    source: str = "manual"


class ReliefUpdate(BaseModel):
    claimed_amount: Optional[float] = None
    eligible_amount: Optional[float] = None
    status: Optional[Literal["suggested", "claimed", "reviewed"]] = None


class ReliefItemCreate(BaseModel):
    tax_relief_id: int
    transaction_id: Optional[int] = None
    document_id: Optional[int] = None
    amount: float = 0
    eligible_amount: Optional[float] = 0
    notes: Optional[str] = None


class RebateCreate(BaseModel):
    assessment_year: int
    rebate_code: str = "rebate_zakat"
    amount: float = 0
    source: str = "manual"
    transaction_id: Optional[int] = None
    document_id: Optional[int] = None


class RebateUpdate(BaseModel):
    amount: Optional[float] = None
    source: Optional[str] = None
    status: Optional[str] = None


class TransactionLinkCreate(BaseModel):
    transaction_id: int
    tax_year: int
    tax_type: Literal["relief", "rebate", "income"]
    tax_category_id: Optional[int] = None
    claim_amount: Optional[float] = None
    status: str = "suggested"
    document_id: Optional[int] = None


class TransactionLinkUpdate(BaseModel):
    claim_amount: Optional[float] = None
    status: Optional[Literal["suggested", "reviewed", "accepted", "rejected"]] = None
    tax_category_id: Optional[int] = None
    document_id: Optional[int] = None


class TaxDocumentMeta(BaseModel):
    assessment_year: int
    document_type: str
    document_date: Optional[str] = None
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[int] = None
