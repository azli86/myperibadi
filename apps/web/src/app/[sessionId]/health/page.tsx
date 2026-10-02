"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Footprints,
  HeartPulse,
  History,
  LineChart,
  Loader2,
  Pill,
  Plus,
  RefreshCw,
  SkipForward,
  Stethoscope,
  Undo2,
} from "lucide-react"
import { BmiGauge, HealthSparkline } from "@/components/health/HealthCharts"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { ModenHero, ModenHeroPill, heroPrimaryButtonStyle } from "@/components/ui/ModenHero"
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
  overdue?: boolean
  taken_at?: string | null
}

const METRIC_META: Record<string, { icon: React.ComponentType<any>; bm: string; en: string }> = {
  weight: { icon: Activity, bm: "Berat", en: "Weight" },
  bp: { icon: HeartPulse, bm: "Tekanan darah", en: "Blood pressure" },
  glucose: { icon: Activity, bm: "Gula darah", en: "Blood glucose" },
  pulse: { icon: HeartPulse, bm: "Denyutan nadi", en: "Pulse" },
  spo2: { icon: Activity, bm: "Oksigen darah", en: "Blood oxygen" },
  temperature: { icon: Stethoscope, bm: "Suhu badan", en: "Body temperature" },
  height: { icon: LineChart, bm: "Tinggi", en: "Height" },
}

const TIMING: Record<string, [string, string]> = {
  before_meal: ["Sebelum makan", "Before meal"],
  after_meal: ["Selepas makan", "After meal"],
  with_meal: ["Bersama makan", "With meal"],
  bedtime: ["Sebelum tidur", "At bedtime"],
}

