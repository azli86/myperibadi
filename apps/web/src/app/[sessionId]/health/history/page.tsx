"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Activity, LineChart } from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"

type Reading = {
  id: number
  metric_type: string
  value?: number | null
  systolic?: number | null
  diastolic?: number | null
  measured_at: string
}

const METRICS: { key: string; labelBM: string; labelEN: string }[] = [
  { key: "weight", labelBM: "Berat", labelEN: "Weight" },
  { key: "height", labelBM: "Tinggi", labelEN: "Height" },
  { key: "bp", labelBM: "Tekanan Darah", labelEN: "Blood Pressure" },
  { key: "glucose", labelBM: "Gula Darah", labelEN: "Glucose" },
  { key: "pulse", labelBM: "Denyutan Nadi", labelEN: "Pulse" },
  { key: "spo2", labelBM: "SpO₂", labelEN: "SpO₂" },
  { key: "temperature", labelBM: "Suhu", labelEN: "Temperature" },
]

const RANGES = ["7d", "30d", "3m", "1y"]

export default function HealthHistoryPage() {
  const params = useParams()
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
  }, [authHeaders, range, isBm])

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="md:hidden">
        <MobilePageHeader
          className="border-b border-[color:var(--border)] pb-4"
          title={isBm ? "History" : "History"}
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
                "rounded-lg px-3 py-1 text-xs font-bold transition",
                range === r ? "bg-[var(--accent2)] text-white" : "bg-[var(--card)] text-[var(--muted)]",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-[var(--card)]" />
        ) : (
          METRICS.map((m) => {
            const rows = [...(data[m.key] || [])].reverse()
            const vals = rows.map((r) => (m.key === "bp" && r.systolic != null ? r.systolic : r.value))
            const max = Math.max(...vals.filter((v): v is number => v != null), 1)
            return (
              <section key={m.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-base font-black text-[var(--text)]">
                  <LineChart size={18} className="text-[var(--accent2)]" />
                  {isBm ? m.labelBM : m.labelEN}
                </h2>
                {!rows.length ? (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">
                    {isBm ? "Tiada bacaan." : "No readings."}
                  </p>
                ) : (
                  <div className="flex h-32 items-end gap-1">
                    {rows.map((r) => {
                      const v = m.key === "bp" && r.systolic != null ? r.systolic : r.value
                      const pct = ((v ?? 0) / max) * 100
                      return (
                        <div key={r.id} className="group relative flex flex-1 flex-col items-center">
                          <div
                            className="w-full rounded-t-md bg-[var(--accent2)]/80 transition group-hover:bg-[var(--accent2)]"
                            style={{ height: `${Math.max(pct, 4)}%` }}
                          />
                          <div className="mt-1 hidden text-[9px] text-[var(--muted)] group-hover:block">
                            {new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })
        )}
      </div>

      {/* ── DESKTOP VIEW ── */}
      <div className="hidden md:block">
        <DesktopPageBody>
        <div className="mx-auto w-full max-w-[900px] space-y-4 p-4">
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

          {loading ? (
            <div className="h-32 animate-pulse rounded-2xl bg-[var(--card)]" />
          ) : (
            METRICS.map((m) => {
              const rows = [...(data[m.key] || [])].reverse()
              const vals = rows.map((r) => (m.key === "bp" && r.systolic != null ? r.systolic : r.value))
              const max = Math.max(...vals.filter((v): v is number => v != null), 1)
              return (
                <section key={m.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 text-base font-black text-[var(--text)]">
                    <LineChart size={18} className="text-[var(--accent2)]" />
                    {isBm ? m.labelBM : m.labelEN}
                  </h2>
                  {!rows.length ? (
                    <p className="py-6 text-center text-sm text-[var(--muted)]">
                      {isBm ? "Tiada bacaan." : "No readings."}
                    </p>
                  ) : (
                    <div className="flex h-32 items-end gap-1">
                      {rows.map((r) => {
                        const v = m.key === "bp" && r.systolic != null ? r.systolic : r.value
                        const pct = ((v ?? 0) / max) * 100
                        return (
                          <div key={r.id} className="group relative flex flex-1 flex-col items-center">
                            <div
                              className="w-full rounded-t-md bg-[var(--accent2)]/80 transition group-hover:bg-[var(--accent2)]"
                              style={{ height: `${Math.max(pct, 4)}%` }}
                            />
                            <div className="mt-1 hidden text-[9px] text-[var(--muted)] group-hover:block">
                              {new Date(r.measured_at).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>
        </DesktopPageBody>
      </div>
      {alertModal}
    </div>
  )
}
