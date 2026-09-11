"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Camera, Image as ImageIcon, Trash2, Loader2, Check, X, ZoomIn, ZoomOut } from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken } from "@/lib/auth-session"
import { invalidateApiCache } from "@/lib/api-cache"
import { cacheAvatarFromUrl, writeAvatarCache } from "@/lib/avatar-cache"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"

type Props = {
  open: boolean
  hasAvatar: boolean
  onClose: () => void
  onChanged: (url: string | null) => void
  notify: (title: string, message: string, type?: "success" | "error" | "info" | "warning") => void
}

const AVATAR_MAX_BYTES = 10 * 1024 * 1024
const AVATAR_COMPRESS_ABOVE = 1.5 * 1024 * 1024

// Mobile photos are often >2 MB. Downscale client-side before upload so the
// payload fits, then compare final size against the server cap BEFORE hitting R2.
const compressAvatar = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX_DIM = 1440
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("canvas"))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const mime = file.type === "image/webp" ? "image/webp" : "image/jpeg"
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encode"))),
        mime,
        0.86
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("decode"))
    }
    img.src = url
  })

const clamp = (v: number, min: number, max: number) => {
  if (!Number.isFinite(v)) return Number.isFinite(min) ? min : 0
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.min(Math.max(v, lo), hi)
}

