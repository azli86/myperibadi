"""The event detail page leads with a hero, then a sheet, then grouped transactions.

Pinned here:

1. Spending is rendered through the currency formatter, not string-concatenated.
   The page is a finance screen, so RM must survive any visual redesign.

2. The budget block only mounts when a budget exists. `remaining` is null without
   a limit, and `Math.abs(null || 0)` renders "Over by RM 0" if the guard slips.

3. Transactions are grouped, and every group keeps its own header. Flattening
   back to one list would silently drop the month labels.

Run: cd apps/api && venv/bin/python -m tests.test_event_detail_layout
"""
from pathlib import Path

PAGE = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "event" / "[eventId]" / "page.tsx"
).read_text(encoding="utf-8")

CSS = (Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "globals.css").read_text(encoding="utf-8")

# 1. Currency survives the redesign.
assert "formatCurrencyLabel(currency)" in PAGE, "hero amount must go through formatCurrencyLabel"
assert "moneyLabel(txn.amount, txn.currency)" in PAGE, "row amount must go through moneyLabel"
assert "currency" in PAGE, "currency must stay wired to the event"

# 2. No-budget events do not announce an overspend.
assert "event.budget != null && Number(event.budget) > 0" in PAGE, "budget block needs a positive-budget guard"
spent_index = PAGE.index("Perbelanjaan Perjalanan")
budget_index = PAGE.index("Daripada bajet")
assert spent_index < budget_index, "spent leads, budget follows"

# 3. Grouping.
assert "groups.map((group)" in PAGE, "transactions must render grouped"
assert "{group.label}" in PAGE, "each group must keep its label"
assert "Math.min(100, stats.ratio * 100)" in PAGE, "progress fill must clamp at 100%"

# 4. No budget exists => a plain line, never a bar reading 0%.
assert "Tiada had bajet" in PAGE, "missing budget needs its own copy, not an empty bar"

# 5. The summary slab reads its colours from tokens so both themes work.
assert "var(--summary-bg)" in PAGE, "summary slab must use the theme token"
assert "--summary-bg" in CSS, "token must be defined"
assert CSS.count("--summary-bg") >= 2, "token must exist in both themes"

print("event detail layout OK")
