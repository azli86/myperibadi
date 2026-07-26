# Plan: Safely Fix Duplicate Household Creation

## Goal
Stop new duplicate households first, then clean existing duplicates only after proving they contain no real user data. Reset-cycle work remains on hold.

## Current findings
- Intended model: 1 user should have 1 canonical household via `users.default_household_id`.
- Actual DB snapshot:
  - total users: 582
  - users with no `default_household_id`: 30
  - users with >1 household membership: 436
  - non-default duplicate households: 1095
  - no household is shared by multiple users (`users_per_household = 1` for all checked households)
- Non-default duplicate household contents:
  - `categories`: 10,942
  - `category_keywords`: 31,755
  - common seeded/system categories: `Makanan & Minuman`, `Pengangkutan`, `Pendapatan`, `Lain-lain`, `Transfer Wallet`, `Debt In`, `Debt Out`, `Loan / Komitmen`
  - real domain data currently audited as 0 on non-default households: budgets, wallets, loans, subscriptions, vehicles, warranties
- Likely race source: `whatsapp_service.ensure_standard_categories()` checks `user.default_household_id`; if empty, concurrent requests can all create `Household` + `HouseholdMember` before one final request writes `default_household_id`.

## Safety principle
Do **not** delete anything until all of these are true:
1. DB backup/snapshot exists.
2. New duplicate creation is fixed in code.
3. Readonly audit confirms non-default duplicate households contain only auto-seeded category/template data.
4. Dry-run cleanup output is reviewed.
5. Cleanup script has hard abort guards for any real user data.

## Implementation phases

### Phase 1 — Stop new duplicates, no cleanup
Update the bootstrap path only:
- In `whatsapp_service.ensure_standard_categories()`, lock the user row before checking `default_household_id`, e.g. `SELECT ... FOR UPDATE` / SQLAlchemy `.with_for_update()`.
- After the lock, re-check `default_household_id`.
- Create household only if it is still missing.
- Ensure membership for the default household exists idempotently.
- Do not delete existing duplicate households in this phase.

Validation for Phase 1:
- Repeated calls for the same user do not create extra households.
- Concurrent calls for a user with null default create exactly one household and one membership.
- Existing user with a default household but missing membership gets membership restored, not a new household.

### Phase 2 — Add audit-only script
Create a readonly audit command/script that reports:
- users with `default_household_id IS NULL`
- users with membership count != 1
- households with more than 1 user
- non-default households per user
- counts of every table with `household_id` on non-default households
- counts of categories and category keywords on non-default households

The audit must explicitly classify each non-default household as either:
- `SAFE_SEEDED_ONLY`
- `HAS_REAL_DATA_ABORT`
- `UNKNOWN_ABORT`

### Phase 3 — Backup + dry-run cleanup only
Before any cleanup execution:
- Take DB backup/snapshot.
- Run audit and save output.
- Run cleanup in dry-run mode.

Dry-run must print, per user:
- canonical household kept (`users.default_household_id`)
- non-default household IDs proposed for deletion
- record counts that would be deleted: household_members, categories, category_keywords, households
- any blocking real data found

Dry-run must not mutate DB.

### Phase 4 — Execute conservative cleanup
Only if dry-run is clean:
For each user with `default_household_id`:
1. Keep `users.default_household_id` household.
2. Ensure exactly one membership exists for `(default_household_id, user_id)`.
3. For each non-default household for that same user:
   - abort if any real domain data exists, including but not limited to budgets, wallets, loans, subscriptions, vehicles, warranties, transactions if applicable, debts/debtors/checkoffs/places or any table with `household_id` not explicitly classified as seed-only.
   - delete category keywords under categories in that household.
   - delete categories in that household.
   - delete household_members for that household.
   - delete household.

For users with `default_household_id IS NULL`:
- If exactly one membership exists, set it as default after audit.
- If zero memberships exist, create one household through the fixed bootstrap path.
- If multiple memberships exist, abort and report; do not guess.

### Phase 5 — Constraints after cleanup, not before
After cleanup passes validation, add DB guards.
Minimum safe constraints:
- unique `(household_id, user_id)` on `household_members`

Only add these if the product decision remains strictly “1 user = 1 household”:
- unique `household_members.user_id`
- unique `households.owner_user_id`

Do not add strict uniqueness before cleanup.

## Post-cleanup validation
Expected results:
- every active user has `default_household_id`
- every active user has exactly 1 household membership
- every household has exactly 1 user
- no non-default household remains for a user
- budget page still loads
- category list still loads
- wallet page still loads
- WhatsApp category matching still works
- no transaction/budget/wallet counts changed unexpectedly

## Rollback plan
- If audit/dry-run finds real data, do not execute cleanup.
- If cleanup execution fails mid-run, rollback transaction if running inside one transaction; otherwise restore DB backup/snapshot.
- Keep pre-cleanup audit output for comparison.

## Explicit non-goals
- Do not implement reset-cycle setting yet.
- Do not redesign sharing/family household.
- Do not merge real domain data between households unless future audit proves such data exists and a separate merge plan is approved.
