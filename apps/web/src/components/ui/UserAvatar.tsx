"use client"

import { cn } from "@/lib/utils"

type UserAvatarProps = {
  name?: string | null
  size?: number
  className?: string
  active?: boolean
}

/**
 * Premium monochrome SVG person avatar (sidebar / account switcher).
 * Dark: light tile · Light: dark tile. Always high-contrast.
 */
export function UserAvatar({
  name,
  size = 32,
  className,
  active = false,
}: UserAvatarProps) {
  const uid = `ua-${size}-${(name || "u").replace(/\W/g, "").slice(0, 12)}`

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "shadow-sm ring-1 ring-black/10",
        active && "ring-2 ring-[var(--text)]/30",
        className,
      )}
      style={{ width: size, height: size }}
      title={name || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="block h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--icon-bg)" />
            <stop offset="100%" stopColor="var(--icon-bg)" stopOpacity="0.88" />
          </linearGradient>
          <linearGradient id={`${uid}-fg`} x1="30%" y1="10%" x2="70%" y2="100%">
            <stop offset="0%" stopColor="var(--icon-fg)" stopOpacity="0.92" />
            <stop offset="100%" stopColor="var(--icon-fg)" stopOpacity="0.72" />
          </linearGradient>
        </defs>

        {/* Tile */}
        <circle cx="24" cy="24" r="24" fill={`url(#${uid}-bg)`} />

        {/* Soft highlight */}
        <circle cx="17" cy="14" r="14" fill="var(--icon-fg)" opacity="0.06" />

        {/* Head */}
        <circle cx="24" cy="18.5" r="7.2" fill={`url(#${uid}-fg)`} />

        {/* Shoulders / body */}
        <path
          d="M8.5 42.5c1.4-8.6 7.6-13.2 15.5-13.2s14.1 4.6 15.5 13.2"
          fill={`url(#${uid}-fg)`}
        />

        {/* Inner neck cut for depth */}
        <ellipse cx="24" cy="28.2" rx="5.2" ry="2.1" fill="var(--icon-bg)" opacity="0.35" />
      </svg>
    </span>
  )
}

export default UserAvatar
