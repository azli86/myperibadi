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
      title="Server Error"
      description="Something went wrong on this page. It may be a temporary issue with the app or the server connection."
      hint="If you see error 500, 502, 503, or 505, try refreshing. If it keeps happening, sign out and back in, or contact your admin."
      primaryHref="/"
      primaryLabel="Back to Home"
      secondaryHref="/login"
      secondaryLabel="Go to Login"
      onRetry={reset}
      retryLabel="Try Again"
      tone="danger"
    />
  )
}
