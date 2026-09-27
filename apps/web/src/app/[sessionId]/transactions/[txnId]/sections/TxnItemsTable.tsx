"use client"

import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { useLang } from "@/lib/lang"
import type { TransactionDetail } from "../types"

export type TxnItemsTableProps = {
  txn: TransactionDetail
  receiptItems: NonNullable<TransactionDetail["items"]> | { id: number; name: string; quantity: number; unit_price: number; subtotal: number; sort_order: number }[]
  showDataSkeleton: boolean
  formatReceiptLineAmount: (value: number) => string
  formatReceiptLineQty: (value: number) => string
}

// Items laid out like the printed receipt they came from: one line per item,
// quantity and unit price under the name, and a dashed rule above the total.
export default function TxnItemsTable({
  txn,
  receiptItems,
  showDataSkeleton,
  formatReceiptLineAmount,
  formatReceiptLineQty,
}: TxnItemsTableProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const isIncome = txn.type === "income"
  const count = receiptItems.length

  return (
    <div className="rounded-[1.5rem] bg-[var(--card)] px-5 pb-4 pt-4 shadow-[var(--shadow-card)] md:px-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
          {isBm ? "Item" : "Items"}
        </h3>
        <span className="text-[0.6875rem] font-semibold tabular-nums text-[var(--muted)]">
          {count} {isBm ? "item" : count === 1 ? "item" : "items"}
        </span>
      </div>

      <ul className="mt-2">
        {receiptItems.map((item, index) => (
          <li key={`${item.id}-${index}`} className="flex items-start justify-between gap-4 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text)] [overflow-wrap:anywhere]">{item.name}</span>
              <span className="mt-0.5 block text-xs font-medium tabular-nums text-[var(--muted)]">
                {formatReceiptLineQty(item.quantity)} ×{" "}
                {showDataSkeleton ? <AmountSkeleton className="h-3 w-16" /> : formatReceiptLineAmount(item.unit_price)}
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">
              {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : formatReceiptLineAmount(item.subtotal)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-baseline justify-between border-t-2 border-dashed border-[var(--divider)] pt-3">
        <span className="text-sm font-black text-[var(--text)]">{isBm ? "Jumlah" : "Total"}</span>
        <span className="text-lg font-black tabular-nums text-[var(--text)]">
          {showDataSkeleton ? (
            <AmountSkeleton className="h-4 w-24" />
          ) : (
            <>
              {isIncome ? "+" : "−"}RM {txn.amount.toLocaleString(isBm ? "ms-MY" : "en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </>
          )}
        </span>
      </div>
    </div>
  )
}
