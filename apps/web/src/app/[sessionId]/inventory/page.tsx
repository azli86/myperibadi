"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Boxes,
  MapPin,
  Package,
  Plus,
  Search,
  Loader2,
  Trash2,
  Pencil,
  X,
  FolderTree,
  Tag,
  Image as ImageIcon,
  FolderPlus,
  BoxSelect,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"

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
  model?: string | null
  serial_number?: string | null
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

const STATUS_CONFIG: Record<
  InvStatus,
  { badge: string; pillActive: string; pillInactive: string; dot: string; labelBm: string; labelEn: string }
> = {
  available: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pillActive: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm",
    pillInactive: "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
    dot: "bg-emerald-500",
    labelBm: "Ada",
    labelEn: "Available",
  },
  loaned: {
    badge: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    pillActive: "bg-sky-500/20 text-sky-400 border-sky-500/50 shadow-sm",
    pillInactive: "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
    dot: "bg-sky-400",
    labelBm: "Dipinjam",
    labelEn: "Loaned",
  },
  missing: {
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    pillActive: "bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-sm",
    pillInactive: "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
    dot: "bg-rose-500",
    labelBm: "Hilang",
    labelEn: "Missing",
  },
  damaged: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    pillActive: "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-sm",
    pillInactive: "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
    dot: "bg-amber-400",
    labelBm: "Rosak",
    labelEn: "Damaged",
  },
  disposed: {
    badge: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    pillActive: "bg-zinc-500/20 text-zinc-300 border-zinc-500/50 shadow-sm",
    pillInactive: "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
    dot: "bg-zinc-400",
    labelBm: "Dilupus",
    labelEn: "Disposed",
  },
  used_up: {
    badge: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    pillActive: "bg-zinc-500/20 text-zinc-300 border-zinc-500/50 shadow-sm",
    pillInactive: "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
    dot: "bg-zinc-400",
    labelBm: "Habis",
    labelEn: "Used Up",
  },
}

const STATUS_OPTIONS: { value: InvStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "loaned", label: "Loaned" },
  { value: "missing", label: "Missing" },
  { value: "damaged", label: "Damaged" },
  { value: "disposed", label: "Disposed" },
  { value: "used_up", label: "Used Up" },
]

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

