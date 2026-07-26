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
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--accent)] md:h-14 md:w-14">
          {txn.category_icon_name ? (
            <CategoryIconGlyph iconName={txn.category_icon_name} categoryName={txn.category_name || undefined} size={26} />
          ) : (
            <Banknote size={26} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-[var(--text)] md:text-lg">
              {txn.vendor_or_source}
            </h2>
            {txn.is_refund && (
              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                {isBm ? "Refund" : "Refund"}
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
          <p className="mt-0.5 truncate text-xs font-medium text-[var(--muted)] md:text-sm">
            {receiptNumber} · {transactionDateLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-lg font-black tabular-nums tracking-tight md:text-2xl", amountClass)}>
            {sign}RM {formattedAmount}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] md:text-xs">
            {isIncome ? (isBm ? "Pendapatan" : "Income") : (isBm ? "Perbelanjaan" : "Expense")}
          </p>
        </div>
      </div>

      {actions ? (
        <div className="mt-4 flex w-full flex-nowrap items-center justify-center gap-2 border-t border-[var(--border)] pt-4 sm:w-auto sm:flex-wrap md:justify-end">
          {actions}
        </div>
      ) : null}

      {txn.has_been_refunded && txn.refund_reference_id && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
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
