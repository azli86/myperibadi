"use client"

import {
  Battery,
  CircleDot,
  Cog,
  Droplets,
  Filter,
  ScanSearch,
  Snowflake,
  Wrench,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { VehicleStatusBadge } from "./VehicleStatusBadge"
import type { MaintenanceCatalogItem, MaintenanceStatus } from "./maintenanceCatalog"

const ICON_MAP = {
  oil: Droplets,
  gear: Cog,
  coolant: Snowflake,
  filter: Filter,
  spark: Zap,
  brake: CircleDot,
  fluid: Droplets,
  tyre: CircleDot,
  align: ScanSearch,
  battery: Battery,
  inspect: ScanSearch,
  other: Wrench,
} as const

export function MaintenanceItemRow({
  item,
  label,
  nextLabel,
  status,
  onClick,
}: {
  item: MaintenanceCatalogItem
  label: string
  nextLabel: string
  status: MaintenanceStatus
  onClick?: () => void
}) {
  const Icon = ICON_MAP[item.icon] || Wrench

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/25 p-3 text-left transition",
        "active:scale-[0.99] hover:bg-[var(--surface-tint)]/45"
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--accent2)]">
        <Icon size={18} strokeWidth={2.1} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text)] leading-tight">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--muted)]">
          {nextLabel}
        </span>
      </span>

      <VehicleStatusBadge status={status} />
    </button>
  )
}
