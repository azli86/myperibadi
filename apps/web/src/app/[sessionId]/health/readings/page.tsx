"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import {
  Activity,
  HeartPulse,
  LineChart,
  Plus,
  Stethoscope,
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
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [mounted, setMounted] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)
  const addSwipe = useSwipeDownToClose(() => setShowAdd(false))

  const meta = useMemo(() => METRICS.find((m) => m.key === metric) || METRICS[0], [metric])

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
      const body: Record<string, unknown> = { metric_type: metric }
      if (meta.fields.includes("value") && form.value) body.value = parseFloat(form.value)
      if (meta.fields.includes("systolic") && form.systolic) body.systolic = parseFloat(form.systolic)
      if (meta.fields.includes("diastolic") && form.diastolic) body.diastolic = parseFloat(form.diastolic)
      if (form.note) body.note = form.note
      const res = await fetch("/api/health/readings", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setForm({})
      setShowAdd(false)
      await loadReadings()
    } catch {
      showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal simpan bacaan." : "Failed to save reading.", "error")
    } finally {
      setSaving(false)
    }
  }, [authHeaders, meta, metric, form, loadReadings, isBm])

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
            <MobileIconButton label={isBm ? "Tambah bacaan" : "Add reading"} onClick={() => setShowAdd(true)}>
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
            <DesktopPageAction onClick={() => setShowAdd(true)}>
              <Plus />
              {isBm ? "Tambah" : "Add"}
            </DesktopPageAction>
          }
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="md:hidden px-1 pb-24 pt-1 space-y-4">
        {/* Metric picker */}
        <div className="flex flex-wrap items-center gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95",
                metric === m.key
                  ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                  : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]",
              )}
            >
              {isBm ? m.labelBM : m.labelEN}
            </button>
          ))}
        </div>

        {/* Chart */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
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
                onClick={() => setShowAdd(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-4 py-2 text-xs font-bold text-[var(--bg)] transition active:scale-95"
              >
                <Plus size={14} />
                {isBm ? "Tambah Bacaan" : "Add Reading"}
              </button>
            </div>
          )}
        </section>

        {/* Reading list */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h2 className="mb-3 text-base font-black text-[var(--text)]">{isBm ? "Senarai Bacaan" : "Readings"}</h2>
          {!readings.length ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              {isBm ? "Belum ada bacaan." : "No readings yet."}
            </p>
          ) : (
            <ul className="space-y-2">
              {readings.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-3"
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
                  <div className="shrink-0 text-xs text-[var(--muted)]">
                    {new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}{" "}
                    {new Date(r.measured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
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
        <div className="mx-auto w-full max-w-[900px] space-y-4 p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition",
                  metric === m.key
                    ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                    : "bg-[var(--card)] text-[var(--muted)]",
                )}
              >
                {isBm ? m.labelBM : m.labelEN}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-bold transition",
                  range === r ? "bg-[var(--accent2)] text-white" : "bg-[var(--card)] text-[var(--muted)]",
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
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
                <MetricChart metricKey={metric} points={chartPoints} className="h-52" />
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
                  onClick={() => setShowAdd(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2 text-xs font-bold text-[var(--btn-primary-text)] transition hover:opacity-90"
                >
                  <Plus size={14} />
                  {isBm ? "Tambah Bacaan" : "Add Reading"}
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <h2 className="mb-3 text-base font-black text-[var(--text)]">{isBm ? "Senarai Bacaan" : "Readings"}</h2>
            {!readings.length ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">
                {isBm ? "Belum ada bacaan." : "No readings yet."}
              </p>
            ) : (
              <ul className="space-y-2">
                {readings.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-3"
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
                    <div className="text-xs text-[var(--muted)]">
                      {new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                      {new Date(r.measured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        </DesktopPageBody>
      </div>

      {/* Add reading sheet */}
      {showAdd ? (
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-[var(--overlay)] p-0 sm:items-center"
          onClick={() => setShowAdd(false)}
          onTouchMove={(e) => e.preventDefault()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-swipe-sheet
            {...addSwipe}
            className="app-sheet-panel app-sheet-panel--lg w-full max-h-[90dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[32rem] sm:rounded-2xl"
          >
            <AppSheetHeader
              title={isBm ? "Tambah Bacaan" : "Add Reading"}
              eyebrow={isBm ? meta.labelBM : meta.labelEN}
              onClose={() => setShowAdd(false)}
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
}: {
  label: string
  suffix?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-[var(--muted)]">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent2)]"
        />
        {suffix ? <span className="shrink-0 text-xs font-bold text-[var(--muted)]">{suffix}</span> : null}
      </div>
    </div>
  )
}