export default function InventoryPage() {
  const params = useParams()
  const router = useRouter()
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
  const [summary, setSummary] = useState<{
    total_types: number
    total_units: number
    available: number
    loaned: number
    missing: number
    damaged: number
    no_location: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"items" | "locations">("items")
  const [displayMode, setDisplayMode] = useState<"gallery" | "list">("gallery")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [locationFilter, setLocationFilter] = useState<string>("")

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<InvItem | null>(null)
  const [showLocModal, setShowLocModal] = useState(false)
  const [showContModal, setShowContModal] = useState(false)
  const [editingLoc, setEditingLoc] = useState<InvLocation | null>(null)
  const [editingCont, setEditingCont] = useState<InvContainer | null>(null)
  const [defaultParentLocId, setDefaultParentLocId] = useState<string>("")
  const [defaultContLocId, setDefaultContLocId] = useState<string>("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (search.trim()) qs.set("q", search.trim())
      if (statusFilter) qs.set("status", statusFilter)
      qs.set("limit", "150")
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
    const t = setTimeout(load, search ? 280 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const deleteItem = useCallback((item: InvItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
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
  const openEdit = useCallback((item: InvItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditing(item)
    setShowForm(true)
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      if (item.category && item.category.trim()) {
        set.add(item.category.trim())
      }
    }
    return Array.from(set).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    let result = items
    if (categoryFilter) {
      result = result.filter((item) => item.category?.trim() === categoryFilter)
    }
    if (locationFilter) {
      result = result.filter((item) => item.location_path?.includes(locationFilter))
    }
    return result
  }, [items, categoryFilter, locationFilter])

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

  const totalBoxesCount = useMemo(() => containers.length, [containers])
  const hasActiveFilters = Boolean(search || statusFilter || categoryFilter || locationFilter)

  const clearAllFilters = useCallback(() => {
    setSearch("")
    setStatusFilter("")
    setCategoryFilter("")
    setLocationFilter("")
  }, [])

  // ── RENDER PHOTO GALLERY CARD ──────────────────────────────────────────────
  const renderGalleryCard = (item: InvItem) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
    const subtitle = [item.brand, item.category].filter(Boolean).join(" · ")
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => router.push(`/${sessionId}/inventory/${item.id}`)}
        className="group relative flex flex-col overflow-hidden rounded-[1.35rem] sm:rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] text-left transition hover:border-[var(--accent)]/40 hover:shadow-lg active:scale-[0.98]"
      >
        {/* Photo Canvas */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-900/60 border-b border-[var(--border)]/50">
          {item.has_image ? (
            <img
              src={`/api/inventory/items/${item.id}/image`}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 via-[#181818] to-[#121212] text-neutral-500">
              <Package className="h-10 w-10 sm:h-12 sm:w-12 opacity-40 transition-transform duration-300 group-hover:scale-110" />
            </div>
          )}

          {/* Floating Quantity Tag (Top-Left) */}
          <span className="absolute left-2.5 top-2.5 inline-flex items-center rounded-lg bg-black/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-black text-white shadow">
            {item.quantity} {item.unit}
          </span>

          {/* Floating Status Badge (Top-Right) */}
          <span
            className={cn(
              "absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black tracking-tight backdrop-blur-md shadow",
              cfg.badge
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
            <span>{isBm ? cfg.labelBm : item.status_label || cfg.labelEn}</span>
          </span>
        </div>

        {/* Card Body Details */}
        <div className="flex flex-1 flex-col justify-between p-3 sm:p-3.5">
          <div>
            <h4 className="truncate text-xs sm:text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
              {item.name}
            </h4>
            <p className="mt-0.5 truncate text-[10px] sm:text-[11px] font-semibold text-[var(--muted)]">
              {subtitle || "—"}
            </p>
          </div>

          {/* Location & Box Tag */}
          <div className="mt-2 flex items-center gap-1 truncate text-[10px] text-[var(--muted)]">
            <MapPin className="h-3 w-3 shrink-0 text-emerald-400" />
            <span className="truncate">
              {item.location_path || tr("Tiada lokasi", "No location")}
              {item.container_name ? ` · ${item.container_name}` : ""}
            </span>
          </div>
        </div>
      </button>
    )
  }

  // ── RENDER COMPACT LIST ROW ────────────────────────────────────────────────
  const renderListRow = (item: InvItem) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
    const subtitle = [item.brand, item.category].filter(Boolean).join(" · ")
    return (
      <div
        key={item.id}
        onClick={() => router.push(`/${sessionId}/inventory/${item.id}`)}
        className="group relative flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 transition active:scale-[0.98] hover:border-[var(--accent)]/30 hover:bg-[var(--card-active)] shadow-sm"
      >
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]">
          {item.has_image ? (
            <img
              src={`/api/inventory/items/${item.id}/image`}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package className="h-6 w-6 text-[var(--muted)] opacity-70" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <p className="truncate text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
              {item.name}
            </p>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.2 text-[9px] font-bold tracking-tight", cfg.badge)}>
              {isBm ? cfg.labelBm : item.status_label || cfg.labelEn}
            </span>
          </div>

          {subtitle && (
            <p className="truncate text-[11px] font-medium text-[var(--muted)]">
              {subtitle}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
            <span className="inline-flex items-center rounded-md bg-[var(--surface-tint-strong)] px-1.5 py-0.5 font-bold text-[var(--text)]">
              {item.quantity} {item.unit}
            </span>

            {item.location_path ? (
              <span className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 text-[var(--muted)]">
                <MapPin className="h-2.5 w-2.5 shrink-0 text-emerald-400" />
                <span className="truncate">{item.location_path}</span>
              </span>
            ) : null}

            {item.container_name ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 text-[var(--muted)]">
                <Boxes className="h-2.5 w-2.5 shrink-0 text-sky-400" />
                <span>{item.container_name}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 pl-1 text-[var(--muted)] opacity-60">
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── HEADER PRESERVED UNTOUCHED ── */}
      <div className="border-b border-[color:var(--border)] pb-4 md:hidden">
        <MobilePageHeader
          title={tr("Barang Saya", "My Inventory")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton label={tr("Tambah", "Add")} onClick={openCreate}>
              <Plus className="h-5 w-5" />
            </MobileIconButton>
          }
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Barang Saya", "My Inventory")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={openCreate}>
              <Plus size={16} />
              {tr("Tambah Barang", "Add Item")}
            </DesktopPageAction>
          }
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="md:hidden px-1 pb-24 pt-1 space-y-4">
        {/* Mobile Hero Card */}
        <section className="relative overflow-hidden rounded-[1.85rem] border border-[var(--border)] bg-[#171717] p-4 text-white shadow-xl">
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[var(--accent)]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 left-6 h-36 w-36 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative z-10 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
                  {tr("Jumlah Keseluruhan", "Total Inventory")}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-white">
                    {summary ? summary.total_units : 0}
                  </span>
                  <span className="text-xs font-semibold text-neutral-400">
                    {tr("unit", "units")} · {summary ? summary.total_types : 0} {tr("jenis", "types")}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {locations.length} {tr("lokasi", "locations")} · {containers.length} {tr("bekas/kotak", "boxes")}
                </p>
              </div>

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white shadow-inner">
                <Package className="h-5 w-5 text-emerald-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-xs font-bold text-white shadow-md transition active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                <span>{tr("Tambah Barang", "Add Item")}</span>
              </button>
              <button
                type="button"
                onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-xs font-bold text-white backdrop-blur transition active:scale-[0.98]"
              >
                <FolderPlus className="h-4 w-4 text-emerald-400" />
                <span>{tr("Tambah Lokasi", "Add Location")}</span>
              </button>
            </div>

            {summary && (
              <div className="border-t border-white/10 pt-3">
                <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("")}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95",
                      statusFilter === ""
                        ? "bg-white text-black shadow-sm"
                        : "border border-white/10 bg-white/5 text-neutral-300"
                    )}
                  >
                    <span>{tr("Semua", "All")}</span>
                    <span className="opacity-75">({summary.total_types})</span>
                  </button>

                  {(
                    [
                      { key: "available", label: tr("Ada", "Available"), count: summary.available },
                      { key: "loaned", label: tr("Dipinjam", "Loaned"), count: summary.loaned },
                      { key: "missing", label: tr("Hilang", "Missing"), count: summary.missing },
                      { key: "damaged", label: tr("Rosak", "Damaged"), count: summary.damaged },
                    ] as const
                  ).map((st) => {
                    const isSelected = statusFilter === st.key
                    const cfg = STATUS_CONFIG[st.key as InvStatus]
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setStatusFilter(isSelected ? "" : st.key)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition active:scale-95",
                          isSelected ? cfg.pillActive : cfg.pillInactive
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                        <span>{st.label}</span>
                        <span className="opacity-80">({st.count})</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Mobile View Switcher */}
        <div className="flex items-center justify-between gap-2">
          <div className="grid flex-1 grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-tint)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab("items")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition active:scale-[0.98]",
                activeTab === "items"
                  ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <Package className="h-3.5 w-3.5" />
              <span>{tr("Barang", "Items")}</span>
              <span className="rounded-full bg-[var(--surface-tint-strong)] px-1.5 py-0.2 text-[10px] font-bold">
                {filteredItems.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("locations")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition active:scale-[0.98]",
                activeTab === "locations"
                  ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <FolderTree className="h-3.5 w-3.5" />
              <span>{tr("Lokasi & Kotak", "Locations")}</span>
              <span className="rounded-full bg-[var(--surface-tint-strong)] px-1.5 py-0.2 text-[10px] font-bold">
                {locations.length + totalBoxesCount}
              </span>
            </button>
          </div>

          {activeTab === "items" && (
            <div className="flex items-center rounded-2xl bg-[var(--surface-tint)] p-1">
              <button
                type="button"
                onClick={() => setDisplayMode("gallery")}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition",
                  displayMode === "gallery" ? "bg-[var(--card)] text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"
                )}
                title={tr("Paparan Galeri", "Gallery View")}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode("list")}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition",
                  displayMode === "list" ? "bg-[var(--card)] text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"
                )}
                title={tr("Paparan Senarai", "List View")}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Items List (Mobile) */}
        {activeTab === "items" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("Cari nama, jenama, no. siri...", "Search name, brand, serial...")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-9 text-xs font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {categories.length > 0 && (
              <div className="no-scrollbar -mx-2 flex items-center gap-1.5 overflow-x-auto px-2 pb-0.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("")}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95",
                    categoryFilter === ""
                      ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                      : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
                  )}
                >
                  <span>{tr("Semua Kategori", "All Categories")}</span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95",
                      categoryFilter === cat
                        ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                        : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
                    )}
                  >
                    <Tag className="h-3 w-3 opacity-60" />
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex items-center justify-between px-1 text-[11px]">
                <span className="text-[var(--muted)]">
                  {tr("Menunjukkan", "Showing")} {filteredItems.length} {tr("hasil", "results")}
                </span>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 font-bold text-rose-400 hover:underline"
                >
                  <X className="h-3 w-3" />
                  {tr("Padam Penapis", "Reset")}
                </button>
              </div>
            )}

            {loading && items.length === 0 ? (
              <div className="grid grid-cols-2 gap-2.5 py-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-4 py-12 text-center">
                <Package className="h-7 w-7 text-[var(--muted)]" />
                <p className="mt-2 text-xs font-bold text-[var(--text)]">
                  {tr("Tiada barang dijumpai", "No items found")}
                </p>
              </div>
            ) : displayMode === "gallery" ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {filteredItems.map(renderGalleryCard)}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map(renderListRow)}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Locations (Mobile) */}
        {activeTab === "locations" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-xs font-bold text-[var(--text)]">{tr("Hierarki Lokasi", "Locations Hierarchy")}</h3>
                <p className="text-[11px] text-[var(--muted)]">{locations.length} {tr("lokasi", "locations")}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-bold text-[var(--text)] shadow-sm active:scale-95"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{tr("Lokasi", "Location")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingCont(null); setDefaultContLocId(""); setShowContModal(true) }}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-bold text-[var(--text)] shadow-sm active:scale-95"
                >
                  <BoxSelect className="h-3.5 w-3.5 text-sky-400" />
                  <span>{tr("Bekas", "Box")}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {locationTree.map(({ loc, depth }) => {
                const conts = containers.filter((c) => c.location_id === loc.id)
                return (
                  <div
                    key={loc.id}
                    className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
                    style={{ marginLeft: depth ? `${depth * 14}px` : "0px" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-tint)] text-emerald-400">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-[var(--text)]">{loc.name}</span>
                          <p className="text-[10px] text-[var(--muted)]">
                            {loc.item_types} {tr("jenis", "types")} · {loc.item_units} {tr("unit", "units")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => { setEditingLoc(null); setDefaultParentLocId(String(loc.id)); setShowLocModal(true) }}
                          className="rounded-lg p-1.5 text-[var(--muted)]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingCont(null); setDefaultContLocId(String(loc.id)); setShowContModal(true) }}
                          className="rounded-lg p-1.5 text-[var(--muted)]"
                        >
                          <Boxes className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingLoc(loc); setShowLocModal(true) }}
                          className="rounded-lg p-1.5 text-[var(--muted)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {conts.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-[var(--border)]/60 pt-2">
                        {conts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setEditingCont(c); setShowContModal(true) }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-medium text-[var(--text)] active:scale-95"
                          >
                            <Boxes className="h-3 w-3 text-sky-400" />
                            <span>{c.name}</span>
                            <span className="rounded bg-[var(--surface-tint-strong)] px-1 text-[9px] font-bold text-[var(--muted)]">
                              {c.item_types}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP VIEW (FULL WIDTH PORTAL PAGE BODY) ── */}
      <div className="hidden md:block">
        <DesktopPageBody className="space-y-5">
          {/* Desktop Hero */}
          <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[#171717] p-6 text-white shadow-xl">
            <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-[var(--accent)]/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 left-10 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-400">
                  {tr("Pengurusan Inventori & Barang", "Inventory & Storage Management")}
                </p>
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span className="text-3xl font-black text-white lg:text-4xl">
                    {summary ? summary.total_units : 0}
                  </span>
                  <span className="text-sm font-semibold text-neutral-300">
                    {tr("Jumlah Unit Keseluruhan", "Total Units Tracked")} · {summary ? summary.total_types : 0} {tr("Jenis Barang", "Item Types")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  {locations.length} {tr("lokasi penyimpanan", "locations")} · {containers.length} {tr("bekas/kotak", "boxes")}
                </p>
              </div>

              {/* Status Chips */}
              {summary && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition hover:opacity-90 active:scale-95",
                      statusFilter === "" ? "bg-white text-black shadow-md" : "border border-white/10 bg-white/5 text-neutral-300"
                    )}
                  >
                    <span>{tr("Semua", "All")}</span>
                    <span>({summary.total_types})</span>
                  </button>

                  {(
                    [
                      { key: "available", label: tr("Ada", "Available"), count: summary.available },
                      { key: "loaned", label: tr("Dipinjam", "Loaned"), count: summary.loaned },
                      { key: "missing", label: tr("Hilang", "Missing"), count: summary.missing },
                      { key: "damaged", label: tr("Rosak", "Damaged"), count: summary.damaged },
                    ] as const
                  ).map((st) => {
                    const isSelected = statusFilter === st.key
                    const cfg = STATUS_CONFIG[st.key as InvStatus]
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setStatusFilter(isSelected ? "" : st.key)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition hover:opacity-90 active:scale-95",
                          isSelected ? cfg.pillActive : cfg.pillInactive
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                        <span>{st.label}</span>
                        <span>({st.count})</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Desktop Search & Tabs Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-tint)] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("items")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition active:scale-[0.98]",
                    activeTab === "items"
                      ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <Package className="h-4 w-4" />
                  <span>{tr("Senarai Barang", "Items List")}</span>
                  <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[10px] font-bold">
                    {filteredItems.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("locations")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition active:scale-[0.98]",
                    activeTab === "locations"
                      ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <FolderTree className="h-4 w-4" />
                  <span>{tr("Lokasi & Bekas", "Locations & Boxes")}</span>
                  <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[10px] font-bold">
                    {locations.length + totalBoxesCount}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Display Mode Toggle */}
              {activeTab === "items" && (
                <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setDisplayMode("gallery")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition",
                      displayMode === "gallery" ? "bg-[var(--surface-tint-strong)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                    title={tr("Paparan Galeri Foto", "Photo Gallery View")}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>{tr("Galeri", "Gallery")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayMode("list")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition",
                      displayMode === "list" ? "bg-[var(--surface-tint-strong)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                    title={tr("Paparan Senarai", "List View")}
                  >
                    <ListIcon className="h-3.5 w-3.5" />
                    <span>{tr("Senarai", "List")}</span>
                  </button>
                </div>
              )}

              {/* Search Bar */}
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr("Cari barang...", "Search items...")}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-8 text-xs font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {activeTab === "locations" && (
                <>
                  <button
                    type="button"
                    onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
                  >
                    <FolderPlus className="h-4 w-4 text-emerald-400" />
                    <span>{tr("Tambah Lokasi", "Add Location")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingCont(null); setDefaultContLocId(""); setShowContModal(true) }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
                  >
                    <BoxSelect className="h-4 w-4 text-sky-400" />
                    <span>{tr("Tambah Bekas", "Add Box")}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Desktop Categories Toolbar */}
          {categories.length > 0 && activeTab === "items" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter("")}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                  categoryFilter === ""
                    ? "bg-[var(--text)] text-[var(--bg)]"
                    : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                {tr("Semua Kategori", "All")} ({items.length})
              </button>
              {categories.map((cat) => {
                const count = items.filter((i) => i.category === cat).length
                const isCatSelected = categoryFilter === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(isCatSelected ? "" : cat)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                      isCatSelected
                        ? "bg-[var(--text)] text-[var(--bg)]"
                        : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                  >
                    <Tag className="h-3 w-3 opacity-60" />
                    <span>{cat}</span>
                    <span className="opacity-70">({count})</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Desktop Items (Photo Gallery / List) */}
          {activeTab === "items" && (
            <div>
              {loading && items.length === 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-12 text-center text-sm text-[var(--muted)]">
                  {tr("Tiada barang dijumpai.", "No items found.")}
                </div>
              ) : displayMode === "gallery" ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredItems.map(renderGalleryCard)}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map(renderListRow)}
                </div>
              )}
            </div>
          )}

          {/* Desktop Locations Grid */}
          {activeTab === "locations" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {locationTree.map(({ loc, depth }) => {
                const conts = containers.filter((c) => c.location_id === loc.id)
                return (
                  <div
                    key={loc.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-emerald-400">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-[var(--text)]">{loc.name}</h4>
                          <span className="text-xs text-[var(--muted)]">
                            {loc.item_types} {tr("jenis", "types")} · {loc.item_units} {tr("unit", "units")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setEditingLoc(loc); setShowLocModal(true) }}
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                          title={tr("Edit", "Edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {conts.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)]/60 pt-2.5">
                        {conts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setEditingCont(c); setShowContModal(true) }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
                          >
                            <Boxes className="h-3.5 w-3.5 text-sky-400" />
                            <span>{c.name}</span>
                            <span className="rounded bg-[var(--surface-tint-strong)] px-1.5 text-[10px] font-bold text-[var(--muted)]">
                              {c.item_types}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </DesktopPageBody>
      </div>

      {/* ── MODAL SHEETS ── */}
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
      {showLocModal && (
        <LocationModal
          locations={locations}
          editing={editingLoc}
          defaultParentId={defaultParentLocId}
          onClose={() => setShowLocModal(false)}
          onSaved={() => { setShowLocModal(false); load() }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}
      {showContModal && (
        <ContainerModal
          locations={locations}
          containers={containers}
          editing={editingCont}
          defaultLocId={defaultContLocId}
          onClose={() => setShowContModal(false)}
          onSaved={() => { setShowContModal(false); load() }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}
      {alertModal}
    </>
  )
}

// ── ADD / EDIT ITEM SHEET FORM ───────────────────────────────────────────────

function ItemForm({
  item,
  locations,
  containers,
  onClose,
  onSaved,
  authHeaders,
  tr,
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
        unit: unit.trim() || "unit",
        status,
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
      if (imageFile) {
        const saved = await res.json()
        const targetId = item ? item.id : saved.id
        const fd = new FormData()
        fd.append("file", imageFile)
        await fetch(`/api/inventory/items/${targetId}/image`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: fd,
        })
      }
      onSaved()
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."),
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const swipe = useSwipeDownToClose(onClose)

  const inputCls =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
  const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--text)]"

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-black/50 backdrop-blur-sm p-0 sm:items-center"
      onClick={onClose}
      onTouchMove={(e) => e.preventDefault()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-swipe-sheet
        {...swipe}
        className="app-sheet-panel app-sheet-panel--lg w-full max-h-[90dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[32rem] sm:rounded-3xl"
      >
        <AppSheetHeader
          title={tr(item ? "Edit Barang" : "Tambah Barang Baru", item ? "Edit Item" : "Add New Item")}
          eyebrow={tr("Barang Saya", "My Inventory")}
          onClose={onClose}
          action={
            <button
              type="submit"
              form="inventory-item-form"
              disabled={saving || !name.trim()}
              className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
            >
              {saving ? tr("Menyimpan…", "Saving…") : tr("Simpan", "Save")}
            </button>
          }
        />
        <form id="inventory-item-form" onSubmit={submit} className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-[var(--muted)]" />
              )}
            </div>
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={pickImage}
                className="hidden"
                aria-label={tr("Gambar barang", "Item image")}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--accent)] active:scale-95"
                >
                  {imagePreview ? tr("Tukar Gambar", "Change Image") : tr("Muat Naik Gambar", "Upload Image")}
                </button>
                {imageFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null)
                      setImagePreview(item?.has_image ? `/api/inventory/items/${item.id}/image` : null)
                    }}
                    className="text-xs font-medium text-rose-400 hover:underline"
                  >
                    {tr("Padam", "Remove")}
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                {tr("Format JPG, PNG atau WebP.", "JPG, PNG or WebP format.")}
              </p>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="inv-name">
              {tr("Nama Barang *", "Item Name *")}
            </label>
            <input
              id="inv-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder={tr("Cth: Bor Cordless Makita, Kipas Berdiri", "e.g. Cordless Drill, Stand Fan")}
              maxLength={190}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-qty">
                {tr("Kuantiti *", "Quantity *")}
              </label>
              <input
                id="inv-qty"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-unit">
                {tr("Unit", "Unit")}
              </label>
              <input
                id="inv-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={inputCls}
                placeholder="unit, buah, set, pcs"
                maxLength={20}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-cat">
                {tr("Kategori", "Category")}
              </label>
              <select
                id="inv-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls}
              >
                <option value="">{tr("— Pilih kategori —", "— Select category —")}</option>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-status">
                {tr("Status", "Status")}
              </label>
              <select
                id="inv-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as InvStatus)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {tr(STATUS_CONFIG[s.value]?.labelBm, s.label)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-brand">
                {tr("Jenama", "Brand")}
              </label>
              <input
                id="inv-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={inputCls}
                placeholder="Sony, Bosch, Ikea..."
                maxLength={80}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-model">
                {tr("Model", "Model")}
              </label>
              <input
                id="inv-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={inputCls}
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="inv-serial">
              {tr("No. Siri", "Serial Number")}
            </label>
            <input
              id="inv-serial"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              className={inputCls}
              placeholder="SN-123456..."
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="inv-date">
                {tr("Tarikh Pembelian", "Purchase Date")}
              </label>
              <input
                id="inv-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="inv-price">
                {tr("Harga (RM)", "Price (RM)")}
              </label>
              <input
                id="inv-price"
                type="number"
                min={0}
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="inv-loc">
                {tr("Lokasi", "Location")}
              </label>
              <select
                id="inv-loc"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value)
                  setContainerId("")
                }}
                className={inputCls}
              >
                <option value="">{tr("— Tiada lokasi —", "— No location —")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="inv-cont">
                {tr("Bekas / Kotak", "Box / Container")}
              </label>
              <select
                id="inv-cont"
                value={containerId}
                onChange={(e) => setContainerId(e.target.value)}
                className={inputCls}
                disabled={!locationId}
              >
                <option value="">{tr("— Tiada bekas —", "— No box —")}</option>
                {filteredContainers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="inv-notes">
              {tr("Catatan / Nota Tambahan", "Notes / Remarks")}
            </label>
            <textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
              rows={2}
              placeholder={tr("Simpan resit, keadaan barang, pautan manual dsb...", "Receipt details, condition, link...")}
            />
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── LOCATION MODAL ───────────────────────────────────────────────────────────

function LocationModal({
  locations,
  editing,
  defaultParentId,
  onClose,
  onSaved,
  authHeaders,
  tr,
}: {
  locations: InvLocation[]
  editing: InvLocation | null
  defaultParentId?: string
  onClose: () => void
  onSaved: () => void
  authHeaders: () => HeadersInit
  tr: (bm: string, en: string) => string
}) {
  const [name, setName] = useState(editing?.name || "")
  const [parentId, setParentId] = useState(editing?.parent_id ? String(editing.parent_id) : defaultParentId || "")
  const [saving, setSaving] = useState(false)
  const { showAlert } = usePageAlert("BM")
  const showAlertRef = useRef(showAlert)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])
  const swipe = useSwipeDownToClose(onClose)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/inventory/locations/${editing.id}` : "/api/inventory/locations", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), parent_id: parentId ? parseInt(parentId, 10) : null }),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => null)
        throw new Error(p?.detail || "Failed")
      }
      onSaved()
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."),
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-black/50 backdrop-blur-sm p-0 sm:items-center"
      onClick={onClose}
      onTouchMove={(e) => e.preventDefault()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-swipe-sheet
        {...swipe}
        className="app-sheet-panel app-sheet-panel--sm w-full max-h-[85dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-w-[26rem] sm:rounded-3xl"
      >
        <AppSheetHeader
          title={tr(editing ? "Edit Lokasi" : "Tambah Lokasi Baru", editing ? "Edit Location" : "Add New Location")}
          eyebrow={tr("Barang Saya", "My Inventory")}
          onClose={onClose}
          action={
            <button
              type="submit"
              form="inventory-loc-form"
              disabled={saving || !name.trim()}
              className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
            >
              {saving ? tr("Menyimpan…", "Saving…") : tr("Simpan", "Save")}
            </button>
          }
        />
        <form id="inventory-loc-form" onSubmit={submit} className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="loc-name">
              {tr("Nama Lokasi *", "Location Name *")}
            </label>
            <input
              id="loc-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder={tr("Cth: Stor Utama, Dapur, Ruang Tamu, Rak 1", "e.g. Storeroom, Kitchen, Shelf 1")}
              maxLength={190}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="loc-parent">
              {tr("Lokasi Induk (Pilihan)", "Parent Location (Optional)")}
            </label>
            <select id="loc-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputCls}>
              <option value="">{tr("— Tiada induk (Lokasi Utama) —", "— No parent (Main Location) —")}</option>
              {locations
                .filter((l) => !editing || l.id !== editing.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {tr("Contoh: Pilih 'Bilik Stor' sebagai induk untuk 'Rak A'.", "Example: Select 'Storeroom' as parent for 'Shelf A'.")}
            </p>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── CONTAINER MODAL ──────────────────────────────────────────────────────────

function ContainerModal({
  locations,
  containers,
  editing,
  defaultLocId,
  onClose,
  onSaved,
  authHeaders,
  tr,
}: {
  locations: InvLocation[]
  containers: InvContainer[]
  editing: InvContainer | null
  defaultLocId?: string
  onClose: () => void
  onSaved: () => void
  authHeaders: () => HeadersInit
  tr: (bm: string, en: string) => string
}) {
  const [name, setName] = useState(editing?.name || "")
  const [locationId, setLocationId] = useState(
    editing?.location_id ? String(editing.location_id) : defaultLocId || ""
  )
  const [saving, setSaving] = useState(false)
  const { showAlert } = usePageAlert("BM")
  const showAlertRef = useRef(showAlert)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])
  const swipe = useSwipeDownToClose(onClose)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/inventory/containers/${editing.id}` : "/api/inventory/containers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), location_id: locationId ? parseInt(locationId, 10) : null }),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => null)
        throw new Error(p?.detail || "Failed")
      }
      onSaved()
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal simpan.", "Failed to save."),
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-black/50 backdrop-blur-sm p-0 sm:items-center"
      onClick={onClose}
      onTouchMove={(e) => e.preventDefault()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-swipe-sheet
        {...swipe}
        className="app-sheet-panel app-sheet-panel--sm w-full max-h-[85dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-w-[26rem] sm:rounded-3xl"
      >
        <AppSheetHeader
          title={tr(editing ? "Edit Bekas" : "Tambah Bekas / Kotak", editing ? "Edit Box" : "Add Box / Container")}
          eyebrow={tr("Barang Saya", "My Inventory")}
          onClose={onClose}
          action={
            <button
              type="submit"
              form="inventory-cont-form"
              disabled={saving || !name.trim()}
              className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
            >
              {saving ? tr("Menyimpan…", "Saving…") : tr("Simpan", "Save")}
            </button>
          }
        />
        <form id="inventory-cont-form" onSubmit={submit} className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cont-name">
              {tr("Nama Bekas / Kotak *", "Box / Container Name *")}
            </label>
            <input
              id="cont-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder={tr("Cth: Kotak Plastik Merah, Toolbox A, Tupperware 5L", "e.g. Red Storage Box, Tool Box 1")}
              maxLength={190}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]" htmlFor="cont-loc">
              {tr("Lokasi Penyimpanan", "Storage Location")}
            </label>
            <select id="cont-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
              <option value="">{tr("— Tiada lokasi —", "— No location —")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {tr("Bekas akan dikaitkan dengan lokasi ini.", "Box will be associated with this location.")}
            </p>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
