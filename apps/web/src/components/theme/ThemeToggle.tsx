"use client"

import React from "react"
import { Moon, SunMedium, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "./ThemeProvider"

interface ThemeToggleProps {
  className?: string
  compact?: boolean
  inverted?: boolean
}

export default function ThemeToggle({ className, compact = false, inverted = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, toggleTheme } = useTheme()
  const isLightResolved = resolvedTheme === "light"
  
  const getIcon = () => {
    switch (theme) {
      case "light": return <SunMedium size={compact ? 16 : 15} />
      case "dark": return <Moon size={compact ? 16 : 15} />
      case "system": return <Monitor size={compact ? 16 : 15} />
    }
  }

  const getLabel = () => {
    switch (theme) {
      case "light": return "Light"
      case "dark": return "Dark"
      case "system": return "System"
    }
  }

  const getNextLabel = () => {
    switch (theme) {
      case "light": return "Switch to dark mode"
      case "dark": return "Switch to system mode"
      case "system": return "Switch to light mode"
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={getNextLabel()}
      title={getLabel()}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border transition-colors",
        compact ? "h-9 w-9" : "gap-2 px-3 py-2 text-sm font-bold",
        className,
      )}
      style={{
        backgroundColor: inverted
          ? isLightResolved
            ? "#9e9b9b"
            : "rgba(255, 255, 255, 0.1)"
          : "var(--card)",
        borderColor: inverted
          ? isLightResolved
            ? "rgba(15, 23, 42, 0.12)"
            : "rgba(255, 255, 255, 0.12)"
          : "var(--border-strong)",
        color: inverted
          ? isLightResolved
            ? "var(--text)"
            : "#ffffff"
          : "var(--text)",
      }}
    >
      {getIcon()}
      {!compact && <span>{getLabel()}</span>}
    </button>
  )
}
