"use client"

import { Undo2, Loader2 } from "lucide-react"
import { useLang } from "@/lib/lang"

export type TxnRefundModalProps = {
  open: boolean
  vendorOrSource: string
  originalAmount: number
  refundAmount: string
  refunding: boolean
  onAmountChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}

export default function TxnRefundModal({
  open,
  vendorOrSource,
  originalAmount,
  refundAmount,
  refunding,
  onAmountChange,
  onClose,
  onConfirm,
}: TxnRefundModalProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-transparent p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl border border-[var(--border)] bg-[var(--sheet-bg)] p-5 sm:max-w-[22rem] sm:rounded-3xl sm:p-6"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <Undo2 size={28} />
          </div>
          <h3 className="mb-1 text-lg font-semibold text-[var(--text)]">
            {isBm ? "Refund Transaksi" : "Refund Transaction"}
          </h3>
          <p className="mb-4 text-sm font-medium leading-relaxed text-[var(--muted)]">
            {isBm
              ? `Buat transaksi refund untuk "${vendorOrSource}". Amaun asal: RM ${originalAmount.toFixed(2)}.`
              : `Create a refund for "${vendorOrSource}". Original amount: RM ${originalAmount.toFixed(2)}.`}
          </p>
          <div className="mb-4 w-full">
            <label className="mb-1.5 block text-left text-xs font-semibold text-[var(--muted)]">
              {isBm ? "Amaun Refund (RM)" : "Refund Amount (RM)"}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={refundAmount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-center text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] transition-colors focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div className="grid w-full grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] py-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {isBm ? "Batal" : "Cancel"}
            </button>
            <button
              onClick={onConfirm}
              disabled={refunding}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
            >
              {refunding ? <Loader2 size={16} className="animate-spin" /> : <><Undo2 size={14} /> {isBm ? "Refund" : "Refund"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
