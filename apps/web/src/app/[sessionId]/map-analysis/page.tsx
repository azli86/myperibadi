"use client"

import "leaflet/dist/leaflet.css"
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  MapPin,
  Navigation,
  Receipt,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import {
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"

type MapExpensePoint = {
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

type RangeKey = "today" | "week" | "month" | "all"

type RankingRow = {
  key: string
  label: string
  amount: number
  count: number
  latitude: number
  longitude: number
}

type CategoryRow = {
  key: string
  label: string
  amount: number
  count: number
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function startOfWeekKey() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  return toDateKey(monday)
}

function getLocationKey(point: MapExpensePoint) {
  if (point.location_name?.trim()) return point.location_name.trim()
  return `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`
}

function getLocationLabel(point: MapExpensePoint, pinLabel: string, fallback: string) {
  const name = point.location_name?.trim()
  if (name) return name
  const lat = Number(point.latitude)
  const lon = Number(point.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lon)) return `${pinLabel} ${lat.toFixed(4)}, ${lon.toFixed(4)}`
  return fallback
}

function dateInRange(point: MapExpensePoint, range: RangeKey) {
  if (range === "all") return true
  const today = toDateKey(new Date())
  if (range === "today") return point.txn_date === today
  if (range === "month") return point.txn_date.startsWith(currentMonthKey())
  return point.txn_date >= startOfWeekKey() && point.txn_date <= today
}

function createAnalysisMarkerIcon(leaflet: typeof import("leaflet"), index: number, amount: number) {
  const label = amount >= 1000 ? `${Math.round(amount / 1000)}k` : Math.round(amount).toString()
  return leaflet.divIcon({
    className: "analysis-marker-wrap",
    html: `<div class="analysis-marker"><span>${index + 1}</span><strong>RM ${label}</strong></div>`,
    iconSize: [86, 42],
    iconAnchor: [43, 42],
  })
}

export default function MapAnalysisPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"

  const tr = (bm: string, en: string) => (lang === "EN" ? en : bm)

  const [range, setRange] = useState<RangeKey>("month")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [points, setPoints] = useState<MapExpensePoint[]>([])
  const [loading, setLoading] = useState(true)
  const showDataSkeleton = useDelayedSkeleton(loading)
  const [error, setError] = useState("")
  const [focusLocationKey, setFocusLocationKey] = useState<string | null>(null)

  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const markersRef = useRef<import("leaflet").Marker[]>([])
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const tileThemeRef = useRef<string | null>(null)
  const [mapHostEpoch, setMapHostEpoch] = useState(0)

  /** True only when element (and ancestors) are actually painted — not just own display. */
  const isMapHostVisible = useCallback((node: HTMLElement) => {
    if (!node.isConnected) return false
    let el: HTMLElement | null = node
    while (el) {
      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden") return false
      el = el.parentElement
    }
    return node.clientWidth > 8 && node.clientHeight > 8
  }, [])

  /** Mobile + desktop both render mapSection; only bind Leaflet to the visible host. */
  const setMapHostNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        if (mapHostRef.current && !mapHostRef.current.isConnected) {
          mapHostRef.current = null
        }
        return
      }
      if (typeof window === "undefined") return
      if (!isMapHostVisible(node)) return
      if (mapHostRef.current === node) return
      mapHostRef.current = node
      setMapHostEpoch((n) => n + 1)
    },
    [isMapHostVisible],
  )

  const uncategorized = tr("Tanpa kategori", "Uncategorized")
  const unknownLocation = tr("Lokasi tidak tersedia", "Location not available")
  const locationPin = tr("Pin", "Pin")

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      try {
        setLoading(true)
        setError("")
        const token = getAccessToken()
        if (!token) throw new Error("Missing auth token")
        const qs = new URLSearchParams({ limit: range === "month" ? "1200" : "2000" })
        if (range === "month") qs.set("month", currentMonthKey())
        const res = await fetch(`/api/transactions/map?${qs.toString()}`, {
          credentials: "include",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as MapExpensePoint[]
        if (!cancelled) setPoints(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tr("Gagal muat analisis", "Failed to load analysis"))
          setPoints([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadData()
    return () => {
      cancelled = true
    }
  }, [range])

  const expenses = useMemo(() => {
    return points
      .filter((point) => point.type === "expense")
      .filter((point) => dateInRange(point, range))
      .filter((point) => categoryFilter === "all" || (point.category_name || uncategorized) === categoryFilter)
  }, [points, range, categoryFilter, uncategorized])

  const categoryOptions = useMemo(() => {
    const names = new Set<string>()
    points.filter((point) => point.type === "expense").forEach((point) => names.add(point.category_name || uncategorized))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [points, uncategorized])

  const analytics = useMemo(() => {
    const total = expenses.reduce((sum, point) => sum + Number(point.amount || 0), 0)
    const uniqueDays = new Set(expenses.map((point) => point.txn_date)).size
    const dailyAverage = uniqueDays ? total / uniqueDays : 0

    const locationMap = new Map<string, RankingRow>()
    const categoryMap = new Map<string, CategoryRow>()

    expenses.forEach((point) => {
      const locationKey = getLocationKey(point)
      const existingLocation = locationMap.get(locationKey)
      if (existingLocation) {
        existingLocation.amount += Number(point.amount || 0)
        existingLocation.count += 1
      } else {
        locationMap.set(locationKey, {
          key: locationKey,
          label: getLocationLabel(point, locationPin, unknownLocation),
          amount: Number(point.amount || 0),
          count: 1,
          latitude: point.latitude,
          longitude: point.longitude,
        })
      }

      const categoryKey = point.category_name || uncategorized
      const existingCategory = categoryMap.get(categoryKey)
      if (existingCategory) {
        existingCategory.amount += Number(point.amount || 0)
        existingCategory.count += 1
      } else {
        categoryMap.set(categoryKey, {
          key: categoryKey,
          label: categoryKey,
          amount: Number(point.amount || 0),
          count: 1,
        })
      }
    })

    const locations = Array.from(locationMap.values()).sort((a, b) => b.amount - a.amount)
    const categories = Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount)

    return {
      total,
      dailyAverage,
      transactionCount: expenses.length,
      topLocation: locations[0] || null,
      topCategory: categories[0] || null,
      locations,
      categories,
    }
  }, [expenses, locationPin, uncategorized, unknownLocation])

  const insightCards = useMemo(() => {
    const cards: Array<{ title: string; text: string; icon: typeof MapPin }> = []
    if (analytics.topLocation) {
      cards.push({
        title: tr("Bulan ni duit banyak habis dekat sini", "Most money went here"),
        text: analytics.topLocation.label,
        icon: MapPin,
      })
    }
    if (analytics.topCategory) {
      cards.push({
        title: tr("Kategori paling kuat makan bajet", "This category eats the budget"),
        text: analytics.topCategory.label,
        icon: TrendingUp,
      })
    }
    const repeated = analytics.locations.find((location) => location.count >= 2)
    if (repeated) {
      cards.push({
        title: tr("Belanja berulang dikesan", "Repeated spending detected"),
        text: `${repeated.label} · ${repeated.count}x`,
        icon: Sparkles,
      })
    }
    if (!cards.length) {
      cards.push({
        title: tr("Belum nampak pattern belanja", "No spending pattern yet"),
        text: tr(
          "Tambah transaksi dengan lokasi untuk nampak analisis dekat sini.",
          "Add transactions with location to see map insights here.",
        ),
        icon: Sparkles,
      })
    }
    return cards
  }, [analytics, lang])

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    let retryTimer: number | null = null
    let attempts = 0

    async function renderMap() {
      const host = mapHostRef.current
      if (!host || !host.isConnected || !isMapHostVisible(host)) {
        attempts += 1
        if (!cancelled && attempts < 40) {
          retryTimer = window.setTimeout(() => {
            void renderMap()
          }, 100)
        }
        return
      }

      const L = await import("leaflet")
      if (cancelled || !mapHostRef.current || mapHostRef.current !== host) return

      // Re-bind if map was created on a different (now hidden) node
      if (mapRef.current && mapRef.current.getContainer() !== host) {
        markersRef.current.forEach((marker) => marker.remove())
        markersRef.current = []
        tileLayerRef.current = null
        tileThemeRef.current = null
        mapRef.current.remove()
        mapRef.current = null
      }

      if (!mapRef.current) {
        mapRef.current = L.map(host, {
          zoomControl: false,
          attributionControl: false,
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
        })
        mapRef.current.touchZoom.enable()
        mapRef.current.doubleClickZoom.enable()
      }

      const map = mapRef.current
      if (!map) return

      if (!tileLayerRef.current || tileThemeRef.current !== resolvedTheme) {
        tileLayerRef.current?.remove()
        tileLayerRef.current = L.tileLayer(
          `https://{s}.basemaps.cartocdn.com/${isLight ? "light_all" : "dark_all"}/{z}/{x}/{y}{r}.png`,
          {
            maxZoom: 19,
            subdomains: "abcd",
            className: isLight ? "map-tile-light" : "map-tile-dark-grey",
          },
        )
        tileLayerRef.current.addTo(map)
        tileThemeRef.current = resolvedTheme
      }

      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []

      const ranked = analytics.locations.slice(0, 12)
      if (!ranked.length) {
        map.setView([3.139, 101.6869], 6)
        requestAnimationFrame(() => {
          map.invalidateSize({ animate: false })
        })
        return
      }

      const bounds = L.latLngBounds(ranked.map((row) => [row.latitude, row.longitude] as [number, number]))
      ranked.forEach((row, index) => {
        const marker = L.marker([row.latitude, row.longitude], {
          icon: createAnalysisMarkerIcon(L, index, row.amount),
          keyboard: false,
        }).addTo(map)
        markersRef.current.push(marker)
      })

      if (focusLocationKey) {
        const focus = ranked.find((row) => row.key === focusLocationKey)
        if (focus) {
          map.setView([focus.latitude, focus.longitude], 15, { animate: true })
          requestAnimationFrame(() => {
            map.invalidateSize({ animate: false })
          })
          return
        }
      }
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 })
      requestAnimationFrame(() => {
        map.invalidateSize({ animate: false })
      })
      // Second pass after layout settles (mobile bottom nav / sheet)
      window.setTimeout(() => {
        if (!cancelled) map.invalidateSize({ animate: false })
      }, 250)
    }

    void renderMap()

    if (typeof ResizeObserver !== "undefined" && mapHostRef.current) {
      resizeObserver = new ResizeObserver(() => {
        mapRef.current?.invalidateSize({ animate: false })
      })
      resizeObserver.observe(mapHostRef.current)
    }

    const onResize = () => {
      // Re-pick visible host after orientation / breakpoint change
      mapRef.current?.invalidateSize({ animate: false })
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelled = true
      if (retryTimer != null) window.clearTimeout(retryTimer)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", onResize)
    }
  }, [analytics.locations, resolvedTheme, isLight, focusLocationKey, isMapHostVisible, mapHostEpoch])

  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      tileLayerRef.current = null
    }
  }, [])

  const rangeTabs: Array<{ key: RangeKey; label: string }> = [
    { key: "today", label: tr("Hari ini", "Today") },
    { key: "week", label: tr("Minggu", "Week") },
    { key: "month", label: tr("Bulan", "Month") },
    { key: "all", label: tr("Semua", "All") },
  ]

  const rangeToggle = (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/40 p-0.5">
      {rangeTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => {
            setRange(tab.key)
            setFocusLocationKey(null)
          }}
          className={cn(
            "rounded-full px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.12em] transition",
            range === tab.key ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  const categorySelect = (
    <select
      value={categoryFilter}
      onChange={(event) => {
        setCategoryFilter(event.target.value)
        setFocusLocationKey(null)
      }}
      className="h-8 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)] outline-none"
    >
      <option value="all">{tr("Semua kategori", "All categories")}</option>
      {categoryOptions.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  )

  const heroBlock = (desktop = false) => (
    <div
      className={cn(
        "map-analysis-hero relative overflow-hidden border border-[var(--border)] bg-[#1a1a1a] text-[#f5f5f5]",
        desktop ? "rounded-[1.75rem] p-6" : "rounded-[2rem] p-5",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.04] blur-2xl" />

      <div className={cn("relative", desktop && "flex items-center gap-5")}>
        <div className={cn(desktop && "min-w-[10rem] shrink-0")}>
          <p
            className={cn(
              "font-bold uppercase tracking-[0.14em] text-[#a3a3a3]",
              desktop ? "text-[0.7rem]" : "text-[0.625rem]",
            )}
          >
            {tr("Jumlah belanja", "Total expenses")}
          </p>
          <p className="map-analysis-hero-amount mt-2 leading-none text-[#ffffff]">
            {showDataSkeleton ? (
              <AmountSkeleton className={cn("bg-white/10", desktop ? "h-10 w-40" : "h-7 w-32")} />
            ) : (
              <MoneyAmount
                value={analytics.total}
                size={desktop ? "heroLg" : "hero"}
                className="text-[#ffffff]"
                currencyClassName="text-[#ffffff] opacity-55"
              />
            )}
          </p>
          <p className="mt-2 text-[0.625rem] font-semibold text-[#8c8c8c]">
            {analytics.transactionCount} {tr("transaksi", "txns")}
            {analytics.locations.length > 0
              ? ` · ${analytics.locations.length} ${tr("lokasi", "locations")}`
              : ""}
          </p>
        </div>

        <div
          className={cn(
            "grid grid-cols-3",
            desktop ? "min-w-0 flex-1 gap-3" : "mt-5 gap-2.5",
          )}
        >
          {[
            {
              label: tr("Lokasi top", "Top location"),
              value: analytics.topLocation?.label || "—",
              icon: <MapPin size={desktop ? 16 : 12} className="text-[#b3b3b3]" />,
              color: "text-[#e5e5e5]",
              isMoney: false,
              money: analytics.topLocation?.amount ?? 0,
            },
            {
              label: tr("Kategori top", "Top category"),
              value: analytics.topCategory?.label || "—",
              icon: <BarChart3 size={desktop ? 16 : 12} className="text-[#b3b3b3]" />,
              color: "text-[#e5e5e5]",
              isMoney: false,
              money: analytics.topCategory?.amount ?? 0,
            },
            {
              label: tr("Purata harian", "Daily avg"),
              value: analytics.dailyAverage,
              icon: <CalendarDays size={desktop ? 16 : 12} className="text-[#fcd34d]" />,
              color: "text-[#fde68a]",
              isMoney: true,
              money: analytics.dailyAverage,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn("bg-white/[0.06]", desktop ? "rounded-2xl p-4" : "rounded-[1.15rem] p-3")}
            >
              <div className={cn("flex items-center", desktop ? "gap-2" : "gap-1.5")}>
                {item.icon}
                <p
                  className={cn(
                    "font-bold uppercase text-[#a3a3a3]",
                    desktop ? "text-[0.6rem] tracking-[0.12em]" : "text-[0.5rem] tracking-[0.1em]",
                  )}
                >
                  {item.label}
                </p>
              </div>
              <p className={cn(desktop ? "mt-3 leading-none" : "mt-2", item.color)}>
                {showDataSkeleton ? (
                  <AmountSkeleton className={cn("bg-white/10", desktop ? "h-6 w-16" : "h-4 w-12")} />
                ) : item.isMoney ? (
                  <MoneyAmount
                    value={Number(item.money || 0)}
                    digits={0}
                    size={desktop ? "md" : "xs"}
                    className={item.color}
                    currencyClassName={cn(item.color, "opacity-55")}
                  />
                ) : (
                  <span
                    className={cn(
                      "line-clamp-2 font-semibold leading-tight",
                      desktop ? "text-sm" : "text-[11px]",
                    )}
                  >
                    {item.value}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const mapSection = (
    <div className="relative z-0 isolate min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5">
        <p className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
          {tr("Preview map", "Map preview")}
        </p>
        <span className="text-[0.55rem] font-semibold text-[var(--muted)]">
          {Math.min(12, analytics.locations.length)} / {analytics.locations.length} {tr("pin", "pins")}
        </span>
      </div>
      <div className="relative z-[1] h-[280px] overflow-hidden md:h-[480px]" data-prevent-pull-refresh="true">
        <div
          ref={setMapHostNode}
          className="map-analysis-leaflet absolute inset-0 z-[1] h-full w-full touch-none bg-[var(--surface-tint)]"
        />
        {!loading && !expenses.length && (
          <div className="absolute inset-0 flex items-center justify-center p-5">
            <div className="max-w-xs rounded-[1.35rem] border border-dashed border-[var(--border)] bg-[var(--card)]/95 p-6 text-center backdrop-blur-md">
              <MapPin className="mx-auto text-[var(--muted)]/40" size={28} />
              <p className="mt-3 text-sm font-bold text-[var(--text)]">
                {tr("Belum ada data lokasi.", "No location expense data yet.")}
              </p>
              <p className="mt-1 text-[11px] font-medium text-[var(--muted)]">
                {tr(
                  "Tambah transaksi dengan lokasi untuk nampak analisis.",
                  "Add transactions with location to see map insights.",
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const rankingSection = (
    <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
          {tr("Ranking lokasi", "Location ranking")}
        </h2>
        <span className="text-[0.55rem] font-semibold text-[var(--muted)]">
          Top {Math.min(8, analytics.locations.length)}
        </span>
      </div>
      <div className="space-y-2">
        {showDataSkeleton
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--surface-tint)]" />
            ))
          : analytics.locations.slice(0, 8).map((row, index) => {
              const share = analytics.total > 0 ? (row.amount / analytics.total) * 100 : 0
              const active = focusLocationKey === row.key
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setFocusLocationKey(row.key)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99]",
                    active
                      ? "border-[color-mix(in_srgb,var(--accent2)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent2)_8%,var(--card))]"
                      : "border-[var(--border)] bg-[var(--surface-tint)]/40 hover:bg-[var(--surface-tint)]",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--text)] text-[0.625rem] font-black text-[var(--bg)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[var(--text)]">{row.label}</p>
                      <p className="mt-0.5 text-[0.55rem] font-semibold text-[var(--muted)]">
                        {row.count}x · {share.toFixed(0)}%
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">
                      <MoneyAmount value={row.amount} digits={0} size="xs" className="text-[var(--text)]" />
                    </p>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500"
                      style={{ width: `${Math.max(4, Math.min(100, share))}%` }}
                    />
                  </div>
                </button>
              )
            })}
        {!showDataSkeleton && !analytics.locations.length && (
          <p className="py-6 text-center text-xs font-semibold text-[var(--muted)]">
            {tr("Belum ada data lokasi.", "No location data yet.")}
          </p>
        )}
      </div>
    </div>
  )

  const insightsSection = (
    <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
          {tr("Insight", "Insights")}
        </h2>
        <Sparkles size={13} className="text-[var(--accent2)]" />
      </div>
      <div className="space-y-2">
        {insightCards.map((insight, index) => {
          const Icon = insight.icon
          return (
            <div
              key={`${insight.title}-${index}`}
              className="flex items-start gap-2.5 rounded-xl bg-[var(--surface-tint)]/50 px-3 py-2.5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--card)] text-[var(--text)]">
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold leading-tight text-[var(--text)]">{insight.title}</p>
                <p className="mt-0.5 truncate text-[0.625rem] font-medium text-[var(--muted)]">{insight.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const txnSection = (
    <div className="overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5">
        <h2 className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
          {tr("Transaksi lokasi", "Location transactions")}
        </h2>
        <Receipt size={13} className="text-[var(--muted)]" />
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--surface-tint)]/60 text-[0.55rem] uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 font-bold">{tr("Lokasi", "Location")}</th>
              <th className="px-4 py-2.5 font-bold">{tr("Transaksi", "Transaction")}</th>
              <th className="px-4 py-2.5 font-bold">{tr("Kategori", "Category")}</th>
              <th className="px-4 py-2.5 text-right font-bold">{tr("Jumlah", "Amount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {showDataSkeleton
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3" colSpan={4}>
                      <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-tint)]" />
                    </td>
                  </tr>
                ))
              : expenses.slice(0, 12).map((point) => (
                  <tr
                    key={point.id}
                    className="cursor-pointer transition hover:bg-[var(--surface-tint)]/40"
                    onClick={() => router.push(`/${sessionId}/transactions/${point.reference_id || point.id}`)}
                  >
                    <td className="px-4 py-3 font-semibold text-[var(--text)]">
                      {getLocationLabel(point, locationPin, unknownLocation)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{point.vendor_or_source || "—"}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{point.category_name || uncategorized}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-[var(--text)]">
                      <MoneyAmount value={point.amount} size="xs" className="text-[var(--text)]" />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="space-y-1.5 p-2.5 md:hidden">
        {showDataSkeleton
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--surface-tint)]" />
            ))
          : expenses.slice(0, 10).map((point) => (
              <button
                key={point.id}
                type="button"
                onClick={() => router.push(`/${sessionId}/transactions/${point.reference_id || point.id}`)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition active:scale-[0.99] hover:bg-[var(--surface-tint)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--muted)]">
                  <Navigation size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-[var(--text)]">
                    {getLocationLabel(point, locationPin, unknownLocation)}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.6rem] font-medium text-[var(--muted)]">
                    {[point.category_name || uncategorized, point.vendor_or_source].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text)]">
                  <MoneyAmount value={point.amount} size="xs" className="text-[var(--text)]" />
                </span>
                <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
              </button>
            ))}
        {!showDataSkeleton && !expenses.length && (
          <p className="py-8 text-center text-xs font-semibold text-[var(--muted)]">
            {tr("Belum ada data lokasi.", "No location expense data yet.")}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Map Analisis", "Map Analysis")}
          fallbackHref={`/${sessionId}`}
        />

        <section className="px-1">{heroBlock(false)}</section>

        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          {rangeToggle}
          {categorySelect}
        </div>

        <section className="px-1">{mapSection}</section>
        <section className="px-1">{insightsSection}</section>
        <section className="px-1">{rankingSection}</section>
        <section className="px-1">{txnSection}</section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Map Analisis", "Map Analysis")}
          homeHref={`/${sessionId}`}
          actions={
            <>
              {rangeToggle}
              {categorySelect}
            </>
          }
        />

        <DesktopPageBody className="space-y-5">
          {heroBlock(true)}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {mapSection}
            <div className="space-y-4">
              {insightsSection}
              {rankingSection}
            </div>
          </div>

          {txnSection}
        </DesktopPageBody>
      </div>

      {error && (
        <div className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-40 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400 md:bottom-6 md:left-auto md:right-6 md:max-w-md">
          {error}
        </div>
      )}

      <style jsx global>{`
        .map-analysis-leaflet.leaflet-container {
          width: 100% !important;
          height: 100% !important;
          max-width: 100%;
          overflow: hidden;
          touch-action: none;
          background: transparent;
          z-index: 1;
        }
        .map-analysis-leaflet .leaflet-pane { z-index: 200 !important; }
        .map-analysis-leaflet .leaflet-tile-pane { z-index: 200 !important; }
        .map-analysis-leaflet .leaflet-overlay-pane { z-index: 300 !important; }
        .map-analysis-leaflet .leaflet-marker-pane { z-index: 400 !important; }
        .map-analysis-leaflet .leaflet-tooltip-pane { z-index: 450 !important; }
        .map-analysis-leaflet .leaflet-popup-pane { z-index: 500 !important; }
        .map-analysis-leaflet .leaflet-control-container { position: relative; z-index: 600 !important; }
        .map-analysis-leaflet .leaflet-tile { max-width: none !important; }
        .analysis-marker-wrap { background: transparent; border: 0; }
        .analysis-marker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 6px 8px 6px 6px;
          color: #111827;
          background: rgba(255,255,255,0.94);
          border: 1px solid rgba(17,24,39,0.14);
          box-shadow: 0 12px 30px rgba(0,0,0,0.22);
          font-family: inherit;
          white-space: nowrap;
        }
        [data-theme="dark"] .analysis-marker {
          color: white;
          background: rgba(31,31,31,0.94);
          border-color: rgba(255,255,255,0.16);
        }
        .analysis-marker span {
          display: inline-flex;
          height: 22px;
          width: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: var(--accent2);
          color: white;
          font-size: 11px;
          font-weight: 900;
        }
        .analysis-marker strong {
          font-size: 11px;
          font-weight: 900;
        }
      `}</style>
    </div>
  )
}
