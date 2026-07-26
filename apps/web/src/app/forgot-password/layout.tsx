import type { ReactNode } from "react"
import type { Viewport } from "next"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children
}
