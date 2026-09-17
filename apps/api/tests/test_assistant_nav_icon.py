"""The centre bottom-nav slot carries the assistant, and it reads as AI.

The bar is five monochrome ledger glyphs; the assistant sat in the middle
wearing a sixth chat bubble, so nothing on the bar said "this one talks back".
It now paints a violet-cyan sparkle gradient of its own.

Run: cd apps/api && venv/bin/python -m tests.test_assistant_nav_icon
"""
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "web"
ICON = (WEB / "src" / "components" / "navigation" / "ChatNavIcon.tsx").read_text(encoding="utf-8")
SHELL = (WEB / "src" / "components" / "layout" / "Shell.tsx").read_text(encoding="utf-8")


def test_the_glyph_is_a_sparkle_not_a_chat_bubble():
    assert "sparkle" in ICON.lower(), "the assistant slot stopped being a sparkle"
    assert "M8.2 12.35a1.2" not in ICON, "the old chat bubble's three dots are still drawn"


def test_the_glyph_paints_its_own_colour():
    assert "linearGradient" in ICON, "the sparkle must carry the AI gradient, not currentColor"
    assert "#a855f7" in ICON and "#22d3ee" in ICON, "the expected violet-to-cyan ramp is gone"


def test_bottom_nav_no_longer_tints_the_centre_slot():
    """The gradient fills the path, so a text colour override would be dead code
    that misleads the next reader into thinking the slot still follows the bar."""
    assert "ChatNavIcon active={isChatActive}" in SHELL
    start = SHELL.index("ChatNavIcon active={isChatActive}")
    block = SHELL[start - 900:start]
    assert "text-[var(--bottom-nav-text)]" not in block, \
        "the centre slot still sets a text colour the gradient ignores"


def test_gradient_ids_are_unique_per_instance():
    """The bar and the sheet menu can both mount this; a hardcoded id would make
    the second instance reuse the first one's gradient."""
    assert "useId()" in ICON, "a fixed SVG gradient id collides when two icons render"


if __name__ == "__main__":
    test_the_glyph_is_a_sparkle_not_a_chat_bubble()
    test_the_glyph_paints_its_own_colour()
    test_bottom_nav_no_longer_tints_the_centre_slot()
    test_gradient_ids_are_unique_per_instance()
    print("assistant nav icon OK")
