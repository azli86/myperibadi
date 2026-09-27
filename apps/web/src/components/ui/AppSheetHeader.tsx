"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang"

type AppSheetHeaderProps = {
  title: string
  onClose: () => void
  /** Kecil uppercase label di atas title (cth "Kategori", "Budget Setting"). */
  eyebrow?: string
  /** Subtitle deskriptif di bawah title (cth "Bayaran ini akan cipta transaksi…"). */
  subtitle?: string
  /** Ikon kiri (cth CategoryIconGlyph) — letak sebelum eyebrow/title. */
  icon?: React.ReactNode
  /** Aksi kanan (cth butang simpan). Default: butang X. */
  action?: React.ReactNode
  /** Guna teks "Batal"/"Cancel" di kiri (gaya transaksi). Default: true. */
  showCancel?: boolean
  /** Sembunyi butang X kanan (cth bila guna action / spacer). */
  hideClose?: boolean
  /** Extra class untuk panel header. */
  className?: string
}

/**
 * Header standard untuk semua sheet/popup (app-sheet-panel).
 * Corak: [Cancel] [eyebrow/title/subtitle tengah] [X atau action].
 * Konsisten merentas semua page — guna komponen ini, jangan tulis manual.
 * For a new sheet, prefer <AppSheet>, which renders this header for you.
 */
export function AppSheetHeader({
  title,
  onClose,
  eyebrow,
  subtitle,
  icon,
  action,
  showCancel = true,
  hideClose = false,
  className,
}: AppSheetHeaderProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  return (
    <div
      className={cn(
        "app-sheet-panel-header sticky top-0 z-10 bg-[var(--sheet-bg)] px-3 pb-3 pt-2 md:px-5 md:pb-4 md:pt-4",
        className
      )}
    >
      {/* Grab handle: the sheet closes on a downward swipe. */}
      <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--surface-tint-strong)] md:hidden" />
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex items-center">
          {showCancel && action && !hideClose ? (
            <button
              type="button"
              onClick={onClose}
              className="-ml-1 flex min-h-11 shrink-0 items-center rounded-full px-3 text-[0.9375rem] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {isBm ? "Batal" : "Cancel"}
            </button>
          ) : null}
        </div>

        <div className="min-w-0 max-w-[62vw] text-center md:max-w-md">
          {icon && <div className="mb-1 flex justify-center">{icon}</div>}
          {eyebrow && (
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{eyebrow}</p>
          )}
          <h3 className="truncate text-[1.0625rem] font-black leading-tight tracking-tight text-[var(--text)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{subtitle}</p>}
        </div>

        <div className="flex items-center justify-end">
          {!hideClose &&
            (action ? (
              <div className="app-sheet-header-action shrink-0">{action}</div>
            ) : (
              <button
                type="button"
                onClick={onClose}
                aria-label={isBm ? "Tutup" : "Close"}
                className="-mr-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text-soft)] transition hover:text-[var(--text)] active:scale-95"
              >
                <X size={17} strokeWidth={2.4} />
              </button>
            ))}
        </div>
      </div>
      {/* A hairline under the header, fading out at the edges. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--divider) 15%, var(--divider) 85%, transparent)" }}
      />
    </div>
  )
}
