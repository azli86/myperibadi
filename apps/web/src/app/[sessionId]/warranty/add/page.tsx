"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  Camera,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Shield,
  X,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"

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
  warranty_expiry_date: string
  notes: string
}

const DURATION_OPTIONS = [
  { value: "3", months: 3 },
  { value: "6", months: 6 },
  { value: "12", months: 12 },
  { value: "24", months: 24 },
  { value: "36", months: 36 },
] as const

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
  warranty_expiry_date: "",
  notes: "",
})

function addMonths(dateStr: string, months: number): string {
  if (!dateStr || !months) return ""
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ""
  const year = d.getFullYear()
  const month = d.getMonth() + months
  const day = d.getDate()
  const target = new Date(year, month, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  const y = target.getFullYear()
  const m = String(target.getMonth() + 1).padStart(2, "0")
  const dd = String(target.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function formatDateLabel(value?: string | null, locale = "en-MY") {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
}

const fieldClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--input-placeholder)] focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--input-focus)]/25"

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--card-shadow)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
          <Icon size={15} />
        </div>
        <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
          {title}
        </p>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="text-xs font-semibold text-[var(--text)]">
      {children}
      {required ? <span className="ml-0.5 text-[var(--expense)]">*</span> : null}
    </span>
  )
}

export default function WarrantyAddPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<DeviceForm>(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const dateLocale = isBm ? "ms-MY" : "en-MY"

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) {
      return { Authorization: `Bearer ${token}` }
    }
    return {}
  }, [])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  // Hide mobile bottom nav so sticky Save bar is fully visible
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: true } }),
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }),
      )
    }
  }, [])

  const recomputeWarrantyDates = useCallback((next: DeviceForm): DeviceForm => {
    const result = { ...next }
    if (result.purchase_date && !result.warranty_start_date) {
      result.warranty_start_date = result.purchase_date
    }
    const months = Number(result.warranty_duration)
    const start = result.warranty_start_date || result.purchase_date
    result.warranty_expiry_date = months && start ? addMonths(start, months) : ""
    return result
  }, [])

  const updateForm = useCallback(
    (patch: Partial<DeviceForm>) => {
      setForm((prev) => recomputeWarrantyDates({ ...prev, ...patch }))
    },
    [recomputeWarrantyDates],
  )

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
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

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptFile(file)
  }

  const removeReceipt = () => {
    setReceiptFile(null)
    if (receiptInputRef.current) receiptInputRef.current.value = ""
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.device_name.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Nama peranti wajib.", "Device name is required."), "error")
      return
    }
    if (!form.serial_number.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Nombor siri wajib.", "Serial number is required."), "error")
      return
    }
    const warrantyStart = form.warranty_start_date || form.purchase_date
    if (!warrantyStart) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Tarikh mula waranti wajib.", "Warranty start date is required."), "error")
      return
    }
    const durationMonths = Number(form.warranty_duration) || 0
    if (!durationMonths) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Tempoh waranti wajib.", "Warranty duration is required."), "error")
      return
    }
    const warrantyExpiry = form.warranty_expiry_date || addMonths(warrantyStart, durationMonths)
    if (!warrantyExpiry) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Gagal kira tarikh tamat waranti.", "Failed to calculate warranty expiry."), "error")
      return
    }
    setSaving(true)
    try {
      const body = {
        device_name: form.device_name.trim(),
        category: form.category.trim() || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serial_number.trim(),
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
        store_or_seller: form.store_or_seller.trim() || null,
        receipt_or_order_number: form.receipt_or_order_number.trim() || null,
        warranty_start_date: warrantyStart,
        warranty_duration_months: durationMonths,
        warranty_expiry_date: warrantyExpiry,
        notes: form.notes.trim() || null,
      }
      const res = await fetch("/api/warranties", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan peranti.", "Failed to save device."))
      }
      const created = (await res.json()) as { id: number }

      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        await fetch(`/api/warranties/${created.id}/image`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }
      if (receiptFile) {
        const fd = new FormData()
        fd.append("file", receiptFile)
        await fetch(`/api/warranties/${created.id}/receipt`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }

      showAlert(tr("Berjaya", "Success"), tr("Peranti disimpan.", "Device saved."), "success")
      router.push(`/${sessionId}/warranty/${created.id}`)
    } catch (err) {
      showAlert(
        tr("Gagal", "Failed"),
        err instanceof Error ? err.message : tr("Gagal simpan peranti.", "Failed to save device."),
        "error",
      )
    } finally {
      setSaving(false)
    }
  }

  const photoBlock = (
    <div className="overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--card-shadow)]">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />
      {imagePreview ? (
        <div className="relative aspect-[16/10] w-full md:aspect-[21/9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pb-3 pt-10">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-3 py-1.5 text-xs font-bold text-[var(--btn-primary-text)]"
            >
              <Camera size={14} />
              {tr("Tukar", "Change")}
            </button>
            <button
              type="button"
              onClick={removeImage}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] text-[var(--text)] shadow-sm"
              aria-label={tr("Buang gambar", "Remove photo")}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 bg-[var(--surface-tint)]/50 transition hover:bg-[var(--surface-tint)] md:aspect-[21/9]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card)] text-[var(--muted)] shadow-[var(--card-shadow)]">
            <ImageIcon size={26} />
          </div>
          <div className="px-4 text-center">
            <p className="text-sm font-bold text-[var(--text)]">
              {tr("Gambar peranti", "Device photo")}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {tr("Pilihan — ketik untuk muat naik", "Optional — tap to upload")}
            </p>
          </div>
        </button>
      )}
    </div>
  )

  const formBody = (
    <form id="warranty-add-form" onSubmit={handleSave} className="space-y-4">
      <SectionCard title={tr("Maklumat Peranti", "Device Information")} icon={Shield}>
        <label className="block space-y-1.5">
          <FieldLabel required>{tr("Nama peranti", "Device name")}</FieldLabel>
          <input
            value={form.device_name}
            onChange={(e) => updateForm({ device_name: e.target.value })}
            className={fieldClass}
            placeholder={tr('cth. Samsung Monitor 27"', 'e.g. Samsung Monitor 27"')}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <FieldLabel>{tr("Kategori", "Category")}</FieldLabel>
            <input
              value={form.category}
              onChange={(e) => updateForm({ category: e.target.value })}
              className={fieldClass}
              placeholder={tr("Elektronik", "Electronics")}
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>{tr("Jenama", "Brand")}</FieldLabel>
            <input
              value={form.brand}
              onChange={(e) => updateForm({ brand: e.target.value })}
              className={fieldClass}
              placeholder="Samsung"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <FieldLabel>{tr("Model", "Model")}</FieldLabel>
            <input
              value={form.model}
              onChange={(e) => updateForm({ model: e.target.value })}
              className={fieldClass}
              placeholder="LS27AG300"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel required>{tr("Nombor siri", "Serial number")}</FieldLabel>
            <input
              value={form.serial_number}
              onChange={(e) => updateForm({ serial_number: e.target.value })}
              className={fieldClass}
              placeholder="S27A938291"
              required
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard title={tr("Maklumat Pembelian", "Purchase Information")} icon={FileText}>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <FieldLabel>{tr("Tarikh beli", "Purchase date")}</FieldLabel>
            <input
              type="date"
              value={form.purchase_date}
              onChange={(e) => {
                const purchase_date = e.target.value
                setForm((prev) => {
                  const shouldSyncStart =
                    !prev.warranty_start_date || prev.warranty_start_date === prev.purchase_date
                  return recomputeWarrantyDates({
                    ...prev,
                    purchase_date,
                    warranty_start_date: shouldSyncStart ? purchase_date : prev.warranty_start_date,
                  })
                })
              }}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>{tr("Harga beli (RM)", "Purchase price (RM)")}</FieldLabel>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.purchase_price}
              onChange={(e) => updateForm({ purchase_price: e.target.value })}
              className={fieldClass}
              placeholder="0.00"
            />
          </label>
        </div>
        <label className="block space-y-1.5">
          <FieldLabel>{tr("Kedai / Penjual", "Store / Seller")}</FieldLabel>
          <input
            value={form.store_or_seller}
            onChange={(e) => updateForm({ store_or_seller: e.target.value })}
            className={fieldClass}
            placeholder={tr("cth. Senheng, Shopee", "e.g. Senheng, Shopee")}
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel>{tr("No. resit / order", "Receipt / Order No.")}</FieldLabel>
          <input
            value={form.receipt_or_order_number}
            onChange={(e) => updateForm({ receipt_or_order_number: e.target.value })}
            className={fieldClass}
            placeholder="INV-2024-001"
          />
        </label>
      </SectionCard>

      <SectionCard title={tr("Maklumat Waranti", "Warranty Information")} icon={Shield}>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <FieldLabel required>{tr("Tarikh mula", "Start date")}</FieldLabel>
            <input
              type="date"
              value={form.warranty_start_date}
              onChange={(e) => updateForm({ warranty_start_date: e.target.value })}
              className={fieldClass}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel required>{tr("Tempoh", "Duration")}</FieldLabel>
            <select
              value={form.warranty_duration}
              onChange={(e) => updateForm({ warranty_duration: e.target.value })}
              className={fieldClass}
              required
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {tr(`${opt.months} bulan`, `${opt.months} months`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {form.warranty_expiry_date ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              {tr("Tarikh tamat (auto)", "Expiry date (auto)")}
            </p>
            <p className="mt-1 text-sm font-black text-[var(--text)]">
              {formatDateLabel(form.warranty_expiry_date, dateLocale)}
            </p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={tr("Lampiran", "Attachments")} icon={Paperclip}>
        <input
          ref={receiptInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleReceiptSelect}
          className="hidden"
        />
        {receiptFile ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--card)] text-[var(--text)]">
              <FileText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text)]">{receiptFile.name}</p>
              <p className="text-[11px] text-[var(--muted)]">
                {(receiptFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <button
              type="button"
              onClick={removeReceipt}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => receiptInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/40 px-4 py-4 text-sm font-bold text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            <Paperclip size={16} />
            {tr("Muat naik resit (pilihan)", "Upload receipt (optional)")}
          </button>
        )}
      </SectionCard>

      <SectionCard title={tr("Nota", "Notes")} icon={FileText}>
        <textarea
          value={form.notes}
          onChange={(e) => updateForm({ notes: e.target.value })}
          rows={3}
          className={cn(fieldClass, "resize-none")}
          placeholder={tr("Nota tambahan...", "Additional notes...")}
        />
      </SectionCard>

      <div className="h-24 md:h-2" aria-hidden />
    </form>
  )

  const actionBar = (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--border)] bg-[var(--bg)]/98 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl pb-[max(0.85rem,env(safe-area-inset-bottom))] md:static md:mt-2 md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
      <div className="mx-auto flex max-w-2xl gap-2.5">
        <button
          type="button"
          onClick={() => router.push(`/${sessionId}/warranty`)}
          className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 text-sm font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint)] active:scale-[0.99]"
        >
          {tr("Batal", "Cancel")}
        </button>
        <button
          type="submit"
          form="warranty-add-form"
          disabled={saving}
          className="flex flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3.5 text-sm font-bold text-[var(--btn-primary-text)] transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {tr("Simpan Peranti", "Save Device")}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 pb-32 md:space-y-0 md:pb-6">
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Tambah Peranti", "Add Device")}
          fallbackHref={`/${sessionId}/warranty`}
        />
        <div className="space-y-4 px-1">
          {photoBlock}
          {formBody}
        </div>
        {actionBar}
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Tambah Peranti", "Add Device")}
          breadcrumbs={[{ label: tr("Waranti Saya", "My Warranty"), href: `/${sessionId}/warranty` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/warranty`}
          actions={
            <button
              type="submit"
              form="warranty-add-form"
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 text-xs font-bold text-[var(--btn-primary-text)] disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {tr("Simpan", "Save")}
            </button>
          }
        />
        <DesktopPageBody>
          <div className="mx-auto max-w-2xl space-y-4">
            {photoBlock}
            {formBody}
            {actionBar}
          </div>
        </DesktopPageBody>
      </div>

      {alertModal}
    </div>
  )
}
