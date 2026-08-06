"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  MoreVertical,
  Package,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
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

/** "MAKAN NASI" / "makan nasi" → "Makan Nasi" */
function toTitleCase(value?: string | null) {
  const text = (value || "").trim()
  if (!text) return ""
  return text
    .toLowerCase()
    .replace(/(^|[\s\-_/&])([a-zA-ZÀ-ÿ])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`)
}

function statusBadgeClass(status: WarrantyStatus) {
  if (status === "active") return "bg-[var(--surface-tint)] text-[var(--text)]"
  if (status === "expiring_soon") return "bg-amber-500/12 text-amber-600"
  if (status === "expired") return "bg-rose-500/12 text-rose-600"
  return "bg-[var(--surface-tint)] text-[var(--muted)]"
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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const expiring = devices.filter((d) => d.warranty_status === "expiring_soon").length
    const expired = devices.filter((d) => d.warranty_status === "expired").length
    const active = devices.filter((d) => d.warranty_status === "active").length
    return { total, expiring, expired, active }
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

  const recentlyAdded = useMemo(() => {
    let list = [...devices]
    if (categoryFilter) {
      list = list.filter((d) => {
        const key = (d.category || "").trim() || tr("Lain-lain", "Other")
        return key === categoryFilter
      })
    }
    return list
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 8)
  }, [devices, categoryFilter, tr])

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
      if (status === "active") return toTitleCase(tr("Aktif", "Active"))
      if (status === "expiring_soon") return toTitleCase(tr("Hampir Tamat", "Expiring Soon"))
      if (status === "expired") return toTitleCase(tr("Tamat", "Expired"))
      return toTitleCase(tr("Tiada tarikh", "No date"))
    },
    [tr],
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


  const renderListRow = (d: DeviceItem) => {
    const brandModel = [d.brand, d.model].filter(Boolean).join(" · ")
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => router.push(`/${sessionId}/warranty/${d.id}`)}
        className="group flex w-full items-center gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-left transition active:scale-[0.99]"
      >
        <WarrantyDeviceImage
          deviceId={d.id}
          hasImage={Boolean(d.has_image)}
          imageUrl={d.image_url}
          alt={d.device_name}
          className="h-12 w-12 shrink-0 rounded-full"
          imgClassName="transition group-active:scale-[1.03]"
          fallbackIconSize={20}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-[var(--text)]">{toTitleCase(d.device_name)}</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">
            {toTitleCase(brandModel) || d.serial_number}
            {d.purchase_price != null ? (
              <>
                {" · "}
                <MoneyAmount value={Number(d.purchase_price)} size="xs" className="inline text-[var(--muted)]" />
              </>
            ) : null}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-[10px] font-bold",
              d.warranty_status === "expired"
                ? "text-rose-500"
                : d.warranty_status === "expiring_soon"
                  ? "text-amber-600"
                  : "text-emerald-600",
            )}
          >
            {formatDateShort(d.warranty_expiry_date, dateLocale)}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]">{remainingLabel(d)}</p>
        </div>
      </button>
    )
  }

  const renderDesktopCard = (d: DeviceItem) => {
    const brandModel = [d.brand, d.model].filter(Boolean).join(" · ")
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => router.push(`/${sessionId}/warranty/${d.id}`)}
        className="group overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] text-left transition hover:border-[color-mix(in_srgb,var(--accent2)_35%,var(--border))] active:scale-[0.99]"
      >
        <div className="relative h-28 w-full">
          <WarrantyDeviceImage
            deviceId={d.id}
            hasImage={Boolean(d.has_image)}
          imageUrl={d.image_url}
            alt={d.device_name}
            className="absolute inset-0 h-full w-full"
            imgClassName="transition group-hover:scale-[1.02]"
            fallbackIconSize={36}
          />
          <span
            className={cn(
              "absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wide",
              statusBadgeClass(d.warranty_status),
            )}
          >
            {statusLabel(d.warranty_status)}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <div>
            <p className="truncate text-sm font-black text-[var(--text)]">{toTitleCase(d.device_name)}</p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">
              {toTitleCase(brandModel) || d.serial_number}
            </p>
          </div>
          <p className="truncate text-[11px] text-[var(--muted)]">
            {tr("No. Siri", "Serial")}: {d.serial_number}
          </p>
          <div
            className={cn(
              "flex items-center justify-between rounded-2xl border px-3 py-2",
              d.warranty_status === "expired" && "border-rose-500/25 bg-rose-500/10",
              d.warranty_status === "expiring_soon" && "border-amber-500/25 bg-amber-500/10",
              d.warranty_status === "active" && "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10",
              (d.warranty_status === "unknown" || !d.warranty_status) &&
                "border-[var(--border)] bg-[var(--surface-tint)]/40",
            )}
          >
            <p className="text-[11px] font-black text-[var(--text)]">{remainingLabel(d)}</p>
            <p className="text-[10px] font-semibold text-[var(--muted)]">
              {formatDateShort(d.warranty_expiry_date, dateLocale)}
            </p>
          </div>
          {d.purchase_price != null ? (
            <p className="text-xs font-bold text-[var(--text)]">
              <MoneyAmount value={Number(d.purchase_price)} size="xs" />
            </p>
          ) : null}
        </div>
      </button>
    )
  }

  const categoryChips = categories.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setCategoryFilter(null)}
        className={cn(
          "shrink-0 rounded-full px-3.5 py-2 text-[11px] font-bold",
          categoryFilter === null
            ? "bg-[var(--text)] text-[var(--bg)]"
            : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]",
        )}
      >
        {toTitleCase(tr("Semua", "All"))} {devices.length}
      </button>
      {categories.map((cat) => (
        <button
          key={cat.name}
          type="button"
          onClick={() => setCategoryFilter(cat.name === categoryFilter ? null : cat.name)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-2 text-[11px] font-bold",
            categoryFilter === cat.name
              ? "bg-[var(--text)] text-[var(--bg)]"
              : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]",
          )}
        >
          {toTitleCase(cat.name)} <span className="opacity-70">{cat.count}</span>
        </button>
      ))}
    </div>
  ) : null

  const mobileBoard = (
    <div className="space-y-4">
      <section className="subscription-hero relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[#1a1a1a] p-5 text-[#f5f5f5]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
        <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="absolute -bottom-10 left-6 h-24 w-24 rounded-full bg-white/[0.03] blur-2xl" />
        <div className="relative">
          {showDataSkeleton ? (
            <>
              <AmountSkeleton className="h-7 w-40 bg-white/10" />
              <AmountSkeleton className="mt-2 h-4 w-48 bg-white/10" />
            </>
          ) : (
            <>
              <p className="force-white text-xl font-black leading-tight text-[#ffffff]">
                {tr("Waranti Saya", "My Warranty")}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#a3a3a3]">
                {devices.length === 0
                  ? tr(
                      "Simpan dan jejak waranti peranti anda di satu tempat.",
                      "Save and track your device warranties in one place.",
                    )
                  : tr(
                      "Semak status, tarikh tamat dan rekod tuntutan peranti anda.",
                      "Check status, expiry dates and claim records for your devices.",
                    )}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openSearchPopup}
                  className="hero-cta-primary inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-3 py-2.5 text-xs font-bold text-[var(--btn-primary-text)] transition hover:opacity-90 active:scale-[0.98]"
                >
                  <Search size={14} />
                  {tr("Semak", "Check")}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/${sessionId}/warranty/add`)}
                  className="hero-cta-secondary inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--border-light)] bg-[var(--btn-secondary-bg)] px-3 py-2.5 text-xs font-bold text-[var(--btn-secondary-text)] transition hover:bg-[var(--btn-secondary-hover)] active:scale-[0.98]"
                >
                  <Plus size={14} />
                  {tr("Tambah", "Add")}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2.5">
        {[
          {
            label: tr("Jumlah", "Total"),
            value: boardStats.total,
            icon: ShieldCheck,
            tone: "text-[var(--text)] bg-[var(--surface-tint)]",
          },
          {
            label: tr("Hampir tamat", "Soon expiring"),
            value: boardStats.expiring,
            icon: CalendarClock,
            tone: "text-[var(--text)] bg-[var(--surface-tint)]",
          },
          {
            label: tr("Tamat", "Expired"),
            value: boardStats.expired,
            icon: ShieldAlert,
            tone: "text-[var(--text)] bg-[var(--surface-tint)]",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)] px-2.5 py-3 text-center"
          >
            <div className={cn("mx-auto flex h-9 w-9 items-center justify-center rounded-full", stat.tone)}>
              <stat.icon size={16} />
            </div>
            <p className="mt-2 text-lg font-black tabular-nums text-[var(--text)]">
              {showDataSkeleton ? "—" : stat.value}
            </p>
            <p className="mt-0.5 text-[10px] font-bold leading-tight text-[var(--muted)]">
              {toTitleCase(stat.label)}
            </p>
          </div>
        ))}
      </section>

      {categories.length > 0 ? (
        <section>
          <p className="mb-2.5 px-0.5 text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
            {tr("Kategori", "Category")}
          </p>
          {categoryChips}
        </section>
      ) : null}

      <section>
        <div className="mb-2.5 flex items-center justify-between px-0.5">
          <p className="text-[0.625rem] font-bold tracking-wide text-[var(--muted)]">
            {tr("Baru ditambah", "Recently added")}
          </p>
          {devices.length > 0 ? (
            <button
              type="button"
              onClick={openSearchPopup}
              className="text-[11px] font-bold text-[var(--accent2)]"
            >
              {tr("Lihat semua", "View All")} →
            </button>
          ) : null}
        </div>
        {showDataSkeleton ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
                <AmountSkeleton className="h-4 w-36" />
                <AmountSkeleton className="mt-2 h-3 w-24" />
              </div>
            ))}
          </div>
        ) : recentlyAdded.length === 0 ? (
          <div className="rounded-[1.35rem] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            {categoryFilter
              ? tr("Tiada peranti dalam kategori ini.", "No devices in this category.")
              : tr("Tiada peranti ditemui.", "No devices found.")}
          </div>
        ) : (
          <div className="space-y-2.5">{recentlyAdded.map(renderListRow)}</div>
        )}
      </section>
    </div>
  )

  const desktopBoard = (
    <div className="space-y-5">
      {/* Hero banner */}
      <section className="subscription-hero relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[#1a1a1a] p-6 text-[#f5f5f5]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
        <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="absolute -bottom-14 left-10 h-36 w-36 rounded-full bg-white/[0.03] blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            {showDataSkeleton ? (
              <>
                <AmountSkeleton className="h-8 w-56 bg-white/10" />
                <AmountSkeleton className="mt-2 h-4 w-44 bg-white/10" />
              </>
            ) : (
              <>
                <p className="force-white text-2xl font-black leading-tight text-[#ffffff]">
                  {tr("Waranti Saya", "My Warranty")}
                </p>
                <p className="mt-1 max-w-lg text-sm font-semibold text-[#a3a3a3]">
                  {devices.length === 0
                    ? tr(
                        "Simpan dan jejak waranti peranti anda di satu tempat.",
                        "Save and track your device warranties in one place.",
                      )
                    : tr(
                        "Semak status, tarikh tamat dan rekod tuntutan peranti anda.",
                        "Check status, expiry dates and claim records for your devices.",
                      )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openSearchPopup}
                    className="hero-cta-primary inline-flex items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs font-bold text-[var(--btn-primary-text)] transition hover:opacity-90 active:scale-[0.98]"
                  >
                    <Search size={14} />
                    {tr("Semak Waranti", "Check Warranty")}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/${sessionId}/warranty/add`)}
                    className="hero-cta-secondary inline-flex items-center gap-1.5 rounded-full border border-[var(--border-light)] bg-[var(--btn-secondary-bg)] px-4 py-2.5 text-xs font-bold text-[var(--btn-secondary-text)] transition hover:bg-[var(--btn-secondary-hover)] active:scale-[0.98]"
                  >
                    <Plus size={14} />
                    {tr("Tambah Peranti", "Add Device")}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="grid w-full grid-cols-3 gap-3 lg:max-w-md lg:shrink-0">
            {[
              {
                label: tr("Jumlah", "Total"),
                value: boardStats.total,
                icon: ShieldCheck,
                color: "text-[#b3b3b3]",
              },
              {
                label: tr("Hampir", "Soon"),
                value: boardStats.expiring,
                icon: CalendarClock,
                color: "text-[#fcd34d]",
              },
              {
                label: tr("Tamat", "Expired"),
                value: boardStats.expired,
                icon: ShieldAlert,
                color: "text-[#fecdd3]",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-white/[0.06] p-4">
                <div className="flex items-center gap-2">
                  <stat.icon size={16} className={stat.color} />
                  <p className="text-[0.6rem] font-semibold tracking-wide text-[#a3a3a3]">
                    {toTitleCase(stat.label)}
                  </p>
                </div>
                <p className={cn("mt-3 text-2xl font-black tabular-nums leading-none", stat.color)}>
                  {showDataSkeleton ? "—" : stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories + list */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-bold tracking-wide text-[var(--muted)]">
              {categoryFilter
                ? toTitleCase(categoryFilter)
                : tr("Semua peranti", "All devices")}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {(categoryFilter
                ? devices.filter((d) => {
                    const key = (d.category || "").trim() || tr("Lain-lain", "Other")
                    return key === categoryFilter
                  }).length
                : devices.length)}{" "}
              {tr("peranti", "devices")}
            </p>
          </div>
          {categoryChips}
        </div>

        {showDataSkeleton ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]"
              />
            ))}
          </div>
        ) : (categoryFilter ? recentlyAdded : devices).length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] p-12 text-center">
            <Shield size={36} className="mx-auto text-[var(--muted)]/40" />
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">
              {categoryFilter
                ? tr("Tiada peranti dalam kategori ini.", "No devices in this category.")
                : tr("Tiada peranti ditemui.", "No devices found.")}
            </p>
            {!categoryFilter ? (
              <button
                type="button"
                onClick={() => router.push(`/${sessionId}/warranty/add`)}
                className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-xs font-bold text-[var(--bg)]"
              >
                {tr("Tambah Peranti Baharu", "Add New Device")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(categoryFilter
              ? recentlyAdded
              : [...devices].sort((a, b) =>
                  String(b.created_at || "").localeCompare(String(a.created_at || "")),
                )
            ).map(renderDesktopCard)}
          </div>
        )}
      </section>
    </div>
  )

  return (
    <div className="space-y-4 pb-24 md:space-y-0 md:pb-0">
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Waranti Saya", "My Warranty")}
          fallbackHref={`/${sessionId}`}
          action={
            <div ref={mobileMenuRef} className="relative">
              <MobileIconButton onClick={() => setMobileMenuOpen((v) => !v)} label={tr("Menu", "Menu")}>
                <MoreVertical size={16} />
              </MobileIconButton>
              {mobileMenuOpen ? (
                <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg shadow-black/10">
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); openSearchPopup() }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition active:scale-[0.98]"
                  >
                    <Search size={16} className="text-[var(--accent2)]" />
                    {tr("Semak Waranti", "Check Warranty")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); router.push(`/${sessionId}/warranty/add`) }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition active:scale-[0.98]"
                  >
                    <Plus size={16} className="text-emerald-500" />
                    {tr("Tambah Peranti", "Add Device")}
                  </button>
                </div>
              ) : null}
            </div>
          }
        />
        <div className="px-1">{mobileBoard}</div>
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Waranti Saya", "My Warranty")} homeHref={`/${sessionId}`} />
        <DesktopPageBody className="space-y-5">{desktopBoard}</DesktopPageBody>
      </div>

      {mounted && showSearchPopup
        ? createPortal(
  <div className="fixed inset-0 z-[80] flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center md:p-4">
              <button
                type="button"
                className="absolute inset-0"
                onClick={requestSearchClose}
                aria-label="Close"
              />
              <div
                data-swipe-sheet
                className="app-sheet-panel relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden border border-[var(--border)] bg-[var(--sheet-bg)] touch-pan-y md:max-h-[86vh] md:max-w-md md:rounded-[1.75rem]"
                {...searchSwipe}
              >
                <AppSheetHeader
                  title={tr("Semak Waranti", "Check Warranty")}
                  onClose={requestSearchClose}
                />
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
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-3 pl-10 pr-10 text-sm outline-none focus:border-[var(--accent2)]"
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
                <div data-swipe-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
                  {!search.trim() ? (
                    <p className="py-8 text-center text-sm text-[var(--muted)]">
                      {tr(
                        "Taip nama peranti, jenama, model atau nombor siri.",
                        "Type device name, brand, model or serial number.",
                      )}
                    </p>
                  ) : searchResults.length === 0 ? (
                    <div className="py-8 text-center">
                      <AlertTriangle size={28} className="mx-auto text-[var(--muted)]/40" />
                      <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                        {tr("Tiada peranti ditemui.", "No devices found.")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {searchResults.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            closeSearchPopup()
                            router.push(`/${sessionId}/warranty/${d.id}`)
                          }}
                          className="flex w-full items-center gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3 text-left transition active:scale-[0.99]"
                        >
                          <WarrantyDeviceImage
                            deviceId={d.id}
                            hasImage={Boolean(d.has_image)}
          imageUrl={d.image_url}
                            alt={d.device_name}
                            className="h-10 w-10 shrink-0 rounded-full"
                            fallbackIconSize={18}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-[var(--text)]">
                              {toTitleCase(d.device_name)}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                              {toTitleCase([d.brand, d.model].filter(Boolean).join(" · ")) ||
                                d.serial_number}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                              {tr("No. Siri", "Serial")}: {d.serial_number}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wide",
                                statusBadgeClass(d.warranty_status),
                              )}
                            >
                              {statusLabel(d.warranty_status)}
                            </span>
                            <p className="mt-1 text-[10px] font-semibold text-[var(--muted)]">
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
    </div>
  )
}
