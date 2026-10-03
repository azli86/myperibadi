"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarClock, Check, Clock, ExternalLink, FileText, ImagePlus, Loader2, Paperclip, Pencil, Plus, Shield, Trash2, Wrench, X } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { WarrantyDeviceImage } from "@/components/warranty/WarrantyDeviceImage"

type WarrantyStatus = "active" | "expiring_soon" | "expired" | "unknown"

type DeviceItem = {
  id: number
  device_name: string
  category?: string | null
  brand?: string | null
  model?: string | null
  serial_number: string
  purchase_date?: string | null
  purchase_price?: number | null
  store_or_seller?: string | null
  receipt_or_order_number?: string | null
  warranty_start_date?: string | null
  warranty_duration_months?: number | null
  warranty_expiry_date?: string | null
  remaining_days?: number | null
  warranty_status: WarrantyStatus
  notes?: string | null
  has_image?: boolean
  image_url?: string | null
  receipt_attachment_id?: number | null
}

type ClaimItem = {
  id: number
  claim_date?: string | null
  problem_description?: string | null
  service_centre?: string | null
  reference_number?: string | null
  date_sent?: string | null
  expected_completion_date?: string | null
  date_received?: string | null
  resolution?: string | null
  notes?: string | null
  attachment_id?: number | null
}

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

type ClaimForm = {
  claim_date: string
  problem_description: string
  service_centre: string
  reference_number: string
  date_sent: string
  expected_completion_date: string
  date_received: string
  resolution: string
  notes: string
}

const DURATIONS = [3, 6, 12, 24, 36, 48, 60, 120]

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

const fmtDate = (value: string | null | undefined, locale: string, long = false) => {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(locale, { day: "numeric", month: long ? "long" : "short", year: "numeric" })
}

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const emptyClaim = (): ClaimForm => ({ claim_date: todayKey(), problem_description: "", service_centre: "", reference_number: "", date_sent: "", expected_completion_date: "", date_received: "", resolution: "", notes: "" })

const deviceToForm = (d: DeviceItem): DeviceForm => ({
  device_name: d.device_name || "",
  category: d.category || "",
  brand: d.brand || "",
  model: d.model || "",
  serial_number: d.serial_number || "",
  purchase_date: d.purchase_date || "",
  purchase_price: d.purchase_price != null ? String(d.purchase_price) : "",
  store_or_seller: d.store_or_seller || "",
  receipt_or_order_number: d.receipt_or_order_number || "",
  warranty_start_date: d.warranty_start_date || "",
  warranty_duration: String(d.warranty_duration_months || 12),
  notes: d.notes || "",
})

const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
const area = "w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"
const card = "rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5"

