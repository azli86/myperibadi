"use client"

import { useEffect } from "react"
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getSessionId,
  isCookieAuthSentinel,
  markCookieAuthSession,
  setAuthTokens,
  setEmailVerified,
} from "@/lib/auth-session"
import { isLang, storeLanguagePreference } from "@/lib/lang"

const AUTH_RETRY_HEADER = "X-Auth-Retry"
const REFRESH_MARGIN_SECONDS = 60
const REFRESH_CHECK_INTERVAL_MS = 30_000
const AUTH_BYPASS_PATHS = new Set([
  "/api/login",
  "/api/register",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
])

const AUTH_PUBLIC_PAGE_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/offline",
])

function isAuthPublicPage(pathname: string): boolean {
  return (
    AUTH_PUBLIC_PAGE_PATHS.has(pathname) ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/public/cart/")
  )
}

type RefreshResponse = {
  access_token?: string
  refresh_token?: string
  language?: string
  email_verified?: boolean
}

let refreshInFlight: Promise<string | null> | null = null
let refreshAuthFailureCount = 0
let lastRefreshAuthFailureAt = 0
const REFRESH_AUTH_FAILURE_WINDOW_MS = 90_000
const MAX_REFRESH_AUTH_FAILURES_BEFORE_CLEAR = 6
const COOKIE_BOOTSTRAP_STORAGE_KEY = "budget-auth-cookie-bootstrap:v1"
const REFRESH_RATE_LIMIT_COOLDOWN_MS = 120_000
let refreshRateLimitedUntil = 0
let refreshAuthRejectedUntil = 0
const REFRESH_AUTH_REJECTED_COOLDOWN_MS = 5 * 60_000

function markRefreshAuthFailure() {
  const now = Date.now()
  if (now - lastRefreshAuthFailureAt > REFRESH_AUTH_FAILURE_WINDOW_MS) {
    refreshAuthFailureCount = 0
  }
  refreshAuthFailureCount += 1
  lastRefreshAuthFailureAt = now
}

function resetRefreshAuthFailureState() {
  refreshAuthFailureCount = 0
  lastRefreshAuthFailureAt = 0
}

function isAccessTokenExpiredOrUnknown(): boolean {
  const accessToken = getAccessToken()
  if (!accessToken) return true
  if (isCookieAuthSentinel(accessToken)) return true
  const exp = parseJwtExp(accessToken)
  if (!exp) return true
  const now = Math.floor(Date.now() / 1000)
  return exp <= now
}

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    let base64Payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padding = base64Payload.length % 4
    if (padding) {
      base64Payload += "=".repeat(4 - padding)
    }
    const payload = JSON.parse(atob(base64Payload))
    if (typeof payload?.exp !== "number") return null
    return payload.exp
  } catch {
    return null
  }
}

function shouldBypassAuthRetry(pathname: string): boolean {
  return AUTH_BYPASS_PATHS.has(pathname)
}

async function refreshTokens(rawFetch: typeof window.fetch): Promise<string | null> {
  if (Date.now() < refreshAuthRejectedUntil) {
    return null
  }

  if (Date.now() < refreshRateLimitedUntil) {
    return null
  }

  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      return null
    }

    try {
      const response = await rawFetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: isCookieAuthSentinel(refreshToken) ? null : refreshToken,
          session_id: getSessionId(),
        }),
      })

      if (!response.ok) {
        if (response.status === 429) {
          refreshRateLimitedUntil = Date.now() + REFRESH_RATE_LIMIT_COOLDOWN_MS
          return null
        }
        if (response.status === 401 || response.status === 403) {
          refreshAuthRejectedUntil = Date.now() + REFRESH_AUTH_REJECTED_COOLDOWN_MS
          markRefreshAuthFailure()
          if (refreshAuthFailureCount >= MAX_REFRESH_AUTH_FAILURES_BEFORE_CLEAR) {
            clearAuthSession()
          }
        }
        return null
      }

      const data = (await response.json()) as RefreshResponse
      if (!data?.access_token) {
        return null
      }

      resetRefreshAuthFailureState()
      refreshRateLimitedUntil = 0
      refreshAuthRejectedUntil = 0
      setAuthTokens(data.access_token, data.refresh_token ?? (isCookieAuthSentinel(refreshToken) ? undefined : refreshToken))
      if (typeof data.email_verified === "boolean") {
        setEmailVerified(data.email_verified)
      }
      if (isLang(data.language)) {
        storeLanguagePreference(data.language)
      }
      return data.access_token
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

