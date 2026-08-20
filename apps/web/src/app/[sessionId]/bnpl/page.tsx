"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { createPortal } from "react-dom"
import {
  CalendarDays,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Check,
  Layers,
  X,
  Sparkles,
  CheckCircle2,
  Clock,
  Coins,
  Receipt,
  AlertTriangle,
} from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  MobileIconButton,
  MobilePageHeader,
  DesktopPageHeader,
  DesktopPageAction,
  DesktopPageBody,
} from "@/components/layout/PageHeader"
import { DataSkeletonList, AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { BNPL_PROVIDERS, BnplProviderBadge, bnplProviderBrand } from "@/components/bnpl/bnpl-providers"

type BnplItem = {
  id: number
  name: string
  key: string
  provider: string
  category_id: number
  category_name?: string | null
  icon_name?: string | null
  has_image: boolean
  image_url?: string | null
  total_amount: number
  installment_count: number
  monthly_amount: number
  due_day_of_month: number
  start_date: string
  last_payment_date?: string | null
  outstanding_amount: number
  paid_amount: number
  status: string
  notes?: string | null
}

type CategoryItem = {
  id: number
  name: string
  icon_name?: string | null
  kind: string
}

type WalletItem = {
  id: number
  name: string
  label?: string | null
  image_url?: string | null
  currency: string
}

type FormState = {
  name: string
  provider: string
  category_id: string
  icon_name: string
  total_amount: string
  installment_count: string
  monthly_amount: string
  due_day_of_month: string
  start_date: string
  notes: string
}

type FilterTab = "all" | "active" | "settled"

const defaultForm: FormState = {
  name: "",
  provider: "SPayLater",
  category_id: "",
  icon_name: "",
  total_amount: "",
  installment_count: "3",
  monthly_amount: "",
  due_day_of_month: "15",
  start_date: "",
  notes: "",
}

export default function BnplPage() {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [items, setItems] = useState<BnplItem[]>([])
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [showSheet, setShowSheet] = useState(false)
  const [editing, setEditing] = useState<BnplItem | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [payingId, setPayingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [providerOpen, setProviderOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [payWalletOpen, setPayWalletOpen] = useState(false)
  const [payWalletId, setPayWalletId] = useState<number | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { requestClose: requestSheetClose } = useOverlayBackClose({
    id: "bnpl-sheet",
    isOpen: showSheet,
    onClose: () => {
      setShowSheet(false)
      setEditing(null)
      setProviderOpen(false)
      setCategoryOpen(false)
    },
  })

  const fetchData = useCallback(async () => {
    try {
      const token = getAccessToken()
      const headers: HeadersInit =
        token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}
      const [bRes, cRes, wRes] = await Promise.all([
        fetch("/api/bnpl?include_settled=true", { credentials: "include", headers, cache: "no-store" }),
        fetch("/api/categories", { credentials: "include", headers, cache: "no-store" }),
        fetch("/api/wallets", { credentials: "include", headers, cache: "no-store" }),
      ])
      if (!bRes.ok) throw new Error("bnpl failed")
      const bJson = await bRes.json()
      const list: BnplItem[] = Array.isArray(bJson) ? bJson : []
      setItems(list)
      if (cRes.ok) {
        const cJson = await cRes.json()
        const cats = Array.isArray(cJson) ? cJson : Array.isArray(cJson?.items) ? cJson.items : []
        setCategories(cats.filter((c: CategoryItem) => c.kind === "expense"))
      }
      if (wRes.ok) {
        const wJson = await wRes.json()
        setWallets(Array.isArray(wJson) ? wJson : [])
      }
    } catch {
      showAlert(tr("Ralat memuat data", "Failed to load data"), "", "error")
    } finally {
      setLoading(false)
    }
  }, [showAlert, tr])

  useEffect(() => {
    void fetchData()
    setMounted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showSheet || payingId !== null } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showSheet, payingId])

  const openCreateSheet = () => {
    setEditing(null)
    setForm(defaultForm)
    setProviderOpen(false)
    setCategoryOpen(false)
    setShowSheet(true)
  }

  const openEditSheet = (item: BnplItem) => {
    setEditing(item)
    setForm({
      name: item.name,
      provider: item.provider,
      category_id: String(item.category_id),
      icon_name: item.icon_name || "",
      total_amount: item.total_amount != null ? String(item.total_amount) : "",
      installment_count: String(item.installment_count || 3),
      monthly_amount: item.monthly_amount != null ? String(item.monthly_amount) : "",
      due_day_of_month: String(item.due_day_of_month || 15),
      start_date: item.start_date || "",
      notes: item.notes || "",
    })
    setProviderOpen(false)
    setCategoryOpen(false)
    setShowSheet(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return showAlert(tr("Nama perlu diisi", "Name is required"), "", "error")
    if (!form.category_id) return showAlert(tr("Pilih kategori dahulu", "Select a category first"), "", "error")
    const total = Number(form.total_amount)
    const monthly = Number(form.monthly_amount)
    if (!total || total <= 0) return showAlert(tr("Jumlah perlu sah", "Enter a valid total"), "", "error")
    if (!monthly || monthly <= 0) return showAlert(tr("Ansuran bulanan perlu sah", "Enter a valid monthly amount"), "", "error")

    setSaving(true)
    try {
      const token = getAccessToken()
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}),
      }
      const body = {
        name: form.name.trim(),
        provider: form.provider,
        category_id: Number(form.category_id),
        icon_name: form.icon_name || null,
        total_amount: total,
        installment_count: Number(form.installment_count) || 3,
        monthly_amount: monthly,
        due_day_of_month: Number(form.due_day_of_month) || 15,
        start_date: form.start_date || null,
        notes: form.notes.trim() || null,
      }
      const url = editing ? `/api/bnpl/${editing.id}` : "/api/bnpl"
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        showAlert(err?.detail || tr("Gagal simpan", "Failed to save"), "", "error")
        return
      }
      setShowSheet(false)
      await fetchData()
    } catch {
      showAlert(tr("Ralat simpan", "Save error"), "", "error")
    } finally {
      setSaving(false)
    }
  }

  const handlePay = async (item: BnplItem) => {
    setPayingId(item.id)
    try {
      const token = getAccessToken()
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}),
      }
      const body: { wallet_id?: number | null; amount?: number | null } = {}
      if (payWalletId) body.wallet_id = payWalletId
      const res = await fetch(`/api/bnpl/${item.id}/pay`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        showAlert(err?.detail || tr("Gagal bayar", "Payment failed"), "", "error")
        return
      }
      setPayWalletId(null)
      setPayingId(null)
      showAlert(
        tr("Ansuran direkod sebagai transaksi kategori", "Installment recorded as category transaction"),
        "",
        "success",
      )
      await fetchData()
    } catch {
      showAlert(tr("Ralat bayar", "Payment error"), "", "error")
    } finally {
      setPayingId(null)
    }
  }

  const handleDelete = (item: BnplItem) => {
    showConfirm(
      tr("Padam BNPL", "Delete BNPL"),
      tr(`Padam ${item.name}? Tindakan ini tidak boleh dibatalkan.`, `Delete ${item.name}? This cannot be undone.`),
      () => void doDelete(item),
      "warning",
    )
  }

  const doDelete = async (item: BnplItem) => {
    setDeletingId(item.id)
    try {
      const token = getAccessToken()
      const headers: HeadersInit =
        token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`/api/bnpl/${item.id}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        showAlert(err?.detail || tr("Gagal padam", "Delete failed"), "", "error")
        return
      }
      await fetchData()
    } catch {
      showAlert(tr("Ralat padam", "Delete error"), "", "error")
    } finally {
      setDeletingId(null)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || uploadingId == null) return
    setUploadingId(uploadingId)
    try {
      const token = getAccessToken()
      const headers: HeadersInit = token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/bnpl/${uploadingId}/image`, {
        method: "POST",
        credentials: "include",
        headers,
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        showAlert(err?.detail || tr("Gagal muat naik", "Upload failed"), "", "error")
      }
      await fetchData()
    } catch {
      showAlert(tr("Ralat muat naik", "Upload error"), "", "error")
    } finally {
      setUploadingId(null)
    }
  }

  const progress = (item: BnplItem) => {
    if (!item.total_amount) return 0
    const pct = (item.paid_amount / item.total_amount) * 100
    return Math.min(100, Math.max(0, Math.round(pct)))
  }

  const active = useMemo(() => items.filter((i) => i.status === "active"), [items])
  const settled = useMemo(() => items.filter((i) => i.status === "settled"), [items])

  const stats = useMemo(() => {
    const monthlyTotal = active.reduce((s, i) => s + Number(i.monthly_amount || 0), 0)
    const outstandingTotal = active.reduce((s, i) => s + Number(i.outstanding_amount || 0), 0)
    const paidTotal = items.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
    const originalTotal = items.reduce((s, i) => s + Number(i.total_amount || 0), 0)
    const overallPct = originalTotal > 0 ? Math.min(100, Math.round((paidTotal / originalTotal) * 100)) : 100

    return { monthlyTotal, outstandingTotal, paidTotal, originalTotal, overallPct }
  }, [items, active])

  const filteredItems = useMemo(() => {
    if (filterTab === "active") return active
    if (filterTab === "settled") return settled
    return items
  }, [items, active, settled, filterTab])

  const showSkeleton = useDelayedSkeleton(loading)

  const renderCard = (item: BnplItem) => {
    const brand = bnplProviderBrand(item.provider)
    const pct = progress(item)
    const isActive = item.status === "active"

    return (
      <div
        key={item.id}
        onClick={() => openEditSheet(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openEditSheet(item)
          }
        }}
        className={cn(
          "group relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-[var(--shadow-card)] transition hover:border-[var(--border-strong)] hover:shadow-md active:scale-[0.99]",
          !isActive && "opacity-80"
        )}
      >
        <div className="flex items-start gap-3.5">
          <BnplProviderBadge provider={item.provider} size={46} rounded="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-base font-black tracking-tight text-[var(--text)]">{item.name}</p>
              {isActive ? (
                <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider text-cyan-500">
                  {item.due_day_of_month}hb Due
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider text-emerald-500">
                  {tr("Selesai", "Settled")}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
              {item.category_name || tr("Tiada kategori", "No category")} · {item.installment_count} {tr("bulan ansuran", "months")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(item)
              }}
              disabled={deletingId === item.id}
              className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 disabled:opacity-40"
              aria-label={tr("Padam", "Delete")}
            >
              {deletingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          </div>
        </div>

        {/* 3-Metric Statistics Grid */}
        <div className="mt-3.5 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tr("Bulanan", "Monthly")}
            </p>
            <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
              RM {Number(item.monthly_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tr("Baki", "Due")}
            </p>
            <p className="mt-0.5 truncate text-sm font-black tabular-nums text-rose-600 dark:text-rose-400">
              RM {Number(item.outstanding_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tr("Due Day", "Due Day")}
            </p>
            <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
              {item.due_day_of_month}
              <span className="text-[0.65rem] font-bold text-[var(--muted)] ml-0.5">
                {isBm ? "hb" : "th"}
              </span>
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[0.625rem] font-semibold text-[var(--muted)]">
            <span>{tr("Bayaran", "Paid")}: {pct}%</span>
            <span>
              RM {Number(item.paid_amount).toLocaleString("en-MY", { minimumFractionDigits: 0 })} / RM{" "}
              {Number(item.total_amount).toLocaleString("en-MY", { minimumFractionDigits: 0 })}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
            <div
              className={cn("h-full rounded-full transition-all", isActive ? "bg-emerald-500" : "bg-[var(--muted)]")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Quick Pay Action Button */}
        {isActive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setPayWalletId(null)
              setPayWalletOpen(false)
              setPayingId(item.id)
            }}
            disabled={payingId === item.id}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-black text-white shadow-xs transition active:scale-[0.99] hover:opacity-95 disabled:opacity-50"
          >
            {payingId === item.id ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CreditCard size={14} />
            )}
            <span>{tr("Bayar Ansuran Ini", "Pay This Installment")}</span>
          </button>
        )}
      </div>
    )
  }

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--muted)] shadow-xs">
        <CreditCard size={32} />
      </div>
      <p className="text-sm font-bold text-[var(--text)]">{tr("Tiada pelan BNPL lagi", "No BNPL plans yet")}</p>
      <p className="max-w-xs text-xs text-[var(--muted)]">
        {tr("Tambah komitmen SPayLater, Atome atau ansuran lain untuk jejak baki & tarikh due bulanan.", "Track SPayLater, Atome or other installments with due date tracking.")}
      </p>
      <button
        type="button"
        onClick={openCreateSheet}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2 text-xs font-black text-white shadow-sm transition active:scale-95"
      >
        <Plus size={15} />
        <span>{tr("Tambah BNPL Baru", "Add New BNPL")}</span>
      </button>
    </div>
  )

  const catName = (id: string) =>
    categories.find((c) => String(c.id) === id)?.name || tr("Pilih kategori", "Select category")

  // Hero Card Component (matches loan hero card design)
  const renderHeroStats = (isDesktop = false) => (
    <div className={cn("bnpl-hero relative overflow-hidden rounded-2xl bg-[#1a1a1a] text-center text-white", isDesktop ? "p-6" : "p-5")}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className={cn("relative flex flex-col items-center justify-center", isDesktop ? "min-h-28" : "min-h-24")}>
        <p className={cn("font-bold uppercase tracking-[0.14em] text-[#a3a3a3]", isDesktop ? "text-[0.7rem]" : "text-[0.625rem]")}>
          {tr("Jumlah Bayaran Bulanan", "Total Monthly Payment")}
        </p>
        <div className="mt-2 text-[#ffffff]">
          {showSkeleton ? (
            <AmountSkeleton className={cn("bg-white/10", isDesktop ? "h-10 w-40" : "h-7 w-32")} />
          ) : (
            <MoneyAmount
              value={Number(stats.monthlyTotal || 0)}
              size={isDesktop ? "heroLg" : "hero"}
              className="text-[#ffffff]"
              currencyClassName="text-[#ffffff] opacity-55"
            />
          )}
        </div>
      </div>
    </div>
  )

  // Segmented Filter Tabs
  const renderFilterTabs = () => (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {[
        { key: "all" as FilterTab, label: tr("Semua", "All"), count: items.length },
        { key: "active" as FilterTab, label: tr("Sedang Berjalan", "Active Plans"), count: active.length },
        { key: "settled" as FilterTab, label: tr("Selesai", "Settled"), count: settled.length },
      ].map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setFilterTab(tab.key)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95",
            filterTab === tab.key
              ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
              : "bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]"
          )}
        >
          <span>{tab.label}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.2 text-[0.625rem] font-black",
              filterTab === tab.key ? "bg-[var(--bg)]/20 text-[var(--bg)]" : "bg-[var(--card)] text-[var(--muted)]"
            )}
          >
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Buy Now Pay Later", "BNPL")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Tambah BNPL", "Add BNPL")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        <section className="px-1 space-y-4">
          {renderHeroStats()}
          {renderFilterTabs()}

          <div className="space-y-3">
            {showSkeleton ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
              ))
            ) : filteredItems.length === 0 ? (
              renderEmpty()
            ) : (
              filteredItems.map((item) => renderCard(item))
            )}
          </div>
        </section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Buy Now Pay Later (BNPL)", "Buy Now Pay Later")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={openCreateSheet}>
              <Plus strokeWidth={2.5} />
              {tr("Tambah BNPL", "Add BNPL")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="space-y-6">
          {renderHeroStats(true)}
          {renderFilterTabs()}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showSkeleton ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
              ))
            ) : filteredItems.length === 0 ? (
              <div className="col-span-full">{renderEmpty()}</div>
            ) : (
              filteredItems.map((item) => renderCard(item))
            )}
          </div>
        </DesktopPageBody>
      </div>

      {/* ─── Add/Edit Sheet ─── */}
      {mounted && showSheet
        ? createPortal(
            <div
              className="fixed inset-0 z-[140] flex h-[100dvh] w-screen items-end justify-center bg-[var(--overlay)] backdrop-blur-xs p-0 md:items-center md:p-4"
              onClick={requestSheetClose}
            >
              <div
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl md:max-h-[86vh] md:max-w-lg md:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={editing ? tr("Edit BNPL", "Edit BNPL") : tr("Tambah BNPL", "Add BNPL")}
                  onClose={requestSheetClose}
                  action={
                    <button
                      type="submit"
                      form="bnpl-sheet-form"
                      disabled={saving}
                      className="px-2 py-1 text-sm font-black text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editing ? tr("Update", "Update") : tr("Simpan", "Save")}
                    </button>
                  }
                />

                <form
                  id="bnpl-sheet-form"
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  onSubmit={handleSave}
                >
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 text-[var(--text)] sm:px-6 sm:py-5">
                    {/* Name */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Nama Pembelian / Barang", "Purchase / Item Name")} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] placeholder:text-[var(--muted)]/40"
                        placeholder={tr("Contoh: iPhone 15 Pro / Kasut Nike", "Example: iPhone 15 / Nike Shoes")}
                      />
                    </div>

                    {/* Provider */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Penyedia Perkhidmatan BNPL", "BNPL Provider")}
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setProviderOpen((o) => !o)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-3 text-left transition hover:bg-[var(--surface-tint-strong)]",
                            providerOpen && "border-[var(--btn-primary-bg)]"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <BnplProviderBadge provider={form.provider} size={30} rounded="rounded-xl" />
                            <span className="truncate text-sm font-black text-[var(--text)]">
                              {form.provider}
                            </span>
                          </span>
                          <ChevronDown size={16} className={cn("shrink-0 text-[var(--muted)] transition-transform", providerOpen && "rotate-180")} />
                        </button>
                        {providerOpen && (
                          <div className="mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl space-y-1">
                            {BNPL_PROVIDERS.map((p) => {
                              const selected = form.provider === p.value
                              return (
                                <button
                                  key={p.value}
                                  type="button"
                                  onClick={() => {
                                    setForm((prev) => ({ ...prev, provider: p.value }))
                                    setProviderOpen(false)
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
                                    selected ? "bg-[var(--surface-tint-strong)]" : "hover:bg-[var(--surface-tint)]",
                                  )}
                                >
                                  <BnplProviderBadge provider={p.value} size={28} rounded="rounded-xl" />
                                  <span className="truncate text-xs font-bold text-[var(--text)]">{p.label}</span>
                                  {selected && <Check size={14} className="ml-auto text-emerald-500" />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Kategori Transaksi", "Expense Category")} <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setCategoryOpen((o) => !o)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-left transition hover:bg-[var(--surface-tint-strong)]",
                            categoryOpen && "border-[var(--btn-primary-bg)]"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            {form.category_id ? (
                              <CategoryIconGlyph
                                iconName={categories.find((c) => String(c.id) === form.category_id)?.icon_name}
                                categoryName={catName(form.category_id)}
                                kind="expense"
                                size={18}
                              />
                            ) : (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                                <Receipt size={12} />
                              </span>
                            )}
                            <span className={cn("truncate text-sm", form.category_id ? "font-black text-[var(--text)]" : "text-[var(--muted)]")}>
                              {catName(form.category_id)}
                            </span>
                          </span>
                          <ChevronDown size={16} className={cn("shrink-0 text-[var(--muted)] transition-transform", categoryOpen && "rotate-180")} />
                        </button>
                        {categoryOpen && (
                          <div className="mt-2 max-h-52 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl space-y-1">
                            {categories.length === 0 && (
                              <div className="px-3 py-3 text-center text-xs text-[var(--muted)]">
                                {tr("Tiada kategori dijumpai", "No categories found")}
                              </div>
                            )}
                            {categories.map((c) => {
                              const selected = form.category_id === String(c.id)
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setForm((prev) => ({ ...prev, category_id: String(c.id) }))
                                    setCategoryOpen(false)
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition",
                                    selected ? "bg-[var(--surface-tint-strong)]" : "hover:bg-[var(--surface-tint)]",
                                  )}
                                >
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                    <CategoryIconGlyph iconName={c.icon_name} categoryName={c.name} kind="expense" size={14} />
                                  </span>
                                  <span className="truncate text-xs font-semibold text-[var(--text)]">{c.name}</span>
                                  {selected && <Check size={14} className="ml-auto text-emerald-500" />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Total & Monthly Amount */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Jumlah Penuh (RM)", "Total (RM)")} <span className="text-rose-500">*</span>
                        </label>
                        <input
                          inputMode="decimal"
                          value={form.total_amount}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, "")
                            setForm((prev) => {
                              const totalNum = Number(val)
                              const count = Number(prev.installment_count) || 3
                              const monthlyCalc = totalNum > 0 && count > 0 ? (totalNum / count).toFixed(2) : prev.monthly_amount
                              return { ...prev, total_amount: val, monthly_amount: monthlyCalc }
                            })
                          }}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-black text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] placeholder:text-[var(--muted)]/40"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Ansuran Bulanan (RM)", "Monthly (RM)")} <span className="text-rose-500">*</span>
                        </label>
                        <input
                          inputMode="decimal"
                          value={form.monthly_amount}
                          onChange={(e) => setForm((prev) => ({ ...prev, monthly_amount: e.target.value.replace(/[^0-9.]/g, "") }))}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-black text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] placeholder:text-[var(--muted)]/40"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Installments count & Due Day */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Tempoh Ansuran (Bulan)", "Installment Count")}
                        </label>
                        <input
                          inputMode="numeric"
                          value={form.installment_count}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "")
                            setForm((prev) => {
                              const count = Number(val) || 0
                              const totalNum = Number(prev.total_amount) || 0
                              const monthlyCalc = totalNum > 0 && count > 0 ? (totalNum / count).toFixed(2) : prev.monthly_amount
                              return { ...prev, installment_count: val, monthly_amount: monthlyCalc }
                            })
                          }}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)]"
                          placeholder="3"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Hari Tarikh Due (hb)", "Due Day of Month")}
                        </label>
                        <input
                          inputMode="numeric"
                          value={form.due_day_of_month}
                          onChange={(e) => setForm((prev) => ({ ...prev, due_day_of_month: e.target.value.replace(/[^0-9]/g, "") }))}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)]"
                          placeholder="15"
                        />
                      </div>
                    </div>

                    {/* Start Date */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Tarikh Mula Langganan", "Start Date")}
                      </label>
                      <input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                      />
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Catatan / Nota", "Notes")}
                      </label>
                      <textarea
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                        placeholder={tr("Catatan tambahan (opsyenal)", "Additional notes (optional)")}
                      />
                    </div>
                  </div>

                  {/* Sticky Footer */}
                  <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--sheet-bg)] p-4">
                    <button
                      type="button"
                      onClick={requestSheetClose}
                      className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-xs font-bold text-[var(--muted)] transition hover:bg-[var(--surface-tint)] active:scale-95"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs md:text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editing ? tr("Kemaskini BNPL", "Update BNPL") : tr("Simpan BNPL", "Save BNPL")}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ─── Quick Pay Sheet ─── */}
      {payingId !== null &&
        (() => {
          const item = items.find((i) => i.id === payingId)
          if (!item) return null
          return createPortal(
            <div
              className="fixed inset-0 z-[140] flex h-[100dvh] w-screen items-end justify-center bg-[var(--overlay)] backdrop-blur-xs p-0 md:items-center md:p-4"
              onClick={() => setPayingId(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="app-sheet-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl md:max-h-[86vh] md:max-w-md md:rounded-2xl"
              >
                <AppSheetHeader title={tr("Bayar Ansuran BNPL", "Pay BNPL Installment")} onClose={() => setPayingId(null)} />

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 text-[var(--text)] sm:px-6 sm:py-5">
                  <div className="flex items-center gap-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
                    <BnplProviderBadge provider={item.provider} size={44} rounded="rounded-2xl" />
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-[var(--text)]">{item.name}</h3>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Ansuran Bulanan", "Monthly Installment")}:{" "}
                        <span className="font-bold text-[var(--text)]">
                          RM {Number(item.monthly_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Dompet Pembayar (Pilihan)", "Payment Wallet (Optional)")}
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPayWalletOpen((o) => !o)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-left transition hover:bg-[var(--surface-tint-strong)]",
                          payWalletOpen && "border-[var(--btn-primary-bg)]"
                        )}
                      >
                        {payWalletId ? (
                          (() => {
                            const w = wallets.find((x) => x.id === payWalletId)
                            return (
                              <span className="flex items-center gap-2 truncate font-bold text-sm text-[var(--text)]">
                                <CreditCard size={15} className="shrink-0 text-emerald-500" />
                                <span>{w?.name || "Wallet"}</span>
                              </span>
                            )
                          })()
                        ) : (
                          <span className="text-sm text-[var(--muted)]">{tr("Guna wallet lalai / Tunai", "Use default wallet / Cash")}</span>
                        )}
                        <ChevronDown size={16} className={cn("shrink-0 text-[var(--muted)] transition-transform", payWalletOpen && "rotate-180")} />
                      </button>
                      {payWalletOpen && (
                        <div className="mt-2 max-h-48 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPayWalletId(null)
                              setPayWalletOpen(false)
                            }}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                          >
                            <span>{tr("Wallet lalai", "Default wallet")}</span>
                            {!payWalletId && <Check size={14} className="text-emerald-500" />}
                          </button>
                          {wallets.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => {
                                setPayWalletId(w.id)
                                setPayWalletOpen(false)
                              }}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition",
                                payWalletId === w.id ? "bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold" : "hover:bg-[var(--surface-tint)] text-[var(--text)]"
                              )}
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                <CreditCard size={12} />
                              </span>
                              <span className="truncate flex-1 font-medium">{w.name}</span>
                              {payWalletId === w.id && <Check size={14} className="text-emerald-500" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sticky Pay Footer */}
                <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--sheet-bg)] p-4">
                  <button
                    type="button"
                    onClick={() => setPayingId(null)}
                    className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-xs font-bold text-[var(--muted)] transition hover:bg-[var(--surface-tint)] active:scale-95"
                  >
                    {tr("Batal", "Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePay(item)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs md:text-sm font-black text-white shadow-sm transition active:scale-[0.98]"
                  >
                    <CreditCard size={15} />
                    <span>{tr("Sahkan Bayaran", "Confirm Payment")}</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        })()}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      {alertModal}
    </div>
  )
}
