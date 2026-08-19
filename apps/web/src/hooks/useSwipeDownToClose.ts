"use client"

import { useEffect } from "react"

type SwipeOptions = {
  threshold?: number
  maxTranslate?: number
  velocityThreshold?: number
}

/**
 * Swipe-down-to-close was REMOVED.
 *
 * The global touchmove delegation fought with native inner-content scrolling
 * on every sheet (crazy scroll jitters). Sheets now close via their header
 * Cancel/X button, backdrop tap, or Android back gesture only — 100% native
 * scrolling, zero gesture conflicts.
 *
 * This hook is kept as a no-op so the ~23 call sites (`{...swipe}` +
 * `data-swipe-sheet`) need no changes. `data-swipe-sheet` is inert; the
 * matching CSS overlay-dim rule still applies harmlessly.
 */
export function useSwipeDownToClose(_onClose: () => void, _options: SwipeOptions = {}) {
  useEffect(() => {
    // intentionally empty — swipe-to-close disabled
  }, [])

  // Callback ref accepting any element — matches the old API shape
  // ({...swipe} spread onto divs/sections) without pinning a specific type.
  const ref = (_element: HTMLElement | null) => {}
  return { ref }
}
