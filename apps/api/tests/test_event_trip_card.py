"""The trip card leads with what the trip cost, and never invents an overspend.

Two regressions are pinned here.

1. The card derived `remainingNum = budgetNum - spentNum` after coercing a null
   budget to 0. A trip with no budget therefore had remaining = -spent, and any
   code reading that value would announce an overspend on a trip that never had
   a limit. No budget now yields 0, matching the detail page's `budget > 0`
   guard.

2. Spent is the first thing in the card. It previously sat in a tinted sub-box
   in the lower half, half-width, next to the budget figure.

Run: cd apps/api && venv/bin/python -m tests.test_event_trip_card
"""
from pathlib import Path

PAGE = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "event" / "page.tsx"
).read_text(encoding="utf-8")


def test_remaining_is_zero_without_a_budget():
    assert "const remainingNum = hasBudget ? budgetNum - spentNum : 0" in PAGE, \
        "a null budget coerced to 0 made remaining = -spent"
    assert "const remainingNum = budgetNum - spentNum" not in PAGE


def test_ratio_helper_already_guards_a_missing_budget():
    assert "if (budget <= 0) return 0" in PAGE


def test_spent_is_the_first_block_in_the_card():
    card = PAGE[PAGE.index("event-card event-card-interactive"):]
    card = card[: card.index("Card Footer")]
    assert card.index('tr("Dibelanjakan", "Spent")') < card.index("CategoryIconGlyph"), \
        "spent leads at the top, above the icon and name"
    assert card.index('tr("Dibelanjakan", "Spent")') < card.index("event-progress-track"), \
        "the amount comes before the bar that qualifies it"


def test_overspend_only_appears_when_a_budget_exists():
    card = PAGE[PAGE.index("Budget context sits directly under"):]
    card = card[: card.index("Card Header: Icon/Image")]
    # The over/under line is inside the hasBudget branch, so the no-budget path
    # cannot reach it; the fallback is an explicit "no limit" note.
    assert card.index("{hasBudget ? (") < card.index("Over by"), \
        "the over-budget text must not be reachable without a budget"
    assert 'tr("Tiada had bajet", "No budget limit")' in card


def test_no_two_column_grid_left_on_the_card():
    card = PAGE[PAGE.index("event-card event-card-interactive"):]
    card = card[: card.index("Card Footer")]
    assert "grid grid-cols-2" not in card, "the summary grid is what buried the amount"


if __name__ == "__main__":
    test_remaining_is_zero_without_a_budget()
    test_ratio_helper_already_guards_a_missing_budget()
    test_spent_is_the_first_block_in_the_card()
    test_overspend_only_appears_when_a_budget_exists()
    test_no_two_column_grid_left_on_the_card()
    print("event trip card OK")
