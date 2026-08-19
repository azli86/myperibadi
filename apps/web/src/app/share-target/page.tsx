"use client"

import React, { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { ensureSessionId, getAccessToken, getRefreshToken } from "@/lib/auth-session"
import { PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY, SHARED_TRANSACTION_TOKEN_QUERY_KEY, getActiveSharedTransactionTokenStorageKey, getSharedTransactionPinBypassStorageKey } from "@/lib/share-target"

export default function ShareTargetPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const error = searchParams.get("error") || ""

  useEffect(() => {
    if (error) {
      router.replace("/")
      return
    }

    if (!token) {
      router.replace("/")
      return
    }

    localStorage.setItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY, token)
    const accessToken = getAccessToken()
    const refreshToken = getRefreshToken()
    if (!accessToken && !refreshToken) {
      router.replace(`/login?${SHARED_TRANSACTION_TOKEN_QUERY_KEY}=1`)
      return
    }

    const sessionId = ensureSessionId()
    if (!sessionId) {
      router.replace("/login")
      return
    }

    window.sessionStorage.setItem(`pin_verified_${sessionId}`, "true")
    window.sessionStorage.setItem(getSharedTransactionPinBypassStorageKey(sessionId), "true")
    window.sessionStorage.setItem(getActiveSharedTransactionTokenStorageKey(sessionId), token)
    localStorage.removeItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY)
    router.replace(`/${sessionId}`)
  }, [error, router, token])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-6 text-[var(--text)]">
      <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] px-5 py-4 text-sm font-semibold">
        <Loader2 size={18} className="animate-spin" />
        Preparing transaction update...
      </div>
    </main>
  )
}
