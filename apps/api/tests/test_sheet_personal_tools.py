"""Pin the mobile sheet nav grid.

Finance and Personal were two cards with their own headers and module counts. The headers
described a grouping nobody navigates by, and the counts told nobody anything they could act
on, so the sheet read as two lists to scan instead of one menu.

Both are now a single grid with no sub-headings. Tools folded in as well: Gallery is a nav
target, so it belongs in the list, and Calculator keeps its open-a-panel behaviour. Income Tax
stays once, not twice.

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

# The merged card runs from its own comment up to the Maps card.
GRID = SHELL[
    SHELL.index("Nav grid: every destination") : SHELL.index("SheetCard 3:")
]

# Everything an older layout may still be holding on to, from the top of the menu.
MENU_HEAD = SHELL.index("Mobile Menu Sheet")
MENU = SHELL[MENU_HEAD : SHELL.index("SheetCard 3:")]


def hrefs(card: str) -> list[str]:
    return re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', card)


def test_it_is_one_card_with_one_grid():
    assert GRID.count("<section") == 1, "the nav list must be a single card"
    assert GRID.count("grid grid-cols-4") == 1, "and a single grid"
    assert GRID.count("grid grid-cols-2") == 0


def test_the_sub_headings_are_gone():
    # A heading row was an icon chip plus an uppercase tracked label, and a module-count pill.
    assert "uppercase tracking-" not in GRID, "no sub-heading rows inside the nav grid"
    assert "modul" not in GRID and '"modules"' not in GRID, "no module-count pills"


def test_every_previous_destination_survives():
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
    actual = set(hrefs(GRID))
    assert actual == expected, f"lost {expected - actual}, invented {actual - expected}"


def test_no_target_is_listed_twice():
    found = hrefs(GRID)
    duplicates = {h for h in found if found.count(h) > 1}
    assert not duplicates, f"listed twice: {duplicates}"


def test_the_calculator_opens_a_panel_instead_of_navigating():
    assert 'action: "calculator"' in GRID
    assert "setShowCalculator(true)" in GRID
    assert "requestMobileMenuClose()" in GRID, "the sheet has to close behind the panel"


def test_the_ai_badge_is_kept():
    assert "item.badge" in GRID, "the AI tag on Reconcile must survive the merge"


def test_the_old_cards_are_really_gone():
    assert "SheetCard 1:" not in MENU and "SheetCard 2:" not in MENU
    assert 'lang === "BM" ? "Peribadi"' not in MENU
    assert 'lang === "BM" ? "Alatan"' not in MENU


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    missing = [h for h in hrefs(GRID) if not (root / h).exists()]
    assert not missing, f"links to pages that do not exist: {missing}"


if __name__ == "__main__":
    test_it_is_one_card_with_one_grid()
    test_the_sub_headings_are_gone()
    test_every_previous_destination_survives()
    test_no_target_is_listed_twice()
    test_the_calculator_opens_a_panel_instead_of_navigating()
    test_the_ai_badge_is_kept()
    test_the_old_cards_are_really_gone()
    test_every_target_page_exists()
    print("sheet nav grid OK")
