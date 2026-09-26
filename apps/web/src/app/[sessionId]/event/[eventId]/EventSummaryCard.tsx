"use client"

import { cn } from "@/lib/utils"
import { formatCurrencyLabel, formatMoneyValue } from "@/components/ui/MoneyAmount"

export function EventSummaryCard({
  isBm,
  currency,
  spent,
  income,
  budget,
  remaining,
  ratio,
  countedCount,
  excludedCount,
  totalCount,
  spark,
  totalOnPhoto = false,
  className,
}: {
  isBm: boolean
  currency: string
  spent: number
  income: number
  budget: number
  remaining: number | null
  ratio: number
  countedCount: number
  excludedCount: number
  totalCount: number
  /** SVG polyline points in a 100×28 box, oldest first; null under two points. */
  spark?: string | null
  /** The hero already shows the total over the photo. */
  totalOnPhoto?: boolean
  className?: string
}) {
  const money = (n: number) => `${formatCurrencyLabel(currency)} ${formatMoneyValue(n)}`
  const hasBudget = budget > 0
  const over = remaining != null && remaining < 0
  const tone = ratio >= 1 ? "var(--expense)" : ratio >= 0.8 ? "var(--warning)" : "var(--income)"

  return (
    <section
      className={cn(
        "rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)] sm:p-5",
        className
      )}
    >
      <div className={cn(totalOnPhoto && "hidden")}>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          {isBm ? "Jumlah belanja" : "Total spent"}
        </p>
        <p className="mt-1 text-[2rem] font-black leading-none tabular-nums tracking-tight text-[var(--text)] [overflow-wrap:anywhere] sm:text-4xl">
          {money(spent)}
        </p>
      </div>

      {hasBudget ? (
        <div className={cn(!totalOnPhoto && "mt-4")}>
          <div className="event-progress-track">
            <div
              className="event-progress-fill"
              style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: tone }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs font-bold">
            <span className="text-[var(--muted)]">
              {Math.round(ratio * 100)}% {isBm ? "daripada" : "of"} {money(budget)}
            </span>
            <span className={cn("tabular-nums", over ? "text-[var(--expense)]" : "text-[var(--text)]")}>
              {over
                ? isBm
                  ? `Lebih ${money(Math.abs(remaining || 0))}`
                  : `Over by ${money(Math.abs(remaining || 0))}`
                : isBm
                  ? `Baki ${money(remaining || 0)}`
                  : `${money(remaining || 0)} left`}
            </span>
          </div>
        </div>
      ) : (
        <p className={cn("text-xs font-bold text-[var(--muted)]", !totalOnPhoto && "mt-3")}>
          {isBm ? "Tiada had bajet ditetapkan" : "No budget limit set"}
        </p>
      )}

      {spark ? (
        <figure className="mt-4">
          <svg
            viewBox="0 0 100 28"
            preserveAspectRatio="none"
            className="h-12 w-full overflow-visible text-[var(--text-soft)]"
            role="img"
            aria-label={isBm ? "Perbelanjaan terkumpul mengikut tarikh" : "Running spend by date"}
          >
            <polygon points={`0,28 ${spark} 100,28`} fill="currentColor" opacity={0.08} />
            <polyline
              points={spark}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <figcaption className="mt-1 text-[0.625rem] font-semibold text-[var(--muted)]">
            {isBm ? "Perbelanjaan terkumpul" : "Running spend"}
          </figcaption>
        </figure>
      ) : null}

      <dl className="mt-4 grid grid-cols-3 border-t border-[var(--divider)] pt-3.5">
        <div className="min-w-0">
          <dt className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted)]">
            {isBm ? "Dikira" : "Counted"}
          </dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums text-[var(--text)]">
            {countedCount}
            <span className="font-semibold text-[var(--muted)]">/{totalCount}</span>
          </dd>
        </div>
        <div className="min-w-0 border-l border-[var(--divider)] pl-3">
          <dt className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted)]">
            {isBm ? "Diabai" : "Ignored"}
          </dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums text-[var(--text)]">{excludedCount}</dd>
        </div>
        <div className="min-w-0 border-l border-[var(--divider)] pl-3">
          <dt className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted)]">
            {isBm ? "Masuk" : "Income"}
          </dt>
          <dd
            className={cn(
              "mt-0.5 truncate text-sm font-black tabular-nums",
              income > 0 ? "text-[var(--income)]" : "text-[var(--text)]"
            )}
          >
            {income > 0 ? "+" : ""}
            {money(income)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
