"use client"

import { useEffect, useState } from "react"

// Route-level skeleton shell. Delayed ~300ms so fast navigations don't flash a
// skeleton; slow DB fetches (and pre-hydration) still land on a skeleton.
export default function DashboardLoading() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 300)
    return () => window.clearTimeout(t)
  }, [])

  if (!visible) return <div aria-hidden="true" className="min-h-[40vh]" />

  return (
    <div className="space-y-5 pb-16 text-[0.8125rem]" aria-busy="true" aria-label="Memuatkan">
      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-2xl p-6 pb-7 bg-[var(--card)]">
        <div className="skeleton-surface mx-auto h-7 w-[8.5rem] rounded-full" />
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl p-4 bg-[var(--skeleton-panel)]">
            <div className="skeleton-surface h-8 w-8 rounded-full" />
            <div className="mt-3 skeleton-surface h-3 w-16 rounded-full" />
          </div>
          <div className="rounded-2xl p-4 bg-[var(--skeleton-panel)]">
            <div className="skeleton-surface h-8 w-8 rounded-full" />
            <div className="mt-3 skeleton-surface h-3 w-16 rounded-full" />
          </div>
        </div>
      </div>

      {/* Wallet rows */}
      <div className="space-y-1.5 px-1">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="skeleton-surface h-8 w-8 shrink-0 rounded-xl" />
              <div className="skeleton-surface h-2.5 w-24 rounded-full" />
            </div>
            <div className="skeleton-surface h-3 w-20 rounded-full" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-3 px-1">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4"
          >
            <div className="skeleton-surface h-2.5 w-16 rounded-full" />
            <div className="mt-3 skeleton-surface h-5 w-24 rounded-full" />
            <div className="mt-3 flex h-10 items-end gap-1">
              {[40, 70, 45, 85, 55, 65].map((h, j) => (
                <div key={j} className="skeleton-surface flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Daily budget */}
      <div className="rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4 px-1">
        <div className="skeleton-surface h-2.5 w-28 rounded-full" />
        <div className="mt-3 skeleton-surface h-2 w-full rounded-full" />
        <div className="mt-2 skeleton-surface h-4 w-24 rounded-full" />
      </div>

      {/* Category comparison */}
      <div className="rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4 px-1">
        <div className="skeleton-surface h-2.5 w-24 rounded-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-4 flex items-center gap-2">
            <div className="skeleton-surface h-3 w-3 rounded-full" />
            <div className="skeleton-surface h-2.5 flex-1 rounded-full" />
            <div className="skeleton-surface h-3 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
