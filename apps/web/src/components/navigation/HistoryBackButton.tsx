"use client"

import React from "react"
import { useRouter } from "next/navigation"

type HistoryBackButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  fallbackHref?: string
  preferReplace?: boolean
  preferHistory?: boolean
}

function forceScrollTop() {
  if (typeof window === "undefined") return
  try {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual"
    }
  } catch {
    /* ignore */
  }
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  } catch {
    window.scrollTo(0, 0)
  }
  try {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  } catch {
    /* ignore */
  }
  document
    .querySelectorAll<HTMLElement>("main, .portal-desktop-main, .portal-app-shell")
    .forEach((el) => {
      el.scrollTop = 0
    })
}

export default function HistoryBackButton({
  fallbackHref,
  preferReplace = false,
  preferHistory = false,
  onClick,
  children,
  ...buttonProps
}: HistoryBackButtonProps) {
  const router = useRouter()

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event)
    if (event.defaultPrevented) return

    if (preferHistory && typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }

    // Prefer explicit navigation so we control scroll (router.back restores mid-page).
    if (fallbackHref) {
      if (preferReplace) {
        router.replace(fallbackHref, { scroll: true })
      } else {
        router.push(fallbackHref, { scroll: true })
      }
      forceScrollTop()
      window.setTimeout(forceScrollTop, 50)
      window.setTimeout(forceScrollTop, 200)
      return
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      forceScrollTop()
      window.setTimeout(forceScrollTop, 50)
      window.setTimeout(forceScrollTop, 200)
      return
    }
  }

  return (
    <button type="button" onClick={handleClick} {...buttonProps}>
      {children}
    </button>
  )
}
