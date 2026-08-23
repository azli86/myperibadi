"""Seeded Tax Rules for Malaysian resident individual income tax.
Source of truth for relief limits, brackets & rebates per assessment year.
All amounts in RM. These mirror HASiL (LHDN) schedule for the YA in question
and are loaded into the `tax_rules` table. They are intentionally NOT hard-coded
in the frontend."""

# ────────────────────────────────────────────────────────────────────────────
# Tax brackets for resident individuals (chargeable income).
# Each tuple: (lower, upper, rate). upper None = open-ended.
# ────────────────────────────────────────────────────────────────────────────
RESIDENT_BRACKETS_2024_2026 = [
    (0, 5000, 0),
    (5000, 20000, 1),
    (20000, 35000, 3),
    (35000, 50000, 6),
    (50000, 70000, 11),
    (70000, 100000, 19),
    (100000, 400000, 25),
    (400000, 600000, 26),
    (600000, 2000000, 28),
    (2000000, None, 30),
]

# ────────────────────────────────────────────────────────────────────────────
# Relief rules. name, code, limit (RM), group/category, doc requirement.
# ────────────────────────────────────────────────────────────────────────────
RELIEF_RULES_2026 = [
    # Individual
    {"code": "relief_individual", "name": "Diri Sendiri / Individual", "group": "personal", "limit": 9000,
     "doc": None, "eligibility": "All resident individuals."},
    {"code": "relief_epf_life", "name": "KWSP & Insurans Hayat (EPF + Life Insurance)", "group": "epf_insurance", "limit": 4000,
     "doc": "EPF statement / insurance statement", "eligibility": "EPF contributions + life insurance premiums."},
    {"code": "relief_medical_self", "name": "Perbelanjaan Perubatan Diri / Medical (Self)", "group": "medical", "limit": 10000,
     "doc": "Medical receipt / statement", "eligibility": "Serious illness medical expenses for self/spouse/child."},
    {"code": "relief_lifestyle", "name": "Gaya Hidup / Lifestyle", "group": "lifestyle", "limit": 2500,
     "doc": "Receipt", "eligibility": "Books, magazines, journals, newspapers, sports equipment, internet, smartphone, computer for personal use."},
    {"code": "relief_education_self", "name": "Yuran Pendidikan / Education (Self)", "group": "education", "limit": 2000,
     "doc": "Receipt / official payment slip", "eligibility": "Fees for approved courses of study at tertiary level."},
    {"code": "relief_childcare", "name": "Yuran Taska / Child Care", "group": "education", "limit": 3000,
     "doc": "Receipt", "eligibility": "Fees to registered childcare centre for a child under 6."},
    # Children
    {"code": "relief_child_under18", "name": "Anak Bawah 18 Tahun / Child (Under 18)", "group": "children", "limit": 2000,
     "doc": None, "eligibility": "Per child under 18, up to relevant count."},
    {"code": "relief_child_education", "name": "Anak 18+ / Pendidikan Tinggi / Child (18+ / Tertiary)", "group": "children", "limit": 8000,
     "doc": "Proof of enrolment", "eligibility": "Per child 18+ pursuing approved tertiary education."},
    {"code": "relief_child_disabled", "name": "Anak OKU / Disabled Child", "group": "children", "limit": 6000,
     "doc": "OKU card", "eligibility": "Per disabled child."},
    {"code": "relief_child_disabled_education", "name": "Anak OKU + Pendidikan / Disabled Child (Education)", "group": "children", "limit": 14000,
     "doc": "OKU card + enrolment", "eligibility": "Per disabled child pursuing approved tertiary education."},
    # Parents / family
    {"code": "relief_parents_medical", "name": "Perubatan Ibu Bapa / Parents Medical", "group": "parents", "limit": 10000,
     "doc": "Medical receipt", "eligibility": "Medical expenses for parents."},
    {"code": "relief_parents_care", "name": "Penjagaan Ibu Bapa / Parents Care", "group": "parents", "limit": 3000,
     "doc": "Documentation", "eligibility": "Expenses on caring for parents with illnesses/conditions."},
    # Other
    {"code": "relief_socso", "name": "PERKESO / SOCSO", "group": "other", "limit": 350,
     "doc": "SOCSO statement", "eligibility": "SOCSO contributions."},
    {"code": "relief_sspn", "name": "SSPN Simpanan Pendidikan / SSPN", "group": "other", "limit": 8000,
     "doc": "SSPN statement", "eligibility": "Net SSPN deposit."},
    {"code": "relief_breastfeeding", "name": "Perbelanjaan Susu Ibu / Breastfeeding Equipment", "group": "other", "limit": 1000,
     "doc": "Receipt", "eligibility": "Breastfeeding equipment (once every 2 years)."},
    {"code": "relief_treatment_fertility", "name": "Rawatan Kesuburan / Fertility Treatment", "group": "medical", "limit": 10000,
     "doc": "Medical receipt", "eligibility": "Fertility treatment costs."},
]

RELIEF_RULES_2025 = RELIEF_RULES_2026
RELIEF_RULES_2024 = RELIEF_RULES_2026
RELIEF_RULES_2027 = RELIEF_RULES_2026

# ────────────────────────────────────────────────────────────────────────────
# Rebate rules (reduce tax, not income). Zakat handled here, not reliefs.
# ────────────────────────────────────────────────────────────────────────────
REBATE_RULES = [
    {"code": "rebate_zakat", "name": "Zakat / Fitrah & Harta", "group": "zakat", "limit": None,
     "doc": "Zakat receipt", "eligibility": "Zakat paid to approved religious authority (eligible for Muslim taxpayers)."},
]


def build_rules_for_year(assessment_year: int) -> dict:
    """Return the full rule payload for a given assessment year."""
    brackets = RESIDENT_BRACKETS_2024_2026
    relief_rules = RELIEF_RULES_2026  # consistent across supported years
    return {
        "assessment_year": assessment_year,
        "effective": True,
        "source": "HASiL",
        "tax_brackets": brackets,
        "relief_rules": relief_rules,
        "rebate_rules": REBATE_RULES,
    }
