"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Bike, Car, ChevronRight, Fuel, Gauge, Loader2, Plus, Truck, Wrench } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
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
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
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
  const [loadFailed, setLoadFailed] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<VehicleForm>(emptyForm)
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
      setLoadFailed(false)
    } catch (err) {
      setLoadFailed(true)
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
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showSheet } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showSheet])

  const closeSheet = useCallback(() => {
    setShowSheet(false)
    setForm(emptyForm())
  }, [])

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
    if (form.year && (Number(form.year) < 1950 || Number(form.year) > new Date().getFullYear() + 1)) {
      showAlert(tr("Maklumat tak sah", "Invalid info"), tr("Tahun tidak sah.", "The year is not valid."), "error")
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
        detail:
          vs.next_service_odometer != null
            ? `${Number(vs.next_service_odometer).toLocaleString()} KM`
            : (vs.next_service_date ?? tr("Tiada", "None")),
      }
    }
    return {
      tone: "none" as const,
      label: tr("Tiada servis dijadual", "No service scheduled"),
      detail: tr("Tambah rekod servis", "Add a service record"),
    }
  }


  const money = (n: number) => Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"
  const typeOptions = [
    { value: "car", label: tr("Kereta", "Car"), icon: Car },
    { value: "motorcycle", label: tr("Motosikal", "Bike"), icon: Bike },
    { value: "van", label: tr("Van", "Van"), icon: Car },
    { value: "other", label: tr("Lori / lain", "Truck / other"), icon: Truck },
  ] as const
  const openAdd = () => setShowSheet(true)
  const toneText = (tone: string) =>
    tone === "overdue" ? "text-rose-500" : tone === "soon" ? "text-amber-600 dark:text-amber-400" : "text-[var(--muted)]"

  return (
    <div className="pb-24 md:pb-0">
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Kenderaan Saya", "My Vehicle")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openAdd} label={tr("Tambah kenderaan", "Add vehicle")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Kenderaan Saya", "My Vehicle")}
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={openAdd}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah kenderaan", "Add vehicle")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        <ModenHero
          label={
            <>
              <Car size={16} />
              {tr("Kos bulan ini", "Cost this month")} · {boardStats.monthKey}
            </>
          }
          currency="RM"
          amount={showDataSkeleton ? "—" : money(boardStats.totalCost)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "fuel", tone: "out", icon: <Fuel size={15} strokeWidth={2.2} />, label: tr("Minyak", "Fuel"), value: `RM ${money(boardStats.fuelCost)}` },
            { key: "service", tone: "out", icon: <Wrench size={15} strokeWidth={2.2} />, label: tr("Servis", "Service"), value: `RM ${money(boardStats.maintenanceCost)}` },
          ]}
        />

        {(boardStats.overdueCount > 0 || boardStats.dueSoonCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {boardStats.overdueCount > 0 && (
              <button type="button" onClick={() => router.replace(`/${sessionId}/vehicle?filter=overdue`)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-500/30 px-4 text-xs font-semibold text-rose-500">
                <AlertTriangle size={13} />
                {boardStats.overdueCount} {tr("tertunggak", "overdue")}
              </button>
            )}
            {boardStats.dueSoonCount > 0 && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-500/30 px-4 text-xs font-semibold text-amber-600 dark:text-amber-400">
                {boardStats.dueSoonCount} {tr("hampir due", "due soon")}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="text-base font-bold text-[var(--text)]">{tr("Kenderaan anda", "Your vehicles")}</h2>
          {filterOverdue ? (
            <button type="button" onClick={() => router.replace(`/${sessionId}/vehicle`)} className="h-8 rounded-full bg-rose-500/15 px-3 text-xs font-semibold text-rose-500">
              {tr("Tertunggak ✕", "Overdue ✕")}
            </button>
          ) : (
            <span className="text-xs font-semibold text-[var(--muted)]">
              {boardStats.activeCount} {tr("aktif", "active")}
            </span>
          )}
        </div>

        {showDataSkeleton ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
            ))}
          </div>
        ) : loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <p className="text-sm font-bold text-[var(--text)]">{tr("Kenderaan tidak dapat dimuatkan", "Vehicles could not be loaded")}</p>
            <button type="button" onClick={() => void loadBoard()} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
              {tr("Cuba lagi", "Try again")}
            </button>
          </div>
        ) : displayedVehicles.length === 0 ? (
          <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
              <Car size={24} />
            </span>
            <p className="mt-4 text-base font-bold text-[var(--text)]">{filterOverdue ? tr("Tiada kenderaan tertunggak", "No overdue vehicles") : tr("Belum ada kenderaan", "No vehicles yet")}</p>
            {!filterOverdue && (
              <>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{tr("Jejak servis, minyak, road tax dan insurans di satu tempat.", "Track service, fuel, road tax and insurance in one place.")}</p>
                <button type="button" onClick={openAdd} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                  <Plus size={15} />
                  {tr("Tambah kenderaan", "Add vehicle")}
                </button>
              </>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {displayedVehicles.map((v) => {
              const badge = serviceBadge(v.id)
              const vs = summaryByVehicle.get(v.id)
              const meta = [v.registration_number, [v.brand, v.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
              const insurance = vs?.insurance_expiry
                ? new Date(`${vs.insurance_expiry}T12:00:00`).toLocaleDateString(isBm ? "ms-MY" : "en-MY", { day: "numeric", month: "short", year: "numeric" })
                : "—"
              return (
                <li key={v.id}>
                  <button type="button" onClick={() => router.push(`/${sessionId}/vehicle/${v.id}`)} className="group flex h-full w-full flex-col overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] text-left transition hover:border-[var(--border-strong)]">
                    <div className="relative h-32 w-full bg-[var(--surface-tint)]">
                      {v.has_image ? (
                        <CachedVehicleImage size="thumb" vehicleId={v.id} hasImage imageUrl={v.image_url} alt={v.name} className="absolute inset-0 h-full w-full" imgClassName="h-full w-full object-cover object-center" fallbackIconSize={36} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)]">
                          <Car size={38} strokeWidth={1.4} className="opacity-50" />
                        </div>
                      )}
                      {v.status && v.status !== "active" && (
                        <span className="absolute left-3 top-3 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">{v.status}</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-[var(--text)]">{v.name}</p>
                          <p className="truncate text-xs text-[var(--muted)]">{meta || tr("Tiada butiran", "No details")}</p>
                        </div>
                        <ChevronRight size={16} className="mt-1 shrink-0 text-[var(--muted)]" />
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div className="min-w-0">
                          <dt className="flex items-center gap-1 text-[var(--muted)]"><Gauge size={11} />{tr("Odometer", "Odometer")}</dt>
                          <dd className="truncate font-bold tabular-nums text-[var(--text)]">{v.current_odometer != null ? `${Number(v.current_odometer).toLocaleString("en-MY")} km` : "—"}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="flex items-center gap-1 text-[var(--muted)]"><Fuel size={11} />{tr("Minyak", "Fuel")}</dt>
                          <dd className="truncate font-bold tabular-nums text-[var(--text)]">RM {Number(vs?.fuel_cost || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="flex items-center gap-1 text-[var(--muted)]"><Wrench size={11} />{tr("Servis", "Service")}</dt>
                          <dd className={cn("truncate font-bold", badge.tone === "overdue" || badge.tone === "soon" ? toneText(badge.tone) : "text-[var(--text)]")}>{badge.tone === "none" ? "—" : badge.detail || badge.label}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[var(--muted)]">{tr("Insurans", "Insurance")}</dt>
                          <dd className="truncate font-bold text-[var(--text)]">{insurance}</dd>
                        </div>
                      </dl>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </DesktopPageBody>

      <AppSheet
        open={showSheet}
        onClose={closeSheet}
        id="vehicle-add-sheet"
        title={tr("Tambah kenderaan", "Add vehicle")}
        size="md"
        footer={
          <button type="submit" form="vehicle-add-form" disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {tr("Simpan", "Save")}
          </button>
        }
      >
        <form id="vehicle-add-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <span className={label}>{tr("Jenis", "Type")}</span>
            <div className="grid grid-cols-4 gap-2">
              {typeOptions.map((opt) => {
                const Icon = opt.icon
                const active = form.vehicle_type === opt.value
                return (
                  <button key={opt.value} type="button" aria-pressed={active} onClick={() => setForm((f) => ({ ...f, vehicle_type: opt.value }))} className={cn("flex flex-col items-center justify-center gap-1 rounded-[1.25rem] border px-1 py-3 text-xs font-semibold transition", active ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--text)]")}>
                    <Icon size={18} />
                    <span className="leading-none">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label htmlFor="veh-plate" className={label}>{tr("No. pendaftaran", "Plate number")}</label>
            <input id="veh-plate" value={form.registration_number} maxLength={20} onChange={(e) => setForm((f) => ({ ...f, registration_number: e.target.value.toUpperCase() }))} placeholder="JXX1234" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="veh-brand" className={label}>{tr("Jenama", "Brand")}</label>
              <input id="veh-brand" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} placeholder="Honda" className={field} />
            </div>
            <div>
              <label htmlFor="veh-model" className={label}>Model</label>
              <input id="veh-model" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="City" className={field} />
            </div>
            <div>
              <label htmlFor="veh-color" className={label}>{tr("Warna", "Colour")}</label>
              <input id="veh-color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder={tr("Merah", "Red")} className={field} />
            </div>
            <div>
              <label htmlFor="veh-year" className={label}>{tr("Tahun", "Year")}</label>
              <input id="veh-year" inputMode="numeric" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="2020" className={field} />
            </div>
          </div>
          <p className="text-xs text-[var(--muted)]">{tr("Isi sekurang-kurangnya satu: no. pendaftaran, jenama atau model.", "Fill in at least one: plate, brand or model.")}</p>
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
