"use client"

import { useLayoutEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { PULL_REFRESH_LOGO_SRC } from "@/components/layout/pull-refresh-logo"

/** Pull distance (px) past which releasing triggers a refresh. */
export const PULL_REFRESH_THRESHOLD = 80

/**
 * The pull-to-refresh badge: the MyPeribadi logo in a round chip that follows
 * the finger down, with a ring that fills exactly at the release threshold.
 * Past it the logo grows a little and the ring turns green; while the refresh
 * runs it stays in place and the ring spins, then it fades out. The status
 * text is for screen readers only.
 */
export function PullToRefreshIndicator({
  pullDistance,
  refreshing,
  lang,
}: {
  pullDistance: number
  refreshing: boolean
  lang: string
}) {
  const isBm = lang === "BM"
  // Pages with a fixed top bar (MobilePageHeader, z-120) would hide the badge,
  // so it drops in just under that bar; without one it sits at the screen top.
  const [barBottom, setBarBottom] = useState(0)
  const active = refreshing || pullDistance > 0
  useLayoutEffect(() => {
    if (!active) return
    const bar = document.querySelector<HTMLElement>("[data-mobile-page-header]")
    const rect = bar?.getBoundingClientRect()
    setBarBottom(rect && rect.height > 0 ? Math.max(0, rect.bottom) : 0)
  }, [active])
  const progress = Math.min(pullDistance / PULL_REFRESH_THRESHOLD, 1)
  const ready = progress >= 1
  const visible = active
  // Follows the finger with some resistance; rests at a fixed spot while refreshing.
  const offset = refreshing ? 18 : Math.min(pullDistance, 120) * 0.45 - 18
  const circumference = 2 * Math.PI * 17
  const label = refreshing
    ? isBm ? "Mengemas kini…" : "Refreshing…"
    : ready
      ? isBm ? "Lepaskan untuk kemas kini" : "Release to refresh"
      : isBm ? "Tarik untuk kemas kini" : "Pull to refresh"

  return (
    <div
      aria-live="polite"
      data-motion
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[125] flex flex-col items-center",
        barBottom ? "pt-3" : "pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:pt-5"
      )}
      style={{
        top: barBottom,
        transform: `translateY(${offset}px)`,
        opacity: refreshing ? 1 : Math.min(pullDistance / 40, 1),
        transition: pullDistance > 0 && !refreshing ? "none" : "transform 260ms cubic-bezier(0.2,0.8,0.2,1), opacity 220ms ease-out",
        visibility: visible ? "visible" : "hidden",
      }}
    >
      <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[var(--card)] shadow-[0_10px_28px_-10px_rgba(0,0,0,0.45)] ring-1 ring-[var(--divider)]">
        <svg viewBox="0 0 44 44" className={cn("absolute inset-0 -rotate-90", refreshing && "animate-[ptrspin_0.9s_linear_infinite]")} aria-hidden>
          <circle cx="22" cy="22" r="17" fill="none" strokeWidth="3" stroke="var(--surface-tint-strong)" />
          <circle
            cx="22"
            cy="22"
            r="17"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke={ready || refreshing ? "var(--income)" : "var(--text-soft)"}
            strokeDasharray={circumference}
            strokeDashoffset={refreshing ? circumference * 0.7 : circumference * (1 - progress)}
            style={{ transition: "stroke 150ms ease" }}
          />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PULL_REFRESH_LOGO_SRC}
          alt=""
          aria-hidden
          decoding="sync"
          draggable={false}
          className="h-[26px] w-[26px] rounded-full object-cover transition-transform duration-200"
          style={{ transform: `scale(${ready || refreshing ? 1.12 : 0.9 + progress * 0.1})` }}
        />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}
