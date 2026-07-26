"use client"

import { cn } from "@/lib/utils"
import type { MaintenanceStatus } from "./maintenanceCatalog"

const STATUS_CLASS: Record<MaintenanceStatus, string> = {
  GOOD: "border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--accent2)_12%,transparent)] text-[var(--accent2)]",
  "DUE SOON":
    "border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[var(--surface-tint)] text-[var(--text)]",
  OVERDUE:
    "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[var(--surface-tint-strong)] text-[var(--text)]",
  "NOT SET":
    "border-[var(--border)] bg-[var(--surface-tint)]/50 text-[var(--muted)]",
}

/** Semantic emphasis using existing app status patterns (no hardcoded hex). */
const STATUS_TONE: Record<MaintenanceStatus, string> = {
  GOOD: "ring-1 ring-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "DUE SOON": "ring-1 ring-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  OVERDUE: "ring-1 ring-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "NOT SET": "ring-1 ring-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]",
}

export function VehicleStatusBadge({
  status,
  className,
}: {
  status: MaintenanceStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.6rem] font-black uppercase tracking-[0.08em]",
        STATUS_TONE[status] || STATUS_CLASS[status],
        className
      )}
    >
      {status}
    </span>
  )
}
