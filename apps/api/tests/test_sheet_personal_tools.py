"""Pin the mobile sheet nav drawer.

The destinations have been through tiles-with-headings, one merged tile grid, a plain row
list, and now an app-drawer grid. The row list was readable but flat — one entry per line for
eighteen entries is a lot of scrolling for a menu you open to jump somewhere.

It is a four-column drawer again, but with no card around it and no sub-headings: icons and
names only, which is what the original Finance card got right. The Maps, Connector and
Support cards below are untouched.

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

DRAWER = SHELL[
    SHELL.index("Nav drawer: app-drawer grid") : SHELL.index("SheetCard 3:")
]
TAIL = SHELL[SHELL.index("SheetCard 3:") :]


def hrefs(card: str) -> list[str]:
    return re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', card)


def test_it_is_a_four_column_drawer():
    assert "grid grid-cols-4" in DRAWER, "the drawer is a four-column grid"
    assert "h-13 w-13" in DRAWER, "entries use the shared icon tile size"
    assert "flex-col items-center" in DRAWER, "icon above the label, as in a drawer"


def test_it_is_not_wrapped_in_a_card():
    assert "<section" not in DRAWER, "the drawer must not sit inside a card section"
    assert "rounded-3xl border border-[var(--border)] p-4" not in DRAWER


def test_there_are_no_headings_or_counts():
    assert "uppercase tracking-" not in DRAWER
    assert 'lang === "BM" ? "Peribadi"' not in DRAWER
    assert 'lang === "BM" ? "Alatan"' not in DRAWER
    assert "modul" not in DRAWER and '"modules"' not in DRAWER


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
    actual = set(hrefs(DRAWER))
    assert actual == expected, f"lost {expected - actual}, invented {actual - expected}"
    found = hrefs(DRAWER)
    assert all(found.count(h) == 1 for h in found), "a target is listed twice"


def test_the_calculator_still_opens_a_panel():
    assert 'action: "calculator"' in DRAWER
    assert "setShowCalculator(true)" in DRAWER
    assert "requestMobileMenuClose()" in DRAWER, "the sheet has to close behind the panel"


def test_the_ai_badge_is_kept():
    assert "item.badge" in DRAWER, "the AI tag on Reconcile must survive"


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    missing = [h for h in hrefs(DRAWER) if not (root / h).exists()]
    assert not missing, f"links to pages that do not exist: {missing}"


if __name__ == "__main__":
    test_it_is_a_four_column_drawer()
    test_it_is_not_wrapped_in_a_card()
    test_there_are_no_headings_or_counts()
    test_the_other_cards_are_untouched()
    test_every_previous_destination_survives_once()
    test_the_calculator_still_opens_a_panel()
    test_the_ai_badge_is_kept()
    test_every_target_page_exists()
    print("sheet nav drawer OK")
