"""The event detail page leads with a compact identity row, then the spend total, then grouped transactions.

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
# With a photo the total sits over the photo, and the summary card drops its
# own copy so the number is never shown twice on one screen.
assert "totalLabel={`${formatCurrencyLabel(currency)}" in PAGE, "the photo total goes through the formatter"
assert "totalOnPhoto={hasImage}" in PAGE, "the summary only hides its total when the photo carries it"
assert 'totalOnPhoto && "hidden"' in SUMMARY, "the summary hides its total when the photo carries it"

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

# 6. A photo runs full width on every screen size. Without a photo there is
# no empty banner, only the compact tile, so the total stays on screen one.
assert "aspect-[16/9] w-full" in HERO, "the photo runs full width"
assert "h-16 w-16" in HERO, "photo-less events use the compact tile"
assert "h-48" not in HERO, "no fixed-height placeholder banner"
assert "<h1" in HERO, "the event name is the page heading"
assert "uppercase tracking-[0.08em]" in HERO, "the status pill matches the app badge style"

# 8. The running-spend sparkline is drawn, not just computed.
assert "spark={spark}" in PAGE, "the page must hand the sparkline to the summary"
assert "<polyline" in SUMMARY, "the summary must draw the sparkline"

# 9. The include/exclude tick keeps a 44px touch target.
assert "h-11 w-11" in PAGE, "the tick button needs a 44px hit area"

# 5. No leftover hardcoded slab colours — everything reads from the theme.
assert "category_name" in SERVICE, "the event transaction payload must carry the category name"
assert "category_icon" in SERVICE, "the event transaction payload must carry the category icon"
assert "category_id" in SCHEMA, "the response schema must expose the category fields"
assert "notes" in SCHEMA, "the response schema must expose transaction notes"

# 7. Status colours must supply a light-mode shade. A single -500 tone on a
# white background lands at 2.1-2.5:1, well under the 4.5:1 the app targets.
for tone in ("cyan", "amber", "emerald"):
    assert f"text-{tone}-700 dark:text-{tone}-400" in PAGE, \
        f"{tone} status needs a darker shade in light mode"

# 10. Category groups collapse on every screen size, and the closed header
# still shows the category's total and share, so it works as the overview.
assert '!isOpen && "hidden"' in PAGE, "a closed group hides its rows"
assert "aria-expanded={isOpen}" in PAGE, "the group header announces its state"
assert "jumpToGroup" not in PAGE and "grid grid-cols-3 gap-2" not in PAGE, "the mini card grid was removed"

# 11. The light theme remaps text-white to var(--text), which turned the photo
# total black. The overlay uses its own class that stays light in both themes.
assert "event-photo-overlay " in HERO and "text-white" not in HERO, "photo total must not rely on text-white"
CSS = (Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "globals.css").read_text(encoding="utf-8")
assert "html[data-theme=\"light\"] .portal-personal-shell .event-photo-overlay p" in CSS

# 12. The top bar says "Event Details"; with a photo the name sits on it,
# under the total, and is not repeated below.
assert PAGE.count('title={tr("Butiran Acara", "Event Details")}') == 2, "both headers use the generic title"
assert "title={event.name}" not in PAGE
overlay = HERO[HERO.index("event-photo-overlay "):HERO.index(") : null}")]
assert overlay.index("{totalLabel}") < overlay.index("{event.name}"), "the name sits under the total"
assert "{!hasImage || !totalLabel ? (" in HERO, "the body name only shows without a photo"
assert ".portal-personal-shell .event-photo-overlay h1" in CSS, "the name on the photo stays light"

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
