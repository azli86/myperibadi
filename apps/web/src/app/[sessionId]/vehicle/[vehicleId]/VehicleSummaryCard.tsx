"use client"

import { AlertTriangle, Fuel, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"

export function VehicleSummaryCard({
  isBm,
  monthKey,
  totalCost,
  fuelCost,
  maintenanceCost,
  overdueCount,
  dueSoonCount,
  className,
}: {
  isBm: boolean
  monthKey?: string | null
  totalCost: number
  fuelCost: number
  maintenanceCost: number
  overdueCount: number
  dueSoonCount: number
  className?: string
}) {
  const money = (n: number) =>
    `RM ${Number(n || 0).toLocaleString("en-MY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`

  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)] sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            {isBm ? "Ringkasan bulan" : "Month summary"}
          </p>
          <p className="mt-1.5 text-2xl font-black tabular-nums tracking-tight text-[var(--text)]">
            {money(totalCost)}
          </p>
          {monthKey ? (
            <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">{monthKey}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
          <Fuel size={14} className="text-[var(--muted)]" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Fuel
          </p>
          <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
            {money(fuelCost)}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
          <Wrench size={14} className="text-[var(--muted)]" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            {isBm ? "Servis" : "Service"}
          </p>
          <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
            {money(maintenanceCost)}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
          <AlertTriangle size={14} className="text-[var(--muted)]" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Due
          </p>
          <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
            {overdueCount + dueSoonCount}
          </p>
        </div>
      </div>
    </section>
  )
}
