"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRightLeft, ChevronRight, Loader2, Package, Pencil, Plus, Trash2, X } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { MobilePageHeader, DesktopPageHeader, DesktopPageBody } from "@/components/layout/PageHeader"

type InvStatus = "available" | "loaned" | "missing" | "damaged" | "disposed" | "used_up"

type InvItem = {
  id: number
  name: string
  description?: string | null
  category?: string | null
  quantity: number
  unit: string
  status: InvStatus
  status_label: string
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  purchase_date?: string | null
  purchase_price?: number | null
  has_image?: boolean
  location_id?: number | null
  container_id?: number | null
  location_path?: string | null
  container_name?: string | null
  transaction_id?: number | null
  warranty_id?: number | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type InvLocation = { id: number; name: string }
type InvContainer = { id: number; name: string; location_id: number | null }

type Movement = {
  id: number
  movement_type: string
  quantity_before?: number | null
  quantity_after?: number | null
  status_before?: string | null
  status_after?: string | null
  notes?: string | null
  source_channel?: string | null
  moved_at?: string | null
}

const STATUS_OPTIONS: { value: InvStatus; bm: string }[] = [
  { value: "available", bm: "Ada" },
  { value: "loaned", bm: "Dipinjam" },
  { value: "missing", bm: "Hilang" },
  { value: "damaged", bm: "Rosak" },
  { value: "disposed", bm: "Dibuang" },
  { value: "used_up", bm: "Sudah Habis" },
]

const MOVEMENT_LABEL: Record<string, string> = {
  created: "Dicipta",
  moved: "Dipindah",
  quantity_changed: "Kuantiti berubah",
  status_changed: "Status berubah",
}

function fmtDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function InventoryItemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const itemId = params.itemId as string
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) return { Authorization: `Bearer ${token}` }
    return {}
  }, [])

  const [item, setItem] = useState<InvItem | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [locations, setLocations] = useState<InvLocation[]>([])
  const [containers, setContainers] = useState<InvContainer[]>([])
  const [loading, setLoading] = useState(true)
  const [showMove, setShowMove] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, mRes, lRes, cRes] = await Promise.all([
        fetch(`/api/inventory/items/${itemId}`, { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch(`/api/inventory/items/${itemId}/movements`, { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch("/api/inventory/locations", { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch("/api/inventory/containers", { headers: authHeaders(), credentials: "include", cache: "no-store" }),
      ])
      if (!iRes.ok) throw new Error(tr("Barang tidak dijumpai.", "Item not found."))
      setItem(await iRes.json())
      if (mRes.ok) setMovements(await mRes.json())
      if (lRes.ok) setLocations(await lRes.json())
      if (cRes.ok) setContainers(await cRes.json())
    } catch (err) {
      showAlert(tr("Ralat", "Error"), err instanceof Error ? err.message : tr("Gagal muat.", "Failed to load."), "error")
    } finally {
      setLoading(false)
    }
  }, [authHeaders, itemId, showAlert, tr])

  useEffect(() => { load() }, [load])

  const changeQty = useCallback(async (operation: "add" | "subtract", amount: number) => {
    const res = await fetch(`/api/inventory/items/${itemId}/quantity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ operation, amount }),
    })
    if (res.ok) load()
    else {
      const p = await res.json().catch(() => null)
      showAlert(tr("Ralat", "Error"), p?.detail || tr("Kuantiti tidak boleh negatif.", "Quantity cannot be negative."), "error")
    }
  }, [authHeaders, itemId, load, showAlert, tr])

  const changeStatus = useCallback(async (status: InvStatus) => {
    if (status === "disposed" || status === "used_up") {
      const label = STATUS_OPTIONS.find((s) => s.value === status)?.bm || status
      showConfirm(
        tr(`Tetapkan sebagai ${label}?`, `Set as ${label}?`),
        tr("Perubahan status direkodkan kekal.", "Status change is recorded permanently."),
        async () => {
          await fetch(`/api/inventory/items/${itemId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            credentials: "include",
            body: JSON.stringify({ status }),
          })
          load()
        },
        "warning",
      )
      return
    }
    await fetch(`/api/inventory/items/${itemId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ status }),
    })
    load()
  }, [authHeaders, itemId, load, showConfirm, tr])

  const deleteItem = useCallback(() => {
    showConfirm(
      tr(`Padam ${item?.name}?`, `Delete ${item?.name}?`),
      tr("Rekod akan disembunyikan daripada senarai.", "Record will be hidden from the list."),
      async () => {
        const res = await fetch(`/api/inventory/items/${itemId}`, { method: "DELETE", headers: authHeaders(), credentials: "include" })
        if (res.ok) router.push(`/${sessionId}/inventory`)
      },
      "warning",
    )
  }, [authHeaders, itemId, item?.name, router, sessionId, showConfirm, tr])

  const rows = useMemo(() => {
    if (!item) return []
    return [
      { label: tr("Kategori", "Category"), value: item.category || "—" },
      { label: tr("Jenama", "Brand"), value: item.brand || "—" },
      { label: tr("Model", "Model"), value: item.model || "—" },
      { label: tr("No. siri", "Serial number"), value: item.serial_number || "—" },
      { label: tr("Tarikh pembelian", "Purchase date"), value: item.purchase_date || "—" },
      { label: tr("Harga pembelian", "Purchase price"), value: item.purchase_price != null ? `RM ${Number(item.purchase_price).toFixed(2)}` : "—" },
      { label: tr("Lokasi", "Location"), value: item.location_path || tr("Tiada lokasi", "No location") },
      { label: tr("Bekas", "Box"), value: item.container_name || "—" },
      { label: tr("Dikemas kini", "Updated"), value: fmtDate(item.updated_at) },
      ...(item.notes ? [{ label: tr("Nota", "Notes"), value: item.notes }] : []),
    ]
  }, [item, tr])

  if (loading && !item) {
    return (
      <div className="flex min-h-[50vh] justify-center items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
      </div>
    )
  }
  if (!item) return null

  return (
    <>
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader
          title={item.name}
          fallbackHref={`/${sessionId}/inventory`}
          backPreferHistory
        />
      </div>
      <DesktopPageHeader
        title={item.name}
        breadcrumbs={[{ label: tr("Barang Saya", "My Inventory"), href: `/${sessionId}/inventory` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/inventory`}
        backPreferHistory
        className="hidden md:block"
      />
      <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-24">
          {/* header card */}
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] overflow-hidden">
              {item.has_image ? (
                <img src={`/api/inventory/items/${item.id}/image`} alt={item.name} className="h-16 w-16 object-cover" />
              ) : (
                <Package className="h-7 w-7 text-[var(--muted)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">{item.name}</h1>
              <p className="text-sm text-[var(--muted)]">{item.quantity} {item.unit} · {item.status_label}</p>
              {item.location_path && (
                <p className="mt-1 text-xs text-[var(--muted)]">{item.location_path}{item.container_name ? ` → ${item.container_name}` : ""}</p>
              )}
              {item.transaction_id && (
                <a href={`/${sessionId}/transactions/${item.transaction_id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">
                  {tr("Transaksi berkaitan", "Linked transaction")} <ChevronRight className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {/* quantity stepper */}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
            <span className="text-sm font-medium">{tr("Kuantiti", "Quantity")}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => changeQty("subtract", 1)} disabled={item.quantity <= 0} aria-label={tr("Kurang", "Subtract")} className="h-9 w-9 rounded-lg border border-[var(--border)] text-lg font-bold disabled:opacity-40">−</button>
              <span className="min-w-16 text-center font-bold">{item.quantity} {item.unit}</span>
              <button onClick={() => changeQty("add", 1)} aria-label={tr("Tambah", "Add")} className="h-9 w-9 rounded-lg border border-[var(--border)] text-lg font-bold">+</button>
            </div>
          </div>

          {/* status picker */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
            <span className="mb-2 block text-sm font-medium">{tr("Status", "Status")}</span>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => s.value !== item.status && changeStatus(s.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium border transition",
                    s.value === item.status
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)] hover:bg-[var(--surface-tint)]",
                  )}
                >
                  {s.bm}
                </button>
              ))}
            </div>
          </div>

          {/* details */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">{tr("Butiran", "Details")}</h2>
            <dl className="space-y-1.5 text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">{r.label}</dt>
                  <dd className="text-right font-medium break-words max-w-[60%]">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* movement history */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">{tr("Sejarah Pergerakan", "Movement History")}</h2>
            {movements.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tr("Tiada sejarah.", "No history.")}</p>
            ) : (
              <ol className="space-y-2">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <span className="font-medium">{MOVEMENT_LABEL[m.movement_type] || m.movement_type}</span>
                      {(m.quantity_before != null || m.quantity_after != null) && (
                        <span className="ml-2 text-[var(--muted)]">{m.quantity_before ?? "—"} → {m.quantity_after ?? "—"}</span>
                      )}
                      {(m.status_before || m.status_after) && (
                        <span className="ml-2 text-[var(--muted)]">{m.status_before || "—"} → {m.status_after || "—"}</span>
                      )}
                      {m.notes && <span className="block text-xs text-[var(--muted)]">{m.notes}</span>}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--muted)]">{fmtDate(m.moved_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowEdit(true)} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-tint)]">
              <Pencil className="h-4 w-4" /> {tr("Edit", "Edit")}
            </button>
            <button onClick={() => setShowMove(true)} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-tint)]">
              <ArrowRightLeft className="h-4 w-4" /> {tr("Pindahkan", "Move")}
            </button>
            <button onClick={deleteItem} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-500/10">
              <Trash2 className="h-4 w-4" /> {tr("Padam", "Delete")}
            </button>
          </div>
        </div>
      </DesktopPageBody>

      {showMove && (
        <MoveSheet
          item={item}
          locations={locations}
          containers={containers}
          onClose={() => setShowMove(false)}
          onSaved={() => { setShowMove(false); load() }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}
      {showEdit && (
        <EditSheet
          item={item}
          locations={locations}
          containers={containers}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load() }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}
      {alertModal}
    </>
  )
}

// ── move sheet ───────────────────────────────────────────────────────────────

function MoveSheet({ item, locations, containers, onClose, onSaved, authHeaders, tr }: {
  item: InvItem
  locations: InvLocation[]
  containers: InvContainer[]
  onClose: () => void
  onSaved: () => void
  authHeaders: () => HeadersInit
  tr: (bm: string, en: string) => string
}) {
  const [locationId, setLocationId] = useState(item.location_id ? String(item.location_id) : "")
  const [containerId, setContainerId] = useState(item.container_id ? String(item.container_id) : "")
  const [qty, setQty] = useState(String(item.quantity))
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const { showAlert } = usePageAlert("BM")
  const showAlertRef = useRef(showAlert)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])

  const filteredContainers = containers.filter((c) => !locationId || String(c.location_id) === locationId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const q = parseInt(qty, 10) || 0
      const res = await fetch(`/api/inventory/items/${item.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          location_id: locationId ? parseInt(locationId, 10) : null,
          container_id: containerId ? parseInt(containerId, 10) : null,
          quantity: q >= item.quantity ? 0 : q,  // 0 = move all
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => null)
        throw new Error(p?.detail || "Failed")
      }
      onSaved()
    } catch (err) {
      showAlertRef.current(tr("Ralat", "Error"), err instanceof Error ? err.message : tr("Gagal pindah.", "Failed to move."), "error")
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={tr("Pindahkan Barang", "Move Item")}>
      <form onSubmit={submit} className="w-full max-w-md rounded-t-2xl bg-[var(--card)] p-4 sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tr("Pindahkan", "Move")} · {item.name}</h2>
          <button type="button" onClick={onClose} aria-label={tr("Tutup", "Close")} className="rounded-lg p-2 hover:bg-[var(--surface-tint)]"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          {tr("Sekarang", "Current")}: {item.location_path || tr("tiada lokasi", "no location")} · {item.quantity} {item.unit}
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="mv-loc">{tr("Lokasi baharu", "New location")}</label>
            <select id="mv-loc" value={locationId} onChange={(e) => { setLocationId(e.target.value); setContainerId("") }} className={inputCls}>
              <option value="">{tr("— Tiada lokasi —", "— No location —")}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="mv-cont">{tr("Bekas (pilihan)", "Box (optional)")}</label>
            <select id="mv-cont" value={containerId} onChange={(e) => setContainerId(e.target.value)} className={inputCls} disabled={!locationId}>
              <option value="">{tr("— Tiada bekas —", "— No box —")}</option>
              {filteredContainers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="mv-qty">{tr(`Kuantiti dipindah (maks ${item.quantity}; pindah semua = kosongkan)`, `Quantity to move (max ${item.quantity}; empty = move all)`)}</label>
            <input id="mv-qty" type="number" min={0} max={item.quantity} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="mv-notes">{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <input id="mv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} maxLength={500} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--surface-tint)]">{tr("Batal", "Cancel")}</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tr("Pindah", "Move")}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── edit sheet (full fields) ─────────────────────────────────────────────────

function EditSheet({ item, locations, containers, onClose, onSaved, authHeaders, tr }: {
  item: InvItem
  locations: InvLocation[]
  containers: InvContainer[]
  onClose: () => void
  onSaved: () => void
  authHeaders: () => HeadersInit
  tr: (bm: string, en: string) => string
}) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category || "")
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unit, setUnit] = useState(item.unit)
  const [status, setStatus] = useState<InvStatus>(item.status)
  const [brand, setBrand] = useState(item.brand || "")
  const [model, setModel] = useState(item.model || "")
  const [serial, setSerial] = useState(item.serial_number || "")
  const [purchaseDate, setPurchaseDate] = useState(item.purchase_date || "")
  const [purchasePrice, setPurchasePrice] = useState(item.purchase_price != null ? String(item.purchase_price) : "")
  const [notes, setNotes] = useState(item.notes || "")
  const [locationId, setLocationId] = useState(item.location_id ? String(item.location_id) : "")
  const [containerId, setContainerId] = useState(item.container_id ? String(item.container_id) : "")
  const [saving, setSaving] = useState(false)
  const { showAlert } = usePageAlert("BM")
  const showAlertRef = useRef(showAlert)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])

  const filteredContainers = containers.filter((c) => !locationId || String(c.location_id) === locationId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim() || null,
          quantity: Math.max(0, parseInt(quantity || "1", 10) || 1),
          unit, status,
          brand: brand.trim() || null,
          model: model.trim() || null,
          serial_number: serial.trim() || null,
          purchase_date: purchaseDate || null,
          purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
          notes: notes.trim() || null,
          location_id: locationId ? parseInt(locationId, 10) : null,
          container_id: containerId ? parseInt(containerId, 10) : null,
        }),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => null)
        throw new Error(p?.detail || "Failed")
      }
      onSaved()
    } catch (err) {
      showAlertRef.current(tr("Ralat", "Error"), err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."), "error")
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
  const labelCls = "mb-1 block text-xs font-medium text-[var(--muted)]"

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={tr("Edit Barang", "Edit Item")}>
      <form onSubmit={submit} className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--card)] p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tr("Edit Barang", "Edit Item")}</h2>
          <button type="button" onClick={onClose} aria-label={tr("Tutup", "Close")} className="rounded-lg p-2 hover:bg-[var(--surface-tint)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor="ed-name">{tr("Nama barang *", "Item name *")}</label>
            <input id="ed-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={190} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ed-qty">{tr("Kuantiti *", "Quantity *")}</label>
              <input id="ed-qty" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-unit">{tr("Unit", "Unit")}</label>
              <input id="ed-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} maxLength={20} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ed-cat">{tr("Kategori", "Category")}</label>
              <input id="ed-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} maxLength={80} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-status">{tr("Status", "Status")}</label>
              <select id="ed-status" value={status} onChange={(e) => setStatus(e.target.value as InvStatus)} className={inputCls}>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.bm}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ed-brand">{tr("Jenama", "Brand")}</label>
              <input id="ed-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} maxLength={80} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-model">{tr("Model", "Model")}</label>
              <input id="ed-model" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} maxLength={80} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="ed-serial">{tr("No. siri", "Serial number")}</label>
            <input id="ed-serial" value={serial} onChange={(e) => setSerial(e.target.value)} className={inputCls} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ed-date">{tr("Tarikh pembelian", "Purchase date")}</label>
              <input id="ed-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-price">{tr("Harga (RM)", "Price (RM)")}</label>
              <input id="ed-price" type="number" min={0} step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="ed-loc">{tr("Lokasi", "Location")}</label>
            <select id="ed-loc" value={locationId} onChange={(e) => { setLocationId(e.target.value); setContainerId("") }} className={inputCls}>
              <option value="">{tr("— Tiada lokasi —", "— No location —")}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ed-cont">{tr("Bekas/Kotak", "Box/Container")}</label>
            <select id="ed-cont" value={containerId} onChange={(e) => setContainerId(e.target.value)} className={inputCls} disabled={!locationId}>
              <option value="">{tr("— Tiada bekas —", "— No box —")}</option>
              {filteredContainers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ed-notes">{tr("Nota", "Notes")}</label>
            <textarea id="ed-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--surface-tint)]">{tr("Batal", "Cancel")}</button>
          <button type="submit" disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tr("Simpan", "Save")}
          </button>
        </div>
      </form>
    </div>
  )
}
