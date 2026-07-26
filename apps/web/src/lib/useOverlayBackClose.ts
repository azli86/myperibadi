"use client"

import { useCallback, useEffect, useRef } from "react"

type UseOverlayBackCloseOptions = {
  id: string
  isOpen: boolean
  onClose: () => void
}

export function useOverlayBackClose({ id, isOpen, onClose }: UseOverlayBackCloseOptions) {
  const onCloseRef = useRef(onClose)
  const isActiveRef = useRef(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return

    isActiveRef.current = true
    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        __budgetDigitalOverlay: id,
        __budgetDigitalOverlayKey: `${id}:${Date.now()}`,
      },
      "",
    )

    const handlePopState = () => {
      if (!isActiveRef.current) return

      isActiveRef.current = false
      const pendingAction = pendingActionRef.current
      pendingActionRef.current = null
      onCloseRef.current()

      if (pendingAction) {
        window.setTimeout(() => {
          pendingAction()
        }, 0)
      }
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      isActiveRef.current = false
      pendingActionRef.current = null
    }
  }, [id, isOpen])

  const requestClose = useCallback(() => {
    if (typeof window === "undefined" || !isOpen || !isActiveRef.current) {
      onCloseRef.current()
      return
    }

    pendingActionRef.current = null
    window.history.back()
  }, [isOpen])

  const requestCloseThen = useCallback(
    (action: () => void) => {
      if (typeof window === "undefined" || !isOpen || !isActiveRef.current) {
        onCloseRef.current()
        window.setTimeout(() => {
          action()
        }, 0)
        return
      }

      pendingActionRef.current = action
      window.history.back()
    },
    [isOpen],
  )

  return { requestClose, requestCloseThen }
}
