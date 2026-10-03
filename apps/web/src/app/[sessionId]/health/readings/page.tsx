"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Activity, Check, Clock, Hash, LineChart, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { MetricChart, TrendStats } from "@/components/health/HealthCharts"

type Reading = {
  id: number
  metric_type: string
  value?: number | null
  systolic?: number | null
  diastolic?: number | null
  unit?: string | null
  note?: string | null
  measured_at: string
}

const METRICS: { key: string; labelBM: string; labelEN: string; unit: string; fields: string[]; min: number; max: number }[] = [
  { key: "weight", labelBM: "Berat", labelEN: "Weight", unit: "kg", fields: ["value"], min: 1, max: 500 },
  { key: "height", labelBM: "Tinggi", labelEN: "Height", unit: "cm", fields: ["value"], min: 30, max: 260 },
  { key: "bp", labelBM: "Tekanan darah", labelEN: "Blood pressure", unit: "mmHg", fields: ["systolic", "diastolic"], min: 30, max: 300 },
  { key: "glucose", labelBM: "Gula darah", labelEN: "Glucose", unit: "mmol/L", fields: ["value"], min: 0.5, max: 60 },
  { key: "pulse", labelBM: "Nadi", labelEN: "Pulse", unit: "BPM", fields: ["value"], min: 20, max: 260 },
  { key: "spo2", labelBM: "SpO₂", labelEN: "SpO₂", unit: "%", fields: ["value"], min: 50, max: 100 },
  { key: "temperature", labelBM: "Suhu", labelEN: "Temperature", unit: "°C", fields: ["value"], min: 30, max: 45 },
]

const RANGES = ["7d", "30d", "3m", "1y"]
const TZ = "Asia/Kuala_Lumpur"

