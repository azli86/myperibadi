"use client"

import { useEffect, useRef, useState } from "react"

type UseDelayedSkeletonOptions = {
  delayMs?: number
  minVisibleMs?: number
}

const DEFAULT_DELAY_MS = 0
const DEFAULT_MIN_VISIBLE_MS = 0

export function useDelayedSkeleton(active: boolean, options: UseDelayedSkeletonOptions = {}) {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  const minVisibleMs = options.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS
  const [visible, setVisible] = useState(false)
  const shownAtRef = useRef(0)

  useEffect(() => {
    let timer: number | null = null

    if (active) {
      if (visible) return undefined
      if (delayMs <= 0) {
        shownAtRef.current = Date.now()
        setVisible(true)
        return undefined
      }
      timer = window.setTimeout(() => {
        shownAtRef.current = Date.now()
        setVisible(true)
      }, delayMs)
    } else if (visible) {
      const elapsedMs = Date.now() - shownAtRef.current
      timer = window.setTimeout(() => setVisible(false), Math.max(minVisibleMs - elapsedMs, 0))
    }

    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [active, delayMs, minVisibleMs, visible])

  return visible
}
