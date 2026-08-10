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
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center">
          {showCancel && action && !hideClose ? (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {isBm ? "Batal" : "Cancel"}
            </button>
          ) : null}
        </div>

        <div className="min-w-0 text-center">
          {icon && (
            <div className="mb-1 flex justify-center">{icon}</div>
          )}
          {eyebrow && (
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-col items-center">
            <h3 className="inline-block border-b-[3px] border-[var(--text)] pb-1 text-xl font-black tracking-wide text-[var(--text)]">{title}</h3>
          </div>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center justify-end">
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
        </div>
      </div>
    </div>
  )
}
