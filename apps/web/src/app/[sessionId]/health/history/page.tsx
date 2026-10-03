"use client"

import React, { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { LineChart as LineChartIcon } from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { MetricChart, TrendStats, METRIC_HEX } from "@/components/health/HealthCharts"

type Reading = {
  id: number
  metric_type: string
  value?: number | null
  systolic?: number | null
  diastolic?: number | null
  measured_at: string
}

const METRICS: { key: string; labelBM: string; labelEN: string; unit: string }[] = [
  { key: "weight", labelBM: "Berat", labelEN: "Weight", unit: "kg" },
  { key: "height", labelBM: "Tinggi", labelEN: "Height", unit: "cm" },
  { key: "bp", labelBM: "Tekanan darah", labelEN: "Blood pressure", unit: "mmHg" },
  { key: "glucose", labelBM: "Gula darah", labelEN: "Glucose", unit: "mmol/L" },
  { key: "pulse", labelBM: "Nadi", labelEN: "Pulse", unit: "BPM" },
  { key: "spo2", labelBM: "SpO₂", labelEN: "SpO₂", unit: "%" },
  { key: "temperature", labelBM: "Suhu", labelEN: "Temperature", unit: "°C" },
]

const RANGES = ["7d", "30d", "3m", "1y"]

export default function HealthHistoryPage() {
  const params = useParams()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const sessionId = (params.sessionId as string) || ""

  const [range, setRange] = useState("30d")
  const [data, setData] = useState<Record<string, Reading[]>>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string[]>([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const token = getAccessToken()
    const headers: Record<string, string> = token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}
    const out: Record<string, Reading[]> = {}
    const bad: string[] = []
    await Promise.all(
      METRICS.map(async (m) => {
        try {
          const res = await fetch(`/api/health/readings?metric=${m.key}&range=${range}`, { headers, credentials: "include", cache: "no-store" })
          if (!res.ok) throw new Error()
          const rows = await res.json()
          out[m.key] = Array.isArray(rows) ? rows : []
        } catch {
          out[m.key] = []
          bad.push(m.key)
        }
      })
    )
    setData(out)
    setFailed(bad)
    setLoading(false)
  }, [range])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const toPoints = (rows: Reading[]) =>
    [...rows].reverse().map((r) => ({
      label: new Date(r.measured_at).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", timeZone: "Asia/Kuala_Lumpur" }),
      value: r.systolic != null ? r.systolic : (r.value ?? undefined),
      systolic: r.systolic ?? undefined,
      diastolic: r.diastolic ?? undefined,
    }))

  const metricCard = (m: (typeof METRICS)[number]) => {
    const rows = data[m.key] || []
    const points = toPoints(rows)
    const hex = METRIC_HEX[m.key] || "#3b82f6"
    return (
      <section key={m.key} className="min-w-0 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${hex}26`, color: hex }}>
            <LineChartIcon size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[var(--text)]">
              {isBm ? m.labelBM : m.labelEN} <span className="text-xs font-semibold text-[var(--muted)]">({m.unit})</span>
            </h2>
            <p className="text-xs text-[var(--muted)]">{rows.length} {tr("bacaan", "readings")}</p>
          </div>
        </div>
        {failed.includes(m.key) ? (
          <p className="py-6 text-center text-sm text-rose-500">{tr("Tidak dapat dimuatkan.", "Could not be loaded.")}</p>
        ) : !rows.length ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">{tr("Tiada bacaan dalam julat ini.", "No readings in this range.")}</p>
        ) : (
          <>
            <MetricChart metricKey={m.key} points={points} className="h-40" />
            <TrendStats values={points.map((p) => p.value).filter((v): v is number => v != null)} unit={m.key === "bp" ? "" : m.unit} isBm={isBm} />
          </>
        )}
      </section>
    )
  }

  const rangeTabs = (
    <div className="flex gap-1">
      {RANGES.map((r) => (
        <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cn("h-10 flex-1 rounded-full border text-sm font-semibold md:flex-none md:px-5", range === r ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
          {r}
        </button>
      ))}
    </div>
  )

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader title={tr("Sejarah", "History")} fallbackHref={`/${sessionId}/health`} />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Sejarah Kesihatan", "Health History")}
        homeHref={`/${sessionId}`}
        breadcrumbs={[{ label: tr("Kesihatan", "Health"), href: `/${sessionId}/health` }]}
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:px-0">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          {rangeTabs}
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-64 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
              ))}
            </div>
          ) : (
            <>
              {failed.length > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-full border border-rose-500/30 px-4 py-2.5 text-sm text-rose-500">
                  <span>{tr("Sebahagian data tidak dapat dimuatkan.", "Some data could not be loaded.")}</span>
                  <button type="button" onClick={() => void loadAll()} className="shrink-0 font-semibold underline underline-offset-2">{tr("Cuba lagi", "Retry")}</button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{METRICS.map(metricCard)}</div>
            </>
          )}
        </div>
      </DesktopPageBody>
    </div>
  )
}
