"use client"

import { useRef } from "react"
import type { TouchEvent } from "react"

type SwipeOptions = {
  threshold?: number
  maxTranslate?: number
}

export function useSwipeDownToClose(onClose: () => void, options: SwipeOptions = {}) {
  const startYRef = useRef(0)
  const startXRef = useRef(0)
  const draggingRef = useRef(false)
  const threshold = options.threshold ?? 92
  const maxTranslate = options.maxTranslate ?? 180

  const getSheet = (target: EventTarget | null) =>
    target instanceof HTMLElement ? target.closest<HTMLElement>("[data-swipe-sheet]") : null

  const getScrollArea = (target: EventTarget | null) =>
    target instanceof HTMLElement ? target.closest<HTMLElement>("[data-swipe-scroll]") : null

  const resetSheet = (target: EventTarget | null, fallback?: HTMLElement) => {
    const sheet = getSheet(target) || fallback
    if (!sheet) return
    sheet.style.transition = "transform 180ms ease"
    sheet.style.transform = "translate3d(0, 0, 0)"
    sheet.style.opacity = ""
    window.setTimeout(() => {
      sheet.style.transition = ""
    }, 190)
  }

  return {
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      event.stopPropagation()
      if (window.matchMedia("(min-width: 768px)").matches) return
      const touch = event.touches[0]
      if (!touch) return
      startYRef.current = touch.clientY
      startXRef.current = touch.clientX
      draggingRef.current = false
    },
    onTouchMove: (event: TouchEvent<HTMLElement>) => {
      event.stopPropagation()
      if (window.matchMedia("(min-width: 768px)").matches) return
      const sheet = getSheet(event.target) || event.currentTarget
      const scrollArea = getScrollArea(event.target)
      if (scrollArea && scrollArea.scrollTop > 0) return
      if (!scrollArea && event.currentTarget.scrollTop > 0) return
      const touch = event.touches[0]
      if (!touch) return
      const deltaY = touch.clientY - startYRef.current
      const deltaX = touch.clientX - startXRef.current
      if (deltaY <= 0 || Math.abs(deltaY) < Math.abs(deltaX)) return
      draggingRef.current = true
      event.preventDefault()
      sheet.style.transition = "none"
      sheet.style.transform = `translate3d(0, ${Math.min(deltaY, maxTranslate)}px, 0)`
    },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      event.stopPropagation()
      if (window.matchMedia("(min-width: 768px)").matches) return
      const sheet = getSheet(event.target) || event.currentTarget
      const transform = sheet.style.transform
      const match = transform.match(/translate3d\(0, ([0-9.]+)px, 0\)/)
      const translateY = match ? Number(match[1]) : 0
      if (draggingRef.current && translateY > threshold) {
        sheet.style.transition = "transform 160ms ease, opacity 160ms ease"
        sheet.style.transform = "translate3d(0, 100%, 0)"
        sheet.style.opacity = "0"
        window.setTimeout(onClose, 120)
        return
      }
      resetSheet(event.target, event.currentTarget)
    },
    onTouchCancel: (event: TouchEvent<HTMLElement>) => {
      event.stopPropagation()
      resetSheet(event.target, event.currentTarget)
    },
  }
}
