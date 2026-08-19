"use client"

import React, { useEffect, useState } from "react"
import { CheckCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useLang } from "@/lib/lang"

export default function DonateSuccessPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const { lang } = useLang()
  const isBm = lang === "BM"
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
        {loading ? (
          <div className="flex flex-col items-center py-10">
            <Loader2 className="mb-4 animate-spin text-pink-500" size={40} />
            <p className="text-sm font-medium text-[var(--muted)]">
              {isBm ? "Mengesahkan sumbangan awak..." : "Confirming your donation..."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckCircle size={40} strokeWidth={2.5} />
            </div>
            <h1 className="mb-3 text-2xl font-black tracking-tight text-[var(--text)]">
              {isBm ? "Terima Kasih!" : "Thank You!"}
            </h1>
            <p className="mb-8 max-w-[18rem] text-sm leading-relaxed text-[var(--muted)]">
              {isBm
                ? "Sumbangan awak telah berjaya diproses. Kami amat menghargai sokongan awak!"
                : "Your generous donation has been processed successfully. We truly appreciate your support!"}
            </p>
            <Link
              href={`/${sessionId}/donate`}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-8 text-sm font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-tint-strong)] active:scale-95"
            >
              {isBm ? "Kembali ke Donate" : "Back to Donate"}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
