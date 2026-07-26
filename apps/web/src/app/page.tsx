"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ensureSessionId,
  getAccessToken,
  getRefreshToken,
  getSessionId,
  getLoginRedirectPath,
} from "@/lib/auth-session"

export default function RootRedirector() {
  const router = useRouter()

  useEffect(() => {
    const token = getAccessToken()
    const refreshToken = getRefreshToken()
    const hasStoredAuth = Boolean(token || refreshToken)

    if (!hasStoredAuth) {
      router.replace("/login")
      return
    }

    const sessionId = ensureSessionId() ?? getSessionId()
    if (sessionId) {
      router.replace(getLoginRedirectPath(sessionId))
    } else {
      router.replace("/login")
    }
  }, [router])

  return (
    <div className="min-h-screen bg-[var(--card3)] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--text)] border-t-transparent animate-spin" />
    </div>
  )
}
