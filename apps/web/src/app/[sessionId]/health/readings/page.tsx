"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import {
  Activity,
  HeartPulse,
  LineChart,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
} from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSearchParams } from "next/navigation"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { MetricChart, TrendStats, METRIC_HEX } from "@/components/health/HealthCharts"

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

const METRICS: { key: string; labelBM: string; labelEN: string; unit: string; fields: string[] }[] = [
  { key: "weight", labelBM: "Berat", labelEN: "Weight", unit: "kg", fields: ["value"] },
  { key: "height", labelBM: "Tinggi", labelEN: "Height", unit: "cm", fields: ["value"] },
  { key: "bp", labelBM: "Tekanan Darah", labelEN: "Blood Pressure", unit: "mmHg", fields: ["systolic", "diastolic"] },
  { key: "glucose", labelBM: "Gula Darah", labelEN: "Glucose", unit: "mmol/L", fields: ["value"] },
  { key: "pulse", labelBM: "Denyutan Nadi", labelEN: "Pulse", unit: "BPM", fields: ["value"] },
  { key: "spo2", labelBM: "SpO₂", labelEN: "SpO₂", unit: "%", fields: ["value"] },
  { key: "temperature", labelBM: "Suhu", labelEN: "Temperature", unit: "°C", fields: ["value"] },
]

const RANGES = ["7d", "30d", "3m", "1y"]

