"use client"

import { useEffect } from "react"
import StatusScreen from "@/components/errors/StatusScreen"
import "./globals.css"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global app error:", error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <StatusScreen
          code="500"
          title="Aplikasi Bermasalah"
          description="Aplikasi tidak dapat memaparkan halaman ini buat masa sekarang."
          hint="Ini meliputi ralat server seperti 500 atau ralat kritikal lain pada root app. Cuba refresh semula atau kembali ke halaman utama."
          primaryHref="/"
          primaryLabel="Pergi Ke Utama"
          secondaryHref="/login"
          secondaryLabel="Ke Log Masuk"
          onRetry={reset}
          retryLabel="Cuba Lagi"
          tone="danger"
        />
      </body>
    </html>
  )
}
