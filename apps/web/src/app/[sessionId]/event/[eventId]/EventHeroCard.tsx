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

function formatShort(value?: string | null, withYear = false) {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
}

// Identity: the photo, the name, when it runs and its status. The photo runs
// full width above the name with the spend total centred on it. Without a photo
// there is no empty banner, only the icon tile, and the summary card carries
// the total, so it still lands on the first screen.
export function EventHeroCard({
  event,
  statusLabel,
  statusClass,
  isBm,
  totalLabel,
}: {
  event: EventHeroData
  statusLabel: string
  statusClass: string
  isBm: boolean
  /** Formatted spend total, laid over the photo. */
  totalLabel?: string
}) {
  const start = formatShort(event.start_date)
  const end = formatShort(event.end_date, true)
  const range = start ? (end ? `${start} – ${end}` : start) : null
  const hasImage = Boolean(event.has_image && event.image_url)

  return (
    <section>
      {hasImage ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-[var(--surface-tint-strong)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.image_url!} alt="" className="h-full w-full object-cover object-center" />
          {totalLabel ? (
            // A scrim, not a card: the photo stays visible while any photo,
            // light or dark, still gives the white total enough contrast.
            <div className="absolute inset-0 flex flex-col items-center justify-center event-photo-overlay bg-black/45 px-4 text-center">
              <p className="text-[0.65rem] event-photo-overlay-label font-bold uppercase tracking-[0.14em]">
                {isBm ? "Jumlah belanja" : "Total spent"}
              </p>
              <p className="mt-1 text-4xl font-black leading-none tabular-nums tracking-tight [overflow-wrap:anywhere] [text-shadow:0_1px_12px_rgba(0,0,0,0.45)]">
                {totalLabel}
              </p>
              {/* With a photo the name lives on it, under the total; the top bar
                  just says "Event Details". */}
              <h1 className="mt-3 line-clamp-2 max-w-full text-2xl font-black leading-tight tracking-tight [overflow-wrap:anywhere] [text-shadow:0_1px_10px_rgba(0,0,0,0.5)] md:text-3xl">
                {event.name}
              </h1>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn("flex items-center gap-3.5 px-3 md:gap-4 md:px-0", hasImage ? "pt-3.5 md:pt-4" : "pt-2 md:pt-0")}>
        <div
          className={cn(
            "relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-tint-strong)] md:h-20 md:w-20",
            hasImage && "hidden"
          )}
        >
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.image_url!} alt="" className="h-full w-full object-cover object-center" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[var(--text-soft)]">
              <CategoryIconGlyph iconName={event.icon_name} categoryName={event.name} kind="expense" size={28} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!hasImage || !totalLabel ? (
            <h1 className="text-2xl font-black leading-tight tracking-tight text-[var(--text)] [overflow-wrap:anywhere] md:text-3xl">
              {event.name}
            </h1>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs font-semibold text-[var(--muted)]">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em]",
                statusClass
              )}
            >
              {statusLabel}
            </span>
            {range ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Calendar size={12} aria-hidden />
                {range}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Wallet size={12} aria-hidden />
              {event.wallet_id ? (isBm ? "Wallet dipilih" : "Linked wallet") : isBm ? "Semua wallet" : "All wallets"}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
