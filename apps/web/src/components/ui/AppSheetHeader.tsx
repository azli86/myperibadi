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
        "app-sheet-panel-header sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--sheet-bg)] px-4 py-4 md:px-6",
        className
      )}
    >
      <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--surface-tint-strong)] md:hidden" />
      <div className="flex items-center justify-between gap-3">
        {showCancel && action && !hideClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            {isBm ? "Batal" : "Cancel"}
          </button>
        ) : (
          <span className="shrink-0 w-16" aria-hidden />
        )}

        <div className="min-w-0 flex-1 text-center">
          {icon && (
            <div className="mb-1 flex justify-center">{icon}</div>
          )}
          {eyebrow && (
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              {eyebrow}
            </p>
          )}
          <h3 className="truncate text-xl font-black text-[var(--text)]">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{subtitle}</p>
          )}
        </div>

        {!hideClose && (
          action ? (
            <div className="shrink-0">{action}</div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2 text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              <X size={18} />
            </button>
          )
        )}
        {hideClose && <span className="shrink-0 w-16" aria-hidden />}
      </div>
    </div>
  )
}
