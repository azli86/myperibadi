// Which screen the app opens on. Per-device setting (localStorage + cookie) — no API round trip.
// The cookie mirrors localStorage so middleware can redirect server-side, before
// the dashboard ever renders.
export const LANDING_PAGE_KEY = "budget.landingPage.v1"
export const LANDING_COOKIE = "budget_landing"
const LANDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type LandingPage = { id: string; path: string; bm: string; en: string }

export const LANDING_PAGES: LandingPage[] = [
  { id: "dashboard", path: "", bm: "Utama", en: "Home" },
  { id: "chat", path: "/chat", bm: "Chat", en: "Chat" },
  { id: "transactions", path: "/transactions", bm: "Transaksi", en: "Transactions" },
  { id: "budget", path: "/budget", bm: "Bajet", en: "Budget" },
  { id: "receipts", path: "/receipts", bm: "Resit", en: "Receipts" },
  { id: "health", path: "/health", bm: "Kesihatan", en: "Health" },
  { id: "inventory", path: "/inventory", bm: "Barang Saya", en: "My Inventory" },
]

export function getLandingPageId(): string {
  if (typeof window === "undefined") return LANDING_PAGES[0].id
  const stored = window.localStorage.getItem(LANDING_PAGE_KEY) || readCookie() || LANDING_PAGES[0].id
  // Keep the server-side redirect in sync (covers devices that set it pre-cookie).
  if (readCookie() !== stored) writeCookie(stored)
  return stored
}

export function setLandingPageId(id: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LANDING_PAGE_KEY, id)
  writeCookie(id)
}

/** Path suffix for a known landing id, or null when it means "stay on dashboard". */
export function landingPathForId(id: string | undefined | null): string | null {
  const page = LANDING_PAGES.find((p) => p.id === id && p.path)
  return page ? page.path : null
}

function readCookie(): string {
  const parts = document.cookie ? document.cookie.split("; ") : []
  const hit = parts.find((c) => c.startsWith(`${LANDING_COOKIE}=`))
  return hit ? decodeURIComponent(hit.slice(LANDING_COOKIE.length + 1)) : ""
}

function writeCookie(id: string) {
  document.cookie = `${LANDING_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${LANDING_COOKIE_MAX_AGE}; SameSite=Lax`
}

/** Post-login / app-open destination for this device. */
export function getLandingPath(sessionId: string): string {
  const page = LANDING_PAGES.find((p) => p.id === getLandingPageId()) ?? LANDING_PAGES[0]
  return `/${sessionId}${page.path}`
}
