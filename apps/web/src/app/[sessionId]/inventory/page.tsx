"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Boxes, MapPin, Package, Plus, Search, X, Loader2, Trash2, Pencil, ArrowRightLeft } from "lucide-react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"

type InvStatus = "available" | "loaned" | "missing" | "damaged" | "disposed" | "used_up"

type InvItem = {
  id: number
  name: string
  category?: string | null
  quantity: number
  unit: string
  status: InvStatus
  status_label: string
  brand?: string | null
  has_image?: boolean
  location_path?: string | null
  container_name?: string | null
  transaction_id?: number | null
  warranty_id?: number | null
  notes?: string | null
  updated_at?: string | null
}

type InvLocation = {
  id: number
  name: string
  parent_id: number | null
  item_types: number
  item_units: number
  child_count: number
}

type InvContainer = {
  id: number
  name: string
  location_id: number | null
  item_types: number
  item_units: number
  location_path?: string | null
}

const STATUS_BADGE: Record<InvStatus, string> = {
  available: "bg-emerald-500/12 text-emerald-600",
  loaned: "bg-sky-500/12 text-sky-600",
  missing: "bg-rose-500/12 text-rose-600",
  damaged: "bg-amber-500/12 text-amber-600",
  disposed: "bg-[var(--surface-tint)] text-[var(--muted)]",
  used_up: "bg-[var(--surface-tint)] text-[var(--muted)]",
}

const STATUS_OPTIONS: { value: InvStatus; bm: string }[] = [
  { value: "available", bm: "Ada" },
  { value: "loaned", bm: "Dipinjam" },
  { value: "missing", bm: "Hilang" },
  { value: "damaged", bm: "Rosak" },
  { value: "disposed", bm: "Dibuang" },
  { value: "used_up", bm: "Sudah Habis" },
]

