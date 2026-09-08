"use client"

import { useEffect, useState } from "react"

// Client-side avatar cache: the R2 avatar image is fetched once into a data URL
// then served from localStorage forever after, so the avatar image never reloads
// on every page open. It only changes when the user uploads a new one (written
// via cacheAvatarFromUrl after an upload) or removes it (clearAvatar).
const KEY = "budget.avatar.dataurl.v1"

export function readAvatarCache(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(KEY) || null
  } catch {
    return null
  }
}

export function writeAvatarCache(value: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (value) localStorage.setItem(KEY, value)
    else localStorage.removeItem(KEY)
  } catch {
    // localStorage full / unavailable — fall back to network fetch.
  }
}

// Fetch the remote avatar image once and store it as a data URL. No-op if the
// URL is already a data URL. Returns the cached string or null on failure.
export async function cacheAvatarFromUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  if (url.startsWith("data:")) {
    writeAvatarCache(url)
    return url
  }
  try {
    // Same-origin proxy so the CDN CORS restriction doesn't block caching.
    const res = await fetch(`/api/avatar-proxy?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    writeAvatarCache(dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

// Resolve the avatar src: prefers the cached data URL (no load), falls back to
// the remote URL, and re-syncs whenever the user uploads/removes an avatar.
export function useAvatar(remoteUrl?: string | null): string | null {
  // Initial null on purpose: reading localStorage during the first client
  // render would differ from the server SSR markup (SVG fallback vs cached
  // <img>) and cause React hydration mismatch (#418). The cache is applied in
  // the effect after hydration.
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      const cached = readAvatarCache()
      if (cached) {
        setSrc(cached)
        return
      }
      if (remoteUrl) {
        setSrc(remoteUrl)
        void cacheAvatarFromUrl(remoteUrl).then((s) => {
          if (s) setSrc(s)
        })
      } else {
        setSrc(null)
      }
    }
    sync()
    window.addEventListener("avatar-updated", sync)
    return () => window.removeEventListener("avatar-updated", sync)
  }, [remoteUrl])

  return src
}
