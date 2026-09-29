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

Run: cd apps/api && venv/bin/python -m tests.test_mobile_home
"""
from pathlib import Path

HOME_DIR = Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "[sessionId]"
PAGE = (HOME_DIR / "page.tsx").read_text(encoding="utf-8")
LITE = (HOME_DIR / "MobileHome.tsx").read_text(encoding="utf-8")
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
# The card shows the top wallet in the user's dashboard order (as the old
# dashboard did), and the sheet lets them drag to reorder, saved the same way.
assert "const homeWallet = heroWallets === null ? undefined : heroWallets[0] ?? null" in LITE
assert 'fetch("/api/wallets/dashboard-order"' in LITE and "body: JSON.stringify({ ordered_ids: orderedIds })" in LITE
assert "deckHoldTimerRef.current = setTimeout(() => activateDeckDrag(kind, wallet), 230)" in LITE, "long-press to lift, as before"
assert 'data-deck-kind={group.key}' in LITE, "rows reorder within their group"
assert LITE.count("onClick={() => setWalletsOpen(true)}") == 2, "the card and the header link both open the sheet"
assert 'id="mobile-home-wallets"' in LITE and "<AppSheet" in LITE, "the wallets sheet uses the shared AppSheet"
assert 'title={tr("Semua Dompet", "All Wallets")}' in LITE

# 6. The top right holds the announcement bell, not the avatar. It opens a
# panel from the right with the history, a tab per type, and each title opens
# the full announcement page.
assert "UserAvatar" not in LITE, "the bell replaced the avatar"
assert "useAnnouncements()" in LITE and "<AnnouncementList" in LITE
assert '"translateX(100%)"' in LITE, "the panel slides in from the right"
assert 'className="absolute inset-0 flex flex-col bg-[var(--page-bg)]' in LITE, "the panel opens full screen"
assert 'useOverlayBackClose({ id: "mobile-home-notices"' in LITE
SHELL = (HOME_DIR.parents[1] / "components" / "layout" / "Shell.tsx").read_text(encoding="utf-8")
# The Shell's inline notice banner is gone: announcements live behind the
# bell. It re-fetched on every page change and every 30s, and blinked.
assert "noticeBannerNode" not in SHELL and "/api/notice-banners" not in SHELL
LIST = (HOME_DIR.parents[1] / "components" / "announcements" / "AnnouncementList.tsx").read_text(encoding="utf-8")
for key in ('key: "info", label: "Info"', 'key: "warning", label: "Warning"', 'key: "alert", label: "Alert"'):
    assert key in LIST, f"missing tab {key}"
assert 'key: "all", label: tr("Semua", "All")' in LIST, "an All tab comes first"
assert 'useState<Tab>("all")' in LIST, "the list opens on All"
assert 'tr("Hari ini", "Today")' in LIST and 'tr("Semalam", "Yesterday")' in LIST, "grouped by day like recent activity"
assert "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" in LIST, "a large icon on the left"
assert '? "bg-transparent text-[var(--muted)]"' in LIST and ": TONES[t.key].tabActive" in LIST, \
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

# 9. Tapping the balance opens the old dashboard's expense charts popup
# straight away (no small chart cards); its chart library loads only then.
assert "miniCharts" not in LITE, "no small chart cards on the phone home"
assert LITE.count("onClick={() => setChartsOpen(true)}") == 2, "the balance and the Balance Info link open the popup"
assert 'tr("Info Baki", "Balance Info")' in LITE
assert 'dynamic(() => import("./MobileHomeCharts")' in LITE and "ssr: false" in LITE
CHARTS = (HOME_DIR / "MobileHomeCharts.tsx").read_text(encoding="utf-8")
assert 'from "react-chartjs-2"' in CHARTS, "the popup keeps the old bar charts"

# 11. The phone home is the only home on phones: no ?home= override, and the
# old dashboard's phone layout is gone from DashboardHome.
assert "home=" not in PAGE and 'get("home")' not in PAGE, "no ?home= override"
assert "MOBILE VIEW (md:hidden)" not in DASH and "showMobileWalletDeck" not in DASH

# 12. The cat widget from the old phone home lives in the menu sheet, after
# the nav groups, and its arena opens above that sheet (z-500).
menu = SHELL[SHELL.index("Destinations: five named groups"):SHELL.index("{showAddModal && (")]
assert 'presentation="chip"' in menu and "<CatPlayground" in menu
CAT = (HOME_DIR.parents[1] / "components" / "dashboard" / "CatPlayground.tsx").read_text(encoding="utf-8")
assert "fixed inset-0 z-[600]" in CAT, "the arena must open above the z-500 menu sheet"

# 13. The phone home follows the app theme (its own fixed palette was tried
# and rolled back), and carries no blue: the charts and the bell's Info tone
# use orange.
assert not (HOME_DIR / "mobile-home-palette.ts").exists()
assert "root.style.setProperty" not in LITE and "theme-color" not in LITE
import re as _re
BLUE = r"#(2563eb|93c5fd|60a5fa|3b82f6|0ea5e9|0284c7|06b6d4|0369a1)"
home_tones = LIST[LIST.index("const HOME_TONE_STYLE"):LIST.index("/**", LIST.index("const HOME_TONE_STYLE"))]
assert not _re.search(BLUE, CHARTS, _re.I), "blue in the charts"
assert "sky" not in home_tones, "the home's Info tone is not sky"
assert 'palette="home"' in LITE

print("mobile home OK")
