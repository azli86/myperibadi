import type { ReactNode } from "react"
import type { Viewport } from "next"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children
}
