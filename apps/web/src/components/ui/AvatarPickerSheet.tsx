"use client"

import { useRef, useState } from "react"
import { Camera, Image as ImageIcon, Trash2, Loader2, X } from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken } from "@/lib/auth-session"
import { invalidateApiCache } from "@/lib/api-cache"
import { Sheet, SheetContent } from "@/components/ui/sheet"

type Props = {
  open: boolean
  hasAvatar: boolean
  onClose: () => void
  onChanged: (url: string | null) => void
  notify: (title: string, message: string, type?: "success" | "error" | "info" | "warning") => void
}

export default function AvatarPickerSheet({ open, hasAvatar, onClose, onChanged, notify }: Props) {
  const { lang } = useLang()
  const tr = (bm: string, en: string) => (lang === "BM" ? bm : en)
  const [busy, setBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

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

  const optionCls =
    "flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-50"

  return (
    <>
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={pick(cameraRef)} disabled={busy} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick(galleryRef)} disabled={busy} />
      <Sheet open={open} onOpenChange={(o) => {
        if (!o && !busy) onClose()
      }}>
        <SheetContent side="bottom" className="app-sheet-panel w-full max-h-[85dvh] overflow-y-auto border-t border-[var(--border)] bg-[var(--card)] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <div className="mx-auto w-full max-w-md px-1.5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-[var(--text)]">{tr("Gambar Profil", "Profile Picture")}</h2>
                <p className="text-xs text-[var(--muted)]">{tr("Pilih sumber imej", "Choose an image source")}</p>
              </div>
              <button type="button" onClick={() => !busy && onClose()} aria-label={tr("Tutup", "Close")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] active:scale-95 transition">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2.5">
              <button type="button" className={optionCls} disabled={busy} onClick={() => cameraRef.current?.click()}>
                <Camera size={18} className="shrink-0 text-[var(--text)]" />
                <span>{tr("Ambil Gambar (Kamera)", "Take Photo (Camera)")}</span>
              </button>
              <button type="button" className={optionCls} disabled={busy} onClick={() => galleryRef.current?.click()}>
                <ImageIcon size={18} className="shrink-0 text-[var(--text)]" />
                <span>{tr("Pilih dari Galeri", "Choose from Gallery")}</span>
              </button>
              {hasAvatar && (
                <button type="button" className={`${optionCls} border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400`} disabled={busy} onClick={doDelete}>
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
        </SheetContent>
      </Sheet>
    </>
  )
}
