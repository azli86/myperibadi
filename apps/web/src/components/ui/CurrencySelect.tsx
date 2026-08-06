"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** Canonical currency list: stored code (e.g. RM), flag emoji, ISO code, full name. */
export const CURRENCY_OPTIONS: { value: string; flag: string; iso: string; name: string }[] = [
  { value: "RM", flag: "🇲🇾", iso: "MYR", name: "Malaysian Ringgit" },
  { value: "USD", flag: "🇺🇸", iso: "USD", name: "US Dollar" },
  { value: "SGD", flag: "🇸🇬", iso: "SGD", name: "Singapore Dollar" },
  { value: "BND", flag: "🇧🇳", iso: "BND", name: "Brunei Dollar" },
  { value: "IDR", flag: "🇮🇩", iso: "IDR", name: "Indonesian Rupiah" },
  { value: "THB", flag: "🇹🇭", iso: "THB", name: "Thai Baht" },
  { value: "PHP", flag: "🇵🇭", iso: "PHP", name: "Philippine Peso" },
  { value: "VND", flag: "🇻🇳", iso: "VND", name: "Vietnamese Dong" },
  { value: "KRW", flag: "🇰🇷", iso: "KRW", name: "South Korean Won" },
  { value: "JPY", flag: "🇯🇵", iso: "JPY", name: "Japanese Yen" },
  { value: "CNY", flag: "🇨🇳", iso: "CNY", name: "Chinese Yuan" },
  { value: "HKD", flag: "🇭🇰", iso: "HKD", name: "Hong Kong Dollar" },
  { value: "TWD", flag: "🇹🇼", iso: "TWD", name: "New Taiwan Dollar" },
  { value: "INR", flag: "🇮🇳", iso: "INR", name: "Indian Rupee" },
  { value: "AUD", flag: "🇦🇺", iso: "AUD", name: "Australian Dollar" },
  { value: "NZD", flag: "🇳🇿", iso: "NZD", name: "New Zealand Dollar" },
  { value: "GBP", flag: "🇬🇧", iso: "GBP", name: "British Pound" },
  { value: "EUR", flag: "🇪🇺", iso: "EUR", name: "Euro" },
  { value: "CHF", flag: "🇨🇭", iso: "CHF", name: "Swiss Franc" },
  { value: "CAD", flag: "🇨🇦", iso: "CAD", name: "Canadian Dollar" },
  { value: "AED", flag: "🇦🇪", iso: "AED", name: "UAE Dirham" },
  { value: "SAR", flag: "🇸🇦", iso: "SAR", name: "Saudi Riyal" },
  { value: "QAR", flag: "🇶🇦", iso: "QAR", name: "Qatari Riyal" },
  { value: "KWD", flag: "🇰🇼", iso: "KWD", name: "Kuwaiti Dinar" },
  { value: "BHD", flag: "🇧🇭", iso: "BHD", name: "Bahraini Dinar" },
  { value: "OMR", flag: "🇴🇲", iso: "OMR", name: "Omani Rial" },
  { value: "TRY", flag: "🇹🇷", iso: "TRY", name: "Turkish Lira" },
  { value: "SEK", flag: "🇸🇪", iso: "SEK", name: "Swedish Krona" },
  { value: "NOK", flag: "🇳🇴", iso: "NOK", name: "Norwegian Krone" },
  { value: "DKK", flag: "🇩🇰", iso: "DKK", name: "Danish Krone" },
  { value: "BRL", flag: "🇧🇷", iso: "BRL", name: "Brazilian Real" },
  { value: "MXN", flag: "🇲🇽", iso: "MXN", name: "Mexican Peso" },
  { value: "ZAR", flag: "🇿🇦", iso: "ZAR", name: "South African Rand" },
  { value: "RUB", flag: "🇷🇺", iso: "RUB", name: "Russian Ruble" },
]

/** Normalise stored code (RM / MYR / myr) to canonical option; fallback builds custom entry. */
export function currencyOption(value?: string | null) {
  const raw = (value || "RM").trim().toUpperCase()
  const byStored = CURRENCY_OPTIONS.find((o) => o.value === raw)
  if (byStored) return byStored
  const byIso = CURRENCY_OPTIONS.find((o) => o.iso === raw)
  if (byIso) return byIso
  return { value: raw, flag: "💱", iso: raw, name: raw }
}

type Props = {
  value: string | null | undefined
  onChange: (value: string) => void
  className?: string
}

/** Custom dropdown — big flag + currency code, tap to open, tap to select. */
export default function CurrencySelect({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = currencyOption(value)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onEsc)
    }
  }, [])

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 transition active:scale-[0.99]",
          open && "border-[var(--border-strong)]",
        )}
      >
        <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
          <span className="text-base leading-none">{current.flag}</span>
          <span className="uppercase tracking-[0.08em]">{current.value}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn("text-[var(--muted)] transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl shadow-black/20">
          {CURRENCY_OPTIONS.map((opt) => {
            const selected = opt.value === current.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[calc(var(--radius)-4px)] px-2.5 py-2 text-left transition",
                  selected ? "bg-[var(--text)] text-[var(--bg)]" : "hover:bg-[var(--surface-tint)]",
                )}
              >
                <span className="text-lg leading-none">{opt.flag}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-sm font-bold", selected ? "text-[var(--bg)]" : "text-[var(--text)]")}>
                    {opt.iso}
                  </span>
                  <span className={cn("truncate text-[0.6875rem]", selected ? "text-[var(--bg)]/70" : "text-[var(--muted)]")}>
                    {opt.name}
                  </span>
                </span>
                {selected ? <span className="text-[var(--bg)]">✓</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
