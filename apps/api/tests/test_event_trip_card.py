"""The event card previews the detail page, and never invents an overspend.

Pinned here:

1. The card derived `remainingNum = budgetNum - spentNum` after coercing a null
   budget to 0. A trip with no budget therefore had remaining = -spent, and any
   code reading that value would announce an overspend on a trip that never had
   a limit. No budget now yields 0, matching the detail page's `budget > 0`
   guard.

2. A photo runs full width with the spend total centred on it, the same
   treatment as the detail page. Without a photo the total leads the body, so
   the number is on every card either way.

3. The progress bar only renders when a budget exists. A 0% bar on a trip with
   no limit reads as an error.

4. The summary above the list is the .event-hero dark card globals.css defines
   for this module, with the debt page's gradient and blooms, so it matches the
   other summary heroes.

Run: cd apps/api && venv/bin/python -m tests.test_event_trip_card
"""
from pathlib import Path

PAGE = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]" / "event" / "page.tsx"
).read_text(encoding="utf-8")

CARD = PAGE[PAGE.index("const renderEventCard"):]
CARD = CARD[: CARD.index("const renderHeroStats")]

HERO = PAGE[PAGE.index("const renderHeroStats"):]
HERO = HERO[: HERO.index("// Filter Segmented Tabs")]


def test_remaining_is_zero_without_a_budget():
    assert "const remainingNum = hasBudget ? budgetNum - spentNum : 0" in PAGE, \
        "a null budget coerced to 0 made remaining = -spent"
    assert "const remainingNum = budgetNum - spentNum" not in PAGE


def test_ratio_helper_already_guards_a_missing_budget():
    assert "if (budget <= 0) return 0" in PAGE


def test_photo_carries_the_name_and_total():
    assert "aspect-[16/9] w-full" in CARD, "the photo runs full width"
    photo = CARD[CARD.index("aspect-[16/9] w-full"):CARD.index(") : null}")]
    assert photo.index("{ev.name}") < photo.index("moneyLabel(spentNum, ev.currency)"), \
        "the name and then the total sit on the photo"
    assert CARD.count("moneyLabel(spentNum, ev.currency)") == 2, \
        "the total renders on the photo or, without one, in the body"
    assert CARD.count("{!hasImage ? (") >= 2, "the body name and total are only for photo-less events"


def test_all_four_metrics_are_present():
    for label in ("Dibelanjakan", "Bajet", "Baki", "Transaksi"):
        assert label in CARD, f"missing metric: {label}"


def test_progress_bar_is_gated_on_a_budget():
    bar = CARD.index("event-progress-track")
    guard = CARD.index("{hasBudget ? (")
    assert guard < bar, "the bar must not render without a budget"


def test_no_budget_shows_the_dash_not_a_zero():
    assert '{hasBudget ? moneyLabel(remainingNum, ev.currency) : "—"}' in CARD, \
        "a budget-less trip must show a dash, never a computed remainder"


def test_photo_total_stays_light_in_both_themes():
    photo = CARD[CARD.index("aspect-[16/9] w-full"):CARD.index(") : null}")]
    assert "event-photo-overlay " in photo and "text-white" not in photo, \
        "the light theme remaps text-white to var(--text), which turned the total black"


def test_card_actions_are_tappable():
    assert CARD.count("h-9 w-9") == 2, "edit and delete need a 36px target"


def test_summary_uses_the_event_hero():
    assert 'className={cn("event-hero",' in HERO, "the summary is the module's dark hero"
    assert "-right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" in HERO, "the blooms match debt"
    assert "hasTotalBudget ?" in HERO, "the summary bar is gated on a budget too"


def test_status_pills_have_a_light_mode_shade():
    for tone in ("cyan", "amber", "emerald"):
        assert f"text-{tone}-700 dark:text-{tone}-400" in CARD, f"{tone} status needs a darker light-mode shade"


if __name__ == "__main__":
    test_remaining_is_zero_without_a_budget()
    test_ratio_helper_already_guards_a_missing_budget()
    test_photo_carries_the_name_and_total()
    test_all_four_metrics_are_present()
    test_progress_bar_is_gated_on_a_budget()
    test_no_budget_shows_the_dash_not_a_zero()
    test_photo_total_stays_light_in_both_themes()
    test_card_actions_are_tappable()
    test_summary_uses_the_event_hero()
    test_status_pills_have_a_light_mode_shade()
    print("event trip card OK")
