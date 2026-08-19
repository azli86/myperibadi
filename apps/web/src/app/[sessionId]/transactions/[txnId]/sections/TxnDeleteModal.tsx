"use client"

import { AlertTriangle, Trash2, Loader2 } from "lucide-react"
import { useLang } from "@/lib/lang"

export type TxnDeleteModalProps = {
  open: boolean
  title: string
  description: string
  deleting: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function TxnDeleteModal({ open, title, description, deleting, onClose, onConfirm }: TxnDeleteModalProps) {
  const { t: langT } = useLang()
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-transparent p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl border border-[var(--border)] bg-[var(--sheet-bg)] p-5 sm:max-w-[22rem] sm:rounded-2xl sm:p-6"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <AlertTriangle size={28} />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">{title}</h3>
          <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--muted)]">{description}</p>
          <div className="grid w-full grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] py-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {langT.cancel}
            </button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition-all active:scale-95 disabled:opacity-60"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <><Trash2 size={14} /> {langT.delete}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
