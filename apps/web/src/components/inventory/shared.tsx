"use client"

import React, { useRef, useState } from "react"
import { Check, ImagePlus, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppSheet } from "@/components/ui/AppSheet"

export type InvStatus = "available" | "loaned" | "missing" | "damaged" | "disposed" | "used_up"

export type InvItem = {
  id: number
  name: string
  description?: string | null
  category?: string | null
  quantity: number
  unit: string
  status: InvStatus
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
  notes?: string | null
  transaction_id?: number | null
  warranty_id?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export type InvLocation = { id: number; name: string; parent_id: number | null; item_types: number; item_units: number; child_count: number }
export type InvContainer = { id: number; name: string; location_id: number | null; item_types: number; item_units: number; location_path?: string | null }
export type Summary = { total_types: number; total_units: number; available: number; loaned: number; missing: number; damaged: number; disposed: number; used_up: number; no_location: number }


export const STATUSES: InvStatus[] = ["available", "loaned", "missing", "damaged", "disposed", "used_up"]
export const DOT: Record<InvStatus, string> = { available: "bg-emerald-500", loaned: "bg-sky-400", missing: "bg-rose-500", damaged: "bg-amber-400", disposed: "bg-zinc-400", used_up: "bg-zinc-500" }
export const CATEGORIES = ["Electronics", "Clothing", "Documents", "Tools", "Furniture", "Kitchen", "Personal Care", "Toys", "Books", "Sports", "Medicines", "Accessories", "Other"]
export const PAGE = 200

export const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
export const area = "w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
export const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

export function todayKey() {
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  return `${kl.getFullYear()}-${String(kl.getMonth() + 1).padStart(2, "0")}-${String(kl.getDate()).padStart(2, "0")}`
}


export type Common = {
  headers: (json?: boolean) => Record<string, string>
  errorOf: (res: Response, fallback: string) => Promise<string>
  tr: (bm: string, en: string) => string
  showAlert: (title: string, message: string, kind?: "error" | "success" | "warning") => void
}
export type Tree = Array<{ loc: InvLocation; depth: number }>
export type ConfirmFn = (title: string, message: string, onConfirm: () => void, kind?: "error" | "success" | "warning") => void


export function LocationOptions({ tree, tr, exclude }: { tree: Tree; tr: Common["tr"]; exclude?: Set<number> }) {
  return (
    <>
      <option value="">{tr("— Tiada —", "— None —")}</option>
      {tree
        .filter(({ loc }) => !exclude?.has(loc.id))
        .map(({ loc, depth }) => (
          <option key={loc.id} value={loc.id}>{`${"— ".repeat(depth)}${loc.name}`}</option>
        ))}
    </>
  )
}


export function ItemSheet({ state, locations, containers, categories, headers, errorOf, tr, showAlert, onClose, onSaved }: Common & {
  state: { item: InvItem | null; locId?: string; contId?: string }
  locations: Tree
  containers: InvContainer[]
  categories: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const item = state.item
  const [name, setName] = useState(item?.name || "")
  const [category, setCategory] = useState(item?.category || "")
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [unit, setUnit] = useState(item?.unit || "unit")
  const [status, setStatus] = useState<InvStatus>(item?.status || "available")
  const [brand, setBrand] = useState(item?.brand || "")
  const [model, setModel] = useState(item?.model || "")
  const [serial, setSerial] = useState(item?.serial_number || "")
  const [purchaseDate, setPurchaseDate] = useState(item?.purchase_date || "")
  const [purchasePrice, setPurchasePrice] = useState(item?.purchase_price != null ? String(item.purchase_price) : "")
  const [locationId, setLocationId] = useState(item?.location_id ? String(item.location_id) : state.locId || "")
  const [containerId, setContainerId] = useState(item?.container_id ? String(item.container_id) : state.contId || "")
  const [notes, setNotes] = useState(item?.notes || "")
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const boxes = containers.filter((c) => !locationId || String(c.location_id) === locationId)
  const qty = Number(quantity)
  const problem = !name.trim()
    ? tr("Nama barang wajib.", "A name is required.")
    : !Number.isInteger(qty) || qty < 0
      ? tr("Kuantiti mesti nombor bulat, 0 atau lebih.", "Quantity must be a whole number, 0 or more.")
      : purchasePrice && !(Number(purchasePrice) >= 0)
        ? tr("Harga tidak sah.", "The price is not valid.")
        : purchaseDate && purchaseDate > todayKey()
          ? tr("Tarikh beli tidak boleh pada masa depan.", "The purchase date cannot be in the future.")
          : null

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(item ? `/api/inventory/items/${item.id}` : "/api/inventory/items", {
        method: item ? "PATCH" : "POST",
        headers: headers(true),
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim() || null,
          quantity: qty,
          unit: unit.trim() || "unit",
          status,
          brand: brand.trim() || null,
          model: model.trim() || null,
          serial_number: serial.trim() || null,
          purchase_date: purchaseDate || null,
          purchase_price: purchasePrice ? Number(purchasePrice) : null,
          location_id: locationId ? Number(locationId) : null,
          container_id: containerId ? Number(containerId) : null,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan.", "Could not save.")))
      const saved = await res.json()
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const up = await fetch(`/api/inventory/items/${item ? item.id : saved.id}/image`, { method: "POST", headers: headers(), credentials: "include", body: fd }).catch(() => null)
        if (!up || !up.ok) showAlert(tr("Disimpan, tetapi…", "Saved, but…"), tr("gambar gagal dimuat naik.", "the photo could not be uploaded."), "warning")
      }
      onSaved()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
      setSaving(false)
    }
  }

  return (
    <AppSheet
      open
      onClose={onClose}
      id="inventory-item-sheet"
      title={item ? tr("Ubah barang", "Edit item") : tr("Barang baharu", "New item")}
      size="md"
      footer={
        <button type="button" onClick={() => void submit()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {tr("Simpan", "Save")}
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="inv-name" className={label}>{tr("Nama barang *", "Item name *")}</label>
          <input id="inv-name" value={name} maxLength={190} onChange={(e) => setName(e.target.value)} placeholder={tr("cth. Pemacu kuasa", "e.g. Power drill")} className={field} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label htmlFor="inv-qty" className={label}>{tr("Kuantiti", "Quantity")}</label><input id="inv-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 7))} className={field} /></div>
          <div><label htmlFor="inv-unit" className={label}>{tr("Unit", "Unit")}</label><input id="inv-unit" value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} className={field} /></div>
        </div>
        <div>
          <span className={label}>{tr("Status", "Status")}</span>
          <div className="grid grid-cols-3 gap-2">
            {STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={cn("flex h-10 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold", status === s ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--text)]")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", DOT[s])} />
                {({ available: tr("Ada", "Available"), loaned: tr("Dipinjam", "Loaned"), missing: tr("Hilang", "Missing"), damaged: tr("Rosak", "Damaged"), disposed: tr("Dilupus", "Disposed"), used_up: tr("Habis", "Used up") })[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="inv-cat" className={label}>{tr("Kategori", "Category")}</label>
          <input id="inv-cat" list="inv-cats" value={category} maxLength={80} onChange={(e) => setCategory(e.target.value)} className={field} />
          <datalist id="inv-cats">{Array.from(new Set([...categories, ...CATEGORIES])).map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="inv-loc" className={label}>{tr("Lokasi", "Location")}</label>
            <select id="inv-loc" value={locationId} onChange={(e) => { setLocationId(e.target.value); setContainerId("") }} className={field}>
              <LocationOptions tree={locations} tr={tr} />
            </select>
          </div>
          <div>
            <label htmlFor="inv-box" className={label}>{tr("Bekas", "Box")}</label>
            <select id="inv-box" value={containerId} onChange={(e) => setContainerId(e.target.value)} className={field}>
              <option value="">{tr("— Tiada —", "— None —")}</option>
              {boxes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label htmlFor="inv-brand" className={label}>{tr("Jenama", "Brand")}</label><input id="inv-brand" value={brand} maxLength={80} onChange={(e) => setBrand(e.target.value)} className={field} /></div>
          <div><label htmlFor="inv-model" className={label}>Model</label><input id="inv-model" value={model} maxLength={80} onChange={(e) => setModel(e.target.value)} className={field} /></div>
          <div><label htmlFor="inv-serial" className={label}>{tr("No. siri", "Serial no.")}</label><input id="inv-serial" value={serial} maxLength={120} onChange={(e) => setSerial(e.target.value)} className={field} /></div>
          <div><label htmlFor="inv-price" className={label}>{tr("Harga (RM)", "Price (RM)")}</label><input id="inv-price" inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))} className={field} /></div>
        </div>
        <div><label htmlFor="inv-date" className={label}>{tr("Tarikh beli", "Purchase date")}</label><input id="inv-date" type="date" max={todayKey()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={field} /></div>
        <div><label htmlFor="inv-notes" className={label}>{tr("Nota", "Notes")}</label><textarea id="inv-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={area} /></div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
        <button type="button" onClick={() => fileRef.current?.click()} className="flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--muted)]">
          <ImagePlus size={15} className="shrink-0" />
          <span className="truncate">{imageFile ? imageFile.name : item?.has_image ? tr("Tukar gambar", "Change photo") : tr("Tambah gambar (pilihan)", "Add a photo (optional)")}</span>
        </button>
      </form>
    </AppSheet>
  )
}