/** "YYYY-MM-DDTHH:mm" in Kuala Lumpur time for a UTC instant. */
function toKlInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00"
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`
}

const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

export default function HealthReadingsPage() {
  const params = useParams()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const searchParams = useSearchParams()
  const initialMetric = searchParams.get("metric")
  const [metric, setMetricState] = useState(initialMetric && METRICS.some((m) => m.key === initialMetric) ? initialMetric : "weight")
  const setMetric = useCallback((k: string) => {
    setMetricState(k)
    const url = new URL(window.location.href)
    url.searchParams.set("metric", k)
    window.history.replaceState(null, "", url.toString())
  }, [])
  const [range, setRange] = useState("30d")
  const [readings, setReadings] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [editing, setEditing] = useState<Reading | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const meta = useMemo(() => METRICS.find((m) => m.key === metric) || METRICS[0], [metric])
  const metricName = isBm ? meta.labelBM : meta.labelEN
  const current = readings[0]

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])
  const errorOf = async (res: Response, fallback: string) => {
    const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof payload?.detail === "string" ? payload.detail : fallback
  }

  const loadReadings = useCallback(async () => {
    try {
      const res = await fetch(`/api/health/readings?metric=${metric}&range=${range}`, { headers: headers(), credentials: "include", cache: "no-store" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setReadings(Array.isArray(data) ? data : [])
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [headers, metric, range])

  useEffect(() => {
    setLoading(true)
    void loadReadings()
  }, [loadReadings])

  const openAdd = () => {
    setEditing(null)
    setForm({ at: toKlInput() })
    setSheet(true)
  }
  const openEdit = (r: Reading) => {
    const f: Record<string, string> = { at: toKlInput(r.measured_at) }
    if (r.value != null) f.value = String(r.value)
    if (r.systolic != null) f.systolic = String(r.systolic)
    if (r.diastolic != null) f.diastolic = String(r.diastolic)
    if (r.note) f.note = r.note
    setForm(f)
    setEditing(r)
    setSheet(true)
  }
  const close = () => {
    setSheet(false)
    setEditing(null)
  }

  const num = (v?: string) => (v == null || v.trim() === "" ? NaN : Number(v))
  const problem = (() => {
    if (meta.key === "bp") {
      const s = num(form.systolic)
      const d = num(form.diastolic)
      if (isNaN(s) || isNaN(d)) return tr("Isi kedua-dua tekanan sistolik dan diastolik.", "Enter both systolic and diastolic pressure.")
      if (s < 50 || s > 300 || d < 30 || d > 200) return tr("Tekanan darah di luar julat yang munasabah.", "Blood pressure is outside a possible range.")
      if (s <= d) return tr("Sistolik mesti lebih tinggi daripada diastolik.", "Systolic must be higher than diastolic.")
    } else {
      const v = num(form.value)
      if (isNaN(v)) return tr("Masukkan nilai.", "Enter a value.")
      if (v < meta.min || v > meta.max) return tr(`Nilai patut antara ${meta.min} dan ${meta.max} ${meta.unit}.`, `The value should be between ${meta.min} and ${meta.max} ${meta.unit}.`)
    }
    if (!form.at) return tr("Pilih tarikh dan masa.", "Choose a date and time.")
    return null
  })()

  const saveReading = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Maklumat tak sah", "Invalid info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = { note: form.note?.trim() || null, measured_at: new Date(`${form.at}:00+08:00`).toISOString() }
      if (meta.fields.includes("value")) body.value = num(form.value)
      if (meta.fields.includes("systolic")) {
        body.systolic = num(form.systolic)
        body.diastolic = num(form.diastolic)
      }
      const res = await fetch(editing ? `/api/health/readings/${editing.id}` : "/api/health/readings", {
        method: editing ? "PATCH" : "POST",
        headers: headers(true),
        credentials: "include",
        body: JSON.stringify(editing ? body : { metric_type: metric, ...body }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan bacaan.", "Could not save the reading.")))
      close()
      await loadReadings()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const deleteReading = (r: Reading) =>
    showConfirm(tr("Padam bacaan?", "Delete reading?"), tr("Bacaan ini akan dipadam.", "This reading will be deleted."), async () => {
      try {
        const res = await fetch(`/api/health/readings/${r.id}`, { method: "DELETE", headers: headers(), credentials: "include" })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
        close()
        await loadReadings()
      } catch (err) {
        showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
      }
    }, "warning")

  const chartPoints = useMemo(
    () =>
      [...readings].reverse().map((r) => ({
        id: r.id,
        label: new Date(r.measured_at).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", timeZone: TZ }),
        value: metric === "bp" && r.systolic != null ? r.systolic : (r.value ?? undefined),
        systolic: r.systolic ?? undefined,
        diastolic: r.diastolic ?? undefined,
      })),
    [readings, metric, locale]
  )

  const fmtReading = (r: Reading) => (metric === "bp" && r.systolic != null && r.diastolic != null ? `${r.systolic}/${r.diastolic}` : r.value != null ? String(r.value) : "—")
  const when = (iso: string, long = false) =>
    new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ })

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Monitor", "Monitor")}
          fallbackHref={`/${sessionId}/health`}
          action={
            <MobileIconButton onClick={openAdd} label={tr("Tambah bacaan", "Add reading")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Monitor Kesihatan", "Health Monitor")}
        homeHref={`/${sessionId}`}
        breadcrumbs={[{ label: tr("Kesihatan", "Health"), href: `/${sessionId}/health` }]}
        actions={
          <DesktopPageAction onClick={openAdd}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah bacaan", "Add reading")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <ModenHero
            label={
              <>
                <Activity size={16} />
                {metricName} · {tr("bacaan terkini", "latest reading")}
              </>
            }
            currency={null}
            amount={
              showSkeleton ? (
                "—"
              ) : current ? (
                <>
                  {fmtReading(current)}
                  <span className="ml-2 text-base font-semibold opacity-60">{current.unit || meta.unit}</span>
                </>
              ) : (
                "—"
              )
            }
            amountSize="clamp(2rem, 9vw, 2.75rem)"
            stats={[
              { key: "when", tone: "neutral", icon: <Clock size={15} strokeWidth={2.2} />, label: tr("Direkod", "Recorded"), value: current ? when(current.measured_at) : tr("Belum ada", "None yet") },
              { key: "count", tone: "neutral", icon: <Hash size={15} strokeWidth={2.2} />, label: tr("Bacaan", "Readings"), value: String(readings.length) },
            ]}
          />

          <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)} className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-semibold", metric === m.key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                {isBm ? m.labelBM : m.labelEN}
              </button>
            ))}
          </div>

          <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[var(--text)]">
                {tr("Trend", "Trend")} <span className="text-xs font-semibold text-[var(--muted)]">({meta.unit})</span>
              </h2>
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cn("h-8 rounded-full px-3 text-xs font-semibold", range === r ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border border-[var(--border)] text-[var(--muted)]")}>{r}</button>
                ))}
              </div>
            </div>
            {showSkeleton ? (
              <div className="h-44 animate-pulse rounded-[1.25rem] bg-[var(--surface-tint)]" />
            ) : loadFailed && !hasLoaded ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm font-bold text-[var(--text)]">{tr("Bacaan tidak dapat dimuatkan", "Readings could not be loaded")}</p>
                <button type="button" onClick={() => { setLoading(true); void loadReadings() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">{tr("Cuba lagi", "Try again")}</button>
              </div>
            ) : chartPoints.length ? (
              <>
                <MetricChart metricKey={metric} points={chartPoints} className="h-48 md:h-64" />
                <TrendStats values={chartPoints.map((p) => p.value).filter((v): v is number => v != null)} unit={metric === "bp" ? "" : meta.unit} isBm={isBm} />
              </>
            ) : (
              <div className="flex flex-col items-center rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-10 text-center">
                <LineChart size={26} className="text-[var(--muted)]" />
                <p className="mt-2 text-sm font-bold text-[var(--text)]">{tr("Tiada bacaan dalam julat ini", "No readings in this range")}</p>
                <button type="button" onClick={openAdd} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-5 text-xs font-semibold text-[var(--btn-primary-text)]">
                  <Plus size={14} />
                  {tr("Tambah bacaan", "Add reading")}
                </button>
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-base font-bold text-[var(--text)]">{tr("Senarai bacaan", "Readings")}</h2>
              <span className="text-xs font-semibold text-[var(--muted)]">{readings.length} {tr("rekod", "records")}</span>
            </div>
            {readings.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">{tr("Belum ada bacaan.", "No readings yet.")}</p>
            ) : (
              <ul className="space-y-2">
                {readings.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] py-3 pl-4 pr-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold tabular-nums text-[var(--text)]">
                        {fmtReading(r)} <span className="text-xs font-semibold text-[var(--muted)]">{r.unit || meta.unit}</span>
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">{when(r.measured_at, true)}{r.note ? ` · ${r.note}` : ""}</p>
                    </div>
                    <button type="button" onClick={() => openEdit(r)} aria-label={tr("Ubah", "Edit")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Pencil size={14} /></button>
                    <button type="button" onClick={() => deleteReading(r)} aria-label={tr("Padam", "Delete")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DesktopPageBody>

      <AppSheet
        open={sheet}
        onClose={close}
        id="health-reading-sheet"
        title={editing ? tr(`Ubah ${metricName}`, `Edit ${metricName}`) : tr(`Bacaan ${metricName}`, `${metricName} reading`)}
        size="md"
        footer={
          <button type="button" onClick={() => void saveReading()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Simpan", "Save")}
          </button>
        }
      >
        <form onSubmit={saveReading} className="space-y-4">
          {meta.fields.includes("value") && (
            <div>
              <label htmlFor="hr-value" className={label}>{tr("Nilai", "Value")} ({meta.unit})</label>
              <input id="hr-value" inputMode="decimal" value={form.value || ""} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") })} placeholder="0" className={field} />
            </div>
          )}
          {meta.fields.includes("systolic") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="hr-sys" className={label}>{tr("Sistolik", "Systolic")} (mmHg)</label>
                <input id="hr-sys" inputMode="numeric" value={form.systolic || ""} onChange={(e) => setForm({ ...form, systolic: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="120" className={field} />
              </div>
              <div>
                <label htmlFor="hr-dia" className={label}>{tr("Diastolik", "Diastolic")} (mmHg)</label>
                <input id="hr-dia" inputMode="numeric" value={form.diastolic || ""} onChange={(e) => setForm({ ...form, diastolic: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="80" className={field} />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="hr-at" className={label}>{tr("Tarikh dan masa", "Date and time")}</label>
            <input id="hr-at" type="datetime-local" max={toKlInput()} value={form.at || ""} onChange={(e) => setForm({ ...form, at: e.target.value })} className={field} />
          </div>
          <div>
            <label htmlFor="hr-note" className={label}>{tr("Nota (pilihan)", "Note (optional)")}</label>
            <input id="hr-note" value={form.note || ""} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} />
          </div>
          {editing && (
            <p className="text-xs text-[var(--muted)]">{tr("Jenis bacaan tidak boleh ditukar. Padam dan tambah semula jika salah.", "The reading type cannot be changed. Delete and add it again if it is wrong.")}</p>
          )}
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
