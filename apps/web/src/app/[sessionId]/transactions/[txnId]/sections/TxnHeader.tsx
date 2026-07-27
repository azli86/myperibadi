"use client"

import React, { useEffect, useRef, useState } from "react"
import { MoreVertical } from "lucide-react"
import { useLang } from "@/lib/lang"
import { MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import type { TransactionDetail } from "../types"

export type TxnHeaderProps = {
  txn: TransactionDetail
  sessionId: string
  actions?: React.ReactNode
}

export default function TxnHeader({
  txn,
  sessionId,
  actions,
}: TxnHeaderProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const title = isBm ? "Butiran Transaksi" : "Transaction Details"

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  return (
    <>
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader
          title={title}
          fallbackHref={`/${sessionId}/transactions`}
          backPreferHistory
          action={
            actions ? (
              <div ref={menuRef} className="relative">
                <MobileIconButton
                  onClick={() => setMenuOpen((v) => !v)}
                  label={isBm ? "Menu" : "Menu"}
                >
                  <MoreVertical size={16} />
                </MobileIconButton>
                {menuOpen ? (
                  <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg shadow-black/10">
                    {actions}
                  </div>
                ) : null}
              </div>
            ) : undefined
          }
        />
      </div>
    </>
  )
}
