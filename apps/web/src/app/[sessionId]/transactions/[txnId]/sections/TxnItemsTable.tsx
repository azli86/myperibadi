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

  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        {isBm ? "Item" : "Items"}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              <th className="pb-2.5 pt-1">{isBm ? "Item / Harga" : "Item / Price"}</th>
              <th className="pb-2.5 pt-1 text-center">Qty</th>
              <th className="pb-2.5 pt-1 text-right">{isBm ? "Jumlah" : "Amount"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {receiptItems.map((item, index) => (
              <tr key={`${item.id}-${index}`}>
                <td className="py-3 pr-3">
                  <p className="font-semibold text-[var(--text)]">{item.name}</p>
                  <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
                    @ {showDataSkeleton ? <AmountSkeleton className="h-3 w-16" /> : formatReceiptLineAmount(item.unit_price)}
                  </p>
                </td>
                <td className="py-3 text-center tabular-nums text-[var(--text)]">
                  {formatReceiptLineQty(item.quantity)}
                </td>
                <td className="py-3 text-right tabular-nums font-semibold text-[var(--text)]">
                  {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : formatReceiptLineAmount(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border-strong)]">
              <td className="py-3 pr-3 text-sm font-bold text-[var(--text)]">
                {isBm ? "Jumlah" : "Total"}
              </td>
              <td className="py-3" />
              <td className="py-3 text-right text-base font-black tabular-nums text-[var(--text)]">
                {showDataSkeleton ? <AmountSkeleton className="h-4 w-24" /> : <>{isIncome ? "+" : "-"}RM {txn.amount.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