export default function WarrantyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const deviceId = Number(params.deviceId)
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  const [device, setDevice] = useState<DeviceItem | null>(null)
  const [claims, setClaims] = useState<ClaimItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [sheet, setSheet] = useState<"edit" | "claim" | null>(null)
  const [editingClaim, setEditingClaim] = useState<ClaimItem | null>(null)
  const [form, setForm] = useState<DeviceForm | null>(null)
  const [claimForm, setClaimForm] = useState<ClaimForm>(emptyClaim)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [claimFile, setClaimFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const imageRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLInputElement>(null)
  const claimFileRef = useRef<HTMLInputElement>(null)
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken()
    return token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}
  }, [])
  const errorOf = async (res: Response, fallback: string) => {
    const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof payload?.detail === "string" && payload.detail.trim() ? payload.detail : fallback
  }

  const loadData = useCallback(async () => {
    if (!deviceId) return
    try {
      const headers = authHeaders()
      const [dRes, cRes] = await Promise.all([
        fetch(`/api/warranties/${deviceId}`, { headers, credentials: "include", cache: "no-store" }),
        fetch(`/api/warranties/${deviceId}/claims`, { headers, credentials: "include", cache: "no-store" }),
      ])
      if (!dRes.ok) throw new Error(await errorOf(dRes, tr("Peranti tidak dijumpai.", "Device not found.")))
      setDevice((await dRes.json()) as DeviceItem)
      if (cRes.ok) {
        const data = await cRes.json()
        setClaims(Array.isArray(data) ? data : [])
      }
      setHasLoaded(true)
    } catch (err) {
      showAlertRef.current(tr("Ralat", "Error"), err instanceof Error ? err.message : "", "error")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders, deviceId, tr])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const closeSheet = useCallback(() => {
    setSheet(null)
    setForm(null)
    setEditingClaim(null)
    setImageFile(null)
    setReceiptFile(null)
    setClaimFile(null)
  }, [])

  const openEdit = () => {
    if (!device) return
    setForm(deviceToForm(device))
    setImageFile(null)
    setReceiptFile(null)
    setSheet("edit")
  }
  const openClaim = (c?: ClaimItem) => {
    setEditingClaim(c || null)
    setClaimForm(
      c
        ? {
            claim_date: c.claim_date || "",
            problem_description: c.problem_description || "",
            service_centre: c.service_centre || "",
            reference_number: c.reference_number || "",
            date_sent: c.date_sent || "",
            expected_completion_date: c.expected_completion_date || "",
            date_received: c.date_received || "",
            resolution: c.resolution || "",
            notes: c.notes || "",
          }
        : emptyClaim()
    )
    setClaimFile(null)
    setSheet("claim")
  }

  const setF = (patch: Partial<DeviceForm>) => setForm((p) => (p ? { ...p, ...patch } : p))
  const formStart = form ? form.warranty_start_date || form.purchase_date : ""
  const formExpiry = form && formStart && Number(form.warranty_duration) ? addMonths(formStart, Number(form.warranty_duration)) : ""

  const uploadFile = async (path: string, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(path, { method: "POST", headers: authHeaders(), credentials: "include", body: fd }).catch(() => null)
    return Boolean(res && res.ok)
  }

  const saveDevice = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!form || !device || saving) return
    const problem = !form.device_name.trim()
      ? tr("Nama peranti wajib.", "Device name is required.")
      : !form.serial_number.trim()
        ? tr("Nombor siri wajib.", "Serial number is required.")
        : !formStart
          ? tr("Tarikh mula waranti wajib.", "The warranty start date is required.")
          : form.purchase_date && form.purchase_date > todayKey()
            ? tr("Tarikh beli tidak boleh pada masa depan.", "The purchase date cannot be in the future.")
            : form.purchase_price && !(Number(form.purchase_price) >= 0)
              ? tr("Harga beli tidak sah.", "The purchase price is not valid.")
              : null
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/warranties/${device.id}`, {
        method: "PATCH",
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
          warranty_start_date: formStart,
          warranty_duration_months: Number(form.warranty_duration),
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan.", "Could not save.")))
      const failed: string[] = []
      if (imageFile && !(await uploadFile(`/api/warranties/${device.id}/image`, imageFile))) failed.push(tr("gambar", "photo"))
      if (receiptFile && !(await uploadFile(`/api/warranties/${device.id}/receipt`, receiptFile))) failed.push(tr("resit", "receipt"))
      closeSheet()
      await loadData()
      if (failed.length) showAlert(tr("Disimpan, tetapi…", "Saved, but…"), tr(`${failed.join(" dan ")} gagal dimuat naik.`, `the ${failed.join(" and ")} could not be uploaded.`), "warning")
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const deleteDevice = () => {
    if (!device) return
    showConfirm(
      tr("Padam peranti?", "Delete device?"),
      tr(`Padam ${device.device_name}, termasuk semua tuntutan dan lampiran? Ini tidak boleh diundur.`, `Delete ${device.device_name}, with all its claims and attachments? This cannot be undone.`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/warranties/${device.id}`, { method: "DELETE", headers: authHeaders(), credentials: "include" })
          if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
          router.push(`/${sessionId}/warranty`)
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
          setSaving(false)
        }
      },
      "warning"
    )
  }

  const claimProblem = !claimForm.problem_description.trim() && !claimForm.service_centre.trim()
    ? tr("Isi masalah atau pusat servis.", "Enter the problem or the service centre.")
    : claimForm.date_sent && claimForm.claim_date && claimForm.date_sent < claimForm.claim_date
      ? tr("Tarikh hantar tidak boleh sebelum tarikh tuntutan.", "The date sent cannot be before the claim date.")
      : claimForm.date_received && claimForm.date_sent && claimForm.date_received < claimForm.date_sent
        ? tr("Tarikh terima tidak boleh sebelum tarikh hantar.", "The date received cannot be before the date sent.")
        : null

  const saveClaim = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!device || saving) return
    if (claimProblem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), claimProblem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(editingClaim ? `/api/warranties/${device.id}/claims/${editingClaim.id}` : `/api/warranties/${device.id}/claims`, {
        method: editingClaim ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          claim_date: claimForm.claim_date || null,
          problem_description: claimForm.problem_description.trim() || null,
          service_centre: claimForm.service_centre.trim() || null,
          reference_number: claimForm.reference_number.trim() || null,
          date_sent: claimForm.date_sent || null,
          expected_completion_date: claimForm.expected_completion_date || null,
          date_received: claimForm.date_received || null,
          resolution: claimForm.resolution || null,
          notes: claimForm.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan tuntutan.", "Could not save the claim.")))
      const saved = await res.json()
      let uploadFailed = false
      if (claimFile) uploadFailed = !(await uploadFile(`/api/warranties/${device.id}/claims/${editingClaim ? editingClaim.id : saved.id}/attachment`, claimFile))
      closeSheet()
      await loadData()
      if (uploadFailed) showAlert(tr("Disimpan, tetapi…", "Saved, but…"), tr("lampiran gagal dimuat naik.", "the attachment could not be uploaded."), "warning")
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const deleteClaim = (c: ClaimItem) => {
    if (!device) return
    showConfirm(tr("Padam tuntutan?", "Delete claim?"), tr("Rekod tuntutan ini akan dipadam.", "This claim record will be deleted."), async () => {
      try {
        const res = await fetch(`/api/warranties/${device.id}/claims/${c.id}`, { method: "DELETE", headers: authHeaders(), credentials: "include" })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
        if (editingClaim?.id === c.id) closeSheet()
        await loadData()
      } catch (err) {
        showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
      }
    }, "warning")
  }

  const openAttachment = (id?: number | null) => {
    if (id) window.open(`/api/warranties/attachments/${id}/file`, "_blank", "noopener,noreferrer")
  }

  const statusText = (s: WarrantyStatus) =>
    ({ active: tr("Aktif", "Active"), expiring_soon: tr("Hampir tamat", "Expiring soon"), expired: tr("Tamat", "Expired"), unknown: tr("Tiada tarikh", "No date") })[s]
  const resolutionText = (v?: string | null) =>
    ({ repaired: tr("Dibaiki", "Repaired"), replaced: tr("Diganti", "Replaced"), rejected: tr("Ditolak", "Rejected"), other: tr("Lain-lain", "Other") } as Record<string, string>)[v || ""] || ""
  const claimState = (c: ClaimItem) => (c.resolution ? resolutionText(c.resolution) : c.date_received ? tr("Diterima semula", "Received back") : c.date_sent ? tr("Di pusat servis", "At service centre") : tr("Baharu", "New"))

  const days = device?.remaining_days
  const heroAmount = days == null ? "—" : days < 0 ? String(Math.abs(days)) : String(days)
  const heroUnit = days == null ? "" : days < 0 ? tr(" hari lalu", " days ago") : tr(" hari", days === 1 ? " day" : " days")
  const sorted = useMemo(() => [...claims].sort((a, b) => String(b.claim_date || "").localeCompare(String(a.claim_date || ""))), [claims])
  const listHref = `/${sessionId}/warranty`
  const disabled = !device

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader
          title={device?.device_name || tr("Butiran Waranti", "Warranty Details")}
          fallbackHref={listHref}
          backPreferHistory
          action={
            <>
              <MobileIconButton onClick={() => openClaim()} disabled={disabled} label={tr("Tuntutan", "Claim")}>
                <Plus />
              </MobileIconButton>
              <MobileIconButton onClick={openEdit} disabled={disabled} label={tr("Ubah", "Edit")}>
                <Pencil />
              </MobileIconButton>
            </>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={device?.device_name || tr("Butiran Waranti", "Warranty Details")}
        breadcrumbs={[{ label: tr("Waranti Saya", "My Warranty"), href: listHref }]}
        homeHref={`/${sessionId}`}
        backHref={listHref}
        actions={
          <>
            <DesktopPageAction onClick={() => openClaim()} disabled={disabled}>
              <Plus size={16} />
              {tr("Tambah tuntutan", "Add claim")}
            </DesktopPageAction>
            <DesktopPageAction onClick={openEdit} disabled={disabled} variant="solid">
              <Pencil size={16} />
              {tr("Ubah", "Edit")}
            </DesktopPageAction>
          </>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        {showSkeleton || !device ? (
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-[2rem] bg-[var(--surface-tint)]" />
            <div className="h-64 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
          </div>
        ) : (
          <>
            {device.has_image ? (
              <div className="relative h-44 w-full overflow-hidden rounded-[1.5rem] border border-[var(--border)] sm:h-52 md:h-60">
                <WarrantyDeviceImage deviceId={device.id} hasImage imageUrl={device.image_url} alt={device.device_name} className="absolute inset-0 h-full w-full" fallbackIconSize={48} />
              </div>
            ) : null}

            <ModenHero
              label={
                <>
                  <Shield size={16} />
                  <span className="min-w-0 truncate">{statusText(device.warranty_status)} · {tr("baki waranti", "warranty left")}</span>
                </>
              }
              currency={null}
              amount={
                <>
                  {heroAmount}
                  <span className="ml-1.5 text-base font-semibold opacity-60">{heroUnit.trim()}</span>
                </>
              }
              amountSize="clamp(2rem, 9vw, 2.75rem)"
              stats={[
                { key: "end", tone: device.warranty_status === "expired" ? "out" : "neutral", icon: <CalendarClock size={15} strokeWidth={2.2} />, label: tr("Tamat pada", "Ends on"), value: fmtDate(device.warranty_expiry_date, locale) },
                { key: "dur", tone: "neutral", icon: <Clock size={15} strokeWidth={2.2} />, label: tr("Tempoh", "Duration"), value: device.warranty_duration_months ? (device.warranty_duration_months % 12 === 0 ? tr(`${device.warranty_duration_months / 12} tahun`, `${device.warranty_duration_months / 12} yr`) : tr(`${device.warranty_duration_months} bulan`, `${device.warranty_duration_months} mo`)) : "—" },
              ]}
            />

            <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <section className={card}>
                <h2 className="mb-3 text-base font-bold text-[var(--text)]">{tr("Maklumat peranti", "Device details")}</h2>
                <dl className="divide-y divide-[var(--divider)] text-sm">
                  {([
                    [tr("Kategori", "Category"), device.category],
                    [tr("Jenama dan model", "Brand and model"), [device.brand, device.model].filter(Boolean).join(" · ")],
                    [tr("No. siri", "Serial no."), device.serial_number],
                    [tr("Tarikh beli", "Purchased"), device.purchase_date ? fmtDate(device.purchase_date, locale) : ""],
                    [tr("Harga", "Price"), device.purchase_price != null ? `RM ${money(device.purchase_price)}` : ""],
                    [tr("Kedai", "Store"), device.store_or_seller],
                    [tr("No. resit / pesanan", "Receipt / order no."), device.receipt_or_order_number],
                    [tr("Waranti mula", "Warranty starts"), device.warranty_start_date ? fmtDate(device.warranty_start_date, locale) : ""],
                  ] as Array<[string, string | null | undefined]>).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-[var(--muted)]">{k}</dt>
                      <dd className="min-w-0 text-right font-semibold text-[var(--text)] [overflow-wrap:anywhere]">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {device.notes ? <p className="mt-3 whitespace-pre-line border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)] [overflow-wrap:anywhere]">{device.notes}</p> : null}
                {device.receipt_attachment_id ? (
                  <button type="button" onClick={() => openAttachment(device.receipt_attachment_id)} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)]">
                    <FileText size={15} />
                    {tr("Lihat resit", "View receipt")}
                    <ExternalLink size={13} className="opacity-60" />
                  </button>
                ) : null}
              </section>

              <section className={card}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-[var(--text)]">{tr("Tuntutan dan servis", "Claims and service")}</h2>
                  <button type="button" onClick={() => openClaim()} className="inline-flex h-9 items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-4 text-xs font-semibold text-[var(--btn-primary-text)]">
                    <Plus size={14} strokeWidth={2.5} />
                    {tr("Tambah", "Add")}
                  </button>
                </div>
                {sorted.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]"><Wrench size={20} /></span>
                    <p className="mt-3 text-sm font-bold text-[var(--text)]">{tr("Belum ada tuntutan", "No claims yet")}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{tr("Catat bila peranti dihantar baiki atau dituntut.", "Log it when the device goes in for repair or a claim.")}</p>
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {sorted.map((c) => (
                      <li key={c.id} className="rounded-[1.25rem] border border-[var(--border)] p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-bold text-[var(--text)] [overflow-wrap:anywhere]">{c.problem_description || c.service_centre || tr("Tuntutan", "Claim")}</p>
                            <p className="text-xs text-[var(--muted)]">{fmtDate(c.claim_date, locale)}{c.service_centre && c.problem_description ? ` · ${c.service_centre}` : ""}</p>
                          </div>
                          <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold", c.resolution === "rejected" ? "border-rose-500/30 text-rose-500" : c.resolution ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-[var(--border)] text-[var(--muted)]")}>{claimState(c)}</span>
                        </div>
                        {(c.reference_number || c.date_sent || c.expected_completion_date || c.date_received) && (
                          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            {c.reference_number ? <div className="col-span-2"><dt className="inline text-[var(--muted)]">{tr("No. rujukan", "Ref. no.")}: </dt><dd className="inline font-semibold text-[var(--text)] [overflow-wrap:anywhere]">{c.reference_number}</dd></div> : null}
                            {c.date_sent ? <div><dt className="inline text-[var(--muted)]">{tr("Dihantar", "Sent")}: </dt><dd className="inline font-semibold text-[var(--text)]">{fmtDate(c.date_sent, locale)}</dd></div> : null}
                            {c.expected_completion_date ? <div><dt className="inline text-[var(--muted)]">{tr("Jangka siap", "Expected")}: </dt><dd className="inline font-semibold text-[var(--text)]">{fmtDate(c.expected_completion_date, locale)}</dd></div> : null}
                            {c.date_received ? <div><dt className="inline text-[var(--muted)]">{tr("Diterima", "Received")}: </dt><dd className="inline font-semibold text-[var(--text)]">{fmtDate(c.date_received, locale)}</dd></div> : null}
                          </dl>
                        )}
                        <div className="mt-2.5 flex items-center justify-end gap-1">
                          {c.attachment_id ? (
                            <button type="button" onClick={() => openAttachment(c.attachment_id)} aria-label={tr("Lampiran", "Attachment")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Paperclip size={14} /></button>
                          ) : null}
                          <button type="button" onClick={() => openClaim(c)} aria-label={tr("Ubah", "Edit")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Pencil size={14} /></button>
                          <button type="button" onClick={() => deleteClaim(c)} aria-label={tr("Padam", "Delete")} className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-500/30 text-rose-500"><Trash2 size={14} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </DesktopPageBody>

      <AppSheet
        open={sheet === "edit" && !!form}
        onClose={closeSheet}
        id="warranty-edit-sheet"
        title={tr("Ubah peranti", "Edit device")}
        size="md"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={deleteDevice} disabled={saving} aria-label={tr("Padam peranti", "Delete device")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500 disabled:opacity-50"><Trash2 size={16} /></button>
            <button type="button" onClick={() => void saveDevice()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {tr("Simpan perubahan", "Save changes")}
            </button>
          </div>
        }
      >
        {form && (
          <form onSubmit={saveDevice} className="space-y-4">
            <div>
              <label htmlFor="we-name" className={label}>{tr("Nama peranti", "Device name")}</label>
              <input id="we-name" value={form.device_name} maxLength={190} onChange={(e) => setF({ device_name: e.target.value })} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label htmlFor="we-cat" className={label}>{tr("Kategori", "Category")}</label><input id="we-cat" value={form.category} maxLength={80} onChange={(e) => setF({ category: e.target.value })} className={field} /></div>
              <div><label htmlFor="we-brand" className={label}>{tr("Jenama", "Brand")}</label><input id="we-brand" value={form.brand} maxLength={80} onChange={(e) => setF({ brand: e.target.value })} className={field} /></div>
              <div><label htmlFor="we-model" className={label}>Model</label><input id="we-model" value={form.model} maxLength={80} onChange={(e) => setF({ model: e.target.value })} className={field} /></div>
              <div><label htmlFor="we-serial" className={label}>{tr("No. siri", "Serial no.")}</label><input id="we-serial" value={form.serial_number} maxLength={120} onChange={(e) => setF({ serial_number: e.target.value })} className={field} /></div>
              <div><label htmlFor="we-pdate" className={label}>{tr("Tarikh beli", "Purchase date")}</label><input id="we-pdate" type="date" max={todayKey()} value={form.purchase_date} onChange={(e) => setF({ purchase_date: e.target.value })} className={field} /></div>
              <div><label htmlFor="we-price" className={label}>{tr("Harga (RM)", "Price (RM)")}</label><input id="we-price" inputMode="decimal" value={form.purchase_price} onChange={(e) => setF({ purchase_price: e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") })} className={field} /></div>
            </div>
            <div><label htmlFor="we-store" className={label}>{tr("Kedai / penjual", "Store / seller")}</label><input id="we-store" value={form.store_or_seller} maxLength={190} onChange={(e) => setF({ store_or_seller: e.target.value })} className={field} /></div>
            <div><label htmlFor="we-order" className={label}>{tr("No. resit / pesanan", "Receipt / order no.")}</label><input id="we-order" value={form.receipt_or_order_number} maxLength={120} onChange={(e) => setF({ receipt_or_order_number: e.target.value })} className={field} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label htmlFor="we-start" className={label}>{tr("Waranti mula", "Warranty start")}</label><input id="we-start" type="date" value={form.warranty_start_date || form.purchase_date} onChange={(e) => setF({ warranty_start_date: e.target.value })} className={field} /></div>
              <div>
                <label htmlFor="we-dur" className={label}>{tr("Tempoh", "Duration")}</label>
                <select id="we-dur" value={form.warranty_duration} onChange={(e) => setF({ warranty_duration: e.target.value })} className={field}>
                  {Array.from(new Set([...DURATIONS, Number(form.warranty_duration)])).sort((a, b) => a - b).map((m) => (
                    <option key={m} value={m}>{m % 12 === 0 ? tr(`${m / 12} tahun`, `${m / 12} ${m === 12 ? "year" : "years"}`) : tr(`${m} bulan`, `${m} months`)}</option>
                  ))}
                </select>
              </div>
            </div>
            {formExpiry ? <p className="-mt-1 text-xs text-[var(--muted)]">{tr("Waranti tamat pada", "Warranty ends on")} <span className="font-bold text-[var(--text)]">{fmtDate(formExpiry, locale, true)}</span></p> : null}
            <div><label htmlFor="we-notes" className={label}>{tr("Nota", "Notes")}</label><textarea id="we-notes" rows={3} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} className={area} /></div>

            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
            <input ref={receiptRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => imageRef.current?.click()} className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--muted)]">
                <ImagePlus size={14} className="shrink-0" />
                <span className="truncate">{imageFile ? imageFile.name : device?.has_image ? tr("Tukar gambar", "Change photo") : tr("Tambah gambar", "Add photo")}</span>
              </button>
              <button type="button" onClick={() => receiptRef.current?.click()} className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--muted)]">
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{receiptFile ? receiptFile.name : device?.receipt_attachment_id ? tr("Tukar resit", "Replace receipt") : tr("Tambah resit", "Add receipt")}</span>
              </button>
            </div>
          </form>
        )}
      </AppSheet>

      <AppSheet
        open={sheet === "claim"}
        onClose={closeSheet}
        id="warranty-claim-sheet"
        title={editingClaim ? tr("Ubah tuntutan", "Edit claim") : tr("Tuntutan baharu", "New claim")}
        size="md"
        footer={
          <div className="flex gap-2">
            {editingClaim ? (
              <button type="button" onClick={() => deleteClaim(editingClaim)} disabled={saving} aria-label={tr("Padam", "Delete")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500 disabled:opacity-50"><Trash2 size={16} /></button>
            ) : null}
            <button type="button" onClick={() => void saveClaim()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {tr("Simpan", "Save")}
            </button>
          </div>
        }
      >
        <form onSubmit={saveClaim} className="space-y-4">
          <div>
            <label htmlFor="wc-problem" className={label}>{tr("Masalah", "Problem")}</label>
            <textarea id="wc-problem" rows={2} value={claimForm.problem_description} onChange={(e) => setClaimForm({ ...claimForm, problem_description: e.target.value })} placeholder={tr("cth. Skrin berkelip", "e.g. The screen flickers")} className={area} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="wc-date" className={label}>{tr("Tarikh tuntutan", "Claim date")}</label><input id="wc-date" type="date" value={claimForm.claim_date} onChange={(e) => setClaimForm({ ...claimForm, claim_date: e.target.value })} className={field} /></div>
            <div><label htmlFor="wc-ref" className={label}>{tr("No. rujukan", "Ref. no.")}</label><input id="wc-ref" value={claimForm.reference_number} maxLength={120} onChange={(e) => setClaimForm({ ...claimForm, reference_number: e.target.value })} className={field} /></div>
          </div>
          <div><label htmlFor="wc-centre" className={label}>{tr("Pusat servis", "Service centre")}</label><input id="wc-centre" value={claimForm.service_centre} maxLength={190} onChange={(e) => setClaimForm({ ...claimForm, service_centre: e.target.value })} className={field} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="wc-sent" className={label}>{tr("Tarikh hantar", "Date sent")}</label><input id="wc-sent" type="date" min={claimForm.claim_date || undefined} value={claimForm.date_sent} onChange={(e) => setClaimForm({ ...claimForm, date_sent: e.target.value })} className={field} /></div>
            <div><label htmlFor="wc-exp" className={label}>{tr("Jangka siap", "Expected back")}</label><input id="wc-exp" type="date" min={claimForm.date_sent || undefined} value={claimForm.expected_completion_date} onChange={(e) => setClaimForm({ ...claimForm, expected_completion_date: e.target.value })} className={field} /></div>
            <div><label htmlFor="wc-recv" className={label}>{tr("Tarikh terima", "Date received")}</label><input id="wc-recv" type="date" min={claimForm.date_sent || undefined} value={claimForm.date_received} onChange={(e) => setClaimForm({ ...claimForm, date_received: e.target.value })} className={field} /></div>
          </div>
          <div>
            <span className={label}>{tr("Keputusan", "Outcome")}</span>
            <div className="flex flex-wrap gap-1.5">
              {([["", tr("Belum", "Pending")], ["repaired", tr("Dibaiki", "Repaired")], ["replaced", tr("Diganti", "Replaced")], ["rejected", tr("Ditolak", "Rejected")], ["other", tr("Lain-lain", "Other")]] as const).map(([v, text]) => (
                <button key={v || "none"} type="button" aria-pressed={claimForm.resolution === v} onClick={() => setClaimForm({ ...claimForm, resolution: v })} className={cn("h-10 rounded-full border px-4 text-sm font-semibold", claimForm.resolution === v ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>{text}</button>
              ))}
            </div>
          </div>
          <div><label htmlFor="wc-notes" className={label}>{tr("Nota", "Notes")}</label><textarea id="wc-notes" rows={2} value={claimForm.notes} onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })} className={area} /></div>
          <input ref={claimFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setClaimFile(e.target.files?.[0] || null)} />
          <button type="button" onClick={() => claimFileRef.current?.click()} className="flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--muted)]">
            <Paperclip size={14} className="shrink-0" />
            <span className="truncate">{claimFile ? claimFile.name : editingClaim?.attachment_id ? tr("Tukar lampiran", "Replace attachment") : tr("Tambah lampiran (pilihan)", "Add an attachment (optional)")}</span>
            {claimFile ? <X size={14} className="shrink-0" onClick={(e) => { e.stopPropagation(); setClaimFile(null) }} /> : null}
          </button>
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
