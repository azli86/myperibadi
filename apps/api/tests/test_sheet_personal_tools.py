"""Pin the Personal and Tools sheet cards.

Personal held a mixed grid: records the person tracks (Vehicle, Warranty, Events, ...) with
Gallery and Calculator below a divider. The two are not records — Gallery opens a receipt
list and Calculator opens a panel rather than navigating anywhere — so they read as odd
entries attached to a list they do not belong to.

They are now their own card, under Personal. Income Tax is likewise gone from Personal, since
the Finance card already carries it.

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

FINANCE = SHELL[SHELL.index("SheetCard 1:"):SHELL.index("SheetCard 2:")]
PERSONAL = SHELL[SHELL.index("SheetCard 2:"):SHELL.index("SheetCard 2b:")]
TOOLS = SHELL[SHELL.index("SheetCard 2b:"):SHELL.index("SheetCard 3:")]


def hrefs(card: str) -> list[str]:
    return re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', card)


def test_the_two_utilities_have_their_own_card():
    assert hrefs(PERSONAL) and hrefs(TOOLS)
    assert set(hrefs(TOOLS)) == {"receipts"}, "Gallery is the only link in Tools"
    assert "receipts" not in hrefs(PERSONAL), "Gallery must not also sit in Personal"
    assert "Calculator" not in PERSONAL


def test_tools_is_a_card_not_a_row_inside_personal():
    assert TOOLS.count("<section") == 1, "Tools must be its own section"
    assert "border-t border-[var(--border)]" not in PERSONAL, "the divider is gone with the row"
    assert 'lang === "BM" ? "Alatan"' in TOOLS, "the Tools card needs its own header"


def test_the_calculator_opens_a_panel_instead_of_navigating():
    assert 'action: "calculator"' in TOOLS
    assert "setShowCalculator(true)" in TOOLS
    assert "requestMobileMenuClose()" in TOOLS, "the sheet has to close behind the panel"


def test_no_module_is_listed_twice():
    """Income Tax used to sit here and on the Finance card, so it had two doors."""
    for card in (PERSONAL, TOOLS):
        found = hrefs(card)
        duplicates = {h for h in found if found.count(h) > 1}
        assert not duplicates, f"module listed twice: {duplicates}"
    assert set(hrefs(PERSONAL)) & set(hrefs(FINANCE)) == set(), (
        "Personal must not repeat a Finance module"
    )


def test_tax_survives_on_the_finance_card():
    # Dropping the duplicate must not drop the module itself.
    assert "/tax`" in FINANCE, "Income Tax must still be reachable from Finance"


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    for card in (PERSONAL, TOOLS):
        missing = [h for h in hrefs(card) if not (root / h).exists()]
        assert not missing, f"card links to pages that do not exist: {missing}"


def test_no_menu_entries_were_invented():
    expected = {"receipts", "vehicle", "inventory", "warranty", "event", "health", "badges"}
    actual = set(hrefs(PERSONAL)) | set(hrefs(TOOLS))
    assert actual == expected, f"menu set changed: added {actual - expected}, lost {expected - actual}"


if __name__ == "__main__":
    test_the_two_utilities_have_their_own_card()
    test_tools_is_a_card_not_a_row_inside_personal()
    test_the_calculator_opens_a_panel_instead_of_navigating()
    test_no_module_is_listed_twice()
    test_tax_survives_on_the_finance_card()
    test_every_target_page_exists()
    test_no_menu_entries_were_invented()
    print("sheet personal tools OK")
