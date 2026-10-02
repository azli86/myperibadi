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


# A dependant record maps onto the child relief it claims.
CHILD_RELIEF_CODE = {
    "under18": "relief_child_under18",
    "preuniversity18plus": "relief_child_preuni",
    "education18plus": "relief_child_education",
    "disabled_child": "relief_child_disabled",
    "disabled_education": "relief_child_disabled_education",
}
NON_RESIDENT_RATE = 30


def _extra(rule) -> dict:
    """The machine-readable part of a rule's eligibility JSON."""
    try:
        data = json.loads(rule.eligibility_rule) if (rule is not None and rule.eligibility_rule) else {}
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _group_from_json(eligibility_json: str) -> str:
    try:
        return json.loads(eligibility_json).get("group", "other")
    except Exception:
        return "other"


async def get_profile(db: AsyncSession, user_id: str, assessment_year: int):
    return (await db.execute(
        select(models.TaxProfile).where(
            models.TaxProfile.user_id == user_id,
            models.TaxProfile.assessment_year == assessment_year,
        )
    )).scalars().first()


async def get_dependants(db: AsyncSession, profile) -> list:
    if profile is None:
        return []
    return list((await db.execute(
        select(models.TaxDependant).where(models.TaxDependant.tax_profile_id == profile.id)
    )).scalars().all())


async def ea_totals(db: AsyncSession, user_id: str, assessment_year: int) -> dict:
    """What the confirmed EA forms add up to."""
    rows = list((await db.execute(
        select(models.TaxEAForm).where(
            models.TaxEAForm.user_id == user_id,
            models.TaxEAForm.assessment_year == assessment_year,
            models.TaxEAForm.review_status == "confirmed",
        )
    )).scalars().all())
    return {
        "epf_amount": _r2(sum((f.epf_amount or 0) for f in rows)),
        "socso_amount": _r2(sum((f.socso_amount or 0) for f in rows)),
        "zakat_amount": _r2(sum((f.zakat_amount or 0) for f in rows)),
        "pcb_amount": _r2(sum((f.pcb_amount or 0) for f in rows)),
    }


def is_resident(profile) -> bool:
    return (getattr(profile, "residency_status", None) or "resident") != "non_resident"


def auto_relief_amounts(profile, dependants: list, rule_map: dict) -> dict:
    """Reliefs the profile and dependants entitle the taxpayer to, without a claim."""
    def limit(code: str) -> float:
        rule = rule_map.get(code)
        return float(rule.limit_amount) if (rule is not None and rule.limit_amount is not None) else 0.0

    out: dict[str, float] = {}
    if "relief_individual" in rule_map:
        out["relief_individual"] = limit("relief_individual")
    if profile is not None and profile.disabled_status and "relief_disabled_self" in rule_map:
        out["relief_disabled_self"] = limit("relief_disabled_self")
    if (
        profile is not None
        and profile.marital_status == "married"
        and profile.spouse_income_status == "no_income"
        and "relief_spouse" in rule_map
    ):
        out["relief_spouse"] = limit("relief_spouse")
    for dep in dependants:
        code = CHILD_RELIEF_CODE.get(dep.dependant_type)
        if code and code in rule_map:
            share = (dep.relief_percentage or 100) / 100.0
            out[code] = _r2(out.get(code, 0.0) + limit(code) * share)
    return out


