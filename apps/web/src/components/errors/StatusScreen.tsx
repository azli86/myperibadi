"use client"

import Link from "next/link"
import { AlertTriangle, ArrowLeft, Home, RefreshCw, SearchX } from "lucide-react"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { cn } from "@/lib/utils"

type StatusScreenProps = {
  code: string
  title: string
  description: string
  hint?: string
  primaryHref?: string
  primaryLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
  onRetry?: (() => void) | null
  retryLabel?: string
  tone?: "danger" | "neutral"
}

export default function StatusScreen({
  code,
  title,
  description,
  hint,
  primaryHref = "/",
  primaryLabel = "Back Home",
  secondaryHref,
  secondaryLabel,
  onRetry,
  retryLabel = "Try Again",
  tone = "neutral",
}: StatusScreenProps) {
  const isDanger = tone === "danger"

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--page-bg)] relative overflow-hidden">
      {/* Glow blobs — subtle, theme-aware */}
      <div className={cn(
        "absolute top-[-20%] left-[-10%] w-[48%] h-[48%] blur-[120px] rounded-full pointer-events-none",
        isDanger ? "bg-red-500/8" : "bg-[var(--accent)]/8"
      )} />
      <div className={cn(
        "absolute bottom-[-20%] right-[-10%] w-[48%] h-[48%] blur-[120px] rounded-full pointer-events-none",
        isDanger ? "bg-orange-500/8" : "bg-emerald-500/8"
      )} />

      <div className="w-full max-w-2xl relative z-10">
        <div className="bg-[var(--card)]/85 backdrop-blur-2xl border border-[var(--border)] rounded-[2rem] shadow-2xl p-8 md:p-10">
          <div className="flex flex-col items-center text-center">
            {/* Icon */}
            <div className={cn(
              "h-18 w-18 md:h-20 md:w-20 rounded-[1.75rem] flex items-center justify-center shadow-xl mb-6",
              isDanger
                ? "bg-red-500/10 text-red-500 shadow-red-500/10"
                : "bg-[var(--accent-soft)] text-[var(--accent)]"
            )}>
              {isDanger ? <AlertTriangle size={36} /> : <SearchX size={36} />}
            </div>

            {/* Code badge */}
            <p className={cn(
              "text-xs font-bold uppercase tracking-[0.35em] mb-3",
              isDanger ? "text-red-500" : "text-[var(--accent)]"
            )}>
              Error {code}
            </p>

            {/* Title */}
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--text)]">
              {title}
            </h1>

            {/* Description */}
            <p className="mt-4 text-base md:text-lg text-[var(--muted)] max-w-xl leading-relaxed">
              {description}
            </p>

            {/* Hint */}
            {hint ? (
              <p className="mt-3 text-sm text-[var(--muted)]/80 max-w-lg">
                {hint}
              </p>
            ) : null}

            {/* Actions */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              <Link
                href={primaryHref}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold shadow-xl transition-all hover:opacity-90 active:scale-[0.97]"
              >
                <Home size={18} />
                {primaryLabel}
              </Link>

              {secondaryHref && secondaryLabel ? (
                <HistoryBackButton
                  fallbackHref={secondaryHref}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] font-bold hover:bg-[var(--surface-tint-strong)] transition-all active:scale-[0.97]"
                >
                  <ArrowLeft size={18} />
                  {secondaryLabel}
                </HistoryBackButton>
              ) : null}

              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] font-bold hover:bg-[var(--surface-tint-strong)] transition-all active:scale-[0.97]"
                >
                  <RefreshCw size={18} />
                  {retryLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
