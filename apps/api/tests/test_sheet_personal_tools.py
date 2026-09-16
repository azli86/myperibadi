"""Pin the mobile sheet nav card.

The destinations have been through tiles-with-headings, one merged tile grid, a plain row
list, an app drawer with no card, and are now one card holding three divided groups.

The groups are the split the headings used to describe, but with dividers instead of heading
rows: a card, a hairline, a card. The dividers keep the grouping without the labels and module
counts that made the earlier version look cluttered.

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

CARD = SHELL[SHELL.index("Nav card: three groups of destinations") : SHELL.index("SheetCard 3:")]
TAIL = SHELL[SHELL.index("SheetCard 3:") :]

FINANCE = {"budget", "wallet-settings", "bank-reconciliation", "tax", "categories",
           "subscription", "loan", "bnpl", "split-bills", "debt"}
PERSONAL = {"vehicle", "inventory", "warranty", "event", "health", "badges"}
TOOLS = {"receipts"}


def hrefs(text: str) -> list[str]:
    return re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', text)


def test_it_is_a_card_again():
    assert CARD.count("<section") == 1, "the nav must sit in one card"
    assert "rounded-3xl border border-[var(--border)]" in CARD


def test_three_groups_are_divided():
    assert CARD.count("groupIndex > 0") == 1, "one divider rule for every group after the first"
    assert "border-t border-[var(--border)]" in CARD
    # Three grid containers, one per group.
    assert CARD.count("grid grid-cols-4") == 1, "the grid class is written once and reused"


def test_the_groups_hold_the_right_destinations():
    groups = CARD.split('{ name:')
    # The groups appear in order; slice the card by its divider-free grid containers.
    finance = hrefs(CARD.split("Kenderaan")[0])
    personal = hrefs(CARD.split("Kenderaan")[1].split("Galeri")[0])
    tools = hrefs(CARD.split("Galeri")[1])
    assert set(finance) == FINANCE, f"finance group is {set(finance)}"
    assert set(personal) == PERSONAL, f"personal group is {set(personal)}"
    assert set(tools) == TOOLS, f"tools group is {set(tools)}"


def test_there_are_still_no_headings_or_counts():
    assert "uppercase tracking-" not in CARD
    assert 'lang === "BM" ? "Peribadi"' not in CARD
    assert 'lang === "BM" ? "Alatan"' not in CARD
    assert "modul" not in CARD and '"modules"' not in CARD


def test_the_other_cards_are_untouched():
    # Maps and Support are sections; Connector is a standalone button.
    for card in ("SheetCard 3:", "SheetCard 4:", "SheetCard 5:"):
        assert card in TAIL, f"{card} disappeared"
    assert TAIL.count("<section") == 2
    assert "Connector Hub" in TAIL


def test_no_destination_is_listed_twice():
    found = hrefs(CARD)
    duplicates = {h for h in found if found.count(h) > 1}
    assert not duplicates, f"listed twice: {duplicates}"


def test_the_calculator_still_opens_a_panel():
    assert 'action: "calculator"' in CARD
    assert "setShowCalculator(true)" in CARD
    assert "requestMobileMenuClose()" in CARD, "the sheet has to close behind the panel"


def test_the_ai_badge_is_kept():
    assert 'badge: "AI"' in CARD, "the AI tag on Reconcile must survive"


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    missing = [h for h in hrefs(CARD) if not (root / h).exists()]
    assert not missing, f"links to pages that do not exist: {missing}"


if __name__ == "__main__":
    test_it_is_a_card_again()
    test_three_groups_are_divided()
    test_the_groups_hold_the_right_destinations()
    test_there_are_still_no_headings_or_counts()
    test_the_other_cards_are_untouched()
    test_no_destination_is_listed_twice()
    test_the_calculator_still_opens_a_panel()
    test_the_ai_badge_is_kept()
    test_every_target_page_exists()
    print("sheet nav card OK")
