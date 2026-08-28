"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  ChevronRight,
  Filter,
  LayoutGrid,
  List as ListIcon,
  Package,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tag,
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

const STATUS_CONFIG: Record<
  WarrantyStatus,
  { badge: string; pillActive: string; pillInactive: string; dot: string; labelBm: string; labelEn: string }
> = {
  active: {
    badge: "bg-[var(--surface-tint-strong)] text-[var(--text)] border-[var(--border)] font-bold",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-emerald-500",
    labelBm: "Aktif",
    labelEn: "Active",
  },
  expiring_soon: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-amber-400",
    labelBm: "Hampir Tamat",
    labelEn: "Expiring Soon",
  },
  expired: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-rose-500",
    labelBm: "Tamat",
    labelEn: "Expired",
  },
  unknown: {
    badge: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
    pillActive: "bg-[var(--text)] text-[var(--bg)] border-transparent shadow-sm",
    pillInactive: "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]",
    dot: "bg-zinc-400",
    labelBm: "Tiada Tarikh",
    labelEn: "No Date",
  },
}

export default function WarrantyListPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const { showAlert, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [devices, setDevices] = useState<DeviceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [search, setSearch] = useState("")
  const [showSearchPopup, setShowSearchPopup] = useState(false)
  const [statusFilter, setStatusFilter] = useState<WarrantyStatus | "">("")
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [displayMode, setDisplayMode] = useState<"gallery" | "list">("gallery")
  const [mounted, setMounted] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  const loadDevices = useCallback(async () => {
    if (!hasLoaded) setLoading(true)
    try {
      const res = await fetch("/api/warranties", {
        headers: authHeaders(),
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal muat peranti.", "Failed to load devices."))
      }
      const data = await res.json()
      setDevices(Array.isArray(data) ? data : [])
      setHasLoaded(true)
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal muat peranti.", "Failed to load devices."),
        "error",
      )
    } finally {
      setLoading(false)
    }
  }, [authHeaders, hasLoaded, tr])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  useEffect(() => {
    const open = showSearchPopup
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: open } }),
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }),
      )
    }
  }, [showSearchPopup])

  const closeSearchPopup = useCallback(() => {
    setShowSearchPopup(false)
    setSearch("")
  }, [])

  const openSearchPopup = useCallback(() => {
    setShowSearchPopup(true)
    setTimeout(() => searchInputRef.current?.focus(), 80)
  }, [])

  const { requestClose: requestSearchClose } = useOverlayBackClose({
    id: "warranty-search-popup",
    isOpen: showSearchPopup,
    onClose: closeSearchPopup,
  })
  const searchSwipe = useSwipeDownToClose(requestSearchClose)

  const boardStats = useMemo(() => {
    const total = devices.length
    const active = devices.filter((d) => d.warranty_status === "active").length
    const expiring = devices.filter((d) => d.warranty_status === "expiring_soon").length
    const expired = devices.filter((d) => d.warranty_status === "expired").length
    return { total, active, expiring, expired }
  }, [devices])

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of devices) {
      const key = (d.category || "").trim() || tr("Lain-lain", "Other")
      map.set(key, (map.get(key) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [devices, tr])

  const filteredDevices = useMemo(() => {
    let list = [...devices]
    if (statusFilter) {
      list = list.filter((d) => d.warranty_status === statusFilter)
    }
    if (categoryFilter) {
      list = list.filter((d) => {
        const key = (d.category || "").trim() || tr("Lain-lain", "Other")
        return key === categoryFilter
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((d) => {
        const hay = [d.device_name, d.brand, d.model, d.serial_number, d.store_or_seller]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
    }
    return list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
  }, [devices, statusFilter, categoryFilter, search, tr])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return devices
      .filter((d) => {
        const hay = [d.device_name, d.brand, d.model, d.serial_number]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => (a.device_name || "").localeCompare(b.device_name || ""))
  }, [devices, search])

  const statusLabel = useCallback(
    (status: WarrantyStatus) => {
      const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown
      return isBm ? cfg.labelBm : cfg.labelEn
    },
    [isBm],
  )

  const remainingLabel = useCallback(
    (d: DeviceItem) => {
      if (d.remaining_days == null) return "—"
      const days = d.remaining_days
      if (days < 0) return tr(`${Math.abs(days)} hari lewat`, `${Math.abs(days)} days overdue`)
      if (days === 0) return tr("Tamat hari ini", "Expires today")
      return tr(`${days} hari lagi`, `${days} days left`)
    },
    [tr],
  )

  const remainingPillClass = (status: WarrantyStatus) => {
    if (status === "expired") return "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]"
    if (status === "expiring_soon") return "bg-[var(--surface-tint)] text-[var(--text)] border-[var(--border)]"
    if (status === "active") return "bg-[var(--surface-tint-strong)] text-[var(--text)] border-[var(--border)]"
    return "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]"
  }

  // ── RENDER PHOTO GALLERY CARD ──────────────────────────────────────────────
  const renderGalleryCard = (d: DeviceItem) => {
    const cfg = STATUS_CONFIG[d.warranty_status] || STATUS_CONFIG.unknown
    const brandModel = [d.brand, d.model].filter(Boolean).join(" · ")
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => router.push(`/${sessionId}/warranty/${d.id}`)}
        className="group relative flex flex-col overflow-hidden rounded-[1.35rem] sm:rounded-2xl border border-[var(--border)] bg-[var(--card)] text-left transition hover:border-[var(--accent)]/40 hover:shadow-lg active:scale-[0.98]"
      >
        {/* Photo Canvas */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-900/60 border-b border-[var(--border)]/50">
          <WarrantyDeviceImage
            deviceId={d.id}
            hasImage={Boolean(d.has_image)}
            imageUrl={d.image_url}
            alt={d.device_name}
            className="absolute inset-0 h-full w-full"
            imgClassName="transition-transform duration-300 group-hover:scale-105"
            fallbackIconSize={40}
          />

          {/* Floating Days Tag (Top-Left) */}
          <span
            className={cn(
              "absolute left-2.5 top-2.5 inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-black backdrop-blur-md shadow",
              remainingPillClass(d.warranty_status)
            )}
          >
            {remainingLabel(d)}
          </span>

          {/* Floating Status Badge (Top-Right) */}
          <span
            className={cn(
              "absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black tracking-tight backdrop-blur-md shadow",
              cfg.badge
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
            <span>{statusLabel(d.warranty_status)}</span>
          </span>
        </div>

        {/* Card Body Details */}
        <div className="flex flex-1 flex-col justify-between gap-1.5 p-3 sm:p-3.5">
          <div>
            <h4 className="truncate text-sm sm:text-base font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
              {toTitleCase(d.device_name)}
            </h4>
            <p className="mt-0.5 truncate text-[10px] sm:text-[11px] font-semibold text-[var(--muted)]">
              {toTitleCase(brandModel) || d.serial_number}
            </p>
          </div>

          <div className="flex items-center justify-between gap-1 pt-1 text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-[var(--muted)]">
              <Calendar className="h-3 w-3 shrink-0 text-[var(--muted)]" />
              <span>{formatDateShort(d.warranty_expiry_date, dateLocale)}</span>
            </span>

            {d.purchase_price != null && (
              <span className="font-bold text-[var(--text)]">
                <MoneyAmount value={Number(d.purchase_price)} size="xs" />
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  // ── RENDER COMPACT LIST ROW ────────────────────────────────────────────────
  const renderListRow = (d: DeviceItem) => {
    const cfg = STATUS_CONFIG[d.warranty_status] || STATUS_CONFIG.unknown
    const brandModel = [d.brand, d.model].filter(Boolean).join(" · ")
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => router.push(`/${sessionId}/warranty/${d.id}`)}
        className="group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-left transition active:scale-[0.98] hover:border-[var(--accent)]/30 hover:bg-[var(--card-active)] shadow-sm"
      >
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]">
          <WarrantyDeviceImage
            deviceId={d.id}
            hasImage={Boolean(d.has_image)}
            imageUrl={d.image_url}
            alt={d.device_name}
            className="h-full w-full"
            imgClassName="transition-transform group-hover:scale-105"
            fallbackIconSize={22}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <p className="truncate text-xs sm:text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
              {toTitleCase(d.device_name)}
            </p>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-tight", cfg.badge)}>
              {statusLabel(d.warranty_status)}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--muted)]">
            {toTitleCase(brandModel) || d.serial_number}
            {d.purchase_price != null ? (
              <>
                {" · "}
                <MoneyAmount value={Number(d.purchase_price)} size="xs" className="inline text-[var(--muted)] font-semibold" />
              </>
            ) : null}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
            <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 font-bold", remainingPillClass(d.warranty_status))}>
              {remainingLabel(d)}
            </span>
            <span className="flex items-center gap-1 font-semibold text-[var(--muted)]">
              <Calendar className="h-3 w-3 text-amber-400" />
              <span>{tr("Tamat", "Expires")}: {formatDateShort(d.warranty_expiry_date, dateLocale)}</span>
            </span>
          </div>
        </div>

        <div className="shrink-0 pl-1 text-[var(--muted)] opacity-60">
          <ChevronRight className="h-4 w-4" />
        </div>
      </button>
    )
  }

  return (
    <>
      {/* ── HEADER PRESERVED ── */}
      <div className="md:hidden">
        <MobilePageHeader
          className="border-b border-[color:var(--border)] pb-4"
          title={tr("Waranti Saya", "My Warranty")}
          fallbackHref={`/${sessionId}`}
          action={
            <div className="flex items-center gap-1">
              <MobileIconButton label={tr("Semak", "Check")} onClick={openSearchPopup}>
                <Search className="h-5 w-5" />
              </MobileIconButton>
              <MobileIconButton label={tr("Tambah", "Add")} onClick={() => router.push(`/${sessionId}/warranty/add`)}>
                <Plus className="h-5 w-5" />
              </MobileIconButton>
            </div>
          }
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Waranti Saya", "My Warranty")}
          homeHref={`/${sessionId}`}
          actions={
            <div className="flex items-center gap-2">
              <DesktopPageAction onClick={openSearchPopup}>
                <Search size={16} />
                {tr("Semak Waranti", "Check Warranty")}
              </DesktopPageAction>
              <DesktopPageAction onClick={() => router.push(`/${sessionId}/warranty/add`)} variant="solid">
                <Plus size={16} />
                {tr("Tambah Peranti", "Add Device")}
              </DesktopPageAction>
            </div>
          }
        />
      </div>

      {/* ── MOBILE VIEW ── */}
      <div className="md:hidden px-1 pb-24 pt-1 space-y-4">
        {/* Mobile Hero Card (Monochrome) */}
        <section className="relative overflow-hidden rounded-[1.85rem] border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--text)] shadow-sm">
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-neutral-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 left-6 h-36 w-36 rounded-full bg-neutral-400/5 blur-3xl" />

          <div className="relative z-10 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {tr("Pengurusan Waranti", "Warranty Dashboard")}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-[var(--text)]">
                    {showDataSkeleton ? "—" : boardStats.total}
                  </span>
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    {tr("peranti berdaftar", "devices registered")}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  {boardStats.active} {tr("aktif", "active")} · {boardStats.expiring} {tr("hampir tamat", "expiring soon")}
                </p>
              </div>

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] shadow-sm">
                <ShieldCheck className="h-5 w-5 text-[var(--text)]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => router.push(`/${sessionId}/warranty/add`)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--text)] px-3 py-2.5 text-xs font-bold text-[var(--bg)] shadow-sm transition active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                <span>{tr("Tambah Peranti", "Add Device")}</span>
              </button>
              <button
                type="button"
                onClick={openSearchPopup}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 text-xs font-bold text-[var(--text)] transition active:scale-[0.98] hover:bg-[var(--card-active)]"
              >
                <Search className="h-4 w-4 text-[var(--text)]" />
                <span>{tr("Semak Cepat", "Quick Search")}</span>
              </button>
            </div>

            {/* Horizontal Filter Chips */}
            <div className="border-t border-[var(--border)]/60 pt-3">
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
                  <span className="opacity-75">({boardStats.total})</span>
                </button>

                {(
                  [
                    { key: "active", label: tr("Aktif", "Active"), count: boardStats.active },
                    { key: "expiring_soon", label: tr("Hampir", "Soon"), count: boardStats.expiring },
                    { key: "expired", label: tr("Tamat", "Expired"), count: boardStats.expired },
                  ] as const
                ).map((st) => {
                  const isSelected = statusFilter === st.key
                  const cfg = STATUS_CONFIG[st.key as WarrantyStatus]
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
          </div>
        </section>

        {/* View Switcher & Toolbar */}
        <div className="flex items-center justify-between gap-2">
          {/* Search bar mobile */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Cari peranti, jenama, siri...", "Search device, brand, serial...")}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-9 pr-8 text-xs font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--accent)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

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
        </div>

        {/* Category Pills Carousel */}
        {categories.length > 0 && (
          <div className="no-scrollbar -mx-2 flex items-center gap-1.5 overflow-x-auto px-2 pb-0.5">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95",
                categoryFilter === null
                  ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                  : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
              )}
            >
              <span>{tr("Semua Kategori", "All Categories")}</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat.name ? null : cat.name)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95",
                  categoryFilter === cat.name
                    ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                    : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
                )}
              >
                <Tag className="h-3 w-3 opacity-60" />
                <span>{toTitleCase(cat.name)}</span>
                <span className="opacity-75">({cat.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Device Cards (Mobile) */}
        {showDataSkeleton ? (
          <div className="grid grid-cols-2 gap-2.5 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
            ))}
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-4 py-12 text-center">
            <Shield className="h-8 w-8 text-[var(--muted)]" />
            <p className="mt-2 text-xs font-bold text-[var(--text)]">
              {tr("Tiada peranti dijumpai", "No devices found")}
            </p>
          </div>
        ) : displayMode === "gallery" ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {filteredDevices.map(renderGalleryCard)}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDevices.map(renderListRow)}
          </div>
        )}
      </div>

      {/* ── DESKTOP VIEW (FULL WIDTH PORTAL PAGE BODY) ── */}
      <div className="hidden md:block">
        <DesktopPageBody className="space-y-5">
          {/* Desktop Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--text)] shadow-sm">
            <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-[var(--accent)]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 left-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {tr("Pengurusan Waranti Peranti", "Device Warranty & Claims Management")}
                </p>
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span className="text-3xl font-black text-[var(--text)] lg:text-4xl">
                    {showDataSkeleton ? "—" : boardStats.total}
                  </span>
                  <span className="text-sm font-semibold text-[var(--muted)]">
                    {tr("Peranti Berdaftar", "Devices Registered")} · {boardStats.active} {tr("Aktif", "Active")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {boardStats.expiring} {tr("peranti hampir tamat tempoh", "expiring soon")} · {boardStats.expired} {tr("telah tamat waranti", "expired")}
                </p>
              </div>

              {/* Status Chips */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter("")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition hover:opacity-90 active:scale-95",
                    statusFilter === "" ? "bg-[var(--text)] text-[var(--bg)] shadow-md" : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
                  )}
                >
                  <span>{tr("Semua", "All")}</span>
                  <span>({boardStats.total})</span>
                </button>

                {(
                  [
                    { key: "active", label: tr("Aktif", "Active"), count: boardStats.active },
                    { key: "expiring_soon", label: tr("Hampir Tamat", "Expiring Soon"), count: boardStats.expiring },
                    { key: "expired", label: tr("Tamat", "Expired"), count: boardStats.expired },
                  ] as const
                ).map((st) => {
                  const isSelected = statusFilter === st.key
                  const cfg = STATUS_CONFIG[st.key as WarrantyStatus]
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
            </div>
          </section>

          {/* Desktop Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                  categoryFilter === null
                    ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                    : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                {tr("Semua Kategori", "All Categories")} ({devices.length})
              </button>
              {categories.map((cat) => {
                const isSelected = categoryFilter === cat.name
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setCategoryFilter(isSelected ? null : cat.name)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                      isSelected
                        ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                        : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                  >
                    <Tag className="h-3 w-3 opacity-60" />
                    <span>{toTitleCase(cat.name)}</span>
                    <span className="opacity-75">({cat.count})</span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              {/* Display Mode Toggle */}
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

              {/* Search Bar */}
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr("Cari peranti...", "Search devices...")}
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
            </div>
          </div>

          {/* Desktop Devices Cards Grid */}
          <div>
            {showDataSkeleton ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
                ))}
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-12 text-center text-sm text-[var(--muted)]">
                {tr("Tiada peranti dijumpai.", "No devices found.")}
              </div>
            ) : displayMode === "gallery" ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5">
                {filteredDevices.map(renderGalleryCard)}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDevices.map(renderListRow)}
              </div>
            )}
          </div>
        </DesktopPageBody>
      </div>

      {/* ── SEARCH POPUP MODAL ── */}
      {mounted && showSearchPopup
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-[var(--overlay)] p-0 md:items-center md:p-4">
              <button
                type="button"
                className="absolute inset-0"
                onClick={requestSearchClose}
                aria-label="Close"
              />
              <div
                data-swipe-sheet
                className="app-sheet-panel relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden border border-[var(--border)] bg-[var(--sheet-bg)] touch-pan-y md:max-h-[86vh] md:max-w-md md:rounded-2xl"
                {...searchSwipe}
              >
                <AppSheetHeader
                  title={tr("Semak Waranti", "Check Warranty")}
                  onClose={requestSearchClose}
                />
                <div className="p-4 border-b border-[var(--border)]/60">
                  <div className="relative">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                    />
                    <input
                      ref={searchInputRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={tr(
                        "Cari nama peranti atau nombor siri...",
                        "Search device name or serial number...",
                      )}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-10 text-xs sm:text-sm outline-none focus:border-[var(--accent)]"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)]"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div data-swipe-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
                  {!search.trim() ? (
                    <p className="py-8 text-center text-xs text-[var(--muted)]">
                      {tr(
                        "Taip nama peranti, jenama, model atau nombor siri.",
                        "Type device name, brand, model or serial number.",
                      )}
                    </p>
                  ) : searchResults.length === 0 ? (
                    <div className="py-8 text-center">
                      <AlertTriangle size={28} className="mx-auto text-[var(--muted)]/40" />
                      <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                        {tr("Tiada peranti ditemui.", "No devices found.")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {searchResults.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            closeSearchPopup()
                            router.push(`/${sessionId}/warranty/${d.id}`)
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-left transition active:scale-[0.98]"
                        >
                          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]">
                            <WarrantyDeviceImage
                              deviceId={d.id}
                              hasImage={Boolean(d.has_image)}
                              imageUrl={d.image_url}
                              alt={d.device_name}
                              className="h-full w-full"
                              fallbackIconSize={18}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-black text-[var(--text)]">
                              {toTitleCase(d.device_name)}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                              {toTitleCase([d.brand, d.model].filter(Boolean).join(" · ")) || d.serial_number}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wide",
                                (STATUS_CONFIG[d.warranty_status] || STATUS_CONFIG.unknown).badge,
                              )}
                            >
                              {statusLabel(d.warranty_status)}
                            </span>
                            <p className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]">
                              {formatDateShort(d.warranty_expiry_date, dateLocale)}
                            </p>
                          </div>
                          <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {alertModal}
    </>
  )
}
