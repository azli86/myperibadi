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
  Folder,
  FolderOpen,
  ChevronDown,
  Tag,
  Image as ImageIcon,
  FolderPlus,
  BoxSelect,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  ExternalLink,
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
  location_id?: number | null
  container_id?: number | null
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
    badge: "bg-[var(--surface-tint-strong)] text-[var(--text)] border-[var(--border)] font-bold",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-emerald-500",
    labelBm: "Ada",
    labelEn: "Available",
  },
  loaned: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-sky-400",
    labelBm: "Dipinjam",
    labelEn: "Loaned",
  },
  missing: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-rose-500",
    labelBm: "Hilang",
    labelEn: "Missing",
  },
  damaged: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-amber-400",
    labelBm: "Rosak",
    labelEn: "Damaged",
  },
  disposed: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-zinc-400",
    labelBm: "Dilupus",
    labelEn: "Disposed",
  },
  used_up: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-zinc-500",
    labelBm: "Habis",
    labelEn: "Used Up",
  },
}

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
  const [prefilledLocId, setPrefilledLocId] = useState<string>("")
  const [prefilledContId, setPrefilledContId] = useState<string>("")

  const [showLocModal, setShowLocModal] = useState(false)
  const [showContModal, setShowContModal] = useState(false)
  const [editingLoc, setEditingLoc] = useState<InvLocation | null>(null)
  const [editingCont, setEditingCont] = useState<InvContainer | null>(null)
  const [defaultParentLocId, setDefaultParentLocId] = useState<string>("")
  const [defaultContLocId, setDefaultContLocId] = useState<string>("")

  // Location / Container Items View Sheet
  const [selectedLocationForView, setSelectedLocationForView] = useState<InvLocation | null>(null)
  const [selectedContainerForView, setSelectedContainerForView] = useState<InvContainer | null>(null)

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

  const openCreate = useCallback((locId?: string, contId?: string) => {
    setEditing(null)
    setPrefilledLocId(locId || "")
    setPrefilledContId(contId || "")
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

  // Desktop Folder Tree selection state
  const [selectedFolder, setSelectedFolder] = useState<
    | { type: "all" }
    | { type: "unassigned" }
    | { type: "location"; id: number; name: string }
    | { type: "container"; id: number; name: string; locName?: string }
  >({ type: "all" })

  // Collapsed / Expanded state for folder tree
  const [expandedLocIds, setExpandedLocIds] = useState<Set<number>>(new Set())
  const toggleExpand = useCallback((locId: number) => {
    setExpandedLocIds((prev) => {
      const next = new Set(prev)
      if (next.has(locId)) next.delete(locId)
      else next.add(locId)
      return next
    })
  }, [])

  // Count items matching each location and container
  const locationItemCounts = useMemo(() => {
    const counts = new Map<number, { types: number; units: number }>()
    for (const loc of locations) {
      const matched = items.filter(
        (i) => i.location_id === loc.id || i.location_path === loc.name || i.location_path?.startsWith(loc.name + " >") || i.location_path?.includes(loc.name)
      )
      counts.set(loc.id, {
        types: matched.length,
        units: matched.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0),
      })
    }
    return counts
  }, [items, locations])

  const containerItemCounts = useMemo(() => {
    const counts = new Map<number, { types: number; units: number }>()
    for (const cont of containers) {
      const matched = items.filter(
        (i) => i.container_id === cont.id || i.container_name === cont.name
      )
      counts.set(cont.id, {
        types: matched.length,
        units: matched.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0),
      })
    }
    return counts
  }, [items, containers])

  const unassignedCount = useMemo(() => {
    return items.filter((i) => !i.location_path && !i.location_id).length
  }, [items])

  const filteredItems = useMemo(() => {
    let result = items
    if (selectedFolder.type === "location") {
      result = result.filter(
        (i) =>
          i.location_id === selectedFolder.id ||
          i.location_path === selectedFolder.name ||
          i.location_path?.startsWith(selectedFolder.name + " >") ||
          i.location_path?.includes(selectedFolder.name)
      )
    } else if (selectedFolder.type === "container") {
      result = result.filter(
        (i) => i.container_id === selectedFolder.id || i.container_name === selectedFolder.name
      )
    } else if (selectedFolder.type === "unassigned") {
      result = result.filter((i) => !i.location_path && !i.location_id)
    }
    if (categoryFilter) {
      result = result.filter((item) => item.category?.trim() === categoryFilter)
    }
    if (locationFilter) {
      result = result.filter((item) => item.location_path?.includes(locationFilter))
    }
    return result
  }, [items, selectedFolder, categoryFilter, locationFilter])

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
  const hasActiveFilters = Boolean(
    search ||
      statusFilter ||
      categoryFilter ||
      locationFilter ||
      selectedFolder.type !== "all"
  )

  const clearAllFilters = useCallback(() => {
    setSearch("")
    setStatusFilter("")
    setCategoryFilter("")
    setLocationFilter("")
    setSelectedFolder({ type: "all" })
  }, [])

  // ── RENDER PHOTO GALLERY CARD (REDESIGNED) ─────────────────────────────────
  const renderGalleryCard = (item: InvItem) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => router.push(`/${sessionId}/inventory/${item.id}`)}
        className="group relative flex flex-col overflow-hidden rounded-[var(--m3-shape-md)] border border-[var(--border)] bg-[var(--card)] text-left shadow-[var(--m3-elevation-1)] transition-all duration-200 hover:shadow-[var(--m3-elevation-3)] hover:border-[var(--text)]/20 active:scale-[0.97]"
      >
        {/* Photo Canvas */}
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {item.has_image ? (
            <img
              src={`/api/inventory/items/${item.id}/image`}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-tint)]">
              <Package className="h-12 w-12 sm:h-14 sm:w-14 text-[var(--muted)] opacity-40 transition-all duration-300 group-hover:opacity-60 group-hover:scale-110" />
              {item.category?.trim() && (
                <span className="absolute left-2.5 top-2.5 rounded-md border border-[var(--border)] bg-black/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/80 backdrop-blur">
                  {item.category.trim()}
                </span>
              )}
            </div>
          )}

          {/* Bottom gradient overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />

          {/* Floating Status Dot (Top-Right) */}
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 backdrop-blur-lg px-2 py-0.5 text-[9px] font-black text-white shadow-md">
            <span className={cn("h-1.5 w-1.5 rounded-full ring-1 ring-white/20", cfg.dot)} />
            <span>{isBm ? cfg.labelBm : item.status_label || cfg.labelEn}</span>
          </span>

          {/* Floating Quantity (Bottom-Left, over gradient) */}
          <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded-md bg-black/50 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-black text-white/90 shadow">
            {item.quantity} {item.unit}
          </span>
        </div>

        {/* Card Body Details */}
        <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
          <h4 className="truncate text-[13px] sm:text-sm font-extrabold leading-snug text-[var(--text)] transition-colors group-hover:text-[var(--text)]">
            {item.name}
          </h4>

          {/* Location & Box Tags — emphasized storage place */}
          <div className="mt-auto space-y-1">
            {item.location_path ? (
              <span className="flex items-center gap-1.5 truncate rounded-lg bg-[var(--surface-tint)] px-2 py-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{item.location_path}</span>
              </span>
            ) : null}
            {item.container_name && (
              <span className="flex items-center gap-1.5 truncate rounded-lg bg-[var(--surface-tint-strong)] px-2 py-1.5 text-[11px] font-bold text-[var(--text)]">
                <Boxes className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{item.container_name}</span>
              </span>
            )}
            {!item.location_path && !item.container_name && (
              <span className="flex items-center gap-1.5 truncate rounded-lg bg-[var(--surface-tint)] px-2 py-1.5 text-[11px] font-semibold italic text-[var(--muted)]">
                <MapPin className="h-3 w-3 shrink-0" />
                {tr("Tiada lokasi", "No location")}
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  // ── RENDER COMPACT 3-COL MOBILE GALLERY CARD ────────────────────────────────
  const renderMobile3ColCard = (item: InvItem) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
    const category = item.category?.trim()
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => router.push(`/${sessionId}/inventory/${item.id}`)}
        className="group relative flex flex-col overflow-hidden rounded-[var(--m3-shape-md)] border border-[var(--border)] bg-[var(--card)] text-left shadow-[var(--m3-elevation-1)] transition-all duration-200 active:scale-[0.95]"
      >
        {/* Photo Container */}
        <div className="relative aspect-square w-full overflow-hidden">
          {item.has_image ? (
            <img
              src={`/api/inventory/items/${item.id}/image`}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-400 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-tint)]">
              <Package className="h-8 w-8 text-[var(--muted)] opacity-30" />
              {category && (
                <span className="absolute left-1.5 top-1.5 rounded-md border border-[var(--border)] bg-black/40 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white/80 backdrop-blur">
                  {category}
                </span>
              )}
            </div>
          )}

          {/* Bottom fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/50 to-transparent" />

          {/* Status Dot (Top-Right) */}
          <span
            className={cn("absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-[1.5px] ring-black/20 shadow-sm", cfg.dot)}
            title={isBm ? cfg.labelBm : item.status_label || cfg.labelEn}
          />

          {/* Quantity (Bottom-Left, over gradient) */}
          <span className="absolute bottom-1 left-1.5 rounded bg-black/50 backdrop-blur px-1 py-px text-[8px] font-black text-white/90">
            {item.quantity}{item.unit !== "unit" ? ` ${item.unit}` : ""}
          </span>
        </div>

        {/* Card Body */}
        <div className="flex flex-1 flex-col gap-1 px-1.5 pb-1.5 pt-1.5">
          <h4 className="line-clamp-2 text-[10.5px] font-bold leading-tight text-[var(--text)]">
            {item.name}
          </h4>

          {(item.container_name || item.location_path) && (
            <div className="mt-auto truncate pt-0.5">
              {item.container_name ? (
                <span className="inline-flex w-full items-center gap-1 truncate rounded-md bg-[var(--surface-tint-strong)] px-1.5 py-1 text-[9px] font-bold text-[var(--text)]">
                  <Boxes className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{item.container_name}</span>
                </span>
              ) : (
                <span className="inline-flex w-full items-center gap-1 truncate rounded-md bg-[var(--surface-tint)] px-1.5 py-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.location_path}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    )
  }
  const renderListRow = (item: InvItem) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
    const subtitle = [item.brand, item.category].filter(Boolean).join(" · ")
    return (
      <div
        key={item.id}
        onClick={() => router.push(`/${sessionId}/inventory/${item.id}`)}
        className="group relative flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 transition-all duration-200 active:scale-[0.98] hover:border-[var(--text)]/20 hover:shadow-md"
      >
        {/* Image Thumbnail */}
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-tint)]">
          {item.has_image ? (
            <img
              src={`/api/inventory/items/${item.id}/image`}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package className="h-5 w-5 text-[var(--muted)] opacity-40" />
          )}
          {/* Status dot overlay */}
          <span className={cn("absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-[1.5px] ring-[var(--card)]", cfg.dot)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-bold text-[var(--text)]">
              {item.name}
            </p>
            <span className="shrink-0 rounded bg-[var(--surface-tint)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--muted)]">
              {item.quantity} {item.unit}
            </span>
          </div>

          {subtitle && (
            <p className="truncate text-[10px] font-medium text-[var(--muted)]">
              {subtitle}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px]">
            {item.location_path ? (
              <span className="inline-flex max-w-[140px] items-center gap-0.5 truncate text-[var(--muted)]">
                <MapPin className="h-2 w-2 shrink-0" />
                <span className="truncate">{item.location_path}</span>
              </span>
            ) : null}

            {item.container_name ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-[var(--surface-tint-strong)] px-1 py-px font-bold text-[var(--text)]">
                <Boxes className="h-2 w-2 shrink-0" />
                <span>{item.container_name}</span>
              </span>
            ) : null}
          </div>
        </div>

        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)] opacity-40 transition-opacity group-hover:opacity-80" />
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
            <MobileIconButton label={tr("Tambah", "Add")} onClick={() => openCreate()}>
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
            <DesktopPageAction onClick={() => openCreate()}>
              <Plus size={16} />
              {tr("Tambah Barang", "Add Item")}
            </DesktopPageAction>
          }
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="md:hidden px-1 pb-24 pt-1 space-y-4">
        {/* ── HERO STATS STRIP (REDESIGNED) ── */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="space-y-4">
            {/* Top Row: Title + Actions */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-black tracking-tight text-[var(--text)]">
                  {summary ? summary.total_units : "—"}
                </span>
                <span className="ml-1.5 text-xs font-semibold text-[var(--muted)]">
                  {tr("unit", "units")} · {summary ? summary.total_types : 0} {tr("jenis", "types")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openCreate()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-3 py-2 text-xs font-bold text-[var(--bg)] shadow-sm transition active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{tr("Tambah", "Add")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2 text-[var(--text)] transition active:scale-95"
                  title={tr("Tambah Lokasi", "Add Location")}
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stats Grid - 4 compact stat tiles */}
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { label: tr("Ada", "Avail"), count: summary?.available ?? 0, dot: "bg-emerald-500" },
                { label: tr("Pinjam", "Loaned"), count: summary?.loaned ?? 0, dot: "bg-sky-400" },
                { label: tr("Hilang", "Missing"), count: summary?.missing ?? 0, dot: "bg-rose-500" },
                { label: tr("Rosak", "Damaged"), count: summary?.damaged ?? 0, dot: "bg-amber-400" },
              ] as const).map((st) => (
                <div key={st.label} className="flex flex-col items-center gap-0.5 rounded-xl bg-[var(--surface-tint)] py-2 px-1">
                  <div className="flex items-center gap-1">
                    <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                    <span className="text-base font-black text-[var(--text)]">{st.count}</span>
                  </div>
                  <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">{st.label}</span>
                </div>
              ))}
            </div>

            {/* Storage Place Quick Stats */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("locations")}
                className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 transition active:scale-[0.98]"
              >
                <MapPin className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-black text-[var(--text)]">{locations.length}</span>
                  <span className="block truncate text-[9px] font-semibold text-[var(--muted)]">{tr("Lokasi", "Locations")}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("locations")}
                className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 transition active:scale-[0.98]"
              >
                <Boxes className="h-4 w-4 shrink-0 text-sky-400" />
                <div className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-black text-[var(--text)]">{totalBoxesCount}</span>
                  <span className="block truncate text-[9px] font-semibold text-[var(--muted)]">{tr("Bekas", "Boxes")}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("missing")}
                className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 transition active:scale-[0.98]"
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_CONFIG.missing.dot)} />
                <div className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-black text-[var(--text)]">{summary?.missing ?? 0}</span>
                  <span className="block truncate text-[9px] font-semibold text-[var(--muted)]">{tr("Hilang", "Missing")}</span>
                </div>
              </button>
            </div>

            {/* Status Filter Chips */}
            {summary && (
              <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter("")}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95",
                    statusFilter === ""
                      ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                      : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
                  )}
                >
                  <span>{tr("Semua", "All")}</span>
                  <span className="opacity-75">({summary.total_types})</span>
                </button>

                {([
                  { key: "available", label: tr("Ada", "Available"), count: summary.available },
                  { key: "loaned", label: tr("Dipinjam", "Loaned"), count: summary.loaned },
                  { key: "missing", label: tr("Hilang", "Missing"), count: summary.missing },
                  { key: "damaged", label: tr("Rosak", "Damaged"), count: summary.damaged },
                ] as const).map((st) => {
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
                  displayMode === "gallery" ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"
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
                  displayMode === "list" ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"
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
                placeholder={tr("Cari barang atau lokasi...", "Search item or location...")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-9 text-xs font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--text)]"
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
                  className="inline-flex items-center gap-1 font-bold text-[var(--text)] hover:underline"
                >
                  <X className="h-3 w-3" />
                  {tr("Padam Penapis", "Reset")}
                </button>
              </div>
            )}

            {loading && items.length === 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5 py-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
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
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {filteredItems.map(renderMobile3ColCard)}
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
                  <FolderPlus className="h-3.5 w-3.5 text-[var(--text)]" />
                  <span>{tr("Lokasi", "Location")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingCont(null); setDefaultContLocId(""); setShowContModal(true) }}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-bold text-[var(--text)] shadow-sm active:scale-95"
                >
                  <BoxSelect className="h-3.5 w-3.5 text-[var(--text)]" />
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
                    className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition hover:border-[var(--text)]/30"
                    style={{ marginLeft: depth ? `${depth * 14}px` : "0px" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Clickable location title to view items inside */}
                      <div
                        onClick={() => setSelectedLocationForView(loc)}
                        className="flex flex-1 cursor-pointer items-center gap-2.5 active:opacity-75"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs text-[var(--text)] group-hover:text-[var(--text)]">{loc.name}</span>
                          <p className="text-[10px] text-[var(--muted)]">
                            {loc.item_types} {tr("jenis", "types")} · {loc.item_units} {tr("unit", "units")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => { setEditingLoc(null); setDefaultParentLocId(String(loc.id)); setShowLocModal(true) }}
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                          title={tr("Tambah Sub-Lokasi", "Add Sub-location")}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingCont(null); setDefaultContLocId(String(loc.id)); setShowContModal(true) }}
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                          title={tr("Tambah Bekas", "Add Box")}
                        >
                          <Boxes className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingLoc(loc); setShowLocModal(true) }}
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                          title={tr("Edit", "Edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {conts.length > 0 && (
                      <div className="mt-3 border-t border-[var(--border)]/60 pt-2.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                            <Boxes className="h-3.5 w-3.5 text-[var(--muted)]" />
                            {tr("Bekas / Kotak", "Boxes & Containers")} ({conts.length})
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {conts.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedContainerForView(c)}
                              className="group relative flex flex-col items-start justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5 text-left shadow-sm transition hover:border-[var(--text)]/40 hover:bg-[var(--surface-tint-strong)] active:scale-[0.96]"
                            >
                              <div className="flex w-full items-center justify-between gap-1">
                                <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
                                  <Boxes className="h-3.5 w-3.5" />
                                </div>
                                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-1.5 py-0.2 text-[9px] font-black text-[var(--text)]">
                                  {c.item_types} {tr("jenis", "types")}
                                </span>
                              </div>
                              <span className="mt-2 line-clamp-1 w-full text-xs font-black text-[var(--text)] transition-colors">
                                {c.name}
                              </span>
                              <span className="mt-0.5 text-[9px] font-semibold text-[var(--muted)]">
                                {c.item_units} {tr("unit", "units")}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP VIEW (LEFT FOLDER TREE + RIGHT ITEMS GRID) ── */}
      <div className="hidden md:block">
        <DesktopPageBody className="space-y-5">
          {/* Desktop Dual-Pane: Folder Tree (Left) + Main Explorer (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[290px_1fr] gap-5 items-start">
            {/* ── LEFT PANEL: FOLDER TREE SIDEBAR ── */}
            <aside className="sticky top-20 flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4 text-[var(--text)]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                    {tr("Struktur Folder", "Folder Tree")}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setEditingLoc(null); setDefaultParentLocId(""); setShowLocModal(true) }}
                    className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)] transition"
                    title={tr("Tambah Lokasi", "Add Location")}
                  >
                    <FolderPlus className="h-3.5 w-3.5 text-[var(--text)]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingCont(null); setDefaultContLocId(""); setShowContModal(true) }}
                    className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)] transition"
                    title={tr("Tambah Bekas / Kotak", "Add Container")}
                  >
                    <Boxes className="h-3.5 w-3.5 text-[var(--text)]" />
                  </button>
                </div>
              </div>

              {/* Tree Root & Items */}
              <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-14rem)] pr-1">
                {/* Root: Semua Barang */}
                <button
                  type="button"
                  onClick={() => setSelectedFolder({ type: "all" })}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98]",
                    selectedFolder.type === "all"
                      ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                      : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="truncate">{tr("Semua Barang", "All Items")}</span>
                  </div>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-black",
                    selectedFolder.type === "all"
                      ? "bg-[var(--bg)] text-[var(--text)]"
                      : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                  )}>
                    {items.length}
                  </span>
                </button>

                {/* Locations Tree with Nested Boxes */}
                {locations.filter((l) => !l.parent_id).map((loc) => {
                  const locStats = locationItemCounts.get(loc.id) || { types: 0, units: 0 }
                  const locConts = containers.filter((c) => c.location_id === loc.id)
                  const subLocations = locations.filter((sub) => sub.parent_id === loc.id)
                  const isSelected = selectedFolder.type === "location" && selectedFolder.id === loc.id
                  const isExpanded = expandedLocIds.has(loc.id) || locConts.some((c) => selectedFolder.type === "container" && selectedFolder.id === c.id)

                  return (
                    <div key={loc.id} className="space-y-1">
                      <div
                        className={cn(
                          "group flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-bold transition",
                          isSelected
                            ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                            : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                        )}
                      >
                        <div
                          onClick={() => setSelectedFolder({ type: "location", id: loc.id, name: loc.name })}
                          className="flex flex-1 items-center gap-2 min-w-0 cursor-pointer"
                        >
                          {(locConts.length > 0 || subLocations.length > 0) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleExpand(loc.id)
                              }}
                              className="p-0.5 text-[var(--muted)] group-hover:text-[var(--text)]"
                            >
                              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")} />
                            </button>
                          ) : (
                            <span className="w-3.5" />
                          )}
                          <Folder className={cn("h-4 w-4 shrink-0", isSelected ? "" : "text-[var(--text)]")} />
                          <span className="truncate">{loc.name}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "rounded-full px-1.5 py-0.2 text-[10px] font-black",
                            isSelected
                              ? "bg-[var(--bg)] text-[var(--text)]"
                              : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                          )}>
                            {locStats.types}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingLoc(loc)
                              setShowLocModal(true)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--muted)] hover:text-[var(--text)] transition"
                            title={tr("Edit Lokasi", "Edit Location")}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Sub-locations and Containers */}
                      {isExpanded && (
                        <div className="ml-5 border-l-2 border-[var(--border)]/70 pl-2 space-y-1">
                          {/* Nested Sub-locations */}
                          {subLocations.map((subLoc) => {
                            const subStats = locationItemCounts.get(subLoc.id) || { types: 0, units: 0 }
                            const isSubSelected = selectedFolder.type === "location" && selectedFolder.id === subLoc.id
                            return (
                              <div
                                key={subLoc.id}
                                onClick={() => setSelectedFolder({ type: "location", id: subLoc.id, name: subLoc.name })}
                                className={cn(
                                  "group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-[11px] font-bold transition",
                                  isSubSelected
                                    ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                                    : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                                )}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Folder className={cn("h-3.5 w-3.5 shrink-0", isSubSelected ? "" : "text-[var(--text)]")} />
                                  <span className="truncate">{subLoc.name}</span>
                                </div>
                                <span className={cn(
                                  "rounded-full px-1.5 text-[9px] font-black",
                                  isSubSelected
                                    ? "bg-[var(--bg)] text-[var(--text)]"
                                    : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                                )}>
                                  {subStats.types}
                                </span>
                              </div>
                            )
                          })}

                          {/* Nested Containers / Boxes */}
                          {locConts.map((cont) => {
                            const contStats = containerItemCounts.get(cont.id) || { types: 0, units: 0 }
                            const isContSelected = selectedFolder.type === "container" && selectedFolder.id === cont.id
                            return (
                              <div
                                key={cont.id}
                                onClick={() => setSelectedFolder({ type: "container", id: cont.id, name: cont.name, locName: loc.name })}
                                className={cn(
                                  "group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-[11px] font-bold transition",
                                  isContSelected
                                    ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                                    : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                                )}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Boxes className={cn("h-3.5 w-3.5 shrink-0", isContSelected ? "text-[var(--bg)]" : "text-[var(--muted)]")} />
                                  <span className="truncate">{cont.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className={cn(
                                    "rounded-full px-1.5 text-[9px] font-black",
                                    isContSelected
                                      ? "bg-[var(--bg)] text-[var(--text)]"
                                      : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                                  )}>
                                    {contStats.types}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingCont(cont)
                                      setShowContModal(true)
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--muted)] hover:text-[var(--text)] transition"
                                    title={tr("Edit Bekas", "Edit Box")}
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Unassigned Bucket */}
                {unassignedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedFolder({ type: "unassigned" })}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98]",
                      selectedFolder.type === "unassigned"
                        ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                        : "text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{tr("Tiada Lokasi", "Unassigned")}</span>
                    </div>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-black",
                      selectedFolder.type === "unassigned"
                        ? "bg-[var(--bg)] text-[var(--text)]"
                        : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                    )}>
                      {unassignedCount}
                    </span>
                  </button>
                )}
              </div>
            </aside>

            {/* ── RIGHT PANEL: MAIN ITEMS EXPLORER & GALLERY ── */}
            <main className="space-y-4 min-w-0">
              {/* Active Folder Header Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    {selectedFolder.type === "container" ? (
                      <Boxes className="h-5 w-5 text-[var(--text)]" />
                    ) : selectedFolder.type === "location" ? (
                      <Folder className="h-5 w-5 text-[var(--text)]" />
                    ) : (
                      <FolderTree className="h-5 w-5 text-[var(--text)]" />
                    )}
                    <h2 className="text-base font-black text-[var(--text)]">
                      {selectedFolder.type === "all"
                        ? tr("Semua Barang Inventori", "All Inventory Items")
                        : selectedFolder.type === "unassigned"
                        ? tr("Barang Tiada Lokasi", "Unassigned Items")
                        : selectedFolder.type === "location"
                        ? selectedFolder.name
                        : `${selectedFolder.name} (${selectedFolder.locName || ""})`}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {filteredItems.length} {tr("jenis barang dijumpai", "items in this folder")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedFolder.type === "location") {
                        openCreate(String(selectedFolder.id))
                      } else if (selectedFolder.type === "container") {
                        openCreate(undefined, String(selectedFolder.id))
                      } else {
                        openCreate()
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-3.5 py-2 text-xs font-bold text-[var(--bg)] shadow-sm transition hover:opacity-90 active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{tr("Tambah Barang", "Add Item")}</span>
                  </button>

                  {/* Display Mode Toggle */}
                  <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setDisplayMode("gallery")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition",
                        displayMode === "gallery" ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                      title={tr("Paparan Galeri", "Gallery View")}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span>{tr("Galeri", "Gallery")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode("list")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition",
                        displayMode === "list" ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                      title={tr("Paparan Senarai", "List View")}
                    >
                      <ListIcon className="h-3.5 w-3.5" />
                      <span>{tr("Senarai", "List")}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Chips & Search Row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {summary && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setStatusFilter("")}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition active:scale-95",
                        statusFilter === "" ? "bg-[var(--text)] text-[var(--bg)] shadow-sm" : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
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
                            "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition active:scale-95",
                            isSelected ? cfg.pillActive : cfg.pillInactive
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                          <span>{st.label}</span>
                          <span>({st.count})</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Search Bar */}
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tr("Cari barang...", "Search items...")}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-1.5 pl-9 pr-8 text-xs font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)]"
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
              </div>

              {/* Categories Toolbar */}
              {categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("")}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-bold transition",
                      categoryFilter === ""
                        ? "bg-[var(--text)] text-[var(--bg)]"
                        : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                  >
                    {tr("Semua", "All")} ({items.length})
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
                          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition",
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

              {/* Items Grid / List Content */}
              <div>
                {loading && items.length === 0 ? (
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
                    ))}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-12 text-center text-sm text-[var(--muted)]">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-[var(--text)]">{tr("Tiada barang dalam folder ini.", "No items in this folder.")}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">{tr("Sila tambah barang atau pilih folder lain.", "Add items or select another folder.")}</p>
                  </div>
                ) : displayMode === "gallery" ? (
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredItems.map(renderGalleryCard)}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredItems.map(renderListRow)}
                  </div>
                )}
              </div>
            </main>
          </div>
        </DesktopPageBody>
      </div>

      {/* ── MODAL SHEETS ── */}
      {showForm && (
        <ItemForm
          item={editing}
          locations={locations}
          containers={containers}
          defaultLocId={prefilledLocId}
          defaultContId={prefilledContId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}

      {/* Location Items Viewer Modal */}
      {selectedLocationForView && (
        <LocationItemsSheet
          location={selectedLocationForView}
          items={items}
          containers={containers}
          onClose={() => setSelectedLocationForView(null)}
          onOpenItem={(it) => {
            setSelectedLocationForView(null)
            router.push(`/${sessionId}/inventory/${it.id}`)
          }}
          onAddItem={() => {
            const locId = String(selectedLocationForView.id)
            setSelectedLocationForView(null)
            openCreate(locId)
          }}
          onEditLocation={(loc) => {
            setSelectedLocationForView(null)
            setEditingLoc(loc)
            setShowLocModal(true)
          }}
          onViewInGallery={() => {
            const locName = selectedLocationForView.name
            setSelectedLocationForView(null)
            setActiveTab("items")
            setLocationFilter(locName)
          }}
          tr={tr}
          isBm={isBm}
        />
      )}

      {/* Container / Box Items Viewer Modal */}
      {selectedContainerForView && (
        <LocationItemsSheet
          container={selectedContainerForView}
          items={items}
          containers={containers}
          onClose={() => setSelectedContainerForView(null)}
          onOpenItem={(it) => {
            setSelectedContainerForView(null)
            router.push(`/${sessionId}/inventory/${it.id}`)
          }}
          onAddItem={() => {
            const locId = selectedContainerForView.location_id ? String(selectedContainerForView.location_id) : ""
            const contId = String(selectedContainerForView.id)
            setSelectedContainerForView(null)
            openCreate(locId, contId)
          }}
          onEditContainer={(cont) => {
            setSelectedContainerForView(null)
            setEditingCont(cont)
            setShowContModal(true)
          }}
          onViewInGallery={() => {
            const contName = selectedContainerForView.name
            setSelectedContainerForView(null)
            setActiveTab("items")
            setSearch(contName)
          }}
          tr={tr}
          isBm={isBm}
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

// ── LOCATION / CONTAINER ITEMS VIEWER SHEET ──────────────────────────────────

function LocationItemsSheet({
  location,
  container,
  items,
  containers,
  onClose,
  onOpenItem,
  onAddItem,
  onEditLocation,
  onEditContainer,
  onViewInGallery,
  tr,
  isBm,
}: {
  location?: InvLocation | null
  container?: InvContainer | null
  items: InvItem[]
  containers: InvContainer[]
  onClose: () => void
  onOpenItem: (item: InvItem) => void
  onAddItem: () => void
  onEditLocation?: (loc: InvLocation) => void
  onEditContainer?: (cont: InvContainer) => void
  onViewInGallery?: () => void
  tr: (bm: string, en: string) => string
  isBm: boolean
}) {
  const swipe = useSwipeDownToClose(onClose)

  const matchedItems = useMemo(() => {
    if (container) {
      return items.filter(
        (i) =>
          i.container_name === container.name ||
          (container.id && i.container_id === container.id)
      )
    }
    if (location) {
      return items.filter(
        (i) =>
          i.location_path &&
          (i.location_path === location.name ||
            i.location_path.startsWith(location.name + " >") ||
            i.location_path.includes(location.name))
      )
    }
    return []
  }, [items, location, container])

  const totalUnits = useMemo(() => {
    return matchedItems.reduce((acc, it) => acc + (it.quantity || 0), 0)
  }, [matchedItems])

  const title = container ? container.name : location?.name || ""
  const subtitle = container
    ? container.location_path
      ? `📍 ${container.location_path}`
      : tr("Bekas / Kotak", "Box / Container")
    : tr("Lokasi Penyimpanan", "Storage Location")

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
        className="app-sheet-panel app-sheet-panel--lg w-full max-h-[88dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[34rem] sm:rounded-3xl"
      >
        <AppSheetHeader
          title={title}
          eyebrow={subtitle}
          onClose={onClose}
          action={
            <button
              type="button"
              onClick={onAddItem}
              className="inline-flex items-center gap-1 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{tr("Tambah", "Add")}</span>
            </button>
          }
        />

        <div className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          {/* Summary Banner */}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--card)] shadow-sm">
                {container ? (
                  <Boxes className="h-5 w-5 text-sky-400" />
                ) : (
                  <MapPin className="h-5 w-5 text-emerald-400" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-[var(--text)]">
                  {matchedItems.length} {tr("jenis barang", "item types")}
                </p>
                <p className="text-[11px] font-semibold text-[var(--muted)]">
                  {totalUnits} {tr("unit keseluruhan", "total units")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {onViewInGallery && (
                <button
                  type="button"
                  onClick={onViewInGallery}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text)] transition hover:border-[var(--accent)] active:scale-95"
                  title={tr("Lihat dalam paparan galeri", "View in gallery mode")}
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>{tr("Galeri", "Gallery")}</span>
                </button>
              )}
              {location && onEditLocation && (
                <button
                  type="button"
                  onClick={() => onEditLocation(location)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                  title={tr("Edit Lokasi", "Edit Location")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {container && onEditContainer && (
                <button
                  type="button"
                  onClick={() => onEditContainer(container)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                  title={tr("Edit Bekas", "Edit Box")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* List of Items */}
          {matchedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-8 text-center">
              <Package className="h-8 w-8 text-[var(--muted)] opacity-50" />
              <p className="mt-2 text-xs font-bold text-[var(--text)]">
                {tr("Tiada barang disimpan di sini lagi", "No items stored here yet")}
              </p>
              <button
                type="button"
                onClick={onAddItem}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{tr("Tambah Barang Sekarang", "Add Item Now")}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Senarai Barang", "Items Stored")}
              </p>

              {matchedItems.map((item) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
                return (
                  <div
                    key={item.id}
                    onClick={() => onOpenItem(item)}
                    className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 transition hover:border-[var(--accent)]/30 hover:bg-[var(--card-active)] active:scale-[0.98]"
                  >
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]">
                      {item.has_image ? (
                        <img
                          src={`/api/inventory/items/${item.id}/image`}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-[var(--muted)] opacity-60" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {item.name}
                        </p>
                        <span className={cn("shrink-0 rounded-full border px-1.5 py-0.2 text-[8px] font-bold", cfg.badge)}>
                          {isBm ? cfg.labelBm : item.status_label || cfg.labelEn}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                        <span className="font-bold text-[var(--text)]">
                          {item.quantity} {item.unit}
                        </span>
                        {item.container_name && !container && (
                          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-tint)] px-1.5 py-0.5">
                            <Boxes className="h-2.5 w-2.5 text-sky-400" />
                            <span>{item.container_name}</span>
                          </span>
                        )}
                        {item.category && (
                          <span className="truncate">· {item.category}</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-[var(--muted)] opacity-60">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── ADD / EDIT ITEM SHEET FORM ───────────────────────────────────────────────

function ItemForm({
  item,
  locations,
  containers,
  defaultLocId,
  defaultContId,
  onClose,
  onSaved,
  authHeaders,
  tr,
}: {
  item: InvItem | null
  locations: InvLocation[]
  containers: InvContainer[]
  defaultLocId?: string
  defaultContId?: string
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
  const [locationId, setLocationId] = useState<string>(defaultLocId || "")
  const [containerId, setContainerId] = useState<string>(defaultContId || "")
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
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
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
                {STATUS_CONFIG &&
                  Object.keys(STATUS_CONFIG).map((s) => {
                    const cfg = STATUS_CONFIG[s as InvStatus]
                    return (
                      <option key={s} value={s}>
                        {tr(cfg.labelBm, cfg.labelEn)}
                      </option>
                    )
                  })}
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

          {editing && (
            <div className="border-t border-[var(--border)]/60 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(tr(`Padam lokasi "${editing.name}"?`, `Delete location "${editing.name}"?`))) return
                  setSaving(true)
                  try {
                    const res = await fetch(`/api/inventory/locations/${editing.id}`, {
                      method: "DELETE",
                      headers: authHeaders(),
                      credentials: "include",
                    })
                    if (!res.ok) {
                      const p = await res.json().catch(() => null)
                      throw new Error(p?.detail || "Failed to delete location")
                    }
                    onSaved()
                  } catch (err) {
                    showAlertRef.current(
                      tr("Ralat", "Error"),
                      err instanceof Error ? err.message : tr("Gagal padam lokasi.", "Failed to delete location."),
                      "error"
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-xs font-bold text-rose-500 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>{tr("Padam Lokasi Ini", "Delete This Location")}</span>
              </button>
            </div>
          )}
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

          {editing && (
            <div className="border-t border-[var(--border)]/60 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(tr(`Padam bekas "${editing.name}"?`, `Delete box "${editing.name}"?`))) return
                  setSaving(true)
                  try {
                    const res = await fetch(`/api/inventory/containers/${editing.id}`, {
                      method: "DELETE",
                      headers: authHeaders(),
                      credentials: "include",
                    })
                    if (!res.ok) {
                      const p = await res.json().catch(() => null)
                      throw new Error(p?.detail || "Failed to delete box")
                    }
                    onSaved()
                  } catch (err) {
                    showAlertRef.current(
                      tr("Ralat", "Error"),
                      err instanceof Error ? err.message : tr("Gagal padam bekas.", "Failed to delete box."),
                      "error"
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-xs font-bold text-rose-500 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>{tr("Padam Bekas / Kotak Ini", "Delete This Box / Container")}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>,
    document.body
  )
}
