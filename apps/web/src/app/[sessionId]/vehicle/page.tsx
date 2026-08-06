"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  Car,
  ChevronRight,
  Fuel,
  Gauge,
  Loader2,
  Plus,
  Truck,
  Wrench,
  X,
  CalendarClock,
  Shield,
} from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { CachedVehicleImage } from "@/components/vehicle/CachedVehicleImage"

type VehicleItem = {
  id: number
  name: string
  vehicle_type?: string | null
  registration_number?: string | null
  brand?: string | null
  model?: string | null
  year?: number | null
  fuel_type?: string | null
  current_odometer?: number | null
  has_image?: boolean
  image_url?: string | null
  status: string
  notes?: string | null
}

type VehicleSummary = {
  month_key: string
  total_cost: number
  fuel_cost: number
  maintenance_cost: number
  expense_cost: number
  distance_travelled?: number | null
  avg_km_per_litre?: number | null
  vehicles?: Array<{
    vehicle_id: number
    vehicle_name?: string | null
    registration_number?: string | null
    current_odometer?: number | null
    total_cost: number
    fuel_cost: number
    next_service_date?: string | null
    next_service_odometer?: number | null
    road_tax_expiry?: string | null
    insurance_expiry?: string | null
  }>
}

type DueReminder = {
  id: number
  vehicle_id: number
  vehicle_name?: string | null
  reminder_type: string
  title: string
  due_date?: string | null
  due_odometer?: number | null
  is_overdue?: boolean
  is_due_soon?: boolean
  days_overdue?: number | null
  km_overdue?: number | null
}

type VehicleForm = {
  name: string
  vehicle_type: string
  registration_number: string
  brand: string
  model: string
  year: string
  color: string
}

