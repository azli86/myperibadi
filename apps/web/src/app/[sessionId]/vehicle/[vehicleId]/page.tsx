"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ExternalLink,
  FileText,
  Fuel,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { VehicleHeroCard } from "./VehicleHeroCard"
import { VehicleQuickActions } from "./VehicleQuickActions"
import { VehicleSummaryCard } from "./VehicleSummaryCard"
import { MaintenanceGroupCard, type MaintenanceRowView } from "./MaintenanceGroupCard"
import {
  MAINTENANCE_GROUPS,
  calcMaintenanceStatus,
  formatNextServiceLabel,
  matchCatalogKey,
} from "./maintenanceCatalog"
import { invalidateVehicleImageCache } from "@/lib/vehicle-image-cache"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"

const R2_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"

type Vehicle = {
  id: number
  name: string
  vehicle_type?: string | null
  registration_number?: string | null
  brand?: string | null
  model?: string | null
  year?: number | null
  fuel_type?: string | null
  current_odometer?: number | null
  has_image?: boolean
  image_url?: string | null
  status: string
  notes?: string | null
}

type Maintenance = {
  id: number
  service_type: string
  service_date: string
  odometer?: number | null
  total_cost?: number | null
  workshop?: string | null
  next_service_date?: string | null
  next_service_odometer?: number | null
  status: string
  notes?: string | null
}

type Summary = {
  total_cost: number
  fuel_cost: number
  maintenance_cost: number
  expense_cost: number
  month_key: string
  road_tax_expiry?: string | null
  insurance_expiry?: string | null
}

type VehicleDocument = {
  id: number
  doc_type: string
  title: string
  start_date?: string | null
  expiry_date?: string | null
  amount?: number | null
  provider?: string | null
  reference_number?: string | null
  notes?: string | null
  status: string
  file_attachment_id?: number | null
}

type FuelLog = {
  id: number
  log_date: string
  odometer?: number | null
  litres?: number | null
  total_amount: number
  station?: string | null
  receipt_attachment_id?: number | null
  wallet_id?: number | null
  transaction_id?: number | null
  transaction_reference_id?: string | null
}

type WalletOption = {
  id: number
  name?: string
  label?: string | null
}

type SheetKind = "odometer" | "service" | "settings" | "item" | "document" | "fuel" | null

function authHeaders(): HeadersInit {
  const token = getAccessToken()
  if (token && !isCookieAuthSentinel(token)) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

async function apiFetch(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  })
}

const inputCls =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"

