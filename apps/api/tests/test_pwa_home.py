"""A phone opens on a light home; desktop keeps the dashboard.

The full dashboard ships recharts, chart.js and a 3,600-line page before it can
paint, which made the home slow to open on a phone. It began as an
installed-PWA-only screen, but an Android home-screen shortcut opens a plain
Chrome tab (display-mode "browser"), so the screen size decides. Pinned here:

1. The home route never imports the dashboard statically, so a phone does not
   download it. It is a dynamic chunk, prefetched on desktop.

2. The light home imports no chart library.

3. The light home reads the same URLs as the dashboard, so the two share one
   cache and show the same balance and cycle totals.

4. A user still due for onboarding is handed to the full dashboard, where the
   onboarding flow lives.

Run: cd apps/api && venv/bin/python -m tests.test_pwa_home
"""
from pathlib import Path

HOME_DIR = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
PAGE = (HOME_DIR / "page.tsx").read_text(encoding="utf-8")
LITE = (HOME_DIR / "PwaHome.tsx").read_text(encoding="utf-8")
DASH = (HOME_DIR / "DashboardHome.tsx").read_text(encoding="utf-8")

# 1. Dynamic dashboard only.
assert 'from "./DashboardHome"' not in PAGE, "a static import would ship the dashboard to the PWA"
assert 'import("./DashboardHome")' in PAGE
assert "dynamic(loadDashboard" in PAGE
assert "(max-width: 767.98px)" in PAGE, "phones get the light home"
assert "matchMedia(\"(display-mode" not in PAGE, "an Android shortcut reports display-mode browser; do not gate on it"
assert "home-diag" not in PAGE, "the temporary diagnostic beacon is gone"
assert "useSyncExternalStore(noopSubscribe, prefersLiteHome, () => null)" in PAGE, \
    "the server cannot see display-mode; it must render the neutral skeleton"

# 2. No charts in the light home.
for lib in ("recharts", "chart.js", "react-chartjs-2"):
    assert lib not in LITE, f"{lib} must stay out of the light home"

# 3. Same URLs as the dashboard.
for url in ('"/api/stats"', '"/api/transactions"', '"/api/users/me"', '"/api/cycles/me"', '"/api/wallets"'):
    assert url in LITE and url in DASH, f"{url} must be shared so the cache and numbers match"

# 4. Onboarding hand-off.
assert "me.onboarding_done === false" in LITE and "handoffRef.current()" in LITE
assert "onNeedsFullDashboard={handOver}" in PAGE

# 5. The home shows one wallet (the bot default); tapping it opens a sheet with
# every wallet, which closes on back and swipe like the other sheets.
assert "wallets.find((w) => w.is_bot_default) ?? wallets[0]" in LITE
assert LITE.count("onClick={() => setWalletsOpen(true)}") == 2, "the card and the header link both open the sheet"
assert 'useOverlayBackClose({ id: "pwa-home-wallets"' in LITE and "useSwipeDownToClose(requestWalletsClose)" in LITE
assert 'title={tr("Semua Dompet", "All Wallets")}' in LITE

# 6. The top right holds the announcement bell, not the avatar. It opens a
# panel from the right with the history, a tab per type, and each title opens
# the full announcement page. The Shell's inline banner yields to the bell.
assert "UserAvatar" not in LITE, "the bell replaced the avatar"
assert "useAnnouncements()" in LITE and "<AnnouncementList" in LITE
assert '"translateX(100%)"' in LITE, "the panel slides in from the right"
assert 'className="absolute inset-0 flex flex-col bg-[var(--page-bg)]' in LITE, "the panel opens full screen"
assert 'useOverlayBackClose({ id: "pwa-home-notices"' in LITE
assert '"portal:notice-banner-inline", { detail: { hidden: true } }' in LITE
SHELL = (HOME_DIR.parents[1] / "components" / "layout" / "Shell.tsx").read_text(encoding="utf-8")
assert "&& !noticeInlineHidden" in SHELL, "the Shell banner yields to the bell"
LIST = (HOME_DIR.parents[1] / "components" / "announcements" / "AnnouncementList.tsx").read_text(encoding="utf-8")
for key in ('key: "info", label: "Info"', 'key: "warning", label: "Warning"', 'key: "alert", label: "Alert"'):
    assert key in LIST, f"missing tab {key}"
assert 'key: "all", label: tr("Semua", "All")' in LIST, "an All tab comes first"
assert 'useState<Tab>("all")' in LIST, "the list opens on All"
assert 'tr("Hari ini", "Today")' in LIST and 'tr("Semalam", "Yesterday")' in LIST, "grouped by day like recent activity"
assert "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" in LIST, "a large icon on the left"
assert '? "bg-transparent text-[var(--muted)]"' in LIST and ": TONE_STYLE[t.key].tabActive" in LIST, \
    "idle tabs are plain grey text; only the active one is a coloured pill"
assert "text-[0.625rem] font-bold transition-colors" in LIST, "small tab text"
assert 'tabActive: "bg-amber-400 text-amber-950"' in LIST, "white on amber is under 3:1"
assert 'href={`/${sessionId}/announcements/${n.id}`}' in LIST
DETAIL = (HOME_DIR / "announcements" / "[id]" / "page.tsx").read_text(encoding="utf-8")
assert "whitespace-pre-line" in DETAIL, "the full page keeps the admin's line breaks"

# 7. The list shows a one-line teaser; the full text needs a tap.
assert "line-clamp-2" not in LIST and "block truncate text-xs" in LIST
assert 'message.split(/\\n\\s*\\n/)[0]' in LIST, "only the first paragraph is teased"

# 8. On desktop the bell sits in the right rail's footer beside Settings, and
# the dashboard banner is hidden from lg up (tablets, with no rail, keep it).
assert "<DesktopAnnouncementBell sessionId={sessionId} lang={lang} />" in SHELL
assert SHELL.index('{lang === "BM" ? "Tetapan" : "Settings"}</span>') < SHELL.index("<DesktopAnnouncementBell"), "the bell follows Settings"
assert "shadow-[var(--shadow-soft)] lg:hidden" in SHELL, "the dashboard banner yields to the rail bell on desktop"

print("pwa home OK")
