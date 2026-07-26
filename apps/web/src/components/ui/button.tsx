import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive"
type ButtonSize = "default" | "sm" | "lg" | "icon"

const variants: Record<ButtonVariant, string> = {
  default: "bg-[var(--text)] text-[var(--bg)] shadow-sm hover:brightness-110",
  secondary: "bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
  outline: "border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--surface-tint)]",
  ghost: "text-[var(--text)] hover:bg-[var(--surface-tint)]",
  destructive: "border border-[var(--expense)]/20 bg-[var(--expense-bg)] text-[var(--expense)] hover:brightness-110",
}

const sizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 text-xs",
  lg: "h-11 px-5",
  icon: "h-10 w-10",
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"
