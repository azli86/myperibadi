"""Seed the tax_rules table from tax_rules_data for supported assessment years."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.tax.tax_rules_data import RESIDENT_BRACKETS_2024_2026, RELIEF_RULES_2026, REBATE_RULES

SUPPORTED_YEARS = [2024, 2025, 2026, 2027]


async def seed_tax_rules(db: AsyncSession) -> None:
    """Idempotently seed tax rules for all supported assessment years."""
    for year in SUPPORTED_YEARS:
        # Brackets
        existing = (await db.execute(
            select(models.TaxRule).where(
                models.TaxRule.assessment_year == year,
                models.TaxRule.rule_type == "bracket",
            )
        )).scalars().first()
        if existing is None:
            db.add(models.TaxRule(
                assessment_year=year,
                rule_type="bracket",
                rule_code="resident_brackets",
                name="Kadar Cukai Pendapatan Individu (Residen)",
                description="Progressive resident individual income tax brackets.",
                calculation_rule=json.dumps(RESIDENT_BRACKETS_2024_2026),
                source_reference="HASiL (LHDN)",
                version=1,
                active=True,
            ))
        # Reliefs
        for r in RELIEF_RULES_2026:
            existing = (await db.execute(
                select(models.TaxRule).where(
                    models.TaxRule.assessment_year == year,
                    models.TaxRule.rule_type == "relief",
                    models.TaxRule.rule_code == r["code"],
                )
            )).scalars().first()
            if existing is None:
                db.add(models.TaxRule(
                    assessment_year=year,
                    rule_type="relief",
                    rule_code=r["code"],
                    name=r["name"],
                    description=None,
                    limit_amount=r["limit"],
                    eligibility_rule=json.dumps({"group": r["group"], "note": r["eligibility"]}),
                    document_requirement=r["doc"],
                    source_reference="HASiL (LHDN)",
                    version=1,
                    active=True,
                ))
        # Rebates
        for r in REBATE_RULES:
            existing = (await db.execute(
                select(models.TaxRule).where(
                    models.TaxRule.assessment_year == year,
                    models.TaxRule.rule_type == "rebate",
                    models.TaxRule.rule_code == r["code"],
                )
            )).scalars().first()
            if existing is None:
                db.add(models.TaxRule(
                    assessment_year=year,
                    rule_type="rebate",
                    rule_code=r["code"],
                    name=r["name"],
                    description=None,
                    limit_amount=r["limit"],
                    eligibility_rule=json.dumps({"group": r["group"], "note": r["eligibility"]}),
                    document_requirement=r["doc"],
                    source_reference="HASiL (LHDN)",
                    version=1,
                    active=True,
                ))
    await db.commit()
    print("[tax-rules] seeded rules for years", SUPPORTED_YEARS, flush=True)
