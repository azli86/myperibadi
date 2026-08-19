"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Bike,
  Bus,
  Car,
  ChevronRight,
  Fuel,
  Gauge,
  Shield,
  Truck,
  Wrench,
} from "lucide-react"
import { useParams } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { CachedVehicleImage } from "@/components/vehicle/CachedVehicleImage"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type VehicleItem = {
  id: number
  name: string
  vehicle_type?: string | null
  registration_number?: string | null
  brand?: string | null
  model?: string | null
  current_odometer?: number | null
  has_image?: boolean
  image_url?: string | null
  status?: string
}

type VehicleSummaryRow = {
  vehicle_id: number
  fuel_cost?: number
  total_cost?: number
  next_service_date?: string | null
  road_tax_expiry?: string | null
  insurance_expiry?: string | null
}

type Props = {
  /** Glass style for dark balance-hero background */
  variant?: "hero" | "card"
  /** Large showcase layout for desktop dashboard only */
  layout?: "default" | "desktop"
  className?: string
}

function typeIcon(vehicleType?: string | null) {
  const t = (vehicleType || "").toLowerCase()
  if (t.includes("motor") || t.includes("bike") || t.includes("scooter")) return Bike
  if (t.includes("van") || t.includes("mpv")) return Bus
  if (t.includes("truck") || t.includes("lorry")) return Truck
  return Car
}

function typeLabel(vehicleType?: string | null, isBm?: boolean) {
  const t = (vehicleType || "car").toLowerCase()
  if (t.includes("motor") || t.includes("bike") || t.includes("scooter")) {
    return isBm ? "Motorsikal" : "Motorcycle"
  }
  if (t.includes("van")) return "Van"
  if (t.includes("truck") || t.includes("lorry")) return isBm ? "Lori" : "Truck"
  if (t.includes("other") || t.includes("lain")) return isBm ? "Lain" : "Other"
  return isBm ? "Kereta" : "Car"
}

