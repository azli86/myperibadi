"use client"

import type React from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { HeroActionsSlot, useRegisterHero } from "@/components/layout/pageActions"

// The Moden hero card: a panel holding the label and the big figure, set on
// a card whose strip below carries the in/out stats. Dark: a dark grey panel
// on a lighter grey strip; light: a white panel on a grey strip (tokens in
// globals.css).
// Colours are inline: the light theme remaps the text-white class, and
// phones force text-[2rem]-style sizes down.
export const HERO_PANEL = "var(--hero-panel)"
export const HERO_STRIP = "var(--hero-strip)"
export const HERO_LINE = "var(--hero-line)"
export const HERO_TEXT = "var(--hero-text)"
export const HERO_MUTED = "var(--hero-muted)"
export const HERO_STRIP_TEXT = "var(--hero-strip-text)"
export const HERO_STRIP_MUTED = "var(--hero-strip-muted)"
export const HERO_CIRCLE = "var(--hero-circle)"
export const HERO_CHIP = "var(--hero-chip)"
export const HERO_CHIP_LINE = "var(--hero-chip-line)"
export const HERO_DIVIDER = "var(--hero-divider)"

/** Inline style for the hero's solid button: the primary blue. */
export const heroPrimaryButtonStyle: React.CSSProperties = { background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)" }
/** Inline style for the hero's quiet button: a faint tint on the panel. */
export const heroQuietButtonStyle: React.CSSProperties = { background: HERO_CHIP, color: HERO_TEXT, border: `1px solid ${HERO_CHIP_LINE}` }

export type ModenHeroStat = {
  key: string
  label: React.ReactNode
  value: React.ReactNode
  tone?: "in" | "out" | "neutral"
  icon?: React.ReactNode
}

