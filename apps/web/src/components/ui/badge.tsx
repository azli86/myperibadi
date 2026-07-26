import * as React from "react"
import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive"

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--text)] text-[var(--bg)]",
  secondary: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]",
  success: "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/20",
  destructive: "bg-[var(--expense-bg)] text-[var(--expense)] ring-1 ring-[var(--expense)]/20",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.12em]",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
