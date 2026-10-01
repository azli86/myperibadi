"use client"

import { useState } from "react"
import { CalendarHeart, Loader2 } from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { cn } from "@/lib/utils"

export const PERIOD_TRACKER_EVENT = "period-tracker-changed"

/**
 * The Settings switch for Period Tracker. Off by default; turning it on adds
 * the page to the menu (the shell listens for PERIOD_TRACKER_EVENT), turning
 * it off hides it again. Recorded periods are kept either way.
 */
export function PeriodTrackerToggle({
  enabled,
  isBm,
  onChanged,
  onError,
  className,
}: {
  enabled: boolean
  isBm: boolean
  onChanged: (next: boolean) => void
  onError?: (message: string) => void
  className?: string
}) {
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !enabled
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ period_tracker_enabled: next }),
      })
      if (!res.ok) throw new Error("save failed")
      onChanged(next)
      window.dispatchEvent(new CustomEvent(PERIOD_TRACKER_EVENT, { detail: { enabled: next } }))
    } catch {
      onError?.(isBm ? "Tetapan Period Tracker tidak dapat disimpan." : "The Period Tracker setting could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => void toggle()}
      disabled={saving}
      className={cn(
        "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] disabled:opacity-60",
        className
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
        <CalendarHeart size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--text)] md:text-sm">
          Period Tracker
          <span className="rounded-full border border-[var(--border)] px-1.5 py-px text-[0.625rem] font-semibold text-[var(--muted)]">Beta</span>
        </p>
        <p className="truncate text-[0.7rem] text-[var(--muted)]">
          {isBm ? "Kalendar & ramalan kitaran. Hanya anda yang nampak." : "Cycle calendar & predictions. Only you can see it."}
        </p>
      </div>
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          enabled ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--surface-tint-strong)] ring-1 ring-[var(--border)]"
        )}
      >
        {saving ? (
          <Loader2 size={12} className="absolute left-1/2 -translate-x-1/2 animate-spin text-[var(--muted)]" />
        ) : (
          <span
            className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-[22px]" : "translate-x-0.5")}
          />
        )}
      </span>
    </button>
  )
}
