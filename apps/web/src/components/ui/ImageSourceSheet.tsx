"use client"

import { createPortal } from "react-dom"
import { Camera, FileText, Image as ImageIcon } from "lucide-react"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useLang } from "@/lib/lang"

interface ImageSourceSheetProps {
  open: boolean
  onClose: () => void
  onCamera: () => void
  onGallery: () => void
  onPdf?: () => void
  title?: string
  subtitle?: string
}

export default function ImageSourceSheet({ open, onClose, onCamera, onGallery, onPdf, title, subtitle }: ImageSourceSheetProps) {
  const { lang } = useLang()
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-transparent p-0 sm:items-center"
      onClick={onClose}
      onTouchMove={(e) => e.preventDefault()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="app-sheet-panel w-full h-auto border border-[var(--border)] bg-[var(--sheet-bg)] sm:max-w-[24rem]"
      >
        <AppSheetHeader
          title={title ?? (lang === "BM" ? "Lampir Gambar" : "Attach Photo")}
          subtitle={subtitle ?? (lang === "BM" ? "Pilih sumber imej" : "Choose an image source")}
          onClose={onClose}
        />
        <div className="px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-4 text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
              onClick={onCamera}
            >
              <Camera size={22} className="shrink-0 text-[var(--text)]" />
              <span>{lang === "BM" ? "Kamera" : "Camera"}</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-4 text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
              onClick={onGallery}
            >
              <ImageIcon size={22} className="shrink-0 text-[var(--text)]" />
              <span>{lang === "BM" ? "Galeri" : "Gallery"}</span>
            </button>
          </div>
          {onPdf ? (
            <button
              type="button"
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-4 text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
              onClick={onPdf}
            >
              <FileText size={18} className="shrink-0 text-[var(--text)]" />
              <span>{lang === "BM" ? "Pilih Dokumen (PDF)" : "Choose File (PDF)"}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
