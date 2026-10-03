"use client"

import React, { useCallback, useRef, useState } from "react"
import { Camera, FileText, ImagePlus, Loader2, Paperclip, X } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

type DeviceForm = {
  device_name: string
  category: string
  brand: string
  model: string
  serial_number: string
  purchase_date: string
  purchase_price: string
  store_or_seller: string
  receipt_or_order_number: string
  warranty_start_date: string
  warranty_duration: string
  notes: string
}

const DURATIONS = [3, 6, 12, 24, 36, 48, 60, 120]

const emptyForm = (): DeviceForm => ({
  device_name: "",
  category: "",
  brand: "",
  model: "",
  serial_number: "",
  purchase_date: "",
  purchase_price: "",
  store_or_seller: "",
  receipt_or_order_number: "",
  warranty_start_date: "",
  warranty_duration: "12",
  notes: "",
})

function todayKey() {
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  return `${kl.getFullYear()}-${String(kl.getMonth() + 1).padStart(2, "0")}-${String(kl.getDate()).padStart(2, "0")}`
}

function addMonths(dateStr: string, months: number): string {
  if (!dateStr || !months) return ""
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ""
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), lastDay))
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`
}

const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"
const section = "rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 space-y-3"

export default function WarrantyAddPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const { showAlert, alertModal } = usePageAlert(lang)

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<DeviceForm>(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken()
    return token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}
  }

  const set = (patch: Partial<DeviceForm>) => setForm((prev) => ({ ...prev, ...patch }))
  const start = form.warranty_start_date || form.purchase_date
  const months = Number(form.warranty_duration)
  const expiry = start && months ? addMonths(start, months) : ""

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      showAlert(tr("Fail tak sah", "Invalid file"), tr("Pilih fail gambar.", "Choose an image file."), "error")
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }
  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  const problem = !form.device_name.trim()
    ? tr("Nama peranti wajib.", "Device name is required.")
    : !form.serial_number.trim()
      ? tr("Nombor siri wajib.", "Serial number is required.")
      : !start
        ? tr("Isi tarikh beli atau tarikh mula waranti.", "Enter the purchase date or the warranty start date.")
        : form.purchase_date && form.purchase_date > todayKey()
          ? tr("Tarikh beli tidak boleh pada masa depan.", "The purchase date cannot be in the future.")
          : form.purchase_price && !(Number(form.purchase_price) >= 0)
            ? tr("Harga beli tidak sah.", "The purchase price is not valid.")
            : !months
              ? tr("Pilih tempoh waranti.", "Choose the warranty duration.")
              : null

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/warranties", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          device_name: form.device_name.trim(),
          category: form.category.trim() || null,
          brand: form.brand.trim() || null,
          model: form.model.trim() || null,
          serial_number: form.serial_number.trim(),
          purchase_date: form.purchase_date || null,
          purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
          store_or_seller: form.store_or_seller.trim() || null,
          receipt_or_order_number: form.receipt_or_order_number.trim() || null,
          warranty_start_date: start,
          warranty_duration_months: months,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(typeof payload?.detail === "string" ? payload.detail : tr("Gagal simpan peranti.", "Failed to save device."))
      }
      const created = (await res.json()) as { id: number }

      // The device is saved; a failed upload must not be silent, but it must not undo the save either.
      const failed: string[] = []
      for (const [file, path, name] of [
        [imageFile, "image", tr("gambar", "photo")],
        [receiptFile, "receipt", tr("resit", "receipt")],
      ] as const) {
        if (!file) continue
        const fd = new FormData()
        fd.append("file", file)
        const up = await fetch(`/api/warranties/${created.id}/${path}`, { method: "POST", headers: authHeaders(), credentials: "include", body: fd }).catch(() => null)
        if (!up || !up.ok) failed.push(name)
      }
      if (failed.length) {
        showAlert(tr("Peranti disimpan", "Device saved"), tr(`Tetapi ${failed.join(" dan ")} gagal dimuat naik. Cuba lagi di halaman butiran.`, `But the ${failed.join(" and ")} could not be uploaded. Try again on the details page.`), "warning")
      }
      router.push(`/${sessionId}/warranty/${created.id}`)
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
      setSaving(false)
    }
  }

  const saveBtn = (
    <button type="submit" disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
      {saving ? <Loader2 size={16} className="animate-spin" /> : null}
      {tr("Simpan peranti", "Save device")}
    </button>
  )

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader title={tr("Tambah Peranti", "Add Device")} fallbackHref={`/${sessionId}/warranty`} />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Tambah Peranti", "Add Device")}
        breadcrumbs={[{ label: tr("Waranti Saya", "My Warranty"), href: `/${sessionId}/warranty` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/warranty`}
      />

      <DesktopPageBody className="mt-2 px-1 md:mt-0 md:px-0">
        <form onSubmit={handleSave} className="mx-auto max-w-2xl space-y-4">
          <input ref={imageInputRef} type="file" accept="image/*" onChange={pickImage} className="hidden" />
          {imagePreview ? (
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[1.5rem] border border-[var(--border)] md:aspect-[21/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button type="button" onClick={() => imageInputRef.current?.click()} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-semibold text-[var(--text)]">
                  <Camera size={14} />
                  {tr("Tukar", "Change")}
                </button>
                <button type="button" onClick={removeImage} aria-label={tr("Buang gambar", "Remove photo")} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => imageInputRef.current?.click()} className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-[1.5rem] border border-dashed border-[var(--border-strong)] text-[var(--muted)]">
              <ImagePlus size={22} />
              <span className="text-sm font-semibold">{tr("Gambar peranti (pilihan)", "Device photo (optional)")}</span>
            </button>
          )}

          <section className={section}>
            <h2 className="text-base font-bold text-[var(--text)]">{tr("Peranti", "Device")}</h2>
            <div>
              <label htmlFor="w-name" className={label}>{tr("Nama peranti *", "Device name *")}</label>
              <input id="w-name" value={form.device_name} maxLength={190} onChange={(e) => set({ device_name: e.target.value })} placeholder={tr('cth. Monitor Samsung 27"', 'e.g. Samsung Monitor 27"')} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="w-cat" className={label}>{tr("Kategori", "Category")}</label>
                <input id="w-cat" value={form.category} maxLength={80} onChange={(e) => set({ category: e.target.value })} placeholder={tr("Elektronik", "Electronics")} className={field} />
              </div>
              <div>
                <label htmlFor="w-brand" className={label}>{tr("Jenama", "Brand")}</label>
                <input id="w-brand" value={form.brand} maxLength={80} onChange={(e) => set({ brand: e.target.value })} placeholder="Samsung" className={field} />
              </div>
              <div>
                <label htmlFor="w-model" className={label}>Model</label>
                <input id="w-model" value={form.model} maxLength={80} onChange={(e) => set({ model: e.target.value })} placeholder="LS27AG300" className={field} />
              </div>
              <div>
                <label htmlFor="w-serial" className={label}>{tr("No. siri *", "Serial no. *")}</label>
                <input id="w-serial" value={form.serial_number} maxLength={120} onChange={(e) => set({ serial_number: e.target.value })} placeholder="S27A938291" className={field} />
              </div>
            </div>
          </section>

          <section className={section}>
            <h2 className="text-base font-bold text-[var(--text)]">{tr("Pembelian", "Purchase")}</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="w-pdate" className={label}>{tr("Tarikh beli", "Purchase date")}</label>
                <input id="w-pdate" type="date" max={todayKey()} value={form.purchase_date} onChange={(e) => set({ purchase_date: e.target.value })} className={field} />
              </div>
              <div>
                <label htmlFor="w-price" className={label}>{tr("Harga (RM)", "Price (RM)")}</label>
                <input id="w-price" inputMode="decimal" value={form.purchase_price} onChange={(e) => set({ purchase_price: e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") })} placeholder="0.00" className={field} />
              </div>
            </div>
            <div>
              <label htmlFor="w-store" className={label}>{tr("Kedai / penjual", "Store / seller")}</label>
              <input id="w-store" value={form.store_or_seller} maxLength={190} onChange={(e) => set({ store_or_seller: e.target.value })} placeholder={tr("cth. Senheng, Shopee", "e.g. Senheng, Shopee")} className={field} />
            </div>
            <div>
              <label htmlFor="w-order" className={label}>{tr("No. resit / pesanan", "Receipt / order no.")}</label>
              <input id="w-order" value={form.receipt_or_order_number} maxLength={120} onChange={(e) => set({ receipt_or_order_number: e.target.value })} placeholder="INV-2026-001" className={field} />
            </div>
          </section>

          <section className={section}>
            <h2 className="text-base font-bold text-[var(--text)]">{tr("Waranti", "Warranty")}</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="w-start" className={label}>{tr("Tarikh mula", "Start date")}</label>
                <input id="w-start" type="date" value={form.warranty_start_date || form.purchase_date} onChange={(e) => set({ warranty_start_date: e.target.value })} className={field} />
              </div>
              <div>
                <label htmlFor="w-dur" className={label}>{tr("Tempoh", "Duration")}</label>
                <select id="w-dur" value={form.warranty_duration} onChange={(e) => set({ warranty_duration: e.target.value })} className={field}>
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>{m % 12 === 0 ? tr(`${m / 12} tahun`, `${m / 12} ${m === 12 ? "year" : "years"}`) : tr(`${m} bulan`, `${m} months`)}</option>
                  ))}
                </select>
              </div>
            </div>
            {expiry ? (
              <p className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)]">
                {tr("Waranti tamat pada", "Warranty ends on")}{" "}
                <span className="font-bold text-[var(--text)]">{new Date(`${expiry}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}</span>
              </p>
            ) : null}
          </section>

          <section className={section}>
            <h2 className="text-base font-bold text-[var(--text)]">{tr("Resit dan nota", "Receipt and notes")}</h2>
            <input ref={receiptInputRef} type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="hidden" />
            {receiptFile ? (
              <div className="flex items-center gap-3 rounded-[1.25rem] border border-[var(--border)] p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]"><FileText size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--text)]">{receiptFile.name}</span>
                  <span className="block text-xs text-[var(--muted)]">{(receiptFile.size / 1024).toFixed(0)} KB</span>
                </span>
                <button type="button" onClick={() => { setReceiptFile(null); if (receiptInputRef.current) receiptInputRef.current.value = "" }} aria-label={tr("Buang resit", "Remove receipt")} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)]"><X size={16} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => receiptInputRef.current?.click()} className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] text-sm font-semibold text-[var(--muted)]">
                <Paperclip size={15} />
                {tr("Muat naik resit (pilihan)", "Upload receipt (optional)")}
              </button>
            )}
            <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder={tr("Nota tambahan…", "Extra notes…")} aria-label={tr("Nota", "Notes")} className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]" />
          </section>

          <div className="flex gap-2">
            <button type="button" onClick={() => router.push(`/${sessionId}/warranty`)} className="h-12 flex-1 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)]">
              {tr("Batal", "Cancel")}
            </button>
            {saveBtn}
          </div>
        </form>
      </DesktopPageBody>

      {alertModal}
    </div>
  )
}
