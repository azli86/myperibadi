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
    <div className="flex min-h-12 items-center justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm font-medium text-[var(--muted)]">{label}</span>
      {children ?? (
        <span className="flex min-w-0 items-center justify-end gap-2 text-right text-sm font-bold text-[var(--text)]">
          {leading}
          <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
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
    <div className="rounded-[1.5rem] bg-[var(--card)] px-5 pb-3 pt-4 shadow-[var(--shadow-card)] md:px-6">
      <h3 className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
        {isBm ? "Maklumat Transaksi" : "Transaction Info"}
      </h3>
      {/* --divider, not --border: --border is transparent in every theme. */}
      <div className="mt-1 divide-y divide-[var(--divider)]">
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
        <div className="mb-2 mt-2 rounded-2xl bg-[var(--surface-tint-strong)] p-3.5">
          <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
            {isBm ? "Nota" : "Notes"}
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text)]">
            {displayNotes}
          </p>
        </div>
      )}

      {isWalletTransfer && (
        <div className={cn(
          "mb-2 mt-2 rounded-2xl border px-4 py-3.5 text-sm font-medium",
          "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        )}>
          {isBm ? "Pemindahan wallet tidak boleh diubah suai atau direfund." : "Wallet transfers cannot be edited or refunded."}
        </div>
      )}
    </div>
  )
}