export default function AuthSessionSync() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const isPublicPage = isAuthPublicPage(window.location.pathname)

    const maybeRefreshSoon = async () => {
      if (isPublicPage) return
      const accessToken = getAccessToken()
      const refreshToken = getRefreshToken()
      if (!refreshToken) return
      if (!accessToken || isCookieAuthSentinel(accessToken)) {
        await refreshTokens(originalFetch)
        return
      }

      const exp = parseJwtExp(accessToken)
      if (!exp) return

      const now = Math.floor(Date.now() / 1000)
      if (exp - now <= REFRESH_MARGIN_SECONDS) {
        await refreshTokens(originalFetch)
      }
    }

    const bootstrapCookieAuth = async () => {
      const refreshToken = getRefreshToken()
      if (!refreshToken) return
      const bootstrapMarker = window.sessionStorage.getItem(COOKIE_BOOTSTRAP_STORAGE_KEY)
      if (bootstrapMarker === refreshToken.slice(-16)) return
      // Skip bootstrap if access token is still valid — avoids unnecessary refresh
      // that can race with maybeRefreshSoon and cause hash mismatch on the server.
      const accessToken = getAccessToken()
      if (accessToken && !isCookieAuthSentinel(accessToken)) {
        const exp = parseJwtExp(accessToken)
        const now = Math.floor(Date.now() / 1000)
        if (exp && exp - now > REFRESH_MARGIN_SECONDS) {
          // Access token is still healthy; mark bootstrap as done without re-issuing.
          window.sessionStorage.setItem(COOKIE_BOOTSTRAP_STORAGE_KEY, refreshToken.slice(-16))
          return
        }
      }
      const refreshedToken = await refreshTokens(originalFetch)
      if (refreshedToken) {
        window.sessionStorage.setItem(COOKIE_BOOTSTRAP_STORAGE_KEY, refreshToken.slice(-16))
        markCookieAuthSession()
      }
    }

    const onFocus = () => {
      void maybeRefreshSoon()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void maybeRefreshSoon()
      }
    }

    if (!isPublicPage) {
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const response = await originalFetch(input, init)
        if (response.status !== 401) return response

      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, window.location.origin)
      if (!url.pathname.startsWith("/api/") || shouldBypassAuthRetry(url.pathname)) {
        return response
      }

      const requestHeaders = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      )
      if (requestHeaders.get(AUTH_RETRY_HEADER) === "1") {
        return response
      }
      const accessToken = getAccessToken()
      const refreshToken = getRefreshToken()
      const canRetryWithCookieAuth = isCookieAuthSentinel(accessToken) || isCookieAuthSentinel(refreshToken)
      if (!requestHeaders.has("Authorization") && !canRetryWithCookieAuth) {
        return response
      }
      if (input instanceof Request) {
        return response
      }

      const newAccessToken = await refreshTokens(originalFetch)
      if (!newAccessToken) {
        return response
      }

      if (isCookieAuthSentinel(newAccessToken)) {
        requestHeaders.delete("Authorization")
      } else {
        requestHeaders.set("Authorization", `Bearer ${newAccessToken}`)
      }
        requestHeaders.set(AUTH_RETRY_HEADER, "1")
        return originalFetch(input, { ...init, headers: requestHeaders })
      }
    }

    let intervalId: number | null = null
    if (!isPublicPage) {
      // Run sequentially: maybeRefreshSoon first, then bootstrapCookieAuth.
      // Running them in parallel caused a double-refresh race condition where
      // both requests hit /auth/refresh simultaneously; the server only stores
      // the hash of the last token issued, invalidating the first one and
      // triggering repeated 401 errors that eventually cleared the session.
      void maybeRefreshSoon().then(() => bootstrapCookieAuth())
      intervalId = window.setInterval(() => {
        void maybeRefreshSoon()
      }, REFRESH_CHECK_INTERVAL_MS)
      window.addEventListener("focus", onFocus)
      document.addEventListener("visibilitychange", onVisibilityChange)
    }

    return () => {
      window.fetch = originalFetch
      if (intervalId !== null) window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return null
}
