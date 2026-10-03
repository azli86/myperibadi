"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Boxes, Check, FolderPlus, ImagePlus, LayoutGrid, List as ListIcon, Loader2, MapPin, Package, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { onDataChanged, shouldRefetchFor } from "@/hooks/useRealtime"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { CATEGORIES, DOT, ItemSheet, LocationOptions, PAGE, STATUSES, field, label, todayKey, type Common, type ConfirmFn, type InvContainer, type InvItem, type InvLocation, type InvStatus, type Summary, type Tree } from "@/components/inventory/shared"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

export default function InventoryPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [items, setItems] = useState<InvItem[]>([])
  const [total, setTotal] = useState(0)
  const [locations, setLocations] = useState<InvLocation[]>([])
  const [containers, setContainers] = useState<InvContainer[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tab, setTab] = useState<"items" | "places">("items")
  const [view, setView] = useState<"gallery" | "list">("gallery")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [category, setCategory] = useState("")
  const [placeFilter, setPlaceFilter] = useState<{ kind: "location" | "container" | "none"; id: number } | null>(null)
  const [itemSheet, setItemSheet] = useState<{ item: InvItem | null; locId?: string; contId?: string } | null>(null)
  const [locSheet, setLocSheet] = useState<{ loc: InvLocation | null; parentId?: string } | null>(null)
  const [contSheet, setContSheet] = useState<{ cont: InvContainer | null; locId?: string } | null>(null)
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])
  const errorOf = async (res: Response, fallback: string) => {
    const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof payload?.detail === "string" ? payload.detail : fallback
  }

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: String(PAGE) })
      if (search.trim()) qs.set("q", search.trim())
      if (statusFilter) qs.set("status", statusFilter)
      const opts = { headers: headers(), credentials: "include" as const, cache: "no-store" as const }
      const [itemsRes, sumRes, locRes, contRes] = await Promise.all([
        fetch(`/api/inventory/items?${qs}`, opts),
        fetch("/api/inventory/summary", opts),
        fetch("/api/inventory/locations", opts),
        fetch("/api/inventory/containers", opts),
      ])
      if (!itemsRes.ok) throw new Error()
      const data = await itemsRes.json()
      setItems(data.items || [])
      setTotal(Number(data.total || 0))
      if (sumRes.ok) setSummary(await sumRes.json())
      if (locRes.ok) setLocations(await locRes.json())
      if (contRes.ok) setContainers(await contRes.json())
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [headers, search, statusFilter])

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 280 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  useEffect(() => onDataChanged(({ resource }) => { if (shouldRefetchFor(resource, "inventory")) void load() }), [load])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(items.length) })
      if (search.trim()) qs.set("q", search.trim())
      if (statusFilter) qs.set("status", statusFilter)
      const res = await fetch(`/api/inventory/items?${qs}`, { headers: headers(), credentials: "include", cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setItems((prev) => [...prev, ...(data.items || [])])
        setTotal(Number(data.total || 0))
      }
    } finally {
      setLoadingMore(false)
    }
  }

  // Locations form a tree; an item in "Bilik > Rak" also counts as being in "Bilik".
  const childrenOf = useMemo(() => {
    const map = new Map<number | null, InvLocation[]>()
    for (const l of locations) map.set(l.parent_id, [...(map.get(l.parent_id) || []), l])
    return map
  }, [locations])
  const idsUnder = useCallback(
    (id: number) => {
      const out = new Set<number>([id])
      const walk = (p: number) => { for (const c of childrenOf.get(p) || []) { if (!out.has(c.id)) { out.add(c.id); walk(c.id) } } }
      walk(id)
      return out
    },
    [childrenOf]
  )
  const tree = useMemo(() => {
    const rows: Array<{ loc: InvLocation; depth: number }> = []
    const walk = (p: number | null, depth: number) => { for (const l of childrenOf.get(p) || []) { rows.push({ loc: l, depth }); walk(l.id, depth + 1) } }
    walk(null, 0)
    return rows
  }, [childrenOf])
  const unitsUnder = useCallback((id: number) => [...idsUnder(id)].reduce((s, i) => s + (locations.find((l) => l.id === i)?.item_units || 0), 0), [idsUnder, locations])

  const categories = useMemo(() => Array.from(new Set(items.map((i) => (i.category || "").trim()).filter(Boolean))).sort(), [items])

  const filtered = useMemo(() => {
    let list = items
    if (category) list = list.filter((i) => (i.category || "").trim() === category)
    if (placeFilter?.kind === "location") {
      const ids = idsUnder(placeFilter.id)
      list = list.filter((i) => i.location_id != null && ids.has(i.location_id))
    } else if (placeFilter?.kind === "container") {
      list = list.filter((i) => i.container_id === placeFilter.id)
    } else if (placeFilter?.kind === "none") {
      list = list.filter((i) => !i.location_id)
    }
    return list
  }, [items, category, placeFilter, idsUnder])

  const placeFilterName =
    placeFilter?.kind === "location" ? locations.find((l) => l.id === placeFilter.id)?.name
    : placeFilter?.kind === "container" ? containers.find((c) => c.id === placeFilter.id)?.name
    : placeFilter?.kind === "none" ? tr("Tiada lokasi", "No location") : ""

  const statusText = (s: InvStatus) =>
    ({ available: tr("Ada", "Available"), loaned: tr("Dipinjam", "Loaned"), missing: tr("Hilang", "Missing"), damaged: tr("Rosak", "Damaged"), disposed: tr("Dilupus", "Disposed"), used_up: tr("Habis", "Used up") })[s]

  const statusCount = (s: string) => (s ? (summary ? (summary[s as keyof Summary] as number) : 0) : summary?.total_types ?? 0)

  const openPlace = (kind: "location" | "container" | "none", id: number) => {
    setPlaceFilter({ kind, id })
    setTab("items")
  }

  const img = (it: InvItem, cls: string) =>
    it.has_image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/inventory/items/${it.id}/image`} alt={it.name} loading="lazy" className={cls} />
    ) : (
      <div className={cn("flex items-center justify-center bg-[var(--surface-tint)] text-[var(--muted)]", cls)}>
        <Package size={26} className="opacity-50" />
      </div>
    )

  const gallery = (it: InvItem) => (
    <li key={it.id}>
      <button type="button" onClick={() => router.push(`/${sessionId}/inventory/${it.id}`)} className="flex h-full w-full flex-col overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] text-left hover:border-[var(--border-strong)]">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-tint)]">
          {img(it, "h-full w-full object-cover")}
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text)]">
            <span className={cn("h-1.5 w-1.5 rounded-full", DOT[it.status])} />
            {statusText(it.status)}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <p className="line-clamp-2 break-words text-sm font-bold leading-snug text-[var(--text)]">{it.name}</p>
          <p className="text-xs text-[var(--muted)]">{it.quantity} {it.unit}{it.category ? ` · ${it.category}` : ""}</p>
          <p className="mt-auto flex items-center gap-1 truncate pt-1 text-xs font-semibold text-[var(--text-soft)]">
            {it.container_name ? <Boxes size={12} className="shrink-0" /> : <MapPin size={12} className="shrink-0" />}
            <span className="truncate">{it.container_name || it.location_path || tr("Tiada lokasi", "No location")}</span>
          </p>
        </div>
      </button>
    </li>
  )

  const row = (it: InvItem) => (
    <li key={it.id}>
      <button type="button" onClick={() => router.push(`/${sessionId}/inventory/${it.id}`)} className="flex w-full items-center gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-3 text-left hover:border-[var(--border-strong)]">
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full">{img(it, "h-full w-full object-cover")}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[var(--text)]">{it.name}</span>
          <span className="block truncate text-xs text-[var(--muted)]">{[it.brand, it.category].filter(Boolean).join(" · ") || statusText(it.status)}</span>
          <span className="block truncate text-xs text-[var(--text-soft)]">{it.container_name || it.location_path || tr("Tiada lokasi", "No location")}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-bold tabular-nums text-[var(--text)]">{it.quantity} <span className="text-xs font-semibold text-[var(--muted)]">{it.unit}</span></span>
          <span className="flex items-center gap-1 text-xs text-[var(--muted)]"><span className={cn("h-1.5 w-1.5 rounded-full", DOT[it.status])} />{statusText(it.status)}</span>
        </span>
      </button>
    </li>
  )

  const hasFilters = Boolean(search || statusFilter || category || placeFilter)
  const clearFilters = () => { setSearch(""); setStatusFilter(""); setCategory(""); setPlaceFilter(null) }
  const addItem = () => setItemSheet({ item: null, locId: placeFilter?.kind === "location" ? String(placeFilter.id) : "", contId: placeFilter?.kind === "container" ? String(placeFilter.id) : "" })

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Barang Saya", "My Inventory")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={addItem} label={tr("Tambah barang", "Add item")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Barang Saya", "My Inventory")}
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={addItem}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah barang", "Add item")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        <ModenHero
          label={
            <>
              <Boxes size={16} />
              {tr("Jumlah unit barang", "Total units")}
            </>
          }
          currency={null}
          amount={showSkeleton ? "—" : String(summary ? summary.total_units : items.length)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "types", tone: "neutral", icon: <Package size={15} strokeWidth={2.2} />, label: tr("Jenis barang", "Item types"), value: String(summary?.total_types ?? 0) },
            { key: "noloc", tone: (summary?.no_location ?? 0) > 0 ? "out" : "neutral", icon: <MapPin size={15} strokeWidth={2.2} />, label: tr("Tiada lokasi", "No location"), value: String(summary?.no_location ?? 0) },
          ]}
        />

        <div className="flex rounded-full border border-[var(--border)] p-1" role="tablist">
          {([["items", tr("Barang", "Items"), Package], ["places", tr("Lokasi & bekas", "Places & boxes"), MapPin]] as const).map(([k, text, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold", tab === k ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--muted)]")}>
              <Icon size={15} />
              {text}
            </button>
          ))}
        </div>

        {loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-10 text-center">
            <p className="text-sm font-bold text-[var(--text)]">{tr("Barang tidak dapat dimuatkan", "Items could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void load() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">{tr("Cuba lagi", "Try again")}</button>
          </div>
        ) : tab === "items" ? (
          <>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Cari barang, jenama, lokasi…", "Search items, brand, place…")} className={cn(field, "pl-10")} />
              </div>
              <div className="flex shrink-0 rounded-full border border-[var(--border)] p-0.5">
                {([["gallery", LayoutGrid, tr("Galeri", "Gallery")], ["list", ListIcon, tr("Senarai", "List")]] as const).map(([k, Icon, text]) => (
                  <button key={k} type="button" aria-label={text} aria-pressed={view === k} onClick={() => setView(k)} className={cn("flex h-11 w-11 items-center justify-center rounded-full", view === k ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--muted)]")}><Icon size={17} /></button>
                ))}
              </div>
            </div>

            <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[["", tr("Semua", "All")] as const, ...STATUSES.map((s) => [s, statusText(s)] as const)].map(([k, text]) => (
                <button key={k || "all"} type="button" role="tab" aria-selected={statusFilter === k} onClick={() => setStatusFilter(k)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold", statusFilter === k ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                  {text}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", statusFilter === k ? "bg-white/20" : "bg-[var(--surface-tint-strong)]")}>{statusCount(k)}</span>
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map((c) => (
                  <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)} className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold", category === c ? "border-[var(--text)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]")}>{c}</button>
                ))}
              </div>
            )}
            {placeFilter && (
              <div className="flex items-center justify-between gap-3 rounded-full border border-[var(--border)] py-2 pl-4 pr-2 text-sm">
                <span className="min-w-0 truncate text-[var(--muted)]">{tr("Dalam", "In")}: <span className="font-bold text-[var(--text)]">{placeFilterName}</span></span>
                <button type="button" onClick={() => setPlaceFilter(null)} className="h-8 shrink-0 rounded-full border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text)]">{tr("Buang", "Clear")}</button>
              </div>
            )}

            {showSkeleton ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]"><Package size={24} /></span>
                <p className="mt-4 text-base font-bold text-[var(--text)]">{hasFilters ? tr("Tiada padanan", "No matches") : tr("Belum ada barang", "No items yet")}</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{hasFilters ? tr("Cuba tapisan lain.", "Try a different filter.") : tr("Catat barang di rumah dan di mana anda simpan.", "Record what you own and where you keep it.")}</p>
                {hasFilters ? (
                  <button type="button" onClick={clearFilters} className="mt-5 h-11 rounded-full border border-[var(--border-strong)] px-6 text-sm font-semibold text-[var(--text)]">{tr("Kosongkan tapisan", "Clear filters")}</button>
                ) : (
                  <button type="button" onClick={addItem} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]"><Plus size={15} />{tr("Tambah barang", "Add item")}</button>
                )}
              </div>
            ) : (
              <>
                {view === "gallery" ? (
                  <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{filtered.map(gallery)}</ul>
                ) : (
                  <ul className="grid gap-2.5 lg:grid-cols-2">{filtered.map(row)}</ul>
                )}
                {items.length < total && (
                  <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)] disabled:opacity-50">
                    {loadingMore ? <Loader2 size={15} className="animate-spin" /> : null}
                    {tr(`Muat lagi (${total - items.length})`, `Load more (${total - items.length})`)}
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setLocSheet({ loc: null })} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)]"><FolderPlus size={16} />{tr("Lokasi baharu", "New location")}</button>
              <button type="button" onClick={() => setContSheet({ cont: null })} className="flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)]"><Boxes size={16} />{tr("Bekas baharu", "New box")}</button>
            </div>

            <section>
              <h2 className="mb-2 px-1 text-base font-bold text-[var(--text)]">{tr("Lokasi", "Locations")}</h2>
              {tree.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">{tr("Belum ada lokasi. Cth. Bilik tidur, Stor, Dapur.", "No locations yet. E.g. Bedroom, Store, Kitchen.")}</p>
              ) : (
                <ul className="space-y-2">
                  {tree.map(({ loc, depth }) => (
                    <li key={loc.id} style={{ marginLeft: Math.min(depth, 4) * 14 }} className="flex items-center gap-2 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] py-2.5 pl-3 pr-2">
                      <button type="button" onClick={() => openPlace("location", loc.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]"><MapPin size={16} /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-[var(--text)]">{loc.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">{unitsUnder(loc.id)} {tr("unit", "units")}{loc.child_count ? ` · ${loc.child_count} ${tr("sub-lokasi", "sub-locations")}` : ""}</span>
                        </span>
                      </button>
                      <button type="button" onClick={() => setLocSheet({ loc: null, parentId: String(loc.id) })} aria-label={tr("Tambah sub-lokasi", "Add sub-location")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Plus size={14} /></button>
                      <button type="button" onClick={() => setLocSheet({ loc })} aria-label={tr("Ubah", "Edit")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Pencil size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {(summary?.no_location ?? 0) > 0 && (
                <button type="button" onClick={() => openPlace("none", 0)} className="mt-2 flex h-11 w-full items-center justify-between rounded-full border border-dashed border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--muted)]">
                  <span>{tr("Barang tanpa lokasi", "Items without a location")}</span>
                  <span className="tabular-nums">{summary?.no_location}</span>
                </button>
              )}
            </section>

            <section>
              <h2 className="mb-2 px-1 text-base font-bold text-[var(--text)]">{tr("Bekas / kotak", "Boxes")}</h2>
              {containers.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">{tr("Belum ada bekas.", "No boxes yet.")}</p>
              ) : (
                <ul className="space-y-2">
                  {containers.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] py-2.5 pl-3 pr-2">
                      <button type="button" onClick={() => openPlace("container", c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]"><Boxes size={16} /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-[var(--text)]">{c.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">{c.item_units} {tr("unit", "units")}{c.location_path ? ` · ${c.location_path}` : ""}</span>
                        </span>
                      </button>
                      <button type="button" onClick={() => setContSheet({ cont: c })} aria-label={tr("Ubah", "Edit")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Pencil size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DesktopPageBody>

      {itemSheet && (
        <ItemSheet
          key={itemSheet.item?.id ?? "new"}
          state={itemSheet}
          locations={tree}
          containers={containers}
          categories={categories}
          headers={headers}
          errorOf={errorOf}
          tr={tr}
          showAlert={showAlert}
          onClose={() => setItemSheet(null)}
          onSaved={() => { setItemSheet(null); void load() }}
        />
      )}
      {locSheet && (
        <LocationSheet
          key={locSheet.loc?.id ?? `new-${locSheet.parentId || ""}`}
          state={locSheet}
          tree={tree}
          idsUnder={idsUnder}
          headers={headers}
          errorOf={errorOf}
          tr={tr}
          showAlert={showAlert}
          showConfirm={showConfirm}
          onClose={() => setLocSheet(null)}
          onSaved={() => { setLocSheet(null); void load() }}
        />
      )}
      {contSheet && (
        <ContainerSheet
          key={contSheet.cont?.id ?? "new"}
          state={contSheet}
          tree={tree}
          headers={headers}
          errorOf={errorOf}
          tr={tr}
          showAlert={showAlert}
          showConfirm={showConfirm}
          onClose={() => setContSheet(null)}
          onSaved={() => { setContSheet(null); void load() }}
        />
      )}
      {alertModal}
    </div>
  )
}

function LocationSheet({ state, tree, idsUnder, headers, errorOf, tr, showAlert, showConfirm, onClose, onSaved }: Common & {
  state: { loc: InvLocation | null; parentId?: string }
  tree: Tree
  idsUnder: (id: number) => Set<number>
  showConfirm: ConfirmFn
  onClose: () => void
  onSaved: () => void
}) {
  const loc = state.loc
  const [name, setName] = useState(loc?.name || "")
  const [parentId, setParentId] = useState(loc?.parent_id ? String(loc.parent_id) : state.parentId || "")
  const [saving, setSaving] = useState(false)
  const exclude = loc ? idsUnder(loc.id) : undefined

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (!name.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), tr("Nama lokasi wajib.", "A name is required."), "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(loc ? `/api/inventory/locations/${loc.id}` : "/api/inventory/locations", {
        method: loc ? "PATCH" : "POST",
        headers: headers(true),
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), parent_id: parentId ? Number(parentId) : null }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan.", "Could not save.")))
      onSaved()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
      setSaving(false)
    }
  }

  const remove = () => {
    if (!loc) return
    showConfirm(tr("Padam lokasi?", "Delete location?"), tr(`Padam ${loc.name}? Lokasi mesti kosong dahulu.`, `Delete ${loc.name}? It must be empty first.`), async () => {
      try {
        const res = await fetch(`/api/inventory/locations/${loc.id}`, { method: "DELETE", headers: headers(), credentials: "include" })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
        onSaved()
      } catch (err) {
        showAlert(tr("Tidak dapat padam", "Cannot delete"), err instanceof Error ? err.message : "", "error")
      }
    }, "warning")
  }

  return (
    <AppSheet
      open
      onClose={onClose}
      id="inventory-location-sheet"
      title={loc ? tr("Ubah lokasi", "Edit location") : tr("Lokasi baharu", "New location")}
      size="sm"
      footer={
        <div className="flex gap-2">
          {loc ? <button type="button" onClick={remove} aria-label={tr("Padam", "Delete")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500"><Trash2 size={16} /></button> : null}
          <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Simpan", "Save")}
          </button>
        </div>
      }
    >
      <form onSubmit={save} className="space-y-4">
        <div><label htmlFor="loc-name" className={label}>{tr("Nama", "Name")}</label><input id="loc-name" value={name} maxLength={190} onChange={(e) => setName(e.target.value)} placeholder={tr("cth. Stor", "e.g. Store room")} className={field} /></div>
        <div>
          <label htmlFor="loc-parent" className={label}>{tr("Di dalam (pilihan)", "Inside (optional)")}</label>
          <select id="loc-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className={field}>
            <LocationOptions tree={tree} tr={tr} exclude={exclude} />
          </select>
        </div>
      </form>
    </AppSheet>
  )
}

function ContainerSheet({ state, tree, headers, errorOf, tr, showAlert, showConfirm, onClose, onSaved }: Common & {
  state: { cont: InvContainer | null; locId?: string }
  tree: Tree
  showConfirm: ConfirmFn
  onClose: () => void
  onSaved: () => void
}) {
  const cont = state.cont
  const [name, setName] = useState(cont?.name || "")
  const [locationId, setLocationId] = useState(cont?.location_id ? String(cont.location_id) : state.locId || "")
  const [saving, setSaving] = useState(false)

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (!name.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), tr("Nama bekas wajib.", "A name is required."), "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(cont ? `/api/inventory/containers/${cont.id}` : "/api/inventory/containers", {
        method: cont ? "PATCH" : "POST",
        headers: headers(true),
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), location_id: locationId ? Number(locationId) : null }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan.", "Could not save.")))
      onSaved()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
      setSaving(false)
    }
  }

  const remove = () => {
    if (!cont) return
    showConfirm(tr("Padam bekas?", "Delete box?"), tr(`Padam ${cont.name}? Bekas mesti kosong dahulu.`, `Delete ${cont.name}? It must be empty first.`), async () => {
      try {
        const res = await fetch(`/api/inventory/containers/${cont.id}`, { method: "DELETE", headers: headers(), credentials: "include" })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
        onSaved()
      } catch (err) {
        showAlert(tr("Tidak dapat padam", "Cannot delete"), err instanceof Error ? err.message : "", "error")
      }
    }, "warning")
  }

  return (
    <AppSheet
      open
      onClose={onClose}
      id="inventory-container-sheet"
      title={cont ? tr("Ubah bekas", "Edit box") : tr("Bekas baharu", "New box")}
      size="sm"
      footer={
        <div className="flex gap-2">
          {cont ? <button type="button" onClick={remove} aria-label={tr("Padam", "Delete")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500"><Trash2 size={16} /></button> : null}
          <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Simpan", "Save")}
          </button>
        </div>
      }
    >
      <form onSubmit={save} className="space-y-4">
        <div><label htmlFor="box-name" className={label}>{tr("Nama", "Name")}</label><input id="box-name" value={name} maxLength={190} onChange={(e) => setName(e.target.value)} placeholder={tr("cth. Kotak alat", "e.g. Tool box")} className={field} /></div>
        <div>
          <label htmlFor="box-loc" className={label}>{tr("Lokasi (pilihan)", "Location (optional)")}</label>
          <select id="box-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={field}>
            <LocationOptions tree={tree} tr={tr} />
          </select>
        </div>
      </form>
    </AppSheet>
  )
}
