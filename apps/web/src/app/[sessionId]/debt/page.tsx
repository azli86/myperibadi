"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  History,
  Loader2,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
  HandCoins,
  Users,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { getAccessToken } from "@/lib/auth-session"
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
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"

/* ── Types ── */

type DebtSummary = {
  debtor_id?: number | null
  counterparty_name: string
  counterparty_key: string
  balance: number
  total_lent: number
  total_borrowed: number
  total_paid_in: number
  total_paid_out: number
  event_count: number
  last_activity_at?: string | null
}

type Debtor = {
  id: number
  name: string
  key: string
  is_active: boolean
  created_at: string
  balance: number
  event_count: number
}

type DebtEvent = {
  id: number
  wallet_name?: string | null
  transaction_reference_id?: string | null
  debtor_id?: number | null
  counterparty_name: string
  counterparty_key: string
  event_type: DebtEventType
  amount: number
  signed_delta: number
  txn_date: string
  notes?: string | null
  source_channel?: string | null
  created_at: string
}

type WalletOption = {
  id: number
  name?: string | null
  label?: string | null
  balance?: number | null
  is_bot_default?: boolean | null
}

type DebtEventType =
  | "lend"
  | "borrow"
  | "payment_in"
  | "payment_out"
  | "opening_receivable"
  | "opening_payable"

const EVENT_OPTIONS: Array<{
  value: DebtEventType
  tone: "out" | "in" | "settle"
  label?: string
}> = [
  { value: "lend", tone: "out", label: "Lend" },
  { value: "borrow", tone: "in", label: "Borrow" },
  { value: "payment_in", tone: "in", label: "Paid Me" },
  { value: "payment_out", tone: "out", label: "I Paid" },
  { value: "opening_receivable", tone: "in" },
  { value: "opening_payable", tone: "out" },
]

function todayKey() {
  const now = new Date()
  const kl = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  return `${kl.getFullYear()}-${String(kl.getMonth() + 1).padStart(2, "0")}-${String(kl.getDate()).padStart(2, "0")}`
}

function isOpeningEvent(type: DebtEventType) {
  return type === "opening_receivable" || type === "opening_payable"
}

async function readApiErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown; message?: unknown } | null
  const detail = payload?.detail ?? payload?.message
  if (typeof detail === "string" && detail.trim()) return detail
  return fallback
}

