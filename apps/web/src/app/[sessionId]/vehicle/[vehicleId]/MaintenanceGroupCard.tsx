"use client"

import { Cog, CircleDot, Battery, Wrench, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { MaintenanceItemRow } from "./MaintenanceItemRow"
import type {
  MaintenanceCatalogGroup,
  MaintenanceCatalogItem,
  MaintenanceStatus,
} from "./maintenanceCatalog"

const GROUP_ICON: Record<string, LucideIcon> = {
  engine: Cog,
  brakes: CircleDot,
  tyres: CircleDot,
  electrical: Battery,
  other: Wrench,
}

export type MaintenanceRowView = {
  item: MaintenanceCatalogItem
  label: string
  nextLabel: string
  status: MaintenanceStatus
  recordId?: number | null
}

export function MaintenanceGroupCard({
  group,
  isBm,
  rows,
  onItemClick,
  className,
}: {
  group: MaintenanceCatalogGroup
  isBm: boolean
  rows: MaintenanceRowView[]
  onItemClick?: (row: MaintenanceRowView) => void
  className?: string
}) {
  const Icon = GROUP_ICON[group.key] || Wrench

  return (
    <section
      className={cn(
        "rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)] sm:p-5",
        className
      )}
    >
      <header className="mb-3.5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black tracking-tight text-[var(--text)]">
            {isBm ? group.titleBm : group.title}
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
            {isBm ? group.subtitleBm : group.subtitle}
          </p>
        </div>
      </header>

      <div className="space-y-2">
        {rows.map((row) => (
          <MaintenanceItemRow
            key={row.item.key}
            item={row.item}
            label={row.label}
            nextLabel={row.nextLabel}
            status={row.status}
            onClick={() => onItemClick?.(row)}
          />
        ))}
      </div>
    </section>
  )
}
