"use client"

import { cn } from "@/lib/utils"

/** Brand colours + glyphs for real Malaysian BNPL providers. */
export type BnplProvider =
  | "SPayLater"
  | "Atome"
  | "Grab"
  | "Shopee"
  | "Boost"
  | "Lazada"
  | "TNG"
  | "GoPayLater"
  | "Other"

export const BNPL_PROVIDERS: { value: string; label: string }[] = [
  { value: "SPayLater", label: "SPayLater" },
  { value: "Atome", label: "Atome" },
  { value: "Grab", label: "Grab PayLater" },
  { value: "Shopee", label: "Shopee PayLater" },
  { value: "Boost", label: "Boost PayLater" },
  { value: "Lazada", label: "Lazada PayLater" },
  { value: "TNG", label: "TNG eWallet PayLater" },
  { value: "GoPayLater", label: "GoPayLater" },
  { value: "Other", label: "Lain-lain" },
]

export function bnplProviderBrand(provider: string): { value: BnplProvider; bg: string; fg: string; glyph: string } {
  const p = (provider || "").toLowerCase()
  if (p.includes("spay") || p === "spaylater")
    return { value: "SPayLater", bg: "bg-[#1c3f94]", fg: "text-white", glyph: "SP" }
  if (p.includes("atome"))
    return { value: "Atome", bg: "bg-[#ffd200]", fg: "text-black", glyph: "A" }
  if (p.includes("grab"))
    return { value: "Grab", bg: "bg-[#00b14f]", fg: "text-white", glyph: "G" }
  if (p.includes("shopee"))
    return { value: "Shopee", bg: "bg-[#ee4d2d]", fg: "text-white", glyph: "S" }
  if (p.includes("boost"))
    return { value: "Boost", bg: "bg-[#0c2a6e]", fg: "text-white", glyph: "B" }
  if (p.includes("lazada"))
    return { value: "Lazada", bg: "bg-[#0f146d]", fg: "text-white", glyph: "L" }
  if (p.includes("tng") || p.includes("touch"))
    return { value: "TNG", bg: "bg-[#5e9b3d]", fg: "text-white", glyph: "T" }
  if (p.includes("gopay"))
    return { value: "GoPayLater", bg: "bg-[#0cb954]", fg: "text-white", glyph: "GP" }
  return { value: "Other", bg: "bg-[var(--surface-tint-strong)]", fg: "text-[var(--text)]", glyph: "B" }
}

export function BnplProviderBadge({
  provider,
  size = 40,
  rounded = "rounded-2xl",
  className,
}: {
  provider?: string
  size?: number
  rounded?: string
  className?: string
}) {
  const brand = bnplProviderBrand(provider || "Other")
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center font-black", brand.bg, brand.fg, rounded, className)}
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      {brand.glyph}
    </span>
  )
}
