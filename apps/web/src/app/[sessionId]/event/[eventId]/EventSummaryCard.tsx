"use client"

import { CheckCircle2, CircleSlash, Receipt, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { MoneyAmount, formatCurrencyLabel, formatMoneyValue } from "@/components/ui/MoneyAmount"

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
  className?: string
}) {
  const money = (n: number) => `${formatCurrencyLabel(currency)} ${formatMoneyValue(n)}`
  const hasBudget = budget > 0
  const over = remaining != null && remaining < 0

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
            {isBm ? "Ringkasan acara" : "Event summary"}
          </p>
          <p className="mt-1.5 text-2xl font-black tabular-nums tracking-tight text-[var(--text)]">
            {money(spent)}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
            {isBm ? `${countedCount} daripada ${totalCount} transaksi dikira` : `${countedCount} of ${totalCount} transactions counted`}
          </p>
        </div>
      </div>

      {hasBudget ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[0.6875rem] font-bold">
            <span className="text-[var(--muted)]">
              {isBm ? "Daripada bajet" : "Of budget"} {money(budget)}
            </span>
            <span className={cn(over ? "text-[var(--expense)]" : "text-[var(--muted)]")}>
              {Math.round(ratio * 100)}%
            </span>
          </div>
          <div className="event-progress-track mt-2">
            <div
              className={cn(
                "event-progress-fill",
                ratio >= 1 ? "bg-[var(--expense)]" : ratio >= 0.8 ? "bg-amber-500" : "bg-[var(--income)]"
              )}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <p className={cn("mt-2 text-[0.6875rem] font-bold", over ? "text-[var(--expense)]" : "text-[var(--income)]")}>
            {over
              ? isBm
                ? `Lebih ${money(Math.abs(remaining || 0))}`
                : `Over by ${money(Math.abs(remaining || 0))}`
              : isBm
                ? `Baki ${money(remaining || 0)}`
                : `${money(remaining || 0)} left`}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[0.6875rem] font-bold text-[var(--muted)]">
          {isBm ? "Tiada had bajet ditetapkan" : "No budget limit set"}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
          <Receipt size={14} className="text-[var(--muted)]" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            {isBm ? "Dikira" : "Counted"}
          </p>
          <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
            {countedCount}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
          <CircleSlash size={14} className="text-[var(--muted)]" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            {isBm ? "Diabai" : "Ignored"}
          </p>
          <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
            {excludedCount}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
          <Wallet size={14} className="text-[var(--muted)]" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            {isBm ? "Masuk" : "Income"}
          </p>
          <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
            <MoneyAmount value={income} currency={currency} size="sm" />
          </p>
        </div>
      </div>
    </section>
  )
}
