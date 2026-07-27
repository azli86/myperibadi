"use client"

import type React from "react"
import { Banknote } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang"
import { CategoryIconGlyph } from "@/lib/category-icons"
import type { TransactionDetail } from "../types"

export type TxnSummaryCardProps = {
  txn: TransactionDetail
  transactionDateLabel: string
  formattedAmount: string
  amountClass: string
  badgeClass: string
  actions?: React.ReactNode
}

export default function TxnSummaryCard({
  txn,
  transactionDateLabel,
  formattedAmount,
  amountClass,
  badgeClass,
  actions,
}: TxnSummaryCardProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const isIncome = txn.type === "income"
  const sign = isIncome ? "+" : "-"
  const receiptNumber = txn.reference_id || `TXN-${txn.id}`

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-gradient-to-br from-[var(--card)] to-[var(--surface-tint)] p-5 md:p-6">
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[var(--accent)]/6 blur-3xl" />

      {/* Top: Icon + Vendor + Badges */}
      <div className="relative flex items-start gap-3 md:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--accent)] ring-1 ring-[var(--accent)]/10 md:h-14 md:w-14">
          {txn.category_icon_name ? (
            <CategoryIconGlyph iconName={txn.category_icon_name} categoryName={txn.category_name || undefined} size={26} />
          ) : (
            <Banknote size={26} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-base font-bold leading-tight text-[var(--text)] md:text-lg">
              {txn.vendor_or_source}
            </h2>
            {txn.is_refund && (
              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                Refund
              </span>
            )}
            {txn.has_been_refunded && (
              <span className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                badgeClass
              )}>
                {isBm ? "Direfund" : "Refunded"}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs font-medium text-[var(--muted)] md:text-sm">
            {receiptNumber} · {transactionDateLabel}
          </p>
        </div>
      </div>

      {/* Amount — own line, full visibility */}
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] md:text-xs">
          {isIncome ? (isBm ? "Pendapatan" : "Income") : (isBm ? "Perbelanjaan" : "Expense")}
        </p>
        <p className={cn("text-2xl font-black tabular-nums tracking-tight md:text-3xl", amountClass)}>
          {sign}RM {formattedAmount}
        </p>
      </div>

      {actions ? (
        <div className="relative mt-4 flex w-full flex-nowrap items-center justify-center gap-2 border-t border-[var(--border)] pt-4 sm:w-auto sm:flex-wrap md:justify-end">
          {actions}
        </div>
      ) : null}

      {txn.has_been_refunded && txn.refund_reference_id && (
        <div className="relative mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            {isBm ? "Rujukan Refund" : "Refund Reference"}
          </p>
          <a
            href={`/${txn.user_id}/transactions/${txn.refund_reference_id}`}
            className="mt-0.5 block text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            {txn.refund_reference_id}
            {txn.refund_txn_date ? ` · ${txn.refund_txn_date}` : ""}
          </a>
        </div>
      )}
    </div>
  )
}
