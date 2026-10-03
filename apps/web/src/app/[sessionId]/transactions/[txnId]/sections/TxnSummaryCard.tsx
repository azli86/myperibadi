"use client"

import type React from "react"
import { ArrowLeftRight, Banknote, CalendarDays, Hash } from "lucide-react"
import { HERO_CHIP, HERO_CHIP_LINE, HERO_MUTED, HERO_TEXT, ModenHero, ModenHeroPill } from "@/components/ui/ModenHero"
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

// The top of the transaction page: the Moden hero card, the amount as the
// largest thing, date and reference in its strip, round actions under it.
export default function TxnSummaryCard({
  txn,
  title,
  transactionDateLabel,
  formattedAmount,
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
      <ModenHero
        label={
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: HERO_CHIP, color: HERO_TEXT, border: `1px solid ${HERO_CHIP_LINE}` }}>
              {isTransfer ? (
                <ArrowLeftRight size={17} />
              ) : txn.category_icon_name || txn.category_name ? (
                <CategoryIconGlyph iconName={txn.category_icon_name} categoryName={txn.category_name || undefined} kind={isIncome ? "income" : "expense"} size={18} />
              ) : (
                <Banknote size={17} />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="line-clamp-2 break-words font-bold leading-snug [overflow-wrap:anywhere]" style={{ color: HERO_TEXT, fontSize: "1rem" }}>{title}</span>
              <span className="line-clamp-1 font-medium [overflow-wrap:anywhere]" style={{ color: HERO_MUTED, fontSize: "0.75rem" }}>{categoryName}</span>
            </span>
          </>
        }
        actions={
          <>
            {txn.is_refund || txn.has_been_refunded ? (
              <ModenHeroPill dot="#4ADE80">{txn.is_refund ? "Refund" : isBm ? "Direfund" : "Refunded"}</ModenHeroPill>
            ) : null}
            <ModenHeroPill dot={isTransfer ? "#7DD3FC" : isIncome ? "#4ADE80" : "#FF7A7A"}>{typeLabel}</ModenHeroPill>
          </>
        }
        currency={`${sign}RM`}
        amount={formattedAmount}
        amountSize="clamp(2.5rem, 11vw, 3.5rem)"
        stats={[
          { key: "date", tone: "neutral", icon: <CalendarDays size={16} strokeWidth={2.2} />, label: isBm ? "Tarikh" : "Date", value: transactionDateLabel },
          { key: "ref", tone: "neutral", icon: <Hash size={16} strokeWidth={2.2} />, label: isBm ? "Rujukan" : "Reference", value: <span className="font-mono">{receiptNumber}</span> },
        ]}
      />

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
