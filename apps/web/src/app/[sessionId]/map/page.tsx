"use client"

import "leaflet/dist/leaflet.css"
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPinned,
  MapPin,
  Navigation,
  Route,
  Sparkles,
  Wallet,
  X,
  RefreshCw,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken } from "@/lib/auth-session"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { useTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type MapPoint = {
  id: number
  reference_id?: string | null
  type: "income" | "expense"
  amount: number
  txn_date: string
  vendor_or_source: string
  category_name?: string | null
  category_icon_name?: string | null
  wallet_name?: string | null
  latitude: number
  longitude: number
  location_name?: string | null
}

type MarkerEntry = {
  marker: import("leaflet").Marker
  point: MapPoint
}

type GestureMapOptions = import("leaflet").MapOptions & {
  gestureHandling?: boolean
  gestureHandlingOptions?: {
    text: {
      touch: string
      scroll: string
      scrollMac: string
    }
    duration?: number
  }
}

function formatMonthLabel(monthKey: string, locale: string) {
  const [year, month] = monthKey.split("-").map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey
  const date = new Date(year, Math.max(0, month - 1), 1)
  return date.toLocaleString(locale, { month: "long", year: "numeric" })
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey
  const shifted = new Date(year, month - 1 + delta, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`
}

function formatAmountLabel(point: MapPoint) {
  const signed = point.type === "income" ? "+" : "-"
  const amount = Number(point.amount || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${signed}RM ${amount}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function getLocationLabel(point: MapPoint, fallback: string) {
  const name = point.location_name?.trim()
  if (name) return name
  const lat = Number(point.latitude)
  const lon = Number(point.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lon)) return `Pin ${lat.toFixed(4)}, ${lon.toFixed(4)}`
  return fallback
}

function createMarkerIcon(
  leaflet: typeof import("leaflet"),
  point: MapPoint,
  isActive: boolean,
  listIndex: number,
) {
  const amountText = escapeHtml(formatAmountLabel(point))
  const markerNumber = String(listIndex + 1)
  const kindClass = point.type === "income" ? "is-income" : "is-expense"
  const activeClass = isActive ? "is-active" : ""
  const html = `
    <div class="txn-marker ${kindClass} ${activeClass}">
      <span class="txn-marker__badge">
        <span class="txn-marker__number">${markerNumber}</span>
        <span class="txn-marker__amount">${amountText}</span>
      </span>
      <span class="txn-marker__stem"></span>
      <span class="txn-marker__dot"></span>
    </div>
  `

  return leaflet.divIcon({
    html,
    className: "txn-marker-wrap",
    iconSize: [184, 68],
    iconAnchor: [92, 68],
  })
}

export default function MapPage() {
  const params = useParams()
  const router = useRouter()
  const { t, lang } = useLang()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const locale = lang === "EN" ? "en-MY" : "ms-MY"
  const sessionId = (params.sessionId as string) || ""
  const initialMonth = new Date().toISOString().slice(0, 7)
  const mapScrollHint = lang === "EN" ? "Use ctrl + scroll to zoom the map" : "Guna ctrl + scroll untuk zoom peta"
  const mapScrollMacHint = lang === "EN" ? "Use command + scroll to zoom the map" : "Guna command + scroll untuk zoom peta"

  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [refreshKey, setRefreshKey] = useState(0)
  const [points, setPoints] = useState<MapPoint[]>([])
  const [activePointId, setActivePointId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const showDataSkeleton = useDelayedSkeleton(loading)
  const [error, setError] = useState<string | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  const { requestClose: requestActivePointClose } = useOverlayBackClose({
    id: "map-point-detail",
    isOpen: activePointId !== null && isMobileViewport,
    onClose: () => setActivePointId(null),
  })

  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const markersRef = useRef<Map<number, MarkerEntry>>(new Map())
  const listItemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const tileLayerThemeRef = useRef<"light" | "dark" | null>(null)

  const activePoint = useMemo(
    () => points.find((point) => point.id === activePointId) || null,
    [points, activePointId]
  )
  const incomePins = useMemo(() => points.filter((point) => point.type === "income").length, [points])
  const expensePins = useMemo(() => points.filter((point) => point.type === "expense").length, [points])
  const incomeTotal = useMemo(
    () => points.filter((p) => p.type === "income").reduce((s, p) => s + Number(p.amount || 0), 0),
    [points],
  )
  const expenseTotal = useMemo(
    () => points.filter((p) => p.type === "expense").reduce((s, p) => s + Number(p.amount || 0), 0),
    [points],
  )
  const activePointIndex = useMemo(
    () => points.findIndex((point) => point.id === activePointId),
    [points, activePointId]
  )

  useEffect(() => {
    const evaluateViewport = () => {
      setIsMobileViewport(window.innerWidth < 1024)
    }
    evaluateViewport()
    window.addEventListener("resize", evaluateViewport)
    return () => {
      window.removeEventListener("resize", evaluateViewport)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadMapPoints = async () => {
      try {
        setLoading(true)
        setError(null)
        const token = getAccessToken()
        if (!token) throw new Error("Missing auth token")

        const qs = new URLSearchParams({ month: selectedMonth, limit: "1200" })
        const response = await fetch(`/api/transactions/map?${qs.toString()}`, {
          credentials: "include",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })
        if (!response.ok) throw new Error(`HTTP_${response.status}`)

        const data = (await response.json()) as MapPoint[]
        if (cancelled) return
        setPoints(data)
        setActivePointId((previous) => {
          if (previous != null && data.some((item) => item.id === previous)) return previous
          return data[0]?.id ?? null
        })
      } catch (fetchError) {
        if (cancelled) return
        console.error("Map fetch error:", fetchError)
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load map points.")
        setPoints([])
        setActivePointId(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadMapPoints()
    return () => {
      cancelled = true
    }
  }, [selectedMonth, refreshKey])

  useEffect(() => {
    let cancelled = false

    const renderMap = async () => {
      if (!mapHostRef.current) return
      const L = await import("leaflet")
      ;(window as typeof window & { L?: typeof import("leaflet") }).L = L
      
      if (cancelled || !mapHostRef.current) return
      leafletRef.current = L

      if (!mapRef.current) {
        const mapOptions: GestureMapOptions = {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
          gestureHandling: false,
        }
        const map = L.map(mapHostRef.current, mapOptions)
        mapRef.current = map
      }

      const map = mapRef.current
      if (!map) return

      if (!tileLayerRef.current || tileLayerThemeRef.current !== resolvedTheme) {
        if (tileLayerRef.current) {
          tileLayerRef.current.remove()
        }
        tileLayerRef.current = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${isLight ? "light_all" : "dark_all"}/{z}/{x}/{y}{r}.png`, {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          className: isLight ? "map-tile-light" : "map-tile-dark-grey",
        })
        tileLayerRef.current.addTo(map)
        tileLayerThemeRef.current = resolvedTheme
      }

      markersRef.current.forEach((entry) => entry.marker.remove())
      markersRef.current.clear()

      if (!points.length) {
        map.setView([3.139, 101.6869], 6)
        return
      }

      const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]))
      points.forEach((point, index) => {
        const marker = L.marker([point.latitude, point.longitude], {
          icon: createMarkerIcon(L, point, false, index),
          keyboard: false,
        })
        marker.on("click", (e) => {
          if (e.originalEvent) {
            e.originalEvent.stopPropagation()
          }
          setActivePointId(point.id)
        })
        marker.addTo(map)
        markersRef.current.set(point.id, { marker, point })
      })

      map.fitBounds(bounds, {
        paddingTopLeft: isMobileViewport ? [24, 150] : [36, 170],
        paddingBottomRight: isMobileViewport ? [24, 210] : [470, 120],
        maxZoom: 14,
      })
    }

    void renderMap()
    return () => {
      cancelled = true
    }
  }, [points, mapScrollHint, mapScrollMacHint, isMobileViewport, isLight, resolvedTheme])

  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return

    const pointIndexById = new Map(points.map((point, index) => [point.id, index]))
    markersRef.current.forEach((entry) => {
      const isActive = entry.point.id === activePointId
      entry.marker.setIcon(createMarkerIcon(L, entry.point, isActive, pointIndexById.get(entry.point.id) ?? 0))
      entry.marker.setZIndexOffset(isActive ? 1000 : 0)
    })

    if (activePointId == null) return
    const active = markersRef.current.get(activePointId)
    if (!active) return
    map.setView([active.point.latitude, active.point.longitude], Math.max(map.getZoom(), 13), {
      animate: false,
    })
  }, [activePointId, points])

  useEffect(() => {
    if (isMobileViewport || activePointId == null) return
    listItemRefs.current.get(activePointId)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    })
  }, [activePointId, isMobileViewport])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const handleMapClick = () => {
      if (isMobileViewport) {
        setActivePointId(null)
      }
    }
    map.on("click", handleMapClick)
    return () => {
      map.off("click", handleMapClick)
    }
  }, [isMobileViewport])

  useEffect(() => {
    const markerStore = markersRef.current
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markerStore.clear()
      tileLayerRef.current = null
      tileLayerThemeRef.current = null
      leafletRef.current = null
    }
  }, [])

  const cycleActivePoint = (delta: number) => {
    if (!points.length) return
    setActivePointId((previous) => {
      const currentIndex = points.findIndex((point) => point.id === previous)
      const baseIndex = currentIndex === -1 ? 0 : currentIndex
      const nextIndex = (baseIndex + delta + points.length) % points.length
      return points[nextIndex]?.id ?? null
    })
  }

  return (
    <div className="map-experience relative z-0 h-[100dvh] min-h-[100dvh] w-full overflow-hidden overscroll-none bg-[var(--page-bg)] text-[var(--text)] lg:h-full lg:min-h-0">
      {/* Ambient gradient frame over the map */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[var(--page-bg)]/80 via-[var(--page-bg)]/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[var(--page-bg)]/70 via-transparent to-transparent" />
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[var(--page-bg)]/25 to-transparent" />
      </div>

      <div ref={mapHostRef} className="absolute inset-0 z-0 touch-none" />

      {/* Top command bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[430] px-3 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] sm:px-5 sm:pt-5">
        <div className="mx-auto w-full max-w-6xl space-y-2.5 md:max-w-none lg:pr-[27rem]">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-[20px] border border-[var(--border)] bg-[var(--card)]/90 px-3 py-2 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:flex-none sm:px-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-[var(--accent2)]">
                <MapPinned size={16} strokeWidth={2.3} />
              </span>
              <div className="min-w-0">
                <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {lang === "EN" ? "Spending map" : "Peta belanja"}
                </p>
                <p className="truncate text-sm font-black tracking-tight text-[var(--text)]">
                  {formatMonthLabel(selectedMonth, locale)}
                </p>
              </div>
            </div>

            <div className="ml-auto inline-flex items-center gap-1.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)]/90 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
                aria-label={t.previous}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
                aria-label={t.next}
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={loading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-bg)] text-[var(--accent2)] transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                aria-label="Refresh"
              >
                <RefreshCw size={14} className={cn(loading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)]/88 px-3 py-1.5 shadow-[var(--shadow-soft)] backdrop-blur-xl">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-tint-strong)] text-[var(--text)]">
                <Sparkles size={12} />
              </span>
              <span className="text-xs font-bold text-[var(--text)]">
                {points.length} {t.mapPinsLabel}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--income)_22%,var(--border))] bg-[var(--income-bg)] px-3 py-1.5 backdrop-blur-xl">
              <ArrowDownRight size={13} className="text-[var(--income)]" />
              <span className="text-xs font-bold text-[var(--income)]">
                {incomePins} · RM {incomeTotal.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--expense)_22%,var(--border))] bg-[var(--expense-bg)] px-3 py-1.5 backdrop-blur-xl">
              <ArrowUpRight size={13} className="text-[var(--expense)]" />
              <span className="text-xs font-bold text-[var(--expense)]">
                {expensePins} · RM {expenseTotal.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-[455] px-4 sm:px-6">
          <p className="pointer-events-auto mx-auto w-full max-w-3xl rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600 backdrop-blur-md dark:text-rose-300">
            {error}
          </p>
        </div>
      )}

      {!loading && points.length === 0 && !error && (
        <div className="pointer-events-none absolute inset-0 z-[440] flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-[28px] border border-[var(--border)] bg-[var(--card)]/95 px-7 py-8 text-center shadow-[var(--shadow-lg)] backdrop-blur-xl">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--accent-bg)] text-[var(--accent2)]">
              <MapPinned size={24} />
            </span>
            <p className="text-base font-black text-[var(--text)]">{t.mapNoLocations}</p>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-[var(--muted)]">{t.mapEmptyHint}</p>
          </div>
        </div>
      )}

      {/* Desktop side panel */}
      {!loading && points.length > 0 && (
        <div className="pointer-events-none absolute bottom-5 right-5 top-5 z-[445] hidden w-[25.5rem] lg:flex">
          <aside className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)]/95 text-[var(--text)] shadow-[var(--shadow-lg)] backdrop-blur-2xl">
            <div className="relative overflow-hidden border-b border-[var(--border)] px-5 pb-4 pt-5">
              <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[var(--btn-primary-bg)]/15 blur-3xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-[var(--accent2)]">
                      <Navigation size={17} strokeWidth={2.3} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-[0.95rem] font-black tracking-tight">
                        {lang === "EN" ? "Places you spent" : "Tempat belanja"}
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
                        {formatMonthLabel(selectedMonth, locale)}
                      </p>
                    </div>
                  </div>
                </div>
                <span className="rounded-full bg-[var(--surface-tint-strong)] px-2.5 py-1 text-[0.68rem] font-black tabular-nums text-[var(--text)]">
                  {activePointIndex >= 0 ? activePointIndex + 1 : 0}/{points.length}
                </span>
              </div>

              <div className="relative mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-2.5">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {lang === "EN" ? "Pins" : "Pin"}
                  </p>
                  <p className="mt-1 text-sm font-black tabular-nums">{points.length}</p>
                </div>
                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--income)_18%,var(--border))] bg-[var(--income-bg)] px-2.5 py-2.5">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-[var(--income)]">
                    {lang === "EN" ? "In" : "Masuk"}
                  </p>
                  <p className="mt-1 text-sm font-black tabular-nums text-[var(--income)]">{incomePins}</p>
                </div>
                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--expense)_18%,var(--border))] bg-[var(--expense-bg)] px-2.5 py-2.5">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-[var(--expense)]">
                    {lang === "EN" ? "Out" : "Keluar"}
                  </p>
                  <p className="mt-1 text-sm font-black tabular-nums text-[var(--expense)]">{expensePins}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3.5">
              {points.map((point, index) => {
                const isActive = point.id === activePointId
                return (
                  <div
                    key={point.id}
                    ref={(node) => {
                      if (node) listItemRefs.current.set(point.id, node)
                      else listItemRefs.current.delete(point.id)
                    }}
                    className={cn(
                      "overflow-hidden rounded-2xl border transition-all",
                      isActive
                        ? "border-[color-mix(in_srgb,var(--accent2)_28%,var(--border))] bg-[var(--accent-bg)] shadow-[var(--shadow-soft)]"
                        : "border-[var(--border)] bg-[var(--surface-tint)]/70 hover:bg-[var(--surface-tint)]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActivePointId(point.id)}
                      className="w-full px-3.5 py-3 text-left"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black",
                            point.type === "income"
                              ? "bg-[var(--income-bg)] text-[var(--income)]"
                              : "bg-[var(--expense-bg)] text-[var(--expense)]",
                            isActive && "ring-2 ring-[var(--accent2)]/25",
                          )}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-bold text-[var(--text)]">
                              {point.vendor_or_source || t.mapNoDescription}
                            </p>
                            <p
                              className={cn(
                                "shrink-0 text-sm font-black tabular-nums",
                                point.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]",
                              )}
                            >
                              {showDataSkeleton ? <AmountSkeleton className="h-4 w-20" /> : formatAmountLabel(point)}
                            </p>
                          </div>
                          <div className="mt-1.5 space-y-0.5 text-[0.7rem] font-medium text-[var(--muted)]">
                            <p className="flex items-center gap-1.5 truncate">
                              <MapPin size={11} className="shrink-0 opacity-70" />
                              <span className="truncate">{getLocationLabel(point, t.mapLocationUnknown)}</span>
                            </p>
                            <p className="flex items-center gap-1.5 truncate pl-[18px]">
                              {[point.category_name, point.wallet_name, point.txn_date].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>

                    {isActive && (
                      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] px-3.5 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            window.open(`https://www.google.com/maps?q=${point.latitude},${point.longitude}`, "_blank")
                          }}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 text-[0.7rem] font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
                        >
                          <Route size={13} />
                          {t.mapOpenInMaps}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            router.push(`/${sessionId}/transactions/${point.reference_id || point.id}`)
                          }}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] py-2 text-[0.7rem] font-bold text-white transition hover:opacity-90"
                        >
                          <ExternalLink size={13} />
                          Details
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>
        </div>
      )}

      {/* Mobile active point sheet */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 z-[460] px-3 sm:px-5 lg:hidden",
          isMobileViewport
            ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
            : "bottom-6",
        )}
      >
        <div className="mx-auto w-full max-w-md">
          {activePoint && (
            <div className="pointer-events-auto">
              {points.length > 1 && (
                <div className="mb-2.5 flex items-center justify-end">
                  <div className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--card)]/92 px-1.5 py-1 shadow-[var(--shadow-soft)] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => cycleActivePoint(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"
                      aria-label={t.previous}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="min-w-[2.5rem] text-center text-xs font-bold tabular-nums text-[var(--text)]">
                      {activePointIndex + 1}/{points.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => cycleActivePoint(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"
                      aria-label={t.next}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}

              <div className="relative overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[var(--shadow-lg)] backdrop-blur-2xl">
                <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[var(--btn-primary-bg)]/12 blur-3xl" />
                <button
                  onClick={() => requestActivePointClose()}
                  className="absolute right-3.5 top-3.5 z-10 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] p-2 text-[var(--muted)] transition hover:text-[var(--text)]"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>

                <div className="relative pr-10">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        activePoint.type === "income" ? "bg-[var(--income)]" : "bg-[var(--expense)]",
                      )}
                    />
                    {activePoint.type === "income"
                      ? (lang === "EN" ? "Income" : "Masuk")
                      : (lang === "EN" ? "Expense" : "Keluar")}
                  </div>
                  <p className="truncate text-base font-black text-[var(--text)]">
                    {activePoint.vendor_or_source || t.mapNoDescription}
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 text-[1.65rem] font-black tabular-nums leading-none",
                      activePoint.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]",
                    )}
                  >
                    {showDataSkeleton ? <AmountSkeleton className="h-7 w-32" /> : formatAmountLabel(activePoint)}
                  </p>
                </div>

                <div className="relative mt-4 space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-3 text-xs font-medium text-[var(--muted)]">
                  <p className="inline-flex w-full items-center gap-2">
                    <MapPin size={13} className="shrink-0 text-[var(--accent2)]" />
                    <span className="truncate">{getLocationLabel(activePoint, t.mapLocationUnknown)}</span>
                  </p>
                  <p className="inline-flex w-full items-center gap-2">
                    <Wallet size={13} className="shrink-0 opacity-70" />
                    <span className="truncate">
                      {[activePoint.category_name, activePoint.wallet_name, activePoint.txn_date]
                        .filter(Boolean)
                        .join(" · ") || activePoint.txn_date}
                    </span>
                  </p>
                </div>

                <div className="relative mt-4 grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps?q=${activePoint.latitude},${activePoint.longitude}`,
                        "_blank",
                      )
                    }}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 text-xs font-bold text-[var(--text)] transition active:scale-[0.98]"
                  >
                    <Route size={14} />
                    {t.mapOpenInMaps}
                  </button>
                  <button
                    onClick={() => {
                      router.push(`/${sessionId}/transactions/${activePoint.reference_id || activePoint.id}`)
                    }}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
                  >
                    <ExternalLink size={14} />
                    Details
                  </button>
                </div>

                {isMobileViewport && (
                  <p className="mt-3 text-center text-[0.65rem] font-semibold text-[var(--muted)]">
                    {t.mapTapToClose}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
