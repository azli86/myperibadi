"use client"

import type React from "react"
import { Banknote } from "lucide-react"
import { cn } from "@/lib/utils"
import { currencyFlag, formatCurrencyLabel } from "@/components/ui/MoneyAmount"
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
  const categoryName = txn.category_name || (isBm ? "Tiada Kategori" : "No Category")
  const currencyCode = formatCurrencyLabel(txn.wallet_currency)
  const currencyFlagEmoji = currencyFlag(txn.wallet_currency)

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-[#1a1a1a] p-6 text-[#f5f5f5] md:p-8">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

      <div className="relative flex flex-col items-center text-center">
        {/* Category icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#e5e5e5]">
          {txn.category_icon_name ? (
            <CategoryIconGlyph iconName={txn.category_icon_name} categoryName={txn.category_name || undefined} size={24} />
          ) : (
            <Banknote size={24} />
          )}
        </div>

        {/* Category — big */}
        <h2 className="mt-3 max-w-full break-words text-lg font-black leading-tight text-[#f5f5f5] md:text-xl">
          {categoryName}
        </h2>

        {/* Amount — big */}
        <p className={cn("mt-3 leading-none tabular-nums tracking-tight", amountClass, "text-5xl font-black md:text-6xl")}>
          {sign}{currencyFlagEmoji} {currencyCode} {formattedAmount}
        </p>

        {/* Transaction ID — small */}
        <p className="mt-3 text-xs font-bold text-[#8c8c8c]">
          {receiptNumber}
        </p>

        {/* Time — small */}
        <p className="mt-1 text-[0.625rem] font-semibold text-[#6b6b6b]">
          {transactionDateLabel}
        </p>

        {txn.is_refund || txn.has_been_refunded ? (
          <span className={cn(
            "mt-3 shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]",
            txn.is_refund
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : badgeClass
          )}>
            {txn.is_refund ? "Refund" : (isBm ? "Direfund" : "Refunded")}
          </span>
        ) : null}

        {actions ? (
          <div className="mt-5 flex items-center justify-center gap-6">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}
