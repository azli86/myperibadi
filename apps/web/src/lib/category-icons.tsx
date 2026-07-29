"use client"
import type { LucideIcon } from "lucide-react"
import {
  Banknote,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Coins,
  Landmark,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  Smartphone,
  Tag,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type CategoryIconName =
  | "tag"
  | "utensils-crossed"
  | "shopping-bag"
  | "car-front"
  | "bus"
  | "house"
  | "heart-pulse"
  | "graduation-cap"
  | "shirt"
  | "wallet"
  | "coins"
  | "plane"
  | "gift"
  | "briefcase"
  | "coffee"
  | "smartphone"
  | "landmark"
  | "banknote"
  | "film"
  | "receipt"
  | "brand-shopee"
  | "brand-grab"
  | "brand-tiktok"
  | "brand-misi"

type CategoryIconOption = {
  name: CategoryIconName
  label: string
  icon: LucideIcon
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { name: "utensils-crossed", label: "Food", icon: UtensilsCrossed },
  { name: "shopping-bag", label: "Shopping", icon: ShoppingBag },
  { name: "car-front", label: "Car", icon: Car },
  { name: "bus", label: "Transit", icon: Bus },
  { name: "house", label: "Home", icon: House },
  { name: "heart-pulse", label: "Health", icon: HeartPulse },
  { name: "graduation-cap", label: "Education", icon: GraduationCap },
  { name: "shirt", label: "Fashion", icon: Shirt },
  { name: "wallet", label: "Bills", icon: Wallet },
  { name: "coins", label: "Savings", icon: Coins },
  { name: "plane", label: "Travel", icon: Plane },
  { name: "gift", label: "Gift", icon: Gift },
  { name: "briefcase", label: "Work", icon: Briefcase },
  { name: "coffee", label: "Cafe", icon: Coffee },
  { name: "smartphone", label: "Phone", icon: Smartphone },
  { name: "landmark", label: "Finance", icon: Landmark },
  { name: "banknote", label: "Income", icon: Banknote },
  { name: "film", label: "Entertainment", icon: Film },
  { name: "receipt", label: "Receipt", icon: Receipt },
  { name: "tag", label: "General", icon: Tag },
]

export const CATEGORY_EMOJI_MAP: Record<CategoryIconName, string> = {
  "utensils-crossed": "🍽️",
  "shopping-bag": "🛍️",
  "car-front": "🚗",
  "bus": "🚌",
  "house": "🏠",
  "heart-pulse": "❤️",
  "graduation-cap": "🎓",
  "shirt": "👕",
  "wallet": "💳",
  "coins": "💰",
  "plane": "✈️",
  "gift": "🎁",
  "briefcase": "💼",
  "coffee": "☕",
  "smartphone": "📱",
  "landmark": "🏦",
  "banknote": "💵",
  "film": "🍿",
  "receipt": "🧾",
  "tag": "🏷️",
  "brand-shopee": "🛍️",
  "brand-grab": "🚕",
  "brand-tiktok": "🎵",
  "brand-misi": "🏪",
}

const CATEGORY_ICON_HINTS: Array<{ hints: string[]; icon: CategoryIconName }> = [
  { hints: ["shopee"], icon: "brand-shopee" },
  { hints: ["grab"], icon: "brand-grab" },
  { hints: ["tiktok", "tik tok"], icon: "brand-tiktok" },
  { hints: ["misi"], icon: "brand-misi" },
  { hints: ["makan", "minum", "food", "drink", "restoran", "restaurant", "coffee", "cafe"], icon: "utensils-crossed" },
  { hints: ["shopping", "shop", "beli", "mall", "store"], icon: "shopping-bag" },
  { hints: ["grab", "car", "kereta", "petrol", "tol", "parking", "transport", "minyak"], icon: "car-front" },
  { hints: ["bus", "bas", "lrt", "mrt", "train"], icon: "bus" },
  { hints: ["home", "house", "rumah", "rent", "sewa", "bill", "bil", "utilities"], icon: "house" },
  { hints: ["klinik", "hospital", "ubat", "health", "medical", "farmasi"], icon: "heart-pulse" },
  { hints: ["school", "education", "study", "kelas", "tuition", "pendidikan"], icon: "graduation-cap" },
  { hints: ["shirt", "baju", "fashion", "clothes", "pakaian"], icon: "shirt" },
  { hints: ["wallet", "loan", "hutang", "debt", "ansuran", "commitment", "komitmen"], icon: "wallet" },
  { hints: ["save", "saving", "simpanan", "tabung"], icon: "coins" },
  { hints: ["travel", "trip", "flight", "holiday", "cuti"], icon: "plane" },
  { hints: ["gift", "hadiah", "donation", "sedekah"], icon: "gift" },
  { hints: ["work", "office", "job", "business", "bisnes"], icon: "briefcase" },
  { hints: ["phone", "mobile", "internet", "data", "telco"], icon: "smartphone" },
  { hints: ["salary", "gaji", "income", "bonus", "dividend", "pendapatan"], icon: "banknote" },
  { hints: ["bank", "finance", "investment", "duit"], icon: "landmark" },
  { hints: ["movie", "wayang", "netflix", "game", "hiburan", "entertainment"], icon: "film" },
  { hints: ["receipt", "resit", "invoice"], icon: "receipt" },
]

export function getCategoryIconNameFallback(categoryName?: string | null, kind?: string | null): CategoryIconName {
  const lowered = String(categoryName || "").trim().toLowerCase()
  for (const entry of CATEGORY_ICON_HINTS) {
    if (entry.hints.some((hint) => lowered.includes(hint))) {
      return entry.icon
    }
  }
  return kind === "income" ? "banknote" : "tag"
}

export function getCategoryEmoji(
  iconName?: string | null,
  categoryName?: string | null,
  kind?: string | null,
): string {
  const normalized = String(iconName || "").trim().toLowerCase() as CategoryIconName
  if (CATEGORY_EMOJI_MAP[normalized]) {
    return CATEGORY_EMOJI_MAP[normalized]
  }
  
  // Also pass straight emojis if DB has literal emojis stored
  const isEmoji = /\p{Extended_Pictographic}/u.test(normalized)
  if (isEmoji) return normalized

  const fallback = getCategoryIconNameFallback(categoryName, kind)
  return CATEGORY_EMOJI_MAP[fallback] || "🏷️"
}

type CategoryIconProps = {
  iconName?: string | null
  categoryName?: string | null
  kind?: string | null
  size?: number
  brandScale?: number
  brandFramed?: boolean
  brandFill?: boolean
  className?: string
}

const BRAND_ICON_META: Record<"brand-shopee" | "brand-grab" | "brand-tiktok" | "brand-misi", { src: string; label: string }> = {
  "brand-shopee": { src: "/safe/shopee.png", label: "Shopee" },
  "brand-grab": { src: "/safe/grab.png", label: "Grab" },
  "brand-tiktok": { src: "/safe/tiktok.png", label: "TikTok" },
  "brand-misi": { src: "/safe/misi.png", label: "Misi" },
}

export function CategoryIconGlyph({
  iconName,
  categoryName,
  kind,
  size = 18,
  brandScale = 1.16,
  brandFramed = true,
  brandFill = false,
  className,
}: CategoryIconProps) {
  const rawIcon = String(iconName || "").trim()
  const normalizedIcon = rawIcon.toLowerCase()
  if (/^https:\/\//i.test(rawIcon)) {
    return <img src={rawIcon} alt={categoryName || "Category"} width={size} height={size} className={cn("rounded-md object-cover", className)} style={{ width: size, height: size }} />
  }
  const isLiteralEmojiIcon = /\p{Extended_Pictographic}/u.test(normalizedIcon)
  const resolvedIconName = (
    CATEGORY_EMOJI_MAP[normalizedIcon as CategoryIconName]
      ? (normalizedIcon as CategoryIconName)
      : getCategoryIconNameFallback(categoryName, kind)
  )

  if (
    !isLiteralEmojiIcon &&
    (resolvedIconName === "brand-shopee" ||
      resolvedIconName === "brand-grab" ||
      resolvedIconName === "brand-tiktok" ||
      resolvedIconName === "brand-misi")
  ) {
    const brandMeta = BRAND_ICON_META[resolvedIconName]
    const badgeSize = Math.max(16, Math.round(size * brandScale))
    const brandStyle = brandFill
      ? { width: "100%", height: "100%" }
      : { width: badgeSize, height: badgeSize }
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden",
          brandFramed && "rounded-[0.45em] border border-white/10 bg-black/5",
          className
        )}
        style={brandStyle}
        role="img"
        aria-label={brandMeta.label}
      >
        <img
          src={brandMeta.src}
          alt={brandMeta.label}
          width={badgeSize}
          height={badgeSize}
          className={cn(
            "h-full w-full",
            brandFill ? "object-cover p-0" : "object-contain p-[4%]",
          )}
        />
      </span>
    )
  }

  const emoji = getCategoryEmoji(iconName, categoryName, kind)
  return (
    <span 
      className={cn("inline-flex items-center justify-center leading-none", className)}
      style={{ fontSize: size }}
      role="img"
      aria-label={categoryName || "Category Icon"}
    >
      {emoji}
    </span>
  )
}