export default function HealthReadingsPage() {
  const params = useParams()
  const { lang } = useLang()
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const isBm = lang === "BM"

  // Deep-link support: /health/readings?metric=bp
  const searchParams = useSearchParams()
  const initialMetric = searchParams.get("metric")
  const [metric, setMetricState] = useState(
    initialMetric && METRICS.some((m) => m.key === initialMetric) ? initialMetric : "weight",
  )
  const setMetric = useCallback((k: string) => {
    setMetricState(k)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("metric", k)
      window.history.replaceState(null, "", url.toString())
    }
  }, [])
  const [range, setRange] = useState("30d")
  const [readings, setReadings] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Reading | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const sheetOpen = showAdd || editing != null
  const [mounted, setMounted] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)
  const addSwipe = useSwipeDownToClose(() => {
    setShowAdd(false)
    setEditing(null)
  })

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm({})
    setShowAdd(true)
  }, [])

  const openEdit = useCallback((r: Reading) => {
    const f: Record<string, string> = {}
    if (r.value != null) f.value = String(r.value)
    if (r.systolic != null) f.systolic = String(r.systolic)
    if (r.diastolic != null) f.diastolic = String(r.diastolic)
    if (r.note) f.note = r.note
    setForm(f)
    setEditing(r)
    setShowAdd(false)
  }, [])

  const closeSheet = useCallback(() => {
    setShowAdd(false)
    setEditing(null)
  }, [])

  const meta = useMemo(() => METRICS.find((m) => m.key === metric) || METRICS[0], [metric])
  const currentReading = readings[0]

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) return { Authorization: `Bearer ${token}` }
    return {}
  }, [])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])
  useEffect(() => setMounted(true), [])

  const loadReadings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/health/readings?metric=${metric}&range=${range}`, {
        headers: authHeaders(),
        credentials: "include",
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        setReadings(Array.isArray(data) ? data : [])
      }
      setHasLoaded(true)
    } catch {
      showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal memuat bacaan." : "Failed to load readings.", "error")
    } finally {
      setLoading(false)
    }
  }, [authHeaders, metric, range, isBm])

  useEffect(() => {
    void loadReadings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, range])

  const saveReading = useCallback(async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (meta.fields.includes("value") && form.value) body.value = parseFloat(form.value)
      if (meta.fields.includes("systolic") && form.systolic) body.systolic = parseFloat(form.systolic)
      if (meta.fields.includes("diastolic") && form.diastolic) body.diastolic = parseFloat(form.diastolic)
      if (form.note) body.note = form.note
      const isEdit = editing != null
      const res = await fetch(
        isEdit ? `/api/health/readings/${editing.id}` : "/api/health/readings",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(isEdit ? body : { metric_type: metric, ...body }),
        },
      )
      if (!res.ok) throw new Error()
      setForm({})
      closeSheet()
      await loadReadings()
    } catch {
      showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal simpan bacaan." : "Failed to save reading.", "error")
    } finally {
      setSaving(false)
    }
  }, [authHeaders, meta, metric, form, editing, closeSheet, loadReadings, isBm])

  const deleteReading = useCallback(
    async (r: Reading) => {
      if (!confirm(isBm ? `Padam bacaan ini?` : "Delete this reading?")) return
      try {
        const res = await fetch(`/api/health/readings/${r.id}`, {
          method: "DELETE",
          headers: authHeaders(),
          credentials: "include",
        })
        if (!res.ok) throw new Error()
        await loadReadings()
      } catch {
        showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal padam bacaan." : "Failed to delete reading.", "error")
      }
    },
    [authHeaders, loadReadings, isBm],
  )

  const chartPoints = useMemo(() => {
    if (!readings.length) return []
    const sorted = [...readings].reverse()
    return sorted.map((r) => ({
      id: r.id,
      label: new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit" }),
      value: metric === "bp" && r.systolic != null ? r.systolic : (r.value ?? undefined),
      systolic: r.systolic ?? undefined,
      diastolic: r.diastolic ?? undefined,
    }))
  }, [readings, metric])

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="md:hidden">
        <MobilePageHeader
          className="border-b border-[color:var(--border)] pb-4"
          title={isBm ? "Monitor" : "Monitor"}
          fallbackHref={`/${sessionId}/health`}
          action={
            <MobileIconButton label={isBm ? "Tambah bacaan" : "Add reading"} onClick={openAdd}>
              <Plus />
            </MobileIconButton>
          }
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={isBm ? "Monitor Kesihatan" : "Health Monitor"}
          homeHref={`/${sessionId}`}
          breadcrumbs={[{ label: isBm ? "Kesihatan" : "Health", href: `/${sessionId}/health` }]}
          actions={
            <DesktopPageAction onClick={openAdd}>
              <Plus />
              {isBm ? "Tambah" : "Add"}
            </DesktopPageAction>
          }
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="space-y-5 px-1 pb-28 pt-1 md:hidden">
        {/* Metric picker */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 py-2 text-xs font-bold transition active:scale-95",
                metric === m.key
                  ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                  : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]",
              )}
            >
              {isBm ? m.labelBM : m.labelEN}
            </button>
          ))}
        </div>

        <section className="overflow-hidden rounded-[1.75rem] bg-[var(--text)] p-5 text-[var(--bg)] shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">{isBm ? "Bacaan Terkini" : "Current Reading"}</p>
              {currentReading ? (
                <div className="mt-2 text-4xl font-black tracking-tight">
                  {metric === "bp" && currentReading.systolic != null && currentReading.diastolic != null
                    ? `${currentReading.systolic} / ${currentReading.diastolic}`
                    : currentReading.value}
                  <span className="ml-2 text-sm font-bold opacity-60">{currentReading.unit || meta.unit}</span>
                </div>
              ) : (
                <p className="mt-3 text-lg font-black">{isBm ? "Belum ada bacaan" : "No reading yet"}</p>
              )}
              <p className="mt-1 text-sm font-bold opacity-75">{isBm ? meta.labelBM : meta.labelEN}</p>
            </div>
            <Activity className="h-7 w-7 opacity-60" />
          </div>
          <div className="mt-5 flex items-end justify-between gap-3 border-t border-current/15 pt-3 text-xs opacity-70">
            <span className="truncate">{currentReading?.note || (currentReading ? (isBm ? "Tiada nota" : "No note") : (isBm ? "Tambah bacaan pertama anda" : "Add your first reading"))}</span>
            {currentReading ? <time className="shrink-0">{new Date(currentReading.measured_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</time> : null}
          </div>
        </section>

        {/* Chart */}
        <section className="rounded-[1.75rem] bg-[var(--card)] p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                {isBm ? "Trend" : "Trend"}
              </p>
              <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
                {isBm ? meta.labelBM : meta.labelEN}
                {meta.unit ? <span className="ml-1 text-xs font-semibold text-[var(--muted)]">({meta.unit})</span> : null}
              </h2>
            </div>
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px] font-bold transition",
                    range === r ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--page-bg)] text-[var(--muted)]",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {showDataSkeleton ? (
            <div className="h-44 animate-pulse rounded-xl bg-[var(--page-bg)]" />
          ) : chartPoints.length ? (
            <>
              <MetricChart metricKey={metric} points={chartPoints} className="h-48" />
              <TrendStats
                values={chartPoints.map((p) => p.value ?? 0).filter((v) => v != null)}
                unit={metric === "bp" ? "" : meta.unit}
                isBm={isBm}
              />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
              <LineChart size={26} className="mx-auto text-[var(--muted)]" />
              <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                {isBm ? "Tiada bacaan untuk julat ini" : "No readings for this range"}
              </p>
              <button
                type="button"
                onClick={openAdd}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-4 py-2 text-xs font-bold text-[var(--bg)] transition active:scale-95"
              >
                <Plus size={14} />
                {isBm ? "Tambah Bacaan" : "Add Reading"}
              </button>
            </div>
          )}
        </section>

        {/* Reading list */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-base font-black text-[var(--text)]">{isBm ? "Senarai Bacaan" : "Readings"}</h2>
            <span className="text-xs font-semibold text-[var(--muted)]">{readings.length} {isBm ? "rekod" : "records"}</span>
          </div>
          {!readings.length ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              {isBm ? "Belum ada bacaan." : "No readings yet."}
            </p>
          ) : (
            <ul className="space-y-2">
              {readings.map((r) => (
                <li
                  key={r.id}
                  className="flex min-h-20 items-center justify-between gap-3 rounded-[1.35rem] bg-[var(--card)] p-4 shadow-sm"
                >
                  <div>
                    <div className="text-sm font-bold text-[var(--text)]">
                      {metric === "bp" && r.systolic != null && r.diastolic != null
                        ? `${r.systolic} / ${r.diastolic}`
                        : r.value != null
                          ? `${r.value}`
                          : "—"}
                      <span className="ml-1 text-xs font-semibold text-[var(--muted)]">{r.unit}</span>
                    </div>
                    {r.note ? <div className="text-xs text-[var(--muted)]">{r.note}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <div className="text-right text-xs text-[var(--muted)]">
                      {new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}{" "}
                      {new Date(r.measured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </div>
                    <button
                      onClick={() => openEdit(r)}
                      className="rounded-lg p-1.5 text-[var(--muted)] transition hover:text-[var(--accent2)]"
                      aria-label={isBm ? "Edit" : "Edit"}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => deleteReading(r)}
                      className="rounded-lg p-1.5 text-[var(--muted)] transition hover:text-rose-500"
                      aria-label={isBm ? "Padam" : "Delete"}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── DESKTOP VIEW ── */}
      <div className="hidden md:block">
        <DesktopPageBody>
        <div className="mx-auto w-full max-w-[1180px] space-y-6 p-6 xl:px-8">
          <div className="flex gap-2 overflow-x-auto rounded-2xl bg-[var(--card)] p-2 shadow-sm">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  "min-h-10 shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition",
                  metric === m.key
                    ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                    : "bg-[var(--card)] text-[var(--muted)]",
                )}
              >
                {isBm ? m.labelBM : m.labelEN}
              </button>
            ))}
          </div>

          <section className="grid min-h-52 grid-cols-[1fr_auto] overflow-hidden rounded-[2rem] bg-[var(--text)] p-8 text-[var(--bg)] shadow-sm">
            <div className="flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-60">{isBm ? "Bacaan Terkini" : "Current Reading"}</p>
                {currentReading ? (
                  <div className="mt-3 text-6xl font-black tracking-tight">
                    {metric === "bp" && currentReading.systolic != null && currentReading.diastolic != null
                      ? `${currentReading.systolic} / ${currentReading.diastolic}`
                      : currentReading.value}
                    <span className="ml-3 text-base font-bold opacity-60">{currentReading.unit || meta.unit}</span>
                  </div>
                ) : (
                  <p className="mt-4 text-3xl font-black">{isBm ? "Belum ada bacaan" : "No reading yet"}</p>
                )}
                <p className="mt-2 text-lg font-bold opacity-75">{isBm ? meta.labelBM : meta.labelEN}</p>
              </div>
              <div className="flex gap-6 text-sm opacity-65">
                {currentReading ? <time>{new Date(currentReading.measured_at).toLocaleString([], { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time> : null}
                <span>{currentReading?.note || (currentReading ? (isBm ? "Tiada nota" : "No note") : (isBm ? "Tambah bacaan pertama anda" : "Add your first reading"))}</span>
              </div>
            </div>
            <Activity className="h-12 w-12 opacity-50" />
          </section>

          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {isBm ? "Trend" : "Trend"}
                  </p>
                  <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
                    {isBm ? meta.labelBM : meta.labelEN}
                    {meta.unit ? <span className="ml-1 text-xs font-semibold text-[var(--muted)]">({meta.unit})</span> : null}
                  </h2>
                </div>
                <div className="flex gap-1">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-bold transition",
                        range === r ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--card)] text-[var(--muted)]",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {showDataSkeleton ? (
                <div className="h-44 animate-pulse rounded-xl bg-[var(--page-bg)]" />
              ) : chartPoints.length ? (
                <>
                  <MetricChart metricKey={metric} points={chartPoints} className="h-72" />
                  <TrendStats
                    values={chartPoints.map((p) => p.value ?? 0).filter((v) => v != null)}
                    unit={metric === "bp" ? "" : meta.unit}
                    isBm={isBm}
                  />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
                  <LineChart size={26} className="mx-auto text-[var(--muted)]" />
                  <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                    {isBm ? "Tiada bacaan untuk julat ini" : "No readings for this range"}
                  </p>
                  <button
                    type="button"
                    onClick={openAdd}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2 text-xs font-bold text-[var(--btn-primary-text)] transition hover:opacity-90"
                  >
                    <Plus size={14} />
                    {isBm ? "Tambah Bacaan" : "Add Reading"}
                  </button>
                </div>
              )}
            </section>

          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <h2 className="mb-4 text-base font-black text-[var(--text)]">{isBm ? "Senarai Bacaan" : "Readings"}</h2>
            {!readings.length ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">
                {isBm ? "Belum ada bacaan." : "No readings yet."}
              </p>
            ) : (
              <ul className="space-y-2">
                {readings.map((r) => (
                  <li
                    key={r.id}
                    className="flex min-h-20 items-center justify-between rounded-[1.35rem] bg-[var(--page-bg)] p-4"
                  >
                    <div>
                      <div className="text-sm font-bold text-[var(--text)]">
                        {metric === "bp" && r.systolic != null && r.diastolic != null
                          ? `${r.systolic} / ${r.diastolic}`
                          : r.value != null
                            ? `${r.value}`
                            : "—"}
                        <span className="ml-1 text-xs font-semibold text-[var(--muted)]">{r.unit}</span>
                      </div>
                      {r.note ? <div className="text-xs text-[var(--muted)]">{r.note}</div> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="text-xs text-[var(--muted)]">
                        {new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                        {new Date(r.measured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </div>
                      <button
                        onClick={() => openEdit(r)}
                        className="rounded-lg p-1.5 text-[var(--muted)] transition hover:text-[var(--accent2)]"
                        aria-label={isBm ? "Edit" : "Edit"}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => deleteReading(r)}
                        className="rounded-lg p-1.5 text-[var(--muted)] transition hover:text-rose-500"
                        aria-label={isBm ? "Padam" : "Delete"}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        </DesktopPageBody>
      </div>

      {/* Add/Edit reading sheet */}
      {sheetOpen ? (
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-[var(--overlay)] p-0 sm:items-center"
          onClick={closeSheet}
          onTouchMove={(e) => e.preventDefault()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-swipe-sheet
            {...addSwipe}
            className="app-sheet-panel app-sheet-panel--lg w-full max-h-[90dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[32rem] sm:rounded-2xl"
          >
            <AppSheetHeader
              title={editing ? (isBm ? "Edit Bacaan" : "Edit Reading") : isBm ? "Tambah Bacaan" : "Add Reading"}
              eyebrow={isBm ? meta.labelBM : meta.labelEN}
              onClose={closeSheet}
              action={
                <button
                  type="button"
                  onClick={saveReading}
                  disabled={saving}
                  className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
                >
                  {saving ? (isBm ? "Menyimpan…" : "Saving…") : isBm ? "Simpan" : "Save"}
                </button>
              }
            />
            <div className="space-y-3 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
              {meta.fields.includes("value") && (
                <Field
                  label={isBm ? "Nilai" : "Value"}
                  suffix={meta.unit}
                  value={form.value || ""}
                  onChange={(v) => setForm((f) => ({ ...f, value: v }))}
                />
              )}
              {meta.fields.includes("systolic") && (
                <Field
                  label="Systolic"
                  suffix="mmHg"
                  value={form.systolic || ""}
                  onChange={(v) => setForm((f) => ({ ...f, systolic: v }))}
                />
              )}
              {meta.fields.includes("diastolic") && (
                <Field
                  label="Diastolic"
                  suffix="mmHg"
                  value={form.diastolic || ""}
                  onChange={(v) => setForm((f) => ({ ...f, diastolic: v }))}
                />
              )}
              <Field
                label={isBm ? "Nota (pilihan)" : "Note (optional)"}
                text
                value={form.note || ""}
                onChange={(v) => setForm((f) => ({ ...f, note: v }))}
              />
            </div>
          </div>
        </div>
      ) : null}
      {alertModal}
    </div>
  )
}

function Field({
  label,
  suffix,
  value,
  onChange,
  text = false,
}: {
  label: string
  suffix?: string
  value: string
  onChange: (v: string) => void
  text?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-[var(--muted)]">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={text ? "text" : "number"}
          inputMode={text ? "text" : "decimal"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="min-h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3 text-base text-[var(--text)] outline-none focus:border-[var(--accent2)]"
        />
        {suffix ? <span className="shrink-0 text-xs font-bold text-[var(--muted)]">{suffix}</span> : null}
      </div>
    </div>
  )
}
