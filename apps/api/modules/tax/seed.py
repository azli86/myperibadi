"""Seed the tax_rules table from tax_rules_data for supported assessment years.

Seeding is an upsert: a rule that already exists is brought in line with
tax_rules_data (name, limit, notes), so a corrected figure reaches a database that
was seeded earlier. Rules the schedule no longer has are switched off, not deleted,
so old claims stay on file."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from modules.tax.tax_rules_data import (
    REBATE_RULES,
    RELIEF_RULES_2026,
    RESIDENT_BRACKETS_2024_2026,
    RETIRED_RELIEF_CODES,
)

SUPPORTED_YEARS = [2024, 2025, 2026, 2027]

_EXTRA_KEYS = ("auto", "shared", "shared_limit", "from_ea", "chargeable_max")


def _eligibility_json(rule: dict) -> str:
    data = {"group": rule["group"], "note": rule["eligibility"]}
    for key in _EXTRA_KEYS:
        if rule.get(key) is not None:
            data[key] = rule[key]
    return json.dumps(data)


async def _upsert_rule(db: AsyncSession, year: int, rule_type: str, rule: dict) -> None:
    row = (await db.execute(
        select(models.TaxRule).where(
            models.TaxRule.assessment_year == year,
            models.TaxRule.rule_type == rule_type,
            models.TaxRule.rule_code == rule["code"],
        )
    )).scalars().first()
    if row is None:
        row = models.TaxRule(
            assessment_year=year,
            rule_type=rule_type,
            rule_code=rule["code"],
            source_reference="HASiL (LHDN)",
            version=1,
        )
        db.add(row)
    row.name = rule["name"]
    row.limit_amount = rule["limit"]
    row.eligibility_rule = _eligibility_json(rule)
    row.document_requirement = rule["doc"]
    row.active = True


async def seed_tax_rules(db: AsyncSession) -> None:
    """Idempotently seed tax rules for all supported assessment years."""
    for year in SUPPORTED_YEARS:
        brackets = (await db.execute(
            select(models.TaxRule).where(
                models.TaxRule.assessment_year == year,
                models.TaxRule.rule_type == "bracket",
            )
        )).scalars().first()
        if brackets is None:
            brackets = models.TaxRule(
                assessment_year=year,
                rule_type="bracket",
                rule_code="resident_brackets",
                name="Kadar Cukai Pendapatan Individu (Residen)",
                description="Progressive resident individual income tax brackets.",
                source_reference="HASiL (LHDN)",
                version=1,
                active=True,
            )
            db.add(brackets)
        brackets.calculation_rule = json.dumps(RESIDENT_BRACKETS_2024_2026)

        for rule in RELIEF_RULES_2026:
            await _upsert_rule(db, year, "relief", rule)
        for rule in REBATE_RULES:
            await _upsert_rule(db, year, "rebate", rule)

        for code in RETIRED_RELIEF_CODES:
            retired = (await db.execute(
                select(models.TaxRule).where(
                    models.TaxRule.assessment_year == year,
                    models.TaxRule.rule_type == "relief",
                    models.TaxRule.rule_code == code,
                )
            )).scalars().first()
            if retired is not None:
                retired.active = False
    await db.commit()
    print("[tax-rules] seeded rules for years", SUPPORTED_YEARS, flush=True)
