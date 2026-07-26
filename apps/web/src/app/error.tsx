"use client"

import { useEffect } from "react"
import StatusScreen from "@/components/errors/StatusScreen"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("App route error:", error)
  }, [error])

  return (
    <StatusScreen
      code="500"
      title="Ralat Server"
      description="Sesuatu telah berlaku pada halaman ini. Ia boleh jadi ralat sementara di aplikasi atau sambungan ke server."
      hint="Jika anda nampak ralat 500, 502, 503, atau 505, cuba refresh semula. Jika masih berulang, log masuk semula atau hubungi admin."
      primaryHref="/"
      primaryLabel="Pergi Ke Utama"
      secondaryHref="/login"
      secondaryLabel="Ke Log Masuk"
      onRetry={reset}
      retryLabel="Cuba Lagi"
      tone="danger"
    />
  )
}
