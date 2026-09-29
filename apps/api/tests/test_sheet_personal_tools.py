"""Pin the mobile sheet nav cards.

The destinations have been through tiles-with-headings, one merged tile grid, a plain row
list, a cardless app drawer, one card holding three divided groups, and are now three cards.

The grouping is the split the old headings described: money, personal, tools. It is drawn as
separate cards rather than dividers inside one card, which is what the layout wanted all
along — a divider reads as a section break inside a card, a card boundary reads as "these are
a different kind of thing". No heading rows and no module counts come back with them.

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

BLOCK = SHELL[
    SHELL.index("Destinations: five named groups") : SHELL.index("{showAddModal && (")
]

FINANCE = {"budget", "wallet-settings", "categories", "tax", "bank-reconciliation"}
PAYMENTS = {"subscription", "loan", "bnpl", "split-bills", "debt"}
PERSONAL = {"vehicle", "inventory", "warranty", "event", "health", "badges"}
MAPS = {"map", "places", "map-analysis"}
TOOLS = {"receipts", "bot-command", "request", "connector"}


def hrefs(text: str) -> list[str]:
    return re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', text)


def group(text: str, start: str, end: str | None) -> str:
    rest = text.split(start)[1]
    return rest.split(end)[0] if end else rest


def test_it_maps_five_named_groups():
    assert ".map((group) => (" in BLOCK, "one section per group, via map"
    assert BLOCK.count("<section") == 1, "the section is written once and repeated by the map"
    assert "key={group.title}" in BLOCK
    assert BLOCK.count("title: lang ===") == 5, "five groups, each with a title"
    assert "<h3" in BLOCK, "each group has a heading"


def test_each_group_holds_a_grid_in_one_card_style():
    assert BLOCK.count("grid grid-cols-4") == 1
    assert "rounded-[1.5rem] bg-[var(--card)]" in BLOCK
    assert "border border-[var(--border)]" not in BLOCK, "no bordered tiles or cards"


def test_the_groups_hold_the_right_destinations():
    assert set(hrefs(group(BLOCK, "Money", "Payments"))) == FINANCE
    assert set(hrefs(group(BLOCK, "Payments & commitments", "Personal"))) == PAYMENTS
    assert set(hrefs(group(BLOCK, '"Personal"', "Maps & places"))) == PERSONAL
    assert set(hrefs(group(BLOCK, "Maps & places", "Tools & help"))) == MAPS
    assert set(hrefs(group(BLOCK, "Tools & help", None))) == TOOLS


def test_maps_is_one_of_the_groups_not_a_separate_card():
    assert "SheetCard 3:" not in SHELL, "the odd-looking Maps card is gone"
    assert "Peta & tempat" in BLOCK


def test_the_tools_that_moved_out_are_gone_from_the_sheet():
    assert "Connector Hub" not in SHELL, "the standalone Connector card must be gone"
    assert BLOCK.count("${sessionId}/connector") == 1, "Connector is listed once in the sheet"


def test_no_destination_is_listed_twice():
    found = hrefs(BLOCK)
    duplicates = {h for h in found if found.count(h) > 1}
    assert not duplicates, f"listed twice: {duplicates}"
    assert len(found) == 23, f"expected 23 destinations, found {len(found)}"


def test_the_calculator_still_opens_a_panel():
    assert 'action: "calculator"' in BLOCK
    assert "setShowCalculator(true)" in BLOCK
    assert "requestMobileMenuClose()" in BLOCK, "the sheet has to close behind the panel"


def test_the_ai_badge_is_kept():
    assert 'badge: "AI"' in BLOCK, "the AI tag on Reconcile must survive"


def test_the_cat_chip_closes_the_menu():
    assert '<CatPlayground' in BLOCK and 'presentation="chip"' in BLOCK


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    missing = [h for h in hrefs(BLOCK) if not (root / h).exists()]
    assert not missing, f"links to pages that do not exist: {missing}"


if __name__ == "__main__":
    test_it_maps_five_named_groups()
    test_each_group_holds_a_grid_in_one_card_style()
    test_the_groups_hold_the_right_destinations()
    test_maps_is_one_of_the_groups_not_a_separate_card()
    test_the_tools_that_moved_out_are_gone_from_the_sheet()
    test_no_destination_is_listed_twice()
    test_the_calculator_still_opens_a_panel()
    test_the_ai_badge_is_kept()
    test_the_cat_chip_closes_the_menu()
    test_every_target_page_exists()
    print("sheet nav groups OK")
