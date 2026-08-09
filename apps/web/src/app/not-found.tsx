"use client"

import StatusScreen from "@/components/errors/StatusScreen"

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="Page Not Found"
      description="The page you are looking for does not exist or may have been moved."
      hint="Check the address or go back to the home page."
      primaryHref="/"
      primaryLabel="Back to Home"
      secondaryHref="/login"
      secondaryLabel="Go to Login"
      tone="neutral"
    />
  )
}
