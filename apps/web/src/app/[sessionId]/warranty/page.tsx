"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { LayoutGrid, List as ListIcon, Plus, Search, ShieldAlert, ShieldCheck, Shield } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { WarrantyDeviceImage } from "@/components/warranty/WarrantyDeviceImage"

type WarrantyStatus = "active" | "expiring_soon" | "expired" | "unknown"

type DeviceItem = {
  id: number
  device_name: string
  category?: string | null
  brand?: string | null
  model?: string | null
  serial_number: string
  store_or_seller?: string | null
  warranty_expiry_date?: string | null
  remaining_days?: number | null
  warranty_status: WarrantyStatus
  has_image?: boolean
  image_url?: string | null
  created_at?: string
}

const fmtDate = (value: string | null | undefined, locale: string) => {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

export default function WarrantyListPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const { showAlert, alertModal } = usePageAlert(lang)

  const [devices, setDevices] = useState<DeviceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<WarrantyStatus | "all">("all")
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [view, setView] = useState<"gallery" | "list">("gallery")
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)
  const other = tr("Lain-lain", "Other")

  const loadDevices = useCallback(async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/warranties", {
        headers: token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDevices(Array.isArray(data) ? data : [])
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
      showAlert(tr("Ralat", "Error"), tr("Gagal muat peranti.", "Failed to load devices."), "error")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  const stats = useMemo(
    () => ({
      active: devices.filter((d) => d.warranty_status === "active").length,
      expiring: devices.filter((d) => d.warranty_status === "expiring_soon").length,
      expired: devices.filter((d) => d.warranty_status === "expired").length,
    }),
    [devices]
  )

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of devices) {
      const key = (d.category || "").trim() || other
      map.set(key, (map.get(key) || 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [devices, other])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return devices
      .filter((d) => statusFilter === "all" || d.warranty_status === statusFilter)
      .filter((d) => !categoryFilter || ((d.category || "").trim() || other) === categoryFilter)
      .filter((d) => !q || [d.device_name, d.brand, d.model, d.serial_number, d.store_or_seller].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => {
        // Soonest to expire first among the live ones; the expired sink to the end.
        const ar = a.warranty_status === "expired" ? 1 : 0
        const br = b.warranty_status === "expired" ? 1 : 0
        if (ar !== br) return ar - br
        return (a.remaining_days ?? 99999) - (b.remaining_days ?? 99999)
      })
  }, [devices, statusFilter, categoryFilter, search, other])

  const statusText = (s: WarrantyStatus) =>
    ({ active: tr("Aktif", "Active"), expiring_soon: tr("Hampir tamat", "Expiring soon"), expired: tr("Tamat", "Expired"), unknown: tr("Tiada tarikh", "No date") })[s]
  const statusTone = (s: WarrantyStatus) =>
    s === "expired" ? "text-rose-500 border-rose-500/30" : s === "expiring_soon" ? "text-amber-600 dark:text-amber-400 border-amber-500/30" : s === "active" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "text-[var(--muted)] border-[var(--border)]"
  const remaining = (d: DeviceItem) => {
    if (d.remaining_days == null) return "—"
    if (d.remaining_days < 0) return tr(`Tamat ${Math.abs(d.remaining_days)} hari lalu`, `Expired ${Math.abs(d.remaining_days)} days ago`)
    if (d.remaining_days === 0) return tr("Tamat hari ini", "Expires today")
    return tr(`${d.remaining_days} hari lagi`, `${d.remaining_days} days left`)
  }

  const tabs: Array<[WarrantyStatus | "all", string, number]> = [
    ["all", tr("Semua", "All"), devices.length],
    ["active", tr("Aktif", "Active"), stats.active],
    ["expiring_soon", tr("Hampir tamat", "Expiring"), stats.expiring],
    ["expired", tr("Tamat", "Expired"), stats.expired],
  ]
  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent pl-10 pr-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const addHref = `/${sessionId}/warranty/add`

  const card = (d: DeviceItem) => {
    const sub = [d.brand, d.model].filter(Boolean).join(" · ")
    return (
      <li key={d.id}>
        <button type="button" onClick={() => router.push(`/${sessionId}/warranty/${d.id}`)} className="flex h-full w-full flex-col overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] text-left hover:border-[var(--border-strong)]">
          <div className="relative aspect-[4/3] w-full bg-[var(--surface-tint)]">
            <WarrantyDeviceImage deviceId={d.id} hasImage={Boolean(d.has_image)} imageUrl={d.image_url} alt={d.device_name} className="absolute inset-0 h-full w-full" fallbackIconSize={40} />
            <span className={cn("absolute left-3 top-3 rounded-full border bg-[var(--card)] px-2.5 py-0.5 text-xs font-semibold", statusTone(d.warranty_status))}>{statusText(d.warranty_status)}</span>
          </div>
          <div className="flex flex-1 flex-col gap-1 p-4">
            <p className="line-clamp-2 break-words text-base font-bold leading-snug text-[var(--text)]">{d.device_name}</p>
            <p className="truncate text-xs text-[var(--muted)]">{sub || d.category || tr("Tiada butiran", "No details")}</p>
            <p className={cn("mt-1 text-xs font-semibold", d.warranty_status === "expired" ? "text-rose-500" : d.warranty_status === "expiring_soon" ? "text-amber-600 dark:text-amber-400" : "text-[var(--text)]")}>{remaining(d)}</p>
          </div>
        </button>
      </li>
    )
  }

  const row = (d: DeviceItem) => (
    <li key={d.id}>
      <button type="button" onClick={() => router.push(`/${sessionId}/warranty/${d.id}`)} className="flex w-full items-center gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-3 text-left hover:border-[var(--border-strong)]">
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--surface-tint)]">
          <WarrantyDeviceImage deviceId={d.id} hasImage={Boolean(d.has_image)} imageUrl={d.image_url} alt={d.device_name} className="absolute inset-0 h-full w-full" fallbackIconSize={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[var(--text)]">{d.device_name}</span>
          <span className="block truncate text-xs text-[var(--muted)]">{[d.brand, d.model].filter(Boolean).join(" · ") || d.serial_number}</span>
          <span className="block truncate text-xs text-[var(--muted)]">{tr("Tamat", "Expires")} {fmtDate(d.warranty_expiry_date, locale)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusTone(d.warranty_status))}>{statusText(d.warranty_status)}</span>
          <span className="text-xs tabular-nums text-[var(--muted)]">{d.remaining_days != null && d.remaining_days >= 0 ? tr(`${d.remaining_days} hari`, `${d.remaining_days} d`) : ""}</span>
        </span>
      </button>
    </li>
  )

  return (
    <div className="pb-24 md:pb-0">
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Waranti Saya", "My Warranty")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={() => router.push(addHref)} label={tr("Tambah peranti", "Add device")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Waranti Saya", "My Warranty")}
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={() => router.push(addHref)}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah peranti", "Add device")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        <ModenHero
          label={
            <>
              <Shield size={16} />
              {tr("Peranti berwaranti", "Devices under warranty")}
            </>
          }
          currency={null}
          amount={showSkeleton ? "—" : String(stats.active + stats.expiring)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "soon", tone: stats.expiring > 0 ? "out" : "neutral", icon: <ShieldAlert size={15} strokeWidth={2.2} />, label: tr("Hampir tamat", "Expiring soon"), value: String(stats.expiring) },
            { key: "expired", tone: "neutral", icon: <ShieldCheck size={15} strokeWidth={2.2} />, label: tr("Telah tamat", "Expired"), value: String(stats.expired) },
          ]}
        />

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Cari nama, jenama, no. siri…", "Search name, brand, serial…")} className={field} />
          </div>
          <div className="flex shrink-0 rounded-full border border-[var(--border)] p-0.5">
            {([["gallery", LayoutGrid, tr("Galeri", "Gallery")], ["list", ListIcon, tr("Senarai", "List")]] as const).map(([key, Icon, text]) => (
              <button key={key} type="button" aria-label={text} aria-pressed={view === key} onClick={() => setView(key)} className={cn("flex h-11 w-11 items-center justify-center rounded-full", view === key ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--muted)]")}>
                <Icon size={17} />
              </button>
            ))}
          </div>
        </div>

        <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(([key, text, count]) => (
            <button key={key} type="button" role="tab" aria-selected={statusFilter === key} onClick={() => setStatusFilter(key)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold", statusFilter === key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
              {text}
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", statusFilter === key ? "bg-white/20" : "bg-[var(--surface-tint-strong)]")}>{count}</span>
            </button>
          ))}
        </div>
        {categories.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map(([name, count]) => (
              <button key={name} type="button" aria-pressed={categoryFilter === name} onClick={() => setCategoryFilter(categoryFilter === name ? null : name)} className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold", categoryFilter === name ? "border-[var(--text)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                {name} · {count}
              </button>
            ))}
          </div>
        )}

        {showSkeleton ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
            ))}
          </div>
        ) : loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <p className="text-sm font-bold text-[var(--text)]">{tr("Senarai tidak dapat dimuatkan", "The list could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void loadDevices() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
              {tr("Cuba lagi", "Try again")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
              <Shield size={24} />
            </span>
            <p className="mt-4 text-base font-bold text-[var(--text)]">{devices.length ? tr("Tiada padanan", "No matches") : tr("Belum ada peranti", "No devices yet")}</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{tr("Simpan tarikh waranti, resit dan tuntutan di satu tempat.", "Keep warranty dates, receipts and claims in one place.")}</p>
            {!devices.length && (
              <button type="button" onClick={() => router.push(addHref)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                <Plus size={15} />
                {tr("Tambah peranti", "Add device")}
              </button>
            )}
          </div>
        ) : view === "gallery" ? (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{filtered.map(card)}</ul>
        ) : (
          <ul className="grid gap-2.5 lg:grid-cols-2">{filtered.map(row)}</ul>
        )}
      </DesktopPageBody>

      {alertModal}
    </div>
  )
}
