"use client"

import React from "react"
import { Download, Loader2 } from "lucide-react"
import { useLang } from "@/lib/lang"
import { MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import type { TransactionDetail } from "../types"

export type TxnHeaderProps = {
  txn: TransactionDetail
  sessionId: string
  onDownloadReceipt: () => void
  downloading: boolean
}

export default function TxnHeader({
  txn,
  sessionId,
  onDownloadReceipt,
  downloading,
}: TxnHeaderProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const title = isBm ? "Butiran Transaksi" : "Transaction Details"

  return (
    <>
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader
          title={title}
          fallbackHref={`/${sessionId}/transactions`}
          backPreferHistory
          action={
            <button
              type="button"
              onClick={onDownloadReceipt}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-40"
              aria-label={isBm ? "Muat turun resit" : "Download receipt"}
            >
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {isBm ? "Resit" : "Receipt"}
            </button>
          }
        />
      </div>
    </>
  )
}
