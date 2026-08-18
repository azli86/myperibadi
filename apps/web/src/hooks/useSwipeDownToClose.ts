"use client"

import { useEffect, useRef } from "react"

type SwipeOptions = {
  threshold?: number
  maxTranslate?: number
  /** px/ms — flick faster than this closes even on a short drag */
  velocityThreshold?: number
}

/**
 * Swipe-down-to-close for bottom sheets — GLOBAL EVENT DELEGATION.
 *
 * Why delegation: React attaches root touch listeners as passive, so
 * preventDefault() inside React onTouchMove props is ignored. Attaching via
 * ref callbacks is also fragile with conditionally-rendered portals.
 * Instead, ONE native listener set lives on document (touchmove with
 * { passive: false }) and resolves the sheet via closest("[data-swipe-sheet]").
 *
 * Closing: the sheet closes when EITHER
 *  - dragged past `threshold` px (default 72), OR
 *  - flicked with velocity > `velocityThreshold` px/ms while dragged > 24px
 *    (a quick short flick still closes — matches native sheet feel).
 *
 * Usage: <div data-swipe-sheet {...swipe} />
 * - `ref` is kept for call-site compatibility ({...swipe} spread).
 * - onClose/threshold options are stored per-element in a WeakMap (getters
 *   read the latest refs on every gesture).
 * - Scrollable areas inside a sheet should carry data-swipe-scroll; swipe is
 *   only allowed while that area is scrolled to the top.
 */

type SheetMeta = {
  onClose: () => void
  threshold: number
  maxTranslate: number
  velocityThreshold: number
}

const SHEET_META = new WeakMap<HTMLElement, SheetMeta>()

let listenersInstalled = false
let activeSheet: HTMLElement | null = null
let startY = 0
let startX = 0
let startTime = 0
let lastY = 0
let lastTime = 0
let velocity = 0 // px/ms, downward positive
let dragging = false

function resetSheet(sheet: HTMLElement) {
  sheet.style.transition = "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)"
  sheet.style.transform = "translate3d(0, 0, 0)"
  sheet.style.opacity = ""
  window.setTimeout(() => {
    sheet.style.transition = ""
  }, 210)
}

function closeSheet(sheet: HTMLElement) {
  const meta = SHEET_META.get(sheet)
  sheet.style.transition = "transform 180ms cubic-bezier(0.32, 0.72, 0, 1), opacity 180ms ease"
  sheet.style.transform = "translate3d(0, 100%, 0)"
  sheet.style.opacity = "0"
  window.setTimeout(() => {
    sheet.style.transition = ""
    sheet.style.transform = ""
    sheet.style.opacity = ""
    const handler = meta
      ? meta.onClose
      : null
    if (handler) handler()
  }, 160)
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

function readTranslateY(sheet: HTMLElement) {
  const transform = sheet.style.transform
  const match = transform.match(/translate3d\(\s*0(?:px)?\s*,\s*([0-9.]+)px\s*,\s*0(?:px)?\s*\)/)
  return match ? Number(match[1]) : 0
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
  startTime = performance.now()
  lastY = startY
  lastTime = startTime
  velocity = 0
  dragging = false
}

function handleTouchMove(event: TouchEvent) {
  const sheet = activeSheet
  if (!sheet || !SHEET_META.has(sheet)) return
  if (window.matchMedia("(min-width: 768px)").matches) return
  const meta = SHEET_META.get(sheet)!

  const touch = event.touches[0]
  if (!touch) return
  const now = performance.now()
  const dy = touch.clientY - lastY
  const dt = now - lastTime
  if (dt > 0) {
    // smoothed velocity (px/ms, downward positive)
    velocity = 0.7 * velocity + 0.3 * (dy / dt)
  }
  lastY = touch.clientY
  lastTime = now

  const deltaY = touch.clientY - startY
  const deltaX = touch.clientX - startX

  // Once dragging, keep preventing default even if the finger wanders, so the
  // browser can't steal the gesture mid-drag (which would fire touchcancel).
  if (dragging) {
    if (event.cancelable) event.preventDefault()
    const clamped = Math.max(deltaY, 0)
    sheet.style.transform = `translate3d(0, ${Math.min(clamped, meta.maxTranslate)}px, 0)`
    return
  }

  // Allow scrolling inner lists: only swipe when the scroll area is at top
  const scrollArea = getScrollArea(event.target)
  if (scrollArea && scrollArea.scrollTop > 0) return
  if (!scrollArea && sheet.scrollTop > 0) return

  if (deltaY <= 0 || Math.abs(deltaY) < Math.abs(deltaX)) return
  if (deltaY < 4) return // tiny debounce before committing to the drag

  dragging = true
  if (event.cancelable) event.preventDefault()
  sheet.style.transition = "none"
  sheet.style.transform = `translate3d(0, ${Math.min(deltaY, meta.maxTranslate)}px, 0)`
}

function finishGesture() {
  const sheet = activeSheet
  const wasDragging = dragging
  activeSheet = null
  dragging = false
  if (!sheet || !wasDragging || !SHEET_META.has(sheet)) return
  if (window.matchMedia("(min-width: 768px)").matches) return
  const meta = SHEET_META.get(sheet)!

  const translateY = readTranslateY(sheet)
  const elapsed = performance.now() - startTime
  const avgVelocity = elapsed > 0 ? (lastY - startY) / elapsed : 0

  const draggedFar = translateY > meta.threshold
  const flicked =
    translateY > 24 &&
    (velocity > meta.velocityThreshold || avgVelocity > meta.velocityThreshold)

  if (draggedFar || flicked) {
    closeSheet(sheet)
    return
  }
  resetSheet(sheet)
}

function handleTouchEnd() {
  finishGesture()
}

function handleTouchCancel() {
  // Some browsers cancel the touch when a system gesture interferes; if the
  // sheet was already dragged far, still close instead of snapping back.
  finishGesture()
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

  const thresholdRef = useRef(options.threshold ?? 56)
  const maxTranslateRef = useRef(options.maxTranslate ?? 260)
  const velocityThresholdRef = useRef(options.velocityThreshold ?? 0.4)
  thresholdRef.current = options.threshold ?? 56
  maxTranslateRef.current = options.maxTranslate ?? 260
  velocityThresholdRef.current = options.velocityThreshold ?? 0.4

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
      get velocityThreshold() {
        return velocityThresholdRef.current
      },
    })
  }

  return { ref }
}
