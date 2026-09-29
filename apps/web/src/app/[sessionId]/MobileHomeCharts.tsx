"use client"

import { useMemo } from "react"
import { BarChart2 } from "lucide-react"
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js"
import { Bar } from "react-chartjs-2"
import { useTheme } from "@/components/theme/ThemeProvider"
import { getTodayDateInTimeZone } from "@/lib/utils"

// The expense charts from the old dashboard's "Graf Perbelanjaan" sheet: this
// year by month and this month by day. Loaded only when the phone home's
// balance is tapped, so chart.js stays out of the home screen's first load.

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

type Txn = {
  type: "income" | "expense"
  amount: number
  txn_date: string
  is_wallet_transfer?: boolean
  is_debt_movement?: boolean
}

export default function MobileHomeCharts({ transactions, lang, timezone }: { transactions: Txn[]; lang: string; timezone: string }) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const isBm = lang === "BM"
  const locale = isBm ? "ms-MY" : "en-MY"

  const { year, month, today, monthly, daily, monthTotal } = useMemo(() => {
    const [y, m, d] = getTodayDateInTimeZone(timezone).split("-").map(Number)
    // Spending only, as the dashboard counts it: transfers and debt moves are not spending.
    const spend = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.type !== "expense" || tx.is_wallet_transfer || tx.is_debt_movement) continue
      const day = String(tx.txn_date).slice(0, 10)
      spend.set(day, (spend.get(day) || 0) + Number(tx.amount || 0))
    }
    const monthSum = (mm: number) => {
      const prefix = `${y}-${String(mm).padStart(2, "0")}`
      let total = 0
      for (const [day, v] of spend) if (day.startsWith(prefix)) total += v
      return total
    }
    const monthlyRows = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(y, i, 1).toLocaleString(locale, { month: "short" }),
      total: monthSum(i + 1),
    }))
    const days = new Date(y, m, 0).getDate()
    const dailyRows = Array.from({ length: days }, (_, i) => {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
      return { label: String(i + 1), total: spend.get(key) || 0 }
    })
    return { year: y, month: m, today: d, monthly: monthlyRows, daily: dailyRows, monthTotal: monthlyRows[m - 1]?.total || 0 }
  }, [transactions, timezone, locale])

  const tick = isLight ? "#667085" : "#9ea6c7"
  const grid = isLight ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.05)"
  const baseOptions = {
    animation: false as const,
    maintainAspectRatio: false,
    responsive: true,
    interaction: { mode: "index" as const, intersect: false },
    layout: { padding: { top: 14, left: 0, right: 0, bottom: 0 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx: { parsed: { y: number | null } }) =>
            `RM ${Number(ctx.parsed.y || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: tick, font: { size: 10, weight: 700 }, maxRotation: 0, minRotation: 0 } },
      y: { beginAtZero: true, grid: { display: true, color: grid, lineWidth: 1 }, border: { display: false }, ticks: { display: false } },
    },
  }

  const hasMonthly = monthly.some((r) => r.total > 0)
  const hasDaily = daily.some((r) => r.total > 0)
  const money = (v: number) => `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const empty = (text: string) => (
    <div className="flex h-full flex-col items-center justify-center opacity-50">
      <BarChart2 size={24} className="mb-2 text-[var(--muted)]" />
      <p className="text-xs font-semibold text-[var(--muted)]">{text}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">{isBm ? "Bulanan" : "Monthly"}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text)]">{year}</p>
          </div>
          <span className="rounded-full bg-[var(--surface-tint-strong)] px-3 py-1 text-[0.6875rem] font-semibold tabular-nums text-[var(--text-soft)]">
            {money(monthTotal)}
          </span>
        </div>
        <div className="h-[220px]">
          {hasMonthly ? (
            <Bar
              data={{
                labels: monthly.map((r) => r.label),
                datasets: [
                  {
                    data: monthly.map((r) => r.total),
                    // This month in a strong orange, the rest lighter; no blue on the phone home.
                    backgroundColor: monthly.map((_, i) => (i === month - 1 ? "#ea580c" : "rgba(234,88,12,0.35)")),
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 30,
                  },
                ],
              }}
              options={baseOptions}
            />
          ) : (
            empty(isBm ? "Belum ada perbelanjaan tahun ini." : "No spending this year yet.")
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">{isBm ? "Harian" : "Daily"}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text)]">
              {new Date(year, month - 1, 1).toLocaleString(locale, { month: "long", year: "numeric" })}
            </p>
          </div>
          <span className="rounded-full bg-[var(--surface-tint-strong)] px-3 py-1 text-[0.6875rem] font-semibold text-[var(--text-soft)]">
            {daily.length} {isBm ? "hari" : "days"}
          </span>
        </div>
        {/* A bar per day is too narrow on a phone, so the month scrolls sideways. */}
        <div className="h-[240px] overflow-x-auto overflow-y-hidden overscroll-x-contain">
          {hasDaily ? (
            <div className="h-full" style={{ width: `${Math.max(daily.length * 28, 640)}px` }}>
              <Bar
                data={{
                  labels: daily.map((r) => r.label),
                  datasets: [
                    {
                      data: daily.map((r) => r.total),
                      backgroundColor: daily.map((r, i) =>
                        i + 1 === today ? "#f97316" : r.total > 0 ? "#fdba74" : isLight ? "#e5e7eb" : "#303544"
                      ),
                      borderRadius: 6,
                      borderSkipped: false,
                      maxBarThickness: 12,
                    },
                  ],
                }}
                options={{ ...baseOptions, scales: { ...baseOptions.scales, x: { ...baseOptions.scales.x, ticks: { ...baseOptions.scales.x.ticks, font: { size: 9, weight: 700 } } } } }}
              />
            </div>
          ) : (
            empty(isBm ? "Belum ada perbelanjaan bulan ini." : "No spending this month yet.")
          )}
        </div>
      </section>
    </div>
  )
}
