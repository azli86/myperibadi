"use client"

import React from "react"
import Link from "next/link"
import { ArrowLeft, ChevronRight } from "lucide-react"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { cn } from "@/lib/utils"

/** Shared mobile header — same visual language as desktop top bar. */
export function MobilePageHeader({
  title,
  fallbackHref,
  action,
  className,
  backPreferHistory,
}: {
  title: string
  fallbackHref: string
  action?: React.ReactNode
  className?: string
  backPreferHistory?: boolean
}) {
  return (
    <div className={cn("px-1 pb-1 pt-0", className)}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 pt-0.5">
        <HistoryBackButton
          fallbackHref={fallbackHref}
          preferHistory={backPreferHistory}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)] transition active:scale-95"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </HistoryBackButton>
        <h1 className="min-w-0 truncate text-center text-2xl font-extrabold tracking-tight text-[var(--text)] sm:text-3xl">
          {title}
        </h1>
        <div className="flex min-h-9 min-w-9 shrink-0 items-center justify-end gap-1.5">
          {action ?? <span className="h-9 w-9" aria-hidden />}
        </div>
      </div>
    </div>
  )
}

/** Mobile header action — matches desktop accent CTA. */
export function MobileIconButton({
  children,
  onClick,
  label,
  disabled,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm shadow-black/10 transition active:scale-95",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Shared size for every top-bar control (primary + chip). */
export const DESKTOP_TOPBAR_CONTROL =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold leading-none whitespace-nowrap [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"

/** Primary CTA used in desktop top bars — accent by default (vehicle style). */
export function DesktopPageAction({
  children,
  onClick,
  type = "button",
  disabled,
  variant = "accent",
  className,
  tabIndex,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  disabled?: boolean
  /** accent = brand accent fill (default); solid = ink on paper */
  variant?: "solid" | "accent"
  className?: string
  tabIndex?: number
  "aria-label"?: string
  "aria-hidden"?: boolean | "true" | "false"
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
      className={cn(
        DESKTOP_TOPBAR_CONTROL,
        "transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variant === "solid"
          ? "bg-[var(--text)] text-[var(--bg)] shadow-sm shadow-black/5"
          : "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-sm shadow-black/10",
        className
      )}
    >
      {children}
    </button>
  )
}

/** Secondary chip/status control in desktop top bars (same height as primary). */
export function DesktopPageChip({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const classes = cn(
    DESKTOP_TOPBAR_CONTROL,
    "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]",
    onClick && "cursor-pointer transition active:scale-[0.98]",
    className,
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {children}
      </button>
    )
  }
  return <div className={classes}>{children}</div>
}

/**
 * Sticky desktop top bar for personal boards.
 * Title left, actions right — sticks to the shell main scrollport.
 * Keep this element OUTSIDE any overflow-x-hidden / overflow-hidden wrappers.
 */
export function DesktopPageHeader({
  title,
  actions,
  className,
  backHref,
  backPreferHistory,
  breadcrumbs,
  homeHref,
  showBack,
}: {
  title: string
  actions?: React.ReactNode
  className?: string
  backHref?: string
  backPreferHistory?: boolean
  breadcrumbs?: Array<string | { label: string; href?: string }>
  homeHref?: string
  showBack?: boolean
}) {
  const rawItems = breadcrumbs ?? []
  const breadcrumbItems: Array<{ label: string; href?: string }> = [
    { label: "Home", href: homeHref },
    ...rawItems.map((item) => (typeof item === "string" ? { label: item } : item)),
    { label: title },
  ]
  return (
    <header
      className={cn(
        "portal-desktop-topbar sticky top-0 z-50 w-full shrink-0 border-b border-[var(--border)] bg-[var(--bg)]",
        className,
      )}
    >
      <div className="flex h-8 w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {showBack && backHref ? (
            <HistoryBackButton
              fallbackHref={backHref}
              preferHistory={backPreferHistory}
              aria-label="Back"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)] transition active:scale-95"
            >
              <ArrowLeft size={16} strokeWidth={2.5} />
            </HistoryBackButton>
          ) : null}
          <nav className="flex min-w-0 items-center gap-1.5 text-sm font-medium tracking-tight md:text-[0.9375rem]" aria-label="Breadcrumb">
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1
              return (
                <React.Fragment key={`${item.label}-${index}`}>
                  {index > 0 ? (
                    <ChevronRight size={13} strokeWidth={2.25} className="shrink-0 text-[var(--muted)]" />
                  ) : null}
                  {isLast ? (
                    <h1 className="min-w-0 truncate text-[var(--muted)]">{item.label}</h1>
                  ) : item.href ? (
                    <Link href={item.href} className="shrink-0 text-[var(--text)] transition hover:text-[var(--accent2)]">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-[var(--text)]">{item.label}</span>
                  )}
                </React.Fragment>
              )
            })}
          </nav>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2.5">{actions}</div> : null}
      </div>
    </header>
  )
}

/** Constrained content width under a full-bleed desktop top bar */
export function DesktopPageBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("portal-page-body", className)}>{children}</div>
}

export function PageContentContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1280px] ${className}`}>{children}</div>
}
