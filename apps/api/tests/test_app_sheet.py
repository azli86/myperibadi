"""Every popup sheet shares one look, set in two places.

All sheets use the .app-sheet-panel class and <AppSheetHeader>, so the sheet
redesign lives there and reaches every sheet without touching page logic.
<AppSheet> wraps the pieces each sheet used to repeat by hand.

Pinned here:

1. AppSheetHeader keeps every prop the pages pass, so no page changes.
2. The entrance animates `translate`/`scale`, never `transform`: pages drive
   swipe and translateZ through inline transforms, which would be overwritten.
3. Motion is dropped for reduced-motion users.
4. AppSheet closes through the shared back-button stack and hides the nav.

Run: cd apps/api && venv/bin/python -m tests.test_app_sheet
"""
import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "web" / "src"
HEADER = (WEB / "components" / "ui" / "AppSheetHeader.tsx").read_text(encoding="utf-8")
SHEET = (WEB / "components" / "ui" / "AppSheet.tsx").read_text(encoding="utf-8")
CSS = (WEB / "app" / "globals.css").read_text(encoding="utf-8")

# 1.
for prop in ("title", "onClose", "eyebrow", "subtitle", "icon", "action", "showCancel", "hideClose", "className"):
    assert re.search(rf"\b{prop}\??:", HEADER), f"AppSheetHeader lost the {prop} prop"
assert "app-sheet-panel-header" in HEADER

# 2.
for name in ("app-sheet-rise", "app-sheet-pop"):
    body = CSS[CSS.index(f"@keyframes {name}"):]
    body = body[: body.index("}\n}") + 3]
    assert "transform" not in body, f"{name} must not animate transform"

# 3.
assert "@media (prefers-reduced-motion: reduce)" in CSS[CSS.index("/* ── Sheet redesign"):]

# 4.
assert "useOverlayBackClose({ id, isOpen: open, onClose })" in SHEET
assert '"portal:mobile-bottom-nav-visibility"' in SHEET
assert "<AppSheetHeader" in SHEET and "app-sheet-panel" in SHEET

print("app sheet OK")
