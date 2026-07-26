"use client"

import { useState, useEffect } from "react"
import { WifiOff, RefreshCw, ArrowLeft } from "lucide-react"

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
 <main className="fixed inset-0 z-[9999] flex h-dvh w-dvw items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 text-white">
      <section className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl md:p-10">
        <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-3xl bg-amber-500/20 blur-xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/30">
            <WifiOff size={36} className="text-white" />
          </div>
        </div>

        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-400">
          No Internet Connection
        </p>

        <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">
          You are offline
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          Please check your internet connection. The app will resume once your network is available.
        </p>

        <div className="mt-8 space-y-3">
          {isOnline ? (
            <a
              href="/"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-slate-900 transition-all hover:bg-slate-100 active:scale-[0.97]"
            >
              <RefreshCw size={18} />
              Retry Connection
            </a>
          ) : (
            <div className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-black text-slate-300">
              <RefreshCw size={18} className="animate-pulse" />
              Waiting for connection...
            </div>
          )}

          <a
            href="/"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 text-sm font-bold text-slate-300 transition-all hover:bg-white/5 active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            Back to Home
          </a>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Auto-retrying connection
        </div>
      </section>
    </main>
  )
}
