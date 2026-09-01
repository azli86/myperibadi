"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { LineChart as LineChartIcon, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { MetricChart, TrendStats, METRIC_HEX } from "@/components/health/HealthCharts"

type Reading = {
  id: number
  metric_type: string
  value?: number | null
  systolic?: number | null
  diastolic?: number | null
  unit?: string | null
  measured_at: string
}

const METRICS: { key: string; labelBM: string; labelEN: string; unit: string }[] = [
  { key: "weight", labelBM: "Berat", labelEN: "Weight", unit: "kg" },
  { key: "height", labelBM: "Tinggi", labelEN: "Height", unit: "cm" },
  { key: "bp", labelBM: "Tekanan Darah", labelEN: "Blood Pressure", unit: "mmHg" },
  { key: "glucose", labelBM: "Gula Darah", labelEN: "Glucose", unit: "mmol/L" },
  { key: "pulse", labelBM: "Denyutan Nadi", labelEN: "Pulse", unit: "BPM" },
  { key: "spo2", labelBM: "SpO₂", labelEN: "SpO₂", unit: "%" },
  { key: "temperature", labelBM: "Suhu", labelEN: "Temperature", unit: "°C" },
]

const RANGES = ["7d", "30d", "3m", "1y"]

export default function HealthHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const { lang } = useLang()
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const isBm = lang === "BM"

  const [range, setRange] = useState("30d")
  const [data, setData] = useState<Record<string, Reading[]>>({})
  const [loading, setLoading] = useState(true)

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) return { Authorization: `Bearer ${token}` }
    return {}
  }, [])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const out: Record<string, Reading[]> = {}
      const results = await Promise.all(
        METRICS.map(async (m) => {
          const res = await fetch(`/api/health/readings?metric=${m.key}&range=${range}`, {
            headers: authHeaders(),
            credentials: "include",
            cache: "no-store",
          })
          if (!res.ok) return { key: m.key, rows: [] as Reading[] }
          const rows = await res.json()
          return { key: m.key, rows: Array.isArray(rows) ? rows : ([] as Reading[]) }
        }),
      )
      for (const r of results) out[r.key] = r.rows
      setData(out)
    } catch {
      showAlertRef.current(isBm ? "Ralat" : "Error", isBm ? "Gagal memuat sejarah." : "Failed to load history.", "error")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const toPoints = (rows: Reading[]) =>
    [...rows].reverse().map((r) => ({
      label: new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit" }),
      value: r.systolic != null ? r.systolic : (r.value ?? undefined),
      systolic: r.systolic ?? undefined,
      diastolic: r.diastolic ?? undefined,
    }))

  const renderMetricCard = (m: (typeof METRICS)[number]) => {
    const rows = data[m.key] || []
    const points = toPoints(rows)
    const hex = METRIC_HEX[m.key] || "#3b82f6"
    return (
      <section key={m.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${hex}1f`, color: hex }}
            >
              <LineChartIcon size={17} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black tracking-tight text-[var(--text)]">
                {isBm ? m.labelBM : m.labelEN}
                {m.unit ? <span className="ml-1 text-xs font-semibold text-[var(--muted)]">({m.unit})</span> : null}
              </h2>
              <p className="text-[11px] font-semibold text-[var(--muted)]">
                {points.length} {isBm ? "bacaan" : "readings"}
              </p>
            </div>
          </div>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
        </div>
        {!rows.length ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            {isBm ? "Tiada bacaan." : "No readings."}
          </p>
        ) : (
          <>
            <MetricChart metricKey={m.key} points={points} className="h-40" />
            <TrendStats
              values={points.map((p) => p.value ?? 0).filter((v) => v != null)}
              unit={m.key === "bp" ? "" : m.unit}
              isBm={isBm}
            />
          </>
        )}
      </section>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="md:hidden">
        <MobilePageHeader
          className="border-b border-[color:var(--border)] pb-4"
          title={isBm ? "Sejarah" : "History"}
          fallbackHref={`/${sessionId}/health`}
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={isBm ? "Sejarah Kesihatan" : "Health History"}
          homeHref={`/${sessionId}`}
          breadcrumbs={[{ label: isBm ? "Kesihatan" : "Health", href: `/${sessionId}/health` }]}
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="md:hidden px-1 pb-24 pt-1 space-y-4">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-xs font-bold transition",
                range === r ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--card)] text-[var(--muted)]",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-[var(--card)]" />
            ))}
          </div>
        ) : (
          METRICS.map(renderMetricCard)
        )}
      </div>

      {/* ── DESKTOP VIEW ── */}
      <div className="hidden md:block">
        <DesktopPageBody>
          <div className="mx-auto w-full max-w-[900px] space-y-4 p-4">
            <div className="flex items-center justify-between">
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

            {loading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl bg-[var(--card)]" />
                ))}
              </div>
            ) : (
              METRICS.map(renderMetricCard)
            )}
          </div>
        </DesktopPageBody>
      </div>
      {alertModal}
    </div>
  )
}
