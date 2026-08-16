"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRightLeft,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Boxes,
  Tag,
  FileText,
  ShieldCheck,
  Receipt,
  History,
  Image as ImageIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createPortal } from "react-dom"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
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

const STATUS_CONFIG: Record<
  InvStatus,
  { badge: string; dot: string; labelBm: string; labelEn: string; bgSoft: string }
> = {
  available: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-500",
    bgSoft: "bg-emerald-500/5",
    labelBm: "Ada",
    labelEn: "Available",
  },
  loaned: {
    badge: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    dot: "bg-sky-400",
    bgSoft: "bg-sky-500/5",
    labelBm: "Dipinjam",
    labelEn: "Loaned",
  },
  missing: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    dot: "bg-rose-500",
    bgSoft: "bg-rose-500/5",
    labelBm: "Hilang",
    labelEn: "Missing",
  },
  damaged: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
    bgSoft: "bg-amber-500/5",
    labelBm: "Rosak",
    labelEn: "Damaged",
  },
  disposed: {
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    dot: "bg-zinc-400",
    bgSoft: "bg-zinc-500/5",
    labelBm: "Dilupus",
    labelEn: "Disposed",
  },
  used_up: {
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    dot: "bg-zinc-400",
    bgSoft: "bg-zinc-500/5",
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

function fmtDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
}

