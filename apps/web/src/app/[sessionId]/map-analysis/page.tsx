"use client"

import "leaflet/dist/leaflet.css"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CalendarDays, ChevronRight, MapPin, Receipt, Sparkles, TrendingUp } from "lucide-react"
import { CARTO_ATTRIBUTION, cartoTileUrl } from "@/lib/map-tiles"
import { cn } from "@/lib/utils"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

type Point = {
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

type RangeKey = "today" | "week" | "month" | "all"
type Place = { key: string; label: string; amount: number; count: number; latitude: number; longitude: number }
type Cat = { key: string; amount: number; count: number }

const money = (n: number) => Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Dates in Kuala Lumpur, not the phone's own zone. */
function klNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
}
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function inRange(p: Point, range: RangeKey) {
  if (range === "all") return true
  const now = klNow()
  const today = dayKey(now)
  if (range === "today") return p.txn_date === today
  if (range === "month") return p.txn_date.startsWith(today.slice(0, 7))
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  return p.txn_date >= dayKey(monday) && p.txn_date <= today
}

function placeKey(p: Point) {
  return p.location_name?.trim() || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`
}

function markerIcon(L: typeof import("leaflet"), index: number, amount: number) {
  const label = amount >= 1000 ? `${Math.round(amount / 1000)}k` : String(Math.round(amount))
  return L.divIcon({
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
  const isEn = lang === "EN"
  const tr = useCallback((bm: string, en: string) => (isEn ? en : bm), [isEn])
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"

  const [range, setRange] = useState<RangeKey>("month")
  const [category, setCategory] = useState("all")
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const showSkeleton = useDelayedSkeleton(loading)

  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const markersRef = useRef<import("leaflet").Marker[]>([])
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const tileThemeRef = useRef<string | null>(null)

  const uncategorized = tr("Tanpa kategori", "Uncategorized")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const token = getAccessToken()
        if (!token) throw new Error()
        const qs = new URLSearchParams({ limit: "2000" })
        if (range === "month") qs.set("month", dayKey(klNow()).slice(0, 7))
        const res = await fetch(`/api/transactions/map?${qs}`, { credentials: "include", headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as Point[]
        if (cancelled) return
        setPoints(Array.isArray(data) ? data : [])
        setFailed(false)
      } catch {
        if (cancelled) return
        setPoints([])
        setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [range, reloadKey])

  const expenses = useMemo(
    () => points.filter((p) => p.type === "expense").filter((p) => inRange(p, range)).filter((p) => category === "all" || (p.category_name || uncategorized) === category),
    [points, range, category, uncategorized]
  )
  const categoryOptions = useMemo(() => Array.from(new Set(points.filter((p) => p.type === "expense").map((p) => p.category_name || uncategorized))).sort((a, b) => a.localeCompare(b)), [points, uncategorized])

  const analytics = useMemo(() => {
    const total = expenses.reduce((s, p) => s + Number(p.amount || 0), 0)
    const days = new Set(expenses.map((p) => p.txn_date)).size
    const places = new Map<string, Place>()
    const cats = new Map<string, Cat>()
    for (const p of expenses) {
      const amount = Number(p.amount || 0)
      const k = placeKey(p)
      const pl = places.get(k)
      if (pl) {
        pl.amount += amount
        pl.count += 1
      } else {
        places.set(k, { key: k, label: p.location_name?.trim() || `Pin ${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`, amount, count: 1, latitude: p.latitude, longitude: p.longitude })
      }
      const ck = p.category_name || uncategorized
      const c = cats.get(ck)
      if (c) {
        c.amount += amount
        c.count += 1
      } else {
        cats.set(ck, { key: ck, amount, count: 1 })
      }
    }
    const placeList = Array.from(places.values()).sort((a, b) => b.amount - a.amount)
    const catList = Array.from(cats.values()).sort((a, b) => b.amount - a.amount)
    return { total, daily: days ? total / days : 0, count: expenses.length, places: placeList, cats: catList }
  }, [expenses, uncategorized])

  // Build the map once the host exists, then keep markers in step with the ranking.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const host = mapHostRef.current
      if (!host) return
      const L = await import("leaflet")
      if (cancelled || mapHostRef.current !== host) return
      if (mapRef.current && mapRef.current.getContainer() !== host) {
        // The host was remounted (after an error and a retry); the old map points at a dead node.
        markersRef.current = []
        tileRef.current = null
        tileThemeRef.current = null
        mapRef.current.remove()
        mapRef.current = null
      }
      if (!mapRef.current) {
        mapRef.current = L.map(host, { zoomControl: false, attributionControl: false, dragging: true, touchZoom: true, doubleClickZoom: true, scrollWheelZoom: false })
      }
      const map = mapRef.current
      const theme = isLight ? "light" : "dark"
      if (!tileRef.current || tileThemeRef.current !== theme) {
        tileRef.current?.remove()
        tileRef.current = L.tileLayer(cartoTileUrl(theme), { maxZoom: 19, crossOrigin: true, attribution: CARTO_ATTRIBUTION, subdomains: "abcd", className: isLight ? "map-tile-light" : "map-tile-dark-grey" }).addTo(map)
        tileThemeRef.current = theme
      }
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      const ranked = analytics.places.slice(0, 12)
      requestAnimationFrame(() => {
        try {
          map.invalidateSize({ animate: false })
        } catch {}
      })
      if (!ranked.length) {
        map.setView([3.139, 101.6869], 6)
        return
      }
      ranked.forEach((r, i) => {
        markersRef.current.push(L.marker([r.latitude, r.longitude], { icon: markerIcon(L, i, r.amount), keyboard: false }).addTo(map))
      })
      const focus = focusKey ? ranked.find((r) => r.key === focusKey) : null
      if (focus) map.setView([focus.latitude, focus.longitude], 15, { animate: false })
      else map.fitBounds(L.latLngBounds(ranked.map((r) => [r.latitude, r.longitude] as [number, number])), { padding: [28, 28], maxZoom: 14 })
    })()
    return () => {
      cancelled = true
    }
  }, [analytics.places, isLight, focusKey])

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
    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      tileRef.current = null
      tileThemeRef.current = null
    }
  }, [])

  const tabs: Array<[RangeKey, string]> = [["today", tr("Hari ini", "Today")], ["week", tr("Minggu ini", "This week")], ["month", tr("Bulan ini", "This month")], ["all", tr("Semua", "All")]]
  const top = analytics.places[0]
  const topCat = analytics.cats[0]
  const repeated = analytics.places.find((p) => p.count >= 2)
  const insights = [
    top ? { icon: MapPin, title: tr("Paling banyak duit habis di", "Most money went to"), text: top.label } : null,
    topCat ? { icon: TrendingUp, title: tr("Kategori paling besar", "Biggest category"), text: `${topCat.key} · RM ${money(topCat.amount)}` } : null,
    repeated ? { icon: Sparkles, title: tr("Belanja berulang", "Repeat spending"), text: `${repeated.label} · ${repeated.count}×` } : null,
  ].filter(Boolean) as Array<{ icon: typeof MapPin; title: string; text: string }>

  const goTxn = (p: Point) => router.push(`/${sessionId}/transactions/${p.reference_id || p.id}`)
  const maxAmount = top?.amount || 1

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader title={tr("Analisis Peta", "Map Analysis")} fallbackHref={`/${sessionId}/map`} />
      </div>
      <DesktopPageHeader className="hidden md:block" title={tr("Analisis Peta", "Map Analysis")} homeHref={`/${sessionId}`} breadcrumbs={[{ label: tr("Peta", "Map"), href: `/${sessionId}/map` }]} />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        <ModenHero
          label={
            <>
              <Receipt size={16} />
              {tr("Jumlah belanja", "Total spent")}
            </>
          }
          currency="RM"
          amount={showSkeleton ? "—" : money(analytics.total)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "txn", tone: "neutral", icon: <Receipt size={15} strokeWidth={2.2} />, label: tr("Transaksi", "Transactions"), value: `${analytics.count} · ${analytics.places.length} ${tr("lokasi", "places")}` },
            { key: "avg", tone: "neutral", icon: <CalendarDays size={15} strokeWidth={2.2} />, label: tr("Purata sehari", "Daily average"), value: `RM ${money(analytics.daily)}` },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map(([k, text]) => (
              <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => { setRange(k); setFocusKey(null) }} className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-semibold", range === k ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>{text}</button>
            ))}
          </div>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setFocusKey(null) }} aria-label={tr("Kategori", "Category")} className="h-10 min-w-0 max-w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-sm font-semibold text-[var(--text)] outline-none">
            <option value="all">{tr("Semua kategori", "All categories")}</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {failed ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <p className="text-sm font-bold text-[var(--text)]">{tr("Analisis tidak dapat dimuatkan", "The analysis could not be loaded")}</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">{tr("Cuba lagi", "Try again")}</button>
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-baseline justify-between px-4 pt-4">
                <h2 className="text-base font-bold text-[var(--text)]">{tr("Peta", "Map")}</h2>
                <span className="text-xs text-[var(--muted)]">{Math.min(12, analytics.places.length)} / {analytics.places.length} {tr("lokasi", "places")}</span>
              </div>
              <div className="relative mt-3 h-64 w-full md:h-96">
                <div ref={mapHostRef} className="absolute inset-0 z-0" />
                {!loading && analytics.places.length === 0 && (
                  <div className="absolute inset-0 z-[400] flex items-center justify-center bg-[var(--card)]/80 p-6 text-center text-sm font-semibold text-[var(--muted)]">
                    {tr("Belum ada belanja dengan lokasi.", "No spending with a location yet.")}
                  </div>
                )}
              </div>
            </section>

            {insights.length > 0 && (
              <div className="grid gap-2.5 md:grid-cols-3">
                {insights.map((c) => (
                  <div key={c.title} className="flex items-start gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]"><c.icon size={16} /></span>
                    <span className="min-w-0">
                      <span className="block text-xs text-[var(--muted)]">{c.title}</span>
                      <span className="block text-sm font-bold text-[var(--text)] [overflow-wrap:anywhere]">{c.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                <h2 className="mb-3 text-base font-bold text-[var(--text)]">{tr("Ranking lokasi", "Places ranked")}</h2>
                {analytics.places.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">{tr("Belum ada data lokasi.", "No location data yet.")}</p>
                ) : (
                  <ul className="space-y-2">
                    {analytics.places.slice(0, 12).map((r, i) => (
                      <li key={r.key}>
                        <button type="button" onClick={() => { setFocusKey(r.key); window.scrollTo({ top: 0 }) }} className={cn("w-full rounded-[1.25rem] border px-3.5 py-3 text-left", focusKey === r.key ? "border-[var(--btn-primary-bg)]" : "border-[var(--border)]")}>
                          <span className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-xs font-bold text-[var(--text)]">{i + 1}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-[var(--text)]">{r.label}</span>
                              <span className="block text-xs text-[var(--muted)]">{r.count} {tr("transaksi", "transactions")}</span>
                            </span>
                            <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">RM {money(r.amount)}</span>
                          </span>
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]"><span className="block h-full rounded-full bg-[var(--btn-primary-bg)]" style={{ width: `${Math.max(4, (r.amount / maxAmount) * 100)}%` }} /></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                <h2 className="mb-3 text-base font-bold text-[var(--text)]">{tr("Transaksi berlokasi", "Transactions with a place")}</h2>
                {expenses.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">{tr("Belum ada data lokasi.", "No location data yet.")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {expenses.slice(0, 40).map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => goTxn(p)} className="flex w-full items-center gap-3 rounded-full border border-[var(--border)] py-2.5 pl-4 pr-3 text-left">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-[var(--text)]">{p.vendor_or_source || tr("Tiada keterangan", "No description")}</span>
                            <span className="block truncate text-xs text-[var(--muted)]">{[p.location_name?.trim(), p.category_name, p.txn_date].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--expense)]">−RM {money(p.amount)}</span>
                          <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
                        </button>
                      </li>
                    ))}
                    {expenses.length > 40 && <li className="pt-1 text-center text-xs text-[var(--muted)]">{tr(`+${expenses.length - 40} lagi`, `+${expenses.length - 40} more`)}</li>}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </DesktopPageBody>
    </div>
  )
}
