import { isCookieAuthSentinel } from "@/lib/auth-session"

type CacheEnvelope<T> = {
  savedAt: number
  data: T
}

type FetchApiJsonOptions = {
  headers?: HeadersInit
}

const CACHE_PREFIX = "budget-by-digitalport:api:v1"
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
const inflight = new Map<string, Promise<unknown>>()

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage || window.sessionStorage || null
  } catch {
    try {
      return window.sessionStorage || null
    } catch {
      return null
    }
  }
}

function tokenScope(token: string | null | undefined) {
  if (token && !isCookieAuthSentinel(token)) return token.slice(-16)
  return "cookie"
}

function cacheKey(url: string, token: string | null | undefined) {
  return `${CACHE_PREFIX}:${tokenScope(token)}:${url}`
}

export function readApiCache<T>(url: string, token: string | null | undefined, ttlMs = DEFAULT_CACHE_TTL_MS): T | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(cacheKey(url, token))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (!parsed || typeof parsed.savedAt !== "number") return null
    if (Date.now() - parsed.savedAt > ttlMs) return null
    return parsed.data
  } catch {
    return null
  }
}

export function writeApiCache<T>(url: string, token: string | null | undefined, data: T) {
  const storage = getStorage()
  if (!storage) return
  try {
    const envelope: CacheEnvelope<T> = { savedAt: Date.now(), data }
    storage.setItem(cacheKey(url, token), JSON.stringify(envelope))
  } catch {
    // Cache is best-effort only.
  }
}

export async function fetchApiJson<T>(url: string, token: string | null | undefined, options: FetchApiJsonOptions = {}): Promise<T> {
  const key = cacheKey(url, token)
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const request = fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`)
    }
    const data = (await res.json()) as T
    writeApiCache(url, token, data)
    return data
  }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, request)
  return request
}