async def compute_reliefs(db: AsyncSession, user_id: str, assessment_year: int, profile, dependants: list, ea: dict) -> dict:
    """Every relief that counts, capped at its limit and at any ceiling it shares."""
    rules = await get_active_relief_rules(db, assessment_year)
    rule_map = {r.rule_code: r for r in rules}
    claims = list((await db.execute(
        select(models.TaxRelief).where(
            models.TaxRelief.user_id == user_id,
            models.TaxRelief.assessment_year == assessment_year,
        )
    )).scalars().all())

    lines: dict[str, dict] = {}

    def put(code: str, amount: float, *, auto: bool, source: str) -> None:
        rule = rule_map[code]
        lines[code] = {"code": code, "name": rule.name, "amount": _r2(amount), "auto": auto, "source": source, "group": _group_from_json(rule.eligibility_rule or "")}

    auto_codes = {code for code, rule in rule_map.items() if _extra(rule).get("auto") in {"individual", "disabled_self", "spouse", "child"}}

    # Claims made by hand. A retired rule is not in the map, so its claim is ignored;
    # a relief the profile decides is not taken from a claim.
    for claim in claims:
        rule = rule_map.get(claim.relief_code)
        if rule is None or claim.relief_code in auto_codes:
            continue
        amount = float(claim.eligible_amount if claim.eligible_amount else (claim.claimed_amount or 0))
        if rule.limit_amount is not None:
            amount = min(amount, float(rule.limit_amount))
        if amount > 0:
            put(claim.relief_code, amount, auto=False, source="manual")

    # EPF and SOCSO come from the EA form when nothing was entered.
    for code, rule in rule_map.items():
        field = _extra(rule).get("from_ea")
        if field and code not in lines and ea.get(field, 0) > 0:
            amount = min(ea[field], float(rule.limit_amount)) if rule.limit_amount is not None else ea[field]
            put(code, amount, auto=True, source="ea")

    if is_resident(profile):
        for code, amount in auto_relief_amounts(profile, dependants, rule_map).items():
            if amount > 0:
                put(code, amount, auto=True, source="profile")
    else:
        lines.clear()  # a non-resident has no reliefs

    # Reliefs that share one ceiling split it between them.
    shared: dict[str, list[str]] = {}
    for code in lines:
        key = _extra(rule_map[code]).get("shared")
        if key:
            shared.setdefault(key, []).append(code)
    for key, codes in shared.items():
        ceiling = float(_extra(rule_map[codes[0]]).get("shared_limit") or 0)
        total = sum(lines[c]["amount"] for c in codes)
        if ceiling and total > ceiling:
            for c in codes:
                lines[c]["amount"] = _r2(lines[c]["amount"] * ceiling / total)

    by_group: dict[str, float] = {}
    for line in lines.values():
        by_group[line["group"]] = _r2(by_group.get(line["group"], 0) + line["amount"])
    ordered = sorted(lines.values(), key=lambda l: (l["group"], l["code"]))
    return {
        "total": _r2(sum(l["amount"] for l in ordered)),
        "by_code": {l["code"]: l["amount"] for l in ordered},
        "by_group": by_group,
        "lines": ordered,
    }


async def sum_reliefs(db: AsyncSession, user_id: str, assessment_year: int) -> dict:
    """Total reliefs for the year (kept for callers that only need the sum)."""
    profile = await get_profile(db, user_id, assessment_year)
    ea = await ea_totals(db, user_id, assessment_year)
    return await compute_reliefs(db, user_id, assessment_year, profile, await get_dependants(db, profile), ea)


async def compute_rebates(db: AsyncSession, user_id: str, assessment_year: int, chargeable: float, resident: bool, ea: dict) -> list[dict]:
    """Rebates that come off the tax itself: zakat, and the RM400 individual rebate."""
    if not resident:
        return []
    rules = {r.rule_code: r for r in await get_active_rebate_rules(db, assessment_year)}
    lines: list[dict] = []
    manual = list((await db.execute(
        select(models.TaxRebate).where(
            models.TaxRebate.user_id == user_id,
            models.TaxRebate.assessment_year == assessment_year,
        )
    )).scalars().all())
    for row in manual:
        if (row.amount or 0) > 0:
            lines.append({"code": row.rebate_code, "name": row.name or row.rebate_code, "amount": _r2(row.amount), "auto": False, "source": row.source or "manual"})
    if ea.get("zakat_amount", 0) > 0:
        lines.append({"code": "rebate_zakat", "name": "Zakat melalui gaji / Zakat via salary", "amount": ea["zakat_amount"], "auto": True, "source": "ea"})
    rule = rules.get("rebate_individual")
    if rule is not None and rule.limit_amount is not None:
        ceiling = _extra(rule).get("chargeable_max")
        if chargeable > 0 and (ceiling is None or chargeable <= float(ceiling)):
            lines.append({"code": "rebate_individual", "name": rule.name, "amount": _r2(rule.limit_amount), "auto": True, "source": "profile"})
    return lines


async def sum_rebates(db: AsyncSession, user_id: str, assessment_year: int) -> float:
    ea = await ea_totals(db, user_id, assessment_year)
    profile = await get_profile(db, user_id, assessment_year)
    return _r2(sum(l["amount"] for l in await compute_rebates(db, user_id, assessment_year, 0, is_resident(profile), ea)))


