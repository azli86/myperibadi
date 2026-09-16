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
TOOLS = {"receipts", "bot-command", "request", "connector"}


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


def test_only_the_maps_card_remains_below_the_nav():
    assert "SheetCard 3:" in TAIL, "the Maps card is still there"
    # Count real cards, not comments: each rendered card is a <section> or a big <button>.
    assert TAIL.count("<section") == 1, f"only Maps should be a section below the nav, found {TAIL.count('<section')}"


def test_the_tools_that_moved_out_are_gone_from_the_sheet():
    # Bot Command, Request & Ticket and Connector live in the tools card now, not here.
    assert "Connector Hub" not in SHELL, "the standalone Connector card must be gone"
    # The desktop sidebar also links Connector; only the sheet must list it once.
    assert BLOCK.count("${sessionId}/connector") == 1, "Connector is listed once in the sheet"


def test_no_destination_is_listed_twice():
    found = hrefs(BLOCK)
    duplicates = {h for h in found if found.count(h) > 1}
    assert not duplicates, f"listed twice: {duplicates}"
    assert len(found) == 20, f"expected 20 destinations, found {len(found)}"


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
    test_only_the_maps_card_remains_below_the_nav()
    test_the_tools_that_moved_out_are_gone_from_the_sheet()
    test_no_destination_is_listed_twice()
    test_the_calculator_still_opens_a_panel()
    test_the_ai_badge_is_kept()
    test_every_target_page_exists()
    print("sheet nav cards OK")
