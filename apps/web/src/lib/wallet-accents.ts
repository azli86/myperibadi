// Wallet card colours, shared by every screen that draws a wallet: the wallet
// page and its picker, the dashboard, the phone home and bank reconciliation.
// A wallet stores the `key` in card_color; the card is drawn from `from` to
// `to` with white text, so every pair is dark enough to carry it.

export type WalletAccent = {
  key: string
  label: string
  /** Solid swatch and glow colour. */
  color: string
  dark: string
  from: string
  to: string
  soft: string
  /** Light text tint for older cards that set a text colour per accent. */
  text: string
}

export const WALLET_ACCENTS: WalletAccent[] = [
  // The original six. Their order is part of the fallback below; do not reorder.
  { key: "indigo", label: "Indigo", color: "#4f46e5", dark: "#3730a3", from: "#6366f1", to: "#3730a3", soft: "#eef2ff", text: "#f8fafc" },
  { key: "pink", label: "Pink", color: "#db2777", dark: "#9d174d", from: "#ec4899", to: "#9d174d", soft: "#fdf2f8", text: "#fdf2f8" },
  { key: "amber", label: "Amber", color: "#d97706", dark: "#92400e", from: "#f59e0b", to: "#92400e", soft: "#fffbeb", text: "#fff7ed" },
  { key: "emerald", label: "Emerald", color: "#059669", dark: "#065f46", from: "#10b981", to: "#065f46", soft: "#ecfdf5", text: "#ecfdf5" },
  { key: "cyan", label: "Cyan", color: "#0891b2", dark: "#155e75", from: "#06b6d4", to: "#155e75", soft: "#ecfeff", text: "#ecfeff" },
  { key: "violet", label: "Violet", color: "#7c3aed", dark: "#5b21b6", from: "#8b5cf6", to: "#5b21b6", soft: "#f5f3ff", text: "#f5f3ff" },
  // Added choices.
  { key: "rose", label: "Rose", color: "#e11d48", dark: "#881337", from: "#e11d48", to: "#881337", soft: "#fff1f2", text: "#fff1f2" },
  { key: "red", label: "Red", color: "#dc2626", dark: "#7f1d1d", from: "#dc2626", to: "#7f1d1d", soft: "#fef2f2", text: "#fef2f2" },
  { key: "orange", label: "Orange", color: "#ea580c", dark: "#7c2d12", from: "#ea580c", to: "#7c2d12", soft: "#fff7ed", text: "#fff7ed" },
  { key: "green", label: "Green", color: "#16a34a", dark: "#14532d", from: "#16a34a", to: "#14532d", soft: "#f0fdf4", text: "#f0fdf4" },
  { key: "teal", label: "Teal", color: "#0d9488", dark: "#134e4a", from: "#0d9488", to: "#134e4a", soft: "#f0fdfa", text: "#f0fdfa" },
  { key: "sky", label: "Sky", color: "#0284c7", dark: "#0c4a6e", from: "#0284c7", to: "#0c4a6e", soft: "#f0f9ff", text: "#f0f9ff" },
  { key: "blue", label: "Blue", color: "#2563eb", dark: "#1e3a8a", from: "#2563eb", to: "#1e3a8a", soft: "#eff6ff", text: "#eff6ff" },
  { key: "purple", label: "Purple", color: "#9333ea", dark: "#581c87", from: "#9333ea", to: "#581c87", soft: "#faf5ff", text: "#faf5ff" },
  { key: "fuchsia", label: "Fuchsia", color: "#c026d3", dark: "#701a75", from: "#c026d3", to: "#701a75", soft: "#fdf4ff", text: "#fdf4ff" },
  { key: "slate", label: "Slate", color: "#475569", dark: "#0f172a", from: "#475569", to: "#0f172a", soft: "#f8fafc", text: "#f8fafc" },
  { key: "graphite", label: "Graphite", color: "#3f3f46", dark: "#09090b", from: "#3f3f46", to: "#09090b", soft: "#fafafa", text: "#fafafa" },
  { key: "gold", label: "Gold", color: "#a16207", dark: "#5c4210", from: "#b8862b", to: "#5c4210", soft: "#fefce8", text: "#fefce8" },
]

// A wallet with no colour chosen gets one from its id. That spread is over the
// original six only: widening it to the new list would silently recolour
// every existing wallet that never picked a colour.
const FALLBACK_ACCENTS = WALLET_ACCENTS.slice(0, 6)

export function getWalletAccent(wallet?: { id?: number | null; card_color?: string | null } | null): WalletAccent {
  if (wallet?.card_color) {
    const picked = WALLET_ACCENTS.find((accent) => accent.key === wallet.card_color)
    if (picked) return picked
  }
  return FALLBACK_ACCENTS[Math.abs(wallet?.id ?? 0) % FALLBACK_ACCENTS.length]
}
