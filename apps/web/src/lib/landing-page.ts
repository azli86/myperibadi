// The "Halaman Utama" setting was removed: the app always opens on the dashboard.
// This cookie name is kept only so middleware can delete it on devices that still
// carry it — otherwise those devices would keep being redirected to an old screen.
export const LANDING_COOKIE = "budget_landing"
