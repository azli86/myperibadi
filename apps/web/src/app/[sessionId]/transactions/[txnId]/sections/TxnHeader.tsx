"use client"

import { useLang } from "@/lib/lang"
import { MobilePageHeader } from "@/components/layout/PageHeader"
import type { TransactionDetail } from "../types"

export type TxnHeaderProps = {
  txn: TransactionDetail
  sessionId: string

}

export default function TxnHeader({
  txn,
  sessionId,
}: TxnHeaderProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const title = isBm ? "Butiran Transaksi" : "Transaction Details"
  const subtitle = `${txn.reference_id || `#${txn.id}`} · ${txn.vendor_or_source}`

  return (
    <>
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader
          title={title}
          fallbackHref={`/${sessionId}/transactions`}
          backPreferHistory
        />
        <p className="mt-2 truncate px-1 text-center text-xs font-semibold text-[var(--muted)]">{subtitle}</p>
      </div>

    </>
  )
}