export default function InventoryPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  const showConfirmRef = useRef(showConfirm)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])
  useEffect(() => { showConfirmRef.current = showConfirm }, [showConfirm])

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) return { Authorization: `Bearer ${token}` }
    return {}
  }, [])

  const [items, setItems] = useState<InvItem[]>([])
  const [locations, setLocations] = useState<InvLocation[]>([])
  const [containers, setContainers] = useState<InvContainer[]>([])
  const [summary, setSummary] = useState<{ total_types: number; total_units: number; available: number; loaned: number; missing: number; damaged: number; no_location: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<InvItem | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (search.trim()) qs.set("q", search.trim())
      if (statusFilter) qs.set("status", statusFilter)
      qs.set("limit", "100")
      const [itemsRes, sumRes, locRes, contRes] = await Promise.all([
        fetch(`/api/inventory/items?${qs}`, { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch("/api/inventory/summary", { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch("/api/inventory/locations", { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch("/api/inventory/containers", { headers: authHeaders(), credentials: "include", cache: "no-store" }),
      ])
      if (itemsRes.ok) setItems((await itemsRes.json()).items || [])
      if (sumRes.ok) setSummary(await sumRes.json())
      if (locRes.ok) setLocations(await locRes.json())
      if (contRes.ok) setContainers(await contRes.json())
    } catch {
      showAlertRef.current(tr("Ralat", "Error"), tr("Gagal muat barang.", "Failed to load items."), "error")
    } finally {
      setLoading(false)
    }
  }, [authHeaders, search, statusFilter, tr])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const deleteItem = useCallback((item: InvItem) => {
    showConfirmRef.current(
      tr(`Padam ${item.name}?`, `Delete ${item.name}?`),
      tr("Rekod akan disembunyikan daripada senarai.", "Record will be hidden from the list."),
      async () => {
        const res = await fetch(`/api/inventory/items/${item.id}`, { method: "DELETE", headers: authHeaders(), credentials: "include" })
        if (res.ok) load()
        else showAlertRef.current(tr("Ralat", "Error"), tr("Gagal padam.", "Failed to delete."), "error")
      },
      "warning",
    )
  }, [authHeaders, load, tr])

  const openCreate = useCallback(() => { setEditing(null); setShowForm(true) }, [])
  const openEdit = useCallback((item: InvItem) => { setEditing(item); setShowForm(true) }, [])

  const statCards = useMemo(() => {
    if (!summary) return []
    return [
      { label: tr("Jenis", "Types"), value: summary.total_types },
      { label: tr("Unit", "Units"), value: summary.total_units },
      { label: tr("Ada", "Available"), value: summary.available },
      { label: tr("Dipinjam", "Loaned"), value: summary.loaned },
      { label: tr("Hilang", "Missing"), value: summary.missing },
      { label: tr("Rosak", "Damaged"), value: summary.damaged },
      { label: tr("Tanpa lokasi", "No location"), value: summary.no_location },
    ]
  }, [summary, tr])

  const locationTree = useMemo(() => {
    const byParent = new Map<number | null, InvLocation[]>()
    for (const l of locations) {
      const list = byParent.get(l.parent_id) || []
      list.push(l)
      byParent.set(l.parent_id, list)
    }
    const rows: { loc: InvLocation; depth: number }[] = []
    const walk = (parent: number | null, depth: number) => {
      for (const l of byParent.get(parent) || []) {
        rows.push({ loc: l, depth })
        walk(l.id, depth + 1)
      }
    }
    walk(null, 0)
    return rows
  }, [locations])

  return (
    <>
      <MobilePageHeader
        title={tr("Barang Saya", "My Inventory")}
        fallbackHref={`/${sessionId}`}
        action={
          <MobileIconButton label={tr("Tambah", "Add")} onClick={openCreate}>
            <Plus className="h-5 w-5" />
          </MobileIconButton>
        }
      />
      <DesktopPageHeader
        title={tr("Barang Saya", "My Inventory")}
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            {tr("Tambah Barang", "Add Item")}
          </button>
        }
      />
      <DesktopPageBody>
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-24">
          {/* summary */}
          {summary && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
                  <div className="text-xl font-bold">{s.value}</div>
                  <div className="text-[11px] text-[var(--muted)]">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* search + filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("Cari nama, kategori, jenama...", "Search name, category, brand...")}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                aria-label={tr("Cari barang", "Search items")}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
              aria-label={tr("Tapis status", "Filter status")}
            >
              <option value="">{tr("Semua status", "All status")}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.bm}</option>
              ))}
            </select>
          </div>

          {/* list */}
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" /></div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
              <Package className="mx-auto h-10 w-10 text-[var(--muted)]" />
              <p className="mt-3 font-medium">{search || statusFilter ? tr("Barang tidak dijumpai", "No items found") : tr("Belum ada barang direkodkan", "No items recorded yet")}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {search || statusFilter
                  ? tr("Cuba nama, kategori, lokasi atau kotak yang lain.", "Try another name, category, location or box.")
                  : tr("Simpan barang anda di sini supaya mudah dicari apabila diperlukan.", "Store your items here so they are easy to find later.")}
              </p>
              {!search && !statusFilter && (
                <button onClick={openCreate} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
                  <Plus className="h-4 w-4" />
                  {tr("Tambah Barang Pertama", "Add First Item")}
                </button>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <Link href={`/${sessionId}/inventory/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-tint)]">
                      {item.has_image ? (
                        <img src={`/api/inventory/items/${item.id}/image`} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <Package className="h-5 w-5 text-[var(--muted)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.name}</span>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[item.status])}>{item.status_label}</span>
                      </div>
                      <div className="truncate text-xs text-[var(--muted)]">
                        {item.quantity} {item.unit}
                        {item.category ? ` · ${item.category}` : ""}
                        {item.location_path ? ` · ${item.location_path}` : ""}
                        {item.container_name ? ` → ${item.container_name}` : ""}
                      </div>
                    </div>
                  </Link>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => openEdit(item)} aria-label={tr("Edit", "Edit")} className="rounded-lg p-2 hover:bg-[var(--surface-tint)]">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteItem(item)} aria-label={tr("Padam", "Delete")} className="rounded-lg p-2 text-rose-500 hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* locations & containers */}
          <section className="mt-8">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
              <MapPin className="h-4 w-4" /> {tr("Lokasi & Bekas", "Locations & Boxes")}
            </h2>
            {locations.length === 0 && containers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
                {tr("Cipta lokasi melalui borang barang atau bot: `tambah barang kabel HDMI dalam Stor`.", "Create locations via the item form or bot: `tambah barang kabel HDMI dalam Stor`.")}
              </p>
            ) : (
              <div className="space-y-2">
                {locationTree.map(({ loc, depth }) => {
                  const conts = containers.filter((c) => c.location_id === loc.id)
                  return (
                    <div key={loc.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" style={{ marginLeft: depth * 16 }}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{loc.name}</span>
                        <span className="text-xs text-[var(--muted)]">
                          {loc.item_types} {tr("jenis", "types")} · {loc.item_units} {tr("unit", "units")}
                        </span>
                      </div>
                      {conts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {conts.map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[11px]">
                              <Boxes className="h-3 w-3" /> {c.name} ({c.item_types})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </DesktopPageBody>

      {showForm && (
        <ItemForm
          item={editing}
          locations={locations}
          containers={containers}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}
      {alertModal}
    </>
  )
}

// ── add/edit form modal ──────────────────────────────────────────────────────

function ItemForm({
  item, locations, containers, onClose, onSaved, authHeaders, tr,
}: {
  item: InvItem | null
  locations: InvLocation[]
  containers: InvContainer[]
  onClose: () => void
  onSaved: () => void
  authHeaders: () => HeadersInit
  tr: (bm: string, en: string) => string
}) {
  const [name, setName] = useState(item?.name || "")
  const [category, setCategory] = useState(item?.category || "")
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [unit, setUnit] = useState(item?.unit || "unit")
  const [status, setStatus] = useState<InvStatus>(item?.status || "available")
  const [brand, setBrand] = useState(item?.brand || "")
  const [model, setModel] = useState("")
  const [serial, setSerial] = useState("")
  const [purchaseDate, setPurchaseDate] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [locationId, setLocationId] = useState<string>("")
  const [containerId, setContainerId] = useState<string>("")
  const [notes, setNotes] = useState(item?.notes || "")
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showAlert } = usePageAlert("BM")
  const showAlertRef = useRef(showAlert)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])

  // edit mode: fetch detail for ids + extra fields
  useEffect(() => {
    if (!item) return
    ;(async () => {
      const res = await fetch(`/api/inventory/items/${item.id}`, { headers: authHeaders(), credentials: "include" })
      if (res.ok) {
        const d = await res.json()
        setLocationId(d.location_id ? String(d.location_id) : "")
        setContainerId(d.container_id ? String(d.container_id) : "")
        setBrand(d.brand || "")
        setModel(d.model || "")
        setSerial(d.serial_number || "")
        setPurchaseDate(d.purchase_date || "")
        setPurchasePrice(d.purchase_price != null ? String(d.purchase_price) : "")
        setImagePreview(item.has_image ? `/api/inventory/items/${item.id}/image` : null)
      }
    })()
  }, [item, authHeaders])

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setImageFile(f)
    setImagePreview(f ? URL.createObjectURL(f) : null)
  }

  const filteredContainers = containers.filter((c) => !locationId || String(c.location_id) === locationId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        category: category.trim() || null,
        quantity: Math.max(0, parseInt(quantity || "1", 10) || 1),
        unit, status,
        brand: brand.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        purchase_date: purchaseDate || null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        location_id: locationId ? parseInt(locationId, 10) : null,
        container_id: containerId ? parseInt(containerId, 10) : null,
        notes: notes.trim() || null,
      }
      const res = await fetch(item ? `/api/inventory/items/${item.id}` : "/api/inventory/items", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => null)
        throw new Error(p?.detail || "Failed")
      }
      // upload image if picked
      if (imageFile) {
        const saved = await res.json()
        const fd = new FormData()
        fd.append("file", imageFile)
        await fetch(`/api/inventory/items/${saved.id}/image`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }
      onSaved()
    } catch (err) {
      showAlertRef.current(tr("Ralat", "Error"), err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."), "error")
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
  const labelCls = "mb-1 block text-xs font-medium text-[var(--muted)]"

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={tr(item ? "Edit Barang" : "Tambah Barang", item ? "Edit Item" : "Add Item")}>
      <form onSubmit={submit} className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tr(item ? "Edit Barang" : "Tambah Barang", item ? "Edit Item" : "Add Item")}</h2>
          <button type="button" onClick={onClose} aria-label={tr("Tutup", "Close")} className="rounded-lg p-2 hover:bg-[var(--surface-tint)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          {/* image */}
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-tint)]">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="h-16 w-16 object-cover" />
              ) : (
                <Package className="h-6 w-6 text-[var(--muted)]" />
              )}
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={pickImage} className="hidden" aria-label={tr("Gambar barang", "Item image")} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-tint)]">
                {tr("Pilih gambar", "Pick image")}
              </button>
              {imageFile && (
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(item?.has_image ? `/api/inventory/items/${item.id}/image` : null) }} className="ml-2 text-xs text-rose-500">
                  {tr("Buang", "Remove")}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="inv-name">{tr("Nama barang *", "Item name *")}</label>
            <input id="inv-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={190} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-qty">{tr("Kuantiti *", "Quantity *")}</label>
              <input id="inv-qty" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-unit">{tr("Unit", "Unit")}</label>
              <input id="inv-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} maxLength={20} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-cat">{tr("Kategori", "Category")}</label>
              <input id="inv-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} maxLength={80} />
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-status">{tr("Status", "Status")}</label>
              <select id="inv-status" value={status} onChange={(e) => setStatus(e.target.value as InvStatus)} className={inputCls}>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.bm}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-brand">{tr("Jenama", "Brand")}</label>
              <input id="inv-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} maxLength={80} />
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-model">{tr("Model", "Model")}</label>
              <input id="inv-model" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} maxLength={80} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="inv-serial">{tr("No. siri", "Serial number")}</label>
            <input id="inv-serial" value={serial} onChange={(e) => setSerial(e.target.value)} className={inputCls} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-date">{tr("Tarikh pembelian", "Purchase date")}</label>
              <input id="inv-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-price">{tr("Harga (RM)", "Price (RM)")}</label>
              <input id="inv-price" type="number" min={0} step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="inv-loc">{tr("Lokasi", "Location")}</label>
            <select
              id="inv-loc"
              value={locationId}
              onChange={(e) => { setLocationId(e.target.value); setContainerId("") }}
              className={inputCls}
            >
              <option value="">{tr("— Tiada lokasi —", "— No location —")}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="inv-cont">{tr("Bekas/Kotak", "Box/Container")}</label>
            <select id="inv-cont" value={containerId} onChange={(e) => setContainerId(e.target.value)} className={inputCls} disabled={!locationId}>
              <option value="">{tr("— Tiada bekas —", "— No box —")}</option>
              {filteredContainers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{tr("Bekas ditapis mengikut lokasi.", "Boxes are filtered by location.")}</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="inv-notes">{tr("Nota", "Notes")}</label>
            <textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} />
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
