import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function getTodayLocalDateISO(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function getTodayDateInTimeZone(timeZone?: string, now: Date = new Date()): string {
  if (!timeZone) {
    return getTodayLocalDateISO(now)
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)

    const year = parts.find((part) => part.type === "year")?.value
    const month = parts.find((part) => part.type === "month")?.value
    const day = parts.find((part) => part.type === "day")?.value

    if (year && month && day) {
      return `${year}-${month}-${day}`
    }
  } catch {
    // Fall back to local browser date when provided timezone is invalid.
  }

  return getTodayLocalDateISO(now)
}



function normalizeDateValue(value: string | number | Date): Date {
  if (value instanceof Date) return value
  if (typeof value === "number") return new Date(value)

  const raw = String(value || "").trim()
  if (!raw) return new Date(value)

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
  const looksIsoWithoutTimezone = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(?:\.\d+)?)?$/.test(raw)

  if (!hasTimezone && looksIsoWithoutTimezone) {
    return new Date(`${raw.replace(" ", "T")}Z`)
  }

  return new Date(raw)
}

export function formatDateInSetting(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {},
  config?: { locale?: string; timeZone?: string }
): string {
  const date = normalizeDateValue(value)
  const locale = config?.locale || "en-MY"
  const timeZone = config?.timeZone
  return new Intl.DateTimeFormat(locale, {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  }).format(date)
}

export function formatTimeInSetting(
  value: string | number | Date,
  config?: { locale?: string; timeZone?: string; timeFormat?: "12h" | "24h" },
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = normalizeDateValue(value)
  const locale = config?.locale || "en-MY"
  const timeZone = config?.timeZone
  const timeFormat = config?.timeFormat || "24h"
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12h",
    ...options,
    ...(timeZone ? { timeZone } : {}),
  }).format(date)
}
