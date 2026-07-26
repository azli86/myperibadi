/**
 * Browser cache for My Vehicle images (IndexedDB blob store).
 * Avoids re-downloading private R2 images on every list/detail visit.
 *
 * localStorage only keeps a lightweight index (keys + timestamps) because
 * image blobs are too large for localStorage quotas.
 */

import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"

const DB_NAME = "budget-vehicle-image-cache-v1"
const DB_VERSION = 1
const STORE = "images"
const META_STORAGE_KEY = "budget-vehicle-image-meta-v1"
const MAX_CACHE_ENTRIES = 40
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

type CacheMeta = {
  vehicleId: number
  bust: number
  savedAt: number
  sizeBytes: number
}

type CacheRecord = {
  key: string
  vehicleId: number
  bust: number
  savedAt: number
  mimeType: string
  blob: Blob
}

const memoryUrls = new Map<string, string>()

function cacheKey(vehicleId: number, bust = 0) {
  return `${vehicleId}:${bust || 0}`
}

function readMetaIndex(): Record<string, CacheMeta> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, CacheMeta>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeMetaIndex(index: Record<string, CacheMeta>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(index))
  } catch {
    // Quota / private mode — index is best-effort only.
  }
}

function upsertMeta(meta: CacheMeta) {
  const index = readMetaIndex()
  index[String(meta.vehicleId)] = meta
  // prune oldest beyond MAX
  const entries = Object.values(index).sort((a, b) => b.savedAt - a.savedAt)
  const keep = new Set(entries.slice(0, MAX_CACHE_ENTRIES).map((e) => String(e.vehicleId)))
  for (const key of Object.keys(index)) {
    if (!keep.has(key)) delete index[key]
  }
  writeMetaIndex(index)
}

function removeMeta(vehicleId: number) {
  const index = readMetaIndex()
  delete index[String(vehicleId)]
  writeMetaIndex(index)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" })
        store.createIndex("vehicleId", "vehicleId", { unique: false })
        store.createIndex("savedAt", "savedAt", { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error("Failed to open image cache DB"))
  })
}

async function idbGet(key: string): Promise<CacheRecord | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as CacheRecord) || null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbPut(record: CacheRecord): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore write failures
  }
}

async function idbDeleteByVehicle(vehicleId: number): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      const store = tx.objectStore(STORE)
      const index = store.index("vehicleId")
      const req = index.openCursor(IDBKeyRange.only(vehicleId))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

function revokeMemory(key: string) {
  const url = memoryUrls.get(key)
  if (url) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
    memoryUrls.delete(key)
  }
}

function authHeaders(): HeadersInit {
  const token = getAccessToken()
  if (token && !isCookieAuthSentinel(token)) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

/**
 * Invalidate cached image for a vehicle (call after upload/replace/delete).
 */
export async function invalidateVehicleImageCache(vehicleId: number) {
  if (!vehicleId) return
  // revoke any memory urls for this vehicle
  for (const key of Array.from(memoryUrls.keys())) {
    if (key.startsWith(`${vehicleId}:`)) revokeMemory(key)
  }
  removeMeta(vehicleId)
  await idbDeleteByVehicle(vehicleId)
}

/**
 * Load vehicle image as a blob: URL, using local cache when possible.
 */
export async function loadVehicleImageUrl(
  vehicleId: number,
  options: { bust?: number; force?: boolean; ttlMs?: number } = {}
): Promise<string | null> {
  if (!vehicleId || typeof window === "undefined") return null
  const bust = Number(options.bust || 0)
  const key = cacheKey(vehicleId, bust)
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS

  if (!options.force) {
    const mem = memoryUrls.get(key)
    if (mem) return mem

    const meta = readMetaIndex()[String(vehicleId)]
    // If cached bust matches (or no bust requested), try IDB
    if (!meta || meta.bust === bust || bust === 0) {
      const preferredKey = meta ? cacheKey(vehicleId, meta.bust) : key
      const cached = await idbGet(preferredKey)
      if (cached?.blob && Date.now() - cached.savedAt < ttlMs) {
        // If caller asked for a newer bust, ignore stale
        if (bust && cached.bust !== bust) {
          // fall through to network
        } else {
          const url = URL.createObjectURL(cached.blob)
          memoryUrls.set(preferredKey, url)
          return url
        }
      }
    }
  }

  const res = await fetch(`/api/vehicles/${vehicleId}/image`, {
    credentials: "include",
    cache: "no-store",
    headers: authHeaders(),
  })
  if (!res.ok) return null
  const blob = await res.blob()
  if (!blob || blob.size <= 0) return null

  const savedAt = Date.now()
  const record: CacheRecord = {
    key,
    vehicleId,
    bust,
    savedAt,
    mimeType: blob.type || "image/jpeg",
    blob,
  }
  await idbPut(record)
  upsertMeta({ vehicleId, bust, savedAt, sizeBytes: blob.size })

  // Drop previous memory URLs for this vehicle
  for (const memKey of Array.from(memoryUrls.keys())) {
    if (memKey.startsWith(`${vehicleId}:`) && memKey !== key) revokeMemory(memKey)
  }

  const url = URL.createObjectURL(blob)
  memoryUrls.set(key, url)
  return url
}
