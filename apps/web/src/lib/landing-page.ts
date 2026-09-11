// Which screen the app opens on. Per-device setting (localStorage) — no API round trip.
export const LANDING_PAGE_KEY = "budget.landingPage.v1"

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
  return window.localStorage.getItem(LANDING_PAGE_KEY) || LANDING_PAGES[0].id
}

export function setLandingPageId(id: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LANDING_PAGE_KEY, id)
}

/** Post-login / app-open destination for this device. */
export function getLandingPath(sessionId: string): string {
  const page = LANDING_PAGES.find((p) => p.id === getLandingPageId()) ?? LANDING_PAGES[0]
  return `/${sessionId}${page.path}`
}
