"""Pin the mobile sheet nav list.

The destinations went through several shapes: two cards of icon tiles with headings and
module counts, then one merged tile grid, then back to a card. Tiles put every destination in
a grid you had to read across, which is the wrong shape for a list of names — the labels are
different lengths and the eye has no column to follow.

It is now a plain vertical list: one row per destination, icon left, name, chevron right. No
card around it, no grid. The Maps, Connector and Support cards below are untouched.

Run: cd apps/api && venv/bin/python -m tests.test_sheet_personal_tools
"""
import re
from pathlib import Path

SHELL = (
    Path(__file__).resolve().parents[2]
    / "web"
    / "src"
    / "components"
    / "layout"
    / "Shell.tsx"
).read_text(encoding="utf-8")

LIST = SHELL[SHELL.index("Nav list: one row per destination") : SHELL.index("SheetCard 3:")]
TAIL = SHELL[SHELL.index("SheetCard 3:") : SHELL.index("SheetCard 6:") if "SheetCard 6:" in SHELL else len(SHELL)]


def hrefs(card: str) -> list[str]:
    return re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', card)


def test_it_is_a_list_not_a_grid():
    assert "grid grid-cols" not in LIST, "the nav must not be a grid"
    assert "flex w-full items-center" in LIST, "rows should be full-width flex rows"


def test_it_is_not_wrapped_in_a_card():
    assert "<section" not in LIST, "the list must not sit inside a card section"
    assert "rounded-3xl border border-[var(--border)] p-4" not in LIST


def test_the_other_cards_are_untouched():
    # Maps and Support are sections; Connector is a standalone button.
    for card in ("SheetCard 3:", "SheetCard 4:", "SheetCard 5:"):
        assert card in TAIL, f"{card} disappeared"
    assert TAIL.count("<section") == 2
    assert "Connector Hub" in TAIL


def test_every_previous_destination_survives_once():
    expected = {
        "budget",
        "wallet-settings",
        "bank-reconciliation",
        "tax",
        "categories",
        "subscription",
        "loan",
        "bnpl",
        "split-bills",
        "debt",
        "vehicle",
        "inventory",
        "warranty",
        "event",
        "health",
        "badges",
        "receipts",
    }
    actual = set(hrefs(LIST))
    assert actual == expected, f"lost {expected - actual}, invented {actual - expected}"
    found = hrefs(LIST)
    assert all(found.count(h) == 1 for h in found), "a target is listed twice"


def test_the_calculator_still_opens_a_panel():
    assert 'action: "calculator"' in LIST
    assert "setShowCalculator(true)" in LIST
    assert "requestMobileMenuClose()" in LIST, "the sheet has to close behind the panel"


def test_the_ai_badge_is_kept():
    assert "item.badge" in LIST, "the AI tag on Reconcile must survive"


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    missing = [h for h in hrefs(LIST) if not (root / h).exists()]
    assert not missing, f"links to pages that do not exist: {missing}"


if __name__ == "__main__":
    test_it_is_a_list_not_a_grid()
    test_it_is_not_wrapped_in_a_card()
    test_the_other_cards_are_untouched()
    test_every_previous_destination_survives_once()
    test_the_calculator_still_opens_a_panel()
    test_the_ai_badge_is_kept()
    test_every_target_page_exists()
    print("sheet nav list OK")
