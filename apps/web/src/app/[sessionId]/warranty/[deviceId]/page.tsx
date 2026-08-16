"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Calendar,
  CalendarDays,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
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
  created_at?: string
  updated_at?: string
}

type ClaimItem = {
  id: number
  device_id: number
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
  created_at?: string
  updated_at?: string
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
  warranty_expiry_date: string
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

const DURATION_OPTIONS = [
  { value: "3", months: 3 },
  { value: "6", months: 6 },
  { value: "12", months: 12 },
  { value: "24", months: 24 },
  { value: "36", months: 36 },
] as const

const CATEGORY_OPTIONS = [
  "Electronics",
  "Clothing",
  "Documents",
  "Tools",
  "Furniture",
  "Kitchen",
  "Personal Care",
  "Toys",
  "Books",
  "Sports",
  "Medicines",
  "Accessories",
  "Other",
]

const RESOLUTION_OPTIONS = [
  { value: "repaired", bm: "Dibaiki", en: "Repaired", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { value: "replaced", bm: "Diganti", en: "Replaced", badge: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  { value: "rejected", bm: "Tuntutan ditolak", en: "Claim rejected", badge: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  { value: "other", bm: "Lain-lain", en: "Other", badge: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
] as const

const STATUS_CONFIG: Record<
  WarrantyStatus,
  { badge: string; dot: string; labelBm: string; labelEn: string; bgGradient: string }
> = {
  active: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-500",
    labelBm: "Aktif",
    labelEn: "Active",
    bgGradient: "from-emerald-500/10 to-transparent",
  },
  expiring_soon: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
    labelBm: "Hampir Tamat",
    labelEn: "Expiring Soon",
    bgGradient: "from-amber-500/10 to-transparent",
  },
  expired: {
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    dot: "bg-rose-500",
    labelBm: "Tamat",
    labelEn: "Expired",
    bgGradient: "from-rose-500/10 to-transparent",
  },
  unknown: {
    badge: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    dot: "bg-zinc-400",
    labelBm: "Tiada Tarikh",
    labelEn: "No Date",
    bgGradient: "from-white/5 to-transparent",
  },
}

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

function formatDateShort(value?: string | null, locale = "en-MY") {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
}

function toTitleCase(value?: string | null) {
  const text = (value || "").trim()
  if (!text) return ""
  return text
    .toLowerCase()
    .replace(/(^|[\s\-_/&])([a-zA-ZÀ-ÿ])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`)
}

function emptyClaimForm(): ClaimForm {
  return {
    claim_date: new Date().toISOString().slice(0, 10),
    problem_description: "",
    service_centre: "",
    reference_number: "",
    date_sent: "",
    expected_completion_date: "",
    date_received: "",
    resolution: "",
    notes: "",
  }
}

function deviceToForm(d: DeviceItem): DeviceForm {
  const months = d.warranty_duration_months
  const duration =
    months != null && [3, 6, 12, 24, 36].includes(Number(months)) ? String(months) : "12"
  return {
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
    warranty_duration: duration,
    warranty_expiry_date: d.warranty_expiry_date || "",
    notes: d.notes || "",
  }
}

export default function WarrantyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const deviceId = Number(params.deviceId)
  const { lang } = useLang()
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [device, setDevice] = useState<DeviceItem | null>(null)
  const [claims, setClaims] = useState<ClaimItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [showClaimSheet, setShowClaimSheet] = useState(false)
  const [editingClaim, setEditingClaim] = useState<ClaimItem | null>(null)
  const [form, setForm] = useState<DeviceForm | null>(null)
  const [claimForm, setClaimForm] = useState<ClaimForm>(emptyClaimForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [claimFile, setClaimFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)

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
  useEffect(() => {
    setMounted(true)
  }, [])

  const loadData = useCallback(async () => {
    if (!deviceId) return
    if (!hasLoaded) setLoading(true)
    try {
      const headers = authHeaders()
      const [dRes, cRes] = await Promise.all([
        fetch(`/api/warranties/${deviceId}`, { headers, credentials: "include", cache: "no-store" }),
        fetch(`/api/warranties/${deviceId}/claims`, { headers, credentials: "include", cache: "no-store" }),
      ])
      if (!dRes.ok) {
        const payload = (await dRes.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Peranti tidak dijumpai.", "Device not found."))
      }
      const dData = (await dRes.json()) as DeviceItem
      setDevice(dData)
      if (cRes.ok) {
        const cData = await cRes.json()
        setClaims(Array.isArray(cData) ? cData : [])
      }
      setHasLoaded(true)
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal muat peranti.", "Failed to load device."),
        "error",
      )
    } finally {
      setLoading(false)
    }
  }, [authHeaders, deviceId, hasLoaded, tr])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    if (!device?.has_image || !deviceId) {
      setImageUrl(null)
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`/api/warranties/${deviceId}/image`, {
          headers: authHeaders(),
          credentials: "include",
          cache: "no-store",
        })
        if (!res.ok) return
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      } catch {
        if (!cancelled) setImageUrl(null)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [authHeaders, device?.has_image, deviceId])

  const closeEditSheet = useCallback(() => {
    setShowEditSheet(false)
    setForm(null)
    setImageFile(null)
    setReceiptFile(null)
  }, [])

  const closeClaimSheet = useCallback(() => {
    setShowClaimSheet(false)
    setEditingClaim(null)
    setClaimForm(emptyClaimForm())
    setClaimFile(null)
  }, [])

  const { requestClose: requestEditClose } = useOverlayBackClose({
    id: "warranty-edit-sheet",
    isOpen: showEditSheet,
    onClose: closeEditSheet,
  })
  const { requestClose: requestClaimClose } = useOverlayBackClose({
    id: "warranty-claim-sheet",
    isOpen: showClaimSheet,
    onClose: closeClaimSheet,
  })
  const editSwipe = useSwipeDownToClose(requestEditClose)
  const claimSwipe = useSwipeDownToClose(requestClaimClose)

  const recomputeWarrantyDates = useCallback((next: DeviceForm): DeviceForm => {
    const result = { ...next }
    if (result.purchase_date && !result.warranty_start_date) {
      result.warranty_start_date = result.purchase_date
    }
    const months = Number(result.warranty_duration)
    const start = result.warranty_start_date || result.purchase_date
    if (months && start) {
      result.warranty_expiry_date = addMonths(start, months)
    } else {
      result.warranty_expiry_date = ""
    }
    return result
  }, [])

  const updateForm = useCallback(
    (patch: Partial<DeviceForm>) => {
      setForm((prev) => (prev ? recomputeWarrantyDates({ ...prev, ...patch }) : prev))
    },
    [recomputeWarrantyDates],
  )

  const statusLabel = useCallback(
    (status: WarrantyStatus) => {
      const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown
      return isBm ? cfg.labelBm : cfg.labelEn
    },
    [isBm],
  )

  const resolutionInfo = useCallback(
    (value?: string | null) => {
      const opt = RESOLUTION_OPTIONS.find((o) => o.value === value)
      if (!opt) return { label: value ? toTitleCase(value) : "—", badge: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" }
      return { label: isBm ? opt.bm : opt.en, badge: opt.badge }
    },
    [isBm],
  )

  const remainingLabel = useMemo(() => {
    if (!device || device.remaining_days == null) return "—"
    const days = device.remaining_days
    if (days < 0) return tr(`${Math.abs(days)} hari lewat`, `${Math.abs(days)} days overdue`)
    if (days === 0) return tr("Tamat hari ini", "Expires today")
    return tr(`${days} hari lagi`, `${days} days left`)
  }, [device, tr])

  function openEdit() {
    if (!device) return
    setForm(deviceToForm(device))
    setImageFile(null)
    setReceiptFile(null)
    setShowEditSheet(true)
  }

  function openAddClaim() {
    setEditingClaim(null)
    setClaimForm(emptyClaimForm())
    setClaimFile(null)
    setShowClaimSheet(true)
  }

  function openEditClaim(c: ClaimItem) {
    setEditingClaim(c)
    setClaimForm({
      claim_date: c.claim_date || "",
      problem_description: c.problem_description || "",
      service_centre: c.service_centre || "",
      reference_number: c.reference_number || "",
      date_sent: c.date_sent || "",
      expected_completion_date: c.expected_completion_date || "",
      date_received: c.date_received || "",
      resolution: c.resolution || "",
      notes: c.notes || "",
    })
    setClaimFile(null)
    setShowClaimSheet(true)
  }

  async function handleSaveDevice(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !device || saving) return
    if (!form.device_name.trim() || !form.serial_number.trim()) {
      showAlert(
        tr("Maklumat tak lengkap", "Incomplete"),
        tr("Nama peranti dan nombor siri wajib.", "Device name and serial number are required."),
        "error",
      )
      return
    }
    const warrantyStart = form.warranty_start_date || form.purchase_date
    if (!warrantyStart) {
      showAlert(
        tr("Maklumat tak lengkap", "Incomplete"),
        tr("Tarikh mula waranti wajib.", "Warranty start date is required."),
        "error",
      )
      return
    }
    const durationMonths = Number(form.warranty_duration) || 0
    if (!durationMonths) {
      showAlert(
        tr("Maklumat tak lengkap", "Incomplete"),
        tr("Tempoh waranti wajib.", "Warranty duration is required."),
        "error",
      )
      return
    }
    const warrantyExpiry = form.warranty_expiry_date || addMonths(warrantyStart, durationMonths)
    if (!warrantyExpiry) {
      showAlert(
        tr("Maklumat tak lengkap", "Incomplete"),
        tr("Gagal kira tarikh tamat waranti.", "Failed to calculate warranty expiry."),
        "error",
      )
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
          warranty_start_date: warrantyStart,
          warranty_duration_months: durationMonths,
          warranty_expiry_date: warrantyExpiry,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan.", "Failed to save."))
      }
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        await fetch(`/api/warranties/${device.id}/image`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }
      if (receiptFile) {
        const fd = new FormData()
        fd.append("file", receiptFile)
        await fetch(`/api/warranties/${device.id}/receipt`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }
      closeEditSheet()
      showAlert(tr("Berjaya", "Success"), tr("Perubahan disimpan.", "Changes saved."), "success")
      await loadData()
    } catch (err) {
      showAlert(
        tr("Gagal", "Failed"),
        err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."),
        "error",
      )
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteDevice() {
    if (!device) return
    showConfirm(
      tr("Padam peranti?", "Delete device?"),
      tr(`Padam ${device.device_name}? Tindakan ini tidak boleh diundur.`, `Delete ${device.device_name}? This cannot be undone.`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/warranties/${device.id}`, {
            method: "DELETE",
            headers: authHeaders(),
            credentials: "include",
          })
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as { detail?: string } | null
            throw new Error(payload?.detail || tr("Gagal padam.", "Failed to delete."))
          }
          showAlert(tr("Berjaya", "Success"), tr("Peranti dipadam.", "Device deleted."), "success")
          router.push(`/${sessionId}/warranty`)
        } catch (err) {
          showAlert(
            tr("Gagal", "Failed"),
            err instanceof Error ? err.message : tr("Gagal padam.", "Failed to delete."),
            "error",
          )
        } finally {
          setSaving(false)
        }
      },
      "warning",
    )
  }

  async function handleSaveClaim(e: React.FormEvent) {
    e.preventDefault()
    if (!device || saving) return
    setSaving(true)
    try {
      const body = {
        claim_date: claimForm.claim_date || null,
        problem_description: claimForm.problem_description.trim() || null,
        service_centre: claimForm.service_centre.trim() || null,
        reference_number: claimForm.reference_number.trim() || null,
        date_sent: claimForm.date_sent || null,
        expected_completion_date: claimForm.expected_completion_date || null,
        date_received: claimForm.date_received || null,
        resolution: claimForm.resolution.trim() || null,
        notes: claimForm.notes.trim() || null,
      }
      const url = editingClaim
        ? `/api/warranties/${device.id}/claims/${editingClaim.id}`
        : `/api/warranties/${device.id}/claims`
      const method = editingClaim ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan tuntutan.", "Failed to save claim."))
      }
      const claimData = await res.json()
      if (claimFile) {
        const cId = editingClaim ? editingClaim.id : claimData.id
        const fd = new FormData()
        fd.append("file", claimFile)
        await fetch(`/api/warranties/${device.id}/claims/${cId}/attachment`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }
      closeClaimSheet()
      showAlert(tr("Berjaya", "Success"), tr("Rekod tuntutan disimpan.", "Claim record saved."), "success")
      await loadData()
    } catch (err) {
      showAlert(
        tr("Gagal", "Failed"),
        err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."),
        "error",
      )
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteClaim(c: ClaimItem) {
    if (!device) return
    showConfirm(
      tr("Padam rekod tuntutan?", "Delete claim record?"),
      tr("Rekod ini akan dipadamkan.", "This record will be deleted."),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/warranties/${device.id}/claims/${c.id}`, {
            method: "DELETE",
            headers: authHeaders(),
            credentials: "include",
          })
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as { detail?: string } | null
            throw new Error(payload?.detail || tr("Gagal padam.", "Failed to delete."))
          }
          showAlert(tr("Berjaya", "Success"), tr("Rekod dipadam.", "Record deleted."), "success")
          await loadData()
        } catch (err) {
          showAlert(
            tr("Gagal", "Failed"),
            err instanceof Error ? err.message : tr("Gagal padam.", "Failed to delete."),
            "error",
          )
        } finally {
          setSaving(false)
        }
      },
      "warning",
    )
  }

  function openAttachment(attachmentId: number) {
    if (!attachmentId) return
    window.open(`/api/warranties/attachments/${attachmentId}`, "_blank", "noopener,noreferrer")
  }

  const statusCfg = device ? (STATUS_CONFIG[device.warranty_status] || STATUS_CONFIG.unknown) : STATUS_CONFIG.unknown

  return (
    <>
      {/* ── HEADER BAR ── */}
      <div className="border-b border-[color:var(--border)] pb-4 md:hidden">
        <MobilePageHeader
          title={tr("Butiran Waranti", "Warranty Details")}
          fallbackHref={`/${sessionId}/warranty`}
          action={
            <div className="flex items-center gap-1">
              <MobileIconButton label={tr("Tambah Tuntutan", "Add Claim")} onClick={openAddClaim}>
                <Plus className="h-5 w-5" />
              </MobileIconButton>
              <MobileIconButton label={tr("Edit", "Edit")} onClick={openEdit}>
                <Pencil className="h-5 w-5" />
              </MobileIconButton>
            </div>
          }
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Butiran Waranti", "Warranty Details")}
          homeHref={`/${sessionId}/warranty`}
          actions={
            <>
              <DesktopPageAction onClick={openAddClaim}>
                <Plus size={16} />
                {tr("Tambah Tuntutan", "Add Claim")}
              </DesktopPageAction>
              <DesktopPageAction onClick={openEdit} variant="solid">
                <Pencil size={16} />
                {tr("Edit", "Edit")}
              </DesktopPageAction>
              <button
                type="button"
                onClick={handleDeleteDevice}
                className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] sm:flex-none [&_svg]:h-3.5 [&_svg]:w-3.5"
              >
                <Trash2 size={16} />
                {tr("Padam", "Delete")}
              </button>
            </>
          }
        />
      </div>

      {/* ── MAIN BODY CONTENT ── */}
      <DesktopPageBody className="space-y-5">
        {showDataSkeleton || !device ? (
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)]" />
            <div className="h-64 animate-pulse rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)]" />
          </div>
        ) : (
          <>
            {/* ── HERO SHOWCASE CARD ── */}
            <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--text)] shadow-sm sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[var(--accent)]/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl" />

              <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  {/* Image / Thumbnail */}
                  <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] shadow-sm sm:h-24 sm:w-24">
                    {device.has_image ? (
                      <WarrantyDeviceImage
                        deviceId={device.id}
                        hasImage={Boolean(device.has_image)}
                        imageUrl={device.image_url}
                        alt={device.device_name}
                        className="h-full w-full"
                        imgClassName="object-cover"
                        fallbackIconSize={36}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
                        <Shield className="h-10 w-10 opacity-60 text-emerald-500 dark:text-emerald-400" />
                      </div>
                    )}
                  </div>

                  {/* Main titles and badges */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold",
                          statusCfg.badge
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", statusCfg.dot)} />
                        {statusLabel(device.warranty_status)}
                      </span>

                      {device.category && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">
                          <Tag className="h-3 w-3 opacity-60" />
                          {device.category}
                        </span>
                      )}
                    </div>

                    <h1 className="mt-2 truncate text-lg sm:text-2xl font-black tracking-tight text-[var(--text)]">
                      {toTitleCase(device.device_name)}
                    </h1>

                    <p className="mt-0.5 truncate text-xs sm:text-sm font-semibold text-[var(--muted)]">
                      {[device.brand, device.model].filter(Boolean).join(" · ") || (
                        <span>{tr("No. Siri", "SN")}: {device.serial_number}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Prominent Countdown Pill */}
                <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-left sm:text-right backdrop-blur-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("Baki Tempoh Waranti", "Warranty Remaining")}
                    </p>
                    <p className="mt-0.5 text-lg font-black text-[var(--text)]">
                      {remainingLabel}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      {tr("Tamat", "Expires")}: {formatDateShort(device.warranty_expiry_date, dateLocale)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── DETAILS & SPECIFICATIONS ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                <Tag className="h-4 w-4 text-[var(--accent)]" />
                {tr("Spesifikasi & Maklumat Waranti", "Warranty & Device Details")}
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Category */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Kategori", "Category")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                    {device.category || "—"}
                  </span>
                </div>

                {/* Brand & Model */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Jenama & Model", "Brand & Model")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)] truncate">
                    {[device.brand, device.model].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>

                {/* Serial Number */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("No. Siri", "Serial Number")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)] font-mono truncate">
                    {device.serial_number || "—"}
                  </span>
                </div>

                {/* Purchase Date */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Tarikh Pembelian", "Purchase Date")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                    {formatDateLabel(device.purchase_date, dateLocale)}
                  </span>
                </div>

                {/* Purchase Price */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Harga Pembelian", "Purchase Price")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                    {device.purchase_price != null ? (
                      <MoneyAmount value={Number(device.purchase_price)} size="sm" />
                    ) : (
                      "—"
                    )}
                  </span>
                </div>

                {/* Store / Seller */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Kedai / Penjual", "Store / Seller")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)] truncate">
                    {device.store_or_seller || "—"}
                  </span>
                </div>

                {/* Receipt Number */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("No. Resit / Pesanan", "Receipt / Order No.")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)] font-mono truncate">
                    {device.receipt_or_order_number || "—"}
                  </span>
                </div>

                {/* Warranty Duration */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Tempoh Waranti", "Warranty Duration")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                    {device.warranty_duration_months ? `${device.warranty_duration_months} ${tr("Bulan", "Months")}` : "—"}
                  </span>
                </div>

                {/* Warranty Dates (Start -> Expiry) */}
                <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Tempoh Mula & Tamat", "Start & Expiry Dates")}
                  </span>
                  <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                    {formatDateShort(device.warranty_start_date, dateLocale)} → {formatDateShort(device.warranty_expiry_date, dateLocale)}
                  </span>
                </div>
              </div>

              {/* Notes & Receipt Attachment Button */}
              {device.notes && (
                <div className="mt-4 rounded-xl bg-[var(--surface-tint)] p-3.5">
                  <span className="block text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Catatan / Nota", "Notes & Remarks")}
                  </span>
                  <p className="mt-1 text-xs font-medium text-[var(--text)] whitespace-pre-wrap">
                    {device.notes}
                  </p>
                </div>
              )}

              {device.receipt_attachment_id && (
                <div className="mt-4 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                  <button
                    type="button"
                    onClick={() => openAttachment(Number(device.receipt_attachment_id))}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2 text-xs font-bold text-[var(--text)] transition hover:border-[var(--accent)] active:scale-95"
                  >
                    <FileText className="h-4 w-4 text-[var(--accent)]" />
                    <span>{tr("Lihat Resit / Lampiran Pembelian", "View Purchase Receipt / Invoice")}</span>
                  </button>
                </div>
              )}
            </div>

            {/* ── SERVICE & CLAIMS HISTORY TIMELINE ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  {tr("Rekod Tuntutan & Servis", "Service & Claims History")}
                </h2>

                <button
                  type="button"
                  onClick={openAddClaim}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{tr("Tambah Tuntutan", "Add Claim")}</span>
                </button>
              </div>

              {claims.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/40 p-8 text-center">
                  <Calendar className="mx-auto h-8 w-8 text-[var(--muted)] opacity-50" />
                  <p className="mt-2 text-xs font-bold text-[var(--text)]">
                    {tr("Tiada rekod tuntutan lagi", "No claim records yet")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {tr("Tekan butang di atas untuk mendaftar tuntutan servis baharu.", "Click the button above to log a new repair or warranty claim.")}
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {claims.map((c) => {
                    const resInfo = resolutionInfo(c.resolution)
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 transition hover:border-[var(--accent)]/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-[var(--text)]">
                                {formatDateLabel(c.claim_date, dateLocale)}
                              </span>
                              {c.resolution && (
                                <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold", resInfo.badge)}>
                                  {resInfo.label}
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-xs font-medium text-[var(--text)]">
                              {c.problem_description || "—"}
                            </p>

                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px] text-[var(--muted)]">
                              {c.service_centre && (
                                <div>
                                  <span className="font-semibold">{tr("Pusat Servis", "Service Centre")}:</span> {c.service_centre}
                                </div>
                              )}
                              {c.reference_number && (
                                <div>
                                  <span className="font-semibold">{tr("No. Rujukan", "Ref No.")}:</span> {c.reference_number}
                                </div>
                              )}
                              {c.date_sent && (
                                <div>
                                  <span className="font-semibold">{tr("Tarikh Hantar", "Date Sent")}:</span> {formatDateShort(c.date_sent, dateLocale)}
                                </div>
                              )}
                              {c.date_received && (
                                <div>
                                  <span className="font-semibold">{tr("Tarikh Terima", "Date Received")}:</span> {formatDateShort(c.date_received, dateLocale)}
                                </div>
                              )}
                            </div>

                            {c.notes && (
                              <p className="mt-2 rounded-lg bg-[var(--card)] p-2 text-[11px] text-[var(--muted)]">
                                {c.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {c.attachment_id && (
                              <button
                                type="button"
                                onClick={() => openAttachment(Number(c.attachment_id))}
                                className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]"
                                title={tr("Lampiran", "Attachment")}
                              >
                                <Paperclip className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditClaim(c)}
                              className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]"
                              title={tr("Edit", "Edit")}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClaim(c)}
                              className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"
                              title={tr("Padam", "Delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DesktopPageBody>

      {/* ── EDIT DEVICE SHEET ── */}
      {mounted && showEditSheet && form ? (
        createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-black/50 backdrop-blur-sm p-0 sm:items-center"
            onClick={closeEditSheet}
            onTouchMove={(e) => e.preventDefault()}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              data-swipe-sheet
              {...editSwipe}
              className="app-sheet-panel app-sheet-panel--lg w-full max-h-[90dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[32rem] sm:rounded-3xl"
            >
              <AppSheetHeader
                title={tr("Edit Peranti", "Edit Device")}
                eyebrow={tr("Waranti Saya", "My Warranty")}
                onClose={closeEditSheet}
                action={
                  <button
                    type="submit"
                    form="warranty-edit-form"
                    disabled={saving || !form.device_name.trim()}
                    className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
                  >
                    {saving ? tr("Menyimpan…", "Saving…") : tr("Simpan", "Save")}
                  </button>
                }
              />
              <form id="warranty-edit-form" onSubmit={handleSaveDevice} className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-name">
                    {tr("Nama Peranti *", "Device Name *")}
                  </label>
                  <input
                    id="ed-name"
                    required
                    value={form.device_name}
                    onChange={(e) => updateForm({ device_name: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    maxLength={190}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-cat">
                      {tr("Kategori", "Category")}
                    </label>
                    <select
                      id="ed-cat"
                      value={form.category}
                      onChange={(e) => updateForm({ category: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">{tr("— Pilih kategori —", "— Select category —")}</option>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-brand">
                      {tr("Jenama", "Brand")}
                    </label>
                    <input
                      id="ed-brand"
                      value={form.brand}
                      onChange={(e) => updateForm({ brand: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      maxLength={80}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-model">
                      {tr("Model", "Model")}
                    </label>
                    <input
                      id="ed-model"
                      value={form.model}
                      onChange={(e) => updateForm({ model: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      maxLength={80}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-serial">
                      {tr("No. Siri *", "Serial Number *")}
                    </label>
                    <input
                      id="ed-serial"
                      required
                      value={form.serial_number}
                      onChange={(e) => updateForm({ serial_number: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      maxLength={120}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-pdate">
                      {tr("Tarikh Pembelian", "Purchase Date")}
                    </label>
                    <input
                      id="ed-pdate"
                      type="date"
                      value={form.purchase_date}
                      onChange={(e) => updateForm({ purchase_date: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-pprice">
                      {tr("Harga Pembelian (RM)", "Purchase Price (RM)")}
                    </label>
                    <input
                      id="ed-pprice"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.purchase_price}
                      onChange={(e) => updateForm({ purchase_price: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-seller">
                      {tr("Kedai / Penjual", "Store / Seller")}
                    </label>
                    <input
                      id="ed-seller"
                      value={form.store_or_seller}
                      onChange={(e) => updateForm({ store_or_seller: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-receipt-no">
                      {tr("No. Resit / Pesanan", "Receipt / Order No.")}
                    </label>
                    <input
                      id="ed-receipt-no"
                      value={form.receipt_or_order_number}
                      onChange={(e) => updateForm({ receipt_or_order_number: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      maxLength={120}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-start">
                      {tr("Tarikh Mula Waranti *", "Warranty Start Date *")}
                    </label>
                    <input
                      id="ed-start"
                      type="date"
                      required
                      value={form.warranty_start_date}
                      onChange={(e) => updateForm({ warranty_start_date: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-dur">
                      {tr("Tempoh Waranti *", "Duration *")}
                    </label>
                    <select
                      id="ed-dur"
                      value={form.warranty_duration}
                      onChange={(e) => updateForm({ warranty_duration: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      {DURATION_OPTIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.months} {tr("Bulan", "Months")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-exp">
                    {tr("Tarikh Tamat Waranti", "Warranty Expiry Date")}
                  </label>
                  <input
                    id="ed-exp"
                    type="date"
                    value={form.warranty_expiry_date}
                    onChange={(e) => updateForm({ warranty_expiry_date: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="ed-notes">
                    {tr("Catatan", "Notes")}
                  </label>
                  <textarea
                    id="ed-notes"
                    value={form.notes}
                    onChange={(e) => updateForm({ notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
                      {tr("Gambar Peranti", "Device Image")}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      className="text-xs text-[var(--muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-tint)] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[var(--text)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
                      {tr("Resit / Lampiran", "Receipt File")}
                    </label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                      className="text-xs text-[var(--muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-tint)] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[var(--text)]"
                    />
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      ) : null}

      {/* ── ADD / EDIT CLAIM SHEET ── */}
      {mounted && showClaimSheet ? (
        createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-black/50 backdrop-blur-sm p-0 sm:items-center"
            onClick={closeClaimSheet}
            onTouchMove={(e) => e.preventDefault()}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              data-swipe-sheet
              {...claimSwipe}
              className="app-sheet-panel app-sheet-panel--lg w-full max-h-[90dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[32rem] sm:rounded-3xl"
            >
              <AppSheetHeader
                title={editingClaim ? tr("Edit Rekod Tuntutan", "Edit Claim Record") : tr("Tambah Rekod Tuntutan", "Add Claim Record")}
                eyebrow={tr("Waranti Saya", "My Warranty")}
                onClose={closeClaimSheet}
                action={
                  <button
                    type="submit"
                    form="warranty-claim-form"
                    disabled={saving}
                    className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
                  >
                    {saving ? tr("Menyimpan…", "Saving…") : tr("Simpan", "Save")}
                  </button>
                }
              />
              <form id="warranty-claim-form" onSubmit={handleSaveClaim} className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-date">
                      {tr("Tarikh Tuntutan", "Claim Date")}
                    </label>
                    <input
                      id="cl-date"
                      type="date"
                      value={claimForm.claim_date}
                      onChange={(e) => setClaimForm({ ...claimForm, claim_date: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-res">
                      {tr("Status / Resolusi", "Resolution")}
                    </label>
                    <select
                      id="cl-res"
                      value={claimForm.resolution}
                      onChange={(e) => setClaimForm({ ...claimForm, resolution: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">{tr("— Pilih Resolusi —", "— Select Resolution —")}</option>
                      {RESOLUTION_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {isBm ? r.bm : r.en}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-prob">
                    {tr("Keterangan Masalah / Kerosakan", "Problem Description")}
                  </label>
                  <textarea
                    id="cl-prob"
                    value={claimForm.problem_description}
                    onChange={(e) => setClaimForm({ ...claimForm, problem_description: e.target.value })}
                    rows={2}
                    placeholder={tr("Cth: Skrin tidak bernyala, bateri tidak cas...", "e.g. Screen not turning on, battery not charging...")}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-sc">
                      {tr("Pusat Servis", "Service Centre")}
                    </label>
                    <input
                      id="cl-sc"
                      value={claimForm.service_centre}
                      onChange={(e) => setClaimForm({ ...claimForm, service_centre: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-ref">
                      {tr("No. Rujukan Servis", "Service Ref Number")}
                    </label>
                    <input
                      id="cl-ref"
                      value={claimForm.reference_number}
                      onChange={(e) => setClaimForm({ ...claimForm, reference_number: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      maxLength={120}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-sent">
                      {tr("Tarikh Hantar", "Date Sent")}
                    </label>
                    <input
                      id="cl-sent"
                      type="date"
                      value={claimForm.date_sent}
                      onChange={(e) => setClaimForm({ ...claimForm, date_sent: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-exp">
                      {tr("Tarikh Jangka Siap", "Expected Date")}
                    </label>
                    <input
                      id="cl-exp"
                      type="date"
                      value={claimForm.expected_completion_date}
                      onChange={(e) => setClaimForm({ ...claimForm, expected_completion_date: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-rec">
                    {tr("Tarikh Diterima Semula", "Date Received Back")}
                  </label>
                  <input
                    id="cl-rec"
                    type="date"
                    value={claimForm.date_received}
                    onChange={(e) => setClaimForm({ ...claimForm, date_received: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cl-notes">
                    {tr("Catatan Tambahan", "Additional Notes")}
                  </label>
                  <textarea
                    id="cl-notes"
                    value={claimForm.notes}
                    onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
                    {tr("Lampiran Servis (Resit/Laporan)", "Service Attachment (Report/Invoice)")}
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setClaimFile(e.target.files?.[0] || null)}
                    className="text-xs text-[var(--muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-tint)] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[var(--text)]"
                  />
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      ) : null}

      {alertModal}
    </>
  )
}
