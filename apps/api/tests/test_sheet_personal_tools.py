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
    SHELL.index("Nav cards: one card per group") : SHELL.index("SheetCard 3:")
]
TAIL = SHELL[SHELL.index("SheetCard 3:") :]

FINANCE = {"budget", "wallet-settings", "bank-reconciliation", "tax", "categories",
           "subscription", "loan", "bnpl", "split-bills", "debt"}
PERSONAL = {"vehicle", "inventory", "warranty", "event", "health", "badges"}
TOOLS = {"receipts"}


def hrefs(text: str) -> list[str]:
    return re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', text)


def test_it_maps_three_cards():
    assert ".map((group, groupIndex) => (" in BLOCK, "one card per group, via map"
    assert BLOCK.count("<section") == 1, "the section is written once and repeated by the map"
    assert "key={groupIndex}" in BLOCK


def test_each_card_holds_a_grid():
    assert BLOCK.count("grid grid-cols-4") == 1
    assert "rounded-3xl border border-[var(--border)]" in BLOCK


def test_the_groups_are_separated_by_cards_not_dividers():
    assert "border-t border-[var(--border)]" not in BLOCK, "no divider between groups"


def test_the_groups_hold_the_right_destinations():
    finance = hrefs(BLOCK.split("Kenderaan")[0])
    personal = hrefs(BLOCK.split("Kenderaan")[1].split("Galeri")[0])
    tools = hrefs(BLOCK.split("Galeri")[1])
    assert set(finance) == FINANCE, f"finance group is {set(finance)}"
    assert set(personal) == PERSONAL, f"personal group is {set(personal)}"
    assert set(tools) == TOOLS, f"tools group is {set(tools)}"


def test_there_are_still_no_headings_or_counts():
    assert "uppercase tracking-" not in BLOCK
    assert 'lang === "BM" ? "Peribadi"' not in BLOCK
    assert 'lang === "BM" ? "Alatan"' not in BLOCK
    assert "modul" not in BLOCK and '"modules"' not in BLOCK


def test_the_other_cards_are_untouched():
    # Maps and Support are sections; Connector is a standalone button.
    for card in ("SheetCard 3:", "SheetCard 4:", "SheetCard 5:"):
        assert card in TAIL, f"{card} disappeared"
    assert TAIL.count("<section") == 2
    assert "Connector Hub" in TAIL


def test_no_destination_is_listed_twice():
    found = hrefs(BLOCK)
    duplicates = {h for h in found if found.count(h) > 1}
    assert not duplicates, f"listed twice: {duplicates}"
    assert len(found) == 17, f"expected 17 destinations, found {len(found)}"


def test_the_calculator_still_opens_a_panel():
    assert 'action: "calculator"' in BLOCK
    assert "setShowCalculator(true)" in BLOCK
    assert "requestMobileMenuClose()" in BLOCK, "the sheet has to close behind the panel"


def test_the_ai_badge_is_kept():
    assert 'badge: "AI"' in BLOCK, "the AI tag on Reconcile must survive"


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    missing = [h for h in hrefs(BLOCK) if not (root / h).exists()]
    assert not missing, f"links to pages that do not exist: {missing}"


if __name__ == "__main__":
    test_it_maps_three_cards()
    test_each_card_holds_a_grid()
    test_the_groups_are_separated_by_cards_not_dividers()
    test_the_groups_hold_the_right_destinations()
    test_there_are_still_no_headings_or_counts()
    test_the_other_cards_are_untouched()
    test_no_destination_is_listed_twice()
    test_the_calculator_still_opens_a_panel()
    test_the_ai_badge_is_kept()
    test_every_target_page_exists()
    print("sheet nav cards OK")
