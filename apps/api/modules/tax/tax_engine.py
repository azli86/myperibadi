"""Tax calculation engine.

Pipeline:
  Income -> adjustments -> aggregate income -> eligible reliefs
  -> chargeable income -> tax rates -> gross tax -> rebates
  -> tax payable -> tax already paid (PCB) -> estimated balance.

All rates/limits come from Tax Rules for the assessment year (NOT hard-coded).
"""

from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


def _r2(value) -> float:
    """Round a numeric value to 2 decimal places (RM)."""
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_tax_from_brackets(chargeable_income: float, brackets) -> float:
    """Compute gross tax from a list of (lower, upper, rate) tuples."""
    income = Decimal(str(chargeable_income))
    tax = Decimal("0")
    for lower, upper, rate in brackets:
        lower = Decimal(str(lower))
        rate = Decimal(str(rate)) / Decimal("100")
        if income <= lower:
            break
        band = (Decimal(str(upper)) - lower) if upper is not None else income - lower
        taxable_in_band = min(income - lower, band)
        tax += taxable_in_band * rate
        if upper is not None and income <= Decimal(str(upper)):
            break
    return float(tax)


async def get_active_relief_rules(db: AsyncSession, assessment_year: int) -> list[models.TaxRule]:
    res = await db.execute(
        select(models.TaxRule).where(
            models.TaxRule.assessment_year == assessment_year,
            models.TaxRule.rule_type == "relief",
            models.TaxRule.active.is_(True),
        )
    )
    return list(res.scalars().all())


async def get_active_rebate_rules(db: AsyncSession, assessment_year: int) -> list[models.TaxRule]:
    res = await db.execute(
        select(models.TaxRule).where(
            models.TaxRule.assessment_year == assessment_year,
            models.TaxRule.rule_type == "rebate",
            models.TaxRule.active.is_(True),
        )
    )
    return list(res.scalars().all())


async def get_brackets(db: AsyncSession, assessment_year: int) -> list:
    res = await db.execute(
        select(models.TaxRule).where(
            models.TaxRule.assessment_year == assessment_year,
            models.TaxRule.rule_type == "bracket",
            models.TaxRule.active.is_(True),
        )
    )
    rows = res.scalars().all()
    if not rows:
        return []
    first = rows[0]
    raw = first.calculation_rule
    try:
        return json.loads(raw) if raw else []
    except Exception:
        return []


async def sum_reliefs(db: AsyncSession, user_id: str, assessment_year: int) -> dict:
    """Sum claimed reliefs by group, capped at rule limits."""
    res = await db.execute(
        select(models.TaxRelief).where(
            models.TaxRelief.user_id == user_id,
            models.TaxRelief.assessment_year == assessment_year,
        )
    )
    claims = list(res.scalars().all())
    rules = await get_active_relief_rules(db, assessment_year)
    rule_map = {r.rule_code: r for r in rules}

    total = 0.0
    by_code = {}
    by_group: dict[str, float] = {}
    for claim in claims:
        rule = rule_map.get(claim.relief_code)
        limit = float(rule.limit_amount) if (rule and rule.limit_amount is not None) else None
        eligible = float(claim.eligible_amount if claim.eligible_amount else claim.claimed_amount)
        if limit is not None:
            eligible = min(eligible, limit)
        by_code[claim.relief_code] = _r2(eligible)
        total += float(eligible)
        if rule and rule.eligibility_rule:
            group = _group_from_json(rule.eligibility_rule)
        else:
            group = "other"
        by_group[group] = _r2(by_group.get(group, 0) + float(eligible))

    return {"total": _r2(total), "by_code": by_code, "by_group": by_group}


def _group_from_json(eligibility_json: str) -> str:
    try:
        data = json.loads(eligibility_json)
        return data.get("group", "other")
    except Exception:
        return "other"


async def sum_rebates(db: AsyncSession, user_id: str, assessment_year: int) -> float:
    res = await db.execute(
        select(models.TaxRebate).where(
            models.TaxRebate.user_id == user_id,
            models.TaxRebate.assessment_year == assessment_year,
        )
    )
    return _r2(sum((r.amount or 0) for r in res.scalars().all()))


async def sum_income(db: AsyncSession, user_id: str, assessment_year: int) -> tuple[float, float]:
    """Returns (total_gross, total_taxable)."""
    res = await db.execute(
        select(models.TaxIncome).where(
            models.TaxIncome.user_id == user_id,
            models.TaxIncome.assessment_year == assessment_year,
            models.TaxIncome.status == "confirmed",
        )
    )
    rows = list(res.scalars().all())
    gross = _r2(sum((r.gross_amount or 0) for r in rows))
    taxable = _r2(sum((r.taxable_amount or r.gross_amount or 0) for r in rows))
    return gross, taxable


async def sum_pcb(db: AsyncSession, user_id: str, assessment_year: int) -> float:
    """PCB/MTD paid = sum across confirmed EA forms (plus any manual PCB lines)."""
    res = await db.execute(
        select(models.TaxEAForm).where(
            models.TaxEAForm.user_id == user_id,
            models.TaxEAForm.assessment_year == assessment_year,
            models.TaxEAForm.review_status == "confirmed",
        )
    )
    ea_total = sum((f.pcb_amount or 0) for f in res.scalars().all())
    # Manual PCB records are stored as income? No — store as rebate? Actually PCB is not a rebate.
    # We'll add a dedicated PCB total here via EA + any manual additions stored in tax_ea_forms pcb_amount.
    return _r2(ea_total)


async def calculate(db: AsyncSession, user_id: str, assessment_year: int) -> dict:
    """Run the full estimate pipeline and return the breakdown."""
    brackets = await get_brackets(db, assessment_year)
    gross, taxable = await sum_income(db, user_id, assessment_year)
    relief_data = await sum_reliefs(db, user_id, assessment_year)
    relief_total = relief_data["total"]
    rebate_total = await sum_rebates(db, user_id, assessment_year)

    chargeable = _r2(taxable - relief_total)
    if chargeable < 0:
        chargeable = 0.0

    gross_tax = _r2(compute_tax_from_brackets(chargeable, brackets))
    net_tax = _r2(gross_tax - rebate_total)
    if net_tax < 0:
        net_tax = 0.0

    pcb_total = await sum_pcb(db, user_id, assessment_year)
    # positive balance = overpayment; negative = tax to pay
    estimated_balance = _r2(pcb_total - net_tax)

    result = {
        "assessment_year": assessment_year,
        "income_total": _r2(gross),
        "taxable_income": taxable,
        "relief_total": relief_total,
        "relief_by_group": relief_data["by_group"],
        "chargeable_income": chargeable,
        "gross_tax": gross_tax,
        "rebate_total": rebate_total,
        "net_tax": net_tax,
        "pcb_total": pcb_total,
        "estimated_balance": estimated_balance,  # + overpayment, - tax to pay
        "status": "estimated",
    }
    return result
