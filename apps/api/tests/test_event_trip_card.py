"""The trip card follows the vehicle card split, and never invents an overspend.

Three regressions are pinned here.

1. The card derived `remainingNum = budgetNum - spentNum` after coercing a null
   budget to 0. A trip with no budget therefore had remaining = -spent, and any
   code reading that value would announce an overspend on a trip that never had
   a limit. No budget now yields 0, matching the detail page's `budget > 0`
   guard.

2. Media leads on the left, flush with the card edge, with the metrics on the
   right — the same split the vehicle list uses. A full-width image or a
   stacked layout breaks that pairing.

3. The progress bar only renders when a budget exists. A 0% bar on a trip with
   no limit reads as an error.

Run: cd apps/api && venv/bin/python -m tests.test_event_trip_card
"""
from pathlib import Path

PAGE = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "event" / "page.tsx"
).read_text(encoding="utf-8")

CARD = PAGE[PAGE.index('className="group relative flex w-full overflow-hidden'):]
CARD = CARD[: CARD.index("Hero Card Component")]


def test_remaining_is_zero_without_a_budget():
    assert "const remainingNum = hasBudget ? budgetNum - spentNum : 0" in PAGE, \
        "a null budget coerced to 0 made remaining = -spent"
    assert "const remainingNum = budgetNum - spentNum" not in PAGE


def test_ratio_helper_already_guards_a_missing_budget():
    assert "if (budget <= 0) return 0" in PAGE


def test_media_leads_on_the_left():
    assert "w-[42%]" in CARD, "media column must match the vehicle card split"
    assert CARD.index("w-[42%]") < CARD.index('tr("Dibelanjakan", "Spent")'), \
        "media sits left of the details"


def test_all_four_metrics_are_present():
    for label in ("Dibelanjakan", "Bajet", "Baki", "Transaksi"):
        assert label in CARD, f"missing metric: {label}"


def test_progress_bar_is_gated_on_a_budget():
    assert "{hasBudget ? (" in CARD, "the bar must sit behind the budget guard"
    bar = CARD.index("event-progress-track")
    guard = CARD.index("{hasBudget ? (")
    assert guard < bar, "the bar must not render without a budget"


def test_no_budget_shows_the_dash_not_a_zero():
    assert '{hasBudget ? moneyLabel(remainingNum, ev.currency) : "—"}' in CARD, \
        "a budget-less trip must show a dash, never a computed remainder"


if __name__ == "__main__":
    test_remaining_is_zero_without_a_budget()
    test_ratio_helper_already_guards_a_missing_budget()
    test_media_leads_on_the_left()
    test_all_four_metrics_are_present()
    test_progress_bar_is_gated_on_a_budget()
    test_no_budget_shows_the_dash_not_a_zero()
    print("event trip card OK")
