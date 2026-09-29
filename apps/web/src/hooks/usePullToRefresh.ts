"use client"

import { useCallback, useRef, useState } from "react"
import type React from "react"
import { PULL_REFRESH_THRESHOLD } from "@/components/layout/PullToRefreshIndicator"

/**
 * Pull-to-refresh gesture: a vertical pull from the top of the page past
 * PULL_REFRESH_THRESHOLD, released, calls onRefresh. Spread `handlers` on the
 * element the page scrolls in, and render <PullToRefreshIndicator> with
 * `pullDistance` and `refreshing`.
 *
 * Because the Shell uses it on every page, a pull is ignored when it cannot
 * mean "refresh": it starts below the top of the page, inside an inner list
 * or table that is itself scrolled down, inside a sheet or dialog, on
 * anything marked data-prevent-pull-refresh, or turns out to be a sideways
 * swipe (carousels, tables).
 */
export function usePullToRefresh({ enabled, onRefresh }: { enabled: boolean; onRefresh: () => Promise<void> }) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const distanceRef = useRef(0)

  const setDistance = (d: number) => {
    distanceRef.current = d
    setPullDistance(d)
  }

  const reset = () => {
    startRef.current = null
    setDistance(0)
  }

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      startRef.current = null
      if (!enabled || refreshing) return
      // On large screens the page scrolls inside the element these handlers
      // sit on, not the window, so its own scroll position counts too.
      const root = event.currentTarget as Element
      if (!isAtPageTop() || root.scrollTop > 4 || shouldIgnoreTarget(event.target, root)) return
      const t = event.touches[0]
      if (!t) return
      startRef.current = { x: t.clientX, y: t.clientY }
      setDistance(0)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, refreshing]
  )

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    const start = startRef.current
    if (!start) return
    const t = event.touches[0]
    if (!t) return
    const dy = t.clientY - start.y
    const dx = Math.abs(t.clientX - start.x)
    // Deadzone: taps with a little finger drift are not pulls.
    if (dy < 10) {
      if (distanceRef.current) setDistance(0)
      return
    }
    // Sideways intent (carousel, table scroll): drop this gesture.
    if (dx > 18 && dx > dy * 0.6) {
      reset()
      return
    }
    const next = Math.min(120, Math.pow(dy, 0.92))
    // One light tick as the pull crosses the release point, where supported.
    if (distanceRef.current < PULL_REFRESH_THRESHOLD && next >= PULL_REFRESH_THRESHOLD) {
      try {
        navigator.vibrate?.(8)
      } catch {}
    }
    setDistance(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!startRef.current) return
    const fire = distanceRef.current >= PULL_REFRESH_THRESHOLD
    reset()
    if (!fire) return
    setRefreshing(true)
    onRefresh().finally(() => setRefreshing(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRefresh])

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    pullDistance,
    refreshing,
  }
}

function isAtPageTop() {
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 4
}

/** True when the touch starts somewhere a downward pull means something else. */
function shouldIgnoreTarget(target: EventTarget, root: EventTarget) {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-prevent-pull-refresh="true"], [data-swipe-sheet], [role="dialog"], .app-sheet-panel')) return true
  // An inner scroller that is not at its own top should scroll, not refresh.
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (el.scrollTop > 0) {
      const oy = getComputedStyle(el).overflowY
      if (oy === "auto" || oy === "scroll") return true
    }
  }
  return false
}