const emptyForm = (): VehicleForm => ({
  name: "",
  vehicle_type: "car",
  registration_number: "",
  brand: "",
  model: "",
  year: "",
  color: "",
})

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function VehicleListPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const filterOverdue = searchParams.get("filter") === "overdue"

  const [vehicles, setVehicles] = useState<VehicleItem[]>([])
  const [summary, setSummary] = useState<VehicleSummary | null>(null)
  const [reminders, setReminders] = useState<DueReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<VehicleForm>(emptyForm)
  const [mounted, setMounted] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) {
      return { Authorization: `Bearer ${token}` }
    }
    return {}
  }, [])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])
  useEffect(() => {
    setMounted(true)
  }, [])

  const loadBoard = useCallback(async () => {
    if (!hasLoaded) setLoading(true)
    try {
      const headers = authHeaders()
      const [vRes, sRes, rRes] = await Promise.all([
        fetch("/api/vehicles", { headers, credentials: "include", cache: "no-store" }),
        fetch("/api/vehicles/summary", { headers, credentials: "include", cache: "no-store" }),
        fetch("/api/vehicles/reminders/due", { headers, credentials: "include", cache: "no-store" }),
      ])
      if (!vRes.ok) {
        const payload = (await vRes.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || (isBm ? "Gagal muat kenderaan." : "Failed to load vehicles."))
      }
      const vData = await vRes.json()
      setVehicles(Array.isArray(vData) ? vData : [])
      if (sRes.ok) setSummary(await sRes.json())
      if (rRes.ok) {
        const rData = await rRes.json()
        setReminders(Array.isArray(rData) ? rData : [])
      }
      setHasLoaded(true)
    } catch (err) {
      showAlertRef.current(
        isBm ? "Ralat" : "Error",
        err instanceof Error ? err.message : isBm ? "Gagal muat kenderaan." : "Failed to load vehicles.",
        "error"
      )
    } finally {
      setLoading(false)
    }
  }, [authHeaders, hasLoaded, isBm])

  useEffect(() => {
    void loadBoard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showSheet } })
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } })
      )
    }
  }, [showSheet])

  useEffect(() => {
    if (!showSheet) return

    const scrollY = window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = "100%"
    document.documentElement.style.overscrollBehavior = "none"

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [showSheet])

  const closeSheet = useCallback(() => {
    setShowSheet(false)
    setForm(emptyForm())
  }, [])
  const sheetSwipe = useSwipeDownToClose(() => closeSheet())

  const summaryByVehicle = useMemo(() => {
    const map = new Map<number, NonNullable<VehicleSummary["vehicles"]>[number]>()
    for (const row of summary?.vehicles || []) {
      if (row.vehicle_id != null) map.set(Number(row.vehicle_id), row)
    }
    return map
  }, [summary])

  const serviceDueByVehicle = useMemo(() => {
    const map = new Map<number, DueReminder[]>()
    for (const r of reminders) {
      const list = map.get(r.vehicle_id) || []
      list.push(r)
      map.set(r.vehicle_id, list)
    }
    return map
  }, [reminders])

  const boardStats = useMemo(() => {
    const active = vehicles.filter((v) => v.status === "active" || v.status === "maintenance")
    const overdueCount = reminders.filter((r) => r.is_overdue).length
    const dueSoonCount = reminders.filter((r) => r.is_due_soon && !r.is_overdue).length
    return {
      vehicleCount: vehicles.length,
      activeCount: active.length,
      overdueCount,
      dueSoonCount,
      totalCost: Number(summary?.total_cost || 0),
      fuelCost: Number(summary?.fuel_cost || 0),
      maintenanceCost: Number(summary?.maintenance_cost || 0),
      monthKey: summary?.month_key || new Date().toISOString().slice(0, 7),
      distance: summary?.distance_travelled ?? null,
    }
  }, [vehicles, reminders, summary])

  const displayedVehicles = useMemo(() => {
    if (!filterOverdue) return vehicles
    return vehicles.filter((v) => (serviceDueByVehicle.get(v.id) || []).some((r) => r.is_overdue))
  }, [vehicles, filterOverdue, serviceDueByVehicle])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.registration_number.trim() && !form.brand.trim() && !form.model.trim()) {
      showAlert(
        tr("Maklumat tak lengkap", "Incomplete"),
        tr("Isi sekurang-kurangnya satu: no. pendaftaran, jenama atau model.",
          "Fill at least one: registration, brand or model."),
        "error"
      )
      return
    }
    const name =
      form.name.trim() ||
      [form.brand.trim(), form.model.trim(), form.year.trim()]
        .filter(Boolean)
        .join(" ") ||
      form.registration_number.trim() ||
      "Vehicle"
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        vehicle_type: form.vehicle_type || null,
        registration_number: form.registration_number.trim() || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? Number(form.year) : null,
        color: form.color.trim() || null,
      }
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan.", "Failed to save."))
      }
      const created = (await res.json()) as VehicleItem
      closeSheet()
      await loadBoard()
      router.push(`/${sessionId}/vehicle/${created.id}`)
    } catch (err) {
      showAlert(
        tr("Gagal", "Failed"),
        err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."),
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  function serviceBadge(vehicleId: number) {
    const due = serviceDueByVehicle.get(vehicleId) || []
    const overdue = due.filter((r) => r.is_overdue)
    const soon = due.filter((r) => r.is_due_soon && !r.is_overdue)
    const vs = summaryByVehicle.get(vehicleId)
    const nextServiceDays = daysUntil(vs?.next_service_date)
    const roadTaxDays = daysUntil(vs?.road_tax_expiry)

    if (overdue.length > 0) {
      const top = overdue[0]
      const detail =
        top.days_overdue != null
          ? tr(`${top.days_overdue} hari lewat`, `${top.days_overdue}d overdue`)
          : top.km_overdue != null
            ? tr(`${Number(top.km_overdue).toLocaleString()} KM lewat`, `${Number(top.km_overdue).toLocaleString()} KM overdue`)
            : top.title
      return {
        tone: "overdue" as const,
        label: tr("Servis tertunggak", "Service overdue"),
        detail,
      }
    }
    if (soon.length > 0 || (nextServiceDays != null && nextServiceDays <= 14)) {
      const top = soon[0]
      return {
        tone: "soon" as const,
        label: tr("Servis hampir", "Service due soon"),
        detail:
          top?.due_date ||
          (nextServiceDays != null
            ? tr(`${nextServiceDays} hari lagi`, `in ${nextServiceDays} days`)
            : vs?.next_service_date || "—"),
      }
    }
    if (roadTaxDays != null && roadTaxDays <= 30) {
      return {
        tone: roadTaxDays < 0 ? ("overdue" as const) : ("soon" as const),
        label: roadTaxDays < 0 ? tr("Road tax tamat", "Road tax expired") : tr("Road tax hampir", "Road tax soon"),
        detail:
          roadTaxDays < 0
            ? tr(`${Math.abs(roadTaxDays)} hari lewat`, `${Math.abs(roadTaxDays)}d overdue`)
            : tr(`${roadTaxDays} hari lagi`, `in ${roadTaxDays} days`),
      }
    }
    if (vs?.next_service_date || vs?.next_service_odometer != null) {
      return {
        tone: "ok" as const,
        label: tr("Servis seterusnya", "Next service"),
        detail: [
          vs.next_service_date,
          vs.next_service_odometer != null ? `${Number(vs.next_service_odometer).toLocaleString()} KM` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    }
    return {
      tone: "none" as const,
      label: tr("Tiada servis dijadual", "No service scheduled"),
      detail: tr("Tambah rekod servis", "Add a service record"),
    }
  }

  return (
    <div className="space-y-4 pb-24 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Kenderaan Saya", "My Vehicle")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={() => setShowSheet(true)} label={tr("Tambah kenderaan", "Add vehicle")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        {/* Hero card */}
        <section className="px-1">
          <div className="vehicle-hero-card relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[#1a1a1a] p-5 text-white shadow-[var(--shadow-card)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
            <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
            <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.04] blur-2xl" />

            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-slate-300">
                    {tr("Kos bulan ini", "This month cost")}
                  </p>
                  <p className="mt-2 leading-none text-white">
                    {showDataSkeleton ? (
                      <AmountSkeleton className="h-7 w-32 bg-white/10" />
                    ) : (
                      <MoneyAmount
                        value={boardStats.totalCost}
                        size="hero"
                        className="text-white"
                        currencyClassName="text-white opacity-55"
                      />
                    )}
                  </p>
                  <p className="mt-1.5 text-[0.625rem] font-semibold text-slate-400">
                    {boardStats.monthKey} · {boardStats.vehicleCount}{" "}
                    {tr("kenderaan", "vehicles")}
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#e5e5e5]">
                  <Car size={20} />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <Fuel size={12} className="text-amber-300" />
                    <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-300/90">
                      Fuel
                    </p>
                  </div>
                  <p className="mt-2 text-amber-200">
                    {showDataSkeleton ? (
                      <AmountSkeleton className="h-4 w-12 bg-white/10" />
                    ) : (
                      <MoneyAmount value={boardStats.fuelCost} digits={0} size="xs" className="text-amber-200" currencyClassName="text-amber-200 opacity-55" />
                    )}
                  </p>
                </div>
                <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <Wrench size={12} className="text-[#e5e5e5]" />
                    <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-300/90">
                      {tr("Servis", "Service")}
                    </p>
                  </div>
                  <p className="mt-2 text-sky-200">
                    {showDataSkeleton ? (
                      <AmountSkeleton className="h-4 w-12 bg-white/10" />
                    ) : (
                      <MoneyAmount value={boardStats.maintenanceCost} digits={0} size="xs" className="text-sky-200" currencyClassName="text-sky-200 opacity-55" />
                    )}
                  </p>
                </div>
                <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle
                      size={12}
                      className={boardStats.overdueCount > 0 ? "text-rose-300" : "text-emerald-300"}
                    />
                    <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-300/90">
                      {tr("Due", "Due")}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-sm font-semibold tabular-nums tracking-tight",
                      boardStats.overdueCount > 0 ? "text-rose-300" : "text-emerald-300"
                    )}
                  >
                    {showDataSkeleton ? (
                      <AmountSkeleton className="h-4 w-10 bg-white/10" />
                    ) : (
                      boardStats.overdueCount
                    )}
                  </p>
                </div>
              </div>

              {(boardStats.overdueCount > 0 || boardStats.dueSoonCount > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {boardStats.overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold text-rose-200">
                      <AlertTriangle size={11} />
                      {boardStats.overdueCount} {tr("tertinggal", "overdue")}
                    </span>
                  )}
                  {boardStats.dueSoonCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-100">
                      <CalendarClock size={11} />
                      {boardStats.dueSoonCount} {tr("hampir", "due soon")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Your vehicles */}
        <section className="px-1">
          <div className="flex items-center justify-between px-1.5">
            <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
              {tr("Kenderaan Anda", "Your Vehicles")}
            </p>
            {filterOverdue ? (
              <button
                type="button"
                onClick={() => router.replace(`/${sessionId}/vehicle`)}
                className="rounded-full bg-rose-500/15 px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.12em] text-rose-500"
              >
                {tr("Tertunggak", "Overdue")}
              </button>
            ) : (
              <span className="text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                {boardStats.activeCount} {tr("aktif", "active")}
              </span>
            )}
          </div>

          <div className="mt-3.5 space-y-3">
            {showDataSkeleton ? (
              Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)]">
                      <AmountSkeleton className="h-[7.5rem] w-[42%] min-w-[7.5rem] rounded-none" />
                      <div className="flex flex-1 flex-col justify-between gap-2 p-3">
                        <div className="space-y-1.5">
                          <AmountSkeleton className="h-4 w-28" />
                          <AmountSkeleton className="h-3 w-36" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <AmountSkeleton className="h-8 w-full" />
                          <AmountSkeleton className="h-8 w-full" />
                          <AmountSkeleton className="h-8 w-full" />
                          <AmountSkeleton className="h-8 w-full" />
                        </div>
                      </div>
                    </div>
              ))
            ) : displayedVehicles.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 p-8 text-center">
                <Car size={32} className="mx-auto text-[var(--muted)]/40" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                  {filterOverdue
                    ? tr("Tiada kenderaan tertunggak.", "No overdue vehicles.")
                    : tr("Belum ada kenderaan.", "No vehicles yet.")}
                </p>
                {!filterOverdue && (
                  <button
                    type="button"
                    onClick={() => setShowSheet(true)}
                    className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-95"
                  >
                    <Plus size={14} className="mr-1 inline" />
                    {tr("Tambah Kenderaan", "Add Vehicle")}
                  </button>
                )}
              </div>
            ) : (
              displayedVehicles.map((v) => {
                const badge = serviceBadge(v.id)
                const vs = summaryByVehicle.get(v.id)
                const fuel = Number(vs?.fuel_cost || 0)
                const vMeta = [v.brand, v.model].filter(Boolean).join(" · ")
                const vOdo =
                  v.current_odometer != null
                    ? `${Number(v.current_odometer).toLocaleString()} km`
                    : tr("Tiada odo", "No odo")
                const serviceLabel =
                  badge.tone === "none"
                    ? "—"
                    : badge.detail || badge.label
                const insuranceLabel = (() => {
                  if (!vs?.insurance_expiry) return "—"
                  const d = new Date(vs.insurance_expiry)
                  if (Number.isNaN(d.getTime())) return vs.insurance_expiry
                  return d.toLocaleDateString(lang === "BM" ? "ms-MY" : "en-MY", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                })()

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => router.push(`/${sessionId}/vehicle/${v.id}`)}
                    className="group relative flex w-full overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] text-left shadow-[var(--shadow-soft)] transition active:scale-[0.99]"
                  >
                    {/* Left media — flush with card edge */}
                    <div className="relative w-[42%] min-w-[7.5rem] max-w-[11rem] self-stretch bg-[var(--surface-tint)]">
                      {v.has_image ? (
                        <CachedVehicleImage
                          vehicleId={v.id}
                          hasImage
                          imageUrl={v.image_url}
                          alt={v.name}
                          className="absolute inset-0 h-full w-full"
                          imgClassName="h-full w-full object-cover object-center transition duration-500 group-active:scale-[1.03]"
                          fallbackIconSize={36}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--accent-bg)] via-[var(--surface-tint)] to-[var(--card)]">
                          <Car size={36} className="text-[var(--accent2)] opacity-55" strokeWidth={1.4} />
                        </div>
                      )}
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
                            <Wrench
                              size={10}
                              className={cn(
                                badge.tone === "overdue" && "text-rose-500",
                                badge.tone === "soon" && "text-amber-500",
                                badge.tone === "ok" && "text-emerald-500",
                                badge.tone === "none" && "text-[var(--muted)]",
                              )}
                            />
                            {tr("Servis", "Service")}
                          </p>
                          <p
                            className={cn(
                              "mt-0.5 truncate text-xs font-black",
                              badge.tone === "overdue" && "text-rose-500",
                              badge.tone === "soon" && "text-amber-500",
                              (badge.tone === "ok" || badge.tone === "none") && "text-[var(--text)]",
                            )}
                          >
                            {serviceLabel}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                            <Shield size={10} className="text-sky-500" />
                            {tr("Insurans", "Insurance")}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-black text-[var(--text)]">
                            {insuranceLabel}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Kenderaan Saya", "My Vehicle")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={() => setShowSheet(true)}>
              <Plus strokeWidth={2.5} />
              {tr("Tambah kenderaan", "Add vehicle")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="space-y-5">
        {/* Desktop hero */}
        <div className="vehicle-hero-card relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[#1a1a1a] p-6 text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-slate-300">
                {tr("Kos bulan ini", "This month cost")} · {boardStats.monthKey}
              </p>
              <p className="mt-2 leading-none text-white">
                {showDataSkeleton ? (
                  <AmountSkeleton className="h-10 w-40 bg-white/10" />
                ) : (
                  <MoneyAmount
                    value={boardStats.totalCost}
                    size="heroLg"
                    className="text-white"
                    currencyClassName="text-white opacity-55"
                  />
                )}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                {boardStats.vehicleCount} {tr("kenderaan", "vehicles")}
                {boardStats.distance != null
                  ? ` · ${Number(boardStats.distance).toLocaleString()} KM`
                  : ""}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Fuel",
                  moneyValue: boardStats.fuelCost,
                  isMoney: true as const,
                  icon: <Fuel size={16} className="text-amber-300" />,
                  color: "text-amber-200",
                },
                {
                  label: tr("Servis", "Service"),
                  moneyValue: boardStats.maintenanceCost,
                  isMoney: true as const,
                  icon: <Wrench size={16} className="text-[#e5e5e5]" />,
                  color: "text-sky-200",
                },
                {
                  label: tr("Tertunggak", "Overdue"),
                  moneyValue: boardStats.overdueCount,
                  isMoney: false as const,
                  icon: (
                    <AlertTriangle
                      size={16}
                      className={boardStats.overdueCount > 0 ? "text-rose-300" : "text-emerald-300"}
                    />
                  ),
                  color: boardStats.overdueCount > 0 ? "text-rose-300" : "text-emerald-300",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-white/[0.06] p-4">
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-300">
                      {item.label}
                    </p>
                  </div>
                  <p className={cn("mt-3 leading-none", item.color)}>
                    {showDataSkeleton ? (
                      <AmountSkeleton className="h-6 w-16 bg-white/10" />
                    ) : item.isMoney ? (
                      <MoneyAmount
                        value={item.moneyValue}
                        digits={0}
                        size="md"
                        className={item.color}
                        currencyClassName={cn(item.color, "opacity-55")}
                      />
                    ) : (
                      <span className="text-xl font-semibold tabular-nums tracking-tight">{item.moneyValue}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
            {tr("Kenderaan Anda", "Your Vehicles")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {showDataSkeleton
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-56 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]" />
                ))
              : displayedVehicles.map((v) => {
                  const badge = serviceBadge(v.id)
                  const meta = [v.registration_number, v.brand, v.model].filter(Boolean).join(" · ")
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => router.push(`/${sessionId}/vehicle/${v.id}`)}
                      className="group overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] text-left shadow-[var(--shadow-card)] transition hover:border-[color-mix(in_srgb,var(--accent2)_35%,var(--border))] active:scale-[0.99]"
                    >
                      <div className="relative h-36 w-full bg-[var(--surface-tint)]">
                        <CachedVehicleImage
                          vehicleId={v.id}
                          hasImage={Boolean(v.has_image)}
                          imageUrl={v.image_url}
                          alt={v.name}
                          imgClassName="transition group-hover:scale-[1.02]"
                          fallbackIconSize={40}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3 pt-8">
                          <p className="force-white truncate text-sm font-black">{v.name}</p>
                          <p className="force-white truncate text-[11px] font-semibold opacity-80">
                            {meta || tr("Tiada butiran", "No details")}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2.5 p-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {v.current_odometer != null && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                              <Gauge size={10} />
                              {Number(v.current_odometer).toLocaleString()} KM
                            </span>
                          )}
                          {v.status && (
                            <span className="rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--muted)]">
                              {v.status}
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            "flex items-start gap-2 rounded-2xl border px-3 py-2",
                            badge.tone === "overdue" && "border-rose-500/25 bg-rose-500/10",
                            badge.tone === "soon" && "border-amber-500/25 bg-amber-500/10",
                            badge.tone === "ok" && "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10",
                            badge.tone === "none" && "border-[var(--border)] bg-[var(--surface-tint)]/40"
                          )}
                        >
                          <Wrench size={13} className="mt-0.5 shrink-0 text-[var(--muted)]" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-black text-[var(--text)]">{badge.label}</p>
                            <p className="truncate text-[10px] font-semibold text-[var(--muted)]">
                              {badge.detail}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
          </div>
          {!showDataSkeleton && displayedVehicles.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] p-12 text-center">
              <Car size={36} className="mx-auto text-[var(--muted)]/40" />
              <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                {tr("Belum ada kenderaan.", "No vehicles yet.")}
              </p>
            </div>
          )}
        </div>
        </DesktopPageBody>
      </div>

      {mounted &&
        showSheet &&
        createPortal(
          <div className="fixed inset-0 z-[140] flex h-[100dvh] w-screen touch-none items-end justify-center overscroll-none bg-transparent p-0 md:items-center md:p-4">
            <div
              data-swipe-sheet
              className="app-sheet-panel max-h-[82dvh] w-full overflow-y-auto overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl touch-pan-y md:max-h-[85vh] md:max-w-[30rem] md:rounded-[1.75rem]"
              {...sheetSwipe}
            >
              <div className="sticky top-0 z-30 mb-3 flex items-center justify-between rounded-t-[36px] border-b border-[var(--border)] bg-[var(--sheet-bg)] px-4 py-4 sm:px-6">
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {tr("Kenderaan baru", "New vehicle")}
                  </p>
                  <h2 className="text-base font-black text-[var(--text)]">
                    {tr("Tambah kenderaan", "Add vehicle")}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSave} className="grid grid-cols-2 gap-3 p-4">
                <div className="col-span-2 block">
                  <span className="mb-1 block text-xs font-bold text-[var(--muted)]">
                    {tr("Jenis", "Type")}
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { value: "car", label: tr("Kereta", "Car"), icon: Car },
                        { value: "motorcycle", label: tr("Moto", "Bike"), icon: Bike },
                        { value: "van", label: tr("Van", "Van"), icon: Car },
                        { value: "other", label: tr("Lori", "Truck"), icon: Truck },
                      ] as const
                    ).map((opt) => {
                      const Icon = opt.icon
                      const active = form.vehicle_type === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, vehicle_type: opt.value }))}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2.5 text-[11px] font-bold text-[var(--text)] transition active:scale-95",
                            active
                              ? "border-[var(--accent2)] bg-[var(--accent-bg)] ring-2 ring-[var(--accent2)]/20"
                              : "border-[var(--border)] bg-[var(--input-bg)]"
                          )}
                        >
                          <Icon size={18} strokeWidth={2} />
                          <span className="leading-none">{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-xs font-bold text-[var(--muted)]">
                    {tr("No. pendaftaran", "Plate number")}
                  </span>
                  <input
                    type="text"
                    value={form.registration_number}
                    onChange={(e) => setForm((f) => ({ ...f, registration_number: e.target.value }))}
                    placeholder="JXX1234"
                    className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-semibold uppercase text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--muted)]">
                    {tr("Jenama", "Brand")}
                  </span>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    placeholder="Honda"
                    className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--muted)]">
                    {tr("Model", "Model")}
                  </span>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="City"
                    className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--muted)]">
                    {tr("Warna", "Colour")}
                  </span>
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    placeholder="Red"
                    className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--muted)]">
                    {tr("Tahun", "Year")}
                  </span>
                  <input
                    type="text"
                    value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                    placeholder="2020"
                    className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="col-span-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-3 text-sm font-bold text-[var(--btn-primary-text)] disabled:opacity-60"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {tr("Simpan", "Save")}
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}

      {alertModal}
    </div>
  )
}
