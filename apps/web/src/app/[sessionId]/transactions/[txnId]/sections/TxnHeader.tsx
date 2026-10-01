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
      <div className="md:hidden">
        <MobilePageHeader
          title={title}
          fallbackHref={`/${sessionId}/transactions`}
          backPreferHistory
          action={
            <button
              type="button"
              onClick={onDownloadReceipt}
              disabled={downloading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0550B8] px-3.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-40"
              style={{ color: "#ffffff" }}
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
