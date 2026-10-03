"use client"

import "leaflet/dist/leaflet.css"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Check, ExternalLink, List, Loader2, LocateFixed, MapPin, MapPinned, Pencil, Plus, RefreshCw, Share2, Trash2, Users, X } from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken } from "@/lib/auth-session"
import { useTheme } from "@/components/theme/ThemeProvider"
import { CARTO_ATTRIBUTION, cartoTileUrl } from "@/lib/map-tiles"
import { AppSheet } from "@/components/ui/AppSheet"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"

type PlacePoint = {
  id: number
  title: string
  latitude: number
  longitude: number
  location_name?: string | null
  category_id?: number | null
  category_name?: string | null
  category_color?: string | null
}

type PlaceCategory = { id: number; name: string; color?: string | null }
type ShareGroup = { id: number; name: string; phones: string[]; phone_count: number }
type MarkerEntry = { marker: import("leaflet").Marker; point: PlacePoint }
type Draft = { lat: number; lng: number; editing: PlacePoint | null }

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"]

const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
const area = "w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function api() {
  const token = getAccessToken()
  return { credentials: "include" as const, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
}

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`

function parsePhones(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)) {
    let digits = part.replace(/\D/g, "")
    if (!digits) continue
    if (digits.startsWith("0") && digits.length >= 9) digits = `60${digits.slice(1)}`
    if (digits.length < 8 || digits.length > 15 || seen.has(digits)) continue
    seen.add(digits)
    out.push(digits)
    if (out.length >= 20) break
  }
  return out
}

function markerIcon(L: typeof import("leaflet"), point: PlacePoint, active: boolean, index: number) {
  const color = point.category_color || "var(--accent2)"
  return L.divIcon({
    className: "txn-marker-wrap",
    html: `<div class="txn-marker ${active ? "is-active" : ""}" style="--marker-accent:${escapeHtml(String(color))}"><span class="txn-marker__badge"><span class="txn-marker__number">${index + 1}</span><span class="txn-marker__amount">${escapeHtml(point.title || "Pin")}</span></span><span class="txn-marker__stem"></span><span class="txn-marker__dot"></span></div>`,
    iconSize: [184, 68],
    iconAnchor: [92, 68],
  })
}

/** Put the pin in the upper part of the map so the bottom card does not cover it. */
function panForCard(map: import("leaflet").Map, lat: number, lng: number, mobile: boolean, zoom?: number) {
  const z = zoom ?? Math.max(map.getZoom(), 13)
  try {
    map.invalidateSize({ animate: false })
  } catch {}
  if (!mobile) {
    map.setView([lat, lng], z, { animate: false })
    return
  }
  const h = map.getSize().y || window.innerHeight
  const offset = Math.round(Math.min(h * 0.42, Math.max(220, h * 0.3)))
  const p = map.project([lat, lng], z)
  map.setView(map.unproject([p.x, p.y + offset], z), z, { animate: false })
}

export default function PlacesPage() {
  const params = useParams()
  const { lang } = useLang()
  const isEn = lang === "EN"
  const tr = useCallback((bm: string, en: string) => (isEn ? en : bm), [isEn])
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const sessionId = (params.sessionId as string) || ""
  void sessionId
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [refreshKey, setRefreshKey] = useState(0)
  const [points, setPoints] = useState<PlacePoint[]>([])
  const [categories, setCategories] = useState<PlaceCategory[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [addMenu, setAddMenu] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formCategory, setFormCategory] = useState("")
  const [formColor, setFormColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [listFilter, setListFilter] = useState<number | "all">("all")
  const [shareOpen, setShareOpen] = useState(false)
  const [sharePlace, setSharePlace] = useState<PlacePoint | null>(null)
  const [shareTab, setShareTab] = useState<"group" | "numbers" | "manage">("group")
  const [groups, setGroups] = useState<ShareGroup[]>([])
  const [groupId, setGroupId] = useState<number | null>(null)
  const [phones, setPhones] = useState("")
  const [sending, setSending] = useState(false)
  const [shareResult, setShareResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupPhones, setNewGroupPhones] = useState("")
  const [groupSaving, setGroupSaving] = useState(false)

  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const markersRef = useRef<Map<number, MarkerEntry>>(new Map())
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const tileThemeRef = useRef<string | null>(null)
  const draftMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const pickModeRef = useRef(false)
  pickModeRef.current = pickMode

  const active = useMemo(() => points.find((p) => p.id === activeId) || null, [points, activeId])
  const activeIndex = useMemo(() => points.findIndex((p) => p.id === activeId), [points, activeId])
  const listPoints = useMemo(() => (listFilter === "all" ? points : points.filter((p) => p.category_id === listFilter)), [points, listFilter])

  const errorOf = async (res: Response, fallback: string) => {
    const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof payload?.detail === "string" ? payload.detail : fallback
  }

  useEffect(() => {
    const evaluate = () => setMobile(window.innerWidth < 1024)
    evaluate()
    window.addEventListener("resize", evaluate)
    return () => window.removeEventListener("resize", evaluate)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [placesRes, catsRes] = await Promise.all([fetch("/api/places?limit=1000", api()), fetch("/api/places/categories", api())])
        if (!placesRes.ok || !catsRes.ok) throw new Error()
        const placesData = (await placesRes.json()) as PlacePoint[]
        const catsData = (await catsRes.json()) as PlaceCategory[]
        if (cancelled) return
        setPoints(placesData)
        setCategories(catsData)
        setLoadFailed(false)
        setActiveId((prev) => (prev != null && placesData.some((p) => p.id === prev) ? prev : null))
      } catch {
        if (!cancelled) setLoadFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // Build the map and its markers.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!mapHostRef.current) return
      const L = await import("leaflet")
      ;(window as typeof window & { L?: typeof import("leaflet") }).L = L
      if (cancelled || !mapHostRef.current) return
      leafletRef.current = L
      if (!mapRef.current) {
        const map = L.map(mapHostRef.current, { zoomControl: false, attributionControl: true, preferCanvas: true })
        map.on("click", (e) => {
          if (!pickModeRef.current) return
          setPickMode(false)
          setDraft({ lat: e.latlng.lat, lng: e.latlng.lng, editing: null })
          setFormTitle("")
          setFormCategory("")
        })
        mapRef.current = map
      }
      const map = mapRef.current
      if (!map) return
      const theme = isLight ? "light" : "dark"
      if (!tileRef.current || tileThemeRef.current !== theme) {
        tileRef.current?.remove()
        tileRef.current = L.tileLayer(cartoTileUrl(theme), { maxZoom: 19, crossOrigin: true, attribution: CARTO_ATTRIBUTION, subdomains: "abcd", className: isLight ? "map-tile-light" : "map-tile-dark-grey" }).addTo(map)
        tileThemeRef.current = theme
      }
      markersRef.current.forEach((e) => e.marker.remove())
      markersRef.current.clear()
      if (!points.length) {
        map.setView([3.139, 101.6869], 6)
        return
      }
      points.forEach((point, index) => {
        const marker = L.marker([point.latitude, point.longitude], { icon: markerIcon(L, point, false, index), keyboard: false })
        marker.on("click", (e) => {
          if (e.originalEvent) e.originalEvent.stopPropagation()
          setDraft(null)
          setActiveId(point.id)
        })
        marker.addTo(map)
        markersRef.current.set(point.id, { marker, point })
      })
      map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])), { paddingTopLeft: [24, 110], paddingBottomRight: [24, 190], maxZoom: 14 })
    })()
    return () => {
      cancelled = true
    }
  }, [points, isLight])

  // Highlight the active pin and bring it into view.
  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return
    const index = new Map(points.map((p, i) => [p.id, i]))
    markersRef.current.forEach((entry) => {
      const on = entry.point.id === activeId
      entry.marker.setIcon(markerIcon(L, entry.point, on, index.get(entry.point.id) ?? 0))
      entry.marker.setZIndexOffset(on ? 1000 : 0)
    })
    if (draft || activeId == null) return
    const entry = markersRef.current.get(activeId)
    if (!entry) return
    requestAnimationFrame(() => {
      const live = mapRef.current
      if (live) panForCard(live, entry.point.latitude, entry.point.longitude, mobile, Math.max(live.getZoom(), 13))
    })
  }, [activeId, points, mobile, draft])

  // The pin being placed; it can be dragged to fine-tune.
  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return
    draftMarkerRef.current?.remove()
    draftMarkerRef.current = null
    if (!draft) return
    const marker = L.marker([draft.lat, draft.lng], {
      draggable: true,
      icon: L.divIcon({
        className: "txn-marker-wrap",
        html: `<div class="txn-marker is-active"><span class="txn-marker__badge"><span class="txn-marker__number">${draft.editing ? "✎" : "+"}</span><span class="txn-marker__amount">${isEn ? "Drag to adjust" : "Seret untuk laras"}</span></span><span class="txn-marker__stem"></span><span class="txn-marker__dot"></span></div>`,
        iconSize: [184, 68],
        iconAnchor: [92, 68],
      }),
    }).addTo(map)
    marker.on("dragend", () => {
      const ll = marker.getLatLng()
      setDraft((d) => (d ? { ...d, lat: ll.lat, lng: ll.lng } : d))
    })
    draftMarkerRef.current = marker
    requestAnimationFrame(() => {
      const live = mapRef.current
      if (live) panForCard(live, draft.lat, draft.lng, mobile, Math.max(live.getZoom(), 15))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.editing?.id, draft === null, mobile])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current.clear()
      tileRef.current = null
      tileThemeRef.current = null
      leafletRef.current = null
      draftMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const host = mapHostRef.current
    if (!host || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      try {
        mapRef.current?.invalidateSize({ animate: false })
      } catch {}
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const useMyLocation = () => {
    setAddMenu(false)
    if (!navigator.geolocation) {
      showAlert(tr("GPS tidak disokong", "GPS not supported"), tr("Peranti ini tidak menyokong lokasi.", "This device does not support location."), "error")
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft({ lat: pos.coords.latitude, lng: pos.coords.longitude, editing: null })
        setFormTitle("")
        setFormCategory("")
        setActiveId(null)
        setGpsLoading(false)
      },
      () => {
        setGpsLoading(false)
        showAlert(tr("Tiada lokasi", "No location"), tr("Benarkan akses lokasi untuk app ini, atau pilih di peta.", "Allow location access for this app, or pick on the map."), "error")
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const startPick = () => {
    setAddMenu(false)
    setActiveId(null)
    setPickMode(true)
  }

  const editPlace = (p: PlacePoint) => {
    setFormTitle(p.title)
    setFormCategory(p.category_name || "")
    setDraft({ lat: p.latitude, lng: p.longitude, editing: p })
    setListOpen(false)
  }

  const existingCategory = categories.find((c) => c.name.trim().toLowerCase() === formCategory.trim().toLowerCase())
  const formProblem = !formTitle.trim() ? tr("Beri tajuk untuk tempat ini.", "Give this place a title.") : null

  const savePlace = async () => {
    if (!draft || saving) return
    if (formProblem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), formProblem, "error")
      return
    }
    setSaving(true)
    try {
      const editing = draft.editing
      const body: Record<string, unknown> = { title: formTitle.trim(), latitude: draft.lat, longitude: draft.lng }
      if (formCategory.trim()) {
        body.category_name = formCategory.trim()
        if (!existingCategory && !editing) body.category_color = formColor
      } else if (editing) {
        body.category_id = null
      }
      if (!editing) body.source_channel = "web"
      const res = await fetch(editing ? `/api/places/${editing.id}` : "/api/places", { method: editing ? "PATCH" : "POST", ...api(), body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan tempat.", "Could not save the place.")))
      const saved = (await res.json()) as PlacePoint
      setDraft(null)
      setActiveId(saved.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const deletePlace = (p: PlacePoint) =>
    showConfirm(tr("Padam tempat?", "Delete place?"), tr(`Padam “${p.title}”?`, `Delete “${p.title}”?`), async () => {
      try {
        const res = await fetch(`/api/places/${p.id}`, { method: "DELETE", ...api() })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
        setActiveId(null)
        setRefreshKey((k) => k + 1)
      } catch (err) {
        showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
      }
    }, "warning")

  const loadGroups = async () => {
    try {
      const res = await fetch("/api/places/groups", api())
      if (res.ok) setGroups((await res.json()) as ShareGroup[])
    } catch {}
  }

  const openShare = (point: PlacePoint | null, tab: "group" | "numbers" | "manage" = "group") => {
    setSharePlace(point)
    setPhones("")
    setShareResult(null)
    setShareTab(tab)
    setGroupId(null)
    setShareOpen(true)
    setListOpen(false)
    void loadGroups()
  }

  const closeShare = () => {
    if (sending || groupSaving) return
    setShareOpen(false)
    setSharePlace(null)
  }

  const createGroup = async () => {
    const name = newGroupName.trim()
    const list = parsePhones(newGroupPhones)
    if (!name || !list.length || groupSaving) return
    setGroupSaving(true)
    setShareResult(null)
    try {
      const res = await fetch("/api/places/groups", { method: "POST", ...api(), body: JSON.stringify({ name, phones: list }) })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan group.", "Could not save the group.")))
      const group = (await res.json()) as ShareGroup
      setGroups((prev) => [group, ...prev.filter((g) => g.id !== group.id)])
      setGroupId(group.id)
      setNewGroupName("")
      setNewGroupPhones("")
      setShareResult({ ok: true, text: tr(`Group “${group.name}” disimpan.`, `Group “${group.name}” saved.`) })
    } catch (err) {
      setShareResult({ ok: false, text: err instanceof Error ? err.message : "" })
    } finally {
      setGroupSaving(false)
    }
  }

  const deleteGroup = (g: ShareGroup) =>
    showConfirm(tr("Padam group?", "Delete group?"), tr(`Padam “${g.name}”?`, `Delete “${g.name}”?`), async () => {
      try {
        const res = await fetch(`/api/places/groups/${g.id}`, { method: "DELETE", ...api() })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
        setGroups((prev) => prev.filter((x) => x.id !== g.id))
        if (groupId === g.id) setGroupId(null)
      } catch (err) {
        setShareResult({ ok: false, text: err instanceof Error ? err.message : "" })
      }
    }, "warning")

  const send = async () => {
    if (!sharePlace || sending) return
    const list = shareTab === "numbers" ? parsePhones(phones) : []
    if (shareTab === "group" && !groupId) return setShareResult({ ok: false, text: tr("Pilih group dahulu.", "Choose a group first.") })
    if (shareTab === "numbers" && !list.length) return setShareResult({ ok: false, text: tr("Masukkan sekurang-kurangnya satu nombor.", "Enter at least one number.") })
    setSending(true)
    setShareResult(null)
    try {
      const res = await fetch(`/api/places/${sharePlace.id}/share-whatsapp`, { method: "POST", ...api(), body: JSON.stringify({ phones: list, group_id: shareTab === "group" ? groupId : null }) })
      const data = (await res.json().catch(() => ({}))) as { detail?: string; sent_count?: number; failed_count?: number }
      if (!res.ok) {
        const detail = String(data.detail || `HTTP_${res.status}`)
        setShareResult({ ok: false, text: res.status === 409 || detail.toLowerCase().includes("not connected") ? tr("WhatsApp belum disambung. Buka halaman WhatsApp dan imbas QR dahulu.", "WhatsApp is not connected. Open the WhatsApp page and scan the QR first.") : detail })
        return
      }
      const sent = Number(data.sent_count || 0)
      const failed = Number(data.failed_count || 0)
      setShareResult({ ok: failed === 0, text: failed === 0 ? tr(`Dihantar ke ${sent} nombor.`, `Sent to ${sent} number(s).`) : tr(`Berjaya ${sent}, gagal ${failed}.`, `Sent ${sent}, failed ${failed}.`) })
    } catch (err) {
      setShareResult({ ok: false, text: err instanceof Error ? err.message : "" })
    } finally {
      setSending(false)
    }
  }

  const iconBtn = "inline-flex h-10 w-10 items-center justify-center rounded-full"
  const seg = (on: boolean) => cn("h-10 flex-1 rounded-full text-sm font-semibold", on ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--muted)]")

  return (
    <div className="map-experience relative z-0 h-[100dvh] min-h-[100dvh] w-full overflow-hidden overscroll-none bg-[var(--page-bg)] text-[var(--text)] lg:h-full lg:min-h-0">
      <div ref={mapHostRef} className={cn("absolute inset-0 z-0 touch-none", pickMode && "cursor-crosshair")} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[430] flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.65rem)] sm:px-5 sm:pt-5">
        <div className="pointer-events-auto flex w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
          <button type="button" onClick={() => setListOpen(true)} className={cn(iconBtn, "text-[var(--text)]")} aria-label={tr("Senarai tempat", "Places list")}>
            <List size={18} strokeWidth={2.2} />
          </button>
          <button type="button" onClick={() => openShare(null, "manage")} className={cn(iconBtn, "text-[var(--text)]")} aria-label={tr("Group kongsi", "Share groups")}>
            <Users size={18} strokeWidth={2.2} />
          </button>
          <button type="button" onClick={() => setAddMenu(true)} disabled={gpsLoading} className={cn(iconBtn, "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] disabled:opacity-50")} aria-label={tr("Tambah tempat", "Add place")}>
            {gpsLoading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={2.4} />}
          </button>
          <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading} className={cn(iconBtn, "text-[var(--text)] disabled:opacity-50")} aria-label={tr("Muat semula", "Refresh")}>
            <RefreshCw size={17} strokeWidth={2.2} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {pickMode && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-[440] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-5 pr-2 text-sm font-semibold text-[var(--text)]">
            {tr("Ketik pada peta untuk letak pin", "Tap the map to drop a pin")}
            <button type="button" onClick={() => setPickMode(false)} className="flex h-8 items-center rounded-full border border-[var(--border)] px-3 text-xs">{tr("Batal", "Cancel")}</button>
          </div>
        </div>
      )}

      {loadFailed && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-[440] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-rose-500/40 bg-[var(--card)] py-2 pl-5 pr-2 text-sm font-semibold text-rose-500">
            {tr("Tempat tidak dapat dimuatkan", "Places could not be loaded")}
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className="flex h-8 items-center rounded-full border border-rose-500/40 px-3 text-xs">{tr("Cuba lagi", "Retry")}</button>
          </div>
        </div>
      )}

      {!loading && !loadFailed && points.length === 0 && !draft && !pickMode && (
        <div className="pointer-events-none absolute inset-0 z-[440] flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] px-7 py-8 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]"><MapPinned size={24} /></span>
            <p className="text-base font-bold text-[var(--text)]">{tr("Belum ada tempat", "No places yet")}</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{tr("Simpan tempat penting seperti rumah keluarga atau kedai. Boleh juga hantar di WhatsApp: pinx rumah maksu @here", "Save places that matter, like a family home or a shop. You can also send on WhatsApp: pinx rumah maksu @here")}</p>
            <button type="button" onClick={() => setAddMenu(true)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]"><Plus size={15} />{tr("Tambah tempat", "Add place")}</button>
          </div>
        </div>
      )}

      {!draft && !listOpen && !shareOpen && !addMenu && active && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-[480] px-3 sm:px-5 lg:inset-x-auto lg:left-[240px] lg:right-[300px] lg:bottom-6 lg:flex lg:justify-center lg:px-4">
          <div className="pointer-events-auto relative mx-auto w-full max-w-md rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 lg:mx-0 lg:w-[24rem]">
            <button type="button" onClick={() => setActiveId(null)} aria-label={tr("Tutup", "Close")} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)]"><X size={14} /></button>
            <p className="pr-10 text-base font-bold text-[var(--text)] [overflow-wrap:anywhere]">{active.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              {active.category_color ? <span className="h-2 w-2 rounded-full" style={{ background: active.category_color }} /> : null}
              {active.category_name || tr("Tiada kategori", "No category")}
              {activeIndex >= 0 ? ` · ${activeIndex + 1}/${points.length}` : ""}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a href={mapsUrl(active.latitude, active.longitude)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)]"><ExternalLink size={14} />{tr("Arah", "Directions")}</a>
              <button type="button" onClick={() => openShare(active)} className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)]"><Share2 size={14} />{tr("Kongsi", "Share")}</button>
              <button type="button" onClick={() => editPlace(active)} className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)]"><Pencil size={14} />{tr("Ubah", "Edit")}</button>
            </div>
            <button type="button" onClick={() => deletePlace(active)} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-rose-500"><Trash2 size={14} />{tr("Padam tempat ini", "Delete this place")}</button>
          </div>
        </div>
      )}

      <AppSheet open={addMenu} onClose={() => setAddMenu(false)} id="places-add-menu" title={tr("Tambah tempat", "Add a place")} size="sm">
        <div className="space-y-2.5">
          <button type="button" onClick={useMyLocation} className="flex w-full items-center gap-3 rounded-[1.5rem] border border-[var(--border)] p-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]"><LocateFixed size={18} /></span>
            <span><span className="block text-sm font-bold text-[var(--text)]">{tr("Guna lokasi saya", "Use my location")}</span><span className="block text-xs text-[var(--muted)]">{tr("Letak pin di tempat anda berada sekarang.", "Drop a pin where you are right now.")}</span></span>
          </button>
          <button type="button" onClick={startPick} className="flex w-full items-center gap-3 rounded-[1.5rem] border border-[var(--border)] p-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]"><MapPin size={18} /></span>
            <span><span className="block text-sm font-bold text-[var(--text)]">{tr("Pilih di peta", "Pick on the map")}</span><span className="block text-xs text-[var(--muted)]">{tr("Ketik mana-mana tempat pada peta.", "Tap any spot on the map.")}</span></span>
          </button>
        </div>
      </AppSheet>

      <AppSheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        id="places-form"
        title={draft?.editing ? tr("Ubah tempat", "Edit place") : tr("Simpan tempat", "Save place")}
        size="sm"
        footer={
          <button type="button" onClick={() => void savePlace()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Simpan", "Save")}
          </button>
        }
      >
        {draft && (
          <form onSubmit={(e) => { e.preventDefault(); void savePlace() }} className="space-y-4">
            <div>
              <label htmlFor="pl-title" className={label}>{tr("Tajuk", "Title")}</label>
              <input id="pl-title" value={formTitle} maxLength={190} onChange={(e) => setFormTitle(e.target.value)} placeholder={tr("cth. Rumah Maksu", "e.g. Aunt’s house")} className={field} />
            </div>
            <div>
              <label htmlFor="pl-cat" className={label}>{tr("Kategori (pilihan)", "Category (optional)")}</label>
              <input id="pl-cat" list="pl-cats" value={formCategory} maxLength={120} onChange={(e) => setFormCategory(e.target.value)} placeholder={tr("cth. Keluarga", "e.g. Family")} className={field} />
              <datalist id="pl-cats">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            {formCategory.trim() && !existingCategory && !draft.editing && (
              <div>
                <span className={label}>{tr("Warna kategori baharu", "New category colour")}</span>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={c} aria-pressed={formColor === c} onClick={() => setFormColor(c)} className={cn("h-9 w-9 rounded-full border-2", formColor === c ? "border-[var(--text)]" : "border-transparent")} style={{ background: c }} />
                  ))}
                </div>
              </div>
            )}
            <p className="rounded-full border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted)]">
              {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)} · {tr("seret pin pada peta untuk melaras", "drag the pin on the map to adjust")}
            </p>
          </form>
        )}
      </AppSheet>

      <AppSheet open={listOpen} onClose={() => setListOpen(false)} id="places-list" title={tr("Tempat saya", "My places")} subtitle={`${listPoints.length} ${tr("tempat", "places")}`} size="md">
        <div className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[{ id: "all" as const, name: tr("Semua", "All"), color: null as string | null }, ...categories.map((c) => ({ id: c.id, name: c.name, color: c.color || null }))].map((c) => (
              <button key={String(c.id)} type="button" aria-pressed={listFilter === c.id} onClick={() => setListFilter(c.id)} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold", listFilter === c.id ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                {c.color ? <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> : null}
                {c.name}
              </button>
            ))}
          </div>
          {listPoints.length === 0 ? (
            <p className="rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">{tr("Tiada tempat dalam kategori ini.", "No places in this category.")}</p>
          ) : (
            <ul className="space-y-2">
              {listPoints.map((p) => (
                <li key={p.id} className={cn("flex items-center gap-2 rounded-[1.5rem] border py-2 pl-3 pr-2", p.id === activeId ? "border-[var(--btn-primary-bg)]" : "border-[var(--border)]")}>
                  <button type="button" onClick={() => { setActiveId(p.id); setListOpen(false) }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: p.category_color || "var(--btn-primary-bg)" }}>{points.findIndex((x) => x.id === p.id) + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[var(--text)]">{p.title}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">{p.category_name || tr("Tiada kategori", "No category")}</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => openShare(p)} aria-label={tr("Kongsi", "Share")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Share2 size={14} /></button>
                  <button type="button" onClick={() => editPlace(p)} aria-label={tr("Ubah", "Edit")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Pencil size={14} /></button>
                  <button type="button" onClick={() => deletePlace(p)} aria-label={tr("Padam", "Delete")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AppSheet>

      <AppSheet
        open={shareOpen}
        onClose={closeShare}
        id="places-share"
        title={sharePlace ? sharePlace.title : tr("Group kongsi", "Share groups")}
        subtitle={sharePlace ? "WhatsApp" : undefined}
        size="md"
        footer={
          shareTab !== "manage" && sharePlace ? (
            <button type="button" onClick={() => void send()} disabled={sending} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
              {tr("Hantar melalui WhatsApp", "Send via WhatsApp")}
            </button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex rounded-full border border-[var(--border)] p-1">
            {([["group", "Group"], ["numbers", tr("Nombor", "Numbers")], ["manage", tr("Urus group", "Manage")]] as const).map(([k, text]) => (
              <button key={k} type="button" aria-pressed={shareTab === k} onClick={() => { setShareTab(k); setShareResult(null) }} className={seg(shareTab === k)}>{text}</button>
            ))}
          </div>

          {shareTab === "group" && (
            groups.length === 0 ? (
              <p className="rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">{tr("Belum ada group. Buat di tab Urus group.", "No groups yet. Create one in the Manage tab.")}</p>
            ) : (
              <ul className="space-y-2">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button type="button" aria-pressed={groupId === g.id} onClick={() => setGroupId(g.id)} className={cn("flex w-full items-center justify-between gap-2 rounded-[1.5rem] border px-4 py-3 text-left", groupId === g.id ? "border-[var(--btn-primary-bg)]" : "border-[var(--border)]")}>
                      <span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--text)]">{g.name}</span><span className="block text-xs text-[var(--muted)]">{g.phone_count ?? g.phones?.length ?? 0} {tr("nombor", "numbers")}</span></span>
                      {groupId === g.id ? <Check size={16} className="shrink-0 text-[var(--btn-primary-bg)]" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          {shareTab === "numbers" && (
            <div>
              <label htmlFor="pl-phones" className={label}>{tr("Nombor telefon (maks 20)", "Phone numbers (max 20)")}</label>
              <textarea id="pl-phones" rows={4} value={phones} onChange={(e) => setPhones(e.target.value)} placeholder={"0123456789\n60198765432"} className={area} />
              <p className="mt-1.5 text-xs text-[var(--muted)]">{parsePhones(phones).length} {tr("nombor sah", "valid number(s)")}</p>
            </div>
          )}

          {shareTab === "manage" && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-[1.5rem] border border-[var(--border)] p-3">
                <input aria-label={tr("Nama group", "Group name")} value={newGroupName} maxLength={120} onChange={(e) => setNewGroupName(e.target.value)} placeholder={tr("Nama group, cth. Convoi Raya", "Group name, e.g. Raya convoy")} className={field} />
                <textarea aria-label={tr("Nombor", "Numbers")} rows={3} value={newGroupPhones} onChange={(e) => setNewGroupPhones(e.target.value)} placeholder={"0123456789\n0198765432"} className={area} />
                <button type="button" onClick={() => void createGroup()} disabled={groupSaving || !newGroupName.trim() || !parsePhones(newGroupPhones).length} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
                  {groupSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  {tr("Simpan group", "Save group")}
                </button>
              </div>
              {groups.map((g) => (
                <div key={g.id} className="flex items-center gap-2 rounded-[1.5rem] border border-[var(--border)] py-2.5 pl-4 pr-2.5">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[var(--text)]">{g.name}</span><span className="block text-xs text-[var(--muted)]">{g.phone_count ?? g.phones?.length ?? 0} {tr("nombor", "numbers")}</span></span>
                  <button type="button" onClick={() => deleteGroup(g)} aria-label={tr("Padam group", "Delete group")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {shareResult && (
            <p className={cn("rounded-full border px-4 py-2.5 text-sm font-semibold", shareResult.ok ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-rose-500/30 text-rose-500")}>{shareResult.text}</p>
          )}
          {shareTab !== "manage" && !sharePlace && (
            <p className="text-center text-xs text-[var(--muted)]">{tr("Untuk hantar lokasi, tekan Kongsi pada satu tempat.", "To send a location, tap Share on a place.")}</p>
          )}
        </div>
      </AppSheet>

      {alertModal}
    </div>
  )
}
