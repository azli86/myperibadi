"""Pin the top of the mobile sheet: profile card and quick controls.

The profile card used to be a card with an 80px avatar absolutely positioned so it hung off
the right edge, plus a pill carrying the full email address and an account menu anchored 40px
from the top. The toolbar under it was four separate rounded tiles with 16px glyphs, one of
which was a <div> around the theme toggle rather than a button, so the four never lined up.

Both are now one shape each: the avatar sits inside the card with the name and account to its
right, and the toolbar is a single divided bar of four equal segments.

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

TOP = SHELL[
    SHELL.index("Profile Card: avatar left") : SHELL.index("Destinations: five named groups")
]


def test_the_avatar_sits_inside_the_card():
    assert not re.search(r"absolute\s+-right", TOP), "the avatar must not hang off the edge"
    assert "UserAvatar" in TOP
    assert re.search(r"UserAvatar[^>]*size=\{56\}", TOP, re.S), "avatar is 56px"


def test_the_name_comes_after_the_avatar():
    assert TOP.index("UserAvatar") < TOP.index("{displayName}"), "avatar left, name right"


def test_the_name_is_large():
    # The name shrinks with the screen and wraps instead of being cut off, so a long
    # Malaysian name still reads in full.
    assert "clamp(17px,6.5vw,24px)" in TOP, "the name scales with the screen"
    assert "overflow-wrap:anywhere" in TOP, "an unbroken long name can still wrap"
    header = TOP[TOP.index("{displayName}") - 400 : TOP.index("{displayName}")]
    assert "truncate" not in header, "the name is not cut off"


def test_the_name_is_the_trigger_and_there_is_no_pill():
    assert "setShowMobileSheetAccountSwitcher(true)" in TOP, "tapping the name opens the switcher"
    assert "Account Switcher Pill" not in TOP, "the pill is gone"
    assert "ChevronDown" not in TOP, "no chevron on the name"


def test_the_switcher_is_a_bottom_sheet():
    assert "absolute" not in TOP.split("showMobileSheetAccountSwitcher && (")[1].split("})")[0].split("w-full")[0], "no anchored dropdown"
    assert "fixed inset-0 z-[600] flex items-end" in TOP, "sheet rises from the bottom"
    assert "rounded-t-3xl" in TOP


def test_the_toolbar_is_four_plain_buttons():
    assert 'mt-3 grid grid-cols-4 gap-2' in TOP, "four equal buttons in a row"
    assert "border-r border-[var(--border)]" not in TOP, "no divided bar"
    assert TOP.count("rounded-2xl bg-[var(--surface-tint)]") == 4, "four buttons in one style"


def test_every_toolbar_segment_has_a_glyph_and_a_label():
    for icon in ("Globe", "ScrollText", "Settings"):
        assert f"<{icon} size={{18}}" in TOP, f"{icon} should be an 18px glyph"
    assert "ThemeToggle" in TOP
    assert 'lang === "BM" ? "Tema" : "Theme"' in TOP
    assert 'lang === "BM" ? "Tetapan" : "Settings"' in TOP


def test_the_four_controls_still_work():
    assert 'setLang(lang === "EN" ? "BM" : "EN")' in TOP
    assert "${sessionId}/whatsnew" in TOP
    assert "${sessionId}/settings" in TOP


if __name__ == "__main__":
    test_the_avatar_sits_inside_the_card()
    test_the_name_comes_after_the_avatar()
    test_the_name_is_large()
    test_the_name_is_the_trigger_and_there_is_no_pill()
    test_the_switcher_is_a_bottom_sheet()
    test_the_toolbar_is_four_plain_buttons()
    test_every_toolbar_segment_has_a_glyph_and_a_label()
    test_the_four_controls_still_work()
    print("sheet header OK")
