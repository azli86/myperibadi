"use client"

import { useCallback, useEffect, useState } from "react"
import { getAccessToken } from "@/lib/auth-session"
import { fetchApiJson, readApiCache } from "@/lib/api-cache"

// Announcements an admin publishes from Mastermind ("Notis & Pengumuman").
// Every distinct notice saved there is kept as a history row in the database;
// /api/announcements lists them newest first.

export type Announcement = {
  id: number
  type: "info" | "warning" | "alert" | string
  title_bm: string
  message_bm: string
  title_en: string
  message_en: string
  created_at: string
  /** The notice switched on in Mastermind right now. */
  is_current: boolean
}

const LIST_URL = "/api/announcements"
const SEEN_KEY = "mp-announcement-seen-id"

/** Title and message in the reader's language, falling back to the other one. */
export function announcementText(a: Pick<Announcement, "title_bm" | "message_bm" | "title_en" | "message_en">, lang: string) {
  const bm = lang === "BM"
  const title = (bm ? a.title_bm || a.title_en : a.title_en || a.title_bm) || ""
  const message = (bm ? a.message_bm || a.message_en : a.message_en || a.message_bm) || ""
  return { title: title.trim(), message: message.trim() }
}

/** The server stores UTC without a zone; read it as UTC and show it locally. */
export function announcementDate(a: Pick<Announcement, "created_at">, lang: string, withTime = false) {
  const raw = a.created_at
  const iso = /Z|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(lang === "BM" ? "ms-MY" : "en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

// Named as Mastermind names them (info, warning, alert), in both languages.
/** created_at as a Date: the server stores UTC without a zone. */
export function announcementInstant(a: Pick<Announcement, "created_at">) {
  const raw = a.created_at
  const iso = /Z|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function announcementTone(type: string, _lang?: string) {
  if (type === "alert") return { key: "alert" as const, label: "Alert" }
  if (type === "warning") return { key: "warning" as const, label: "Warning" }
  return { key: "info" as const, label: "Info" }
}

function readSeenId() {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY) || 0) || 0
  } catch {
    return 0
  }
}

/** History, newest first, plus whether anything is newer than what was last seen. */
export function useAnnouncements() {
  const [items, setItems] = useState<Announcement[] | null>(null)
  const [seenId, setSeenId] = useState(0)

  useEffect(() => {
    setSeenId(readSeenId())
    const token = getAccessToken()
    const cached = readApiCache<Announcement[]>(LIST_URL, token, 24 * 60 * 60 * 1000)
    if (cached) setItems(cached)
    let cancelled = false
    fetchApiJson<Announcement[]>(LIST_URL, token)
      .then((fresh) => {
        if (!cancelled) setItems(Array.isArray(fresh) ? fresh : [])
      })
      .catch(() => {
        if (!cancelled) setItems((prev) => prev ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const latestId = items && items.length ? items[0].id : 0
  const markAllSeen = useCallback(() => {
    if (!latestId) return
    try {
      window.localStorage.setItem(SEEN_KEY, String(latestId))
    } catch {
      // Private mode: the dot just shows again next time.
    }
    setSeenId(latestId)
  }, [latestId])

  return { items, unread: latestId > seenId, seenId, markAllSeen }
}
