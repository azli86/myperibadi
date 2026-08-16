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
    if (Date.now() - parsed.savedAt > ttlMs) {
      storage.removeItem(cacheKey(url, token))
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

export function writeApiCache<T>(url: string, token: string | null | undefined, data: T) {
  const storage = getStorage()
  if (!storage) return
  const key = cacheKey(url, token)
  const value = JSON.stringify({ savedAt: Date.now(), data } satisfies CacheEnvelope<T>)
  try {
    storage.setItem(key, value)
  } catch {
    // Cache is disposable: clear it rather than starving auth/account storage.
    for (let i = storage.length - 1; i >= 0; i--) {
      const storedKey = storage.key(i)
      if (storedKey?.startsWith(`${CACHE_PREFIX}:`)) storage.removeItem(storedKey)
    }
    try { storage.setItem(key, value) } catch { /* best-effort cache */ }
  }
}

export function invalidateApiCache(url: string, token: string | null | undefined) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(cacheKey(url, token))
  } catch {
    // Best-effort.
  }
}

export function invalidateApiCachePrefix(prefix: string, token: string | null | undefined) {
  const storage = getStorage()
  if (!storage) return
  try {
    const needle = `${CACHE_PREFIX}:${tokenScope(token)}:${prefix}`
    const keys: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key && key.startsWith(needle)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    // Best-effort.
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
