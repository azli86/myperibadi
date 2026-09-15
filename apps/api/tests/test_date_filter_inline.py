"""Pin the transactions date filter into its own sheet.

Reported symptom: pressing "Date Range" opened a second popup, which landed elsewhere on
screen and was dismissed by people who did not realise it had opened — so the range they
picked was never applied and the calendar appeared to do nothing.

The range picker now renders inline in the filter sheet (mobile) and under the filter row
(desktop), with no second overlay. These checks fail if the popup comes back or if the
picker stops being reachable from both layouts.

Run: cd apps/api && venv/bin/python -m tests.test_date_filter_inline
"""
from pathlib import Path

PAGE = (
    Path(__file__).resolve().parents[2]
    / "web"
    / "src"
    / "app"
    / "[sessionId]"
    / "transactions"
    / "page.tsx"
).read_text(encoding="utf-8")


def test_the_second_popup_is_gone():
    assert "showDateFilterPopup" not in PAGE, "the separate date popup must not come back"
    # The old popup was a full-screen transparent catcher positioned under the header.
    assert "fixed inset-0 z-50 bg-transparent" not in PAGE


def test_the_picker_renders_in_both_layouts():
    occurrences = PAGE.count("{showCalendar && (")
    assert occurrences == 2, f"expected the inline picker in both layouts, found {occurrences}"


def test_one_control_toggles_the_picker():
    # A single state flag drives both layouts; re-opening must not wipe a half-finished range.
    assert PAGE.count("const [showCalendar, setShowCalendar] = useState(false)") == 1
    toggle = PAGE.split("const openDateFilterPopup = () => {", 1)[1].split("const applyDateFilter", 1)[0]
    assert "if (showCalendar)" in toggle, "the toggle has to close without resetting the draft"
    assert toggle.index("if (showCalendar)") < toggle.index("setDraftStartDate"), (
        "the draft must only be seeded when the picker is opened"
    )


def test_applying_closes_the_picker_but_clearing_keeps_it_open():
    apply_fn = PAGE.split("const applyDateFilter = () => {", 1)[1].split("const clearDateFilter", 1)[0]
    assert "setShowCalendar(false)" in apply_fn
    clear_fn = PAGE.split("const clearDateFilter = () => {", 1)[1].split("const handleCalendarDaySelect", 1)[0]
    assert "setShowCalendar" not in clear_fn, "clearing should leave the picker open for a new range"


if __name__ == "__main__":
    test_the_second_popup_is_gone()
    test_the_picker_renders_in_both_layouts()
    test_one_control_toggles_the_picker()
    test_applying_closes_the_picker_but_clearing_keeps_it_open()
    print("date filter inline OK")
