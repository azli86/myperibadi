"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Users,
  Wallet as WalletIcon,
  Receipt as ReceiptIcon,
  CheckCircle2,
  X,
  HandCoins,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
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
import { formatCurrencyLabel } from "@/components/ui/MoneyAmount"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"

type SplitBill = {
  id: number
  title: string
  transaction_id?: number | null
  currency: string
  total_amount?: number | null
  people_count: number
  share_amount?: number | null
  collect_amount?: number | null
  amount_received: number
  balance_amount: number
  am_i_included: boolean
  status: string
  notes?: string | null
  original_txn_date?: string | null
  created_at: string
  updated_at: string
}

type SplitBillPayment = {
  id: number
  split_bill_id: number
  wallet_id?: number | null
  transaction_id?: number | null
  amount: number
  payment_date?: string | null
  payment_time?: string | null
  notes?: string | null
  has_media: boolean
  media_url?: string | null
  created_at: string
}

type SplitBillDetail = SplitBill & { payments: SplitBillPayment[] }

type WalletItem = {
  id: number
  name: string
  label?: string | null
  image_url?: string | null
  currency: string
}

type TxnOption = {
  id: number
  type: string
  amount: number
  vendor_or_source?: string | null
  txn_date?: string | null
  category_name?: string | null
  wallet_name?: string | null
  currency?: string | null
}