function formatDateLabel(value?: string | null) {
  if (!value) return ""
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

/* ── Main Component ── */

export default function DebtPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()

  const [summaries, setSummaries] = useState<DebtSummary[]>([])
  const [entries, setEntries] = useState<DebtEvent[]>([])
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [activeTab, setActiveTab] = useState<"all" | "lent" | "borrowed">("all")
  const [activeName, setActiveName] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading)
  const showDetailSkeleton = useDelayedSkeleton(detailLoading, { delayMs: 0, minVisibleMs: 800 })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deletingDebtorId, setDeletingDebtorId] = useState<number | null>(null)
  const [showAddEntryForm, setShowAddEntryForm] = useState(false)
  const [showSettleEntryForm, setShowSettleEntryForm] = useState(false)
  const [mounted, setMounted] = useState(false)
  const showEntryForm = showAddEntryForm || showSettleEntryForm
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const addEntrySheetSwipe = useSwipeDownToClose(() => setShowAddEntryForm(false))
  const settleEntrySheetSwipe = useSwipeDownToClose(() => setShowSettleEntryForm(false))

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const [form, setForm] = useState({
    debtor_id: "",
    counterparty_name: "",
    event_type: "lend" as DebtEventType,
    amount: "",
    wallet_id: "",
    txn_date: todayKey(),
    notes: "",
  })

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, row) => {
        const balance = Number(row.balance || 0)
        if (balance > 0) {
          acc.receivable += balance
          acc.receivableCount++
        } else if (balance < 0) {
          acc.payable += Math.abs(balance)
          acc.payableCount++
        } else {
          acc.settledCount++
        }
        return acc
      },
      { receivable: 0, payable: 0, receivableCount: 0, payableCount: 0, settledCount: 0 },
    )
  }, [summaries])

  const filteredData = useMemo(() => {
    let list = summaries
    const needle = query.trim().toLowerCase()
    if (needle) list = list.filter((s) => s.counterparty_name.toLowerCase().includes(needle))
    const lent = list.filter((s) => s.balance > 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    const borrowed = list.filter((s) => s.balance < 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    const settled = list.filter((s) => s.balance === 0)
    const all = [...lent, ...borrowed, ...settled]
    return { all, lent, borrowed, settled }
  }, [summaries, query])

  const activeList =
    activeTab === "all" ? filteredData.all : activeTab === "lent" ? filteredData.lent : filteredData.borrowed
  const activeSummary = summaries.find((s) => s.counterparty_name === activeName) || null

  const fetchSummaries = useCallback(async (nextName?: string) => {
    const token = getAccessToken()
    if (!token) return
    const res = await fetch(`/api/debts?include_settled=true`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      setSummaries(data)
      if (nextName) setActiveName(nextName)
    }
  }, [])

  const fetchWallets = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return
    const res = await fetch("/api/wallets", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setWallets(await res.json())
  }, [])

  const fetchDebtors = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return
    const res = await fetch("/api/debtors", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setDebtors(await res.json())
  }, [])

  const fetchEntries = useCallback(async (name: string) => {
    const token = getAccessToken()
    if (!token) return
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/debts/${encodeURIComponent(name)}/entries?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setEntries(await res.json())
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchSummaries(), fetchWallets(), fetchDebtors()]).finally(() => setLoading(false))
  }, [fetchSummaries, fetchWallets, fetchDebtors])

  useEffect(() => {
    if (activeName) fetchEntries(activeName)
  }, [activeName, fetchEntries])

  const openDebtDetail = useCallback((name: string) => {
    setActiveName(name)
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      window.history.pushState({ portalDebtDetail: true }, "", window.location.href)
    }
  }, [])

  const closeDebtDetail = useCallback(() => {
    setActiveName("")
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      if (window.matchMedia("(max-width: 1023px)").matches && activeName) setActiveName("")
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [activeName])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const hidden = showEntryForm
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showEntryForm])

  /* ── Actions ── */

  async function handleCreateEntry(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!form.counterparty_name.trim() || isNaN(amount) || amount <= 0) return
    setSaving(true)
    try {
      const token = getAccessToken()
      if (!token) throw new Error("Session expired")
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          debtor_id: form.debtor_id ? Number(form.debtor_id) : null,
          counterparty_name: form.counterparty_name.trim(),
          event_type: form.event_type,
          amount,
          wallet_id: isOpeningEvent(form.event_type) ? null : form.wallet_id ? Number(form.wallet_id) : null,
          txn_date: form.txn_date,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Failed to save"))
      showAlert(tr("Berjaya", "Saved"), tr("Rekod disimpan.", "Entry saved."), "success")
      setShowAddEntryForm(false)
      setShowSettleEntryForm(false)
      setForm((prev) => ({ ...prev, amount: "", notes: "" }))
      await Promise.all([fetchSummaries(form.counterparty_name), fetchEntries(form.counterparty_name)])
    } catch (err: unknown) {
      showAlert(tr("Ralat", "Error"), err instanceof Error ? err.message : "Failed", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteEntry(entry: DebtEvent) {
    showConfirm(
      tr("Padam Rekod?", "Delete Record?"),
      tr("Adakah anda pasti mahu padam rekod ini?", "Are you sure you want to delete this record?"),
      async () => {
        setDeletingId(entry.id)
        try {
          const token = getAccessToken()
          if (!token) throw new Error("Session expired")
          const res = await fetch(`/api/debts/entries/${entry.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            setEntries((prev) => prev.filter((e) => e.id !== entry.id))
            await fetchSummaries(entry.counterparty_name)
            showAlert(tr("Dipadam", "Deleted"), tr("Rekod dipadam.", "Entry deleted."), "success")
          }
        } finally {
          setDeletingId(null)
        }
      },
    )
  }

  const handleDeleteDebtor = useCallback(
    async (debtorId: number, name: string) => {
      showConfirm(
        tr("Padam?", "Delete?"),
        tr(`Padam "${name}" dan semua rekod?`, `Delete "${name}" and all records?`),
        async () => {
          setDeletingDebtorId(debtorId)
          try {
            const token = getAccessToken()
            if (!token) throw new Error("Session expired")
            const res = await fetch(`/api/debtors/${debtorId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            })
            if (res.ok) {
              showAlert(tr("Dipadam", "Deleted"), tr("Debitur dipadam.", "Debtor deleted."), "success")
              if (activeName === name) setActiveName("")
              await fetchSummaries()
            }
          } finally {
            setDeletingDebtorId(null)
          }
        },
      )
    },
    [showConfirm, showAlert, fetchSummaries, activeName, tr],
  )

  const formatCurrency = (value: number) =>
    `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatCurrencyCompact = (value: number) =>
    `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const eventLabel = (type: DebtEventType) => {
    switch (type) {
      case "lend":
        return tr("Beri Pinjam", "Lend Out")
      case "borrow":
        return tr("Hutang Masuk", "Borrowed")
      case "payment_in":
        return tr("Bayaran Diterima", "Payment In")
      case "payment_out":
        return tr("Bayaran Keluar", "Payment Out")
      case "opening_receivable":
        return tr("Buka Piutang", "Opening Receivable")
      case "opening_payable":
        return tr("Buka Hutang", "Opening Payable")
      default:
        return type
    }
  }

  const walletOptions = useMemo(
    () => [...wallets].sort((a, b) => Number(Boolean(b.is_bot_default)) - Number(Boolean(a.is_bot_default))),
    [wallets],
  )
  const walletDisplayName = (wallet: WalletOption) => wallet.label || wallet.name || `Wallet #${wallet.id}`

  const netPosition = totals.receivable - totals.payable
  const netPositive = netPosition >= 0

  const openAddFor = useCallback(
    (name: string, balance: number, debtorId?: number | null) => {
      setForm((prev) => ({
        ...prev,
        debtor_id: String(debtorId || ""),
        counterparty_name: name,
        wallet_id: prev.wallet_id || String(walletOptions[0]?.id || ""),
        event_type: balance >= 0 ? "lend" : "borrow",
        amount: "",
        notes: "",
        txn_date: todayKey(),
      }))
      setShowAddEntryForm(true)
    },
    [walletOptions],
  )

  const openSettleFor = useCallback(
    (name: string, balance: number, debtorId?: number | null) => {
      setForm((prev) => ({
        ...prev,
        debtor_id: String(debtorId || ""),
        counterparty_name: name,
        wallet_id: prev.wallet_id || String(walletOptions[0]?.id || ""),
        event_type: balance >= 0 ? "payment_in" : "payment_out",
        amount: "",
        notes: "",
        txn_date: todayKey(),
      }))
      setShowSettleEntryForm(true)
    },
    [walletOptions],
  )

  const filterToggle = (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/40 p-0.5">
      {(
        [
          { key: "all" as const, label: tr("Semua", "All"), count: summaries.length },
          { key: "lent" as const, label: tr("Diberi", "Lent"), count: totals.receivableCount },
          { key: "borrowed" as const, label: tr("Hutang", "Borrowed"), count: totals.payableCount },
        ] as const
      ).map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setActiveTab(chip.key)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.12em] transition",
            activeTab === chip.key ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
          )}
        >
          {chip.label}
          <span className="ml-1 opacity-70">({chip.count})</span>
        </button>
      ))}
    </div>
  )

  const renderPersonCard = (row: DebtSummary, options?: { compact?: boolean; selected?: boolean }) => {
    const compact = options?.compact ?? false
    const selected = options?.selected ?? false
    const isReceivable = row.balance > 0
    const isPayable = row.balance < 0
    const isSettled = row.balance === 0
    const initial = (row.counterparty_name?.[0] || "?").toUpperCase()

    const avatarClass = isSettled
      ? "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
      : isReceivable
        ? "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10 text-emerald-500"
        : "border-orange-500/20 bg-orange-500/10 text-orange-500"

    return (
      <div
        key={row.counterparty_key}
        className={cn(
          "group w-full overflow-hidden rounded-[1.35rem] border bg-[var(--card)] text-left transition",
          selected ? "border-[var(--text)] bg-[var(--surface-tint)]/40" : "border-[var(--border)]",
          !compact && "active:scale-[0.985]",
          compact && !selected && "hover:border-[color-mix(in_srgb,var(--accent2)_30%,var(--border))]",
        )}
      >
        <button
          type="button"
          onClick={() => openDebtDetail(row.counterparty_name)}
          className={cn("w-full text-left", compact ? "p-4" : "p-3.5")}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-2xl border text-sm font-black",
                compact ? "h-12 w-12 text-base" : "h-11 w-11",
                avatarClass,
              )}
            >
              {initial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("truncate font-black leading-tight text-[var(--text)]", compact ? "text-base" : "text-sm")}>
                    {row.counterparty_name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">
                    {row.event_count} {tr("rekod", "txns")}
                    {row.last_activity_at ? ` · ${formatDateLabel(row.last_activity_at)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]",
                      isSettled
                        ? "bg-[var(--surface-tint)] text-[var(--muted)]"
                        : isReceivable
                          ? "bg-[var(--btn-primary-bg)]/15 text-emerald-500"
                          : "bg-orange-500/15 text-orange-500",
                    )}
                  >
                    {isSettled
                      ? tr("Selesai", "Settled")
                      : isReceivable
                        ? tr("Piutang", "Receivable")
                        : tr("Hutang", "Payable")}
                  </span>
                  {!compact && !isSettled && <ChevronRight size={15} className="text-[var(--muted)]" />}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {!isSettled && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                      isReceivable ? "bg-[var(--btn-primary-bg)]/10 text-emerald-500" : "bg-orange-500/10 text-orange-500",
                    )}
                  >
                    {isReceivable ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    <MoneyAmount
                      value={Math.abs(row.balance)}
                      size="xs"
                      className={isReceivable ? "text-emerald-500" : "text-orange-500"}
                      currencyClassName={isReceivable ? "text-emerald-500 opacity-55" : "text-orange-500 opacity-55"}
                    />
                  </span>
                )}
                {isSettled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                    <BadgeCheck size={10} />
                    RM 0.00
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                  <History size={10} />
                  {row.event_count} {tr("rekod", "records")}
                </span>
              </div>
            </div>
          </div>
        </button>

        {isSettled && row.debtor_id ? (
          <div className="flex items-center justify-end gap-1 border-t border-[var(--border)] px-2 py-1.5">
            <button
              type="button"
              disabled={deletingDebtorId === row.debtor_id}
              onClick={() => row.debtor_id && handleDeleteDebtor(row.debtor_id, row.counterparty_name)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-rose-500/70 transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 disabled:opacity-50"
              aria-label={tr("Padam", "Delete")}
            >
              {deletingDebtorId === row.debtor_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const heroBlock = (desktop = false) => (
    <div
      className={cn(
        "debt-hero relative overflow-hidden border border-[var(--border)] bg-[#1a1a1a] text-[#f5f5f5]",
        desktop ? "rounded-2xl p-6" : "rounded-2xl p-5",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

      <div className={cn("relative", desktop && "flex items-center gap-5")}>
        <div className={cn(desktop && "min-w-[10rem] shrink-0")}>
          <p className={cn(
            "font-bold uppercase tracking-[0.14em] text-[#a3a3a3]",
            desktop ? "text-[0.7rem]" : "text-[0.625rem]",
          )}>
            {tr("Baki Bersih", "Net Balance")}
          </p>
          <p className="debt-hero-amount mt-2 leading-none text-[#ffffff]">
            {showDataSkeleton ? (
              <AmountSkeleton className={cn("bg-white/10", desktop ? "h-10 w-40" : "h-7 w-32")} />
            ) : (
              <MoneyAmount
                value={Math.abs(netPosition)}
                size={desktop ? "heroLg" : Math.abs(netPosition) >= 100000 ? "md" : "hero"}
                className="text-[#ffffff]"
                currencyClassName="text-[#ffffff] opacity-55"
              />
            )}
          </p>
        </div>

        <div className={cn(
          "grid grid-cols-3",
          desktop ? "min-w-0 flex-1 gap-3" : "mt-5 gap-2.5",
        )}>
          {[
            {
              label: tr("Diberi", "Lent"),
              value: totals.receivable,
              icon: <TrendingUp size={desktop ? 16 : 12} className="text-[#b3b3b3]" />,
              color: "text-[#e5e5e5]",
              isMoney: true,
            },
            {
              label: tr("Hutang", "Borrowed"),
              value: totals.payable,
              icon: <TrendingDown size={desktop ? 16 : 12} className="text-[#fdba74]" />,
              color: "text-[#fed7aa]",
              isMoney: true,
            },
            {
              label: tr("Semua", "All"),
              value: summaries.length,
              icon: <Users size={desktop ? 16 : 12} className="text-[#b3b3b3]" />,
              color: "text-[#e5e5e5]",
              isMoney: false,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "bg-white/[0.06]",
                desktop ? "rounded-2xl p-4" : "rounded-[1.15rem] p-3",
              )}
            >
              <div className={cn("flex items-center", desktop ? "gap-2" : "gap-1.5")}>
                {item.icon}
                <p className={cn(
                  "font-bold uppercase tracking-[0.1em] text-[#a3a3a3]",
                  desktop ? "text-[0.6rem] tracking-[0.12em]" : "text-[0.5rem]",
                )}>
                  {item.label}
                </p>
              </div>
              <p className={cn(desktop ? "mt-3 leading-none" : "mt-2", item.color)}>
                {showDataSkeleton ? (
                  <AmountSkeleton className={cn("bg-white/10", desktop ? "h-6 w-16" : "h-4 w-12")} />
                ) : item.isMoney ? (
                  <MoneyAmount
                    value={Number(item.value || 0)}
                    digits={0}
                    size={desktop ? "md" : "xs"}
                    className={item.color}
                    currencyClassName={cn(item.color, "opacity-55")}
                  />
                ) : (
                  <span className={cn(
                    "font-semibold tabular-nums tracking-tight",
                    desktop ? "text-xl" : "text-sm",
                  )}>
                    {item.value}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const detailHero = activeName ? (
    <div className="debt-hero relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[#1a1a1a] p-5 text-[#f5f5f5] md:p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

      <div className="relative">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-xl font-black",
              (activeSummary?.balance || 0) >= 0
                ? "border-emerald-400/20 bg-[var(--btn-primary-bg)]/15 text-[#e5e5e5]"
                : "border-orange-400/20 bg-orange-500/15 text-[#fed7aa]",
            )}
          >
            {activeName[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-black text-[#ffffff] md:text-xl">{activeName}</h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]",
                  (activeSummary?.balance || 0) >= 0 ? "bg-[var(--btn-primary-bg)]/20 text-[#e5e5e5]" : "bg-orange-500/20 text-[#fed7aa]",
                )}
              >
                {(activeSummary?.balance || 0) >= 0 ? tr("Piutang", "Receivable") : tr("Hutang", "Payable")}
              </span>
            </div>
            <p className="debt-hero-amount mt-2 leading-none text-[#ffffff]">
              {showDataSkeleton ? (
                <AmountSkeleton className="h-7 w-28 bg-white/10" />
              ) : (
                <MoneyAmount
                  value={Math.abs(activeSummary?.balance || 0)}
                  size="hero"
                  className="text-[#ffffff] md:text-3xl"
                  currencyClassName="text-[#ffffff] opacity-55"
                />
              )}
            </p>
            <p className="mt-1.5 text-[0.625rem] font-semibold text-[#8c8c8c]">
              {(activeSummary?.balance || 0) >= 0
                ? tr("Belum bayar anda", "Owes you")
                : tr("Anda belum bayar", "You owe")}
              {activeSummary?.event_count ? ` · ${activeSummary.event_count} ${tr("rekod", "records")}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => openSettleFor(activeName, activeSummary?.balance || 0, activeSummary?.debtor_id)}
            className="debt-hero-btn flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--btn-primary-bg)] text-[0.65rem] font-black uppercase tracking-wider text-[#ffffff] transition active:scale-[0.98]"
          >
            <BadgeCheck size={14} className="text-[#ffffff]" />
            {(activeSummary?.balance || 0) >= 0 ? tr("Terima", "Receive") : tr("Bayar Balik", "Pay Back")}
          </button>
          <button
            type="button"
            onClick={() => openAddFor(activeName, activeSummary?.balance || 0, activeSummary?.debtor_id)}
            className="debt-hero-btn flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[rgba(255,255,255,0.22)] bg-[rgba(255,255,255,0.14)] text-[0.65rem] font-black uppercase tracking-wider text-[#ffffff] transition active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2.5} className="text-[#ffffff]" />
            {(activeSummary?.balance || 0) >= 0 ? tr("Beri Lagi", "Lend More") : tr("Hutang Lagi", "Borrow More")}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const historyList = (
    <div className="space-y-2">
      {showDetailSkeleton ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
            <AmountSkeleton className="h-4 w-28" />
            <AmountSkeleton className="mt-2 h-3 w-40" />
          </div>
        ))
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-10 text-center">
          <History size={28} className="mx-auto text-[var(--muted)]/40" />
          <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Belum ada sejarah.", "No history yet.")}</p>
        </div>
      ) : (
        entries.map((e) => {
          const isIn = EVENT_OPTIONS.find((o) => o.value === e.event_type)?.tone === "in"
          return (
            <div
              key={e.id}
              className="group flex items-center justify-between rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-3.5 transition hover:bg-[var(--surface-tint)]/30"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                    isIn ? "bg-[var(--btn-primary-bg)]/15 text-emerald-500" : "bg-orange-500/15 text-orange-500",
                  )}
                >
                  {isIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-black text-[var(--text)]">{eventLabel(e.event_type)}</p>
                  <p className="mt-0.5 truncate text-[0.58rem] font-semibold text-[var(--muted)]">
                    {e.txn_date}
                    {e.wallet_name ? ` · ${e.wallet_name}` : ""}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className={cn(isIn ? "text-emerald-500" : "text-orange-500")}>
                  <MoneyAmount
                    value={Number(e.amount || 0)}
                    digits={0}
                    size="sm"
                    prefix={isIn ? "+" : "-"}
                    className={isIn ? "text-emerald-500" : "text-orange-500"}
                    currencyClassName={isIn ? "text-emerald-500 opacity-55" : "text-orange-500 opacity-55"}
                  />
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteEntry(e)}
                  disabled={deletingId === e.id}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-rose-500/40 transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-90 disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100"
                  aria-label={tr("Padam rekod", "Delete entry")}
                >
                  {deletingId === e.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={activeName || tr("Hutang", "Debt")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton
              label={tr("Tambah Rekod", "Add Record")}
              onClick={() => {
                if (activeName) {
                  openAddFor(activeName, activeSummary?.balance || 0, activeSummary?.debtor_id)
                } else {
                  setForm((prev) => ({
                    ...prev,
                    debtor_id: "",
                    counterparty_name: "",
                    event_type: "lend",
                    amount: "",
                    notes: "",
                    txn_date: todayKey(),
                    wallet_id: prev.wallet_id || String(walletOptions[0]?.id || ""),
                  }))
                  setShowAddEntryForm(true)
                }
              }}
            >
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        {activeName ? (
          <div className="space-y-4 px-1">
            <button
              type="button"
              onClick={closeDebtDetail}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--muted)]"
            >
              <ArrowLeft size={14} /> {tr("Kembali ke Senarai", "Back to List")}
            </button>
            {detailHero}
            <div>
              <p className="mb-3 px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
                {tr("Sejarah", "History")}
              </p>
              {historyList}
            </div>
          </div>
        ) : (
          <>
            <section className="px-1">{heroBlock(false)}</section>

            <div className="flex items-center justify-between gap-2 px-1">
              {filterToggle}
            </div>

            <div className="px-1">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr("Cari nama...", "Search name...")}
                  className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50"
                />
              </div>
            </div>

            <section className="px-1">
              <div className="space-y-3">
                {showDataSkeleton ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
                      <AmountSkeleton className="h-4 w-32" />
                      <AmountSkeleton className="mt-3 h-5 w-24" />
                    </div>
                  ))
                ) : activeList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 p-8 text-center">
                    <HandCoins size={32} className="mx-auto text-[var(--muted)]/40" />
                    <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Tiada senarai hutang.", "No debt list.")}</p>
                    <p className="mt-1 text-[11px] font-medium text-[var(--muted)]/80">
                      {tr("Rekod pinjaman & hutang di sini.", "Track lending & borrowing here.")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddEntryForm(true)}
                      className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-95"
                    >
                      <Plus size={14} className="mr-1 inline" />
                      {tr("Tambah Rekod", "Add Record")}
                    </button>
                  </div>
                ) : (
                  activeList.map((row) => renderPersonCard(row, { compact: false }))
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Papan Hutang", "Debt Board")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  debtor_id: "",
                  counterparty_name: "",
                  event_type: "lend",
                  amount: "",
                  notes: "",
                  txn_date: todayKey(),
                  wallet_id: prev.wallet_id || String(walletOptions[0]?.id || ""),
                }))
                setShowAddEntryForm(true)
              }}
            >
              <Plus strokeWidth={2.5} />
              {tr("Tambah Rekod", "Add Record")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="space-y-5">
        {heroBlock(true)}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {filterToggle}
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Cari nama...", "Search name...")}
              className="h-10 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-4">
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {showDataSkeleton ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)]" />
                ))
              ) : activeList.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/70 px-4 text-center">
                  <HandCoins size={28} className="text-[var(--muted)]/40" />
                  <p className="mt-2 text-sm font-bold text-[var(--muted)]">{tr("Tiada senarai.", "No list.")}</p>
                </div>
              ) : (
                activeList.map((row) =>
                  renderPersonCard(row, {
                    compact: true,
                    selected: activeName === row.counterparty_name,
                  }),
                )
              )}
            </div>
          </div>

          <div className="col-span-8">
            {activeName ? (
              <div className="space-y-4">
                {detailHero}
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <History size={16} className="text-[var(--muted)]" />
                    <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                      {tr("Sejarah", "History")}
                    </p>
                  </div>
                  {historyList}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/70 px-6 text-center">
                <HandCoins size={40} className="text-[var(--muted)]/30" />
                <p className="mt-4 text-sm font-bold text-[var(--muted)]">
                  {tr("Pilih nama di sebelah kiri untuk lihat detail.", "Select a name on the left to view details.")}
                </p>
              </div>
            )}
          </div>
        </div>
        </DesktopPageBody>
      </div>

      {/* ─── Add Entry Modal ─── */}
      {mounted && showAddEntryForm
        ? createPortal(
 <div className="fixed inset-0 z-50 flex touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center">
              <div className="absolute inset-0" onClick={() => setShowAddEntryForm(false)} onTouchMove={(event) => event.preventDefault()} />
              <div
                style={{ transform: "translateZ(0)" }}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                {...addEntrySheetSwipe}
                className="app-sheet-panel app-sheet-panel--lg relative max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh] md:max-w-md"
              >
                <AppSheetHeader
                  title={activeName
                    ? (activeSummary?.balance || 0) >= 0
                      ? tr("Beri Lagi", "Lend More")
                      : tr("Hutang Lagi", "Borrow More")
                    : tr("Tambah Rekod", "Add Record")}
                  onClose={() => setShowAddEntryForm(false)}
                  action={
                    <button
                      type="submit"
                      form="debt-add-form"
                      disabled={saving || !form.counterparty_name || !form.amount}
                      className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : activeName
                          ? (activeSummary?.balance || 0) >= 0
                            ? tr("Sahkan", "Confirm")
                            : tr("Sahkan", "Confirm")
                          : tr("Simpan", "Save")}
                    </button>
                  }
                />

                <form id="debt-add-form" onSubmit={handleCreateEntry} className="space-y-4 px-4 py-4 md:px-6 md:py-6">
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Nama", "Name")}
                    </label>
                    <input
                      value={form.counterparty_name}
                      disabled={!!activeName}
                      onChange={(e) => {
                        const name = e.target.value
                        const summary = summaries.find((s) => s.counterparty_name.toLowerCase() === name.trim().toLowerCase())
                        const debtor = debtors.find((d) => d.name.toLowerCase() === name.trim().toLowerCase())
                        const balance = Number(summary?.balance || 0)
                        setForm((prev) => ({
                          ...prev,
                          debtor_id: debtor ? String(debtor.id) : "",
                          counterparty_name: name,
                          event_type: name.trim()
                            ? balance > 0
                              ? "lend"
                              : balance < 0
                                ? "borrow"
                                : prev.event_type
                            : prev.event_type,
                        }))
                      }}
                      placeholder={tr("Cari atau tulis nama...", "Search or type name...")}
                      className={cn(
                        "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold outline-none",
                        activeName && "opacity-60",
                      )}
                    />
                  </div>

                  {!activeName && (
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Tindakan", "Action")}
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {EVENT_OPTIONS.filter((o) => o.value === "lend" || o.value === "borrow").map((option) => {
                          const selected = form.event_type === option.value
                          const isBorrow = option.value === "borrow"
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, event_type: option.value as DebtEventType }))}
                              className={cn(
                                "flex h-12 items-center justify-center gap-2 rounded-2xl border text-[0.7rem] font-black uppercase tracking-widest transition",
                                selected && !isBorrow && "border-emerald-500 bg-[var(--btn-primary-bg)] text-white",
                                selected && isBorrow && "border-orange-500 bg-orange-500 text-white",
                                !selected && "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]",
                              )}
                            >
                              {eventLabel(option.value)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Jumlah", "Amount")}
                      </label>
                      <div className="flex h-12 items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4">
                        <span className="mr-2 text-sm font-black text-[var(--muted)]">RM</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={form.amount}
                          onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                          className="h-full w-full bg-transparent text-base font-black outline-none tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Tarikh", "Date")}
                      </label>
                      <input
                        type="date"
                        value={form.txn_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, txn_date: e.target.value }))}
                        className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Wallet", "Wallet")}
                    </label>
                    <select
                      value={form.wallet_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, wallet_id: e.target.value }))}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold outline-none"
                    >
                      <option value="">{tr("Wallet default", "Default wallet")}</option>
                      {walletOptions.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {walletDisplayName(wallet)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Nota", "Note")}
                    </label>
                    <input
                      value={form.notes}
                      onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder={tr("Untuk apa?", "What is this for?")}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold outline-none"
                    />
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ─── Settle Entry Modal ─── */}
      {mounted && showSettleEntryForm
        ? createPortal(
 <div className="fixed inset-0 z-50 flex touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center">
              <div className="absolute inset-0" onClick={() => setShowSettleEntryForm(false)} onTouchMove={(event) => event.preventDefault()} />
              <div
                style={{ transform: "translateZ(0)" }}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                {...settleEntrySheetSwipe}
                className="app-sheet-panel app-sheet-panel--lg relative max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh] md:max-w-md"
              >
                <AppSheetHeader
                  title={form.event_type === "payment_in" ? tr("Terima Bayaran", "Receive Payment") : tr("Bayar Balik", "Pay Back")}
                  onClose={() => setShowSettleEntryForm(false)}
                  action={
                    <button
                      type="submit"
                      form="debt-settle-form"
                      disabled={saving || !form.amount}
                      className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {saving ? (isBm ? "Menyimpan…" : "Saving…") : tr("Sahkan", "Confirm")}
                    </button>
                  }
                />

                <form id="debt-settle-form" onSubmit={handleCreateEntry} className="space-y-4 px-4 py-4 md:px-6 md:py-6">
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-[var(--btn-primary-bg)]/5 p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--btn-primary-bg)]/10 text-lg font-black text-emerald-500">
                      {(form.counterparty_name[0] || "?").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">{tr("Nama", "Name")}</p>
                      <p className="text-lg font-black text-[var(--text)]">{form.counterparty_name}</p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Jumlah", "Amount")}
                    </label>
                    <div className="flex h-14 items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4">
                      <span className="mr-2 text-lg font-black text-emerald-500">RM</span>
                      <input
                        type="number"
                        step="0.01"
                        autoFocus
                        placeholder="0.00"
                        value={form.amount}
                        onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                        className="h-full w-full bg-transparent text-2xl font-black outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Tarikh", "Date")}
                    </label>
                    <input
                      type="date"
                      value={form.txn_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, txn_date: e.target.value }))}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Wallet", "Wallet")}
                    </label>
                    <select
                      value={form.wallet_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, wallet_id: e.target.value }))}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold outline-none"
                    >
                      <option value="">{tr("Wallet default", "Default wallet")}</option>
                      {walletOptions.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {walletDisplayName(wallet)}
                        </option>
                      ))}
                    </select>
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
