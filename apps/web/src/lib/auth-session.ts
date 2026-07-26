export const ACCESS_TOKEN_STORAGE_KEY = "token"
export const REFRESH_TOKEN_STORAGE_KEY = "refresh_token"
export const SESSION_ID_STORAGE_KEY = "sessionId"
export const AUTH_SESSION_CHANGED_EVENT = "budget-auth-session-changed"
export const COOKIE_AUTH_SENTINEL = "__cookie_auth__"

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function authStore(): Storage | null {
  if (!isBrowser()) return null
  return window.localStorage
}

function migrateSessionStorageAuth() {
  if (!isBrowser()) return
  try {
    const store = authStore()
    const keys = [ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY, SESSION_ID_STORAGE_KEY]
    for (const key of keys) {
      const sessionValue = window.sessionStorage.getItem(key)
      if (sessionValue && !store?.getItem(key)) {
        store?.setItem(key, sessionValue)
      }
      window.sessionStorage.removeItem(key)
    }
  } catch {
    // Best-effort migration only.
  }
}

function notifyAuthSessionChanged() {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT))
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null
  migrateSessionStorageAuth()
  return authStore()?.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? null
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null
  migrateSessionStorageAuth()
  return authStore()?.getItem(REFRESH_TOKEN_STORAGE_KEY) ?? null
}

export function getSessionId(): string | null {
  if (!isBrowser()) return null
  migrateSessionStorageAuth()
  return authStore()?.getItem(SESSION_ID_STORAGE_KEY) ?? null
}

export function isCookieAuthSentinel(token: string | null | undefined): boolean {
  return token === COOKIE_AUTH_SENTINEL
}

export function markCookieAuthSession() {
  if (!isBrowser()) return
  migrateSessionStorageAuth()
  authStore()?.setItem(ACCESS_TOKEN_STORAGE_KEY, COOKIE_AUTH_SENTINEL)
  authStore()?.setItem(REFRESH_TOKEN_STORAGE_KEY, COOKIE_AUTH_SENTINEL)
  notifyAuthSessionChanged()
}

type SessionTokenPayload = {
  pin_enabled?: boolean
}

function parseTokenPayload(token: string): SessionTokenPayload | null {
  try {
    const segments = token.split(".")
    if (segments.length < 2) return null

    let base64Payload = segments[1].replace(/-/g, "+").replace(/_/g, "/")
    const padding = base64Payload.length % 4
    if (padding) {
      base64Payload += "=".repeat(4 - padding)
    }

    const decoded = atob(base64Payload)
    return JSON.parse(decoded) as SessionTokenPayload
  } catch {
    return null
  }
}

export function hasPinEnabledSession(): boolean {
  if (!isBrowser()) return false

  const accessToken = getAccessToken()
  const refreshToken = getRefreshToken()
  if (isCookieAuthSentinel(accessToken) || isCookieAuthSentinel(refreshToken)) {
    return true
  }

  const payload = accessToken
    ? parseTokenPayload(accessToken)
    : refreshToken
      ? parseTokenPayload(refreshToken)
      : null

  return payload?.pin_enabled === true
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === "x" ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export function ensureSessionId(): string | null {
  if (!isBrowser()) return null
  migrateSessionStorageAuth()
  const store = authStore()
  const existing = store?.getItem(SESSION_ID_STORAGE_KEY)
  if (existing) return existing
  const next = generateSessionId()
  store?.setItem(SESSION_ID_STORAGE_KEY, next)
  return next
}

export function setAuthTokens(accessToken: string, refreshToken?: string | null) {
  if (!isBrowser()) return
  migrateSessionStorageAuth()
  const store = authStore()
  store?.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken)
  if (refreshToken) {
    store?.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  }
  notifyAuthSessionChanged()
}

export function clearAuthSession() {
  if (!isBrowser()) return
  migrateSessionStorageAuth()
  const store = authStore()
  store?.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  store?.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  store?.removeItem(SESSION_ID_STORAGE_KEY)
  notifyAuthSessionChanged()
}

export function getLoginRedirectPath(sessionId: string): string {
  if (typeof window !== "undefined" && window.location.hostname.includes("removed_business")) {
    return `/${sessionId}/removed_business`
  }
  return `/${sessionId}`
}

export async function logoutAuthSession() {
  if (!isBrowser()) return

  const accessToken = getAccessToken()
  const refreshToken = getRefreshToken()
  try {
    if (accessToken || refreshToken) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...((accessToken && !isCookieAuthSentinel(accessToken)) ? { "Authorization": `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          refresh_token: refreshToken && !isCookieAuthSentinel(refreshToken) ? refreshToken : null,
          session_id: getSessionId(),
        }),
      })
    }
  } catch {
    // Best effort logout; local session clear still proceeds.
  } finally {
    clearAuthSession()
  }
}
