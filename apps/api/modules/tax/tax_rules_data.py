"""Seeded Tax Rules for Malaysian individual income tax (HASiL / LHDN).
Source of truth for relief limits, brackets & rebates per assessment year.
All amounts in RM. These follow the HASiL schedule for resident individuals and
are loaded into the `tax_rules` table. They are intentionally NOT hard-coded
in the frontend, and a change here reaches existing databases on startup (see
seed.py), so a corrected limit is a one-line edit.

Verify against the HASiL public ruling for the year before relying on a figure:
reliefs are extended, merged or dropped in each Budget."""

# ────────────────────────────────────────────────────────────────────────────
# Tax brackets for resident individuals (chargeable income).
# Each tuple: (lower, upper, rate %). upper None = open-ended.
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

# A non-resident individual pays a flat rate on all income and has no reliefs or rebates.
NON_RESIDENT_RATE = 30

# ────────────────────────────────────────────────────────────────────────────
# Relief rules. `auto` marks a relief the engine applies from the tax profile or
# the dependants, so it is not claimed by hand. `shared` names a ceiling that
# several reliefs split between them.
# ────────────────────────────────────────────────────────────────────────────
RELIEF_RULES_2026 = [
    # Individual
    {"code": "relief_individual", "name": "Diri Sendiri & Saudara Tanggungan / Individual", "group": "personal", "limit": 9000,
     "doc": None, "eligibility": "Every resident individual. Applied automatically.", "auto": "individual"},
    {"code": "relief_disabled_self", "name": "Individu OKU (Tambahan) / Disabled Individual (Additional)", "group": "personal", "limit": 6000,
     "doc": "OKU card", "eligibility": "Additional relief for a disabled individual. Applied from the tax profile.", "auto": "disabled_self"},
    {"code": "relief_equipment_disabled", "name": "Peralatan Sokongan OKU / Disabled Support Equipment", "group": "medical", "limit": 6000,
     "doc": "Receipt", "eligibility": "Basic supporting equipment for a disabled self, spouse, child or parent."},

    # Spouse / family
    {"code": "relief_spouse", "name": "Suami / Isteri / Nafkah / Spouse", "group": "family", "limit": 4000,
     "doc": None, "eligibility": "A spouse with no income. Applied from the tax profile.", "auto": "spouse"},
    {"code": "relief_spouse_disabled", "name": "Suami / Isteri OKU (Tambahan) / Disabled Spouse (Additional)", "group": "family", "limit": 5000,
     "doc": "OKU card", "eligibility": "Additional relief for a disabled spouse."},
    {"code": "relief_alimony", "name": "Nafkah Bekas Isteri / Alimony to Former Wife", "group": "family", "limit": 4000,
     "doc": "Court order / payment proof", "eligibility": "Alimony paid to a former wife under a court order or agreement."},

    # Children: applied from the dependants added in the tax profile.
    {"code": "relief_child_under18", "name": "Anak Bawah 18 Tahun / Child (Under 18)", "group": "children", "limit": 2000,
     "doc": None, "eligibility": "Per unmarried child under 18. Applied from the dependants.", "auto": "child"},
    {"code": "relief_child_preuni", "name": "Anak 18+ (A-Level / Pra-U) / Child 18+ (Pre-University)", "group": "children", "limit": 2000,
     "doc": "Proof of enrolment", "eligibility": "Per unmarried child 18+ in A-Level, matriculation or pre-university. Applied from the dependants.", "auto": "child"},
    {"code": "relief_child_education", "name": "Anak 18+ (Diploma ke Atas) / Child 18+ (Diploma and Above)", "group": "children", "limit": 8000,
     "doc": "Proof of enrolment", "eligibility": "Per unmarried child 18+ in diploma level or higher. Applied from the dependants.", "auto": "child"},
    {"code": "relief_child_disabled", "name": "Anak OKU / Disabled Child", "group": "children", "limit": 6000,
     "doc": "OKU card", "eligibility": "Per disabled child. Applied from the dependants.", "auto": "child"},
    {"code": "relief_child_disabled_education", "name": "Anak OKU (Diploma ke Atas) / Disabled Child (Diploma and Above)", "group": "children", "limit": 14000,
     "doc": "OKU card + enrolment", "eligibility": "Per disabled child in diploma level or higher: RM6,000 plus RM8,000. Applied from the dependants.", "auto": "child"},
    {"code": "relief_childcare", "name": "Yuran Taska / Tadika / Child Care", "group": "children", "limit": 3000,
     "doc": "Receipt", "eligibility": "Fees to a registered childcare centre or kindergarten for a child up to 6."},
    {"code": "relief_breastfeeding", "name": "Peralatan Penyusuan Ibu / Breastfeeding Equipment", "group": "children", "limit": 1000,
     "doc": "Receipt", "eligibility": "Breastfeeding equipment for a child up to 2, once every 2 years."},

    # Parents
    {"code": "relief_parents_medical", "name": "Perubatan Ibu Bapa / Parents Medical", "group": "parents", "limit": 8000,
     "doc": "Medical receipt", "eligibility": "Medical treatment, special needs and carer expenses for parents, including up to RM1,000 for a medical examination."},

    # Medical: serious illness and fertility share one ceiling.
    {"code": "relief_medical_self", "name": "Perubatan Penyakit Serius, Vaksin & Pergigian / Medical (Serious Illness, Vaccination, Dental)", "group": "medical", "limit": 10000,
     "doc": "Medical receipt / statement", "eligibility": "Serious illness, vaccination, dental and mental health expenses for self, spouse and child. A medical examination counts up to RM1,000.",
     "shared": "medical_serious", "shared_limit": 10000},
    {"code": "relief_treatment_fertility", "name": "Rawatan Kesuburan / Fertility Treatment", "group": "medical", "limit": 10000,
     "doc": "Medical receipt", "eligibility": "Fertility treatment for self or spouse. Shares the RM10,000 medical ceiling.",
     "shared": "medical_serious", "shared_limit": 10000},

    # EPF, insurance and savings
    {"code": "relief_epf_life", "name": "KWSP / EPF", "group": "epf_insurance", "limit": 4000,
     "doc": "EPF statement", "eligibility": "Employee EPF contribution. Taken from a confirmed EA form unless you enter a figure.", "from_ea": "epf_amount"},
    {"code": "relief_life_insurance", "name": "Insurans Hayat / Life Insurance", "group": "epf_insurance", "limit": 3000,
     "doc": "Insurance statement", "eligibility": "Life insurance and takaful premiums, together with the EPF relief up to RM7,000 in all."},
    {"code": "relief_prs", "name": "PRS & Anuiti Tertangguh / PRS and Deferred Annuity", "group": "epf_insurance", "limit": 3000,
     "doc": "PRS statement", "eligibility": "Contributions to an approved Private Retirement Scheme or a deferred annuity."},
    {"code": "relief_insurance_edu_medical", "name": "Insurans Pendidikan & Perubatan / Education and Medical Insurance", "group": "epf_insurance", "limit": 4000,
     "doc": "Insurance statement", "eligibility": "Premiums for education or medical insurance."},
    {"code": "relief_socso", "name": "PERKESO & SIP / SOCSO and EIS", "group": "epf_insurance", "limit": 350,
     "doc": "SOCSO statement", "eligibility": "SOCSO and EIS contributions. Taken from a confirmed EA form unless you enter a figure.", "from_ea": "socso_amount"},
    {"code": "relief_sspn", "name": "SSPN Simpanan Pendidikan / SSPN Net Savings", "group": "education", "limit": 8000,
     "doc": "SSPN statement", "eligibility": "Net deposit into an SSPN account for a child's education."},

    # Education
    {"code": "relief_education_self", "name": "Yuran Pengajian Sendiri / Education Fees (Self)", "group": "education", "limit": 7000,
     "doc": "Receipt / official payment slip", "eligibility": "Approved law, accounting, technical, vocational, scientific or technology courses, or a masters or doctorate in any field. Up to RM2,000 of it may be for upskilling courses."},

    # Lifestyle
    {"code": "relief_lifestyle", "name": "Gaya Hidup / Lifestyle", "group": "lifestyle", "limit": 2500,
     "doc": "Receipt", "eligibility": "Books, journals, newspapers, a smartphone, computer or tablet, internet subscription and skill-enhancement courses."},
    {"code": "relief_sports", "name": "Sukan / Sports", "group": "lifestyle", "limit": 1000,
     "doc": "Receipt", "eligibility": "Sports equipment, gym membership, sports competition and training fees."},
    {"code": "relief_ev_charging", "name": "Pengecasan Kenderaan Elektrik / EV Charging", "group": "lifestyle", "limit": 2500,
     "doc": "Receipt", "eligibility": "Purchase, installation, rental or subscription of an EV charging facility (not for business use)."},
]

# Reliefs that were seeded before and are not part of the HASiL schedule any more.
# They are switched off, so a claim left on one is no longer counted.
RETIRED_RELIEF_CODES = ["relief_parents_care"]

RELIEF_RULES_2025 = RELIEF_RULES_2026
RELIEF_RULES_2024 = RELIEF_RULES_2026
RELIEF_RULES_2027 = RELIEF_RULES_2026

# ────────────────────────────────────────────────────────────────────────────
# Rebate rules (reduce tax, not income). Zakat is deducted from the tax itself.
# ────────────────────────────────────────────────────────────────────────────
REBATE_RULES = [
    {"code": "rebate_individual", "name": "Rebat Individu / Individual Rebate", "group": "personal", "limit": 400,
     "doc": None, "eligibility": "RM400 off the tax when chargeable income is RM35,000 or less. Applied automatically.",
     "auto": "individual", "chargeable_max": 35000},
    {"code": "rebate_zakat", "name": "Zakat Fitrah & Harta / Zakat (Fitrah and Wealth)", "group": "zakat", "limit": None,
     "doc": "Zakat receipt", "eligibility": "Zakat paid to an approved religious authority. Deducted ringgit for ringgit from the tax."},
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
