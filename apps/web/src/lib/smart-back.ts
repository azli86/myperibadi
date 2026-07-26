export const SMART_BACK_CURRENT_KEY = "budget-by-digitalport:current-route"
export const SMART_BACK_PREVIOUS_KEY = "budget-by-digitalport:previous-route"

export function readSmartBackPreviousRoute(): string | null {
  if (typeof window === "undefined") return null
  return window.sessionStorage.getItem(SMART_BACK_PREVIOUS_KEY)
}

export function writeSmartBackRoute(nextRoute: string) {
  if (typeof window === "undefined") return
  const current = window.sessionStorage.getItem(SMART_BACK_CURRENT_KEY)
  if (current && current !== nextRoute) {
    window.sessionStorage.setItem(SMART_BACK_PREVIOUS_KEY, current)
  }
  window.sessionStorage.setItem(SMART_BACK_CURRENT_KEY, nextRoute)
}
