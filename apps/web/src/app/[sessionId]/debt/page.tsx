"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, BadgeCheck, Check, HandCoins, History, Loader2, Plus, Search, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { getAccessToken } from "@/lib/auth-session"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type DebtSummary = {
  debtor_id?: number | null
  counterparty_name: string
  counterparty_key: string
  balance: number
  event_count: number
  last_activity_at?: string | null
}

type DebtEventType = "lend" | "borrow" | "payment_in" | "payment_out" | "opening_receivable" | "opening_payable"

type DebtEvent = {
  id: number
  wallet_name?: string | null
  counterparty_name: string
  event_type: DebtEventType
  amount: number
  txn_date: string
  notes?: string | null
}

type WalletOption = { id: number; name?: string | null; label?: string | null; is_bot_default?: boolean | null }
type Mode = "add" | "settle"

const INCOMING: DebtEventType[] = ["borrow", "payment_in", "opening_payable"]

const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function todayKey() {
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  return `${kl.getFullYear()}-${String(kl.getMonth() + 1).padStart(2, "0")}-${String(kl.getDate()).padStart(2, "0")}`
}

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null
  return typeof payload?.detail === "string" && payload.detail.trim() ? payload.detail : fallback
}

function fmtDate(value: string | null | undefined, locale: string) {
  if (!value) return ""
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

export default function DebtPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [summaries, setSummaries] = useState<DebtSummary[]>([])
  const [entries, setEntries] = useState<DebtEvent[]>([])
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [tab, setTab] = useState<"all" | "lent" | "borrowed">("all")
  const [activeName, setActiveName] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [sheet, setSheet] = useState<Mode | null>(null)
  const showSkeleton = useDelayedSkeleton(loading)
  const [form, setForm] = useState({ counterparty_name: "", event_type: "lend" as DebtEventType, amount: "", wallet_id: "", txn_date: todayKey(), notes: "" })

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])

  const fetchSummaries = useCallback(async () => {
    try {
      const res = await fetch("/api/debts?include_settled=true", { headers: headers(), cache: "no-store" })
      if (!res.ok) throw new Error()
      setSummaries(await res.json())
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [headers])

  const fetchEntries = useCallback(
    async (name: string) => {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/debts/${encodeURIComponent(name)}/entries?limit=200`, { headers: headers(), cache: "no-store" })
        if (res.ok) setEntries(await res.json())
      } finally {
        setDetailLoading(false)
      }
    },
    [headers]
  )

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      fetchSummaries(),
      fetch("/api/wallets", { headers: headers(), cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((w) => setWallets(Array.isArray(w) ? w : []))
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [fetchSummaries, headers])

  useEffect(() => {
    if (activeName) void fetchEntries(activeName)
    else setEntries([])
  }, [activeName, fetchEntries])

  // On phones the detail replaces the list, so the browser Back button returns to it.
  const openDetail = useCallback((name: string) => {
    setActiveName(name)
    if (window.matchMedia("(max-width: 1023px)").matches) window.history.pushState({ portalDebtDetail: true }, "", window.location.href)
  }, [])
  useEffect(() => {
    const onPop = () => {
      if (window.matchMedia("(max-width: 1023px)").matches && activeName) setActiveName("")
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [activeName])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: sheet !== null } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [sheet])

  const totals = useMemo(() => {
    let receivable = 0
    let payable = 0
    let receivableCount = 0
    let payableCount = 0
    for (const row of summaries) {
      const b = Number(row.balance || 0)
      if (b > 0.004) {
        receivable += b
        receivableCount++
      } else if (b < -0.004) {
        payable += -b
        payableCount++
      }
    }
    return { receivable, payable, receivableCount, payableCount }
  }, [summaries])

  const lists = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const base = needle ? summaries.filter((s) => s.counterparty_name.toLowerCase().includes(needle)) : summaries
    const lent = base.filter((s) => s.balance > 0.004).sort((a, b) => b.balance - a.balance)
    const borrowed = base.filter((s) => s.balance < -0.004).sort((a, b) => a.balance - b.balance)
    const settled = base.filter((s) => Math.abs(s.balance) <= 0.004)
    return { all: [...lent, ...borrowed, ...settled], lent, borrowed }
  }, [summaries, query])
  const activeList = lists[tab]
  const active = summaries.find((s) => s.counterparty_name === activeName) || null
  const activeBalance = Number(active?.balance || 0)
  const activeSettled = Math.abs(activeBalance) <= 0.004
  const walletOptions = useMemo(() => [...wallets].sort((a, b) => Number(Boolean(b.is_bot_default)) - Number(Boolean(a.is_bot_default))), [wallets])
  const net = totals.receivable - totals.payable

  const openAdd = (name = "", balance = 0) => {
    setForm({ counterparty_name: name, event_type: balance < -0.004 ? "borrow" : "lend", amount: "", wallet_id: "", txn_date: todayKey(), notes: "" })
    setSheet("add")
  }
  const openSettle = (name: string, balance: number) => {
    setForm({ counterparty_name: name, event_type: balance >= 0 ? "payment_in" : "payment_out", amount: Math.abs(balance).toFixed(2), wallet_id: "", txn_date: todayKey(), notes: "" })
    setSheet("settle")
  }

  const amountNum = Number(form.amount)
  const problem = !form.counterparty_name.trim()
    ? tr("Nama diperlukan.", "A name is required.")
    : !(amountNum > 0)
      ? tr("Masukkan jumlah yang sah.", "Enter a valid amount.")
      : sheet === "settle" && amountNum > Math.abs(activeBalance) + 0.004
        ? tr(`Jumlah melebihi baki RM ${money(Math.abs(activeBalance))}.`, `Amount is more than the outstanding RM ${money(Math.abs(activeBalance))}.`)
        : null

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const name = form.counterparty_name.trim()
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          counterparty_name: name,
          event_type: form.event_type,
          amount: amountNum,
          wallet_id: form.wallet_id ? Number(form.wallet_id) : null,
          txn_date: form.txn_date,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await readError(res, tr("Gagal simpan.", "Could not save.")))
      setSheet(null)
      await fetchSummaries()
      if (activeName) await fetchEntries(activeName)
      else openDetail(name)
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = (entry: DebtEvent) => {
    showConfirm(
      tr("Padam rekod?", "Delete record?"),
      tr("Rekod ini dan transaksi dompetnya akan dipadam.", "This record and its wallet transaction will be deleted."),
      async () => {
        setDeletingId(entry.id)
        try {
          const res = await fetch(`/api/debts/entries/${entry.id}`, { method: "DELETE", headers: headers() })
          if (!res.ok) throw new Error(await readError(res, tr("Gagal padam.", "Could not delete.")))
          await fetchSummaries()
          await fetchEntries(entry.counterparty_name)
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
        } finally {
          setDeletingId(null)
        }
      },
      "warning"
    )
  }

  const deletePerson = (row: DebtSummary) => {
    if (!row.debtor_id) return
    showConfirm(tr("Padam nama?", "Delete name?"), tr("Nama ini tiada rekod dan akan dipadam.", "This name has no records and will be deleted."), async () => {
      try {
        const res = await fetch(`/api/debtors/${row.debtor_id}`, { method: "DELETE", headers: headers() })
        if (!res.ok) throw new Error(await readError(res, tr("Gagal padam.", "Could not delete.")))
        if (activeName === row.counterparty_name) setActiveName("")
        await fetchSummaries()
      } catch (err) {
        showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
      }
    }, "warning")
  }

  const eventLabel = (type: DebtEventType) =>
    ({
      lend: tr("Beri pinjam", "Lent out"),
      borrow: tr("Pinjam masuk", "Borrowed"),
      payment_in: tr("Bayaran diterima", "Payment received"),
      payment_out: tr("Bayaran dibuat", "Payment made"),
      opening_receivable: tr("Baki awal piutang", "Opening receivable"),
      opening_payable: tr("Baki awal hutang", "Opening payable"),
    })[type] || type

  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"
  const detailMode = !!activeName

  const renderPerson = (row: DebtSummary) => {
    const settled = Math.abs(row.balance) <= 0.004
    const receivable = row.balance > 0
    const selected = activeName === row.counterparty_name
    return (
      <li key={row.counterparty_key} className={cn("flex items-center gap-2 rounded-[1.5rem] border bg-[var(--card)] pr-2 transition", selected ? "border-[var(--btn-primary-bg)]" : "border-[var(--border)]")}>
        <button type="button" onClick={() => openDetail(row.counterparty_name)} className="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold", settled ? "bg-[var(--surface-tint-strong)] text-[var(--muted)]" : receivable ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-orange-500/15 text-orange-600 dark:text-orange-400")}>
            {(row.counterparty_name[0] || "?").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[var(--text)]">{row.counterparty_name}</span>
            <span className="block truncate text-xs text-[var(--muted)]">
              {settled ? tr("Selesai", "Settled") : receivable ? tr("Berhutang dengan anda", "Owes you") : tr("Anda berhutang", "You owe")}
              {row.event_count ? ` · ${row.event_count} ${tr("rekod", "records")}` : ""}
            </span>
          </span>
          <span className={cn("shrink-0 text-sm font-bold tabular-nums", settled ? "text-[var(--muted)]" : receivable ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400")}>
            RM {money(Math.abs(row.balance))}
          </span>
        </button>
        {row.event_count === 0 && row.debtor_id ? (
          <button type="button" onClick={() => deletePerson(row)} aria-label={tr("Padam", "Delete")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rose-500">
            <Trash2 size={14} />
          </button>
        ) : null}
      </li>
    )
  }

  const tabs: Array<["all" | "lent" | "borrowed", string, number]> = [
    ["all", tr("Semua", "All"), summaries.length],
    ["lent", tr("Diberi", "Lent"), totals.receivableCount],
    ["borrowed", tr("Hutang", "Borrowed"), totals.payableCount],
  ]

  const listBlock = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible">
          {tabs.map(([key, text, count]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", tab === key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
              {text}
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", tab === key ? "bg-white/20" : "bg-[var(--surface-tint-strong)]")}>{count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Cari nama…", "Search a name…")} className={cn(field, "pl-10")} />
      </div>
      {showSkeleton ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
          ))}
        </div>
      ) : loadFailed && summaries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-sm font-bold text-[var(--text)]">{tr("Senarai tidak dapat dimuatkan", "The list could not be loaded")}</p>
          <button type="button" onClick={() => { setLoading(true); void fetchSummaries().finally(() => setLoading(false)) }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
            {tr("Cuba lagi", "Try again")}
          </button>
        </div>
      ) : activeList.length === 0 ? (
        <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
            <HandCoins size={22} />
          </span>
          <p className="mt-3 text-sm font-bold text-[var(--text)]">{summaries.length ? tr("Tiada padanan", "No matches") : tr("Belum ada rekod hutang", "No debt records yet")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{tr("Jejak wang yang anda pinjamkan atau pinjam.", "Track money you lend or borrow.")}</p>
          {!summaries.length && (
            <button type="button" onClick={() => openAdd()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
              <Plus size={15} />
              {tr("Tambah rekod", "Add record")}
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">{activeList.map(renderPerson)}</ul>
      )}
    </div>
  )

  const detailBlock = detailMode ? (
    <div className="space-y-4">
      <button type="button" onClick={() => setActiveName("")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] lg:hidden">
        <ArrowLeft size={15} />
        {tr("Kembali ke senarai", "Back to list")}
      </button>
      <ModenHero
        pageActions={false}
        label={
          <>
            {activeSettled ? <BadgeCheck size={16} /> : activeBalance > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {activeName} · {activeSettled ? tr("Selesai", "Settled") : activeBalance > 0 ? tr("Berhutang dengan anda", "Owes you") : tr("Anda berhutang", "You owe")}
          </>
        }
        currency="RM"
        amount={money(Math.abs(activeBalance))}
        amountSize="clamp(2rem, 9vw, 2.75rem)"
      >
        <div className="mt-4 flex w-full flex-wrap gap-2">
          {!activeSettled && (
            <button type="button" onClick={() => openSettle(activeName, activeBalance)} className="flex h-11 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)]">
              <BadgeCheck size={15} />
              {activeBalance > 0 ? tr("Terima bayaran", "Receive payment") : tr("Bayar balik", "Pay back")}
            </button>
          )}
          <button type="button" onClick={() => openAdd(activeName, activeBalance)} className="flex h-11 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] text-sm font-semibold text-[var(--text)]">
            <Plus size={15} />
            {activeBalance < -0.004 ? tr("Hutang lagi", "Borrow more") : tr("Beri lagi", "Lend more")}
          </button>
        </div>
      </ModenHero>

      <div>
        <h2 className="mb-3 flex items-center gap-2 px-1 text-base font-bold text-[var(--text)]">
          <History size={16} className="text-[var(--muted)]" />
          {tr("Sejarah", "History")}
        </h2>
        <div className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]">
          {detailLoading && entries.length === 0 ? (
            <div className="space-y-px">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse bg-[var(--surface-tint)]" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">{tr("Belum ada sejarah.", "No history yet.")}</p>
          ) : (
            <ul className="divide-y divide-[var(--divider)]">
              {entries.map((e) => {
                const incoming = INCOMING.includes(e.event_type)
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", incoming ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-orange-500/15 text-orange-600 dark:text-orange-400")}>
                      {incoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--text)]">{eventLabel(e.event_type)}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {fmtDate(e.txn_date, locale)}
                        {e.wallet_name ? ` · ${e.wallet_name}` : ""}
                        {e.notes && !e.notes.startsWith("Debt ") ? ` · ${e.notes}` : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-sm font-bold tabular-nums", incoming ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400")}>
                      {incoming ? "+" : "−"}RM {money(e.amount)}
                    </span>
                    <button type="button" onClick={() => deleteEntry(e)} disabled={deletingId === e.id} aria-label={tr("Padam rekod", "Delete record")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rose-500/70 transition hover:text-rose-500 disabled:opacity-50">
                      {deletingId === e.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  ) : null

  const summaryHero = (
    <ModenHero
      label={
        <>
          <HandCoins size={16} />
          {net >= 0 ? tr("Baki bersih (anda terima)", "Net balance (owed to you)") : tr("Baki bersih (anda hutang)", "Net balance (you owe)")}
        </>
      }
      currency="RM"
      amount={showSkeleton ? "—" : money(Math.abs(net))}
      amountSize="clamp(2rem, 9vw, 2.75rem)"
      stats={[
        { key: "lent", tone: "in", icon: <TrendingUp size={15} strokeWidth={2.2} />, label: tr("Diberi", "Lent"), value: `RM ${money(totals.receivable)}` },
        { key: "borrowed", tone: "out", icon: <TrendingDown size={15} strokeWidth={2.2} />, label: tr("Hutang", "Borrowed"), value: `RM ${money(totals.payable)}` },
      ]}
    />
  )

  const addDisabled = false
  const headerAddMobile = !detailMode ? (
    <MobileIconButton label={tr("Tambah rekod", "Add record")} onClick={() => openAdd()}>
      <Plus strokeWidth={2.5} />
    </MobileIconButton>
  ) : undefined

  const settleMode = sheet === "settle"
  const sheetTitle = settleMode
    ? form.event_type === "payment_in" ? tr("Terima bayaran", "Receive payment") : tr("Bayar balik", "Pay back")
    : activeName ? (activeBalance < -0.004 ? tr("Hutang lagi", "Borrow more") : tr("Beri lagi", "Lend more")) : tr("Tambah rekod", "Add record")

  return (
    <div className="pb-20 md:pb-0">
      <div className="md:hidden">
        <MobilePageHeader title={activeName || tr("Hutang", "Debt")} fallbackHref={`/${sessionId}`} action={headerAddMobile} />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Papan hutang", "Debt board")}
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={() => openAdd()} disabled={addDisabled}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah rekod", "Add record")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        {/* Phones show the list or one person; desktop shows both side by side. */}
        <div className={cn(detailMode && "hidden lg:block")}>{summaryHero}</div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div className={cn("min-w-0", detailMode && "hidden lg:block")}>{listBlock}</div>
          <div className="min-w-0">
            {detailBlock ?? (
              <div className="hidden min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 text-center lg:flex">
                <HandCoins size={32} className="text-[var(--muted)]" />
                <p className="mt-3 text-sm font-semibold text-[var(--muted)]">{tr("Pilih nama untuk lihat butiran.", "Select a name to see the details.")}</p>
              </div>
            )}
          </div>
        </div>
      </DesktopPageBody>

      <AppSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        id="debt-entry-sheet"
        title={sheetTitle}
        size="md"
        footer={
          <button type="button" onClick={() => void submit()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Simpan", "Save")}
          </button>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="debt-name" className={label}>{tr("Nama", "Name")}</label>
            <input
              id="debt-name"
              list="debt-names"
              value={form.counterparty_name}
              disabled={!!activeName}
              maxLength={80}
              onChange={(e) => {
                const name = e.target.value
                const match = summaries.find((s) => s.counterparty_name.toLowerCase() === name.trim().toLowerCase())
                setForm((prev) => ({ ...prev, counterparty_name: name, event_type: match && match.balance < -0.004 ? "borrow" : match && match.balance > 0.004 ? "lend" : prev.event_type }))
              }}
              placeholder={tr("Pilih atau taip nama", "Pick or type a name")}
              className={cn(field, activeName && "opacity-60")}
            />
            <datalist id="debt-names">
              {summaries.map((s) => (
                <option key={s.counterparty_key} value={s.counterparty_name} />
              ))}
            </datalist>
          </div>

          {!settleMode && !activeName && (
            <div>
              <span className={label}>{tr("Jenis", "Type")}</span>
              <div className="flex gap-1.5">
                {(["lend", "borrow"] as const).map((type) => (
                  <button key={type} type="button" aria-pressed={form.event_type === type} onClick={() => setForm({ ...form, event_type: type })} className={cn("h-11 flex-1 rounded-full border text-sm font-semibold transition", form.event_type === type ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                    {type === "lend" ? tr("Saya beri pinjam", "I lent") : tr("Saya pinjam", "I borrowed")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="debt-amount" className={label}>{tr("Jumlah (RM)", "Amount (RM)")}</label>
              <input id="debt-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") })} placeholder="0.00" className={field} />
            </div>
            <div>
              <label htmlFor="debt-date" className={label}>{tr("Tarikh", "Date")}</label>
              <input id="debt-date" type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} className={field} />
            </div>
          </div>
          {settleMode && <p className="-mt-2 text-xs text-[var(--muted)]">{tr(`Baki tertunggak RM ${money(Math.abs(activeBalance))}. Boleh bayar sebahagian.`, `Outstanding RM ${money(Math.abs(activeBalance))}. You can settle part of it.`)}</p>}

          <div>
            <label htmlFor="debt-wallet" className={label}>{tr("Dompet", "Wallet")}</label>
            <select id="debt-wallet" value={form.wallet_id} onChange={(e) => setForm({ ...form, wallet_id: e.target.value })} className={field}>
              <option value="">{tr("Dompet lalai", "Default wallet")}</option>
              {walletOptions.map((w) => (
                <option key={w.id} value={w.id}>{w.label || w.name || `#${w.id}`}</option>
              ))}
            </select>
          </div>

          {!settleMode && (
            <div>
              <label htmlFor="debt-notes" className={label}>{tr("Nota (pilihan)", "Note (optional)")}</label>
              <input id="debt-notes" value={form.notes} maxLength={200} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={tr("Untuk apa?", "What is it for?")} className={field} />
            </div>
          )}
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
