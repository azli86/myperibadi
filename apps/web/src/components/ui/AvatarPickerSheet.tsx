"use client"

import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Camera, Image as ImageIcon, Trash2, Loader2 } from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken } from "@/lib/auth-session"
import { invalidateApiCache } from "@/lib/api-cache"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"

type Props = {
  open: boolean
  hasAvatar: boolean
  onClose: () => void
  onChanged: (url: string | null) => void
  notify: (title: string, message: string, type?: "success" | "error" | "info" | "warning") => void
}

export default function AvatarPickerSheet({ open, hasAvatar, onClose, onChanged, notify }: Props) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const [busy, setBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const swipe = useSwipeDownToClose(() => !busy && onClose())

  const afterChange = (url: string | null, okTitle: string, okMsg: string) => {
    invalidateApiCache("/api/users/me", getAccessToken())
    window.dispatchEvent(new Event("avatar-updated"))
    onChanged(url)
    notify(okTitle, okMsg, "success")
    onClose()
  }

  const doUpload = async (file: File) => {
    setBusy(true)
    try {
      if (file.size > 2 * 1024 * 1024) {
        notify(tr("Saiz Terlalu Besar", "File Too Large"), tr("Maksimum saiz imej ialah 2 MB.", "Maximum image size is 2 MB."), "error")
        return
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        notify(tr("Format Tidak Sah", "Invalid Format"), tr("Sila muat naik format JPG, PNG atau WEBP.", "Please upload JPG, PNG or WEBP."), "error")
        return
      }
      const token = getAccessToken()
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const apiErr = await res.json().catch(() => ({}))
        throw new Error(apiErr?.detail || "Upload failed")
      }
      const data = await res.json()
      afterChange(data.avatar_url, tr("Berjaya", "Success"), tr("Gambar profil telah dikemaskini.", "Profile picture updated."))
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Gagal memuat naik gambar.", "Upload failed.")
      notify(tr("Muat Naik Gagal", "Upload Failed"), msg, "error")
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    setBusy(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/avatar", {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const apiErr = await res.json().catch(() => ({}))
        throw new Error(apiErr?.detail || "Delete failed")
      }
      const data = await res.json()
      afterChange(data.avatar_url ?? null, tr("Gambar Dipadam", "Avatar Removed"), tr("Gambar profil telah dibuang.", "Profile picture removed."))
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Gagal membuang gambar.", "Failed to remove picture.")
      notify(tr("Ralat", "Error"), msg, "error")
    } finally {
      setBusy(false)
    }
  }

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void doUpload(file)
    e.target.value = ""
  }

  const gridOpt =
    "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-4 text-xs font-bold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-50"
  const removeOpt =
    "flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm font-bold text-red-600 dark:text-red-400 transition active:scale-[0.98] disabled:opacity-50"

  if (!open) return null

  return createPortal(
    <>
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={pick(cameraRef)} disabled={busy} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick(galleryRef)} disabled={busy} />
      <div
        className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-transparent p-0 sm:items-center"
        onClick={() => !busy && onClose()}
        onTouchMove={(e) => e.preventDefault()}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          data-swipe-sheet
          {...swipe}
          className="app-sheet-panel w-full h-auto border border-[var(--border)] bg-[var(--sheet-bg)] sm:max-w-[24rem]"
        >
          <AppSheetHeader
            title={tr("Gambar Profil", "Profile Picture")}
            subtitle={tr("Pilih sumber imej", "Choose an image source")}
            onClose={() => !busy && onClose()}
          />
          <div className="px-4 pb-4 pt-3">
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" className={gridOpt} disabled={busy} onClick={() => cameraRef.current?.click()}>
                <Camera size={22} className="shrink-0 text-[var(--text)]" />
                <span>{tr("Kamera", "Camera")}</span>
              </button>
              <button type="button" className={gridOpt} disabled={busy} onClick={() => galleryRef.current?.click()}>
                <ImageIcon size={22} className="shrink-0 text-[var(--text)]" />
                <span>{tr("Galeri", "Gallery")}</span>
              </button>
            </div>
            <div className="mt-2.5">
              {hasAvatar && (
                <button type="button" className={removeOpt} disabled={busy} onClick={doDelete}>
                  <Trash2 size={18} className="shrink-0" />
                  <span>{tr("Buang Gambar", "Remove Picture")}</span>
                </button>
              )}
            </div>
            {busy && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--muted)]">
                <Loader2 size={16} className="animate-spin" />
                {tr("Memproses…", "Processing…")}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
