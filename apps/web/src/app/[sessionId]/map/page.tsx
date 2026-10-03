"use client"

import "leaflet/dist/leaflet.css"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, List, MapPin, MapPinned, RefreshCw, Route, Wallet, X } from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken } from "@/lib/auth-session"
import { useTheme } from "@/components/theme/ThemeProvider"
import { CARTO_ATTRIBUTION, cartoTileUrl } from "@/lib/map-tiles"
import { AppSheet } from "@/components/ui/AppSheet"
import { cn } from "@/lib/utils"

type MapPoint = {
  id: number
  reference_id?: string | null
  type: "income" | "expense"
  amount: number
  txn_date: string
  vendor_or_source: string
  category_name?: string | null
  wallet_name?: string | null
  latitude: number
  longitude: number
  location_name?: string | null
}

type MarkerEntry = { marker: import("leaflet").Marker; point: MapPoint }

function klMonthKey() {
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  return `${kl.getFullYear()}-${String(kl.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string, locale: string) {
  const [y, m] = key.split("-").map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key
  return new Date(y, Math.max(0, m - 1), 1).toLocaleString(locale, { month: "long", year: "numeric" })
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const money = (n: number) => Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amountLabel = (p: MapPoint) => `${p.type === "income" ? "+" : "−"}RM ${money(p.amount)}`

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function placeName(p: MapPoint, fallback: string) {
  const name = p.location_name?.trim()
  if (name) return name
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) ? `Pin ${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}` : fallback
}

function markerIcon(L: typeof import("leaflet"), p: MapPoint, active: boolean, index: number) {
  return L.divIcon({
    className: "txn-marker-wrap",
    html: `<div class="txn-marker ${p.type === "income" ? "is-income" : "is-expense"} ${active ? "is-active" : ""}"><span class="txn-marker__badge"><span class="txn-marker__number">${index + 1}</span><span class="txn-marker__amount">${escapeHtml(amountLabel(p))}</span></span><span class="txn-marker__stem"></span><span class="txn-marker__dot"></span></div>`,
    iconSize: [184, 68],
    iconAnchor: [92, 68],
  })
}

export default function MapPage() {
  const params = useParams()
  const router = useRouter()
  const { lang } = useLang()
  const isEn = lang === "EN"
  const tr = useCallback((bm: string, en: string) => (isEn ? en : bm), [isEn])
  const locale = isEn ? "en-MY" : "ms-MY"
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const sessionId = (params.sessionId as string) || ""
  const thisMonth = useMemo(() => klMonthKey(), [])

  const [month, setMonth] = useState(thisMonth)
  const [refreshKey, setRefreshKey] = useState(0)
  const [points, setPoints] = useState<MapPoint[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const markersRef = useRef<Map<number, MarkerEntry>>(new Map())
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const tileThemeRef = useRef<string | null>(null)

  const active = useMemo(() => points.find((p) => p.id === activeId) || null, [points, activeId])
  const activeIndex = useMemo(() => points.findIndex((p) => p.id === activeId), [points, activeId])
  const totals = useMemo(() => {
    let inN = 0, outN = 0, inSum = 0, outSum = 0
    for (const p of points) {
      if (p.type === "income") { inN++; inSum += Number(p.amount || 0) } else { outN++; outSum += Number(p.amount || 0) }
    }
    return { inN, outN, inSum, outSum }
  }, [points])

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
        const token = getAccessToken()
        if (!token) throw new Error()
        const res = await fetch(`/api/transactions/map?${new URLSearchParams({ month, limit: "1200" })}`, { credentials: "include", headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as MapPoint[]
        if (cancelled) return
        setPoints(data)
        setFailed(false)
        setActiveId((prev) => (prev != null && data.some((d) => d.id === prev) ? prev : null))
      } catch {
        if (cancelled) return
        setFailed(true)
        setPoints([])
        setActiveId(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [month, refreshKey])

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
        map.on("click", () => setActiveId(null))
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
      requestAnimationFrame(() => {
        try {
          map.invalidateSize({ animate: false })
        } catch {}
      })
      markersRef.current.forEach((e) => e.marker.remove())
      markersRef.current.clear()
      if (!points.length) {
        map.setView([3.139, 101.6869], 6)
        return
      }
      points.forEach((p, index) => {
        const marker = L.marker([p.latitude, p.longitude], { icon: markerIcon(L, p, false, index), keyboard: false })
        marker.on("click", (e) => {
          if (e.originalEvent) e.originalEvent.stopPropagation()
          setActiveId(p.id)
        })
        marker.addTo(map)
        markersRef.current.set(p.id, { marker, point: p })
      })
      map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])), { paddingTopLeft: [24, 130], paddingBottomRight: [24, 200], maxZoom: 14 })
    })()
    return () => {
      cancelled = true
    }
  }, [points, isLight])

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
    if (activeId == null) return
    const entry = markersRef.current.get(activeId)
    if (!entry) return
    // Keep the pin above the bottom card.
    const z = Math.max(map.getZoom(), 13)
    const h = map.getSize().y || window.innerHeight
    const p = map.project([entry.point.latitude, entry.point.longitude], z)
    map.setView(map.unproject([p.x, p.y + Math.round(h * 0.22)], z), z, { animate: false })
  }, [activeId, points])

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

  useEffect(() => {
    const store = markersRef.current
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      store.clear()
      tileRef.current = null
      tileThemeRef.current = null
      leafletRef.current = null
    }
  }, [])

  const cycle = (delta: number) => {
    if (!points.length) return
    setActiveId((prev) => {
      const i = points.findIndex((p) => p.id === prev)
      return points[((i === -1 ? 0 : i) + delta + points.length) % points.length]?.id ?? null
    })
  }

  const iconBtn = "inline-flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"
  const goDetail = (p: MapPoint) => router.push(`/${sessionId}/transactions/${p.reference_id || p.id}`)

  return (
    <div className="map-experience relative z-0 h-[100dvh] min-h-[100dvh] w-full overflow-hidden overscroll-none bg-[var(--page-bg)] text-[var(--text)] lg:h-full lg:min-h-0">
      <div ref={mapHostRef} className="absolute inset-0 z-0 touch-none" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[430] space-y-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.65rem)] sm:px-5 sm:pt-5">
        <div className="flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className={cn(iconBtn, "text-[var(--text)]")} aria-label={tr("Bulan sebelum", "Previous month")}><ChevronLeft size={18} /></button>
            <span className="min-w-[8.5rem] px-1 text-center text-sm font-bold text-[var(--text)]">{monthLabel(month, locale)}</span>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= thisMonth} className={cn(iconBtn, "text-[var(--text)]")} aria-label={tr("Bulan seterusnya", "Next month")}><ChevronRight size={18} /></button>
            <button type="button" onClick={() => setListOpen(true)} disabled={!points.length} className={cn(iconBtn, "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]")} aria-label={tr("Senarai", "List")}><List size={17} /></button>
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading} className={cn(iconBtn, "text-[var(--text)]")} aria-label={tr("Muat semula", "Refresh")}><RefreshCw size={16} className={cn(loading && "animate-spin")} /></button>
          </div>
        </div>
        {!failed && (
          <div className="flex justify-center gap-1.5">
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-bold text-[var(--text)]"><MapPin size={12} />{points.length}</span>
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-bold text-[var(--income)]"><ArrowDownRight size={12} />{totals.inN} · RM {Math.round(totals.inSum).toLocaleString("en-MY")}</span>
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-bold text-[var(--expense)]"><ArrowUpRight size={12} />{totals.outN} · RM {Math.round(totals.outSum).toLocaleString("en-MY")}</span>
          </div>
        )}
      </div>

      {failed && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+6rem)] z-[440] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-rose-500/40 bg-[var(--card)] py-2 pl-5 pr-2 text-sm font-semibold text-rose-500">
            {tr("Peta tidak dapat dimuatkan", "The map could not be loaded")}
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className="flex h-8 items-center rounded-full border border-rose-500/40 px-3 text-xs">{tr("Cuba lagi", "Retry")}</button>
          </div>
        </div>
      )}

      {!loading && !failed && points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[440] flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] px-7 py-8 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]"><MapPinned size={24} /></span>
            <p className="text-base font-bold text-[var(--text)]">{tr("Tiada lokasi bulan ini", "No locations this month")}</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{tr("Hantar lokasi di WhatsApp bersama rekod belanja, dan ia akan muncul di sini.", "Send a location on WhatsApp with a spending record and it shows up here.")}</p>
          </div>
        </div>
      )}

      {active && !listOpen && (
        <div className={cn("pointer-events-none absolute inset-x-0 z-[460] px-3 sm:px-5", mobile ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]" : "bottom-6")}>
          <div className="pointer-events-auto mx-auto w-full max-w-md">
            <div className="relative rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
              <button type="button" onClick={() => setActiveId(null)} aria-label={tr("Tutup", "Close")} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)]"><X size={14} /></button>
              <p className="pr-10 text-xs font-semibold text-[var(--muted)]">
                <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", active.type === "income" ? "bg-[var(--income)]" : "bg-[var(--expense)]")} />
                {active.type === "income" ? tr("Masuk", "Income") : tr("Keluar", "Expense")} · {active.txn_date}
              </p>
              <p className="mt-0.5 truncate text-base font-bold text-[var(--text)]">{active.vendor_or_source || tr("Tiada keterangan", "No description")}</p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", active.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]")}>{amountLabel(active)}</p>
              <div className="mt-3 space-y-1 rounded-[1.25rem] border border-[var(--border)] px-3.5 py-2.5 text-xs text-[var(--muted)]">
                <p className="flex items-center gap-2"><MapPin size={12} className="shrink-0" /><span className="truncate">{placeName(active, tr("Lokasi tidak diketahui", "Unknown place"))}</span></p>
                <p className="flex items-center gap-2"><Wallet size={12} className="shrink-0" /><span className="truncate">{[active.category_name, active.wallet_name].filter(Boolean).join(" · ") || "—"}</span></p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={`https://www.google.com/maps?q=${active.latitude},${active.longitude}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)]"><Route size={14} />{tr("Arah", "Directions")}</a>
                <button type="button" onClick={() => goDetail(active)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)]"><ExternalLink size={14} />{tr("Butiran", "Details")}</button>
              </div>
              {points.length > 1 && (
                <div className="mt-2 flex items-center justify-center gap-3">
                  <button type="button" onClick={() => cycle(-1)} aria-label={tr("Sebelum", "Previous")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><ChevronLeft size={15} /></button>
                  <span className="min-w-[3rem] text-center text-xs font-bold tabular-nums text-[var(--muted)]">{activeIndex + 1}/{points.length}</span>
                  <button type="button" onClick={() => cycle(1)} aria-label={tr("Seterusnya", "Next")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><ChevronRight size={15} /></button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AppSheet open={listOpen} onClose={() => setListOpen(false)} id="map-list" title={tr("Tempat belanja", "Places you spent")} subtitle={`${monthLabel(month, locale)} · ${points.length}`} size="md">
        <ul className="space-y-2">
          {points.map((p, index) => (
            <li key={p.id}>
              <button type="button" onClick={() => { setActiveId(p.id); setListOpen(false) }} className={cn("flex w-full items-center gap-3 rounded-[1.5rem] border px-3 py-3 text-left", p.id === activeId ? "border-[var(--btn-primary-bg)]" : "border-[var(--border)]")}>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold", p.type === "income" ? "bg-[var(--income-bg)] text-[var(--income)]" : "bg-[var(--expense-bg)] text-[var(--expense)]")}>{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--text)]">{p.vendor_or_source || tr("Tiada keterangan", "No description")}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{placeName(p, tr("Lokasi tidak diketahui", "Unknown place"))}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{[p.category_name, p.txn_date].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={cn("shrink-0 text-sm font-bold tabular-nums", p.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]")}>{amountLabel(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      </AppSheet>
    </div>
  )
}