/** "08:30" for today, otherwise the date, so an old reading is not mistaken for a new one. */
function fmtWhen(iso: string | null | undefined, isBm: boolean): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return time
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `${isBm ? "Semalam" : "Yesterday"} ${time}`
  return d.toLocaleDateString([], { day: "2-digit", month: "short" })
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
  const { lang } = useLang()
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  const [dash, setDash] = useState<Dashboard | null>(null)
  const [today, setToday] = useState<TodayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [spark, setSpark] = useState<Record<string, Array<{ label: string; value: number }>>>({})
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    return token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  const loadToday = useCallback(async () => {
    const res = await fetch("/api/health/medications/today", { headers: authHeaders(), credentials: "include", cache: "no-store" })
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    setToday(Array.isArray(data) ? data : [])
  }, [authHeaders])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const headers = authHeaders()
      const dRes = await fetch("/api/health/dashboard", { headers, credentials: "include", cache: "no-store" })
      if (!dRes.ok) throw new Error(String(dRes.status))
      const d: Dashboard = await dRes.json()
      setDash(d)
      await loadToday()

      // A small trend for each metric that has a reading.
      const keys: string[] = Array.isArray(d?.metrics) ? d.metrics.map((m) => m.metric_type) : []
      const results = await Promise.all(
        keys.map(async (k) => {
          const r = await fetch(`/api/health/readings?metric=${k}&range=30d`, { headers, credentials: "include", cache: "no-store" })
          return { key: k, rows: r.ok ? ((await r.json()) as Metric[]) : [] }
        })
      )
      const out: Record<string, Array<{ label: string; value: number }>> = {}
      for (const res of results) {
        out[res.key] = [...res.rows]
          .reverse()
          .slice(-14)
          .filter((m) => (m.metric_type === "bp" ? m.systolic != null : m.value != null))
          .map((m) => ({
            label: new Date(m.measured_at || "").toLocaleDateString([], { day: "2-digit", month: "2-digit" }),
            value: m.metric_type === "bp" ? (m.systolic as number) : (m.value as number),
          }))
      }
      setSpark(out)
      setHasLoaded(true)
    } catch {
      // Say so: an empty screen reads as "no data", and the BMI card would claim
      // there is no weight or height when the request had simply failed.
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [authHeaders, loadToday])

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Doses change on the phone and in the bot too; refresh them when the tab returns.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && hasLoaded) void loadToday().catch(() => undefined)
    }
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("focus", refresh)
    return () => {
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [hasLoaded, loadToday])

  const setDose = useCallback(
    async (item: TodayItem, status: "taken" | "skipped" | "pending") => {
      if (!item.schedule_id) return
      const key = `${item.medication_id}-${item.schedule_id}`
      setBusyKey(key)
      const previous = today
      // Show the change at once; put it back if the server says no.
      setToday((rows) => rows.map((r) => (r.medication_id === item.medication_id && r.schedule_id === item.schedule_id ? { ...r, status, overdue: status === "pending" ? r.overdue : false } : r)))
      try {
        const res = await fetch(`/api/health/medications/${item.medication_id}/doses`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ schedule_id: item.schedule_id, status }),
        })
        if (!res.ok) throw new Error()
        await loadToday()
      } catch {
        setToday(previous)
        showAlertRef.current(tr("Ralat", "Error"), tr("Gagal kemas kini ubat.", "Failed to update the medication."), "error")
      } finally {
        setBusyKey(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authHeaders, loadToday, today, isBm]
  )

  const takenCount = today.filter((i) => i.status === "taken").length
  const pendingCount = today.filter((i) => i.status === "pending").length
  const overdueCount = today.filter((i) => i.status === "pending" && i.overdue).length
  const bmi = dash?.bmi ?? null
  const category = dash?.bmi_category

  const categoryTone = (key?: string) =>
    key === "normal" ? "var(--income)" : key === "obese" ? "var(--expense)" : key ? "var(--warning)" : undefined

  const statusBadge = (item: TodayItem) => {
    if (item.status === "taken")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--income)]">
          <Check size={13} strokeWidth={2.5} />
          {tr("Sudah diambil", "Taken")}
          {item.taken_at ? <span className="font-normal text-[var(--muted)]">· {fmtWhen(item.taken_at, isBm)}</span> : null}
        </span>
      )
    if (item.status === "skipped")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
          <SkipForward size={13} />
          {tr("Dilangkau", "Skipped")}
        </span>
      )
    if (item.status === "missed")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--expense)]">
          <AlertTriangle size={13} />
          {tr("Terlepas", "Missed")}
        </span>
      )
    if (item.overdue)
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--warning)]">
          <AlertTriangle size={13} />
          {tr("Lewat, belum diambil", "Overdue")}
        </span>
      )
    return <span className="text-xs font-semibold text-[var(--muted)]">{tr("Belum diambil", "Pending")}</span>
  }

  const quickLinks = [
    { label: tr("Monitor", "Monitor"), href: `/${sessionId}/health/readings`, icon: LineChart },
    { label: tr("Ubat", "Meds"), href: `/${sessionId}/health/medications`, icon: Pill },
    { label: tr("Larian", "Run"), href: `/${sessionId}/health/tracking`, icon: Footprints },
    { label: tr("Sejarah", "History"), href: `/${sessionId}/health/history`, icon: History },
  ]

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader title={tr("Kesihatan", "Health")} beta fallbackHref={`/${sessionId}`} />
      </div>
      <DesktopPageHeader className="hidden lg:block" title={tr("Kesihatan", "Health")} beta homeHref={`/${sessionId}`} />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        {loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
              <AlertTriangle size={24} />
            </span>
            <p className="text-base font-bold text-[var(--text)]">{tr("Data kesihatan tidak dapat dimuatkan", "Health data could not be loaded")}</p>
            <p className="max-w-xs text-sm text-[var(--muted)]">{tr("Semak sambungan anda, kemudian cuba lagi.", "Check your connection, then try again.")}</p>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="mt-1 flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-95"
            >
              <RefreshCw size={15} />
              {tr("Cuba lagi", "Try again")}
            </button>
          </div>
        ) : showDataSkeleton || (loading && !hasLoaded) ? (
          <div className="space-y-4">
            <div className="h-56 animate-pulse rounded-[2rem] bg-[var(--surface-tint)]" />
            <div className="h-24 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
          </div>
        ) : (
          <>
            <ModenHero
              label={
                <>
                  <HeartPulse size={16} />
                  {tr("Indeks jisim badan", "Body mass index")}
                </>
              }
              currency={null}
              amount={bmi != null ? bmi.toFixed(1) : "—"}
              amountSize="clamp(2.25rem, 10vw, 3rem)"
              stats={[
                { key: "meds", tone: "in", icon: <Pill size={15} strokeWidth={2.2} />, label: tr("Ubat hari ini", "Meds today"), value: today.length ? `${takenCount}/${today.length}` : "—" },
                { key: "readings", tone: "neutral", icon: <Activity size={15} strokeWidth={2.2} />, label: tr("Jenis bacaan", "Readings"), value: String(dash?.metrics?.length ?? 0) },
              ]}
            >
              <div className="flex flex-wrap items-center gap-2">
                {category ? (
                  <ModenHeroPill dot={categoryTone(category.key)}>{isBm ? category.label_bm : category.label_en}</ModenHeroPill>
                ) : null}
                {dash?.weight_kg != null ? <ModenHeroPill>{dash.weight_kg} kg</ModenHeroPill> : null}
                {dash?.height_cm != null ? <ModenHeroPill>{dash.height_cm} cm</ModenHeroPill> : null}
              </div>
              {bmi == null ? (
                <p className="text-[0.8125rem] font-medium leading-snug" style={{ color: "var(--hero-muted)" }}>
                  {tr("Tambah berat dan tinggi untuk mengira BMI.", "Add your weight and height to work out your BMI.")}
                </p>
              ) : overdueCount > 0 ? (
                <p className="text-[0.8125rem] font-medium leading-snug" style={{ color: "var(--hero-muted)" }}>
                  {tr(`${overdueCount} ubat sudah lewat diambil.`, `${overdueCount} ${overdueCount === 1 ? "dose is" : "doses are"} overdue.`)}
                </p>
              ) : null}
              <Link
                href={`/${sessionId}/health/readings`}
                className="flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold transition active:scale-[0.98]"
                style={heroPrimaryButtonStyle}
              >
                <Plus size={16} />
                {tr("Tambah bacaan", "Add a reading")}
              </Link>
            </ModenHero>

            {/* The other health tools */}
            <nav aria-label={tr("Alat kesihatan", "Health tools")} className="grid grid-cols-4 gap-2.5">
              {quickLinks.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-2.5 transition hover:bg-[var(--surface-tint)] active:scale-[0.97]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
                    <m.icon size={18} />
                  </span>
                  <span className="text-xs font-semibold text-[var(--text)]">{m.label}</span>
                </Link>
              ))}
            </nav>

            {/* BMI gauge */}
            {bmi != null && (
              <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
                <div className="mx-auto max-w-[390px]">
                  <BmiGauge bmi={bmi} category={category} heightCm={dash?.height_cm} isBm={isBm} />
                </div>
              </section>
            )}

            {/* Today's medication */}
            <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2.5 text-base font-bold text-[var(--text)]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-tint-strong)]">
                    <Pill size={15} />
                  </span>
                  {tr("Ubat hari ini", "Today's medication")}
                </h2>
                <Link href={`/${sessionId}/health/medications`} className="flex items-center text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)]">
                  {tr("Urus", "Manage")}
                  <ChevronRight size={15} />
                </Link>
              </div>

              {!today.length ? (
                <div className="rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-[var(--text)]">{tr("Tiada ubat untuk hari ini", "No medication today")}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{tr("Tambah ubat dan masa pengambilannya di halaman Ubat.", "Add a medication and its times on the Meds page.")}</p>
                  <Link href={`/${sessionId}/health/medications`} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border)] px-5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)]">
                    <Plus size={14} />
                    {tr("Tambah ubat", "Add a medication")}
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                      <div className="h-full rounded-full bg-[var(--income)] transition-all" style={{ width: `${(takenCount / today.length) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-[var(--muted)]">
                      {takenCount}/{today.length}
                      {pendingCount > 0 ? ` · ${pendingCount} ${tr("belum", "left")}` : ""}
                    </span>
                  </div>
                  <ul className="grid gap-2.5 lg:grid-cols-2">
                    {today.map((item) => {
                      const key = `${item.medication_id}-${item.schedule_id}`
                      const busy = busyKey === key
                      const done = item.status === "taken" || item.status === "skipped"
                      const timing = TIMING[item.timing]
                      return (
                        <li key={key} className={cn("flex items-center gap-3 rounded-[1.25rem] border p-3.5", item.status === "pending" && item.overdue ? "border-[var(--warning)]/40" : "border-[var(--border)]")}>
                          <button
                            type="button"
                            onClick={() => void setDose(item, done ? "pending" : "taken")}
                            disabled={busy}
                            aria-label={done ? tr("Batalkan tanda", "Undo") : tr("Tandakan sudah diambil", "Mark as taken")}
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-60",
                              item.status === "taken" ? "border-transparent bg-[var(--income)] text-white" : item.status === "skipped" ? "border-[var(--border-strong)] text-[var(--muted)]" : "border-[var(--border-strong)] text-transparent hover:border-[var(--text-soft)]"
                            )}
                          >
                            {busy ? <Loader2 size={15} className="animate-spin text-[var(--muted)]" /> : item.status === "skipped" ? <SkipForward size={15} /> : <Check size={16} strokeWidth={2.6} />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-[var(--text)]">
                              <span className="truncate">{item.name}</span>
                              {item.dosage ? <span className="text-xs font-normal text-[var(--muted)]">{item.dosage}</span> : null}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)]">
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Clock size={12} />
                                {item.scheduled_time}
                              </span>
                              {timing ? <span>{isBm ? timing[0] : timing[1]}</span> : null}
                            </p>
                            <div className="mt-1.5">{statusBadge(item)}</div>
                          </div>
                          {done ? (
                            <button
                              type="button"
                              onClick={() => void setDose(item, "pending")}
                              disabled={busy}
                              aria-label={tr("Batalkan tanda", "Undo")}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-tint)] hover:text-[var(--text)] disabled:opacity-50"
                            >
                              <Undo2 size={15} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void setDose(item, "skipped")}
                              disabled={busy}
                              className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-50"
                            >
                              <SkipForward size={13} />
                              {tr("Langkau", "Skip")}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </section>

            {/* Readings */}
            <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2.5 text-base font-bold text-[var(--text)]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-tint-strong)]">
                    <Stethoscope size={15} />
                  </span>
                  {tr("Bacaan terkini", "Latest readings")}
                </h2>
                <Link href={`/${sessionId}/health/readings`} className="flex items-center text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)]">
                  {tr("Lihat semua", "View all")}
                  <ChevronRight size={15} />
                </Link>
              </div>
              {!dash?.metrics?.length ? (
                <div className="rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-[var(--text)]">{tr("Belum ada bacaan", "No readings yet")}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{tr("Rekod berat, tekanan darah atau gula darah anda.", "Record your weight, blood pressure or blood glucose.")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
                  {dash.metrics.map((m) => {
                    const meta = METRIC_META[m.metric_type] || { icon: Activity, bm: m.label || m.metric_type, en: m.label || m.metric_type }
                    const Icon = meta.icon
                    const points = spark[m.metric_type] || []
                    return (
                      <Link
                        key={m.metric_type}
                        href={`/${sessionId}/health/readings?metric=${m.metric_type}`}
                        className="flex min-h-32 flex-col rounded-[1.25rem] border border-[var(--border)] p-3.5 transition hover:bg-[var(--surface-tint)] active:scale-[0.98]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
                            <Icon size={14} />
                          </span>
                          {m.measured_at ? <span className="text-xs text-[var(--muted)]">{fmtWhen(m.measured_at, isBm)}</span> : null}
                        </div>
                        <p className="mt-2.5 text-xl font-bold tabular-nums tracking-tight text-[var(--text)]">
                          {fmtMetric(m)}
                          {m.metric_type !== "bp" && m.unit && m.value != null ? <span className="ml-1 text-xs font-medium text-[var(--muted)]">{m.unit}</span> : null}
                        </p>
                        <p className="text-xs font-medium text-[var(--muted)]">{isBm ? meta.bm : meta.en}</p>
                        {points.length > 1 ? (
                          <div className="mt-2">
                            <HealthSparkline points={points} color="#737373" />
                          </div>
                        ) : null}
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </DesktopPageBody>
      {alertModal}
    </div>
  )
}
