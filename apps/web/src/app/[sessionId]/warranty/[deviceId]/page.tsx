"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Calendar,
  FileText,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
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

const RESOLUTION_OPTIONS = [
  { value: "repaired", bm: "Dibaiki", en: "Repaired" },
  { value: "replaced", bm: "Diganti", en: "Replaced" },
  { value: "rejected", bm: "Tuntutan ditolak", en: "Claim rejected" },
  { value: "other", bm: "Lain-lain", en: "Other" },
] as const

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

/** "MAKAN NASI" / "makan nasi" → "Makan Nasi" */
function toTitleCase(value?: string | null) {
  const text = (value || "").trim()
  if (!text) return ""
  return text
    .toLowerCase()
    .replace(/(^|[\s\-_/&])([a-zA-ZÀ-ÿ])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`)
}

function statusBadgeClass(status: WarrantyStatus) {
  if (status === "active") return "bg-emerald-500/12 text-emerald-600"
  if (status === "expiring_soon") return "bg-amber-500/12 text-amber-600"
  if (status === "expired") return "bg-rose-500/12 text-rose-600"
  return "bg-[var(--surface-tint)] text-[var(--muted)]"
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [mobileMenuOpen])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

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

  useEffect(() => {
    const open = showEditSheet || showClaimSheet
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: open } }),
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }),
      )
    }
  }, [showEditSheet, showClaimSheet])

  useEffect(() => {
    const open = showEditSheet || showClaimSheet
    if (!open) return

    const scrollY = window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = "100%"
    document.documentElement.style.overscrollBehavior = "none"

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [showEditSheet, showClaimSheet])

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
    let result = { ...next }
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
      if (status === "active") return toTitleCase(tr("Aktif", "Active"))
      if (status === "expiring_soon") return toTitleCase(tr("Hampir Tamat", "Expiring Soon"))
      if (status === "expired") return toTitleCase(tr("Tamat", "Expired"))
      return toTitleCase(tr("Tiada tarikh", "No date"))
    },
    [tr],
  )

  const resolutionLabel = useCallback(
    (value?: string | null) => {
      const opt = RESOLUTION_OPTIONS.find((o) => o.value === value)
      if (!opt) return value ? toTitleCase(value) : "—"
      return toTitleCase(isBm ? opt.bm : opt.en)
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
    if (!form || !device) return
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
    if (!device) return
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
        resolution: claimForm.resolution || null,
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
      const saved = (await res.json()) as ClaimItem
      if (claimFile) {
        const fd = new FormData()
        fd.append("file", claimFile)
        await fetch(`/api/warranties/${device.id}/claims/${saved.id}/attachment`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }
      closeClaimSheet()
      showAlert(tr("Berjaya", "Success"), tr("Tuntutan disimpan.", "Claim saved."), "success")
      await loadData()
    } catch (err) {
      showAlert(
        tr("Gagal", "Failed"),
        err instanceof Error ? err.message : tr("Gagal simpan tuntutan.", "Failed to save claim."),
        "error",
      )
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteClaim(c: ClaimItem) {
    if (!device) return
    showConfirm(
      tr("Padam tuntutan?", "Delete claim?"),
      tr("Padam rekod tuntutan ini?", "Delete this claim record?"),
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
          showAlert(tr("Berjaya", "Success"), tr("Tuntutan dipadam.", "Claim deleted."), "success")
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

  async function openAttachment(attachmentId: number) {
    try {
      const res = await fetch(`/api/warranties/attachments/${attachmentId}/file`, {
        headers: authHeaders(),
        credentials: "include",
      })
      if (!res.ok) throw new Error(tr("Gagal buka lampiran.", "Failed to open attachment."))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener,noreferrer")
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      showAlert(
        tr("Gagal", "Failed"),
        err instanceof Error ? err.message : tr("Gagal buka lampiran.", "Failed to open attachment."),
        "error",
      )
    }
  }

  const detailRows = device
    ? [
        { label: tr("Nama peranti", "Device name"), value: toTitleCase(device.device_name) },
        { label: tr("Kategori", "Category"), value: toTitleCase(device.category) || "—" },
        { label: tr("Jenama", "Brand"), value: toTitleCase(device.brand) || "—" },
        { label: tr("Model", "Model"), value: toTitleCase(device.model) || "—" },
        { label: tr("Nombor siri", "Serial number"), value: device.serial_number },
        {
          label: tr("Tarikh beli", "Purchase date"),
          value: formatDateLabel(device.purchase_date, dateLocale),
        },
        {
          label: tr("Harga beli", "Purchase price"),
          value:
            device.purchase_price != null ? (
              <MoneyAmount value={Number(device.purchase_price)} size="xs" />
            ) : (
              "—"
            ),
        },
        { label: tr("Kedai / penjual", "Store or seller"), value: device.store_or_seller || "—" },
        {
          label: tr("No. resit / pesanan", "Receipt / order no."),
          value: device.receipt_or_order_number || "—",
        },
        {
          label: tr("Tempoh waranti", "Warranty duration"),
          value:
            device.warranty_duration_months != null
              ? tr(`${device.warranty_duration_months} bulan`, `${device.warranty_duration_months} months`)
              : "—",
        },
        {
          label: tr("Tarikh mula waranti", "Warranty start"),
          value: formatDateLabel(device.warranty_start_date, dateLocale),
        },
        {
          label: tr("Tarikh tamat waranti", "Warranty expiry"),
          value: formatDateLabel(device.warranty_expiry_date, dateLocale),
        },
        { label: tr("Baki hari waranti", "Remaining days"), value: remainingLabel },
        {
          label: tr("Status waranti", "Warranty status"),
          value: (
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide",
                statusBadgeClass(device.warranty_status),
              )}
            >
              {statusLabel(device.warranty_status)}
            </span>
          ),
        },
        { label: tr("Nota", "Notes"), value: device.notes || "—" },
      ]
    : []

  const editFormEl =
    form != null ? (
      <form id="warranty-edit-form" onSubmit={handleSaveDevice} className="space-y-5 pb-4">
        <section className="space-y-3">
          <p className="text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
            {tr("Maklumat Peranti", "Device Information")}
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{tr("Nama peranti", "Device name")} *</span>
            <input
              value={form.device_name}
              onChange={(e) => updateForm({ device_name: e.target.value })}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
              required
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["category", tr("Kategori", "Category")],
                ["brand", tr("Jenama", "Brand")],
                ["model", tr("Model", "Model")],
                ["serial_number", tr("Nombor siri", "Serial number") + " *"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block space-y-1.5">
                <span className="text-xs font-semibold">{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => updateForm({ [key]: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
                  required={key === "serial_number"}
                />
              </label>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{tr("Imej peranti", "Device image")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--surface-tint)] file:px-3 file:py-1.5 file:text-xs file:font-bold"
            />
          </label>
        </section>

        <section className="space-y-3">
          <p className="text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
            {tr("Maklumat Pembelian", "Purchase Information")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">{tr("Tarikh beli", "Purchase date")}</span>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) => {
                  const purchase_date = e.target.value
                  setForm((prev) => {
                    if (!prev) return prev
                    const shouldSyncStart =
                      !prev.warranty_start_date || prev.warranty_start_date === prev.purchase_date
                    return recomputeWarrantyDates({
                      ...prev,
                      purchase_date,
                      warranty_start_date: shouldSyncStart ? purchase_date : prev.warranty_start_date,
                    })
                  })
                }}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">{tr("Harga beli", "Purchase price")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.purchase_price}
                onChange={(e) => updateForm({ purchase_price: e.target.value })}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">{tr("Kedai / penjual", "Store or seller")}</span>
              <input
                value={form.store_or_seller}
                onChange={(e) => updateForm({ store_or_seller: e.target.value })}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">
                {tr("No. resit / pesanan", "Receipt / order no.")}
              </span>
              <input
                value={form.receipt_or_order_number}
                onChange={(e) => updateForm({ receipt_or_order_number: e.target.value })}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
              />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{tr("Lampiran resit", "Receipt attachment")}</span>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--surface-tint)] file:px-3 file:py-1.5 file:text-xs file:font-bold"
            />
          </label>
        </section>

        <section className="space-y-3">
          <p className="text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
            {tr("Maklumat Waranti", "Warranty Information")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">
                {tr("Tarikh mula waranti", "Warranty start date")} *
              </span>
              <input
                type="date"
                value={form.warranty_start_date}
                onChange={(e) => updateForm({ warranty_start_date: e.target.value })}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">
                {tr("Tempoh waranti", "Warranty duration")} *
              </span>
              <select
                value={form.warranty_duration}
                onChange={(e) => updateForm({ warranty_duration: e.target.value })}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
                required
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {tr(`${opt.months} bulan`, `${opt.months} months`)}
                  </option>
                ))}
              </select>
            </label>
            {form.warranty_expiry_date ? (
              <div className="sm:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/40 px-3.5 py-2.5">
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)]">
                  {tr("Tarikh tamat (auto)", "Expiry date (auto)")}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--text)]">
                  {formatDateLabel(form.warranty_expiry_date, dateLocale)}
                </p>
              </div>
            ) : (
              <p className="sm:col-span-2 text-[11px] font-medium text-[var(--muted)]">
                {tr(
                  "Tarikh tamat dikira automatik selepas tarikh mula dan tempoh diisi.",
                  "Expiry date is calculated automatically after start date and duration are set.",
                )}
              </p>
            )}
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{tr("Nota", "Notes")}</span>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm({ notes: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
            />
          </label>
        </section>

      </form>
    ) : null

  const claimFormEl = (
    <form onSubmit={handleSaveClaim} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold">{tr("Tarikh tuntutan", "Claim date")}</span>
        <input
          type="date"
          value={claimForm.claim_date}
          onChange={(e) => setClaimForm((p) => ({ ...p, claim_date: e.target.value }))}
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold">{tr("Penerangan masalah", "Problem description")}</span>
        <textarea
          value={claimForm.problem_description}
          onChange={(e) => setClaimForm((p) => ({ ...p, problem_description: e.target.value }))}
          rows={3}
          className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{tr("Pusat servis", "Service centre")}</span>
          <input
            value={claimForm.service_centre}
            onChange={(e) => setClaimForm((p) => ({ ...p, service_centre: e.target.value }))}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{tr("No. rujukan", "Reference number")}</span>
          <input
            value={claimForm.reference_number}
            onChange={(e) => setClaimForm((p) => ({ ...p, reference_number: e.target.value }))}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{tr("Tarikh hantar", "Date sent")}</span>
          <input
            type="date"
            value={claimForm.date_sent}
            onChange={(e) => setClaimForm((p) => ({ ...p, date_sent: e.target.value }))}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">
            {tr("Jangka siap", "Expected completion")}
          </span>
          <input
            type="date"
            value={claimForm.expected_completion_date}
            onChange={(e) =>
              setClaimForm((p) => ({ ...p, expected_completion_date: e.target.value }))
            }
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{tr("Tarikh terima", "Date received")}</span>
          <input
            type="date"
            value={claimForm.date_received}
            onChange={(e) => setClaimForm((p) => ({ ...p, date_received: e.target.value }))}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">{tr("Resolusi", "Resolution")}</span>
          <select
            value={claimForm.resolution}
            onChange={(e) => setClaimForm((p) => ({ ...p, resolution: e.target.value }))}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
          >
            <option value="">{tr("Pilih...", "Select...")}</option>
            {RESOLUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {isBm ? opt.bm : opt.en}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold">{tr("Nota", "Notes")}</span>
        <textarea
          value={claimForm.notes}
          onChange={(e) => setClaimForm((p) => ({ ...p, notes: e.target.value }))}
          rows={2}
          className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent2)]"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold">{tr("Lampiran", "Attachment")}</span>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => setClaimFile(e.target.files?.[0] || null)}
          className="w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--surface-tint)] file:px-3 file:py-1.5 file:text-xs file:font-bold"
        />
      </label>
      <div className="flex gap-2 pb-2">
        <button
          type="button"
          onClick={requestClaimClose}
          className="flex-1 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-bold"
        >
          {tr("Batal", "Cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] px-4 py-3 text-sm font-bold text-[var(--bg)] disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {tr("Simpan", "Save")}
        </button>
      </div>
    </form>
  )

  return (
    <div className="space-y-4 pb-24 md:space-y-0 md:pb-0">
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={toTitleCase(device?.device_name) || tr("Butiran Peranti", "Device Details")}
          fallbackHref={`/${sessionId}/warranty`}
          action={
            <div ref={mobileMenuRef} className="relative">
              <MobileIconButton onClick={() => setMobileMenuOpen((v) => !v)} label={tr("Menu", "Menu")}>
                <MoreVertical size={16} />
              </MobileIconButton>
              {mobileMenuOpen ? (
                <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg shadow-black/10">
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); openEdit() }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition active:scale-[0.98]"
                  >
                    <Pencil size={16} className="text-amber-500" />
                    {tr("Edit", "Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleDeleteDevice() }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-rose-500 transition active:scale-[0.98]"
                  >
                    <Trash2 size={16} />
                    {tr("Padam", "Delete")}
                  </button>
                </div>
              ) : null}
            </div>
          }
        />

        {showDataSkeleton || !device ? (
          <div className="space-y-3 px-1">
            <AmountSkeleton className="h-40 w-full rounded-[1.5rem]" />
            <AmountSkeleton className="h-24 w-full rounded-[1.35rem]" />
          </div>
        ) : (
          <div className="space-y-4 px-1">
            <div className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]">
              <div className="relative h-28 w-full">
                <WarrantyDeviceImage
                  deviceId={device.id}
                  hasImage={Boolean(device.has_image)}
                  imageUrl={device.image_url}
                  alt={device.device_name}
                  className="absolute inset-0 h-full w-full"
                  fallbackIconSize={36}
                />
                <span
                  className={cn(
                    "absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wide",
                    statusBadgeClass(device.warranty_status),
                  )}
                >
                  {statusLabel(device.warranty_status)}
                </span>
              </div>
              <div className="space-y-2 p-4">
                <div>
                  <p className="truncate text-sm font-black text-[var(--text)]">
                    {toTitleCase(device.device_name)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">
                    {toTitleCase([device.brand, device.model].filter(Boolean).join(" · ")) ||
                      device.serial_number}
                  </p>
                </div>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  {tr("No. Siri", "Serial")}: {device.serial_number}
                </p>
                <div
                  className={cn(
                    "flex items-center justify-between rounded-2xl border px-3 py-2",
                    device.warranty_status === "expired" && "border-rose-500/25 bg-rose-500/10",
                    device.warranty_status === "expiring_soon" &&
                      "border-amber-500/25 bg-amber-500/10",
                    device.warranty_status === "active" &&
                      "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10",
                    (device.warranty_status === "unknown" || !device.warranty_status) &&
                      "border-[var(--border)] bg-[var(--surface-tint)]/40",
                  )}
                >
                  <p className="text-[11px] font-black text-[var(--text)]">{remainingLabel}</p>
                  <p className="text-[10px] font-semibold text-[var(--muted)]">
                    {formatDateShort(device.warranty_expiry_date, dateLocale)}
                  </p>
                </div>
                {device.purchase_price != null ? (
                  <p className="text-xs font-bold text-[var(--text)]">
                    <MoneyAmount value={Number(device.purchase_price)} size="xs" />
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="grid grid-cols-2 gap-3">
                {detailRows.map((row) => (
                  <div key={String(row.label)} className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)]">
                      {row.label}
                    </p>
                    <div className="mt-0.5 break-words text-xs font-semibold text-[var(--text)]">
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {device.receipt_attachment_id ? (
                  <button
                    type="button"
                    onClick={() => openAttachment(Number(device.receipt_attachment_id))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--text)]"
                  >
                    <FileText size={13} />
                    {tr("Lihat lampiran", "View attachment")}
                  </button>
                ) : null}
                {device.has_image && imageUrl ? (
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--text)]"
                  >
                    <ImageIcon size={13} />
                    {tr("Lihat imej", "View image")}
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
                  {tr("Rekod Tuntutan", "Claim Records")}
                </p>
                <button
                  type="button"
                  onClick={openAddClaim}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--text)] px-3 py-1.5 text-[10px] font-bold tracking-wide text-[var(--bg)]"
                >
                  <Plus size={12} />
                  {tr("Tambah", "Add")}
                </button>
              </div>
              {claims.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">
                  {tr("Tiada rekod tuntutan lagi.", "No claim records yet.")}
                </p>
              ) : (
                <div className="space-y-3">
                  {claims.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-[var(--text)]">
                            {formatDateLabel(c.claim_date, dateLocale)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {c.problem_description || "—"}
                          </p>
                          {c.service_centre ? (
                            <p className="mt-1 text-[11px] font-semibold text-[var(--text)]">
                              {c.service_centre}
                            </p>
                          ) : null}
                          {c.resolution ? (
                            <p className="mt-1 text-[11px] font-bold text-[var(--accent2)]">
                              {resolutionLabel(c.resolution)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {c.attachment_id ? (
                            <button
                              type="button"
                              onClick={() => openAttachment(Number(c.attachment_id))}
                              className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                            >
                              <Paperclip size={14} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEditClaim(c)}
                            className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClaim(c)}
                            className="rounded-full p-1.5 text-rose-500 hover:bg-rose-500/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openEdit}
                className="rounded-2xl border border-[var(--border)] px-3 py-3 text-xs font-bold"
              >
                {tr("Edit", "Edit")}
              </button>
              <button
                type="button"
                onClick={openAddClaim}
                className="rounded-2xl bg-[var(--text)] px-3 py-3 text-xs font-bold text-[var(--bg)]"
              >
                {tr("Tambah tuntutan", "Add claim")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={toTitleCase(device?.device_name) || tr("Butiran Peranti", "Device Details")}
          breadcrumbs={[{ label: tr("Waranti Saya", "My Warranty"), href: `/${sessionId}/warranty` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/warranty`}
          actions={
            <>
              <DesktopPageAction onClick={openAddClaim}>
                <Plus size={16} />
                {tr("Tambah tuntutan", "Add claim")}
              </DesktopPageAction>
              <DesktopPageAction onClick={openEdit} variant="solid">
                <Pencil size={16} />
                {tr("Edit", "Edit")}
              </DesktopPageAction>
              <DesktopPageAction
                onClick={handleDeleteDevice}
                className="!bg-rose-500 !text-white"
              >
                <Trash2 size={16} />
                {tr("Padam", "Delete")}
              </DesktopPageAction>
            </>
          }
        />
        <DesktopPageBody>
          {showDataSkeleton || !device ? (
            <div className="grid gap-4 md:grid-cols-2">
              <AmountSkeleton className="h-64 w-full rounded-[1.5rem]" />
              <AmountSkeleton className="h-64 w-full rounded-[1.5rem]" />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]">
                  <div className="relative h-40 w-full">
                    <WarrantyDeviceImage
                      deviceId={device.id}
                      hasImage={Boolean(device.has_image)}
                  imageUrl={device.image_url}
                      alt={device.device_name}
                      className="absolute inset-0 h-full w-full"
                      fallbackIconSize={48}
                    />
                    <span
                      className={cn(
                        "absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide",
                        statusBadgeClass(device.warranty_status),
                      )}
                    >
                      {statusLabel(device.warranty_status)}
                    </span>
                  </div>
                  <div className="space-y-3 p-5">
                    <div>
                      <p className="truncate text-lg font-black text-[var(--text)]">
                        {toTitleCase(device.device_name)}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-[var(--muted)]">
                        {toTitleCase([device.brand, device.model].filter(Boolean).join(" · ")) ||
                          device.serial_number}
                      </p>
                    </div>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {tr("No. Siri", "Serial")}: {device.serial_number}
                    </p>
                    <div
                      className={cn(
                        "flex items-center justify-between rounded-2xl border px-3.5 py-2.5",
                        device.warranty_status === "expired" && "border-rose-500/25 bg-rose-500/10",
                        device.warranty_status === "expiring_soon" &&
                          "border-amber-500/25 bg-amber-500/10",
                        device.warranty_status === "active" &&
                          "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10",
                        (device.warranty_status === "unknown" || !device.warranty_status) &&
                          "border-[var(--border)] bg-[var(--surface-tint)]/40",
                      )}
                    >
                      <p className="text-sm font-black text-[var(--text)]">{remainingLabel}</p>
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        {formatDateShort(device.warranty_expiry_date, dateLocale)}
                      </p>
                    </div>
                    {device.purchase_price != null ? (
                      <p className="text-sm font-bold text-[var(--text)]">
                        <MoneyAmount value={Number(device.purchase_price)} size="sm" />
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5">
                  <p className="mb-4 text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
                    {tr("Butiran Penuh", "Full Details")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detailRows.map((row) => (
                      <div key={String(row.label)} className="rounded-2xl bg-[var(--bg)] p-3">
                        <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)]">
                          {row.label}
                        </p>
                        <div className="mt-1 text-sm font-semibold text-[var(--text)]">{row.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {device.receipt_attachment_id ? (
                      <button
                        type="button"
                        onClick={() => openAttachment(Number(device.receipt_attachment_id))}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold"
                      >
                        <FileText size={14} />
                        {tr("Lihat lampiran", "View attachment")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
                    {tr("Rekod Tuntutan", "Claim Records")}
                  </p>
                  <button
                    type="button"
                    onClick={openAddClaim}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--text)] px-3 py-1.5 text-[10px] font-bold tracking-wide text-[var(--bg)]"
                  >
                    <Plus size={12} />
                    {tr("Tambah", "Add")}
                  </button>
                </div>
                {claims.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center">
                    <Calendar size={28} className="mx-auto text-[var(--muted)]/40" />
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {tr("Tiada rekod tuntutan lagi.", "No claim records yet.")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {claims.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-[var(--text)]">
                              {formatDateLabel(c.claim_date, dateLocale)}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {c.problem_description || "—"}
                            </p>
                            {c.service_centre ? (
                              <p className="mt-1 text-xs font-semibold">{c.service_centre}</p>
                            ) : null}
                            {c.reference_number ? (
                              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                                {tr("Rujukan", "Ref")}: {c.reference_number}
                              </p>
                            ) : null}
                            {c.resolution ? (
                              <p className="mt-1 text-xs font-bold text-[var(--accent2)]">
                                {resolutionLabel(c.resolution)}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {c.attachment_id ? (
                              <button
                                type="button"
                                onClick={() => openAttachment(Number(c.attachment_id))}
                                className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                              >
                                <Paperclip size={14} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openEditClaim(c)}
                              className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClaim(c)}
                              className="rounded-full p-1.5 text-rose-500 hover:bg-rose-500/10"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DesktopPageBody>
      </div>

      {mounted && showEditSheet
        ? createPortal(
          <div className="fixed inset-0 z-[140] flex h-[100dvh] w-screen touch-none items-end justify-center overscroll-none bg-transparent p-0 md:items-center md:p-4">
              <button type="button" className="absolute inset-0" onClick={requestEditClose} />
              <div
                data-swipe-sheet
                className="app-sheet-panel relative z-10 flex max-h-[82dvh] w-full flex-col overflow-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl touch-pan-y md:max-h-[85vh] md:max-w-[30rem] md:rounded-[1.75rem]"
                {...editSwipe}
              >
                <div className="shrink-0 rounded-t-[36px] border-b border-[var(--border)] bg-[var(--sheet-bg)] px-5 py-4 shadow-sm sm:px-6">
                  <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-[var(--surface-tint-strong)] sm:hidden" />
                  <div className="flex items-center justify-between">
                    <p className="text-base font-black">{tr("Edit Peranti", "Edit Device")}</p>
                    <button type="button" onClick={requestEditClose} className="rounded-full p-2 text-[var(--muted)]">
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div data-swipe-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{editFormEl}</div>
                <div className="shrink-0 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={requestEditClose}
                      className="flex-1 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-bold"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      form="warranty-edit-form"
                      disabled={saving}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] px-4 py-3 text-sm font-bold text-[var(--bg)] disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                      {tr("Simpan", "Save")}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && showClaimSheet
        ? createPortal(
  <div className="fixed inset-0 z-[80] flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center md:p-4">
              <button type="button" className="absolute inset-0" onClick={requestClaimClose} />
              <div
                data-swipe-sheet
                className="app-sheet-panel relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--sheet-bg)] touch-pan-y md:max-h-[86vh] md:max-w-xl md:rounded-[1.75rem]"
                {...claimSwipe}
              >
                <div className="shrink-0 rounded-t-[36px] border-b border-[var(--border)] bg-[var(--sheet-bg)] px-5 py-4 shadow-sm sm:px-6">
                  <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-[var(--surface-tint-strong)] sm:hidden" />
                  <div className="flex items-center justify-between">
                    <p className="text-base font-black">
                      {editingClaim
                        ? tr("Edit Tuntutan", "Edit Claim")
                        : tr("Tambah Tuntutan", "Add Claim")}
                    </p>
                    <button type="button" onClick={requestClaimClose} className="rounded-full p-2 text-[var(--muted)]">
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div data-swipe-scroll className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                {claimFormEl}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {alertModal}
    </div>
  )
}
