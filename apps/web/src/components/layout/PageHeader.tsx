"use client"

import React, { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ActionsAfterHero, useRegisterActions, usePageHasHero } from "@/components/layout/pageActions"

/**
 * Shared mobile top bar. At the top of the page it is a large title resting on
 * the page itself; once the page scrolls the title shrinks. The bar's height never changes: only a transform and an opacity
 * animate, so nothing is laid out again while the finger is scrolling (a
 * changing height made the page shake under the finger on phones).
 */
export function MobilePageHeader({
  title,
  fallbackHref,
  action,
  className,
  backPreferHistory,
  alignLeft,
  beta,
}: {
  title: string
  fallbackHref: string
  action?: React.ReactNode
  className?: string
  backPreferHistory?: boolean
  alignLeft?: boolean
  beta?: boolean
}) {
  const hasHero = usePageHasHero()
  useRegisterActions(action, "md:hidden lg:hidden "+"flex w-full flex-wrap gap-2 px-1 pb-2 pt-3 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:basis-[calc(50%-0.25rem)] [&>div]:flex [&>div]:gap-2 [&>div>*]:flex-1")
  const headerRef = useRef<HTMLDivElement>(null)
  const [spacer, setSpacer] = useState(0)
  const [compact, setCompact] = useState(false)
  const compactRef = useRef(false)

  // Fixed header leaves the flow — keep an in-flow spacer the same height so
  // page content is never covered and the header is truly pinned to the top.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const update = () => setSpacer(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Phones scroll the window; larger screens scroll the Shell's <main>.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const main = el.closest("main")
    const read = () => {
      const y = Math.max(window.scrollY || document.documentElement.scrollTop || 0, main?.scrollTop || 0)
      // A little hysteresis so the bar does not flicker around the edge.
      const next = compactRef.current ? y > 4 : y > 24
      if (next !== compactRef.current) {
        compactRef.current = next
        setCompact(next)
      }
    }
    read()
    window.addEventListener("scroll", read, { passive: true })
    main?.addEventListener("scroll", read, { passive: true })
    return () => {
      window.removeEventListener("scroll", read)
      main?.removeEventListener("scroll", read)
    }
  }, [])

  return (
    <>
      <div
        data-mobile-page-header
        data-compact={compact ? "true" : undefined}
        ref={headerRef}
        className={cn(
          // Above the shell's safe-area strip (z-110): that strip is an opaque
          // --bg bar as tall as the iOS inset, and at z-40 it painted over this
          // header — which is why the action vanished on notched iPhones but
          // survived on Android, where the inset reports 0.
          "fixed inset-x-0 top-0 z-[120] bg-[var(--page-bg)] px-4 pb-1 pt-[calc(0.25rem+env(safe-area-inset-top,0px))]",
          className,
        )}
      >
        <div className={cn("flex min-h-10 items-center gap-3", alignLeft ? "justify-start" : "justify-between")}>
          <div className={cn("flex min-w-0 items-center gap-2", !alignLeft && "flex-1")}>
            <h1
              className={cn(
                "origin-left truncate text-left text-[1.875rem] font-black leading-[1.1] tracking-tight text-[var(--text)] transition-transform duration-200 ease-out will-change-transform",
                compact && "scale-[0.7]",
              )}
            >
              {title}
            </h1>
            {beta && (
              <span
                className={cn(
                  "shrink-0 rounded-full bg-[var(--text)] px-2 py-0.5 text-[0.5625rem] font-black uppercase tracking-[0.12em] text-[var(--bg)] transition-opacity duration-200",
                  // The shrunk title keeps its full layout width, so the pill would float away from it.
                  compact && "opacity-0",
                )}
              >
                Beta
              </span>
            )}
          </div>
        </div>
      </div>
      {/* In-flow spacer so the fixed header never covers page content. The
          header's height already includes the status-bar inset, and the
          Shell's <main> pads its top by that inset + 0.35rem too; pull the
          spacer up by the same amount so the gap is not counted twice. */}
      <div
        aria-hidden
        className="w-full"
        style={{ height: spacer, marginTop: "calc(-0.35rem - env(safe-area-inset-top, 0px))" }}
      />
      {/* Actions belong to the page, not the bar (right-aligned): the bar is for where you are and the way back.
          They sit in the page flow right under it, as full-width buttons, so they are
          easy to reach and never crowd the title. */}
      {action && !hasHero ? (
        <ActionsAfterHero className={"md:hidden lg:hidden flex w-full flex-wrap gap-2 px-1 pb-2 pt-3 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:basis-[calc(50%-0.25rem)] [&>div]:flex [&>div]:gap-2 [&>div>*]:flex-1"}>{action}</ActionsAfterHero>
      ) : null}
    </>
  )
}

/** A page action on phones: a round, labelled button in the page, not an icon in the bar. */
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
        "flex h-11 min-w-0 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:h-[1.0625rem] [&_svg]:w-[1.0625rem] [&_svg]:shrink-0",
        className,
      )}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  )
}

/** Shared size for every top-bar control (primary + chip). */
export const DESKTOP_TOPBAR_CONTROL =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold leading-none whitespace-nowrap [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"

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
          ? "bg-[var(--text)] text-[var(--bg)]"
          : "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]",
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
  beta,
}: {
  title: string
  actions?: React.ReactNode
  className?: string
  backHref?: string
  backPreferHistory?: boolean
  breadcrumbs?: Array<string | { label: string; href?: string }>
  homeHref?: string
  showBack?: boolean
  beta?: boolean
}) {
  // A page may hide the bar below a breakpoint ("hidden lg:block"); its action row follows.
  const hiddenUntil = className?.match(/\bhidden\s+(sm|md|lg|xl):block\b/)?.[1]
  const hasHero = usePageHasHero()
  useRegisterActions(actions, "hidden md:flex flex-wrap items-center justify-end gap-2.5")
  const rawItems = breadcrumbs ?? []
  const breadcrumbItems: Array<{ label: string; href?: string }> = [
    { label: "Home", href: homeHref },
    ...rawItems.map((item) => (typeof item === "string" ? { label: item } : item)),
    { label: title },
  ]
  return (
    <>
    <header
      className={cn(
        "portal-desktop-topbar sticky top-0 z-50 w-full shrink-0 border-b border-[var(--border)] bg-[var(--sidebar)]",
        className,
      )}
    >
      <div className="flex h-8 w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
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
          {beta && (
            <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--muted)]">
              Beta
            </span>
          )}
        </div>
      </div>
    </header>
    {actions && !hasHero ? (
      <ActionsAfterHero className={cn("portal-page-body flex flex-wrap items-center justify-end gap-2.5 !pb-4 pt-4", hiddenUntil ? `hidden ${hiddenUntil}:flex` : "hidden md:flex")}>
        {actions}
      </ActionsAfterHero>
    ) : null}
    </>
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
