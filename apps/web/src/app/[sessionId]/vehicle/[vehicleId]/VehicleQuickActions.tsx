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
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)] active:scale-[0.98]"
      >
        <Gauge size={17} className="text-[var(--muted)]" />
        {isBm ? "Kemas Kini Odo" : "Update Odometer"}
      </button>
      <button
        type="button"
        onClick={onLogService}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] transition hover:bg-[var(--btn-primary-hover)] active:scale-[0.98]"
      >
        <Plus size={17} strokeWidth={2.5} />
        {isBm ? "Log Servis" : "Log Service"}
      </button>
    </div>
  )
}
