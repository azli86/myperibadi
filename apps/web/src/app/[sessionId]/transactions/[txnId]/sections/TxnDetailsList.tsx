"use client"

import { cn } from "@/lib/utils"
import { Wallet } from "lucide-react"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useLang } from "@/lib/lang"
import type { TransactionDetail } from "../types"

export type TxnDetailsListProps = {
  txn: TransactionDetail
  transactionDateLabel: string
  statusLabel: string
  sourceChannelLabel: string
  categoryLabel: string
  walletLabel: string
  displayNotes: string
  merchantLabel?: string
}

function Row({ label, value, leading, children }: { label: string; value?: string; leading?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-soft)]">
        {leading}
        {label}
      </span>
      {children ?? (
        <span className="max-w-[60%] text-right text-sm font-semibold text-[var(--text)]">
          {value}
        </span>
      )}
    </div>
  )
}

export default function TxnDetailsList({
  txn,
  transactionDateLabel,
  statusLabel,
  sourceChannelLabel,
  categoryLabel,
  walletLabel,
  displayNotes,
  merchantLabel,
}: TxnDetailsListProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const isWalletTransfer = Boolean(txn.is_wallet_transfer)

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        {isBm ? "Maklumat Transaksi" : "Transaction Info"}
      </h3>
      <div className="divide-y divide-[var(--border)]">
        {merchantLabel && (
          <Row label={isBm ? "Peniaga / Penerangan" : "Merchant / Description"} value={merchantLabel} />
        )}
        <Row
          label={isBm ? "Kategori" : "Category"}
          value={categoryLabel}
          leading={
            txn.category_name || txn.category_icon_name ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                <CategoryIconGlyph
                  iconName={txn.category_icon_name}
                  categoryName={txn.category_name}
                  kind={txn.type}
                  size={18}
                  brandScale={1}
                  brandFramed={false}
                  brandFill
                />
              </span>
            ) : null
          }
        />
        <Row label={isBm ? "Tarikh" : "Date"} value={transactionDateLabel} />
        <Row label={isBm ? "Status" : "Status"} value={statusLabel} />
        <Row label={isBm ? "Cara Simpan" : "Saved Via"} value={sourceChannelLabel} />
        <Row
          label={isBm ? "Wallet" : "Wallet"}
          value={walletLabel}
          leading={
            txn.wallet_image_url ? (
              <img
                src={txn.wallet_image_url}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--surface-tint)] text-[var(--muted)]">
                <Wallet size={14} />
              </span>
            )
          }
        />
        {txn.linked_loan_name && (
          <Row label={isBm ? "Pinjaman Dikait" : "Linked Loan"} value={txn.linked_loan_name} />
        )}
        {txn.linked_subscription_name && (
          <Row label={isBm ? "Langganan Dikait" : "Linked Subscription"} value={txn.linked_subscription_name} />
        )}
      </div>

      {displayNotes && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            {isBm ? "Nota" : "Notes"}
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text)]">
            {displayNotes}
          </p>
        </div>
      )}

      {isWalletTransfer && (
        <div className={cn(
          "mt-4 rounded-xl border px-4 py-3.5 text-sm font-medium",
          "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300"
        )}>
          {isBm ? "Pemindahan wallet tidak boleh diubah suai atau direfund." : "Wallet transfers cannot be edited or refunded."}
        </div>
      )}
    </div>
  )
}
