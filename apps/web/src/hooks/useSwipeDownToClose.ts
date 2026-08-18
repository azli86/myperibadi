"use client"

import { useCallback, useEffect, useRef } from "react"

type SwipeOptions = {
  threshold?: number
  maxTranslate?: number
}

/**
 * Swipe-down-to-close for bottom sheets.
 *
 * IMPORTANT: uses native touch listeners ({ passive: false }) instead of React
 * onTouchMove props. React attaches root touch listeners as passive, so
 * event.preventDefault() inside React handlers is ignored on most browsers —
 * the browser hijacks the gesture for scrolling and the sheet never closes.
 *
 * Usage: <div data-swipe-sheet {...swipe} />
 * The hook returns { ref }. Because most sheets render conditionally
 * ({ open && <div .../> }), listeners are attached inside the ref callback
 * (runs on mount/unmount of the element) instead of useEffect.
 * Scrollable areas inside the sheet should carry data-swipe-scroll; swipe is
 * only allowed when that area is scrolled to the top.
 */
export function useSwipeDownToClose(onClose: () => void, options: SwipeOptions = {}) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const thresholdRef = useRef(options.threshold ?? 92)
  const maxTranslateRef = useRef(options.maxTranslate ?? 180)
  thresholdRef.current = options.threshold ?? 92
  maxTranslateRef.current = options.maxTranslate ?? 180

  return {
    ref: useCallback((element: HTMLElement | null) => {
      if (!element || typeof window === "undefined") return

      let startY = 0
      let startX = 0
      let dragging = false
      let active = false

      const getScrollArea = (target: EventTarget | null) =>
        target instanceof HTMLElement ? target.closest<HTMLElement>("[data-swipe-scroll]") : null

      const reset = () => {
        element.style.transition = "transform 180ms ease"
        element.style.transform = "translate3d(0, 0, 0)"
        element.style.opacity = ""
        window.setTimeout(() => {
          element.style.transition = ""
        }, 190)
      }

      const onTouchStart = (event: TouchEvent) => {
        if (window.matchMedia("(min-width: 768px)").matches) return
        const touch = event.touches[0]
        if (!touch) return
        startY = touch.clientY
        startX = touch.clientX
        dragging = false
        active = true
      }

      const onTouchMove = (event: TouchEvent) => {
        if (!active) return
        if (window.matchMedia("(min-width: 768px)").matches) return
        const scrollArea = getScrollArea(event.target)
        if (scrollArea && scrollArea.scrollTop > 0) return
        if (!scrollArea && element.scrollTop > 0) return
        const touch = event.touches[0]
        if (!touch) return
        const deltaY = touch.clientY - startY
        const deltaX = touch.clientX - startX
        if (deltaY <= 0 || Math.abs(deltaY) < Math.abs(deltaX)) return
        dragging = true
        if (event.cancelable) event.preventDefault()
        element.style.transition = "none"
        element.style.transform = `translate3d(0, ${Math.min(deltaY, maxTranslateRef.current)}px, 0)`
      }

      const onTouchEnd = () => {
        if (!active) return
        active = false
        if (window.matchMedia("(min-width: 768px)").matches) return
        const transform = element.style.transform
        const match = transform.match(/translate3d\(0, ([0-9.]+)px, 0\)/)
        const translateY = match ? Number(match[1]) : 0
        if (dragging && translateY > thresholdRef.current) {
          element.style.transition = "transform 160ms ease, opacity 160ms ease"
          element.style.transform = "translate3d(0, 100%, 0)"
          element.style.opacity = "0"
          window.setTimeout(() => onCloseRef.current(), 120)
          return
        }
        if (dragging) reset()
      }

      const onTouchCancel = () => {
        if (!active) return
        active = false
        if (dragging) reset()
      }

      element.addEventListener("touchstart", onTouchStart, { passive: true })
      element.addEventListener("touchmove", onTouchMove, { passive: false })
      element.addEventListener("touchend", onTouchEnd, { passive: true })
      element.addEventListener("touchcancel", onTouchCancel, { passive: true })

      // React 19: ref callback may return a cleanup function (runs on unmount)
      return () => {
        element.removeEventListener("touchstart", onTouchStart)
        element.removeEventListener("touchmove", onTouchMove)
        element.removeEventListener("touchend", onTouchEnd)
        element.removeEventListener("touchcancel", onTouchCancel)
      }
    }, []),
  }
}
