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
          title="App Unavailable"
          description="The app could not display this page right now."
          hint="This covers server errors like 500 or other critical errors at the root app. Try refreshing or go back to the home page."
          primaryHref="/"
          primaryLabel="Back to Home"
          secondaryHref="/login"
          secondaryLabel="Go to Login"
          onRetry={reset}
          retryLabel="Try Again"
          tone="danger"
        />
      </body>
    </html>
  )
}
