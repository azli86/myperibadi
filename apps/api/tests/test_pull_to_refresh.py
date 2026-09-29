"""Pull to refresh shows where the release point is and stays up while it runs.

Two defects in the old indicator are pinned:

1. Its opacity followed the pull distance, which resets to 0 on release, so
   the "refreshing" spinner was never visible. It now stays at full opacity
   while the refresh runs.
2. Its ring filled at 110px while the refresh fired at 80px. Both now read the
   same PULL_REFRESH_THRESHOLD.

Run: cd apps/api && venv/bin/python -m tests.test_pull_to_refresh
"""
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "web" / "src" / "components" / "layout"
IND = (WEB / "PullToRefreshIndicator.tsx").read_text(encoding="utf-8")
SHELL = (WEB / "Shell.tsx").read_text(encoding="utf-8")

# 1.
assert "opacity: refreshing ? 1 :" in IND, "the indicator must stay visible while refreshing"
# 2.
assert "export const PULL_REFRESH_THRESHOLD = 80" in IND
assert "const progress = Math.min(pullDistance / PULL_REFRESH_THRESHOLD, 1)" in IND
HOOK = (WEB.parents[1] / "hooks" / "usePullToRefresh.ts").read_text(encoding="utf-8")
assert "const fire = distanceRef.current >= PULL_REFRESH_THRESHOLD" in HOOK, "the release point and the ring share one number"
assert "pullDistance >= 80" not in SHELL

# Every page now, through the shared hook, except where a downward pull
# means something else (full-screen chat, the map pages) and under the PIN lock.
assert "const pullRefreshEnabled = !isChatFullscreen && !isMapPage && !pinLockRequired;" in SHELL
assert "pathname === `/${sessionId}/map-analysis`" in SHELL
assert "usePullToRefresh({ enabled: pullRefreshEnabled, onRefresh: handleManualRefresh })" in SHELL
assert "{...pullToRefresh.handlers}" in SHELL
# The refresh remounts the page, so pages need no hook of their own.
assert "key={refreshKey}" in SHELL and "setRefreshKey((prev) => prev + 1);" in SHELL
# Guards that keep a pull from meaning refresh everywhere.
for guard in ('[data-prevent-pull-refresh="true"]', "[data-swipe-sheet]", '[role="dialog"]', "el.scrollTop > 0", "root.scrollTop > 4", "dx > dy * 0.6"):
    assert guard in HOOK, f"missing guard: {guard}"

# 3. On pages with the fixed MobilePageHeader (z-120, e.g. transactions) the
# badge sat behind the bar. It is fixed above it and drops in under its edge.
assert "fixed inset-x-0 z-[125]" in IND
assert 'document.querySelector<HTMLElement>("[data-mobile-page-header]")' in IND
HEADER = (WEB.parent / "layout" / "PageHeader.tsx").read_text(encoding="utf-8")
assert "data-mobile-page-header" in HEADER and "z-[120]" in HEADER

# 4. The logo is inlined (96px data URI) instead of fetching the 197KB
# /icon-512-v3.png, which was decoded again on each appearance and blinked.
assert "/icon-512-v3.png" not in IND and "src={PULL_REFRESH_LOGO_SRC}" in IND
LOGO = (WEB / "pull-refresh-logo.ts").read_text(encoding="utf-8")
assert 'PULL_REFRESH_LOGO_SRC = "data:image/png;base64,' in LOGO
assert len(LOGO) < 20000, "keep the inlined logo small"

print("pull to refresh OK")
