"""Pin the Personal sheet card layout.

The card was one flat four-by-four grid holding both data modules (Vehicle, Warranty,
Events, ...) and the two utilities (Gallery, Calculator). Gallery and Calculator do not
belong in that list: one opens a panel rather than navigating, and neither is a record the
person tracks, so they read as two odd entries in an otherwise uniform row.

The card keeps one header and one grid of modules; Gallery and Calculator sit below a
divider at the bottom, still inside the same card. Nothing was added or removed.

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

CARD = SHELL[SHELL.index("SheetCard 2:"):SHELL.index("SheetCard 3:")]
FINANCE = SHELL[SHELL.index("SheetCard 1:"):SHELL.index("SheetCard 2:")]


def test_modules_lead_and_utilities_follow_a_divider():
    divider = CARD.index("border-t border-[var(--border)]")
    modules, utilities = CARD[:divider], CARD[divider:]
    assert 'name: lang === "BM" ? "Galeri"' in utilities, "Gallery belongs under the divider"
    assert "action: \"calculator\"" in utilities, "Calculator belongs under the divider"
    assert "Galeri" not in modules and "Kalkulator" not in modules


def test_the_utilities_do_not_navigate_when_they_are_panels():
    utilities = CARD[CARD.index("border-t border-[var(--border)]"):]
    assert 'setShowCalculator(true)' in utilities
    assert "requestMobileMenuClose()" in utilities, "the sheet has to close behind the panel"


def test_it_is_one_card_with_one_header():
    assert CARD.count("<section") == 1, "the card must not be split into a second section"
    assert CARD.count('lang === "BM" ? "Peribadi"') == 1


def test_no_module_is_listed_twice():
    """Income Tax used to sit here and on the Finance card, so it had two doors."""
    hrefs = re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', CARD)
    duplicates = {h for h in hrefs if hrefs.count(h) > 1}
    assert not duplicates, f"module listed twice: {duplicates}"
    assert "tax" not in hrefs, "Income Tax belongs to the Finance card alone"


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    missing = [h for h in re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', CARD) if not (root / h).exists()]
    assert not missing, f"card links to pages that do not exist: {missing}"


def test_no_menu_entries_were_invented():
    expected = {
        "receipts",
        "vehicle",
        "inventory",
        "warranty",
        "event",
        "health",
        "badges",
    }
    actual = set(re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', CARD))
    assert actual == expected, f"menu set changed: added {actual - expected}, lost {expected - actual}"


def test_tax_survives_on_the_finance_card():
    # Dropping the duplicate must not drop the module itself.
    assert "/tax`" in FINANCE, "Income Tax must still be reachable from Finance"


if __name__ == "__main__":
    test_modules_lead_and_utilities_follow_a_divider()
    test_the_utilities_do_not_navigate_when_they_are_panels()
    test_it_is_one_card_with_one_header()
    test_no_module_is_listed_twice()
    test_every_target_page_exists()
    test_tax_survives_on_the_finance_card()
    test_no_menu_entries_were_invented()
    print("sheet personal tools OK")
