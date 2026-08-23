"""Serializers & helpers for the Income Tax module."""

from __future__ import annotations

import json
import re
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


def r2(value) -> float:
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _mask_tin(tin: str | None) -> str | None:
    if not tin:
        return None
    # show first 2 and last 4, mask the middle
    if len(tin) <= 6:
        return "*" * len(tin)
    return f"{tin[:2]}{'*' * (len(tin) - 6)}{tin[-4:]}"


def serialize_profile(p: models.TaxProfile) -> dict:
    return {
        "id": p.id,
        "assessment_year": p.assessment_year,
        "residency_status": p.residency_status,
        "marital_status": p.marital_status,
        "income_source": p.income_source,
        "disabled_status": p.disabled_status,
        "spouse_income_status": p.spouse_income_status,
        "assessment_type": p.assessment_type,
        "tax_identifier_masked": _mask_tin(p.tax_identifier_encrypted),
        "zakat_tracking_enabled": p.zakat_tracking_enabled,
        "review_status": p.review_status,
    }


def serialize_employer(e: models.TaxEmployer) -> dict:
    return {
        "id": e.id,
        "assessment_year": e.assessment_year,
        "employer_name": e.employer_name,
        "employer_tax_number": e.employer_tax_number,
        "employment_start": e.employment_start,
        "employment_end": e.employment_end,
    }


def serialize_ea(f: models.TaxEAForm) -> dict:
    return {
        "id": f.id,
        "assessment_year": f.assessment_year,
        "employer_id": f.employer_id,
        "document_id": f.document_id,
        "document_type": f.document_type,
        "ocr_status": f.ocr_status,
        "review_status": f.review_status,
        "confidence": float(f.confidence) if f.confidence is not None else None,
        "employer_name": f.employer_name,
        "employer_tax_number": f.employer_tax_number,
        "employee_name": f.employee_name,
        "employee_ic": f.employee_ic,
        "salary": r2(f.salary) if f.salary is not None else None,
        "bonus": r2(f.bonus) if f.bonus is not None else None,
        "commission": r2(f.commission) if f.commission is not None else None,
        "allowances": r2(f.allowances) if f.allowances is not None else None,
        "benefits": r2(f.benefits) if f.benefits is not None else None,
        "perquisites": r2(f.perquisites) if f.perquisites is not None else None,
        "benefit_in_kind": r2(f.benefit_in_kind) if f.benefit_in_kind is not None else None,
        "living_accommodation": r2(f.living_accommodation) if f.living_accommodation is not None else None,
        "total_employment_income": r2(f.total_employment_income) if f.total_employment_income is not None else None,
        "pcb_amount": r2(f.pcb_amount) if f.pcb_amount is not None else None,
        "cp38_amount": r2(f.cp38_amount) if f.cp38_amount is not None else None,
        "epf_amount": r2(f.epf_amount) if f.epf_amount is not None else None,
        "socso_amount": r2(f.socso_amount) if f.socso_amount is not None else None,
        "zakat_amount": r2(f.zakat_amount) if f.zakat_amount is not None else None,
        "raw_extraction_json": _load_json(f.raw_extraction_json),
        "confirmed_json": _load_json(f.confirmed_json),
    }


def _load_json(value: str | None):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def serialize_income(i: models.TaxIncome) -> dict:
    return {
        "id": i.id,
        "assessment_year": i.assessment_year,
        "tax_profile_id": i.tax_profile_id,
        "income_type": i.income_type,
        "source_type": i.source_type,
        "source_id": i.source_id,
        "employer_id": i.employer_id,
        "employer_name": i.employer_name,
        "gross_amount": r2(i.gross_amount) if i.gross_amount is not None else None,
        "taxable_amount": r2(i.taxable_amount) if i.taxable_amount is not None else None,
        "business_name": i.business_name,
        "business_expenses": r2(i.business_expenses) if i.business_expenses is not None else None,
        "status": i.status,
        "notes": i.notes,
    }


def serialize_relief(x: models.TaxRelief, limit: float | None = None) -> dict:
    return {
        "id": x.id,
        "assessment_year": x.assessment_year,
        "relief_code": x.relief_code,
        "name": x.name,
        "claimed_amount": r2(x.claimed_amount),
        "eligible_amount": r2(x.eligible_amount),
        "max_limit": r2(limit) if limit is not None else None,
        "source": x.source,
        "status": x.status,
    }


def serialize_rebate(x: models.TaxRebate) -> dict:
    return {
        "id": x.id,
        "assessment_year": x.assessment_year,
        "rebate_code": x.rebate_code,
        "name": x.name,
        "amount": r2(x.amount),
        "source": x.source,
        "transaction_id": x.transaction_id,
        "document_id": x.document_id,
        "status": x.status,
    }


def serialize_document(d: models.TaxDocument) -> dict:
    return {
        "id": d.id,
        "assessment_year": d.assessment_year,
        "document_type": d.document_type,
        "storage_reference": d.storage_reference,
        "original_filename": d.original_filename,
        "mime_type": d.mime_type,
        "document_date": d.document_date,
        "linked_entity_type": d.linked_entity_type,
        "linked_entity_id": d.linked_entity_id,
        "ocr_status": d.ocr_status,
    }


def serialize_link(l: models.TaxTransactionLink) -> dict:
    return {
        "id": l.id,
        "transaction_id": l.transaction_id,
        "tax_year": l.tax_year,
        "tax_type": l.tax_type,
        "tax_category_id": l.tax_category_id,
        "claim_amount": r2(l.claim_amount),
        "status": l.status,
        "document_id": l.document_id,
    }


async def get_profile_or_create(db: AsyncSession, user_id: str, assessment_year: int) -> models.TaxProfile:
    res = await db.execute(
        select(models.TaxProfile).where(
            models.TaxProfile.user_id == user_id,
            models.TaxProfile.assessment_year == assessment_year,
        )
    )
    profile = res.scalars().first()
    if profile is None:
        profile = models.TaxProfile(user_id=user_id, assessment_year=assessment_year)
        db.add(profile)
        await db.flush()
    return profile


def round_num(value) -> float:
    return r2(value)
