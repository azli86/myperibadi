"use client"

import { useState, useEffect } from "react"
import { WifiOff, RefreshCw, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-auto p-6 bg-[var(--page-bg)] relative">
      {/* Glow blobs — subtle, theme-aware */}
      <div className="absolute top-[-20%] left-[-10%] w-[48%] h-[48%] blur-[120px] rounded-full pointer-events-none bg-amber-500/10" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[48%] h-[48%] blur-[120px] rounded-full pointer-events-none bg-orange-500/10" />

      <div className="w-full max-w-2xl relative z-10">
        <div className="bg-[var(--card)]/85 backdrop-blur-2xl border border-[var(--border)] rounded-[2rem] shadow-2xl p-8 md:p-10">
          <div className="flex flex-col items-center text-center">
            {/* Icon */}
            <div className="h-18 w-18 md:h-20 md:w-20 rounded-[1.75rem] flex items-center justify-center shadow-xl mb-6 bg-amber-500/10 text-amber-500 shadow-amber-500/10">
              <WifiOff size={36} />
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.35em] mb-3 text-amber-500">
              No Internet Connection
            </p>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--text)]">
              You are offline
            </h1>

            <p className="mt-4 text-base md:text-lg text-[var(--muted)] max-w-xl leading-relaxed">
              Please check your internet connection. The app will resume automatically once your network is available.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              {isOnline ? (
                <Link
                  href="/"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold shadow-xl transition-all hover:opacity-90 active:scale-[0.97]"
                >
                  <RefreshCw size={18} />
                  Retry Connection
                </Link>
              ) : (
                <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] font-bold">
                  <RefreshCw size={18} className="animate-pulse" />
                  Waiting for connection...
                </div>
              )}

              <Link
                href="/"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] font-bold hover:bg-[var(--surface-tint-strong)] transition-all active:scale-[0.97]"
              >
                <ArrowLeft size={18} />
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