async def sum_income(db: AsyncSession, user_id: str, assessment_year: int) -> tuple[float, float]:
    """Returns (total_gross, total_taxable).

    Taxable income is what was entered; without it, a business is gross less its
    allowable expenses and anything else is the gross. A taxable amount of zero is a
    real figure (expenses ate the income), not a missing one."""
    res = await db.execute(
        select(models.TaxIncome).where(
            models.TaxIncome.user_id == user_id,
            models.TaxIncome.assessment_year == assessment_year,
            models.TaxIncome.status == "confirmed",
        )
    )
    gross_total = 0.0
    taxable_total = 0.0
    for r in res.scalars().all():
        gross = float(r.gross_amount or 0)
        if r.taxable_amount is not None:
            taxable = float(r.taxable_amount)
        elif r.income_type == "business" and r.business_expenses is not None:
            taxable = max(0.0, gross - float(r.business_expenses))
        else:
            taxable = gross
        gross_total += gross
        taxable_total += taxable
    return _r2(gross_total), _r2(taxable_total)


async def sum_pcb(db: AsyncSession, user_id: str, assessment_year: int) -> float:
    """PCB/MTD paid: the total on the confirmed EA forms."""
    return (await ea_totals(db, user_id, assessment_year))["pcb_amount"]


def bracket_lines(chargeable_income: float, brackets) -> list[dict]:
    """How the tax builds up, band by band."""
    income = Decimal(str(chargeable_income))
    out: list[dict] = []
    for lower, upper, rate in brackets:
        low = Decimal(str(lower))
        if income <= low:
            break
        top = Decimal(str(upper)) if upper is not None else income
        taxable = min(income, top) - low
        out.append({
            "from": float(low),
            "to": float(upper) if upper is not None else None,
            "rate": float(rate),
            "taxable": _r2(taxable),
            "tax": _r2(taxable * Decimal(str(rate)) / Decimal("100")),
        })
    return out


async def calculate(db: AsyncSession, user_id: str, assessment_year: int) -> dict:
    """Run the full estimate pipeline and return the breakdown."""
    brackets = await get_brackets(db, assessment_year)
    profile = await get_profile(db, user_id, assessment_year)
    resident = is_resident(profile)
    dependants = await get_dependants(db, profile)
    ea = await ea_totals(db, user_id, assessment_year)
    gross, taxable = await sum_income(db, user_id, assessment_year)

    relief_data = await compute_reliefs(db, user_id, assessment_year, profile, dependants, ea)
    relief_total = relief_data["total"]
    chargeable = max(0.0, _r2(taxable - relief_total))

    if resident:
        gross_tax = _r2(compute_tax_from_brackets(chargeable, brackets))
        bands = bracket_lines(chargeable, brackets)
    else:
        gross_tax = _r2(chargeable * NON_RESIDENT_RATE / 100)
        bands = [{"from": 0.0, "to": None, "rate": float(NON_RESIDENT_RATE), "taxable": chargeable, "tax": gross_tax}] if chargeable else []

    rebate_lines = await compute_rebates(db, user_id, assessment_year, chargeable, resident, ea)
    rebate_available = _r2(sum(l["amount"] for l in rebate_lines))
    rebate_total = min(rebate_available, gross_tax)
    net_tax = max(0.0, _r2(gross_tax - rebate_total))

    pcb_total = ea["pcb_amount"]
    # positive balance = overpayment; negative = tax to pay
    estimated_balance = _r2(pcb_total - net_tax)

    return {
        "assessment_year": assessment_year,
        "residency_status": "resident" if resident else "non_resident",
        "income_total": _r2(gross),
        "taxable_income": taxable,
        "relief_total": relief_total,
        "relief_by_group": relief_data["by_group"],
        "relief_lines": relief_data["lines"],
        "chargeable_income": chargeable,
        "gross_tax": gross_tax,
        "bracket_lines": bands,
        "rebate_total": rebate_total,
        "rebate_available": rebate_available,
        "rebate_lines": rebate_lines,
        "net_tax": net_tax,
        "pcb_total": pcb_total,
        "estimated_balance": estimated_balance,  # + overpayment, - tax to pay
        "status": "estimated",
    }