export default function VehicleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const sessionId = (params.sessionId as string) || ""
  const vehicleId = Number(params.vehicleId)
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const documentsSectionRef = useRef<HTMLElement | null>(null)

  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [maintenance, setMaintenance] = useState<Maintenance[]>([])
  const [documents, setDocuments] = useState<VehicleDocument[]>([])
  const [fuel, setFuel] = useState<FuelLog[]>([])
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [imageBust, setImageBust] = useState(0)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [activeItem, setActiveItem] = useState<MaintenanceRowView | null>(null)
  const [mounted, setMounted] = useState(false)

  const [odoForm, setOdoForm] = useState({
    reading_date: new Date().toISOString().slice(0, 10),
    odometer: "",
  })
  const [serviceForm, setServiceForm] = useState({
    service_type: "",
    service_date: new Date().toISOString().slice(0, 10),
    odometer: "",
    workshop: "",
    total_cost: "",
    next_service_date: "",
    next_service_odometer: "",
    notes: "",
    wallet_id: "",
    create_transaction: true,
  })
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    registration_number: "",
    brand: "",
    model: "",
    vehicle_type: "car",
    fuel_type: "petrol",
    current_odometer: "",
    notes: "",
  })
  const [docForm, setDocForm] = useState({
    doc_type: "road_tax",
    title: "",
    expiry_date: "",
    provider: "",
    amount: "",
    reference_number: "",
    notes: "",
    file: null as File | null,
  })
  const [fuelForm, setFuelForm] = useState({
    log_date: new Date().toISOString().slice(0, 10),
    odometer: "",
    litres: "",
    total_amount: "",
    station: "",
    is_full_tank: true,
    wallet_id: "",
    create_transaction: true,
    receipt: null as File | null,
  })

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])
  useEffect(() => setMounted(true), [])

  const loadAll = useCallback(async () => {
    if (!vehicleId || Number.isNaN(vehicleId)) return
    setLoading(true)
    try {
      const [vRes, sRes, mRes, dRes, fRes, wRes] = await Promise.all([
        apiFetch(`/api/vehicles/${vehicleId}`),
        apiFetch(`/api/vehicles/${vehicleId}/summary`),
        apiFetch(`/api/vehicles/${vehicleId}/maintenance`),
        apiFetch(`/api/vehicles/${vehicleId}/documents`),
        apiFetch(`/api/vehicles/${vehicleId}/fuel`),
        apiFetch("/api/wallets"),
      ])
      if (!vRes.ok) {
        const payload = (await vRes.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || (isBm ? "Kenderaan tidak dijumpai." : "Vehicle not found."))
      }
      const v = (await vRes.json()) as Vehicle
      setVehicle(v)
      setSettingsForm({
        name: v.name || "",
        registration_number: v.registration_number || "",
        brand: v.brand || "",
        model: v.model || "",
        vehicle_type: v.vehicle_type || "car",
        fuel_type: v.fuel_type || "petrol",
        current_odometer: v.current_odometer != null ? String(v.current_odometer) : "",
        notes: v.notes || "",
      })
      if (sRes.ok) setSummary(await sRes.json())
      if (mRes.ok) {
        const rows = await mRes.json()
        setMaintenance(Array.isArray(rows) ? rows : [])
      }
      if (dRes.ok) {
        const rows = await dRes.json()
        setDocuments(Array.isArray(rows) ? rows : [])
      }
      if (fRes.ok) {
        const rows = await fRes.json()
        setFuel(Array.isArray(rows) ? rows : [])
      }
      if (wRes.ok) {
        const rows = await wRes.json()
        const list = Array.isArray(rows) ? (rows as WalletOption[]) : []
        setWallets(list)
        const defaultWalletId = list[0]?.id ? String(list[0].id) : ""
        setFuelForm((f) => (f.wallet_id ? f : { ...f, wallet_id: defaultWalletId }))
        setServiceForm((f) => (f.wallet_id ? f : { ...f, wallet_id: defaultWalletId }))
      }
    } catch (err) {
      showAlertRef.current(
        isBm ? "Ralat" : "Error",
        err instanceof Error ? err.message : "Error",
        "error"
      )
    } finally {
      setLoading(false)
    }
  }, [vehicleId, isBm])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Support old links: ?tab=documents | ?tab=fuel
  useEffect(() => {
    if (loading || !vehicle) return
    const tab = searchParams.get("tab")
    if (tab === "documents" && documentsSectionRef.current) {
      documentsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [loading, vehicle, searchParams])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", {
        detail: { hidden: Boolean(sheet) },
      })
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", {
          detail: { hidden: false },
        })
      )
    }
  }, [sheet])

  useEffect(() => {
    if (!sheet) return

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
  }, [sheet])

  const closeSheet = useCallback(() => {
    setSheet(null)
    setActiveItem(null)
  }, [])
  const sheetSwipe = useSwipeDownToClose(() => closeSheet())

  /** Latest maintenance record per catalog item key */
  const latestByCatalog = useMemo(() => {
    const map = new Map<string, Maintenance>()
    const sorted = [...maintenance].sort((a, b) => {
      const da = a.service_date || ""
      const db = b.service_date || ""
      if (da === db) return Number(b.id) - Number(a.id)
      return db.localeCompare(da)
    })
    for (const row of sorted) {
      const key = matchCatalogKey(row.service_type)
      if (key && !map.has(key)) map.set(key, row)
    }
    return map
  }, [maintenance])

  const groupRows = useMemo(() => {
    const currentOdo = vehicle?.current_odometer
    return MAINTENANCE_GROUPS.map((group) => {
      const rows: MaintenanceRowView[] = group.items.map((item) => {
        const record = latestByCatalog.get(item.key)
        const status = calcMaintenanceStatus({
          currentOdometer: currentOdo,
          nextServiceOdometer: record?.next_service_odometer,
          nextServiceDate: record?.next_service_date,
        })
        return {
          item,
          label: isBm ? item.nameBm : item.name,
          nextLabel: formatNextServiceLabel({
            nextServiceOdometer: record?.next_service_odometer,
            nextServiceDate: record?.next_service_date,
            isBm,
          }),
          status,
          recordId: record?.id ?? null,
        }
      })
      return { group, rows }
    })
  }, [latestByCatalog, vehicle?.current_odometer, isBm])

  const statusCounts = useMemo(() => {
    let overdue = 0
    let dueSoon = 0
    for (const g of groupRows) {
      for (const r of g.rows) {
        if (r.status === "OVERDUE") overdue += 1
        if (r.status === "DUE SOON") dueSoon += 1
      }
    }
    return { overdue, dueSoon }
  }, [groupRows])

  function openServiceForItem(row: MaintenanceRowView) {
    setActiveItem(row)
    const existing = row.recordId
      ? maintenance.find((m) => Number(m.id) === Number(row.recordId))
      : null
    setServiceForm({
      service_type: row.item.name,
      service_date: existing?.service_date || new Date().toISOString().slice(0, 10),
      odometer:
        existing?.odometer != null
          ? String(existing.odometer)
          : vehicle?.current_odometer != null
            ? String(vehicle.current_odometer)
            : "",
      workshop: existing?.workshop || "",
      total_cost: existing?.total_cost != null ? String(existing.total_cost) : "",
      next_service_date: existing?.next_service_date || "",
      next_service_odometer:
        existing?.next_service_odometer != null ? String(existing.next_service_odometer) : "",
      notes: existing?.notes || "",
      wallet_id: serviceForm.wallet_id || (wallets[0]?.id ? String(wallets[0].id) : ""),
      create_transaction: true,
    })
    setSheet("item")
  }

  /** All maintenance records that match a catalog item (for history + delete). */
  function recordsForItem(itemKey: string): Maintenance[] {
    return maintenance
      .filter((m) => matchCatalogKey(m.service_type) === itemKey)
      .sort((a, b) => {
        const da = a.service_date || ""
        const db = b.service_date || ""
        if (da === db) return Number(b.id) - Number(a.id)
        return db.localeCompare(da)
      })
  }

  function openLogService() {
    setActiveItem(null)
    setServiceForm({
      service_type: "",
      service_date: new Date().toISOString().slice(0, 10),
      odometer: vehicle?.current_odometer != null ? String(vehicle.current_odometer) : "",
      workshop: "",
      total_cost: "",
      next_service_date: "",
      next_service_odometer: "",
      notes: "",
      wallet_id: serviceForm.wallet_id || (wallets[0]?.id ? String(wallets[0].id) : ""),
      create_transaction: true,
    })
    setSheet("service")
  }

  function openOdometer() {
    setOdoForm({
      reading_date: new Date().toISOString().slice(0, 10),
      odometer: vehicle?.current_odometer != null ? String(vehicle.current_odometer) : "",
    })
    setSheet("odometer")
  }

  function openSettings() {
    if (!vehicle) return
    setSettingsForm({
      name: vehicle.name || "",
      registration_number: vehicle.registration_number || "",
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      vehicle_type: vehicle.vehicle_type || "car",
      fuel_type: vehicle.fuel_type || "petrol",
      current_odometer: vehicle.current_odometer != null ? String(vehicle.current_odometer) : "",
      notes: vehicle.notes || "",
    })
    setSheet("settings")
  }

  function openDocumentForm() {
    setDocForm({
      doc_type: "road_tax",
      title: "",
      expiry_date: "",
      provider: "",
      amount: "",
      reference_number: "",
      notes: "",
      file: null,
    })
    setSheet("document")
  }

  function openFuelForm() {
    setFuelForm({
      log_date: new Date().toISOString().slice(0, 10),
      odometer: vehicle?.current_odometer != null ? String(vehicle.current_odometer) : "",
      litres: "",
      total_amount: "",
      station: "",
      is_full_tank: true,
      wallet_id: fuelForm.wallet_id || (wallets[0]?.id ? String(wallets[0].id) : ""),
      create_transaction: true,
      receipt: null,
    })
    setSheet("fuel")
  }

  async function uploadR2File(url: string, file: File, key: string) {
    setUploadingKey(key)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await apiFetch(url, { method: "POST", body: formData })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal muat naik fail.", "Failed to upload file."))
      }
      return res.json()
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleCreateDocument(e: React.FormEvent) {
    e.preventDefault()
    if (!docForm.title.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Tajuk wajib.", "Title is required."), "error")
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          doc_type: docForm.doc_type,
          title: docForm.title.trim(),
          expiry_date: docForm.expiry_date || null,
          provider: docForm.provider || null,
          amount: docForm.amount ? Number(docForm.amount) : null,
          reference_number: docForm.reference_number || null,
          notes: docForm.notes || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan dokumen.", "Failed to save document."))
      }
      const created = (await res.json()) as VehicleDocument
      if (docForm.file && created?.id) {
        await uploadR2File(
          `/api/vehicles/${vehicleId}/documents/${created.id}/file`,
          docForm.file,
          `documents-${created.id}`
        )
      }
      closeSheet()
      await loadAll()
      showAlert(tr("Berjaya", "Success"), tr("Dokumen disimpan.", "Document saved."), "success")
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateFuel(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(fuelForm.total_amount)
    const createTxn = Boolean(fuelForm.create_transaction) && amount > 0
    if (createTxn && !fuelForm.wallet_id) {
      showAlert(
        tr("Pilih wallet", "Select wallet"),
        tr("Pilih wallet untuk cipta transaksi budget.", "Select a wallet to create a budget transaction."),
        "error"
      )
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/fuel`, {
        method: "POST",
        body: JSON.stringify({
          log_date: fuelForm.log_date,
          odometer: fuelForm.odometer ? Number(fuelForm.odometer) : null,
          litres: fuelForm.litres ? Number(fuelForm.litres) : null,
          total_amount: amount,
          station: fuelForm.station || null,
          is_full_tank: fuelForm.is_full_tank,
          wallet_id: fuelForm.wallet_id ? Number(fuelForm.wallet_id) : null,
          create_transaction: createTxn,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan minyak.", "Failed to save fuel log."))
      }
      const created = (await res.json()) as FuelLog
      if (fuelForm.receipt && created?.id) {
        await uploadR2File(
          `/api/vehicles/${vehicleId}/fuel/${created.id}/receipt`,
          fuelForm.receipt,
          `fuel-${created.id}`
        )
      }
      closeSheet()
      await loadAll()
      showAlert(
        tr("Berjaya", "Success"),
        createTxn
          ? tr("Minyak direkod + transaksi wallet dicipta.", "Fuel logged + wallet transaction created.")
          : tr("Rekod minyak disimpan.", "Fuel log saved."),
        "success"
      )
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
    } finally {
      setSaving(false)
    }
  }

  function confirmDeleteDocument(doc: VehicleDocument) {
    showConfirm(
      tr("Padam dokumen?", "Delete document?"),
      tr(
        `Padam "${doc.title}"? Fail R2 berkaitan turut dibuang.`,
        `Delete "${doc.title}"? Related R2 file will also be removed.`
      ),
      () => {
        void (async () => {
          setSaving(true)
          try {
            const res = await apiFetch(`/api/vehicles/${vehicleId}/documents/${doc.id}`, {
              method: "DELETE",
            })
            if (!res.ok) throw new Error(tr("Gagal padam.", "Failed to delete."))
            await loadAll()
            showAlert(tr("Dipadam", "Deleted"), tr("Dokumen dipadam.", "Document deleted."), "success")
          } catch (err) {
            showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
          } finally {
            setSaving(false)
          }
        })()
      },
      "warning"
    )
  }

  function confirmDeleteMaintenance(recordId: number, label?: string) {
    showConfirm(
      tr("Padam rekod servis?", "Delete service record?"),
      tr(
        `Padam rekod${label ? ` "${label}"` : ""}? Status seterusnya akan dikira semula.`,
        `Delete this service record${label ? ` for "${label}"` : ""}? Next-service status will be recalculated.`
      ),
      () => {
        void (async () => {
          setSaving(true)
          try {
            const res = await apiFetch(`/api/vehicles/${vehicleId}/maintenance/${recordId}`, {
              method: "DELETE",
            })
            if (!res.ok) throw new Error(tr("Gagal padam.", "Failed to delete."))
            closeSheet()
            await loadAll()
            showAlert(tr("Dipadam", "Deleted"), tr("Rekod servis dipadam.", "Service record deleted."), "success")
          } catch (err) {
            showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
          } finally {
            setSaving(false)
          }
        })()
      },
      "warning"
    )
  }

  function confirmDeleteFuel(row: FuelLog) {
    showConfirm(
      tr("Padam rekod minyak?", "Delete fuel log?"),
      tr(
        `Padam rekod ${row.log_date} (RM ${Number(row.total_amount || 0).toFixed(2)})?`,
        `Delete log on ${row.log_date} (RM ${Number(row.total_amount || 0).toFixed(2)})?`
      ),
      () => {
        void (async () => {
          setSaving(true)
          try {
            const res = await apiFetch(`/api/vehicles/${vehicleId}/fuel/${row.id}`, {
              method: "DELETE",
            })
            if (!res.ok) throw new Error(tr("Gagal padam.", "Failed to delete."))
            await loadAll()
            showAlert(tr("Dipadam", "Deleted"), tr("Rekod minyak dipadam.", "Fuel log deleted."), "success")
          } catch (err) {
            showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
          } finally {
            setSaving(false)
          }
        })()
      },
      "warning"
    )
  }

  function confirmDeleteVehicle() {
    if (!vehicle) return
    showConfirm(
      tr("Padam kenderaan?", "Delete vehicle?"),
      tr(
        `Padam "${vehicle.name}"? Semua rekod akan dibuang.`,
        `Delete "${vehicle.name}"? All records will be removed.`
      ),
      () => {
        void (async () => {
          setSaving(true)
          try {
            const res = await apiFetch(`/api/vehicles/${vehicleId}`, { method: "DELETE" })
            if (!res.ok) throw new Error(tr("Gagal padam.", "Failed to delete."))
            await invalidateVehicleImageCache(vehicleId)
            showAlert(tr("Dipadam", "Deleted"), tr("Kenderaan dipadam.", "Vehicle deleted."), "success")
            router.push(`/${sessionId}/vehicle`)
          } catch (err) {
            showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
          } finally {
            setSaving(false)
          }
        })()
      },
      "warning"
    )
  }

  async function handleDocFileUpload(docId: number, file: File | null) {
    if (!file) return
    try {
      await uploadR2File(`/api/vehicles/${vehicleId}/documents/${docId}/file`, file, `documents-${docId}`)
      await loadAll()
      showAlert(tr("Berjaya", "Success"), tr("Fail dimuat naik ke R2.", "File uploaded to R2."), "success")
    } catch (err) {
      showAlert(tr("Gagal upload", "Upload failed"), err instanceof Error ? err.message : "Error", "error")
    }
  }

  function docTypeLabel(docType: string) {
    if (docType === "road_tax") return tr("Road tax", "Road tax")
    if (docType === "insurance") return tr("Insurans", "Insurance")
    return tr("Lain", "Other")
  }

  function docExpiryTone(expiry?: string | null) {
    if (!expiry) return "muted"
    const d = new Date(`${expiry}T00:00:00`)
    if (Number.isNaN(d.getTime())) return "muted"
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (days < 0) return "overdue"
    if (days <= 30) return "soon"
    return "ok"
  }

  async function handleOdometer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/odometer`, {
        method: "POST",
        body: JSON.stringify({
          reading_date: odoForm.reading_date,
          odometer: Number(odoForm.odometer),
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal kemas kini odometer.", "Failed to update odometer."))
      }
      closeSheet()
      await loadAll()
      showAlert(tr("Berjaya", "Success"), tr("Odometer dikemas kini.", "Odometer updated."), "success")
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleService(e: React.FormEvent) {
    e.preventDefault()
    if (!serviceForm.service_type.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Jenis servis wajib.", "Service type is required."), "error")
      return
    }
    const cost = Number(serviceForm.total_cost || 0)
    const createTxn = Boolean(serviceForm.create_transaction) && cost > 0
    if (createTxn && !serviceForm.wallet_id) {
      showAlert(
        tr("Pilih wallet", "Select wallet"),
        tr("Pilih wallet untuk cipta transaksi budget.", "Select a wallet to create a budget transaction."),
        "error"
      )
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}/maintenance`, {
        method: "POST",
        body: JSON.stringify({
          service_type: serviceForm.service_type.trim(),
          service_date: serviceForm.service_date,
          odometer: serviceForm.odometer ? Number(serviceForm.odometer) : null,
          workshop: serviceForm.workshop || null,
          total_cost: serviceForm.total_cost ? Number(serviceForm.total_cost) : null,
          next_service_date: serviceForm.next_service_date || null,
          next_service_odometer: serviceForm.next_service_odometer
            ? Number(serviceForm.next_service_odometer)
            : null,
          notes: serviceForm.notes || null,
          wallet_id: serviceForm.wallet_id ? Number(serviceForm.wallet_id) : null,
          create_transaction: createTxn,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan servis.", "Failed to save service."))
      }
      closeSheet()
      await loadAll()
      showAlert(
        tr("Berjaya", "Success"),
        createTxn
          ? tr("Servis direkod + transaksi wallet dicipta.", "Service logged + wallet transaction created.")
          : tr("Servis direkod.", "Service logged."),
        "success"
      )
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!settingsForm.name.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete"), tr("Nama wajib.", "Name is required."), "error")
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: settingsForm.name.trim(),
          registration_number: settingsForm.registration_number.trim() || null,
          brand: settingsForm.brand.trim() || null,
          model: settingsForm.model.trim() || null,
          vehicle_type: settingsForm.vehicle_type || null,
          fuel_type: settingsForm.fuel_type || null,
          current_odometer: settingsForm.current_odometer
            ? Number(settingsForm.current_odometer)
            : null,
          notes: settingsForm.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan.", "Failed to save."))
      }
      closeSheet()
      await loadAll()
      showAlert(tr("Berjaya", "Success"), tr("Kenderaan dikemas kini.", "Vehicle updated."), "success")
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "Error", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleImagePick(file: File | null) {
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await apiFetch(`/api/vehicles/${vehicleId}/image`, {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal muat naik gambar.", "Failed to upload image."))
      }
      // Drop old local cache so next paint uses the new R2 object
      await invalidateVehicleImageCache(vehicleId)
      setImageBust(Date.now())
      await loadAll()
    } catch (err) {
      showAlert(tr("Gagal upload", "Upload failed"), err instanceof Error ? err.message : "Error", "error")
    } finally {
      setUploadingImage(false)
    }
  }

  if (loading && !vehicle) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="animate-spin text-[var(--muted)]" />
      </div>
    )
  }

  if (!vehicle) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm font-bold text-[var(--text)]">
          {tr("Kenderaan tidak dijumpai", "Vehicle not found")}
        </p>
        <button
          type="button"
          onClick={() => router.push(`/${sessionId}/vehicle`)}
          className="mt-4 text-sm font-bold text-[var(--accent2)]"
        >
          {tr("Kembali", "Back")}
        </button>
      </div>
    )
  }

  const sheetTitle =
    sheet === "odometer"
      ? tr("Kemas kini odometer", "Update odometer")
      : sheet === "settings"
        ? tr("Tetapan kenderaan", "Vehicle settings")
        : sheet === "document"
          ? tr("Tambah dokumen", "Add document")
          : sheet === "fuel"
            ? tr("Rekod minyak", "Fuel log")
            : sheet === "item"
              ? activeItem?.label || tr("Log servis", "Log service")
              : tr("Log servis", "Log service")

  return (
    <div className="min-h-[70vh] w-full bg-[var(--page-bg)]">
      <div className="hidden md:block">
        <DesktopPageHeader
          title={vehicle.name}
          breadcrumbs={[{ label: tr("Kenderaan", "My Vehicle"), href: `/${sessionId}/vehicle` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/vehicle`}
          actions={(
            <button
              type="button"
              disabled={saving}
              onClick={confirmDeleteVehicle}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-2.5 text-xs font-bold text-rose-600 transition active:scale-95 disabled:opacity-60 dark:text-rose-400"
            >
              <Trash2 size={15} />
              {tr("Padam", "Delete")}
            </button>
          )}
        />
      </div>
      <div className="mx-auto w-full space-y-4 px-1 pb-24 pt-0 md:max-w-6xl md:space-y-4 md:px-6 md:pb-16 lg:max-w-7xl">
        <div className="space-y-5 md:hidden">
          <MobilePageHeader
            title={vehicle.name}
            fallbackHref={`/${sessionId}/vehicle`}
            backPreferHistory
            action={(
              <button
                type="button"
                disabled={saving}
                onClick={confirmDeleteVehicle}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-2.5 text-xs font-bold text-rose-600 transition active:scale-95 disabled:opacity-60 dark:text-rose-400"
                aria-label={tr("Padam kenderaan", "Delete vehicle")}
              >
                <Trash2 size={15} />
                <span className="hidden sm:inline">{tr("Padam", "Delete")}</span>
              </button>
            )}
          />
        </div>

        {/* Full-width hero (desktop spans entire page) */}
        <VehicleHeroCard
          vehicle={vehicle}
          imageBust={imageBust}
          isBm={isBm}
          uploadingImage={uploadingImage}
          onSettings={openSettings}
          onImagePick={handleImagePick}
        />

        {/* Content below hero: mobile single column; desktop 2-col */}
        <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="space-y-4">
            <VehicleQuickActions
              isBm={isBm}
              onUpdateOdometer={openOdometer}
              onLogService={openLogService}
            />

            <VehicleSummaryCard
              isBm={isBm}
              monthKey={summary?.month_key}
              totalCost={Number(summary?.total_cost || 0)}
              fuelCost={Number(summary?.fuel_cost || 0)}
              maintenanceCost={Number(summary?.maintenance_cost || 0)}
              overdueCount={statusCounts.overdue}
              dueSoonCount={statusCounts.dueSoon}
            />

            {/* Documents — road tax / insurance / files (R2) */}
            <section
              ref={documentsSectionRef}
              id="vehicle-documents"
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)] sm:p-5"
            >
              <div className="mb-3.5 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black tracking-tight text-[var(--text)]">
                      {tr("Dokumen", "Documents")}
                    </h2>
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      {tr("Road tax, insurans & fail R2", "Road tax, insurance & R2 files")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openDocumentForm}
                  className="inline-flex h-9 items-center gap-1 rounded-full bg-[var(--text)] px-3 text-[0.65rem] font-black uppercase tracking-wide text-[var(--bg)]"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  {tr("Tambah", "Add")}
                </button>
              </div>

              {(summary?.road_tax_expiry || summary?.insurance_expiry) && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {summary?.road_tax_expiry && (
                    <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        Road tax
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-[var(--text)]">{summary.road_tax_expiry}</p>
                    </div>
                  )}
                  {summary?.insurance_expiry && (
                    <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        {tr("Insurans", "Insurance")}
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-[var(--text)]">{summary.insurance_expiry}</p>
                    </div>
                  )}
                </div>
              )}

              {documents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/20 px-4 py-8 text-center">
                  <FileText size={28} className="mx-auto text-[var(--muted)]/40" />
                  <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                    {tr("Tiada dokumen lagi", "No documents yet")}
                  </p>
                  <button
                    type="button"
                    onClick={openDocumentForm}
                    className="mt-3 text-xs font-bold text-[var(--accent2)]"
                  >
                    {tr("Tambah road tax / insurans", "Add road tax / insurance")}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const tone = docExpiryTone(doc.expiry_date)
                    return (
                      <div
                        key={doc.id}
                        className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/25 p-3"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--accent2)]">
                          <FileText size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--text)]">{doc.title}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                            {docTypeLabel(doc.doc_type)}
                            {doc.provider ? ` · ${doc.provider}` : ""}
                            {doc.amount != null
                              ? ` · RM ${Number(doc.amount).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`
                              : ""}
                          </p>
                          {doc.expiry_date && (
                            <p
                              className={cn(
                                "mt-1 text-[11px] font-bold",
                                tone === "overdue" && "text-rose-600 dark:text-rose-400",
                                tone === "soon" && "text-amber-700 dark:text-amber-300",
                                tone === "ok" && "text-[var(--muted)]",
                                tone === "muted" && "text-[var(--muted)]"
                              )}
                            >
                              {tr("Tamat", "Expires")}: {doc.expiry_date}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {doc.file_attachment_id ? (
                            <a
                              href={`/api/vehicles/attachments/${doc.file_attachment_id}/file`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg p-1.5 text-[var(--accent2)]"
                              title={tr("Lihat fail", "View file")}
                            >
                              <ExternalLink size={14} />
                            </a>
                          ) : null}
                          <label
                            className={cn(
                              "cursor-pointer rounded-lg p-1.5 text-[var(--muted)]",
                              uploadingKey === `documents-${doc.id}` && "opacity-50"
                            )}
                            title={tr("Upload fail R2", "Upload R2 file")}
                          >
                            {uploadingKey === `documents-${doc.id}` ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Paperclip size={14} />
                            )}
                            <input
                              type="file"
                              accept={R2_ACCEPT}
                              className="hidden"
                              onChange={(e) => {
                                void handleDocFileUpload(doc.id, e.target.files?.[0] || null)
                                e.currentTarget.value = ""
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => confirmDeleteDocument(doc)}
                            className="rounded-lg p-1.5 text-[var(--muted)]"
                            title={tr("Padam", "Delete")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Fuel logs (compact) */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)] sm:p-5">
              <div className="mb-3.5 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
                    <Fuel size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black tracking-tight text-[var(--text)]">
                      {tr("Minyak", "Fuel")}
                    </h2>
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      {tr("Rekod isi minyak", "Fuel fill-up logs")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openFuelForm}
                  className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-[0.65rem] font-black uppercase tracking-wide text-[var(--text)]"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  {tr("Tambah", "Add")}
                </button>
              </div>
              {fuel.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm font-semibold text-[var(--muted)]">
                  {tr("Tiada rekod minyak", "No fuel logs")}
                </p>
              ) : (
                <div className="space-y-2">
                  {fuel.slice(0, 8).map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/25 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--text)]">
                          RM {Number(row.total_amount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] font-semibold text-[var(--muted)]">
                          {row.log_date}
                          {row.litres != null ? ` · ${row.litres} L` : ""}
                          {row.station ? ` · ${row.station}` : ""}
                        </p>
                        {row.transaction_reference_id || row.transaction_id ? (
                          <a
                            href={`/${sessionId}/transactions/${row.transaction_reference_id || row.transaction_id}`}
                            className="mt-0.5 inline-block text-[10px] font-bold text-[var(--accent2)] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.transaction_reference_id || `TXN-${row.transaction_id}`}
                          </a>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {row.receipt_attachment_id ? (
                          <a
                            href={`/api/vehicles/attachments/${row.receipt_attachment_id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg p-1.5 text-[var(--accent2)]"
                          >
                            <ExternalLink size={14} />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => confirmDeleteFuel(row)}
                          className="rounded-lg p-1.5 text-[var(--muted)]"
                          title={tr("Padam", "Delete")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-3.5">
            <div className="flex items-end justify-between gap-3 px-0.5">
              <div>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
                  {tr("Penyelenggaraan", "Maintenance")}
                </p>

              </div>
            </div>

            {groupRows.map(({ group, rows }) => (
              <MaintenanceGroupCard
                key={group.key}
                group={group}
                isBm={isBm}
                rows={rows}
                onItemClick={openServiceForItem}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Sheets */}
      {mounted &&
        sheet &&
        createPortal(
          <div className="fixed inset-0 z-[140] flex h-[100dvh] w-screen touch-none items-end justify-center overscroll-none bg-transparent p-0 md:items-center md:p-4">
            <div
              data-swipe-sheet
              className="app-sheet-panel flex max-h-[82dvh] w-full flex-col overflow-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl touch-pan-y md:max-h-[85vh] md:max-w-[30rem] md:rounded-2xl"
              {...sheetSwipe}
            >
              <AppSheetHeader
                title={sheetTitle}
                onClose={closeSheet}
                action={
                  <button
                    type="submit"
                    form={sheet === "odometer"
                      ? "vehicle-odo-form"
                      : sheet === "settings"
                        ? "vehicle-settings-form"
                        : sheet === "document"
                          ? "vehicle-doc-form"
                          : sheet === "fuel"
                            ? "vehicle-fuel-form"
                            : "vehicle-service-form"}
                    disabled={saving}
                    className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                  >
                    {saving ? (isBm ? "Menyimpan…" : "Saving…") : tr("Simpan", "Save")}
                  </button>
                }
              />

              <div data-swipe-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                {sheet === "odometer" && (
                  <form id="vehicle-odo-form" onSubmit={handleOdometer} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={tr("Tarikh", "Date")}>
                        <input
                          type="date"
                          required
                          value={odoForm.reading_date}
                          onChange={(e) => setOdoForm({ ...odoForm, reading_date: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Odometer (KM)">
                        <input
                          type="number"
                          required
                          value={odoForm.odometer}
                          onChange={(e) => setOdoForm({ ...odoForm, odometer: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  </form>
                )}

                {(sheet === "service" || sheet === "item") && (
                  <form id="vehicle-service-form" onSubmit={handleService} className="space-y-3">
                    {sheet === "item" && activeItem && (() => {
                      const history = recordsForItem(activeItem.item.key)
                      if (!history.length) return null
                      return (
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
                          <p className="text-[11px] font-black uppercase tracking-wide text-[var(--muted)]">
                            {tr("Rekod sedia ada", "Existing records")}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
                            {tr(
                              "Kalau salah set, padam rekod di bawah.",
                              "If set wrongly, delete the record below."
                            )}
                          </p>
                          <div className="mt-2 space-y-2">
                            {history.map((rec) => (
                              <div
                                key={rec.id}
                                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[var(--text)]">
                                    {rec.service_date}
                                    {rec.next_service_odometer != null
                                      ? ` · next ${Number(rec.next_service_odometer).toLocaleString()} km`
                                      : ""}
                                    {rec.next_service_date ? ` · ${rec.next_service_date}` : ""}
                                  </p>
                                  {rec.workshop ? (
                                    <p className="truncate text-[10px] font-semibold text-[var(--muted)]">
                                      {rec.workshop}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    confirmDeleteMaintenance(rec.id, activeItem.label)
                                  }
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-600 dark:text-rose-400"
                                >
                                  <Trash2 size={12} />
                                  {tr("Padam", "Delete")}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    <Field label={tr("Jenis servis", "Service type")} className="col-span-2">
                      {sheet === "item" ? (
                        <input
                          readOnly
                          value={serviceForm.service_type}
                          className={inputCls}
                        />
                      ) : (
                        <select
                          required
                          value={serviceForm.service_type}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, service_type: e.target.value })
                          }
                          className={inputCls}
                        >
                          <option value="">{tr("Pilih item", "Select item")}</option>
                          {MAINTENANCE_GROUPS.flatMap((g) =>
                            g.items.map((item) => (
                              <option key={item.key} value={item.name}>
                                {(isBm ? g.titleBm : g.title) + " · " + (isBm ? item.nameBm : item.name)}
                              </option>
                            ))
                          )}
                        </select>
                      )}
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label={tr("Tarikh", "Date")}>
                        <input
                          type="date"
                          required
                          value={serviceForm.service_date}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, service_date: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Odometer (KM)">
                        <input
                          type="number"
                          value={serviceForm.odometer}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, odometer: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Bengkel", "Workshop")}>
                        <input
                          value={serviceForm.workshop}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, workshop: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Kos (RM)", "Cost (RM)")}>
                        <input
                          type="number"
                          step="0.01"
                          value={serviceForm.total_cost}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, total_cost: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Seterusnya (tarikh)", "Next date")}>
                        <input
                          type="date"
                          value={serviceForm.next_service_date}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, next_service_date: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Seterusnya (KM)", "Next KM")}>
                        <input
                          type="number"
                          value={serviceForm.next_service_odometer}
                          onChange={(e) =>
                            setServiceForm({
                              ...serviceForm,
                              next_service_odometer: e.target.value,
                            })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Wallet", "Wallet")} className="col-span-2 sm:col-span-1">
                        <select
                          value={serviceForm.wallet_id}
                          onChange={(e) =>
                            setServiceForm({ ...serviceForm, wallet_id: e.target.value })
                          }
                          className={inputCls}
                        >
                          <option value="">{tr("Pilih wallet", "Select wallet")}</option>
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.label || w.name || `Wallet ${w.id}`}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="col-span-2 flex items-center gap-2 self-end rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/25 px-3 py-2.5 text-sm font-semibold text-[var(--text)] sm:col-span-1">
                        <input
                          type="checkbox"
                          checked={serviceForm.create_transaction}
                          onChange={(e) =>
                            setServiceForm({
                              ...serviceForm,
                              create_transaction: e.target.checked,
                            })
                          }
                        />
                        {tr("Cipta transaksi", "Create transaction")}
                      </label>
                    </div>

                    <Field label={tr("Nota", "Notes")}>
                      <textarea
                        rows={2}
                        value={serviceForm.notes}
                        onChange={(e) =>
                          setServiceForm({ ...serviceForm, notes: e.target.value })
                        }
                        className={inputCls}
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sheet === "item" && activeItem?.recordId ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            confirmDeleteMaintenance(
                              Number(activeItem.recordId),
                              activeItem.label
                            )
                          }
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 py-3 text-sm font-bold text-rose-600 dark:text-rose-400 disabled:opacity-60"
                        >
                          <Trash2 size={15} />
                          {tr("Padam rekod", "Delete record")}
                        </button>
                      ) : null}
                    </div>
                  </form>
                )}

                {sheet === "document" && (
                  <form id="vehicle-doc-form" onSubmit={handleCreateDocument} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={tr("Jenis", "Type")}>
                        <select
                          value={docForm.doc_type}
                          onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                          className={inputCls}
                        >
                          <option value="road_tax">Road tax</option>
                          <option value="insurance">{tr("Insurans", "Insurance")}</option>
                          <option value="other">{tr("Lain", "Other")}</option>
                        </select>
                      </Field>
                      <Field label={tr("Tarikh tamat", "Expiry date")}>
                        <input
                          type="date"
                          value={docForm.expiry_date}
                          onChange={(e) => setDocForm({ ...docForm, expiry_date: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Tajuk", "Title")} className="col-span-2">
                        <input
                          required
                          value={docForm.title}
                          onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                          className={inputCls}
                          placeholder={
                            docForm.doc_type === "road_tax"
                              ? "Road tax 2026"
                              : docForm.doc_type === "insurance"
                                ? "Takaful comprehensive"
                                : "Document"
                          }
                        />
                      </Field>
                      <Field label={tr("Penyedia", "Provider")}>
                        <input
                          value={docForm.provider}
                          onChange={(e) => setDocForm({ ...docForm, provider: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Jumlah (RM)", "Amount (RM)")}>
                        <input
                          type="number"
                          step="0.01"
                          value={docForm.amount}
                          onChange={(e) => setDocForm({ ...docForm, amount: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("No. rujukan / polisi", "Reference / policy")} className="col-span-2">
                        <input
                          value={docForm.reference_number}
                          onChange={(e) =>
                            setDocForm({ ...docForm, reference_number: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Fail (R2)", "File (R2)")} className="col-span-2">
                        <input
                          type="file"
                          accept={R2_ACCEPT}
                          onChange={(e) =>
                            setDocForm({ ...docForm, file: e.target.files?.[0] || null })
                          }
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text)] file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--text)] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[var(--bg)]"
                        />
                        {docForm.file ? (
                          <p className="mt-1 truncate text-[11px] font-semibold text-[var(--accent2)]">
                            {docForm.file.name}
                          </p>
                        ) : null}
                      </Field>
                    </div>
                  </form>
                )}

                {sheet === "fuel" && (
                  <form id="vehicle-fuel-form" onSubmit={handleCreateFuel} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={tr("Tarikh", "Date")}>
                        <input
                          type="date"
                          required
                          value={fuelForm.log_date}
                          onChange={(e) => setFuelForm({ ...fuelForm, log_date: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Odometer (KM)">
                        <input
                          type="number"
                          value={fuelForm.odometer}
                          onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Jumlah (RM)", "Amount (RM)")}>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={fuelForm.total_amount}
                          onChange={(e) =>
                            setFuelForm({ ...fuelForm, total_amount: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Litres">
                        <input
                          type="number"
                          step="0.001"
                          value={fuelForm.litres}
                          onChange={(e) => setFuelForm({ ...fuelForm, litres: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Stesen", "Station")} className="col-span-2">
                        <input
                          value={fuelForm.station}
                          onChange={(e) => setFuelForm({ ...fuelForm, station: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Wallet", "Wallet")}>
                        <select
                          value={fuelForm.wallet_id}
                          onChange={(e) => setFuelForm({ ...fuelForm, wallet_id: e.target.value })}
                          className={inputCls}
                        >
                          <option value="">{tr("Pilih wallet", "Select wallet")}</option>
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.label || w.name || `Wallet ${w.id}`}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="flex flex-col justify-end gap-2">
                        <label className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/25 px-3 py-2.5 text-sm font-semibold text-[var(--text)]">
                          <input
                            type="checkbox"
                            checked={fuelForm.is_full_tank}
                            onChange={(e) =>
                              setFuelForm({ ...fuelForm, is_full_tank: e.target.checked })
                            }
                          />
                          {tr("Tangki penuh", "Full tank")}
                        </label>
                        <label className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/25 px-3 py-2.5 text-sm font-semibold text-[var(--text)]">
                          <input
                            type="checkbox"
                            checked={fuelForm.create_transaction}
                            onChange={(e) =>
                              setFuelForm({ ...fuelForm, create_transaction: e.target.checked })
                            }
                          />
                          {tr("Cipta transaksi", "Create transaction")}
                        </label>
                      </div>
                      <Field label={tr("Resit (R2)", "Receipt (R2)")} className="col-span-2">
                        <input
                          type="file"
                          accept={R2_ACCEPT}
                          onChange={(e) =>
                            setFuelForm({ ...fuelForm, receipt: e.target.files?.[0] || null })
                          }
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text)] file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--text)] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[var(--bg)]"
                        />
                      </Field>
                    </div>
                  </form>
                )}

                {sheet === "settings" && (
                  <form id="vehicle-settings-form" onSubmit={handleSettings} className="space-y-3 pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={tr("Nama", "Name")}>
                        <input
                          required
                          value={settingsForm.name}
                          onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("No. pendaftaran", "Registration")}>
                        <input
                          value={settingsForm.registration_number}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              registration_number: e.target.value,
                            })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Jenama", "Brand")}>
                        <input
                          value={settingsForm.brand}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, brand: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Model">
                        <input
                          value={settingsForm.model}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, model: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Jenis", "Type")}>
                        <select
                          value={settingsForm.vehicle_type}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, vehicle_type: e.target.value })
                          }
                          className={inputCls}
                        >
                          <option value="car">Car</option>
                          <option value="motorcycle">Motorcycle</option>
                          <option value="van">Van</option>
                          <option value="other">Other</option>
                        </select>
                      </Field>
                      <Field label={tr("Bahan api", "Fuel")}>
                        <select
                          value={settingsForm.fuel_type}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, fuel_type: e.target.value })
                          }
                          className={inputCls}
                        >
                          <option value="petrol">Petrol</option>
                          <option value="diesel">Diesel</option>
                          <option value="hybrid">Hybrid</option>
                          <option value="ev">EV</option>
                        </select>
                      </Field>
                      <Field label="Odometer (KM)" className="col-span-2 sm:col-span-1">
                        <input
                          type="number"
                          value={settingsForm.current_odometer}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              current_odometer: e.target.value,
                            })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label={tr("Nota", "Notes")} className="col-span-2">
                        <textarea
                          rows={2}
                          value={settingsForm.notes}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, notes: e.target.value })
                          }
                          className={inputCls}
                        />
                      </Field>
                    </div>
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3">
                      <p className="text-[11px] font-semibold text-rose-600/90 dark:text-rose-400/90">
                        {tr(
                          "Padam kenderaan akan buang semua rekod.",
                          "Deleting removes all records."
                        )}
                      </p>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={confirmDeleteVehicle}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/15 py-3 text-sm font-bold text-rose-600 dark:text-rose-400 disabled:opacity-60"
                      >
                        <Trash2 size={15} />
                        {tr("Padam kenderaan", "Delete vehicle")}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {alertModal}
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-xs font-bold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  )
}

