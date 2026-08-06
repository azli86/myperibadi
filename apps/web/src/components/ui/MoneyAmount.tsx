import { cn } from "@/lib/utils"

/** Shared amount style — matches desktop wallet list cards. */
export const MONEY_AMOUNT_CLASS =
  "font-semibold tabular-nums tracking-tight"

export const MONEY_AMOUNT_SIZE = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
  hero: "text-[1.85rem]",
  heroLg: "text-4xl",
} as const

export type MoneyAmountSize = keyof typeof MONEY_AMOUNT_SIZE

type MoneyAmountProps = {
  value: number
  currency?: string
  /** Fraction digits (default 2). Use 0 for compact. */
  digits?: number
  size?: MoneyAmountSize
  showCurrency?: boolean
  /** Prefix sign, e.g. "-" for negative display of absolute value */
  prefix?: string
  className?: string
  currencyClassName?: string
}

export function formatMoneyValue(value: number, digits = 2) {
  return Number(value || 0).toLocaleString("en-MY", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Display label for wallet currency codes (API may store MYR). */
export function formatCurrencyLabel(currency?: string | null) {
  const code = (currency || "RM").trim().toUpperCase()
  if (code === "MYR" || code === "RM") return "RM"
  return code || "RM"
}

/** Flag emoji for a currency code (falls back to a neutral coin). */
export function currencyFlag(currency?: string | null) {
  const code = (currency || "RM").trim().toUpperCase()
  const flags: Record<string, string> = {
    RM: "🇲🇾", MYR: "🇲🇾",
    USD: "🇺🇸", US: "🇺🇸",
    SGD: "🇸🇬",
    BND: "🇧🇳",
    IDR: "🇮🇩",
    THB: "🇹🇭",
    PHP: "🇵🇭",
    VND: "🇻🇳",
    KRW: "🇰🇷",
    JPY: "🇯🇵",
    CNY: "🇨🇳",
    HKD: "🇭🇰",
    TWD: "🇹🇼",
    INR: "🇮🇳",
    AUD: "🇦🇺",
    NZD: "🇳🇿",
    GBP: "🇬🇧",
    EUR: "🇪🇺",
    CHF: "🇨🇭",
    CAD: "🇨🇦",
    AED: "🇦🇪",
    SAR: "🇸🇦",
    QAR: "🇶🇦",
    KWD: "🇰🇼",
    BHD: "🇧🇭",
    OMR: "🇴🇲",
    TRY: "🇹🇷",
    SEK: "🇸🇪",
    NOK: "🇳🇴",
    DKK: "🇩🇰",
    BRL: "🇧🇷",
    MXN: "🇲🇽",
    ZAR: "🇿🇦",
    RUB: "🇷🇺",
  }
  return flags[code] || "💱"
}

/**
 * Wallet-list amount style: currency (opacity-55) + number (semibold tabular).
 * Default size = text-3xl like desktop wallet cards.
 */
export function MoneyAmount({
  value,
  currency = "RM",
  digits = 2,
  size = "lg",
  showCurrency = true,
  prefix = "",
  className,
  currencyClassName,
}: MoneyAmountProps) {
  const currencyLabel = formatCurrencyLabel(currency)
  return (
    <span className={cn(MONEY_AMOUNT_CLASS, MONEY_AMOUNT_SIZE[size], className)}>
      {prefix}
      {showCurrency ? (
        <span className={cn("mr-1 opacity-55", size === "lg" || size === "hero" || size === "heroLg" ? "text-base" : "text-[0.65em]", currencyClassName)}>
          {currencyFlag(currency)} {currencyLabel}
        </span>
      ) : null}
      {formatMoneyValue(value, digits)}
    </span>
  )
}
