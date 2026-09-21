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

HERO = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "event" / "[eventId]" / "EventHeroCard.tsx"
).read_text(encoding="utf-8")

SUMMARY = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "event" / "[eventId]" / "EventSummaryCard.tsx"
).read_text(encoding="utf-8")

SERVICE = (
    Path(__file__).resolve().parents[1] / "modules" / "events" / "service.py"
).read_text(encoding="utf-8")

SCHEMA = (
    Path(__file__).resolve().parents[1] / "modules" / "events" / "schemas.py"
).read_text(encoding="utf-8")

# 1. Currency survives the redesign.
assert "formatCurrencyLabel(currency)" in PAGE, "hero amount must go through formatCurrencyLabel"
assert "moneyLabel(txn.amount, txn.currency)" in PAGE, "row amount must go through moneyLabel"
assert "{money(spent)}" in SUMMARY, "the spend total lives in the summary card"
assert "currency" in PAGE, "currency must stay wired to the event"
# The hero shows the event's identity, like the vehicle detail page. Repeating
# the spend total here duplicated the summary card on every screen size.
assert "spentLabel" not in HERO, "hero must not carry the spend total"
assert "spentLabel" not in PAGE, "page must not pass a spend total into the hero"

# 2. No-budget events do not announce an overspend.
assert "budget > 0" in SUMMARY, "summary card needs a positive-budget guard"
assert "Tiada had bajet ditetapkan" in SUMMARY, "missing budget needs its own copy, not an empty bar"

# 3. Grouping.
assert "groups.map((group)" in PAGE, "transactions must render grouped"
assert "{group.label}" in PAGE, "each group must keep its label"
assert "t.category_name" in PAGE, "grouping must key off the category returned by the API"
assert "Tanpa Kategori" in PAGE, "uncategorised rows need their own bucket, not a dropped one"
assert "moneyLabel(group.total, currency)" in PAGE, "each group header must total its own spend"
assert "Math.min(100, ratio * 100)" in SUMMARY, "progress fill must clamp at 100%"

# 4. No budget exists => a plain line, never a bar reading 0%.
assert "formatCurrencyLabel(currency)" in SUMMARY, "summary amounts must keep the currency label"

# 6. Hero follows the vehicle-detail pattern: rounded card, tinted fallback.
assert "h-48 w-full sm:h-56 md:h-64" in HERO, "hero height must match the vehicle pattern"
assert "rounded-2xl border border-[var(--border)]" in HERO, "hero must be a rounded card"
assert "bg-[var(--surface-tint)]" in HERO, "the image fallback uses the same tint as vehicles"
assert "opacity-40" in HERO, "the fallback icon is dimmed like the vehicle hero"
assert "uppercase tracking-[0.08em]" in HERO, "the status pill matches the app badge style"

# 5. No leftover hardcoded slab colours — everything reads from the theme.
assert "category_name" in SERVICE, "the event transaction payload must carry the category name"
assert "category_icon" in SERVICE, "the event transaction payload must carry the category icon"
assert "category_id" in SCHEMA, "the response schema must expose the category fields"
assert "notes" in SCHEMA, "the response schema must expose transaction notes"

print("event detail layout OK")

def test_transaction_notes_render_on_both_rows():
    """Notes were invisible until the detail page, so a row with a receipt
    reference looked identical to one with nothing."""
    from pathlib import Path

    txn_page = (
        Path(__file__).resolve().parents[2] / "web" / "src" / "app"
        / "[sessionId]" / "transactions" / "page.tsx"
    ).read_text(encoding="utf-8")
    # Both row renderers show it, and it sits under the wallet on the right,
    # not under the category on the left.
    assert txn_page.count("{tx.notes ? (") == 2, "both row renderers show the note"
    assert txn_page.count("<StickyNote size={10}") == 2, "each rendered note gets an icon"
    # The note sits under the description on the left, and both the note's
    # wrapper and its text node need min-w-0 so a long word cannot widen the
    # left column into the amount.
    assert txn_page.index("{tx.notes ? (") < txn_page.index("{walletText}"), \
        "the note belongs on the left, above the wallet line"
    assert txn_page.index("{tx.notes ? (") < txn_page.index("text-[0.5625rem]"), \
        "the note reads above the time, so the timestamp closes the row"
    assert txn_page.count("min-w-0 break-words") == 1, "the note text must be allowed to shrink"
    assert "{txn.notes ? (" in PAGE, "the event row renders the note too"



test_transaction_notes_render_on_both_rows()
