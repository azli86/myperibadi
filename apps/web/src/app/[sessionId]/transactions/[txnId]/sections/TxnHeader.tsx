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
        />
      </div>
    </>
  )
}
