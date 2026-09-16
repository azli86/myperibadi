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
    SHELL.index("Profile Card: avatar left") : SHELL.index("Nav cards: one card per group")
]


def test_the_avatar_sits_inside_the_card():
    assert not re.search(r"absolute\s+-right", TOP), "the avatar must not hang off the edge"
    assert "UserAvatar" in TOP
    assert re.search(r"UserAvatar[^>]*size=\{56\}", TOP, re.S), "avatar is 56px"


def test_the_name_comes_after_the_avatar():
    assert TOP.index("UserAvatar") < TOP.index("{displayName}"), "avatar left, name right"


def test_the_account_menu_anchors_under_the_pill():
    assert "top-[40px]" not in TOP, "the old fixed 40px anchor is gone"
    assert "top-[calc(100%+0.5rem)]" in TOP, "the menu hangs below the pill"
    # A long address must not push the menu off the screen.
    assert "min(280px,calc(100vw-5rem))" in TOP


def test_the_toolbar_is_one_divided_bar():
    assert "grid-cols-4" not in TOP, "the four separate tiles are gone"
    assert "overflow-hidden rounded-2xl" in TOP, "one bar with the corners trimmed"
    assert TOP.count("flex-1 flex-col items-center") == 4, "four equal segments"
    assert TOP.count("border-r border-[var(--border)]") == 3, "dividers between, not after"


def test_every_toolbar_segment_has_a_glyph_and_a_label():
    for icon in ("Globe", "ScrollText", "Settings"):
        assert f"<{icon} size={{18}}" in TOP, f"{icon} should be an 18px glyph"
    assert "ThemeToggle" in TOP
    assert 'lang === "BM" ? "Tema" : "Theme"' in TOP
    assert 'lang === "BM" ? "Tetapan" : "Settings"' in TOP


def test_the_toolbar_is_no_longer_narrower_than_the_cards():
    assert "max-w-[340px]" not in TOP, "the toolbar used to stop short of the nav cards"


def test_the_four_controls_still_work():
    assert 'setLang(lang === "EN" ? "BM" : "EN")' in TOP
    assert "${sessionId}/whatsnew" in TOP
    assert "${sessionId}/settings" in TOP


if __name__ == "__main__":
    test_the_avatar_sits_inside_the_card()
    test_the_name_comes_after_the_avatar()
    test_the_account_menu_anchors_under_the_pill()
    test_the_toolbar_is_one_divided_bar()
    test_every_toolbar_segment_has_a_glyph_and_a_label()
    test_the_toolbar_is_no_longer_narrower_than_the_cards()
    test_the_four_controls_still_work()
    print("sheet header OK")
