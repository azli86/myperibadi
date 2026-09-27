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

// The top of the transaction page, in the same plain style as the phone home:
// no card, everything centred on the page, the amount as the largest thing.
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

  return (
    <section className="flex flex-col items-center px-3 pb-2 pt-4 text-center md:pt-6">
      <span className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[var(--card)] text-[var(--text-soft)] shadow-[var(--shadow-card)]">
        {isTransfer ? (
          <ArrowLeftRight size={26} />
        ) : txn.category_icon_name || txn.category_name ? (
          <CategoryIconGlyph iconName={txn.category_icon_name} categoryName={txn.category_name || undefined} kind={isIncome ? "income" : "expense"} size={28} />
        ) : (
          <Banknote size={26} />
        )}
      </span>

      <h2 className="mt-3 max-w-full text-lg font-black leading-tight tracking-tight text-[var(--text)] [overflow-wrap:anywhere] md:text-xl">
        {title}
      </h2>
      <p className="mt-1 text-xs font-bold text-[var(--muted)]">{categoryName}</p>

      <p className={cn("mt-4 font-black leading-none tabular-nums tracking-tight", amountClass)}>
        <span className="mr-1 align-top text-lg font-bold opacity-70 md:text-xl">{sign}RM</span>
        <span className="text-[2.75rem] md:text-6xl">{formattedAmount}</span>
      </p>

      <p className="mt-3 text-xs font-semibold text-[var(--text-soft)]">{transactionDateLabel}</p>
      <p className="mt-1 font-mono text-[0.6875rem] font-semibold text-[var(--muted)]">{receiptNumber}</p>

      {txn.is_refund || txn.has_been_refunded ? (
        <span
          className={cn(
            "mt-3 rounded-full border px-2.5 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-[0.08em]",
            txn.is_refund ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : badgeClass
          )}
        >
          {txn.is_refund ? "Refund" : isBm ? "Direfund" : "Refunded"}
        </span>
      ) : null}

      {actions ? <div className="mt-6 flex w-full max-w-sm items-start justify-center gap-3">{actions}</div> : null}
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
          "flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card)] shadow-[var(--shadow-card)] transition group-active:scale-95",
          tone === "positive"
            ? "text-emerald-700 dark:text-emerald-400"
            : tone === "danger"
              ? "text-rose-600 dark:text-rose-400"
              : "text-[var(--text)]"
        )}
      >
        {icon}
      </span>
      <span className="text-[0.6875rem] font-bold text-[var(--text-soft)]">{label}</span>
    </button>
  )
}
