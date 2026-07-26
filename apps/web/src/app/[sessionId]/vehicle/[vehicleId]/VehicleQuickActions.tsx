"use client"

import { Gauge, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export function VehicleQuickActions({
  isBm,
  onUpdateOdometer,
  onLogService,
  className,
}: {
  isBm: boolean
  onUpdateOdometer: () => void
  onLogService: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2",
        className
      )}
    >
      <button
        type="button"
        onClick={onUpdateOdometer}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold text-[var(--text)] shadow-[var(--shadow-card)] transition active:scale-[0.98]"
      >
        <Gauge size={17} className="text-[var(--muted)]" />
        {isBm ? "Kemas Kini Odo" : "Update Odometer"}
      </button>
      <button
        type="button"
        onClick={onLogService}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-bold text-[var(--bg)] shadow-[var(--shadow-card)] transition active:scale-[0.98]"
      >
        <Plus size={17} strokeWidth={2.5} />
        {isBm ? "Log Servis" : "Log Service"}
      </button>
    </div>
  )
}
