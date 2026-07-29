// Client-side mirror of time_utils.cycle_bounds / budget_service.month_bounds.

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

// First day of the cycle (month index) that `ref` falls into.
export function cycleStartFor(ref: Date, cycleStartDay: number): Date {
  const day = Math.min(cycleStartDay, daysInMonth(ref.getFullYear(), ref.getMonth() + 1))
  if (ref.getDate() >= day) {
    return new Date(ref.getFullYear(), ref.getMonth(), day)
  }
  const prev = new Date(ref.getFullYear(), ref.getMonth(), 0) // last day of previous month
  const pd = Math.min(cycleStartDay, daysInMonth(prev.getFullYear(), prev.getMonth() + 1))
  return new Date(prev.getFullYear(), prev.getMonth(), pd)
}

export function currentCycleKey(ref: Date, cycleStartDay: number): string {
  const s = cycleStartFor(ref, cycleStartDay)
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`
}

// Inclusive [start, end] date range for a cycle month label (YYYY-MM).
export function cycleMonthBounds(
  monthKey: string,
  cycleStartDay: number
): { start: Date; end: Date } | null {
  const [yt, mt] = monthKey.split("-").map(Number)
  if (!Number.isFinite(yt) || !Number.isFinite(mt)) return null
  if (cycleStartDay <= 1) {
    return { start: new Date(yt, mt - 1, 1), end: new Date(yt, mt, 0) }
  }
  const day = Math.min(cycleStartDay, daysInMonth(yt, mt))
  const start = new Date(yt, mt - 1, day)
  const next = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  const nd = Math.min(cycleStartDay, daysInMonth(next.getFullYear(), next.getMonth() + 1))
  const end = new Date(next.getFullYear(), next.getMonth(), nd - 1) // last day before next cycle
  return { start, end }
}

// Category-anchored cycle: resets on each Monthly Salary transaction.

function toDateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function categoryCycleKeyForRef(salaryDates: string[], ref: Date): string | null {
  const dates = salaryDates
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
  let chosen: Date | null = null
  for (const d of dates) {
    if (d <= ref) chosen = d
    else break
  }
  if (!chosen) return null
  return `${chosen.getFullYear()}-${String(chosen.getMonth() + 1).padStart(2, "0")}`
}

// Inclusive [start, end] (YYYY-MM-DD strings) for the salary cycle whose start month === monthKey.
export function categoryCycleMonthBounds(
  salaryDates: string[],
  monthKey: string
): { start: string; end: string } | null {
  const dates = salaryDates
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
  const idx = dates.findIndex(
    (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthKey
  )
  if (idx === -1) return null
  const start = dates[idx]
  const nextStart = idx + 1 < dates.length ? dates[idx + 1] : null
  const end = nextStart
    ? new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1)
    : new Date()
  return { start: toDateKeyLocal(start), end: toDateKeyLocal(end) }
}
