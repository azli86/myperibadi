"""The mobile page header must paint above the shell's safe-area strip.

The shell renders an opaque `--bg` bar at `z-[110]`, one `env(safe-area-inset-top)`
tall. On a notched iPhone that inset is 47-59px, so at `z-40` the strip covered
the header's action button entirely; on Android the inset reports 0, the strip
was 0px tall, and the button survived. The bug was invisible on every developer
device that was not an iPhone.

Run: cd apps/api && venv/bin/python -m tests.test_mobile_header_safe_area
"""
from pathlib import Path

SHELL = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "components" / "layout" / "Shell.tsx"
).read_text(encoding="utf-8")
HEADER = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "components" / "layout" / "PageHeader.tsx"
).read_text(encoding="utf-8")


def _z(needle: str, source: str) -> int:
    """Read the arbitrary z-index out of a `z-[NNN]` utility."""
    start = source.index(needle) + len(needle)
    end = source.index("]", start)
    return int(source[start:end])


def test_the_shell_still_owns_a_safe_area_strip():
    assert "safe-area-inset-top" in SHELL, "the strip this test guards against is gone"
    assert 'z-[110]' in SHELL


def test_the_header_outranks_that_strip():
    header_z = _z('"fixed inset-x-0 top-0 z-[', HEADER)
    strip_z = _z('"fixed top-0 left-0 right-0 h-[env(safe-area-inset-top,0px)] z-[', SHELL)
    assert header_z > strip_z, \
        f"header z={header_z} loses to the safe-area strip z={strip_z}; the action disappears on iOS"


def test_the_header_pads_for_the_inset_itself():
    assert "env(safe-area-inset-top,0px)" in HEADER, \
        "the header must own the inset now that it paints above the strip, or its title sits under the clock"


if __name__ == "__main__":
    test_the_shell_still_owns_a_safe_area_strip()
    test_the_header_outranks_that_strip()
    test_the_header_pads_for_the_inset_itself()
    print("mobile header safe area OK")