export default function AvatarPickerSheet({ open, hasAvatar, onClose, onChanged, notify }: Props) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const [busy, setBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const swipe = useSwipeDownToClose(() => !busy && onClose())

  // ── Crop / zoom state ──
  const [crop, setCrop] = useState<{ file: File; url: string } | null>(null)
  const [cropBusy, setCropBusy] = useState(false)
  const [cropDims, setCropDims] = useState<{ iw: number; ih: number } | null>(null)
  const [cropT, setCropT] = useState({ x: 0, y: 0, f: 1 })
  const [boxC, setBoxC] = useState(0)
  const cropBoxRef = useRef<HTMLDivElement>(null)
  const cropImgRef = useRef<HTMLImageElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    return () => {
      if (crop) URL.revokeObjectURL(crop.url)
    }
  }, [crop])

  // Keep crop box clientWidth up-to-date across render cycles & screen rotations
  useEffect(() => {
    if (!crop || !cropBoxRef.current) return
    const el = cropBoxRef.current
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setBoxC(w)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [crop])

  // Block ALL multi-touch page-pinch gestures (Android touchstart/touchmove & iOS Safari gesture*)
  // while cropping. Releasing two fingers otherwise zooms the page/WebView and blanks the fixed overlay.
  // Also lock body scroll so no pull-to-refresh / history-gesture can fire a page reload
  // (which during a slot-swap surfaces as a 500).
  useEffect(() => {
    if (!crop) return
    const stop = (e: Event) => e.preventDefault()
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }
    const opts: AddEventListenerOptions = { passive: false }
    document.addEventListener("gesturestart", stop, opts)
    document.addEventListener("gesturechange", stop, opts)
    document.addEventListener("gestureend", stop, opts)
    document.addEventListener("touchstart", onTouch, opts)
    document.addEventListener("touchmove", onTouch, opts)
    const prevOverflow = document.body.style.overflow
    const prevOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    return () => {
      document.removeEventListener("gesturestart", stop)
      document.removeEventListener("gesturechange", stop)
      document.removeEventListener("gestureend", stop)
      document.removeEventListener("touchstart", onTouch)
      document.removeEventListener("touchmove", onTouch)
      document.body.style.overflow = prevOverflow
      document.body.style.overscrollBehavior = prevOverscroll
    }
  }, [crop])

  // Render the zoomed/pan preview into a <canvas>. No CSS transform on the big
  // bitmap at all — iOS Safari blanks transformed layers clipped inside
  // overflow-hidden + border-radius parents once the gesture ends. A canvas is a
  // single flat layer, immune to that compositing bug.
  useEffect(() => {
    const cv = previewRef.current
    const img = cropImgRef.current
    if (!cv || !img || !cropDims || !boxC) return
    const iw = cropDims.iw
    const ih = cropDims.ih
    const k0 = Math.max(boxC / iw, boxC / ih)
    const f = clamp(cropT.f, 1, 4)
    const k = k0 * f
    const halfX = Math.max(0, (iw * k - boxC) / 2)
    const halfY = Math.max(0, (ih * k - boxC) / 2)
    const x = clamp(cropT.x, -halfX, halfX)
    const y = clamp(cropT.y, -halfY, halfY)
    const sz = boxC / k
    const cx = iw / 2 - x / k
    const cy = ih / 2 - y / k
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const px = Math.round(boxC * dpr)
    if (cv.width !== px || cv.height !== px) {
      cv.width = px
      cv.height = px
    }
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz, 0, 0, cv.width, cv.height)
  }, [crop, cropDims, boxC, cropT])

  const afterChange = (url: string | null, okTitle: string, okMsg: string) => {
    // Persist the avatar locally so it never reloads from the CDN on page opens.
    // Only written here (on explicit user update / removal) — that is the single
    // point where the cached image is allowed to change.
    if (url) {
      void cacheAvatarFromUrl(url)
    } else {
      writeAvatarCache(null)
    }
    invalidateApiCache("/api/users/me", getAccessToken())
    window.dispatchEvent(new Event("avatar-updated"))
    onChanged(url)
    notify(okTitle, okMsg, "success")
    onClose()
  }

  const doUpload = async (file: File) => {
    setBusy(true)
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        notify(tr("Format Tidak Sah", "Invalid Format"), tr("Sila muat naik format JPG, PNG atau WEBP.", "Please upload JPG, PNG or WEBP."), "error")
        return
      }
      // Compare size BEFORE sending to R2: downscale big photos, then enforce cap.
      let payload: Blob = file
      let name = file.name
      if (file.size > AVATAR_COMPRESS_ABOVE) {
        try {
          payload = await compressAvatar(file)
          name = payload.type === "image/webp" ? "avatar.webp" : "avatar.jpg"
        } catch {
          notify(tr("Tidak Boleh Baca", "Cannot Read"), tr("Gambar tidak dapat diproses. Cuba gambar lain.", "Image could not be processed. Try another photo."), "error")
          return
        }
      }
      if (payload.size > AVATAR_MAX_BYTES) {
        notify(tr("Saiz Terlalu Besar", "File Too Large"), tr("Imej terlalu besar walaupun selepas mampat. Cuba gambar lain.", "Image is still too large after compression. Try another photo."), "error")
        return
      }
      const token = getAccessToken()
      const form = new FormData()
      form.append("file", payload, name)
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
    e.target.value = ""
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify(tr("Format Tidak Sah", "Invalid Format"), tr("Sila muat naik format JPG, PNG atau WEBP.", "Please upload JPG, PNG or WEBP."), "error")
      return
    }
    dragRef.current = null
    pointersRef.current.clear()
    setCropDims(null)
    setCropT({ x: 0, y: 0, f: 1 })
    setBoxC(0)
    setCrop({ file, url: URL.createObjectURL(file) })
  }

  const onCropImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    cropImgRef.current = img
    setCropDims({ iw: img.naturalWidth, ih: img.naturalHeight })
    setBoxC(cropBoxRef.current?.clientWidth || 0)
  }

  const onStagePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Pinch disabled by request: ignore any extra finger; only the first
    // pointer drives single-finger pan (zoom via +/− buttons).
    if (pointersRef.current.size >= 1) return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
    const pt = { x: e.clientX, y: e.clientY }
    pointersRef.current.set(e.pointerId, pt)
    dragRef.current = pt
  }

  const onStagePointerMove = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const p = pointersRef.current.get(e.pointerId)
    if (!p || !dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    dragRef.current = { x: e.clientX, y: e.clientY }
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    setCropT((t) => {
      if (!cropDims || !boxC) return t
      const k0 = Math.max(boxC / cropDims.iw, boxC / cropDims.ih)
      const k = k0 * t.f
      if (!Number.isFinite(k) || k <= 0) return t
      const hx = Math.max(0, (cropDims.iw * k - boxC) / 2)
      const hy = Math.max(0, (cropDims.ih * k - boxC) / 2)
      const nextX = clamp(t.x + dx, -hx, hx)
      const nextY = clamp(t.y + dy, -hy, hy)
      return {
        ...t,
        x: Number.isFinite(nextX) ? nextX : 0,
        y: Number.isFinite(nextY) ? nextY : 0,
      }
    })
  }

  const onStagePointerUp = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      }
    } catch {}
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size === 0) {
      dragRef.current = null
      setCropT((t) => {
        if (!cropDims || !boxC) return t
        const k0 = Math.max(boxC / cropDims.iw, boxC / cropDims.ih)
        const k = k0 * t.f
        if (!Number.isFinite(k) || k <= 0) return t
        const hx = Math.max(0, (cropDims.iw * k - boxC) / 2)
        const hy = Math.max(0, (cropDims.ih * k - boxC) / 2)
        const nextX = clamp(t.x, -hx, hx)
        const nextY = clamp(t.y, -hy, hy)
        return {
          ...t,
          x: Number.isFinite(nextX) ? nextX : 0,
          y: Number.isFinite(nextY) ? nextY : 0,
        }
      })
    }
  }

  const zoomBy = (d: number) => setCropT((t) => ({ ...t, f: clamp(t.f + d, 1, 4) }))

  const cancelCrop = () => {
    dragRef.current = null
    pointersRef.current.clear()
    setCropDims(null)
    setCropT({ x: 0, y: 0, f: 1 })
    if (crop) {
      URL.revokeObjectURL(crop.url)
      setCrop(null)
    }
  }

  const applyCrop = async () => {
    const img = cropImgRef.current
    if (!img || !cropDims || !crop) return
    setCropBusy(true)
    try {
      const C = boxC
      const k0 = Math.max(C / cropDims.iw, C / cropDims.ih)
      const k = k0 * cropT.f
      const iw = cropDims.iw
      const ih = cropDims.ih
      const halfX = Math.max(0, (iw * k - C) / 2)
      const halfY = Math.max(0, (ih * k - C) / 2)
      const x = clamp(cropT.x, -halfX, halfX)
      const y = clamp(cropT.y, -halfY, halfY)
      const sz = C / k
      const cx = iw / 2 - x / k
      const cy = ih / 2 - y / k
      const O = 1024
      const cv = document.createElement("canvas")
      cv.width = O
      cv.height = O
      const ctx = cv.getContext("2d")!
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, O, O)
      ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz, 0, 0, O, O)
      const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.9))
      if (!blob) throw new Error("encode")
      const file = new File([blob], "avatar-crop.jpg", { type: "image/jpeg" })
      setCropBusy(false)
      setCrop(null)
      setCropDims(null)
      URL.revokeObjectURL(crop.url)
      void doUpload(file)
    } catch {
      setCropBusy(false)
      notify(tr("Ralat", "Error"), tr("Gagal memproses gambar.", "Could not process image."), "error")
    }
  }

  const gridOpt =
    "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-4 text-xs font-bold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-50"
  const removeOpt =
    "flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm font-bold text-red-600 dark:text-red-400 transition active:scale-[0.98] disabled:opacity-50"

  if (!open) return null

  return createPortal(
      <>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick(cameraRef)} disabled={busy} />
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

      {/* ── Crop / zoom full-screen overlay ── */}
      {crop && (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-black/95 touch-none select-none overscroll-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] text-white">
            <button
              type="button"
              aria-label={tr("Batal", "Cancel")}
              onClick={cancelCrop}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition active:scale-90"
            >
              <X size={20} />
            </button>
            <span className="text-sm font-bold">{tr("Gerakkan & Zum", "Move & Zoom")}</span>
            <button
              type="button"
              onClick={applyCrop}
              disabled={cropBusy || !cropDims}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-bold transition active:scale-90 disabled:opacity-50"
            >
              {cropBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Check size={16} />
                  <span>{tr("Guna", "Use")}</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center px-6 touch-none select-none">
            <div
              ref={cropBoxRef}
              className="relative aspect-square touch-none select-none overflow-hidden rounded-full ring-4 ring-white/25"
              style={{ width: "min(86vw, 400px)" }}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
              onPointerCancel={onStagePointerUp}
            >
              <canvas
                ref={previewRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
              {/* Off-screen decoder source for the canvas (never styled/transformed). */}
              <img
                src={crop.url}
                alt=""
                draggable={false}
                onLoad={onCropImgLoad}
                onError={() => {
                  notify(tr("Tidak Boleh Baca", "Cannot Read"), tr("Gambar tidak dapat dibuka. Cuba format JPG/PNG/WEBP.", "Image cannot be opened. Try JPG/PNG/WEBP format."), "error")
                  cancelCrop()
                }}
                className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px opacity-0"
              />
              <div className="pointer-events-none absolute inset-0 rounded-full border border-white/20" />
            </div>
          </div>

          <div className="px-6 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-white">
              <button
                type="button"
                aria-label={tr("Zum keluar", "Zoom out")}
                disabled={cropBusy}
                onClick={() => zoomBy(-0.25)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition active:scale-90 disabled:opacity-50"
              >
                <ZoomOut size={18} />
              </button>
              <span className="px-2 text-xs font-semibold opacity-90">
                {tr("Seret untuk gerak. Guna butang +/− untuk zum.", "Drag to move. Use +/− to zoom.")}
              </span>
              <button
                type="button"
                aria-label={tr("Zum masuk", "Zoom in")}
                disabled={cropBusy}
                onClick={() => zoomBy(0.25)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition active:scale-90 disabled:opacity-50"
              >
                <ZoomIn size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
      </>,
    document.body
  )
}
