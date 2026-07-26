"use client"

import React from "react"
import { cn } from "@/lib/utils"

type IconProps = {
  active?: boolean
  className?: string
  size?: number
}

/**
 * Base wrapper for the bottom-nav line icons.
 * Outline style (stroke = currentColor) so it is theme-aware and crisp at
 * any size. Active state bumps the stroke weight for a clear, modern feel.
 */
function NavSvg({
  active,
  className,
  size = 24,
  children,
  fillOnActive = false,
}: IconProps & {
  children: React.ReactNode
  fillOnActive?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-current transition-all duration-200",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={active && fillOnActive ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 2.3 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block"
      >
        {children}
      </svg>
    </span>
  )
}

export function NavHomeIcon(props: IconProps) {
  return (
    <NavSvg {...props}>
      <path d="M3.5 10.6 12 3.5l8.5 7.1" />
      <path d="M5.5 9.4V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.4" />
      <path d="M9.5 20.5v-6h5v6" />
    </NavSvg>
  )
}

export function NavTxnIcon(props: IconProps) {
  return (
    <NavSvg {...props}>
      <path d="M4 8h13" />
      <path d="M14 4.5 17.5 8 14 11.5" />
      <path d="M20 16H7" />
      <path d="M10 12.5 6.5 16 10 19.5" />
    </NavSvg>
  )
}

export function NavWalletIcon(props: IconProps) {
  return (
    <NavSvg {...props}>
      <path d="M3.5 8.2A2.3 2.3 0 0 1 5.8 5.9H18a1 1 0 0 1 1 1V8" />
      <rect x="3.5" y="8" width="17" height="11" rx="2.4" />
      <circle cx="16.4" cy="13.5" r="1.3" />
    </NavSvg>
  )
}

export function NavReceiptsIcon(props: IconProps) {
  return (
    <NavSvg {...props}>
      <rect x="3" y="6.5" width="13" height="13" rx="2.2" />
      <circle cx="7.4" cy="10.6" r="1.4" />
      <path d="M5 17l3.4-3.2 2.6 2.4 2-1.9 2.6 2.5" />
      <rect x="8.5" y="3" width="13" height="13" rx="2.2" />
    </NavSvg>
  )
}

export function NavCalcIcon(props: IconProps) {
  return (
    <NavSvg {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2.2" />
      <rect x="7.4" y="5.4" width="9.2" height="3" rx="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="15.4" r="1" />
      <circle cx="12" cy="15.4" r="1" />
      <circle cx="15" cy="15.4" r="1" />
      <circle cx="9" cy="18.8" r="1" />
      <circle cx="12" cy="18.8" r="1" />
      <circle cx="15" cy="18.8" r="1" />
    </NavSvg>
  )
}

export function NavMoreIcon(props: IconProps) {
  return (
    <NavSvg {...props} fillOnActive>
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </NavSvg>
  )
}
