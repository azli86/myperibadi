"use client"

import React, { useState } from "react"
import { Heart, Download, Loader2 } from "lucide-react"
import { useParams } from "next/navigation"
import { useLang } from "@/lib/lang"
import { MobilePageHeader } from "@/components/layout/PageHeader"

const DONATE_QR_URL = "/assets/images/donate/tng-qr.jpg"

export default function DonatePage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const { lang } = useLang()
  const isBm = lang === "BM"
  const [downloading, setDownloading] = useState(false)

  async function downloadQr() {
    setDownloading(true)
    try {
      const res = await fetch(DONATE_QR_URL)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "tng-support-qr.jpg"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      window.open(DONATE_QR_URL, "_blank")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      <div className="md:hidden">
        <MobilePageHeader
          title={isBm ? "Sokong Kami" : "Support Us"}
          fallbackHref={`/${sessionId}`}
        />
      </div>

      <div className="mx-auto max-w-md px-1 md:px-4 md:py-8">
        <div className="mb-6 hidden text-center md:block">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-500/30">
            <Heart size={28} className="text-white" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">
            {isBm ? "Sokong Kami" : "Support Us"}
          </h1>
        </div>

        <p className="mb-6 text-center text-sm leading-relaxed text-[var(--muted)]">
          {isBm
            ? "Scan QR Touch n Go di bawah untuk beri sokongan. Terima kasih atas sumbangan ikhlas anda."
            : "Scan the Touch n Go QR below to support us. Thank you for your kind contribution."}
        </p>

        <div className="rounded-[20px] border border-purple-500/15 bg-purple-500/5 p-5">
          <p className="text-center text-[0.65rem] font-black uppercase tracking-[0.14em] text-purple-400">
            {isBm ? "QR TNG" : "TNG QR"}
          </p>
          <div className="mx-auto mt-4 max-w-[280px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-md">
            <img
              src={DONATE_QR_URL}
              alt={isBm ? "QR sokongan TNG" : "TNG support QR"}
              className="block h-auto w-full object-contain"
              loading="eager"
            />
          </div>
          <p className="mt-4 text-center text-xs font-medium text-[var(--muted)]">
            {isBm
              ? "Buka app Touch n Go eWallet → Scan QR → Bayar"
              : "Open Touch n Go eWallet → Scan QR → Pay"}
          </p>
          <button
            type="button"
            onClick={downloadQr}
            disabled={downloading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {isBm ? "Muat Turun QR" : "Download QR"}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-center">
          <Heart size={18} className="mx-auto text-pink-500" fill="currentColor" />
          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
            {isBm ? "Terima kasih atas sokongan anda" : "Thank you for your support"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {isBm
              ? "Setiap sumbangan bantu kami terus bangunkan app ini."
              : "Every contribution helps us keep building this app."}
          </p>
        </div>
      </div>
    </div>
  )
}
