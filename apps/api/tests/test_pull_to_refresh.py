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
assert "if (pullDistance >= PULL_REFRESH_THRESHOLD) {" in SHELL, "the release point and the ring share one number"
assert "pullDistance >= 80" not in SHELL
# Same pages as before.
assert "const pullRefreshEnabled = pathname === `/${sessionId}` || pathname === `/${sessionId}/transactions`;" in SHELL
assert "<PullToRefreshIndicator pullDistance={pullDistance} refreshing={isRefreshing} lang={lang} />" in SHELL

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