export function ModenHero({
  label,
  actions,
  currency = "RM",
  amount,
  amountSize = "clamp(2.5rem, 12vw, 3.25rem)",
  onAmountClick,
  amountLabel,
  children,
  stats,
  statsLayout = "inline",
  footer,
  className,
  panelClassName,
  pageActions = true,
}: {
  label: React.ReactNode
  actions?: React.ReactNode
  currency?: React.ReactNode
  amount?: React.ReactNode
  amountSize?: string
  onAmountClick?: () => void
  amountLabel?: string
  children?: React.ReactNode
  stats?: ModenHeroStat[]
  /** "rows" stacks the stats, label left and value right, for narrow cards. */
  statsLayout?: "inline" | "rows"
  footer?: React.ReactNode
  className?: string
  panelClassName?: string
  /** Whether the page's action buttons render below this hero (false for side-rail cards). */
  pageActions?: boolean
}) {
  const heroId = useRegisterHero(pageActions)
  const figure = amount == null ? null : (
    <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap leading-none tabular-nums">
      {currency ? (
        <span className="shrink-0 font-semibold" style={{ color: HERO_MUTED, fontSize: "1.375rem" }}>
          {currency}
        </span>
      ) : null}
      <span className="min-w-0 truncate font-bold tracking-[-0.03em]" style={{ color: HERO_TEXT, fontSize: amountSize, lineHeight: 1 }}>
        {amount}
      </span>
    </span>
  )

  return (
    <>
    <section
      className={cn("moden-hero overflow-hidden rounded-[2rem]", className)}
      style={{ background: HERO_STRIP, border: `1px solid ${HERO_LINE}` }}
    >
      <div
        className={cn("flex flex-col gap-3.5 rounded-b-[1.875rem] pb-6 pl-[22px] pr-[18px] pt-[18px]", panelClassName)}
        style={{ background: HERO_PANEL, color: HERO_TEXT }}
      >
        <div className="flex min-h-10 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 font-semibold" style={{ color: HERO_TEXT, fontSize: "0.875rem" }}>
            {label}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2.5">{actions}</div> : null}
        </div>
        {figure ? (
          onAmountClick ? (
            <button type="button" onClick={onAmountClick} aria-label={amountLabel} className="block min-w-0 max-w-full text-left transition active:opacity-70">
              {figure}
            </button>
          ) : (
            figure
          )
        ) : null}
        {children}
        {pageActions ? <HeroActionsSlot heroId={heroId} /> : null}
      </div>
      {stats && stats.length && statsLayout === "rows" ? (
        <div className="flex flex-col px-4 pb-2 pt-1.5" style={{ color: HERO_STRIP_TEXT }}>
          {stats.map((stat, index) => (
            <div
              key={stat.key}
              className="flex min-w-0 items-center gap-2.5 py-2"
              style={index > 0 ? { borderTop: `1px solid ${HERO_DIVIDER}` } : undefined}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: HERO_CIRCLE,
                  color: stat.tone === "in" ? "var(--income)" : stat.tone === "out" ? "var(--expense)" : HERO_TEXT,
                }}
              >
                {stat.icon ?? (stat.tone === "out" ? <ArrowUp size={14} strokeWidth={2.4} /> : <ArrowDown size={14} strokeWidth={2.4} />)}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: HERO_STRIP_MUTED, fontSize: "0.8125rem" }}>
                {stat.label}
              </span>
              <span className="min-w-0 max-w-[65%] text-right font-bold tabular-nums [overflow-wrap:anywhere]" style={{ color: HERO_STRIP_TEXT, fontSize: "0.9375rem" }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      ) : stats && stats.length ? (
        <div className="flex items-start gap-3.5 pb-4 pl-[22px] pr-5 pt-3.5" style={{ color: HERO_STRIP_TEXT }}>
          {stats.map((stat, index) => (
            <div key={stat.key} className="contents">
              {index > 0 ? <span aria-hidden className="h-9 w-px shrink-0 self-center" style={{ background: HERO_DIVIDER }} /> : null}
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: HERO_CIRCLE,
                    color: stat.tone === "in" ? "var(--income)" : stat.tone === "out" ? "var(--expense)" : HERO_TEXT,
                  }}
                >
                  {stat.icon ?? (stat.tone === "out" ? <ArrowUp size={16} strokeWidth={2.4} /> : <ArrowDown size={16} strokeWidth={2.4} />)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-semibold" style={{ color: HERO_STRIP_MUTED, fontSize: "0.75rem" }}>
                    {stat.label}
                  </span>
                  <span className="font-bold tabular-nums leading-snug [overflow-wrap:anywhere]" style={{ color: HERO_STRIP_TEXT, fontSize: "0.875rem" }}>
                    {stat.value}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {footer}
    </section>
    </>
  )
}

/** The round, tinted icon button on the hero panel (eye, refresh…). */
export function ModenHeroIconButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn("flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-40", className)}
      style={heroQuietButtonStyle}
    >
      {children}
    </button>
  )
}

/** A text link on the hero panel, underlined in the primary blue ("Info baki"). */
export function ModenHeroLink({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn("text-[0.8125rem] font-bold underline underline-offset-4 disabled:opacity-40", className)}
      style={{ color: HERO_TEXT, textDecorationColor: "var(--btn-primary-bg)", textDecorationThickness: "2px" }}
    >
      {children}
    </button>
  )
}

/** A small pill on the hero panel (status, record count…). */
export function ModenHeroPill({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
      style={{ ...heroQuietButtonStyle, fontSize: "0.6875rem" }}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> : null}
      {children}
    </span>
  )
}

/** Small tinted tiles on the hero panel, for extra figures. */
export function ModenHeroTile({ label, value, valueClassName }: { label: React.ReactNode; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-2xl px-3.5 py-3" style={{ background: HERO_CHIP, border: `1px solid ${HERO_CHIP_LINE}` }}>
      <p className="truncate font-medium" style={{ color: HERO_MUTED, fontSize: "0.6875rem" }}>
        {label}
      </p>
      <p className={cn("mt-1 truncate font-bold tabular-nums", valueClassName)} style={{ color: HERO_TEXT, fontSize: "1rem" }}>
        {value}
      </p>
    </div>
  )
}
