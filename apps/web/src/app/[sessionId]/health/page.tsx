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

const METRIC_META: Record<string, { icon: React.ComponentType<any>; color: string }> = {
  weight: { icon: Activity, color: "text-sky-500" },
  bp: { icon: HeartPulse, color: "text-rose-500" },
  glucose: { icon: Activity, color: "text-violet-500" },
  pulse: { icon: HeartPulse, color: "text-amber-500" },
  spo2: { icon: Activity, color: "text-emerald-500" },
  temperature: { icon: Stethoscope, color: "text-orange-500" },
  height: { icon: LineChart, color: "text-indigo-500" },
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
      if (dRes.ok) setDash(await dRes.json())
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
      <div className="md:hidden px-1 pb-24 pt-1 space-y-4">
        {showDataSkeleton ? (
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-[1.85rem] bg-[var(--card)]" />
            <div className="h-20 animate-pulse rounded-2xl bg-[var(--card)]" />
          </div>
        ) : (
          <>
            {/* Mobile Hero Card (Monochrome) */}
            <section className="relative overflow-hidden rounded-[1.85rem] border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--text)] shadow-sm">
              <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 left-6 h-36 w-36 rounded-full bg-sky-500/10 blur-3xl" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {isBm ? "Papan Kesihatan" : "Health Dashboard"}
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl font-black tracking-tight text-[var(--text)]">
                        {dash?.bmi != null ? dash.bmi : "—"}
                      </span>
                      <span className="text-xs font-semibold text-[var(--muted)]">BMI</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {dash?.metrics?.length ?? 0} {isBm ? "bacaan" : "readings"} · {today.length} {isBm ? "ubat hari ini" : "meds today"}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] shadow-sm">
                    <HeartPulse className="h-5 w-5 text-[var(--text)]" />
                  </div>
                </div>

                {/* Quick sub-module links */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: isBm ? "Monitor" : "Monitor", href: `/${sessionId}/health/readings`, icon: LineChart },
                    { label: isBm ? "Ubat" : "Medications", href: `/${sessionId}/health/medications`, icon: Pill },
                    { label: isBm ? "History" : "History", href: `/${sessionId}/health/history`, icon: Activity },
                  ].map((m) => (
                    <button
                      key={m.href}
                      type="button"
                      onClick={() => router.push(m.href)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-2 py-2.5 text-xs font-bold text-[var(--text)] transition active:scale-[0.98]"
                    >
                      <m.icon className="h-4 w-4 text-[var(--accent2)]" />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Monitor Kesihatan */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
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
                    const meta = METRIC_META[m.metric_type] || { icon: Activity, color: "text-sky-500" }
                    const Icon = meta.icon
                    return (
                      <div key={m.metric_type} className="rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]">
                          <Icon size={13} className={meta.color} />
                          {m.label || m.metric_type}
                        </div>
                        <div className="mt-1 text-lg font-black text-[var(--text)]">
                          {fmtMetric(m)}
                          {m.metric_type !== "bp" && m.unit && m.value != null ? (
                            <span className="ml-1 text-xs font-semibold text-[var(--muted)]">{m.unit}</span>
                          ) : null}
                        </div>
                        {m.measured_at && (
                          <div className="mt-0.5 text-[10px] text-[var(--muted)]">{fmtTime(m.measured_at)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Ubat Hari Ini */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
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
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-3"
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
          <div className="mx-auto w-full max-w-[1100px] space-y-5 p-4">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
                  <Stethoscope size={18} className="text-[var(--accent2)]" />
                  {isBm ? "Monitor Kesihatan" : "Health Monitor"}
                </h2>
                {dash?.bmi != null && (
                  <span className="rounded-full bg-[var(--accent2)]/15 px-2.5 py-1 text-xs font-bold text-[var(--accent2)]">
                    BMI {dash.bmi}
                  </span>
                )}
              </div>
              {!dash?.metrics?.length ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  {isBm ? "Belum ada bacaan. Tambah bacaan pertama anda." : "No readings yet. Add your first reading."}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {dash.metrics.map((m) => {
                    const meta = METRIC_META[m.metric_type] || { icon: Activity, color: "text-sky-500" }
                    const Icon = meta.icon
                    return (
                      <div key={m.metric_type} className="rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]">
                          <Icon size={13} className={meta.color} />
                          {m.label || m.metric_type}
                        </div>
                        <div className="mt-1 text-lg font-black text-[var(--text)]">
                          {fmtMetric(m)}
                          {m.metric_type !== "bp" && m.unit && m.value != null ? (
                            <span className="ml-1 text-xs font-semibold text-[var(--muted)]">{m.unit}</span>
                          ) : null}
                        </div>
                        {m.measured_at && (
                          <div className="mt-0.5 text-[10px] text-[var(--muted)]">{fmtTime(m.measured_at)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
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
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] p-3"
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