function fmtDateOnly(value?: string | null) {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
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
  const [updatingQty, setUpdatingQty] = useState(false)

  const showAlertRef = useRef(showAlert)
  const trRef = useRef(tr)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])
  useEffect(() => { trRef.current = tr }, [tr])

  const load = useCallback(async () => {
    setLoading(true)
    const t = trRef.current
    const alert = showAlertRef.current
    try {
      const [iRes, mRes, lRes, cRes] = await Promise.all([
        fetch(`/api/inventory/items/${itemId}`, { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch(`/api/inventory/items/${itemId}/movements`, { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch("/api/inventory/locations", { headers: authHeaders(), credentials: "include", cache: "no-store" }),
        fetch("/api/inventory/containers", { headers: authHeaders(), credentials: "include", cache: "no-store" }),
      ])
      if (!iRes.ok) throw new Error(t("Barang tidak dijumpai.", "Item not found."))
      setItem(await iRes.json())
      if (mRes.ok) setMovements(await mRes.json())
      if (lRes.ok) setLocations(await lRes.json())
      if (cRes.ok) setContainers(await cRes.json())
    } catch (err) {
      alert(t("Ralat", "Error"), err instanceof Error ? err.message : t("Gagal muat.", "Failed to load."), "error")
    } finally {
      setLoading(false)
    }
  }, [authHeaders, itemId])

  useEffect(() => {
    load()
  }, [load])

  const changeQty = useCallback(
    async (operation: "add" | "subtract", amount: number) => {
      if (updatingQty) return
      setUpdatingQty(true)
      try {
        const res = await fetch(`/api/inventory/items/${itemId}/quantity`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          credentials: "include",
          body: JSON.stringify({ operation, amount }),
        })
        if (res.ok) {
          load()
        } else {
          const p = await res.json().catch(() => null)
          showAlert(
            tr("Ralat", "Error"),
            p?.detail || tr("Kuantiti tidak boleh negatif.", "Quantity cannot be negative."),
            "error"
          )
        }
      } catch {
        showAlert(tr("Ralat", "Error"), tr("Gagal kemas kini kuantiti.", "Failed to update quantity."), "error")
      } finally {
        setUpdatingQty(false)
      }
    },
    [authHeaders, itemId, load, showAlert, tr, updatingQty]
  )

  const changeStatus = useCallback(
    async (status: InvStatus) => {
      const cfg = STATUS_CONFIG[status]
      const statusLabel = isBm ? cfg.labelBm : cfg.labelEn
      if (status === "disposed" || status === "used_up") {
        showConfirm(
          tr(`Tetapkan sebagai ${statusLabel}?`, `Set as ${statusLabel}?`),
          tr("Perubahan status direkodkan ke dalam sejarah inventori.", "Status change is recorded permanently in history."),
          async () => {
            await fetch(`/api/inventory/items/${itemId}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              credentials: "include",
              body: JSON.stringify({ status }),
            })
            load()
          },
          "warning"
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
    },
    [authHeaders, isBm, itemId, load, showConfirm, tr]
  )

  const deleteItem = useCallback(() => {
    showConfirm(
      tr(`Padam ${item?.name}?`, `Delete ${item?.name}?`),
      tr("Rekod barang ini akan disembunyikan daripada senarai.", "This item record will be removed from the list."),
      async () => {
        const res = await fetch(`/api/inventory/items/${itemId}`, {
          method: "DELETE",
          headers: authHeaders(),
          credentials: "include",
        })
        if (res.ok) router.push(`/${sessionId}/inventory`)
        else showAlert(tr("Ralat", "Error"), tr("Gagal padam.", "Failed to delete."), "error")
      },
      "warning"
    )
  }, [authHeaders, itemId, item?.name, router, sessionId, showConfirm, showAlert, tr])

  if (loading && !item) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        <p className="text-xs text-[var(--muted)]">{tr("Memuatkan maklumat barang…", "Loading item details…")}</p>
      </div>
    )
  }

  if (!item) return null

  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available
  const itemDetailTitle = isBm ? "Butiran Barang" : "Item Details"

  return (
    <>
      {/* ── MOBILE HEADER (MATCHING TRANSACTIONS DETAILS PAGE) ── */}
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader
          title={itemDetailTitle}
          fallbackHref={`/${sessionId}/inventory`}
          backPreferHistory
          action={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowMove(true)}
                className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-tint)] px-2.5 py-1.5 text-xs font-bold text-[var(--text)] transition active:scale-[0.98]"
                aria-label={tr("Pindahkan", "Move")}
              >
                <ArrowRightLeft size={14} className="text-sky-400" />
                <span>{tr("Pindah", "Move")}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowEdit(true)}
                className="inline-flex items-center gap-1 rounded-xl bg-[var(--accent)] px-2.5 py-1.5 text-xs font-bold text-white transition active:scale-[0.98]"
                aria-label={tr("Edit", "Edit")}
              >
                <Pencil size={14} />
                <span>{tr("Edit", "Edit")}</span>
              </button>
            </div>
          }
        />
      </div>

      {/* ── DESKTOP HEADER (MATCHING TRANSACTIONS DETAILS PAGE) ── */}
      <DesktopPageHeader
        title={itemDetailTitle}
        breadcrumbs={[{ label: tr("Barang Saya", "My Inventory"), href: `/${sessionId}/inventory` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/inventory`}
        backPreferHistory
        className="hidden md:block"
        actions={
          <>
            <DesktopPageAction
              onClick={() => setShowMove(true)}
              aria-label={tr("Pindahkan barang", "Move item")}
              className="sm:px-2.5"
            >
              <ArrowRightLeft size={16} className="text-sky-400" />
            </DesktopPageAction>
            <DesktopPageAction
              onClick={() => setShowEdit(true)}
              aria-label={tr("Edit barang", "Edit item")}
              className="sm:px-2.5"
            >
              <Pencil size={16} />
            </DesktopPageAction>
            <button
              type="button"
              onClick={deleteItem}
              className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5"
              aria-label={tr("Padam", "Delete")}
            >
              <Trash2 size={16} />
              {tr("Padam", "Delete")}
            </button>
          </>
        }
      />

      <DesktopPageBody className="space-y-5">
        {/* ── HERO SHOWCASE CARD ── */}
          <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-gradient-to-br from-[#1c1c1c] via-[#161616] to-[#121212] p-5 text-white shadow-xl sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[var(--accent)]/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl" />

            <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                {/* Image / Thumbnail */}
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-inner sm:h-24 sm:w-24">
                  {item.has_image ? (
                    <img
                      src={`/api/inventory/items/${item.id}/image`}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/[0.03] text-neutral-400">
                      <Package className="h-10 w-10 opacity-60" />
                    </div>
                  )}
                </div>

                {/* Main titles and badges */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold",
                        statusCfg.badge
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", statusCfg.dot)} />
                      {isBm ? statusCfg.labelBm : item.status_label || statusCfg.labelEn}
                    </span>
                    {item.category && (
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-neutral-300">
                        {item.category}
                      </span>
                    )}
                  </div>

                  <h1 className="mt-1.5 truncate text-xl font-black tracking-tight text-white sm:text-2xl">
                    {item.name}
                  </h1>

                  <p className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                    <span className="font-semibold text-neutral-200">
                      {item.quantity} {item.unit}
                    </span>
                    {item.brand && <span>· {item.brand}</span>}
                    {item.model && <span>({item.model})</span>}
                  </p>

                  {/* Storage Location Breadcrumb */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-neutral-300">
                      <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{item.location_path || tr("Tiada lokasi", "No location")}</span>
                    </span>
                    {item.container_name && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-sky-300">
                        <Boxes className="h-3.5 w-3.5" />
                        <span>{item.container_name}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick links to linked transaction or warranty */}
            {(item.transaction_id || item.warranty_id) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                {item.transaction_id && (
                  <Link
                    href={`/${sessionId}/transactions/${item.transaction_id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    <span>{tr("Lihat Resit / Transaksi Pembelian", "View Purchase Transaction")}</span>
                    <ChevronRight className="h-3 w-3 opacity-70" />
                  </Link>
                )}
                {item.warranty_id && (
                  <Link
                    href={`/${sessionId}/warranty/${item.warranty_id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{tr("Lihat Maklumat Waranti", "View Warranty Info")}</span>
                    <ChevronRight className="h-3 w-3 opacity-70" />
                  </Link>
                )}
              </div>
            )}
          </section>

          {/* ── QUICK CONTROLS: QUANTITY STEPPER & STATUS SELECTOR ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Quantity Stepper Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Kuantiti Semasa", "Current Quantity")}
                </span>
                <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[11px] font-bold text-[var(--text)]">
                  {item.unit}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeQty("subtract", 1)}
                    disabled={item.quantity <= 0 || updatingQty}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-lg font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95 disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="min-w-16 text-center">
                    <span className="text-2xl font-black text-[var(--text)]">{item.quantity}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeQty("add", 1)}
                    disabled={updatingQty}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-lg font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick adjustments */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => changeQty("add", 5)}
                    disabled={updatingQty}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-1.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    onClick={() => changeQty("add", 10)}
                    disabled={updatingQty}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-1.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition"
                  >
                    +10
                  </button>
                </div>
              </div>
            </div>

            {/* Status Switcher Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Status Barang", "Item Status")}
              </span>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((s) => {
                  const isSelected = s.value === item.status
                  const cfg = STATUS_CONFIG[s.value]
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => !isSelected && changeStatus(s.value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition",
                        isSelected
                          ? cn(cfg.badge, "shadow-sm scale-[1.02]")
                          : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                      <span>{isBm ? cfg.labelBm : s.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── DETAILS & SPECIFICATIONS ── */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              <Tag className="h-4 w-4 text-[var(--accent)]" />
              {tr("Spesifikasi & Maklumat Terperinci", "Item Details & Specifications")}
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Category */}
              <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                <span className="block text-[11px] font-semibold text-[var(--muted)]">
                  {tr("Kategori", "Category")}
                </span>
                <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                  {item.category || "—"}
                </span>
              </div>

              {/* Brand & Model */}
              <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                <span className="block text-[11px] font-semibold text-[var(--muted)]">
                  {tr("Jenama & Model", "Brand & Model")}
                </span>
                <span className="mt-1 block font-bold text-sm text-[var(--text)] truncate">
                  {[item.brand, item.model].filter(Boolean).join(" · ") || "—"}
                </span>
              </div>

              {/* Serial Number */}
              <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                <span className="block text-[11px] font-semibold text-[var(--muted)]">
                  {tr("No. Siri", "Serial Number")}
                </span>
                <span className="mt-1 block font-bold text-sm text-[var(--text)] font-mono truncate">
                  {item.serial_number || "—"}
                </span>
              </div>

              {/* Purchase Date */}
              <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                <span className="block text-[11px] font-semibold text-[var(--muted)]">
                  {tr("Tarikh Pembelian", "Purchase Date")}
                </span>
                <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                  {fmtDateOnly(item.purchase_date)}
                </span>
              </div>

              {/* Purchase Price */}
              <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                <span className="block text-[11px] font-semibold text-[var(--muted)]">
                  {tr("Harga Pembelian", "Purchase Price")}
                </span>
                <span className="mt-1 block font-bold text-sm text-[var(--text)]">
                  {item.purchase_price != null ? `RM ${Number(item.purchase_price).toFixed(2)}` : "—"}
                </span>
              </div>

              {/* Storage Box */}
              <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                <span className="block text-[11px] font-semibold text-[var(--muted)]">
                  {tr("Bekas / Kotak", "Container / Box")}
                </span>
                <span className="mt-1 block font-bold text-sm text-[var(--text)] truncate">
                  {item.container_name || tr("Tiada bekas", "No box")}
                </span>
              </div>
            </div>

            {/* Notes Section */}
            {item.notes && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text)]">
                  <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
                  {tr("Nota & Catatan", "Notes & Remarks")}
                </span>
                <p className="mt-1.5 whitespace-pre-wrap text-xs text-[var(--muted)] leading-relaxed">
                  {item.notes}
                </p>
              </div>
            )}

            {/* Audit info */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">
              <span>{tr("Ditambah", "Added")}: {fmtDate(item.created_at)}</span>
              <span>{tr("Dikemas kini", "Last updated")}: {fmtDate(item.updated_at)}</span>
            </div>
          </div>

          {/* ── MOVEMENT HISTORY TIMELINE ── */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                <History className="h-4 w-4 text-sky-400" />
                {tr("Sejarah Pergerakan & Stok", "Movement & Stock History")}
              </h2>
              <span className="text-xs font-semibold text-[var(--muted)]">
                {movements.length} {tr("rekod", "records")}
              </span>
            </div>

            {movements.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
                {tr("Tiada sejarah pergerakan direkodkan setakat ini.", "No movement history recorded yet.")}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {movements.map((m, idx) => {
                  let badge = "bg-[var(--surface-tint)] text-[var(--muted)]"
                  let title = m.movement_type
                  if (m.movement_type === "created") {
                    badge = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    title = tr("Barang dicipta", "Item created")
                  } else if (m.movement_type === "moved") {
                    badge = "bg-sky-500/10 text-sky-400 border-sky-500/20"
                    title = tr("Lokasi dipindahkan", "Location moved")
                  } else if (m.movement_type === "quantity_changed") {
                    badge = "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    title = tr("Kuantiti diubah", "Quantity changed")
                  } else if (m.movement_type === "status_changed") {
                    badge = "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    title = tr("Status ditukar", "Status changed")
                  }

                  return (
                    <div
                      key={m.id || idx}
                      className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 transition hover:border-[var(--accent)]/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold", badge)}>
                            {title}
                          </span>
                          {(m.quantity_before != null || m.quantity_after != null) && (
                            <span className="text-xs font-semibold text-[var(--text)]">
                              {m.quantity_before ?? "—"} → {m.quantity_after ?? "—"} {item.unit}
                            </span>
                          )}
                          {(m.status_before || m.status_after) && (
                            <span className="text-xs font-semibold text-[var(--text)]">
                              {m.status_before || "—"} → {m.status_after || "—"}
                            </span>
                          )}
                        </div>

                        {m.notes && (
                          <p className="mt-1 text-xs text-[var(--muted)]">{m.notes}</p>
                        )}
                      </div>

                      <span className="shrink-0 text-[11px] font-medium text-[var(--muted)]">
                        {fmtDate(m.moved_at)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
      </DesktopPageBody>

      {/* ── MOVE SHEET ── */}
      {showMove && (
        <MoveSheet
          item={item}
          locations={locations}
          containers={containers}
          onClose={() => setShowMove(false)}
          onSaved={() => {
            setShowMove(false)
            load()
          }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}

      {/* ── EDIT SHEET ── */}
      {showEdit && (
        <EditSheet
          item={item}
          locations={locations}
          containers={containers}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            load()
          }}
          authHeaders={authHeaders}
          tr={tr}
        />
      )}

      {alertModal}
    </>
  )
}

// ── MOVE SHEET COMPONENT ─────────────────────────────────────────────────────

function MoveSheet({
  item,
  locations,
  containers,
  onClose,
  onSaved,
  authHeaders,
  tr,
}: {
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
          quantity: q >= item.quantity ? 0 : q, // 0 = move all
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => null)
        throw new Error(p?.detail || "Failed")
      }
      onSaved()
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal pindah.", "Failed to move."),
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const swipe = useSwipeDownToClose(onClose)
  const inputCls =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
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
        className="app-sheet-panel app-sheet-panel--lg w-full max-h-[88dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[30rem] sm:rounded-3xl"
      >
        <AppSheetHeader
          title={tr("Pindahkan Barang", "Move Item")}
          eyebrow={item.name}
          onClose={onClose}
          action={
            <button
              type="submit"
              form="inventory-move-form"
              disabled={saving}
              className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
            >
              {saving ? tr("Menyimpan…", "Saving…") : tr("Pindah", "Move")}
            </button>
          }
        />
        <form id="inventory-move-form" onSubmit={submit} className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 text-xs text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">{tr("Lokasi Sekarang", "Current Location")}:</span>{" "}
            {item.location_path || tr("Tiada lokasi", "No location")}
            {item.container_name ? ` → ${item.container_name}` : ""} · {item.quantity} {item.unit}
          </div>

          <div>
            <label className={labelCls} htmlFor="mv-loc">
              {tr("Lokasi Baharu", "New Location")}
            </label>
            <select
              id="mv-loc"
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
            <label className={labelCls} htmlFor="mv-cont">
              {tr("Bekas / Kotak (Pilihan)", "Box / Container (Optional)")}
            </label>
            <select
              id="mv-cont"
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

          <div>
            <label className={labelCls} htmlFor="mv-qty">
              {tr(
                `Kuantiti Dipindahkan (Maksimum ${item.quantity}; Kosongkan = Pindah Semua)`,
                `Quantity to Move (Max ${item.quantity}; Empty = Move All)`
              )}
            </label>
            <input
              id="mv-qty"
              type="number"
              min={0}
              max={item.quantity}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="mv-notes">
              {tr("Nota Pergerakan (Pilihan)", "Movement Notes (Optional)")}
            </label>
            <input
              id="mv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
              placeholder={tr("Cth: Pindah ke bilik atas, simpan dalam stor", "e.g. Moved to upstairs room")}
              maxLength={500}
            />
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── EDIT SHEET COMPONENT ─────────────────────────────────────────────────────

function EditSheet({
  item,
  locations,
  containers,
  onClose,
  onSaved,
  authHeaders,
  tr,
}: {
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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(
    item.has_image ? `/api/inventory/items/${item.id}/image` : null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { showAlert } = usePageAlert("BM")
  const showAlertRef = useRef(showAlert)
  useEffect(() => { showAlertRef.current = showAlert }, [showAlert])

  const filteredContainers = containers.filter((c) => !locationId || String(c.location_id) === locationId)

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setImageFile(f)
    setImagePreview(f ? URL.createObjectURL(f) : null)
  }

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
          unit: unit.trim() || "unit",
          status,
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
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        await fetch(`/api/inventory/items/${item.id}/image`, {
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
    "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
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
          title={tr("Edit Maklumat Barang", "Edit Item Details")}
          eyebrow={item.name}
          onClose={onClose}
          action={
            <button
              type="submit"
              form="inventory-edit-form"
              disabled={saving || !name.trim()}
              className="px-2 py-1 text-base font-bold text-[var(--accent)] transition hover:opacity-80 disabled:opacity-50"
            >
              {saving ? tr("Menyimpan…", "Saving…") : tr("Simpan", "Save")}
            </button>
          }
        />
        <form id="inventory-edit-form" onSubmit={submit} className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          {/* Image upload */}
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
                      setImagePreview(item.has_image ? `/api/inventory/items/${item.id}/image` : null)
                    }}
                    className="text-xs font-medium text-rose-400 hover:underline"
                  >
                    {tr("Padam", "Remove")}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="ed-name">
              {tr("Nama Barang *", "Item Name *")}
            </label>
            <input
              id="ed-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              maxLength={190}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ed-qty">
                {tr("Kuantiti *", "Quantity *")}
              </label>
              <input
                id="ed-qty"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-unit">
                {tr("Unit", "Unit")}
              </label>
              <input
                id="ed-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={inputCls}
                maxLength={20}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ed-cat">
                {tr("Kategori", "Category")}
              </label>
              <select
                id="ed-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls}
              >
                <option value="">{tr("— Pilih kategori —", "— Select category —")}</option>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-status">
                {tr("Status", "Status")}
              </label>
              <select
                id="ed-status"
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
              <label className={labelCls} htmlFor="ed-brand">
                {tr("Jenama", "Brand")}
              </label>
              <input
                id="ed-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={inputCls}
                maxLength={80}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-model">
                {tr("Model", "Model")}
              </label>
              <input
                id="ed-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={inputCls}
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="ed-serial">
              {tr("No. Siri", "Serial Number")}
            </label>
            <input
              id="ed-serial"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ed-date">
                {tr("Tarikh Pembelian", "Purchase Date")}
              </label>
              <input
                id="ed-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-price">
                {tr("Harga (RM)", "Price (RM)")}
              </label>
              <input
                id="ed-price"
                type="number"
                min={0}
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ed-loc">
                {tr("Lokasi", "Location")}
              </label>
              <select
                id="ed-loc"
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
              <label className={labelCls} htmlFor="ed-cont">
                {tr("Bekas / Kotak", "Box / Container")}
              </label>
              <select
                id="ed-cont"
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
            <label className={labelCls} htmlFor="ed-notes">
              {tr("Nota", "Notes")}
            </label>
            <textarea
              id="ed-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
              rows={2}
            />
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
