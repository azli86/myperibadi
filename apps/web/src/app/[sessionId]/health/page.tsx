"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Activity,
  Check,
  ChevronRight,
  Clock,
  HeartPulse,
  LineChart,
  Loader2,
  Pill,
  Plus,
  SkipForward,
  Stethoscope,
} from "lucide-react"
import { BmiGauge, HealthSparkline, METRIC_HEX } from "@/components/health/HealthCharts"
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

type Metric = {
  metric_type: string
  value?: number | null
  systolic?: number | null
  diastolic?: number | null
  unit?: string | null
  measured_at?: string | null
  label?: string | null
}

type Dashboard = {
  metrics: Metric[]
  bmi?: number | null
  bmi_category?: {
    key: string
    label_bm: string
    label_en: string
    color: string
  } | null
  height_cm?: number | null
  weight_kg?: number | null
}

type TodayItem = {
  medication_id: number
  name: string
  dosage?: string | null
  timing: string
  schedule_id?: number | null
  scheduled_time: string
  enabled: boolean
  status: string
  taken_at?: string | null
}

const METRIC_META: Record<string, { icon: React.ComponentType<any>; color: string; bm: string; en: string }> = {
  weight: { icon: Activity, color: "text-sky-500", bm: "Berat", en: "Weight" },
  bp: { icon: HeartPulse, color: "text-rose-500", bm: "Tekanan Darah", en: "Blood Pressure" },
  glucose: { icon: Activity, color: "text-violet-500", bm: "Gula Darah", en: "Blood Glucose" },
  pulse: { icon: HeartPulse, color: "text-amber-500", bm: "Denyutan Nadi", en: "Pulse" },
  spo2: { icon: Activity, color: "text-emerald-500", bm: "Oksigen Darah", en: "Blood Oxygen" },
  temperature: { icon: Stethoscope, color: "text-orange-500", bm: "Suhu Badan", en: "Body Temperature" },
  height: { icon: LineChart, color: "text-indigo-500", bm: "Tinggi", en: "Height" },
}

function fmtTime(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
}

function fmtMetric(m: Metric): string {
  if (m.metric_type === "bp") {
    if (m.systolic != null && m.diastolic != null) return `${m.systolic} / ${m.diastolic}`
    return m.value != null ? String(m.value) : "—"
  }
  return m.value != null ? String(m.value) : "—"
}

