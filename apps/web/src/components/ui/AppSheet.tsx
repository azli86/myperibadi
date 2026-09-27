"use client"

import React, { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"

type AppSheetProps = {
  /** Whether the sheet is shown. The sheet is unmounted while closed. */
  open: boolean
  /** Called once the user dismisses the sheet (X, Cancel, backdrop, back button or swipe). */
  onClose: () => void
  /** Unique id for the back-button stack (useOverlayBackClose). */
  id: string
  title: string
  eyebrow?: string
  subtitle?: string
  icon?: React.ReactNode
  /** Right-hand header action, e.g. a Save button. Adds a Cancel on the left. */
  action?: React.ReactNode
  /** Sticky area under the scrolling content, e.g. primary buttons. */
  footer?: React.ReactNode
  /** Panel width on sm+ screens; phones always get a full-width bottom sheet. */
  size?: "sm" | "md" | "lg" | "xl"
  /** Hide the phone bottom nav while open, so it cannot cover the last rows. */
  hideBottomNav?: boolean
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

const WIDTH = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-lg", xl: "sm:max-w-3xl" } as const

/**
 * The app's popup sheet: bottom sheet on phones, centred dialog from sm up.
 * It wires up what every sheet in the app repeats by hand: portal, scrim,
 * tap-outside, swipe-down and back-button close, the shared header, and
 * hiding the bottom nav. Its look comes from .app-sheet-panel and
 * AppSheetHeader, so it matches the existing sheets exactly.
 */
export function AppSheet({
  open,
  onClose,
  id,
  title,
  eyebrow,
  subtitle,
  icon,
  action,
  footer,
  size = "md",
  hideBottomNav = true,
  className,
  bodyClassName,
  children,
}: AppSheetProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { requestClose } = useOverlayBackClose({ id, isOpen: open, onClose })
  const swipe = useSwipeDownToClose(requestClose)

  useEffect(() => {
    if (!open || !hideBottomNav) return
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: true } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [open, hideBottomNav])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none sm:items-center sm:p-4"
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        data-swipe-sheet
        {...swipe}
        className={cn(
          "app-sheet-panel relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--sheet-bg)]",
          WIDTH[size],
          className
        )}
      >
        <AppSheetHeader title={title} eyebrow={eyebrow} subtitle={subtitle} icon={icon} action={action} onClose={requestClose} />
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 md:px-6", bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <div className="border-t border-[var(--divider)] bg-[var(--sheet-bg)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-6">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export default AppSheet
