"use client"

import { useEffect, useRef } from "react"

type SwipeOptions = {
  threshold?: number
  maxTranslate?: number
}

/**
 * Swipe-down-to-close for bottom sheets — GLOBAL EVENT DELEGATION.
 *
 * Why delegation: React attaches root touch listeners as passive, so
 * preventDefault() inside React onTouchMove props is ignored. Attaching via
 * ref callbacks also proved fragile with conditionally-rendered portals.
 * Instead, ONE native listener set lives on document (touchmove with
 * { passive: false }) and resolves the sheet via closest("[data-swipe-sheet]").
 *
 * Usage: <div data-swipe-sheet {...swipe} />
 * - `ref` is a no-op kept for call-site compatibility.
 * - onClose is stored per-element in a WeakMap, refreshed every render.
 * - Scrollable areas inside a sheet should carry data-swipe-scroll; swipe is
 *   only allowed while that area is scrolled to the top.
 */

type SheetMeta = {
  onClose: () => void
  threshold: number
  maxTranslate: number
}

const SHEET_META = new WeakMap<HTMLElement, SheetMeta>()

let listenersInstalled = false
let activeSheet: HTMLElement | null = null
let startY = 0
let startX = 0
let dragging = false

function resetSheet(sheet: HTMLElement) {
  sheet.style.transition = "transform 180ms ease"
  sheet.style.transform = "translate3d(0, 0, 0)"
  sheet.style.opacity = ""
  window.setTimeout(() => {
    sheet.style.transition = ""
  }, 190)
}

function getScrollArea(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>("[data-swipe-scroll]")
    : null
}

function findSheet(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>("[data-swipe-sheet]")
    : null
}

function handleTouchStart(event: TouchEvent) {
  if (window.matchMedia("(min-width: 768px)").matches) return
  const sheet = findSheet(event.target)
  if (!sheet) {
    activeSheet = null
    return
  }
  const touch = event.touches[0]
  if (!touch) return
  activeSheet = sheet
  startY = touch.clientY
  startX = touch.clientX
  dragging = false
}

function handleTouchMove(event: TouchEvent) {
  const sheet = activeSheet
  if (!sheet || !SHEET_META.has(sheet)) return
  if (window.matchMedia("(min-width: 768px)").matches) return
  const meta = SHEET_META.get(sheet)!

  // Allow scrolling inner lists: only swipe when the scroll area is at top
  const scrollArea = getScrollArea(event.target)
  if (scrollArea && scrollArea.scrollTop > 0) {
    if (dragging) resetSheet(sheet)
    dragging = false
    return
  }
  if (!scrollArea && sheet.scrollTop > 0) {
    if (dragging) resetSheet(sheet)
    dragging = false
    return
  }

  const touch = event.touches[0]
  if (!touch) return
  const deltaY = touch.clientY - startY
  const deltaX = touch.clientX - startX
  if (deltaY <= 0 || Math.abs(deltaY) < Math.abs(deltaX)) return
  dragging = true
  if (event.cancelable) event.preventDefault()
  sheet.style.transition = "none"
  sheet.style.transform = `translate3d(0, ${Math.min(deltaY, meta.maxTranslate)}px, 0)`
}

function handleTouchEnd(event: TouchEvent) {
  const sheet = activeSheet
  const wasDragging = dragging
  activeSheet = null
  dragging = false
  if (!sheet || !wasDragging) return
  if (window.matchMedia("(min-width: 768px)").matches) return
  const meta = SHEET_META.get(sheet)
  if (!meta) return

  const transform = sheet.style.transform
  const match = transform.match(/translate3d\(0, ([0-9.]+)px, 0\)/)
  const translateY = match ? Number(match[1]) : 0
  if (translateY > meta.threshold) {
    sheet.style.transition = "transform 160ms ease, opacity 160ms ease"
    sheet.style.transform = "translate3d(0, 100%, 0)"
    sheet.style.opacity = "0"
    window.setTimeout(() => meta.onClose(), 120)
    return
  }
  resetSheet(sheet)
}

function handleTouchCancel() {
  const sheet = activeSheet
  const wasDragging = dragging
  activeSheet = null
  dragging = false
  if (sheet && wasDragging) resetSheet(sheet)
}

function ensureListeners() {
  if (listenersInstalled || typeof window === "undefined") return
  listenersInstalled = true
  document.addEventListener("touchstart", handleTouchStart, { passive: true })
  document.addEventListener("touchmove", handleTouchMove, { passive: false })
  document.addEventListener("touchend", handleTouchEnd, { passive: true })
  document.addEventListener("touchcancel", handleTouchCancel, { passive: true })
}

export function useSwipeDownToClose(onClose: () => void, options: SwipeOptions = {}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const thresholdRef = useRef(options.threshold ?? 92)
  const maxTranslateRef = useRef(options.maxTranslate ?? 180)
  thresholdRef.current = options.threshold ?? 92
  maxTranslateRef.current = options.maxTranslate ?? 180

  ensureListeners()

  // Register/refresh this sheet's metadata via ref (kept for call-site API).
  const ref = (element: HTMLElement | null) => {
    if (!element) return
    SHEET_META.set(element, {
      get onClose() {
        return onCloseRef.current
      },
      get threshold() {
        return thresholdRef.current
      },
      get maxTranslate() {
        return maxTranslateRef.current
      },
    })
  }

  return { ref }
}