export default function HealthDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const { lang } = useLang()
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const isBm = lang === "BM"

  const [dash, setDash] = useState<Dashboard | null>(null)
  const [today, setToday] = useState<TodayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [tickingId, setTickingId] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [spark, setSpark] = useState<Record<string, Array<{ label: string; value: number }>>>({})
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)

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
  useEffect(() => setMounted(true), [])

  const loadAll = useCallback(async () => {
    if (!hasLoaded) setLoading(true)
    try {
      const headers = authHeaders()
      const [dRes, tRes] = await Promise.all([
        fetch("/api/health/dashboard", { headers, credentials: "include", cache: "no-store" }),
        fetch("/api/health/medications/today", { headers, credentials: "include", cache: "no-store" }),
      ])
      if (dRes.ok) {
        const d = await dRes.json()
        setDash(d)
        // fetch sparkline history for each metric that has a reading
        const metricKeys: string[] = Array.isArray(d?.metrics) ? d.metrics.map((m: Metric) => m.metric_type) : []
        if (metricKeys.length) {
          const sparkOut: Record<string, Array<{ label: string; value: number }>> = {}
          const results = await Promise.all(
            metricKeys.map(async (k) => {
              const r = await fetch(`/api/health/readings?metric=${k}&range=30d`, {
                headers,
                credentials: "include",
                cache: "no-store",
              })
              if (!r.ok) return { key: k, rows: [] as Metric[] }
              return { key: k, rows: (await r.json()) as Metric[] }
            }),
          )
          for (const res of results) {
            sparkOut[res.key] = [...res.rows]
              .reverse()
              .slice(-14)
              .map((m) => ({
                label: new Date(m.measured_at || "").toLocaleDateString([], { day: "2-digit", month: "2-digit" }),
                value: m.metric_type === "bp" && m.systolic != null ? m.systolic : (m.value ?? 0),
              }))
          }
          setSpark(sparkOut)
        }
      }
      if (tRes.ok) {
        const data = await tRes.json()
        setToday(Array.isArray(data) ? data : [])
      }
      setHasLoaded(true)
    } catch {
      showAlertRef.current(
        isBm ? "Ralat" : "Error",
        isBm ? "Gagal memuat data kesihatan." : "Failed to load health data.",
        "error",
      )
    } finally {
      setLoading(false)
    }
  }, [authHeaders, hasLoaded, isBm])

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tickDose = useCallback(
    async (item: TodayItem, status: string) => {
      if (!item.schedule_id) return
      setTickingId(item.schedule_id)
      try {
        const res = await fetch(`/api/health/medications/${item.medication_id}/doses`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ schedule_id: item.schedule_id, status }),
        })
        if (!res.ok) throw new Error()
        await loadAll()
      } catch {
        showAlertRef.current(
          isBm ? "Ralat" : "Error",
          isBm ? "Gagal kemas kini ubat." : "Failed to update medication.",
          "error",
        )
      } finally {
        setTickingId(null)
      }
    },
    [authHeaders, loadAll, isBm],
  )

  const statusBadge = (status: string) => {
    if (status === "taken")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500">
          <Check size={12} strokeWidth={3} />
          {isBm ? "Sudah Ambil" : "Taken"}
        </span>
      )
    if (status === "skipped")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-bold text-slate-400">
          <SkipForward size={12} />
          {isBm ? "Skip" : "Skipped"}
        </span>
      )
    if (status === "missed")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-500">
          ⚠ {isBm ? "Terlepas" : "Missed"}
        </span>
      )
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-500">
        ○ {isBm ? "Belum Ambil" : "Pending"}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="md:hidden">
        <MobilePageHeader
          className="border-b border-[color:var(--border)] pb-4"
          title={isBm ? "Kesihatan" : "Health"}
          beta
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton label={isBm ? "Tambah bacaan" : "Add reading"} onClick={() => router.push(`/${sessionId}/health/readings`)}>
              <Plus />
            </MobileIconButton>
          }
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={isBm ? "Kesihatan" : "Health"}
          beta
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={() => router.push(`/${sessionId}/health/readings`)}>
              <Plus />
              {isBm ? "Tambah Bacaan" : "Add Reading"}
            </DesktopPageAction>
          }
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="space-y-5 px-1 pb-24 pt-1 md:hidden">
        {showDataSkeleton ? (
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-[1.85rem] bg-[var(--card)]" />
            <div className="h-20 animate-pulse rounded-2xl bg-[var(--card)]" />
          </div>
        ) : (
          <>
            {/* Mobile hero — flat / cardless */}
            <section className="relative">
              <div className="relative z-10 space-y-4">
                {dash?.bmi != null ? (
                  <>
                    {/* Speedometer gauge */}
                    <div className="mx-auto -mt-1 max-w-[320px]">
                      <BmiGauge bmi={dash.bmi} category={dash.bmi_category} heightCm={dash.height_cm} isBm={isBm} />
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      {dash.weight_kg != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)]">
                          ⬇ {dash.weight_kg} kg
                        </span>
                      )}
                      {dash.height_cm != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)]">
                          ↔ {dash.height_cm} cm
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)]">
                        {dash?.metrics?.length ?? 0} {isBm ? "bacaan" : "readings"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)]">
                        {today.length} {isBm ? "ubat" : "meds"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)]">
                      <HeartPulse className="h-7 w-7 text-[var(--muted)]" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[var(--text)]">
                        {isBm ? "Indeks Jisim Badan" : "Body Mass Index"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {isBm ? "Tambah berat & tinggi untuk kira BMI" : "Add weight & height to compute BMI"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Quick sub-module links */}
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { label: isBm ? "Monitor" : "Monitor", href: `/${sessionId}/health/readings`, icon: LineChart, hex: "#0ea5e9" },
                    { label: isBm ? "Ubat" : "Meds", href: `/${sessionId}/health/medications`, icon: Pill, hex: "#10b981" },
                    { label: isBm ? "Sejarah" : "History", href: `/${sessionId}/health/history`, icon: Activity, hex: "#8b5cf6" },
                  ].map((m) => (
                    <button
                      key={m.href}
                      type="button"
                      onClick={() => router.push(m.href)}
                      className="group flex min-h-20 flex-col items-center justify-center gap-2 rounded-[var(--m3-shape-lg)] bg-[var(--card)] px-2 py-3 shadow-[var(--shadow-soft)] transition active:scale-[0.97]"
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${m.hex}1f`, color: m.hex }}
                      >
                        <m.icon size={17} />
                      </span>
                      <span className="text-[11px] font-bold text-[var(--text)]">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Monitor Kesihatan — flat */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
                  <Stethoscope size={18} className="text-[var(--accent2)]" />
                  {isBm ? "Monitor Kesihatan" : "Health Monitor"}
                </h2>
              </div>
              {!dash?.metrics?.length ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  {isBm ? "Belum ada bacaan. Tambah bacaan pertama anda." : "No readings yet. Add your first reading."}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {dash.metrics.map((m) => {
                    const meta = METRIC_META[m.metric_type] || { icon: Activity, color: "text-sky-500", bm: m.label || m.metric_type, en: m.label || m.metric_type }
                    const Icon = meta.icon
                    const hex = METRIC_HEX[m.metric_type] || "#3b82f6"
                    const sparkPoints = spark[m.metric_type] || []
                    return (
                      <button
                        key={m.metric_type}
                        type="button"
                        onClick={() => router.push(`/${sessionId}/health/readings?metric=${m.metric_type}`)}
                        className="min-h-32 rounded-[var(--m3-shape-lg)] bg-[var(--card)] p-3.5 text-left shadow-[var(--shadow-soft)] transition active:scale-[0.98]"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${hex}1f`, color: hex }}
                          >
                            <Icon size={14} />
                          </span>
                          {m.measured_at && (
                            <span className="text-[10px] font-semibold text-[var(--muted)]">{fmtTime(m.measured_at)}</span>
                          )}
                        </div>
                        <div className="mt-2 text-base font-black text-[var(--text)]">
                          {fmtMetric(m)}
                          {m.metric_type !== "bp" && m.unit && m.value != null ? (
                            <span className="ml-1 text-[11px] font-semibold text-[var(--muted)]">{m.unit}</span>
                          ) : null}
                        </div>
                        <div className="text-[10px] font-semibold text-[var(--muted)]">{isBm ? meta.bm : meta.en}</div>
                        {sparkPoints.length > 1 && (
                          <div className="mt-2">
                            <HealthSparkline points={sparkPoints} color={hex} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Ubat Hari Ini — flat */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
                  <Pill size={18} className="text-[var(--accent2)]" />
                  {isBm ? "Ubat Hari Ini" : "Today's Medications"}
                </h2>
                <Link
                  href={`/${sessionId}/health/medications`}
                  className="flex items-center text-xs font-bold text-[var(--accent2)]"
                >
                  {isBm ? "Urus" : "Manage"}
                  <ChevronRight size={14} />
                </Link>
              </div>
              {!today.length ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  {isBm ? "Tiada ubat untuk hari ini." : "No medications for today."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {today.map((item) => (
                    <li
                      key={`${item.medication_id}-${item.schedule_id}`}
                      className="flex min-h-16 items-center gap-3 rounded-[var(--m3-shape-lg)] bg-[var(--card)] p-3.5 shadow-[var(--shadow-soft)]"
                    >
                      <button
                        type="button"
                        onClick={() => tickDose(item, "taken")}
                        disabled={tickingId === item.schedule_id || item.status === "taken"}
                        aria-label={isBm ? "Tandakan sudah ambil" : "Mark as taken"}
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition active:scale-95 disabled:opacity-60",
                          item.status === "taken"
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-[var(--border)] text-transparent",
                        )}
                      >
                        {tickingId === item.schedule_id ? (
                          <Loader2 size={14} className="animate-spin text-[var(--muted)]" />
                        ) : (
                          <Check size={14} strokeWidth={3} />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                          <Clock size={13} className="shrink-0 text-[var(--muted)]" />
                          {item.scheduled_time}
                          <span className="truncate">{item.name}</span>
                          {item.dosage ? (
                            <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">{item.dosage}</span>
                          ) : null}
                        </div>
                        <div className="mt-1">{statusBadge(item.status)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {/* ── DESKTOP VIEW ── */}
      <div className="hidden md:block">
        <DesktopPageBody>
        {showDataSkeleton ? (
          <div className="space-y-3 p-4">
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--card)]" />
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--card)]" />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[1180px] space-y-6 p-6 xl:px-8">
            {/* BMI speedometer card */}
            <section className="overflow-hidden rounded-[var(--m3-shape-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]">
              {dash?.bmi != null ? (
                <div className="grid min-h-[310px] grid-cols-[minmax(400px,1.15fr)_minmax(340px,0.85fr)]">
                  <div className="flex flex-col justify-center border-r border-[var(--border)] px-8 py-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                      {isBm ? "Indeks Jisim Badan" : "Body Mass Index"}
                    </p>
                    <div className="mx-auto w-full max-w-[390px]">
                      <BmiGauge bmi={dash.bmi} category={dash.bmi_category} heightCm={dash.height_cm} isBm={isBm} />
                    </div>
                  </div>

                  <div className="flex flex-col justify-center px-7 py-6">
                    <div className="mb-4">
                      <p className="text-lg font-black text-[var(--text)]">
                        {isBm ? "Ringkasan Kesihatan" : "Health Summary"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {isBm ? "Maklumat terkini daripada rekod anda" : "Latest information from your records"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: isBm ? "Berat" : "Weight", value: dash.weight_kg ?? "—", unit: dash.weight_kg != null ? "kg" : "" },
                        { label: isBm ? "Tinggi" : "Height", value: dash.height_cm ?? "—", unit: dash.height_cm != null ? "cm" : "" },
                        { label: isBm ? "Bacaan" : "Readings", value: dash.metrics?.length ?? 0, unit: "" },
                        { label: isBm ? "Ubat Hari Ini" : "Meds Today", value: today.length, unit: "" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[var(--m3-shape-lg)] bg-[var(--page-bg)] p-5">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{item.label}</div>
                          <div className="mt-1 text-2xl font-black text-[var(--text)]">
                            {item.value}{item.unit && <span className="ml-1 text-xs font-bold text-[var(--muted)]">{item.unit}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <HeartPulse className="h-8 w-8 text-[var(--muted)]" />
                  <p className="text-sm font-black text-[var(--text)]">
                    {isBm ? "Indeks Jisim Badan" : "Body Mass Index"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {isBm ? "Tambah berat & tinggi untuk kira BMI" : "Add weight & height to compute BMI"}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-[var(--m3-shape-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-soft)]">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
                  <Stethoscope size={18} className="text-[var(--accent2)]" />
                  {isBm ? "Monitor Kesihatan" : "Health Monitor"}
                </h2>
              </div>
              {!dash?.metrics?.length ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  {isBm ? "Belum ada bacaan. Tambah bacaan pertama anda." : "No readings yet. Add your first reading."}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {dash.metrics.map((m) => {
                    const meta = METRIC_META[m.metric_type] || { icon: Activity, color: "text-sky-500", bm: m.label || m.metric_type, en: m.label || m.metric_type }
                    const Icon = meta.icon
                    const hex = METRIC_HEX[m.metric_type] || "#3b82f6"
                    const sparkPoints = spark[m.metric_type] || []
                    return (
                      <button
                        key={m.metric_type}
                        type="button"
                        onClick={() => router.push(`/${sessionId}/health/readings?metric=${m.metric_type}`)}
                        className="min-h-36 rounded-[var(--m3-shape-lg)] bg-[var(--page-bg)] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-xl"
                            style={{ backgroundColor: `${hex}1f`, color: hex }}
                          >
                            <Icon size={15} />
                          </span>
                          {m.measured_at && (
                            <span className="text-[10px] font-semibold text-[var(--muted)]">{fmtTime(m.measured_at)}</span>
                          )}
                        </div>
                        <div className="mt-2.5 text-xl font-black text-[var(--text)]">
                          {fmtMetric(m)}
                          {m.metric_type !== "bp" && m.unit && m.value != null ? (
                            <span className="ml-1 text-xs font-semibold text-[var(--muted)]">{m.unit}</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] font-semibold text-[var(--muted)]">{isBm ? meta.bm : meta.en}</div>
                        {sparkPoints.length > 1 && (
                          <div className="mt-2">
                            <HealthSparkline points={sparkPoints} color={hex} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[var(--m3-shape-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-soft)]">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
                  <Pill size={18} className="text-[var(--accent2)]" />
                  {isBm ? "Ubat Hari Ini" : "Today's Medications"}
                </h2>
                <Link
                  href={`/${sessionId}/health/medications`}
                  className="flex items-center text-xs font-bold text-[var(--accent2)]"
                >
                  {isBm ? "Urus" : "Manage"}
                  <ChevronRight size={14} />
                </Link>
              </div>
              {!today.length ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  {isBm ? "Tiada ubat untuk hari ini." : "No medications for today."}
                </p>
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {today.map((item) => (
                    <li
                      key={`${item.medication_id}-${item.schedule_id}`}
                      className="flex min-h-20 items-center gap-3 rounded-[var(--m3-shape-lg)] bg-[var(--page-bg)] p-4"
                    >
                      <button
                        type="button"
                        onClick={() => tickDose(item, "taken")}
                        disabled={tickingId === item.schedule_id || item.status === "taken"}
                        aria-label={isBm ? "Tandakan sudah ambil" : "Mark as taken"}
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition active:scale-95 disabled:opacity-60",
                          item.status === "taken"
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-[var(--border)] text-transparent",
                        )}
                      >
                        {tickingId === item.schedule_id ? (
                          <Loader2 size={14} className="animate-spin text-[var(--muted)]" />
                        ) : (
                          <Check size={14} strokeWidth={3} />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                          <Clock size={13} className="shrink-0 text-[var(--muted)]" />
                          {item.scheduled_time}
                          <span className="truncate">{item.name}</span>
                          {item.dosage ? (
                            <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">{item.dosage}</span>
                          ) : null}
                        </div>
                        <div className="mt-1">{statusBadge(item.status)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        </DesktopPageBody>
      </div>
      {alertModal}
    </div>
  )
}
