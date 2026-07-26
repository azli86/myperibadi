"use client";

import React from "react";
import { cn } from "@/lib/utils";

type ChatNavIconProps = {
  active?: boolean;
  className?: string;
  size?: number;
};

/** Square chat bubble (rounded rect + tail) for center bottom-nav. */
export function ChatNavIcon({
  active = false,
  className,
  size = 34,
}: ChatNavIconProps) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center text-current",
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
        className="block"
      >
        <path
          fill="currentColor"
          fillOpacity={active ? 1 : 0.92}
          fillRule="evenodd"
          clipRule="evenodd"
          d="
            M4.75 4.5h14.5A2.75 2.75 0 0 1 22 7.25v8a2.75 2.75 0 0 1-2.75 2.75H12.6l-3.9 3.2a.9.9 0 0 1-1.45-.7v-2.5H4.75A2.75 2.75 0 0 1 2 15.25v-8A2.75 2.75 0 0 1 4.75 4.5Z
            M8.2 12.35a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z
            M12 12.35a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z
            M15.8 12.35a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z
          "
        />
      </svg>
    </span>
  );
}

export default ChatNavIcon;
