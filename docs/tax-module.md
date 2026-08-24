# Income Tax Module (MyPeribadi)

Cukai Pendapatan — organized tax info, EA/EC OCR, reliefs, rebates, estimated tax,
and e-Filing readiness. Does NOT submit on the user's behalf (final submission via MyTax/HASiL).

## Routes

UI: `/tax` (web), with a year selector (YA 2024–2027) and tabbed sub-screens:
Dashboard · Tax Profile · EA/EC · Income · Reliefs · Rebates · Transactions · Documents · Estimate · Summary.

API: `apps/api/modules/tax/` — prefix `/api/tax` (proxied by web gateway).

## Key design principles (from spec)

- **Assessment Year everywhere** — every tax object carries `assessment_year`; years are never overwritten.
- **Tax rules versioned & seeded** — `tax_rules` table seeded from `modules/tax/tax_rules_data.py`
  for YA 2024–2027 (brackets, reliefs, rebates). Frontend never hard-codes limits.
- **OCR → Review → Confirm** — EA/EC OCR (`ea_ocr.py`) returns a draft; data is used only after user confirms.
- **Relief vs Rebate are distinct** — reliefs reduce chargeable income; rebates (e.g. Zakat) reduce tax.
- **Zakat tracked via Rebate**, not relief.
- **TIN sensitive** — masked in UI, obfuscated at rest.
- **Duplicate protection** — `tax_transaction_links` unique constraint on (transaction, year, type, category);
  EA and manual PCB are not double-counted (PCB totals come from confirmed EA forms).
- **Delete Tax Year** preserves original MyPeribadi transactions; receipts only unlinked, not auto-deleted.

## Calculation pipeline (`tax_engine.py`)

Income → applicable adjustments → aggregate income → eligible reliefs → chargeable income
→ brackets → gross tax → rebates → tax payable → PCB paid → estimated balance/overpayment.

## Files

- `models.py` — 13 new tables (tax_rules, tax_profiles, tax_employers, tax_ea_forms,
  tax_income, tax_dependants, tax_reliefs, tax_relief_items, tax_rebates, tax_documents,
  tax_calculations, tax_transaction_links).
- `modules/tax/` — routes.py, schemas.py, service.py, tax_engine.py, ea_ocr.py,
  tax_rules_data.py, seed.py, tax_export.py (stdlib-only PDF generator).
- `main.py` — router registration + startup seed of tax_rules.
- `[sessionId]/tax/page.tsx` — web UI.

## Deploy

- API: `./restart_api.sh`
- Web: `./build_web.sh && ./restart_web.sh`

## Phase 2 additions

- **Dependants UI** — Tax Profile tab lets users add children (under18, 18+ education,
  disabled child/education) with 50%/100% relief percentage to drive child relief.
- **Calculation History** — `GET /tax/history` lists past persisted calculations
  (via the "Simpan Pengiraan" button on Summary tab, backed by `POST /tax/calculate`).
- **Tax Transaction linking** — Tax Transactions tab lets users pick a recent MyPeribadi
  transaction, choose tax type (relief/rebate/income) + claim amount, and set
  suggested/reviewed/accepted/rejected status.
- **Duplicate income warning** — Estimate tab warns when manual employment income exists
  for the same employer as a confirmed EA Form (potential double-count).