function formatDateShort(value?: string | null, locale = "en-MY") {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

export default function SplitBillsPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [mounted, setMounted] = useState(false)
  const [splits, setSplits] = useState<SplitBill[]>([])
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [transactions, setTransactions] = useState<TxnOption[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<"all" | "active" | "partial" | "completed">("all")
  const [search, setSearch] = useState("")

  // Create sheet
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [editingSplit, setEditingSplit] = useState<SplitBillDetail | null>(null)
  const [form, setForm] = useState({
    transaction_id: "",
    title: "",
    people_count: "2",
    am_i_included: true,
    notes: "",
  })

  // Detail sheet
  const [detailSplit, setDetailSplit] = useState<SplitBillDetail | null>(null)

  // Record payment sheet
  const [showPaymentSheet, setShowPaymentSheet] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: "",
    wallet_id: "",
    payment_date: "",
    payment_time: "",
    notes: "",
  })
  const [payFile, setPayFile] = useState<File | null>(null)
  const payFileInputRef = useRef<HTMLInputElement>(null)
  const [payPreview, setPayPreview] = useState<string | null>(null)

  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showCreateSheet || showPaymentSheet || !!detailSplit } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showCreateSheet, showPaymentSheet, detailSplit])

  const loadSplits = useCallback(async () => {
    if (!hasLoaded) setLoading(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/split-bills", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      })
      if (!res.ok) throw new Error(tr("Gagal muat split bill.", "Failed to load split bills."))
      const data = await res.json()
      setSplits(Array.isArray(data) ? data : [])
      setHasLoaded(true)
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal muat split bill.", "Failed to load split bills."),
        "error",
      )
    } finally {
      setLoading(false)
    }
  }, [hasLoaded, tr])

  const loadWallets = useCallback(async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/wallets", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      setWallets(Array.isArray(data) ? data : [])
    } catch {
      // silent — wallet picker optional
    }
  }, [])

  const loadTransactions = useCallback(async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/transactions?limit=200", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } catch {
      // silent — transaction picker optional
    }
  }, [])

  useEffect(() => {
    void loadSplits()
    void loadWallets()
    void loadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const createFlag = searchParams.get("create")
    const txnParam = searchParams.get("txn")
    if (createFlag === "1") {
      openCreateSheet()
      if (txnParam) {
        setForm((prev) => ({ ...prev, transaction_id: txnParam }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreateSheet = useCallback(() => {
    setEditingSplit(null)
    setForm({ transaction_id: "", title: "", people_count: "2", am_i_included: true, notes: "" })
    setShowCreateSheet(true)
  }, [])

  const closeCreateSheet = useCallback(() => {
    setShowCreateSheet(false)
    setEditingSplit(null)
  }, [])

  const { requestClose: requestCreateClose } = useOverlayBackClose({
    id: "split-create-sheet",
    isOpen: showCreateSheet,
    onClose: closeCreateSheet,
  })
  const showCreateSwipe = useSwipeDownToClose(requestCreateClose)

  const openDetail = useCallback(async (split: SplitBill) => {
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/split-bills/${split.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      })
      if (!res.ok) return
      const data = (await res.json()) as SplitBillDetail
      setDetailSplit(data)
    } catch {
      // silent
    }
  }, [])

  const closeDetail = useCallback(() => setDetailSplit(null), [])
  const { requestClose: requestDetailClose } = useOverlayBackClose({
    id: "split-detail-sheet",
    isOpen: !!detailSplit,
    onClose: closeDetail,
  })
  const showDetailSwipe = useSwipeDownToClose(requestDetailClose)

  const openEditFromDetail = useCallback(() => {
    if (!detailSplit) return
    setEditingSplit(detailSplit)
    setForm({
      transaction_id: detailSplit.transaction_id ? String(detailSplit.transaction_id) : "",
      title: detailSplit.title,
      people_count: String(detailSplit.people_count),
      am_i_included: detailSplit.am_i_included,
      notes: detailSplit.notes || "",
    })
    setShowCreateSheet(true)
    closeDetail()
  }, [detailSplit, closeDetail])

  const openPayment = useCallback(() => {
    if (!detailSplit) return
    setPayForm({
      amount: detailSplit.balance_amount > 0 ? String(detailSplit.balance_amount) : "",
      wallet_id: detailSplit.transaction_id ? "" : "",
      payment_date: "",
      payment_time: "",
      notes: "",
    })
    setPayFile(null)
    setPayPreview(null)
    setShowPaymentSheet(true)
  }, [detailSplit])

  const closePayment = useCallback(() => {
    setShowPaymentSheet(false)
    setPayFile(null)
    setPayPreview(null)
  }, [])

  const { requestClose: requestPaymentClose } = useOverlayBackClose({
    id: "split-payment-sheet",
    isOpen: showPaymentSheet,
    onClose: closePayment,
  })
  const showPaymentSwipe = useSwipeDownToClose(requestPaymentClose)

  async function handleCreateSplit(e: React.FormEvent) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), tr("Tajuk diperlukan.", "Title is required."), "error")
      return
    }
    const people = Math.max(1, parseInt(form.people_count || "2", 10) || 2)
    setSaving(true)
    try {
      const token = getAccessToken()
      const url = editingSplit ? `/api/split-bills/${editingSplit.id}` : "/api/split-bills"
      const method = editingSplit ? "PATCH" : "POST"
      const body: Record<string, unknown> = {
        title,
        transaction_id: form.transaction_id ? Number(form.transaction_id) : null,
        people_count: people,
        am_i_included: form.am_i_included,
        notes: form.notes.trim() || null,
      }
      if (editingSplit) {
        body.status = editingSplit.status
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan split bill.", "Failed to save split bill."))
      }
      closeCreateSheet()
      await loadSplits()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : tr("Gagal simpan split bill.", "Failed to save split bill."), "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSplit(split: SplitBill) {
    showConfirm(tr("Padam split bill?", "Delete split bill?"), tr(`Padam ${split.title}?`, `Delete ${split.title}?`), async () => {
      setSaving(true)
      try {
        const token = getAccessToken()
        const res = await fetch(`/api/split-bills/${split.id}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { detail?: string } | null
          throw new Error(payload?.detail || tr("Gagal padam split bill.", "Failed to delete split bill."))
        }
        setDetailSplit(null)
        await loadSplits()
      } catch (err) {
        showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : tr("Gagal padam split bill.", "Failed to delete split bill."), "error")
      } finally {
        setSaving(false)
      }
    }, "warning")
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!detailSplit) return
    const amount = Number.parseFloat(payForm.amount || "0")
    if (!amount || amount <= 0) {
      showAlert(tr("Amaun tak sah", "Invalid amount"), tr("Amaun mesti lebih daripada sifar.", "Amount must be greater than zero."), "error")
      return
    }
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/split-bills/${detailSplit.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          amount,
          wallet_id: payForm.wallet_id ? Number(payForm.wallet_id) : null,
          payment_date: payForm.payment_date || null,
          payment_time: payForm.payment_time || null,
          notes: payForm.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal rekod bayaran.", "Failed to record payment."))
      }
      const updated = (await res.json()) as SplitBillDetail
      setDetailSplit(updated)
      setSplits((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      closePayment()
      if (payFile && updated.payments.length > 0) {
        const lastPay = updated.payments[0]
        await uploadPaymentMedia(updated.id, lastPay.id, payFile)
      }
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : tr("Gagal rekod bayaran.", "Failed to record payment."), "error")
    } finally {
      setSaving(false)
    }
  }

  async function uploadPaymentMedia(splitId: number, paymentId: number, file: File) {
    try {
      const token = getAccessToken()
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/split-bills/${splitId}/payments/${paymentId}/media`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      if (!res.ok) return
      const updated = (await res.json()) as SplitBillDetail
      setDetailSplit(updated)
      setSplits((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch {
      // silent — media upload optional
    }
  }

  async function handleMarkCompleted(split: SplitBill) {
    if (split.balance_amount > 0) {
      showAlert(tr("Tidak dapat selesai", "Cannot complete"), tr("Baki belum sifar. Rekod semua bayaran dahulu.", "Balance is not zero. Record all payments first."), "error")
      return
    }
    showConfirm(tr("Tandakan selesai?", "Mark completed?"), tr(`Tandakan ${split.title} sebagai selesai?`, `Mark ${split.title} as completed?`), async () => {
      setSaving(true)
      try {
        const token = getAccessToken()
        const res = await fetch(`/api/split-bills/${split.id}/complete`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { detail?: string } | null
          throw new Error(payload?.detail || tr("Gagal selesai.", "Failed to complete."))
        }
        const updated = (await res.json()) as SplitBillDetail
        setDetailSplit(updated)
        setSplits((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      } catch (err) {
        showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : tr("Gagal selesai.", "Failed to complete."), "error")
      } finally {
        setSaving(false)
      }
    }, "success")
  }

  // Live calc for create form
  const selectedTxn = useMemo(
    () => transactions.find((t) => String(t.id) === form.transaction_id),
    [form.transaction_id, transactions],
  )
  const formTotal = useMemo(() => {
    if (selectedTxn) return selectedTxn.amount
    return null
  }, [selectedTxn])
  const peopleCount = Math.max(1, parseInt(form.people_count || "2", 10) || 2)
  const perPerson = formTotal != null ? round2(formTotal / peopleCount) : null
  const formShare = form.am_i_included ? (perPerson ?? 0) : 0
  const formCollect = formTotal != null
    ? (form.am_i_included && peopleCount > 1 ? round2(formTotal * (peopleCount - 1) / peopleCount) : form.am_i_included ? 0 : formTotal)
    : 0
  const createValid = form.title.trim() !== "" && peopleCount >= 1

  // Summary
  const activeCount = splits.filter((s) => s.status === "active" || s.status === "partial").length
  const completedCount = splits.filter((s) => s.status === "completed").length
  const pendingCollection = splits
    .filter((s) => s.status === "active" || s.status === "partial")
    .reduce((sum, s) => sum + (s.balance_amount || 0), 0)

  const sortedSplits = useMemo(() => {
    const filtered = splits.filter((s) => {
      const matchesFilter = filter === "all" || s.status === filter
      const term = search.trim().toLowerCase()
      const matchesSearch = !term || s.title.toLowerCase().includes(term)
      return matchesFilter && matchesSearch
    })
    const order: Record<string, number> = { active: 0, partial: 1, completed: 2 }
    return [...filtered].sort((a, b) => {
      const statusDiff = (order[a.status] ?? 2) - (order[b.status] ?? 2)
      if (statusDiff !== 0) return statusDiff
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    })
  }, [splits, filter, search])

  const currentCurrency = "RM"

  const statusBadge = (status: string) => {
    if (status === "completed") {
      return { label: tr("Selesai", "Completed"), cls: "bg-[var(--accent)]/15 text-[var(--accent)]" }
    }
    if (status === "partial") {
      return { label: tr("Separa", "Partial"), cls: "bg-amber-500/15 text-amber-500" }
    }
    return { label: tr("Menunggu", "Pending"), cls: "bg-[var(--accent2)]/15 text-[var(--accent2)]" }
  }

  const renderSplitCard = (split: SplitBill, compact = false) => {
    const badge = statusBadge(split.status)
    const collect = split.collect_amount || 0
    const received = split.amount_received || 0
    const pct = collect > 0 ? Math.min(100, Math.round((received / collect) * 100)) : 100
    const receivedCount = Math.round(collect > 0 ? (received / collect) * (split.people_count - (split.am_i_included ? 1 : 0)) : 0)
    const toCollectCount = split.people_count - (split.am_i_included ? 1 : 0)

    return (
      <div
        key={split.id}
        onClick={() => openDetail(split)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openDetail(split)
          }
        }}
        className={cn(
          "group w-full overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-left transition",
          compact ? "hover:border-[color-mix(in_srgb,var(--accent2)_30%,var(--border))] active:scale-[0.99] md:px-4 md:py-3.5" : "active:scale-[0.985]",
        )}
      >
        <div className="flex items-center gap-2.5 md:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--icon-fg)]">
            <Users size={22} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-[var(--text)]">{split.title}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider", badge.cls)}>{badge.label}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-[var(--muted)]">
              <Calendar size={11} />
              {formatDateShort(split.original_txn_date)}
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-[0.6875rem]">
              <div>
                <span className="block text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Jumlah", "Total")}</span>
                <span className="font-bold text-[var(--text)]">
                  <MoneyAmount value={Number(split.total_amount || 0)} currency={split.currency} size="sm" />
                </span>
              </div>
              <div>
                <span className="block text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Diterima", "Received")}</span>
                <span className="font-bold text-[var(--accent)]">
                  <MoneyAmount value={received} currency={split.currency} size="sm" />
                </span>
              </div>
              <div>
                <span className="block text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Baki", "Balance")}</span>
                <span className={cn("font-bold", split.balance_amount > 0 ? "text-amber-500" : "text-[var(--accent)]")}>
                  <MoneyAmount value={split.balance_amount} currency={split.currency} size="sm" />
                </span>
              </div>
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between text-[0.6rem] text-[var(--muted)]">
                <span>{receivedCount} {tr("daripada", "of")} {toCollectCount} {tr("bahagian", "shares")} {tr("diterima", "received")}</span>
                <span className="font-bold">{pct}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint)]">
                <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteSplit(split)
              }}
              className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--surface-tint)] hover:text-red-500"
              aria-label={tr("Padam", "Delete")}
            >
              <Trash2 size={15} />
            </button>
            <ChevronRight size={16} className="text-[var(--muted)]/50" />
          </div>
        </div>
      </div>
    )
  }

  const filters: { key: typeof filter; label: string }[] = [
    { key: "all", label: tr("Semua", "All") },
    { key: "active", label: tr("Aktif", "Active") },
    { key: "partial", label: tr("Separa", "Partial") },
    { key: "completed", label: tr("Selesai", "Completed") },
  ]

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Split Bill", "Split Bill")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Buat Split Bill", "Create Split Bill")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        <section className="px-1">
          {/* Summary */}
          <div className="mb-4 rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
                <HandCoins size={22} />
              </span>
              <div>
                <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Belum Diterima", "Pending Collection")}</p>
                <p className="text-xl font-black text-[var(--text)]">
                  <MoneyAmount value={pendingCollection} currency="RM" />
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              <div>
                <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Aktif", "Active")}</p>
                <p className="text-lg font-black text-[var(--text)]">{activeCount}</p>
              </div>
              <div>
                <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Selesai", "Completed")}</p>
                <p className="text-lg font-black text-[var(--text)]">{completedCount}</p>
              </div>
            </div>
          </div>

          {/* Filter + search */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex flex-1 gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--surface-tint)] p-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition",
                    filter === f.key ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Cari split bill…", "Search split bills…")}
              className="w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          <div className="space-y-3">
            {showDataSkeleton ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
                  <AmountSkeleton className="h-4 w-32" />
                  <AmountSkeleton className="mt-2 h-3 w-40" />
                </div>
              ))
            ) : sortedSplits.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 p-8 text-center">
                <Users size={32} className="mx-auto text-[var(--muted)]/40" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Belum ada split bill.", "No split bills yet.")}</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--muted)]/80">
                  {tr("Bahagikan bil bila anda bayar dahulu dan jangka orang lain membayar balik anda.", "Split a transaction when you pay first and expect others to reimburse you.")}
                </p>
                <button
                  type="button"
                  onClick={openCreateSheet}
                  className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-95"
                >
                  <Plus size={14} className="mr-1 inline" />
                  {tr("Buat Split Bill", "Create Split Bill")}
                </button>
              </div>
            ) : (
              sortedSplits.map((split) => renderSplitCard(split, false))
            )}
          </div>
        </section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Split Bill", "Split Bill")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={openCreateSheet}>
              <Plus strokeWidth={2.5} />
              {tr("Buat Split Bill", "Create Split Bill")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="space-y-5">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
                  <HandCoins size={22} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Belum Diterima", "Pending Collection")}</p>
                  <p className="text-2xl font-black text-[var(--text)]">
                    <MoneyAmount value={pendingCollection} currency="RM" />
                  </p>
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Aktif", "Active")}</p>
                  <p className="text-xl font-black text-[var(--text)]">{activeCount}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Selesai", "Completed")}</p>
                  <p className="text-xl font-black text-[var(--text)]">{completedCount}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] p-1">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-xs font-bold transition",
                      filter === f.key ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("Cari split bill…", "Search split bills…")}
                className="w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--border-strong)] sm:max-w-xs"
              />
            </div>
          </div>

          <div className="space-y-3">
            {showDataSkeleton ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]" />
              ))
            ) : sortedSplits.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--card)]/70 px-6 py-14 text-center">
                <Users size={40} className="text-[var(--muted)]/30" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Belum ada split bill.", "No split bills yet.")}</p>
                <button
                  type="button"
                  onClick={openCreateSheet}
                  className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--bg)]"
                >
                  <Plus size={14} className="mr-1.5 inline" />
                  {tr("Buat Split Bill", "Create Split Bill")}
                </button>
              </div>
            ) : (
              sortedSplits.map((split) => renderSplitCard(split, true))
            )}
          </div>
        </DesktopPageBody>
      </div>

      {/* ─── Create/Edit Sheet ─── */}
      {mounted && showCreateSheet
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-stretch md:justify-end"
              onClick={requestCreateClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...showCreateSwipe}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:h-[100dvh] md:max-h-none md:max-w-[420px] md:rounded-none md:border-y-0 md:border-l md:border-r-0"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={editingSplit ? tr("Edit Split Bill", "Edit Split Bill") : tr("Buat Split Bill", "Create Split Bill")}
                  onClose={requestCreateClose}
                  action={
                    <button
                      type="submit"
                      form="split-sheet-form"
                      disabled={saving || !createValid}
                      className="px-1 py-1.5 text-sm font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-50"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editingSplit ? tr("Update", "Update") : tr("Simpan", "Save")}
                    </button>
                  }
                />

                <form id="split-sheet-form" className="space-y-4 px-3 py-3 pb-4 text-[var(--text)] md:px-6 md:py-6" onSubmit={handleCreateSplit}>
                  {/* Transaction picker */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Transaksi", "Transaction")}
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => document.getElementById("split-txn-select")?.focus()}
                        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)]"
                      >
                        {selectedTxn ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <ReceiptIcon size={15} className="shrink-0 text-[var(--muted)]" />
                            <span className="truncate font-medium">{selectedTxn.vendor_or_source || `#${selectedTxn.id}`}</span>
                            <span className="ml-auto shrink-0 font-bold">
                              <MoneyAmount value={selectedTxn.amount} currency={selectedTxn.currency || "RM"} size="sm" />
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-[var(--muted)]">
                            <ReceiptIcon size={15} />
                            {tr("Pilih transaksi (opsyenal)", "Select transaction (optional)")}
                          </span>
                        )}
                        <ChevronDown size={16} className="shrink-0 text-[var(--muted)]" />
                      </button>
                    </div>
                    <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-1">
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, transaction_id: "" }))}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--card)]"
                      >
                        {tr("Tiada transaksi", "No transaction")}
                      </button>
                      {transactions.slice(0, 40).map((txn) => {
                        const selected = String(txn.id) === form.transaction_id
                        return (
                          <button
                            key={txn.id}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, transaction_id: String(txn.id) }))}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                              selected ? "bg-[var(--card)]" : "hover:bg-[var(--card)]",
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">
                              {txn.vendor_or_source || `#${txn.id}`}
                              <span className="ml-1 text-[0.6rem] text-[var(--muted)]">{formatDateShort(txn.txn_date)}</span>
                            </span>
                            <span className="shrink-0 font-bold text-[var(--text)]">
                              <MoneyAmount value={txn.amount} currency={txn.currency || "RM"} size="sm" />
                            </span>
                            {selected ? <span className="text-[var(--accent2)]">✓</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Tajuk", "Title")}
                    </label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder={tr("Contoh: Makan Nasi Arab", "Example: Lunch")}
                    />
                  </div>

                  {/* Total amount (auto from txn) */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Jumlah Bayaran", "Total Paid")}
                    </label>
                    <div className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{currentCurrency}</span>
                      <span className="text-xl font-black text-[var(--text)]">
                        {formTotal != null ? formTotal.toFixed(2) : "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.6rem] text-[var(--muted)]">
                      {tr("Amaun diambil daripada transaksi yang dipilih.", "Amount taken from the selected transaction.")}
                    </p>
                  </div>

                  {/* Number of people */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Bilangan Orang", "Number of People")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.people_count}
                      onChange={(e) => setForm((prev) => ({ ...prev, people_count: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                    />
                  </div>

                  {/* I am included toggle */}
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, am_i_included: !prev.am_i_included }))}
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-semibold text-[var(--text)] transition",
                      form.am_i_included && "border-[var(--accent)]/40",
                    )}
                  >
                    {tr("Saya termasuk", "I am included")}
                    <span className={cn("flex h-6 w-11 items-center rounded-full p-0.5 transition", form.am_i_included ? "bg-[var(--accent)]" : "bg-[var(--muted)]/40")}>
                      <span className={cn("h-5 w-5 rounded-full bg-white transition", form.am_i_included && "translate-x-5")} />
                    </span>
                  </button>

                  {/* Live calc */}
                  {formTotal != null ? (
                    <div className="space-y-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">{tr("Jumlah Dibayar", "Total paid")}</span>
                        <span className="font-bold text-[var(--text)]"><MoneyAmount value={formTotal} currency="RM" size="sm" /></span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">{peopleCount} {tr("orang × RM", "people × ")}{perPerson != null ? perPerson.toFixed(2) : "0.00"}</span>
                        <span className="font-bold text-[var(--text)]">
                          {perPerson != null ? (perPerson * peopleCount).toFixed(2) : "0.00"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">{tr("Bahagian Saya", "Your share")}</span>
                        <span className="font-bold text-[var(--text)]"><MoneyAmount value={formShare} currency="RM" size="sm" /></span>
                      </div>
                      <div className="flex items-center justify-between border-t border-[var(--border)] pt-1.5">
                        <span className="font-bold text-[var(--muted)]">{tr("Perlu Dikumpul", "To collect")}</span>
                        <span className="font-black text-[var(--accent)]"><MoneyAmount value={formCollect} currency="RM" size="sm" /></span>
                      </div>
                    </div>
                  ) : null}

                  {/* Notes */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Nota", "Notes")}
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder={tr("Opsyenal", "Optional")}
                    />
                  </div>

                  <div className="mt-6 -mx-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-3 pb-2 pt-5 md:-mx-6 md:px-6">
                    <button
                      type="button"
                      onClick={requestCreateClose}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--muted)] transition active:scale-95"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !createValid}
                      className="flex-1 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editingSplit ? tr("Update", "Update") : tr("Buat Split Bill", "Create Split Bill")}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ─── Detail Sheet ─── */}
      {mounted && detailSplit
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-stretch md:justify-end"
              onClick={requestDetailClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...showDetailSwipe}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:h-[100dvh] md:max-h-none md:max-w-[420px] md:rounded-none md:border-y-0 md:border-l md:border-r-0"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader title={tr("Butiran Split Bill", "Split Bill Details")} onClose={requestDetailClose} />

                <div className="px-3 py-3 text-[var(--text)] md:px-6 md:py-6">
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-black">{detailSplit.title}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider", statusBadge(detailSplit.status).cls)}>
                      {statusBadge(detailSplit.status).label}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-[var(--muted)]">
                    <Calendar size={11} />
                    {formatDateShort(detailSplit.original_txn_date)}
                  </p>

                  {detailSplit.transaction_id ? (
                    <a
                      href={`/${sessionId}/transactions/${detailSplit.transaction_id}`}
                      className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 transition active:scale-[0.99]"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                        <ReceiptIcon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.6rem] font-black uppercase tracking-wider text-[var(--muted)]">{tr("Transaksi Asal", "Original Transaction")}</span>
                        <span className="block truncate text-sm font-bold">{tr("Buka transaksi", "Open transaction")}</span>
                      </span>
                      <ChevronRight size={16} className="text-[var(--muted)]" />
                    </a>
                  ) : null}

                  {/* Summary grid */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Jumlah", "Total")}</p>
                      <p className="mt-0.5 text-lg font-black"><MoneyAmount value={detailSplit.total_amount || 0} currency={detailSplit.currency} /></p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Orang", "People")}</p>
                      <p className="mt-0.5 text-lg font-black">{detailSplit.people_count}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Bahagian Saya", "Your share")}</p>
                      <p className="mt-0.5 text-lg font-black"><MoneyAmount value={detailSplit.share_amount || 0} currency={detailSplit.currency} /></p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Perlu Diterima", "Expected")}</p>
                      <p className="mt-0.5 text-lg font-black"><MoneyAmount value={detailSplit.collect_amount || 0} currency={detailSplit.currency} /></p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--accent)]/10 p-3">
                      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Diterima", "Received")}</p>
                      <p className="mt-0.5 text-lg font-black text-[var(--accent)]"><MoneyAmount value={detailSplit.amount_received} currency={detailSplit.currency} /></p>
                    </div>
                    <div className={cn("rounded-2xl border p-3", detailSplit.balance_amount > 0 ? "border-[var(--border)] bg-amber-500/10" : "border-[var(--border)] bg-[var(--accent)]/10")}>
                      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Baki", "Balance")}</p>
                      <p className={cn("mt-0.5 text-lg font-black", detailSplit.balance_amount > 0 ? "text-amber-500" : "text-[var(--accent)]")}>
                        <MoneyAmount value={detailSplit.balance_amount} currency={detailSplit.currency} />
                      </p>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span className="font-bold">{tr("Kemajuan Bayaran", "Payment Progress")}</span>
                      <span className="font-black text-[var(--text)]">
                        {detailSplit.collect_amount && detailSplit.collect_amount > 0 ? Math.min(100, Math.round((detailSplit.amount_received / detailSplit.collect_amount) * 100)) : 100}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--muted)]/15">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all"
                        style={{ width: `${detailSplit.collect_amount && detailSplit.collect_amount > 0 ? Math.min(100, Math.round((detailSplit.amount_received / detailSplit.collect_amount) * 100)) : 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Payment history */}
                  <div className="mt-4">
                    <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">{tr("Sejarah Bayaran", "Payment History")}</p>
                    {detailSplit.payments.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">{tr("Belum ada bayaran.", "No payments yet.")}</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {detailSplit.payments.map((p) => (
                          <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                              <Check size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold">
                                <MoneyAmount value={p.amount} currency={detailSplit.currency} size="sm" />
                              </p>
                              <p className="text-[0.6rem] text-[var(--muted)]">{formatDateShort(p.payment_date)}{p.payment_time ? ` · ${p.payment_time}` : ""}</p>
                              {p.notes ? <p className="truncate text-[0.6rem] text-[var(--muted)]">{p.notes}</p> : null}
                            </div>
                            {p.has_media ? <CheckCircle2 size={16} className="shrink-0 text-[var(--accent)]" /> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-5 space-y-2">
                    {detailSplit.status !== "completed" && (
                      <button
                        type="button"
                        onClick={openPayment}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2.5 text-sm font-black text-white transition active:scale-[0.98]"
                      >
                        <Plus size={15} />
                        {tr("Rekod Bayaran", "Record Payment")}
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={openEditFromDetail}
                        className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
                      >
                        {tr("Edit Split", "Edit Split")}
                      </button>
                      {detailSplit.status !== "completed" ? (
                        <button
                          type="button"
                          onClick={() => handleMarkCompleted(detailSplit)}
                          disabled={detailSplit.balance_amount > 0}
                          className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-bold text-[var(--accent)] transition active:scale-[0.98] disabled:opacity-40"
                        >
                          {tr("Tandakan Selesai", "Mark Completed")}
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSplit(detailSplit)}
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-red-500/30 px-4 py-2.5 text-sm font-bold text-red-500 transition active:scale-[0.98]"
                    >
                      <Trash2 size={15} />
                      {tr("Padam Split", "Delete Split")}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ─── Record Payment Sheet ─── */}
      {mounted && showPaymentSheet && detailSplit
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-stretch md:justify-end"
              onClick={requestPaymentClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...showPaymentSwipe}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:h-[100dvh] md:max-h-none md:max-w-[420px] md:rounded-none md:border-y-0 md:border-l md:border-r-0"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader title={tr("Rekod Bayaran", "Record Payment")} onClose={requestPaymentClose} />

                <form className="space-y-4 px-3 py-3 pb-4 text-[var(--text)] md:px-6 md:py-6" onSubmit={handleRecordPayment}>
                  {/* Amount */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Amaun", "Amount")}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={payForm.amount}
                        onChange={(e) => setPayForm((prev) => ({ ...prev, amount: e.target.value.replace(/[^0-9.]/g, "") }))}
                        placeholder="0.00"
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-3 pl-4 pr-14 text-lg font-black text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-[var(--muted)]">
                        {formatCurrencyLabel(detailSplit.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Receiving wallet */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Wallet Penerima", "Receiving Wallet")}
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => document.getElementById("pay-wallet")?.focus()}
                        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)]"
                      >
                        {payForm.wallet_id ? (
                          (() => {
                            const w = wallets.find((x) => x.id === Number(payForm.wallet_id))
                            return <span className="truncate font-medium">{w?.name || tr("Pilih wallet", "Select wallet")}</span>
                          })()
                        ) : (
                          <span className="flex items-center gap-2 text-[var(--muted)]">
                            <WalletIcon size={15} />
                            {tr("Guna wallet transaksi asal", "Use original transaction wallet")}
                          </span>
                        )}
                        <ChevronDown size={16} className="text-[var(--muted)]" />
                      </button>
                    </div>
                    <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-1">
                      <button
                        type="button"
                        onClick={() => setPayForm((prev) => ({ ...prev, wallet_id: "" }))}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--card)]"
                      >
                        {tr("Wallet transaksi asal", "Original transaction wallet")}
                      </button>
                      {wallets.map((w) => {
                        const selected = String(w.id) === payForm.wallet_id
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setPayForm((prev) => ({ ...prev, wallet_id: String(w.id) }))}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition",
                              selected ? "bg-[var(--card)]" : "hover:bg-[var(--card)]",
                            )}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                              {w.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <WalletIcon size={14} />
                              )}
                            </span>
                            <span className="truncate text-sm font-medium text-[var(--text)]">{w.name}</span>
                            {selected ? <span className="ml-auto text-[var(--accent2)]">✓</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Date + time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">{tr("Tarikh", "Date")}</label>
                      <input
                        type="date"
                        value={payForm.payment_date}
                        onChange={(e) => setPayForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-3 text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">{tr("Masa", "Time")}</label>
                      <input
                        type="time"
                        value={payForm.payment_time}
                        onChange={(e) => setPayForm((prev) => ({ ...prev, payment_time: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-3 text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">{tr("Nota", "Notes")}</label>
                    <textarea
                      value={payForm.notes}
                      onChange={(e) => setPayForm((prev) => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder={tr("Opsyenal", "Optional")}
                    />
                  </div>

                  {/* Screenshot upload */}
                  <div>
                    <input
                      ref={payFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        setPayFile(file)
                        if (file && file.type.startsWith("image/")) {
                          setPayPreview(URL.createObjectURL(file))
                        } else {
                          setPayPreview(null)
                        }
                        e.target.value = ""
                      }}
                    />
                    {payPreview ? (
                      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={payPreview} alt="" className="max-h-40 w-full object-contain bg-[var(--surface-tint)]" />
                        <button
                          type="button"
                          onClick={() => { setPayFile(null); setPayPreview(null) }}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] text-[var(--muted)] shadow active:scale-95"
                          aria-label={tr("Buang", "Remove")}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => payFileInputRef.current?.click()}
                        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] px-4 py-5 text-center transition active:scale-[0.99]"
                      >
                        <Upload size={20} className="text-[var(--muted)]" />
                        <span className="text-xs font-semibold text-[var(--muted)]">
                          {tr("Muat naik bukti bayaran (opsyenal)", "Upload payment screenshot (optional)")}
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="mt-6 -mx-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-3 pb-2 pt-5 md:-mx-6 md:px-6">
                    <button
                      type="button"
                      onClick={requestPaymentClose}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--muted)] transition active:scale-95"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !Number.parseFloat(payForm.amount || "0")}
                      className="flex-1 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : tr("Rekod Bayaran", "Record Payment")}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {alertModal}
    </div>
  )
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
