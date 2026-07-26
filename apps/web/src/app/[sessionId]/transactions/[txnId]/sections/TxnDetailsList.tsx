"use client"

import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang"
import type { TransactionDetail } from "../types"

export type TxnDetailsListProps = {
  txn: TransactionDetail
  transactionDateLabel: string
  issuedDateLabel: string
  statusLabel: string
  sourceChannelLabel: string
  categoryLabel: string
  walletLabel: string
  displayNotes: string
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm font-medium text-[var(--text-soft)]">{label}</span>
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
  issuedDateLabel,
  statusLabel,
  sourceChannelLabel,
  categoryLabel,
  walletLabel,
  displayNotes,
}: TxnDetailsListProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const isWalletTransfer = Boolean(txn.is_wallet_transfer)

  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        {isBm ? "Maklumat Transaksi" : "Transaction Info"}
      </h3>
      <div className="divide-y divide-[var(--border)]">
        <Row label={isBm ? "Kategori" : "Category"} value={categoryLabel} />
        <Row label={isBm ? "Tarikh" : "Date"} value={transactionDateLabel} />
        <Row label={isBm ? "Dijana" : "Issued"} value={issuedDateLabel} />
        <Row label={isBm ? "Status" : "Status"} value={statusLabel} />
        <Row label={isBm ? "Cara Simpan" : "Saved Via"} value={sourceChannelLabel} />
        <Row label={isBm ? "Wallet" : "Wallet"} value={walletLabel} />
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
