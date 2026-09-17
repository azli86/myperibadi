"use client";

import React from "react";
import { cn } from "@/lib/utils";

type ChatNavIconProps = {
  active?: boolean;
  className?: string;
  size?: number;
};

/**
 * Four-point sparkle for the centre bottom-nav slot.
 *
 * The assistant is the one destination on the bar that is not a ledger, so it
 * wears the one icon on the bar that is not monochrome: a violet-cyan gradient
 * is the shared visual shorthand for "AI" and reads at 30px where a chat bubble
 * merely repeated the neighbouring tabs.
 */
export function ChatNavIcon({
  active = false,
  className,
  size = 34,
}: ChatNavIconProps) {
  // Unique per instance: two of these can render at once (bar + sheet menu).
  const gradientId = React.useId();

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        aria-hidden="true"
        className={cn(
          "block transition-transform duration-250",
          active && "scale-105",
        )}
      >
        <defs>
          <linearGradient id={gradientId} x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="55%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        {/* Main sparkle. */}
        <path
          fill={`url(#${gradientId})`}
          d="M12 2.2c.35 0 .66.23.76.56l1.2 3.94a5.1 5.1 0 0 0 3.34 3.34l3.94 1.2a.8.8 0 0 1 0 1.52l-3.94 1.2a5.1 5.1 0 0 0-3.34 3.34l-1.2 3.94a.8.8 0 0 1-1.52 0l-1.2-3.94a5.1 5.1 0 0 0-3.34-3.34l-3.94-1.2a.8.8 0 0 1 0-1.52l3.94-1.2a5.1 5.1 0 0 0 3.34-3.34l1.2-3.94A.8.8 0 0 1 12 2.2Z"
        />
        {/* Small satellite sparkle, the detail that makes the glyph read as AI. */}
        <path
          fill={`url(#${gradientId})`}
          opacity="0.85"
          d="M18.6 15.4c.17 0 .32.11.37.27l.45 1.49a2.1 2.1 0 0 0 1.38 1.38l1.49.45a.39.39 0 0 1 0 .74l-1.49.45a2.1 2.1 0 0 0-1.38 1.38l-.45 1.49a.39.39 0 0 1-.74 0l-.45-1.49a2.1 2.1 0 0 0-1.38-1.38l-1.49-.45a.39.39 0 0 1 0-.74l1.49-.45a2.1 2.1 0 0 0 1.38-1.38l.45-1.49a.39.39 0 0 1 .37-.27Z"
        />
      </svg>
    </span>
  );
}

export default ChatNavIcon;
