"use client"

import React from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Info, CheckCircle2, X, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"

export type AlertType = "info" | "success" | "warning" | "error"

interface ModernAlertProps {
  isOpen: boolean
  onClose: () => void
  onConfirm?: () => void
  title: string
  description: string
  type?: AlertType
  confirmText?: string
  cancelText?: string
  isConfirm?: boolean
}

export function ModernAlert({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  type = "info",
  confirmText = "OK",
  cancelText = "Batal",
  isConfirm = false,
}: ModernAlertProps) {
  const [mounted, setMounted] = React.useState(false)
  const isSuccessToast = type === "success" && !isConfirm
  const alertSwipe = useSwipeDownToClose(onClose)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!isOpen || !isSuccessToast) return
    const timer = window.setTimeout(() => {
      onClose()
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [isOpen, isSuccessToast, onClose])

  const iconMap = {
    info: <Info size={22} />,
    success: <CheckCircle2 size={22} />,
    warning: <AlertTriangle size={22} />,
    error: <XCircle size={22} />,
  }

  const toneMap = {
    info: {
      icon: "bg-sky-500/12 text-sky-500 ring-sky-500/15",
      confirm: "bg-sky-500 text-white shadow-sky-500/20",
      glow: "bg-sky-500/10",
    },
    success: {
      icon: "bg-emerald-500/12 text-emerald-500 ring-emerald-500/15",
      confirm: "bg-emerald-500 text-white shadow-emerald-500/20",
      glow: "bg-emerald-500/10",
    },
    warning: {
      icon: "bg-amber-500/12 text-amber-500 ring-amber-500/15",
      confirm: "bg-amber-500 text-white shadow-amber-500/20",
      glow: "bg-amber-500/10",
    },
    error: {
      icon: "bg-rose-500/12 text-rose-500 ring-rose-500/15",
      confirm: "bg-rose-500 text-white shadow-rose-500/20",
      glow: "bg-rose-500/10",
    },
  }

  const handleConfirm = () => {
    onConfirm?.()
    onClose()
  }

  const alertNode = isOpen ? (
        isSuccessToast ? (
          <div className="pointer-events-none fixed inset-x-0 top-3 z-[520] flex justify-center px-3 sm:top-4">
            <div
              className="pointer-events-auto inline-flex max-w-[min(94vw,640px)] items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-[var(--text)]"
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/18 text-[var(--text)] ring-1 ring-emerald-400/25">
                <CheckCircle2 size={14} />
              </span>
              <p className="min-w-0 truncate text-[0.8rem] font-bold tracking-[0.01em] text-[var(--text)]">
                {title}
              </p>
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-[520] flex touch-none items-end justify-center overflow-hidden bg-black/50 p-0 sm:items-center">
            <div
              onClick={onClose}
              onTouchMove={(event) => event.preventDefault()}
              className="absolute inset-0 bg-transparent"
            />
            <div
              data-swipe-sheet
              {...alertSwipe}
              onClick={(event) => event.stopPropagation()}
              style={{ transform: "translateZ(0)" }}
              className={cn(
                "app-sheet-panel relative w-full overflow-hidden border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-2xl will-change-transform sm:max-w-sm sm:p-6",
                "text-[var(--text)]"
              )}
            >

              <div className="relative flex items-start gap-4">
                <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1", toneMap[type].icon)}>
                  {iconMap[type]}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--muted)] transition hover:text-[var(--text)]"
                  aria-label="Close alert"
                >
                  <X size={16} />
                </button>
                <div className="min-w-0 flex-1 pr-9">
                  <h3 className="text-lg font-black leading-tight tracking-tight text-[var(--text)]">
                    {title}
                  </h3>
                  {description && (
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--muted)]">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              <div className={cn("relative mt-6 grid gap-3", isConfirm ? "grid-cols-2" : "grid-cols-1")}>
                {isConfirm && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-12 rounded-2xl border border-[color:var(--border)] bg-[var(--surface-tint)] text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
                  >
                    {cancelText}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={cn(
                    "h-12 rounded-2xl text-sm font-black shadow-lg transition active:scale-[0.98]",
                    toneMap[type].confirm
                  )}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </div>
        )
  ) : null

  if (!mounted) return null

  return createPortal(alertNode, document.body)
}