function formatDate(value?: string | null, isBm?: boolean) {
  if (!value) return isBm ? "—" : "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(isBm ? "ms-MY" : "en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Vehicle details row for personal dashboard.
 * Fail-soft: returns null when no vehicles or fetch fails.
 * `layout="desktop"` = large showcase (desktop only). Mobile stays compact.
 */
export function DashboardVehicleHeroRow({
  variant = "hero",
  layout = "default",
  className,
}: Props) {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  const [vehicles, setVehicles] = useState<VehicleItem[] | null>(null)
  const [summaryById, setSummaryById] = useState<Map<number, VehicleSummaryRow>>(new Map())
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = getAccessToken()
        const headers: HeadersInit =
          token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}

        const [listRes, summaryRes] = await Promise.all([
          fetch("/api/vehicles", { credentials: "include", headers, cache: "no-store" }),
          fetch("/api/vehicles/summary", { credentials: "include", headers, cache: "no-store" }),
        ])

        if (!listRes.ok) throw new Error("vehicles failed")
        const listJson = await listRes.json()
        const list: VehicleItem[] = Array.isArray(listJson)
          ? listJson
          : Array.isArray(listJson?.items)
            ? listJson.items
            : Array.isArray(listJson?.vehicles)
              ? listJson.vehicles
              : []

        const map = new Map<number, VehicleSummaryRow>()
        if (summaryRes.ok) {
          const sJson = await summaryRes.json()
          const rows: VehicleSummaryRow[] = Array.isArray(sJson?.vehicles) ? sJson.vehicles : []
          for (const row of rows) {
            if (row?.vehicle_id != null) map.set(row.vehicle_id, row)
          }
        }

        if (!cancelled) {
          setVehicles(list.filter((v) => (v.status || "active").toLowerCase() !== "sold"))
          setSummaryById(map)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const display = useMemo(() => {
    if (!vehicles?.length) return []
    return layout === "desktop" ? vehicles.slice(0, 4) : vehicles.slice(0, 3)
  }, [vehicles, layout])

  const loading = vehicles === null && !failed
  const showSkeleton = useDelayedSkeleton(loading)

  if (failed) return null

  /* Skeleton while vehicles fetch — so users know the section exists */
  if (loading) {
    if (!showSkeleton) return null

    if (layout === "desktop") {
      return (
        <section
          className={cn(
            "overflow-hidden rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] shadow-[var(--shadow-card)]",
            className,
          )}
          aria-busy="true"
          aria-label={tr("Memuatkan kenderaan", "Loading vehicles")}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--skeleton-border)] px-5 py-3.5">
            <div className="min-w-0 space-y-2">
              <div className="skeleton-surface h-2.5 w-16 rounded-full" />
              <div className="skeleton-surface h-3.5 w-36 rounded-full" />
            </div>
            <div className="skeleton-surface h-9 w-20 rounded-xl" />
          </div>
          <div className="grid gap-0 lg:grid-cols-[1.45fr_0.9fr]">
            <div className="min-h-[280px] border-b border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-5 lg:min-h-[340px] lg:border-b-0 lg:border-r">
              <div className="flex h-full min-h-[240px] flex-col justify-between">
                <div className="flex justify-between">
                  <div className="skeleton-surface h-7 w-24 rounded-full" />
                  <div className="skeleton-surface h-9 w-9 rounded-full" />
                </div>
                <div className="space-y-3">
                  <div className="skeleton-surface h-7 w-48 rounded-full" />
                  <div className="skeleton-surface h-3 w-32 rounded-full" />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] px-3 py-2.5">
                        <div className="skeleton-surface h-2 w-10 rounded-full" />
                        <div className="mt-2 skeleton-surface h-3.5 w-14 rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex min-h-[88px] items-center gap-3.5 rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-3.5"
                >
                  <div className="skeleton-surface h-16 w-16 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="skeleton-surface h-3 w-28 rounded-full" />
                    <div className="skeleton-surface h-2.5 w-20 rounded-full" />
                    <div className="skeleton-surface h-5 w-24 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )
    }

    // Mobile / default compact skeleton
    return (
      <div
        className={cn("w-full", className)}
        aria-busy="true"
        aria-label={tr("Memuatkan kenderaan", "Loading vehicles")}
      >
        <div className="flex overflow-hidden rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] shadow-[var(--shadow-soft)]">
          <div className="relative w-[42%] min-w-[7.5rem] max-w-[11rem] self-stretch">
            <div className="absolute inset-0 skeleton-surface" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5 p-3 pl-2.5">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton-surface h-3.5 w-28 rounded-full" />
                  <div className="skeleton-surface h-2.5 w-20 rounded-full" />
                </div>
                <div className="skeleton-surface h-7 w-7 shrink-0 rounded-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="min-w-0 space-y-1">
                  <div className="skeleton-surface h-2 w-10 rounded-full" />
                  <div className="skeleton-surface h-2.5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (display.length === 0) return null

  const isHero = variant === "hero"
  const primary = display[0]
  const primarySummary = summaryById.get(primary.id)
  const multi = display.length > 1

  const odoLabel =
    primary.current_odometer != null
      ? `${Number(primary.current_odometer).toLocaleString()} km`
      : tr("Tiada odo", "No odo")

  const meta = [primary.brand, primary.model].filter(Boolean).join(" · ")
  const fuelCost = Number(primarySummary?.fuel_cost || 0)
  const totalCost = Number(primarySummary?.total_cost || 0)

  /* ── Desktop large showcase ── */
  if (layout === "desktop") {
    const Icon = typeIcon(primary.vehicle_type)
    const label = typeLabel(primary.vehicle_type, isBm)
    const others = display.slice(1)

    return (
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              {tr("Kenderaan", "My Vehicle")}
            </p>
            <h3 className="mt-0.5 truncate text-sm font-black text-[var(--text)]">
              {multi
                ? tr(`${display.length} kenderaan aktif`, `${display.length} active vehicles`)
                : tr("Butiran kenderaan", "Vehicle details")}
            </h3>
          </div>
          <Link
            href={`/${sessionId}/vehicle`}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--accent2)] transition hover:bg-[var(--surface-tint-strong)]"
          >
            {tr("Semua", "View all")}
            <ChevronRight size={14} />
          </Link>
        </div>

        {/* Split layout: photo left + details right (balanced, no empty stretch) */}
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Link
            href={`/${sessionId}/vehicle/${primary.id}`}
            className="group relative block min-h-[200px] overflow-hidden border-b border-[var(--border)] lg:min-h-[260px] lg:border-b-0 lg:border-r"
          >
            <div className="absolute inset-0">
              {primary.has_image ? (
                <CachedVehicleImage
                  vehicleId={primary.id}
                  imageUrl={primary.image_url}
                  hasImage
                  alt={primary.name}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.03]"
                  fallbackIconSize={56}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--surface-tint-strong)] via-[var(--surface-tint)] to-[var(--card)]">
                  <Icon size={56} className="text-[var(--muted)] opacity-35" strokeWidth={1.3} />
                </div>
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h2 className="force-white truncate text-xl font-black leading-tight tracking-tight lg:text-2xl">
                {primary.name}
              </h2>
              {(meta || primary.registration_number) && (
                <p className="force-white mt-0.5 truncate text-xs font-semibold opacity-90">
                  {[primary.registration_number, meta || null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </Link>

          <div className="flex flex-col gap-3 p-4 lg:p-5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5">
                <p className="flex items-center gap-1 text-[0.58rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Gauge size={11} />
                  {tr("Odo", "Odo")}
                </p>
                <p className="mt-1 truncate text-sm font-black tabular-nums text-[var(--text)]">{odoLabel}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5">
                <p className="flex items-center gap-1 text-[0.58rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Fuel size={11} />
                  {tr("Fuel", "Fuel")}
                </p>
                <p className="mt-1 truncate text-sm font-black tabular-nums text-[var(--text)]">
                  RM {fuelCost.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5">
                <p className="flex items-center gap-1 text-[0.58rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Wrench size={11} />
                  {tr("Servis", "Service")}
                </p>
                <p className="mt-1 truncate text-sm font-black text-[var(--text)]">
                  {formatDate(primarySummary?.next_service_date, isBm)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5">
                <p className="flex items-center gap-1 text-[0.58rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Shield size={11} />
                  {tr("Insurans", "Insurance")}
                </p>
                <p className="mt-1 truncate text-sm font-black text-[var(--text)]">
                  {formatDate(primarySummary?.insurance_expiry, isBm)}
                </p>
              </div>
            </div>

            {totalCost > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2">
                <span className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Kos YTD", "YTD cost")}
                </span>
                <span className="text-sm font-black tabular-nums text-[var(--text)]">
                  RM {totalCost.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}

            {others.length > 0 ? (
              <div className="min-h-0 flex-1 space-y-2">
                <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  {tr("Kenderaan lain", "Other vehicles")} · {others.length}
                </p>
                <div className="space-y-1.5">
                  {others.map((v) => {
                    const vs = summaryById.get(v.id)
                    const fuel = Number(vs?.fuel_cost || 0)
                    const VIcon = typeIcon(v.vehicle_type)
                    return (
                      <Link
                        key={v.id}
                        href={`/${sessionId}/vehicle/${v.id}`}
                        className="group flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 transition hover:bg-[var(--surface-tint)] active:scale-[0.99]"
                      >
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-tint)]">
                          {v.has_image ? (
                            <CachedVehicleImage
                              vehicleId={v.id}
                  imageUrl={v.image_url}
                              hasImage
                              alt={v.name}
                              className="h-full w-full"
                              imgClassName="h-full w-full object-cover"
                              fallbackIconSize={16}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <VIcon size={16} className="text-[var(--muted)] opacity-50" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-black text-[var(--text)]">{v.name}</p>
                          <p className="truncate text-[10px] font-semibold text-[var(--muted)]">
                            {v.registration_number || [v.brand, v.model].filter(Boolean).join(" · ") || "—"}
                            {v.current_odometer != null
                              ? ` · ${Number(v.current_odometer).toLocaleString()} km`
                              : ""}
                            {` · RM ${fuel.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`}
                          </p>
                        </div>
                        <ChevronRight
                          size={14}
                          className="shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--text)]"
                        />
                      </Link>
                    )
                  })}
                </div>
              </div>
            ) : (
              <Link
                href={`/${sessionId}/vehicle`}
                className="mt-auto flex items-center justify-between rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] px-3 py-3 transition hover:bg-[var(--surface-tint-strong)]"
              >
                <div>
                  <p className="text-xs font-bold text-[var(--text)]">
                    {tr("Tambah kenderaan", "Add vehicle")}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-[var(--muted)]">
                    {tr("Fuel, servis & cukai", "Fuel, service & tax")}
                  </p>
                </div>
                <ChevronRight size={14} className="text-[var(--accent2)]" />
              </Link>
            )}

            <Link
              href={`/${sessionId}/vehicle/${primary.id}`}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-[var(--btn-primary-bg)] px-3 text-xs font-bold text-white transition hover:opacity-90"
            >
              {tr("Buka kenderaan", "Open vehicle")}
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    )
  }

  /* ── Mobile vehicle — left image + right info, one card ── */
  if (!isHero) {
    const renderVehicleCard = (v: VehicleItem) => {
      const vs = summaryById.get(v.id)
      const fuel = Number(vs?.fuel_cost || 0)
      const VIcon = typeIcon(v.vehicle_type)
      const vMeta = [v.brand, v.model].filter(Boolean).join(" · ")
      const vOdo =
        v.current_odometer != null
          ? `${Number(v.current_odometer).toLocaleString()} km`
          : tr("Tiada odo", "No odo")

      return (
        <Link
          key={v.id}
          href={`/${sessionId}/vehicle/${v.id}`}
          className={cn(
            "group relative flex shrink-0 snap-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)] transition active:scale-[0.99]",
            multi ? "w-[92%] max-w-[24rem]" : "w-full",
          )}
        >
          {/* Left media — flush with card edge, no nested box */}
          <div className="relative w-[42%] min-w-[7.5rem] max-w-[11rem] self-stretch bg-[var(--surface-tint)]">
            {v.has_image ? (
              <CachedVehicleImage
                vehicleId={v.id}
                  imageUrl={v.image_url}
                hasImage
                alt={v.name}
                className="absolute inset-0 h-full w-full"
                imgClassName="h-full w-full object-cover object-center transition duration-500 group-active:scale-[1.03]"
                fallbackIconSize={36}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--accent-bg)] via-[var(--surface-tint)] to-[var(--card)]">
                <VIcon size={36} className="text-[var(--accent2)] opacity-55" strokeWidth={1.4} />
              </div>
            )}
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[0.58rem] font-bold text-white backdrop-blur-sm">
              <VIcon size={10} />
              {typeLabel(v.vehicle_type, isBm)}
            </span>
          </div>

          {/* Right info */}
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5 p-3 pl-2.5">
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[0.95rem] font-black leading-tight tracking-tight text-[var(--text)]">
                    {v.name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">
                    {[v.registration_number, vMeta || null].filter(Boolean).join(" · ") ||
                      tr("Tiada butiran", "No details")}
                  </p>
                </div>
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--muted)] transition group-active:bg-[var(--surface-tint-strong)] group-active:text-[var(--text)]">
                  <ChevronRight size={14} />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Gauge size={10} className="text-[var(--accent2)]" />
                  {tr("Odo", "Odo")}
                </p>
                <p className="mt-0.5 truncate text-xs font-black tabular-nums text-[var(--text)]">
                  {vOdo}
                </p>
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Fuel size={10} className="text-amber-500" />
                  {tr("Fuel", "Fuel")}
                </p>
                <p className="mt-0.5 truncate text-xs font-black tabular-nums text-[var(--text)]">
                  RM {fuel.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Wrench size={10} className="text-emerald-500" />
                  {tr("Servis", "Service")}
                </p>
                <p className="mt-0.5 truncate text-xs font-black text-[var(--text)]">
                  {formatDate(vs?.next_service_date, isBm)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <Shield size={10} className="text-sky-500" />
                  {tr("Insurans", "Insurance")}
                </p>
                <p className="mt-0.5 truncate text-xs font-black text-[var(--text)]">
                  {formatDate(vs?.insurance_expiry, isBm)}
                </p>
              </div>
            </div>
          </div>
        </Link>
      )
    }

    if (!multi) {
      return <div className={cn(className)}>{renderVehicleCard(primary)}</div>
    }

    return (
      <div className={cn("w-full", className)}>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-0.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {display.map((v) => renderVehicleCard(v))}
        </div>
      </div>
    )
  }

  /* ── Compact hero glass (legacy) ── */
  if (!multi) {
    return (
      <Link
        href={`/${sessionId}/vehicle/${primary.id}`}
        className={cn(
          "group relative mt-3 flex w-full items-center gap-3 overflow-hidden rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/[0.1] backdrop-blur-md transition active:scale-[0.99] hover:bg-white/[0.1]",
          className,
        )}
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15">
          <CachedVehicleImage
            vehicleId={primary.id}
                  imageUrl={primary.image_url}
            hasImage={Boolean(primary.has_image)}
            alt={primary.name}
            fallbackIconSize={24}
            className="bg-white/5 text-sky-200"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Car size={12} className="text-sky-200/90" strokeWidth={2.4} />
            <p className="text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[#B8C8D8]">
              {tr("Kenderaan", "My Vehicle")}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[0.95rem] font-black leading-tight tracking-tight text-white">
            {primary.name}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-[#B8C8D8]">
            {[primary.registration_number, meta || null].filter(Boolean).join(" · ") ||
              tr("Tiada butiran", "No details")}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/90">
              <Gauge size={10} />
              {odoLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-100">
              <Fuel size={10} />
              {tr("Fuel", "Fuel")} RM {fuelCost.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <ChevronRight size={18} className="shrink-0 text-white/50 transition group-hover:translate-x-0.5" />
      </Link>
    )
  }

  return (
    <div className={cn("mt-3 w-full", className)}>
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <p className="text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[#B8C8D8]">
          {tr("Kenderaan", "My Vehicles")}
        </p>
        <Link href={`/${sessionId}/vehicle`} className="text-[10px] font-bold text-sky-200/90">
          {tr("Semua", "All")} →
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {display.map((v) => {
          const vs = summaryById.get(v.id)
          const fuel = Number(vs?.fuel_cost || 0)
          return (
            <Link
              key={v.id}
              href={`/${sessionId}/vehicle/${v.id}`}
              className="flex min-w-[78%] shrink-0 items-center gap-3 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/[0.1] backdrop-blur-md transition active:scale-[0.99] hover:bg-white/[0.1] sm:min-w-[48%]"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15">
                <CachedVehicleImage
                  vehicleId={v.id}
                  imageUrl={v.image_url}
                  hasImage={Boolean(v.has_image)}
                  alt={v.name}
                  fallbackIconSize={22}
                  className="bg-white/5 text-sky-200"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black leading-tight text-white">{v.name}</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-[#B8C8D8]">
                  {v.registration_number || [v.brand, v.model].filter(Boolean).join(" · ") || "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {v.current_odometer != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/90">
                      <Gauge size={9} />
                      {Number(v.current_odometer).toLocaleString()} km
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-100">
                    <Fuel size={9} />
                    RM {fuel.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
              <ChevronRight size={16} className="text-white/40" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
