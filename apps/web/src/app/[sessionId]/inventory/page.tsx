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
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
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
    badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    pillActive: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 ring-1 ring-emerald-500/30",
    pillInactive: "bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-emerald-500",
    labelBm: "Ada",
    labelEn: "Available",
  },
  loaned: {
    badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    pillActive: "bg-sky-500/20 text-sky-400 border-sky-500/40 ring-1 ring-sky-500/30",
    pillInactive: "bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-sky-400",
    labelBm: "Dipinjam",
    labelEn: "Loaned",
  },
  missing: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    pillActive: "bg-rose-500/20 text-rose-400 border-rose-500/40 ring-1 ring-rose-500/30",
    pillInactive: "bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-rose-500",
    labelBm: "Hilang",
    labelEn: "Missing",
  },
  damaged: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    pillActive: "bg-amber-500/20 text-amber-400 border-amber-500/40 ring-1 ring-amber-500/30",
    pillInactive: "bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-amber-400",
    labelBm: "Rosak",
    labelEn: "Damaged",
  },
  disposed: {
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    pillActive: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40 ring-1 ring-zinc-500/30",
    pillInactive: "bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-zinc-400",
    labelBm: "Dilupus",
    labelEn: "Disposed",
  },
  used_up: {
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    pillActive: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40 ring-1 ring-zinc-500/30",
    pillInactive: "bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)]",
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
      <DesktopPageHeader
        title={tr("Barang Saya", "My Inventory")}
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {tr("Tambah Barang", "Add Item")}
          </button>
        }
        className="hidden md:block"
      />

      <DesktopPageBody className="px-2 pb-28 md:px-4 md:pb-16 lg:max-w-7xl">
        <div className="mx-auto w-full max-w-5xl space-y-5">
          {/* ── HERO OVERVIEW CARD ── */}
          <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-gradient-to-br from-[#1c1c1c] via-[#171717] to-[#121212] p-5 text-white shadow-lg sm:p-6">
            {/* Ambient background glows */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[var(--accent)]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-10 left-1/4 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl" />

            <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-[var(--accent)]">
                    <Package className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    {tr("Ringkasan Inventori", "Inventory Overview")}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                    {summary ? summary.total_units : 0}
                  </span>
                  <span className="text-sm font-medium text-neutral-400">
                    {tr("Jumlah Unit Keseluruhan", "Total Units")} ({summary ? summary.total_types : 0} {tr("jenis barang", "types")})
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  {tr(
                    `${locations.length} lokasi berdaftar & ${containers.length} bekas/kotak penyimpanan`,
                    `${locations.length} registered locations & ${containers.length} storage boxes`
                  )}
                </p>
              </div>

              {/* Quick Actions in Hero */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  {tr("Tambah Barang", "Add Item")}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur transition hover:bg-white/10 active:scale-95"
                >
                  <MapPin className="h-3.5 w-3.5 text-neutral-300" />
                  {tr("Lokasi", "Location")}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingCont(null); setDefaultContLocId(""); setShowContModal(true) }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur transition hover:bg-white/10 active:scale-95"
                >
                  <Boxes className="h-3.5 w-3.5 text-neutral-300" />
                  {tr("Bekas", "Box")}
                </button>
              </div>
            </div>

            {/* Status Breakdown Bar & Interactive Filter Chips */}
            {summary && (
              <div className="relative z-10 mt-5 border-t border-white/10 pt-4">
                <p className="mb-2.5 text-[11px] font-medium text-neutral-400">
                  {tr("Tapis pantas mengikut status:", "Quick filter by status:")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                      statusFilter === ""
                        ? "bg-white text-black font-semibold shadow-sm"
                        : "bg-white/5 text-neutral-300 hover:bg-white/10"
                    )}
                  >
                    <span>{tr("Semua", "All")}</span>
                    <span className="text-[11px] opacity-75">({summary.total_types})</span>
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
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                          isSelected
                            ? cfg.pillActive
                            : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                        <span>{st.label}</span>
                        <span className="text-[11px] opacity-75 font-semibold">({st.count})</span>
                      </button>
                    )
                  })}

                  {summary.no_location > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("items")
                        setLocationFilter(locationFilter === "none" ? "" : "none")
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                        locationFilter === "none"
                          ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                          : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"
                      )}
                    >
                      <MapPin className="h-3 w-3" />
                      <span>{tr("Tanpa lokasi", "No location")}</span>
                      <span className="text-[11px] opacity-80">({summary.no_location})</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── VIEW SWITCHER TABS ── */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
            <div className="flex items-center gap-1 rounded-2xl bg-[var(--surface-tint)] p-1">
              <button
                type="button"
                onClick={() => setActiveTab("items")}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition",
                  activeTab === "items"
                    ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                <Package className="h-4 w-4" />
                <span>{tr("Senarai Barang", "Item List")}</span>
                <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[10px] font-semibold">
                  {filteredItems.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("locations")}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition",
                  activeTab === "locations"
                    ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                <FolderTree className="h-4 w-4" />
                <span>{tr("Lokasi & Bekas", "Locations & Boxes")}</span>
                <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[10px] font-semibold">
                  {locations.length + totalBoxesCount}
                </span>
              </button>
            </div>

            {/* Quick reset active filter badge */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition"
              >
                <X className="h-3.5 w-3.5" />
                {tr("Set Semula", "Reset Filters")}
              </button>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════
              TAB 1: ITEMS LIST
             ══════════════════════════════════════════════════════════ */}
          {activeTab === "items" && (
            <div className="space-y-4">
              {/* Search & Filters */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tr("Cari nama, kategori, jenama, no. siri...", "Search name, category, brand, serial...")}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-9 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    aria-label={tr("Cari barang", "Search items")}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-xs font-semibold text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                    aria-label={tr("Tapis status", "Filter status")}
                  >
                    <option value="">{tr("Semua Status", "All Status")}</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {isBm ? STATUS_CONFIG[s.value]?.labelBm || s.label : s.label}
                      </option>
                    ))}
                  </select>

                  {categories.length > 0 && (
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-xs font-semibold text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                      aria-label={tr("Tapis kategori", "Filter category")}
                    >
                      <option value="">{tr("Semua Kategori", "All Categories")}</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Category Filter Chips Carousel */}
              {categories.length > 0 && !categoryFilter && (
                <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Kategori:", "Category:")}
                  </span>
                  {categories.slice(0, 8).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                    >
                      <Tag className="h-3 w-3 opacity-60" />
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Items List */}
              {loading && items.length === 0 ? (
                <div className="space-y-3 py-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex animate-pulse items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
                    >
                      <div className="h-14 w-14 rounded-xl bg-[var(--surface-tint-strong)]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/3 rounded bg-[var(--surface-tint-strong)]" />
                        <div className="h-3 w-1/2 rounded bg-[var(--surface-tint-strong)]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-4 py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--muted)]">
                    <Package className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[var(--text)]">
                    {hasActiveFilters
                      ? tr("Tiada barang dijumpai", "No items matched your filter")
                      : tr("Belum ada barang direkodkan", "No items recorded yet")}
                  </h3>
                  <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">
                    {hasActiveFilters
                      ? tr(
                          "Cuba ubah kata carian atau batalkan penapis status / kategori.",
                          "Try adjusting your search terms or clearing status/category filters."
                        )
                      : tr(
                          "Mula rekod perabot, peralatan, gajet, dan stok anda supaya mudah dicari bila-bila masa.",
                          "Start keeping track of your tools, furniture, gadgets and household items."
                        )}
                  </p>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)]"
                    >
                      <X className="h-3.5 w-3.5" />
                      {tr("Padam Carian & Penapis", "Clear Filters")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openCreate}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:opacity-90 active:scale-95"
                    >
                      <Plus className="h-4 w-4" />
                      {tr("Tambah Barang Pertama", "Add First Item")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-2">
                  {filteredItems.map((item) => {
                    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
                    return (
                      <div
                        key={item.id}
                        onClick={() => router.push(`/${sessionId}/inventory/${item.id}`)}
                        className="group relative flex cursor-pointer items-center gap-3.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition-all duration-150 hover:border-[var(--accent)]/40 hover:bg-[var(--card-active)] hover:shadow-md active:scale-[0.99]"
                      >
                        {/* Thumbnail */}
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-tint)] border border-[var(--border)]">
                          {item.has_image ? (
                            <img
                              src={`/api/inventory/items/${item.id}/image`}
                              alt={item.name}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/[0.04] to-transparent text-[var(--muted)]">
                              <Package className="h-6 w-6 opacity-70" />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="truncate text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                              {item.name}
                            </h4>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-tight",
                                cfg.badge
                              )}
                            >
                              {isBm ? cfg.labelBm : item.status_label || cfg.labelEn}
                            </span>
                          </div>

                          {/* Brand / Model / Category */}
                          <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--muted)]">
                            {[item.brand, item.category].filter(Boolean).join(" · ") || tr("Am", "General")}
                          </p>

                          {/* Location & Quantity pills */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-tint-strong)] px-2 py-0.5 font-bold text-[var(--text)]">
                              {item.quantity} {item.unit}
                            </span>

                            {item.location_path ? (
                              <span className="inline-flex max-w-[170px] items-center gap-1 truncate rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                                <MapPin className="h-3 w-3 shrink-0 text-emerald-400" />
                                <span className="truncate">{item.location_path}</span>
                              </span>
                            ) : null}

                            {item.container_name ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                                <Boxes className="h-3 w-3 shrink-0 text-sky-400" />
                                <span>{item.container_name}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Quick action buttons */}
                        <div
                          className="flex shrink-0 items-center gap-0.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => openEdit(item, e)}
                            aria-label={tr("Edit barang", "Edit item")}
                            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)] transition"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => deleteItem(item, e)}
                            aria-label={tr("Padam barang", "Delete item")}
                            className="rounded-lg p-1.5 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-400 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB 2: LOCATIONS & CONTAINERS MANAGEMENT
             ══════════════════════════════════════════════════════════ */}
          {activeTab === "locations" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">
                    {tr("Hierarki Lokasi & Kotak Storan", "Location & Storage Hierarchy")}
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    {tr(
                      "Susun barang mengikut bilik, rak, dan kotak supaya mudah dikesan.",
                      "Organize items by rooms, shelves, and containers for easy retrieval."
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--text)] shadow-sm hover:border-[var(--accent)] hover:bg-[var(--card-active)] transition"
                  >
                    <FolderPlus className="h-3.5 w-3.5 text-emerald-400" />
                    {tr("Tambah Lokasi", "Add Location")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingCont(null); setDefaultContLocId(""); setShowContModal(true) }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--text)] shadow-sm hover:border-[var(--accent)] hover:bg-[var(--card-active)] transition"
                  >
                    <BoxSelect className="h-3.5 w-3.5 text-sky-400" />
                    {tr("Tambah Bekas", "Add Box")}
                  </button>
                </div>
              </div>

              {locations.length === 0 && containers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-4 py-14 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--muted)]">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <h4 className="mt-3 text-sm font-bold text-[var(--text)]">
                    {tr("Belum ada lokasi atau kotak dicipta", "No locations or boxes yet")}
                  </h4>
                  <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">
                    {tr(
                      "Cipta lokasi induk (cth: Bilik Stor, Ruang Tamu) dan anak lokasi (cth: Rak A, Laci 2).",
                      "Create primary locations (e.g. Storeroom, Living Room) and sub-locations (e.g. Shelf 1, Drawer 2)."
                    )}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {tr("Cipta Lokasi", "Create Location")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {locationTree.map(({ loc, depth }) => {
                    const conts = containers.filter((c) => c.location_id === loc.id)
                    return (
                      <div
                        key={loc.id}
                        className={cn(
                          "relative rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition hover:border-[var(--accent)]/30 hover:shadow-sm",
                          depth > 0 && "before:absolute before:-left-3 before:top-1/2 before:h-4 before:w-3 before:-translate-y-1/2 before:rounded-bl-lg before:border-b before:border-l before:border-[var(--border)]"
                        )}
                        style={{ marginLeft: depth ? `${depth * 18}px` : "0px" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-tint)] text-emerald-400">
                              <MapPin className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-[var(--text)]">{loc.name}</span>
                                {depth > 0 && (
                                  <span className="rounded bg-[var(--surface-tint)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--muted)]">
                                    {tr("Sub-lokasi", "Sub-location")}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-medium text-[var(--muted)]">
                                {loc.item_types} {tr("jenis", "types")} · {loc.item_units} {tr("unit barang", "units")}
                              </span>
                            </div>
                          </div>

                          {/* Action icons for location */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLoc(null)
                                setDefaultParentLocId(String(loc.id))
                                setShowLocModal(true)
                              }}
                              title={tr("Tambah sub-lokasi", "Add sub-location")}
                              className="rounded-lg p-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)] transition"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCont(null)
                                setDefaultContLocId(String(loc.id))
                                setShowContModal(true)
                              }}
                              title={tr("Tambah bekas dalam lokasi ini", "Add container here")}
                              className="rounded-lg p-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)] transition"
                            >
                              <Boxes className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingLoc(loc); setShowLocModal(true) }}
                              title={tr("Edit lokasi", "Edit location")}
                              className="rounded-lg p-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)] transition"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Containers / Boxes in this Location */}
                        {conts.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)]/60 pt-2.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mr-1">
                              {tr("Bekas:", "Boxes:")}
                            </span>
                            {conts.map((c) => (
                              <div
                                key={c.id}
                                className="group/box inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-1 text-xs font-medium text-[var(--text)] transition hover:border-sky-500/40"
                              >
                                <Boxes className="h-3 w-3 text-sky-400" />
                                <span>{c.name}</span>
                                <span className="rounded-full bg-[var(--surface-tint-strong)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--muted)]">
                                  {c.item_types}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => { setEditingCont(c); setShowContModal(true) }}
                                  className="ml-0.5 opacity-60 hover:opacity-100"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </DesktopPageBody>

      {/* ── MODALS ── */}
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
          {/* Image preview & upload */}
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
              <input
                id="inv-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls}
                placeholder="Alatan, Elektronik, Perabot"
                maxLength={80}
              />
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
