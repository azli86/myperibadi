"use client"

import { Calendar, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { CategoryIconGlyph } from "@/lib/category-icons"

export type EventHeroData = {
  name: string
  icon_name?: string | null
  has_image?: boolean
  image_url?: string | null
  start_date?: string | null
  end_date?: string | null
  wallet_id?: number | null
}

function formatShort(value?: string | null) {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" })
}

export function EventHeroCard({
  event,
  statusLabel,
  statusClass,
  isBm,
}: {
  event: EventHeroData
  statusLabel: string
  statusClass: string
  isBm: boolean
}) {
  const start = formatShort(event.start_date)
  const end = formatShort(event.end_date)
  const range = start ? (end ? `${start} – ${end}` : start) : null

  return (
    <section className="relative w-full pb-5">
      <div className="relative h-48 w-full sm:h-56 md:h-64">
        <div className="absolute inset-0 overflow-hidden rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)]">
          {event.has_image && event.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.image_url}
              alt={event.name}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface-tint)]">
              <span className="opacity-40">
                <CategoryIconGlyph
                  iconName={event.icon_name}
                  categoryName={event.name}
                  kind="expense"
                  size={56}
                />
              </span>
            </div>
          )}
        </div>

        {/* Top row */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3.5 sm:p-4 md:p-5 lg:p-6">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.08em] backdrop-blur-md md:px-3 md:py-2 md:text-xs",
              statusClass
            )}
          >
            {statusLabel}
          </span>
        </div>

        {/* Bottom content */}
        <div className="absolute inset-x-0 -bottom-3 flex flex-wrap items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-4 lg:px-5">
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 truncate rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-2.5 py-1 text-[0.7rem] font-black text-[var(--text)] shadow-sm backdrop-blur-md md:px-3.5 md:py-1.5 md:text-sm">
            <CategoryIconGlyph
              iconName={event.icon_name}
              categoryName={event.name}
              kind="expense"
              size={13}
            />
            {event.name}
          </span>
          {range ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-2.5 py-1 text-[0.7rem] font-bold text-[var(--text)] shadow-sm backdrop-blur-md md:px-3.5 md:py-1.5 md:text-sm">
              <Calendar size={12} className="text-[var(--muted)] md:h-3.5 md:w-3.5" />
              {range}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-2.5 py-1 text-[0.7rem] font-bold text-[var(--muted)] shadow-sm backdrop-blur-md md:px-3.5 md:py-1.5 md:text-sm">
            <Wallet size={12} />
            {event.wallet_id ? (isBm ? "Wallet dipilih" : "Linked wallet") : isBm ? "Semua wallet" : "All wallets"}
          </span>
        </div>
      </div>
    </section>
  )
}
