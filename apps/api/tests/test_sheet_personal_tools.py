"""Pin the Personal & Tools sheet card layout.

The card used to mix two row shapes — two wide "feature" tiles for Gallery and Calculator,
then a plain two-column list for everything else — and it listed Tax, which the Finance card
already owns. The result was a card that read as unsorted, plus one module reachable from two
places.

It now uses the same four-column icon grid as the Finance card, one shape for every entry.

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

START = SHELL.index("SheetCard 2:")
# The next card's comment closes this section.
END = SHELL.index("SheetCard 3:")
CARD = SHELL[START:END]


def test_uses_the_same_four_column_grid_as_finance():
    assert "grid grid-cols-4" in CARD, "the card must match the Finance card's grid"
    assert "grid grid-cols-2" not in CARD, "the old mixed two-column rows must be gone"


def test_the_wide_feature_tiles_are_gone():
    # The old shape: a wide tile with a 10x10 icon box and a subtitle line under the name.
    assert "h-10 w-10" not in CARD, "Gallery/Calculator wide tiles should be grid entries now"
    assert "h-13 w-13" in CARD, "entries should use the shared icon tile size"


def test_no_menu_entries_were_invented():
    # Only the pages the card already linked to before the redesign may appear.
    expected = {
        "receipts",
        "vehicle",
        "inventory",
        "warranty",
        "event",
        "health",
        "badges",
        "tax",
    }
    actual = set(re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', CARD))
    assert actual == expected, f"menu set changed: added {actual - expected}, lost {expected - actual}"


def test_every_target_page_exists():
    root = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
    hrefs = re.findall(r'\$\{sessionId\}/([a-z0-9-]+)', CARD)
    assert hrefs, "expected route entries in the card"
    missing = [h for h in hrefs if not (root / h).exists()]
    assert not missing, f"card links to pages that do not exist: {missing}"
def test_the_calculator_still_opens_instead_of_navigating():
    assert 'action: "calculator"' in CARD
    assert 'setShowCalculator(true)' in CARD


if __name__ == "__main__":
    test_uses_the_same_four_column_grid_as_finance()
    test_the_wide_feature_tiles_are_gone()
    test_no_menu_entries_were_invented()
    test_every_target_page_exists()
    test_the_calculator_still_opens_instead_of_navigating()
    print("sheet personal tools OK")
