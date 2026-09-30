"use client"

import type React from "react"
import { ArrowLeftRight, Banknote } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang"
import { CategoryIconGlyph } from "@/lib/category-icons"
import type { TransactionDetail } from "../types"

export type TxnSummaryCardProps = {
  txn: TransactionDetail
  /** What the money was for, as the list shows it: merchant or description. */
  title: string
  transactionDateLabel: string
  formattedAmount: string
  amountClass: string
  badgeClass: string
  actions?: React.ReactNode
}

// The top of the transaction page in the Moden look: an outlined card over a
// blue circle, the amount as the largest thing, and round actions under it.
export default function TxnSummaryCard({
  txn,
  title,
  transactionDateLabel,
  formattedAmount,
  amountClass,
  badgeClass,
  actions,
}: TxnSummaryCardProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const isIncome = txn.type === "income"
  const isTransfer = Boolean(txn.is_wallet_transfer)
  const sign = isTransfer ? "" : isIncome ? "+" : "−"
  const receiptNumber = txn.reference_id || `TXN-${txn.id}`
  const categoryName = isTransfer
    ? isBm
      ? "Pindahan wallet"
      : "Wallet transfer"
    : txn.category_name || (isBm ? "Tiada Kategori" : "No Category")
  const typeLabel = isTransfer
    ? isBm ? "Pindahan" : "Transfer"
    : isIncome
      ? isBm ? "Pendapatan" : "Income"
      : isBm ? "Perbelanjaan" : "Expense"

  return (
    <section className="pt-2 md:pt-4">
      <div className="relative px-1 pt-3">
        <div aria-hidden className="absolute -right-2 -top-1 h-36 w-36 rounded-full bg-[#0878F8] md:-right-4 md:-top-4 md:h-52 md:w-52" />
        <div aria-hidden className="absolute right-6 top-7 h-16 w-16 rounded-full border-[1.5px] border-white opacity-35 md:right-6 md:top-8 md:h-24 md:w-24" />
        <div className="relative rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_24px_50px_-30px_rgba(0,0,0,0.6)] md:p-7">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text-soft)]">
              {isTransfer ? (
                <ArrowLeftRight size={22} />
              ) : txn.category_icon_name || txn.category_name ? (
                <CategoryIconGlyph iconName={txn.category_icon_name} categoryName={txn.category_name || undefined} kind={isIncome ? "income" : "expense"} size={24} />
              ) : (
                <Banknote size={22} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[1.0625rem] font-bold leading-tight text-[var(--text)] [overflow-wrap:anywhere] md:text-xl">
                {title}
              </h2>
              <p className="mt-1 text-[0.8125rem] font-medium text-[var(--muted)]">{categoryName}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--text-soft)]">
              <span className={cn("h-1.5 w-1.5 rounded-full", isTransfer ? "bg-[#0878F8]" : isIncome ? "bg-emerald-500" : "bg-rose-500")} />
              {typeLabel}
            </span>
            {txn.is_refund || txn.has_been_refunded ? (
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold",
                  txn.is_refund ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : badgeClass
                )}
              >
                {txn.is_refund ? "Refund" : isBm ? "Direfund" : "Refunded"}
              </span>
            ) : null}
          </div>

          <p className={cn("mt-3 flex items-start font-bold leading-none tabular-nums tracking-tight", amountClass)}>
            <span className="mr-1.5 mt-1 text-sm font-semibold opacity-70 md:text-base">{sign}RM</span>
            <span style={{ fontSize: "clamp(2.25rem, 11vw, 3.5rem)" }}>{formattedAmount}</span>
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-2xl border border-[var(--border)] px-3.5 py-3">
              <p className="text-[0.6875rem] font-medium text-[var(--muted)]">{isBm ? "Tarikh" : "Date"}</p>
              <p className="mt-1 text-[0.8125rem] font-semibold leading-snug text-[var(--text)]">{transactionDateLabel}</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[var(--border)] px-3.5 py-3">
              <p className="text-[0.6875rem] font-medium text-[var(--muted)]">{isBm ? "Rujukan" : "Reference"}</p>
              <p className="mt-1 truncate font-mono text-[0.75rem] font-semibold text-[var(--text)]">{receiptNumber}</p>
            </div>
          </div>
        </div>
      </div>

      {actions ? <div className="mx-auto mt-5 flex w-full max-w-sm items-start justify-center gap-3 md:hidden">{actions}</div> : null}
    </section>
  )
}

/** A round, labelled action like a banking app's: 48px target, label below. */
export function TxnActionButton({
  icon,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: "default" | "positive" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] transition group-active:scale-95",
          tone === "positive"
            ? "text-emerald-700 dark:text-emerald-400"
            : tone === "danger"
              ? "text-rose-600 dark:text-rose-400"
              : "text-[var(--text)]"
        )}
      >
        {icon}
      </span>
      <span className="text-[0.6875rem] font-semibold text-[var(--text-soft)]">{label}</span>
    </button>
  )
}
