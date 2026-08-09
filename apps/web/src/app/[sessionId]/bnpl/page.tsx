"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
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
} from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  MobileIconButton,
  MobilePageHeader,
  DesktopPageHeader,
} from "@/components/layout/PageHeader"
import { DataSkeletonList } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
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
  const { showAlert, alertModal } = usePageAlert(lang)

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
  const [walletOpen, setWalletOpen] = useState(false)
  const [payWalletId, setPayWalletId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const payFileRef = useRef<HTMLInputElement | null>(null)

  const { requestClose: requestSheetClose } = useOverlayBackClose({
    id: "bnpl-sheet",
    isOpen: showSheet,
    onClose: () => setShowSheet(false),
  })
  const sheetSwipe = useSwipeDownToClose(requestSheetClose)

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
  }, [showAlert])

  useEffect(() => {
    void fetchData()
    setMounted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { requestClose: requestPayClose } = useOverlayBackClose({
    id: "bnpl-pay",
    isOpen: payingId !== null,
    onClose: () => setPayingId(null),
  })

  const openCreateSheet = () => {
    setEditing(null)
    setForm(defaultForm)
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

  const handleDelete = async (item: BnplItem) => {
    if (!window.confirm(tr(`Padam ${item.name}?`, `Delete ${item.name}?`))) return
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

  const active = items.filter((i) => i.status === "active")
  const settled = items.filter((i) => i.status === "settled")
  const monthlyTotal = active.reduce((s, i) => s + Number(i.monthly_amount || 0), 0)
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
        className="group w-full rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-3.5 text-left transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <BnplProviderBadge provider={item.provider} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-black tracking-tight text-[var(--text)]">{item.name}</p>
              {!isActive && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider text-emerald-500">
                  {tr("Selesai", "Settled")}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[0.6875rem] text-[var(--muted)]">
              {item.category_name || tr("Tiada kategori", "No category")} · {item.installment_count} {tr("ansuran", "installments")}
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
              className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--surface-tint)] hover:text-red-500 disabled:opacity-40"
              aria-label={tr("Padam", "Delete")}
            >
              {deletingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
            <ChevronRight size={16} className="text-[var(--muted)]/50" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-2">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tr("Bulanan", "Monthly")}
            </p>
            <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
              RM {Number(item.monthly_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-2">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tr("Baki", "Due")}
            </p>
            <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
              RM {Number(item.outstanding_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-2">
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tr("Due Hari", "Due Day")}
            </p>
            <p className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">
              {item.due_day_of_month}
              <span className="text-[0.6rem] font-bold text-[var(--muted)]">
                {isBm ? " hb" : "th"}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[0.6rem] font-semibold text-[var(--muted)]">
            <span>{tr("Bayaran", "Paid")}</span>
            <span>
              RM {Number(item.paid_amount).toLocaleString("en-MY", { minimumFractionDigits: 0 })} / RM{" "}
              {Number(item.total_amount).toLocaleString("en-MY", { minimumFractionDigits: 0 })}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
            <div
              className="h-full rounded-full bg-[var(--accent2)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {isActive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setPayWalletId(null)
              setPayingId(item.id)
            }}
            disabled={payingId === item.id}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.99] disabled:opacity-50"
          >
            {payingId === item.id ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CreditCard size={14} />
            )}
            {payingId === item.id
              ? tr("Memproses…", "Processing…")
              : tr("Bayar Ansuran", "Pay Installment")}
          </button>
        )}
      </div>
    )
  }

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--surface-tint)] text-[var(--muted)]">
        <CreditCard size={28} />
      </div>
      <p className="text-sm font-bold text-[var(--text)]">{tr("Tiada BNPL lagi", "No BNPL yet")}</p>
      <p className="max-w-[240px] text-xs text-[var(--muted)]">
        {tr("Tambah BNPL untuk jejak ansuran bulanan dengan duedate.", "Add a BNPL to track monthly installments with a due date.")}
      </p>
    </div>
  )

  const catName = (id: string) =>
    categories.find((c) => String(c.id) === id)?.name || tr("Pilih kategori", "Select category")

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      {/* ─── Mobile header ─── */}
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("BNPL", "BNPL")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Tambah", "Add")}>
              <Plus size={20} />
            </MobileIconButton>
          }
        />
      </div>

      {/* ─── Desktop header ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Buy Now Pay Later", "Buy Now Pay Later")}
          backHref={`/${sessionId}`}
          actions={
            <button
              type="button"
              onClick={openCreateSheet}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)]"
            >
              <Plus size={16} />
              {tr("Tambah BNPL", "Add BNPL")}
            </button>
          }
        />
      </div>

      {/* Monthly total summary */}
      {active.length > 0 && (
        <div className="flex items-center justify-between rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--accent2)]">
              <Layers size={18} />
            </div>
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Total Perlu Bayar Bulanan", "Total Monthly Due")}
              </p>
              <p className="text-lg font-black text-[var(--text)]">
                RM {monthlyTotal.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      )}

      {showSkeleton ? (
        <DataSkeletonList rows={3} />
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:grid-cols-3">
              {active.map(renderCard)}
            </div>
          )}
          {active.length === 0 && !loading && renderEmpty()}
          {settled.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <Check size={14} className="text-emerald-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Selesai", "Settled")}
                </h3>
              </div>
              <div className="space-y-3 opacity-60 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:grid-cols-3">
                {settled.map(renderCard)}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Add/Edit sheet ─── */}
      {mounted && showSheet &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center"
            onClick={requestSheetClose}
            onTouchMove={(event) => event.preventDefault()}
          >
            <div
              {...sheetSwipe}
              data-swipe-sheet
              data-prevent-pull-refresh="true"
              style={{ transform: "translateZ(0)" }}
              onClick={(event) => event.stopPropagation()}
              className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh] md:max-w-md"
            >
              <AppSheetHeader
                title={editing ? tr("Edit BNPL", "Edit BNPL") : tr("Tambah BNPL", "Add BNPL")}
                onClose={requestSheetClose}
              />
              <form id="bnpl-sheet-form" className="space-y-4 px-3 py-3 pb-4 text-[var(--text)] md:px-6 md:py-6" onSubmit={handleSave}>
                {/* Name */}
                <div>
                  <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                    {tr("Nama BNPL", "BNPL Name")}
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                    placeholder={tr("Contoh: iPhone 15", "Example: iPhone 15")}
                  />
                </div>

                {/* Provider */}
                <div>
                  <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                    {tr("Provider", "Provider")}
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProviderOpen((o) => !o)}
                      className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <BnplProviderBadge provider={form.provider} size={30} rounded="rounded-xl" />
                        <span className="truncate text-sm font-bold text-[var(--text)]">
                          {form.provider}
                        </span>
                      </span>
                      <ChevronDown size={16} className={cn("shrink-0 text-[var(--muted)] transition-transform", providerOpen && "rotate-180")} />
                    </button>
                    {providerOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl shadow-black/20">
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
                                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                                selected ? "bg-[var(--surface-tint)]" : "hover:bg-[var(--surface-tint)]",
                              )}
                            >
                              <BnplProviderBadge provider={p.value} size={30} rounded="rounded-xl" />
                              <span className="truncate text-sm font-semibold text-[var(--text)]">{p.label}</span>
                              {selected ? <span className="ml-auto text-[var(--accent2)]">✓</span> : null}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Category (required) */}
                <div>
                  <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                    {tr("Kategori", "Category")} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setWalletOpen((o) => !o)}
                        className="flex w-full items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 text-left"
                      >
                        {form.category_id ? (
                          <CategoryIconGlyph
                            iconName={categories.find((c) => String(c.id) === form.category_id)?.icon_name}
                            categoryName={catName(form.category_id)}
                            kind="expense"
                            size={16}
                          />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                            <CreditCard size={13} />
                          </span>
                        )}
                        <span className={cn("truncate text-sm", form.category_id ? "font-bold text-[var(--text)]" : "text-[var(--muted)]")}>
                          {catName(form.category_id)}
                        </span>
                        <ChevronDown size={16} className="ml-auto shrink-0 text-[var(--muted)]" />
                      </button>
                      {walletOpen && (
                        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl shadow-black/20">
                          {categories.length === 0 && (
                            <div className="px-3 py-3 text-center text-xs text-[var(--muted)]">
                              {tr("Tiada kategori", "No categories")}
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
                                  setWalletOpen(false)
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                                  selected ? "bg-[var(--surface-tint)]" : "hover:bg-[var(--surface-tint)]",
                                )}
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                  <CategoryIconGlyph iconName={c.icon_name} categoryName={c.name} kind="expense" size={16} />
                                </span>
                                <span className="truncate text-sm font-semibold text-[var(--text)]">{c.name}</span>
                                {selected ? <span className="ml-auto text-[var(--accent2)]">✓</span> : null}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <a
                      href={`/${sessionId}/categories`}
                      className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--accent2)] transition hover:bg-[var(--surface-tint-strong)]"
                      aria-label={tr("Tambah kategori", "Add category")}
                    >
                      <Plus size={18} />
                    </a>
                  </div>
                </div>

                {/* Total + monthly */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Jumlah BNPL", "Total")}
                    </label>
                    <input
                      inputMode="decimal"
                      value={form.total_amount}
                      onChange={(e) => setForm((prev) => ({ ...prev, total_amount: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Ansuran Bulanan", "Monthly")}
                    </label>
                    <input
                      inputMode="decimal"
                      value={form.monthly_amount}
                      onChange={(e) => setForm((prev) => ({ ...prev, monthly_amount: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Installment count + due day */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Bilangan Ansuran", "Installments")}
                    </label>
                    <input
                      inputMode="numeric"
                      value={form.installment_count}
                      onChange={(e) => setForm((prev) => ({ ...prev, installment_count: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                      placeholder="3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Due Date (Hari)", "Due Day")}
                    </label>
                    <input
                      inputMode="numeric"
                      value={form.due_day_of_month}
                      onChange={(e) => setForm((prev) => ({ ...prev, due_day_of_month: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                      placeholder="15"
                    />
                  </div>
                </div>

                {/* Start date */}
                <div>
                  <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                    {tr("Tarikh Mula", "Start Date")}
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
                    {tr("Nota", "Notes")}
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                  />
                </div>

                <div className="mt-6 -mx-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-3 pb-2 pt-5 md:-mx-6 md:px-6">
                  <button
                    type="button"
                    onClick={requestSheetClose}
                    className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--muted)] transition active:scale-95"
                  >
                    {tr("Batal", "Cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {saving
                      ? (isBm ? "Menyimpan…" : "Saving…")
                      : editing ? tr("Update", "Update") : tr("Simpan BNPL", "Save BNPL")}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ─── Pay sheet ─── */}
      {payingId !== null &&
        (() => {
          const item = items.find((i) => i.id === payingId)
          if (!item) return null
          return createPortal(
            <div
              className="fixed inset-0 z-[140] flex items-end justify-center bg-transparent sm:items-center"
              onClick={() => setPayingId(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="app-sheet-panel app-sheet-panel--sm w-full max-w-md rounded-t-[28px] border border-[var(--border)] bg-[var(--sheet-bg)] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
              >
                <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[var(--surface-tint-strong)]" />
                <div className="mb-4 flex items-center gap-3">
                  <BnplProviderBadge provider={item.provider} size={44} />
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-[var(--text)]">{item.name}</h3>
                    <p className="text-xs text-[var(--muted)]">
                      {tr("Ansuran bulanan", "Monthly installment")}: RM{" "}
                      {Number(item.monthly_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="relative mb-4">
                  <button
                    type="button"
                    onClick={() => setWalletOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-left"
                  >
                    {payWalletId ? (
                      (() => {
                        const w = wallets.find((x) => x.id === payWalletId)
                        return <span className="truncate text-sm font-bold text-[var(--text)]">{w?.name || "Wallet"}</span>
                      })()
                    ) : (
                      <span className="text-sm text-[var(--muted)]">{tr("Pilih wallet (pilihan)", "Select wallet (optional)")}</span>
                    )}
                    <ChevronDown size={16} className="shrink-0 text-[var(--muted)]" />
                  </button>
                  {walletOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl shadow-black/20">
                      <button
                        type="button"
                        onClick={() => {
                          setPayWalletId(null)
                          setWalletOpen(false)
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                      >
                        {tr("Wallet lalai", "Default wallet")}
                      </button>
                      {wallets.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setPayWalletId(w.id)
                            setWalletOpen(false)
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-tint)]"
                        >
                          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                            <CreditCard size={14} />
                          </span>
                          <span className="truncate text-sm font-semibold text-[var(--text)]">{w.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePay(item)}
                  disabled={payingId === null && false}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-transparent bg-[var(--btn-primary-bg)] py-3 text-sm font-bold text-[var(--btn-primary-text)] transition active:scale-[0.99] disabled:opacity-60"
                >
                  <CreditCard size={16} />
                  {tr("Bayar Ansuran", "Pay Installment")}
                </button>
                <button
                  type="button"
                  onClick={() => setPayingId(null)}
                  className="mt-2 w-full rounded-2xl py-2.5 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  {tr("Batal", "Cancel")}
                </button>
              </div>
            </div>,
            document.body,
          )
        })()}

      {/* hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {alertModal}
    </div>
  )
}
