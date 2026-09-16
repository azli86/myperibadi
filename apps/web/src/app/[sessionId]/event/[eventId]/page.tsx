"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Calendar,
  Check,
  Loader2,
  Wallet as WalletIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { MoneyAmount, formatCurrencyLabel, formatMoneyValue } from "@/components/ui/MoneyAmount"
import { CategoryIconGlyph } from "@/lib/category-icons"

type EventItem = {
  id: number
  name: string
  icon_name?: string | null
  start_date?: string | null
  end_date?: string | null
  currency: string
  wallet_id?: number | null
  budget?: number | null
  notes?: string | null
  status: string
  has_image: boolean
  image_url?: string | null
  spent?: number
  transaction_count?: number
}

type EventTransaction = {
  id: number
  reference_id?: string | null
  type: string
  txn_date?: string | null
  vendor_or_source: string
  amount: number
  currency: string
  wallet_id?: number | null
  wallet_name?: string | null
  included: boolean
}

const moneyLabel = (value: number, currency?: string | null) =>
  `${formatCurrencyLabel(currency)}${formatMoneyValue(value)}`

function formatDateShort(value?: string | null, locale = "en-MY") {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null
  const end = new Date(`${value}T00:00:00`)
  if (isNaN(end.getTime())) return null
  const today = new Date()
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((end.getTime() - t.getTime()) / 86400000)
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params?.sessionId as string) || ""
  const eventId = Number(params?.eventId)
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showAlert, alertModal } = usePageAlert(lang)

  const [event, setEvent] = useState<EventItem | null>(null)
  const [transactions, setTransactions] = useState<EventTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  // usePageAlert returns a fresh function on every render, so it must never appear
  // in a useCallback/useEffect dependency list: doing so recreated `load` each
  // render, re-ran its effect, and looped until React threw "Maximum update depth".
  const showAlertRef = useRef(showAlert)
  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])


  const load = useCallback(async () => {
    if (!Number.isFinite(eventId)) {
      setNotFound(true)
      setLoading(false)
      return
    }
    try {
      const [evRes, txnRes] = await Promise.all([
        fetch(`/api/events/${eventId}`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/events/${eventId}/transactions`, { headers: authHeaders(), cache: "no-store" }),
      ])
      if (evRes.status === 404) {
        setNotFound(true)
        return
      }
      if (!evRes.ok) throw new Error(tr("Gagal muat acara.", "Failed to load event."))
      setEvent(await evRes.json())
      // A failed transaction list must not blank the page: the event header is
      // still useful, so fall back to an empty list.
      setTransactions(txnRes.ok ? await txnRes.json().catch(() => []) : [])
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal muat acara.", "Failed to load event."),
        "error"
      )
    } finally {
      setLoading(false)
    }
  }, [eventId, authHeaders, tr])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback(
    async (txn: EventTransaction) => {
      setBusyId(txn.id)
      const included = !txn.included
      // Optimistic: the row already exists, so only the tick flips. Keeps the list
      // from flickering or reordering under the finger.
      setTransactions((prev) => prev.map((t) => (t.id === txn.id ? { ...t, included } : t)))
      try {
        const res = await fetch(`/api/events/${eventId}/transactions/${txn.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ included }),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { detail?: string } | null
          throw new Error(payload?.detail || tr("Gagal kemas kini.", "Failed to update."))
        }
        await load()
      } catch (err) {
        setTransactions((prev) => prev.map((t) => (t.id === txn.id ? { ...t, included: txn.included } : t)))
        showAlertRef.current(
          tr("Gagal kemas kini", "Update failed"),
          err instanceof Error ? err.message : tr("Gagal kemas kini transaksi.", "Failed to update transaction."),
          "error"
        )
      } finally {
        setBusyId(null)
      }
    },
    [eventId, authHeaders, load, tr]
  )

  // Recompute locally so the tick and the totals never disagree while a refresh
  // is in flight.
  const stats = useMemo(() => {
    const counted = transactions.filter((t) => t.included && t.type === "expense")
    const spent = counted.reduce((sum, t) => sum + t.amount, 0)
    const income = transactions
      .filter((t) => t.included && t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0)
    const budget = Number(event?.budget || 0)
    const remaining = budget > 0 ? budget - spent : null
    return {
      spent,
      income,
      countedCount: transactions.filter((t) => t.included).length,
      totalCount: transactions.length,
      excludedCount: transactions.filter((t) => !t.included).length,
      remaining,
      ratio: budget > 0 ? Math.max(0, spent / budget) : 0,
    }
  }, [transactions, event])

  const currency = event?.currency || "RM"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
      </div>
    )
  }

  if (notFound || !event) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-20 text-center">
        <AlertCircle size={28} className="text-[var(--muted)]" />
        <p className="text-sm font-bold text-[var(--text)]">
          {tr("Acara tidak dijumpai.", "Event not found.")}
        </p>
        <button
          type="button"
          onClick={() => router.push(`/${sessionId}/event`)}
          className="rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2 text-xs font-black text-white"
        >
          {tr("Kembali", "Go back")}
        </button>
      </div>
    )
  }

  const days = daysUntil(event?.end_date)
    const isEnded = event?.status === "ended" || (days != null && days < 0)
    const isToday = days === 0
    const isSoon = days != null && days > 0 && days <= 7

    const statusLabel = isEnded
      ? tr("Tamat", "Ended")
      : isToday
        ? tr("Hari Ini!", "Today!")
        : isSoon
          ? (isBm ? `Tinggal ${days} hari` : `${days} days left`)
          : tr("Akan Datang", "Upcoming")

    const statusClass = isEnded
      ? "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]"
      : isToday
        ? "bg-cyan-500/15 text-cyan-500 border-cyan-500/30 font-bold"
        : isSoon
          ? "bg-amber-500/15 text-amber-500 border-amber-500/30 font-bold"
          : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-bold"

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader title={event.name} fallbackHref={`/${sessionId}/event`} backPreferHistory />
      </div>
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Butiran Acara", "Event Details")}
          breadcrumbs={[{ label: tr("Acara", "Events"), href: `/${sessionId}/event` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/event`}
          backPreferHistory
        />
      </div>

      <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
        <div className="space-y-4">
          {/* ─── Hero Summary Card (matches TxnSummaryCard) ─── */}
          <div className="relative overflow-hidden rounded-2xl bg-[#1a1a1a] p-6 text-[#f5f5f5] md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
            <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
            <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

            <div className="relative flex flex-col items-center text-center">
              {/* Event Icon or Image */}
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/10 text-[#e5e5e5] shadow-xs">
                {event.has_image && event.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={event.image_url} alt={event.name} className="h-full w-full object-cover" />
                ) : (
                  <CategoryIconGlyph iconName={event.icon_name} categoryName={event.name} kind="expense" size={28} />
                )}
              </div>

              {/* Event Name — big */}
              <h2 className="mt-3 max-w-full break-words text-xl font-black leading-tight text-[#f5f5f5] md:text-2xl">
                {event.name}
              </h2>

              {/* Amount — big */}
              <p className="mt-3 leading-none tabular-nums tracking-tight text-5xl font-black text-white md:text-6xl">
                <span className="event-hero-currency text-white font-extrabold opacity-100 text-3xl md:text-4xl mr-1.5 inline-block">{currency}</span>
                <span>{formatMoneyValue(stats.spent)}</span>
              </p>

              {/* Budget — small */}
              <p className="mt-3 text-xs font-bold text-[#8c8c8c]">
                {event.budget != null && Number(event.budget) > 0 ? (
                  <>
                    <span>{tr("Peruntukan Bajet", "Budget Limit")}: </span>
                    <span className="text-white font-black">{currency} {formatMoneyValue(Number(event.budget))}</span>
                  </>
                ) : (
                  tr("Tiada had bajet ditetapkan", "No budget limit set")
                )}
              </p>

              {/* Time / Dates — small */}
              <p className="mt-1 text-[0.625rem] font-semibold text-[#6b6b6b]">
                {formatDateShort(event.start_date)} → {event.end_date ? formatDateShort(event.end_date) : tr("Tiada tarikh tamat", "No end date")}
                {event.wallet_id ? ` · ${tr("Wallet Dipilih", "Linked Wallet")}` : ` · ${tr("Semua Wallet", "All Wallets")}`}
              </p>

              {/* Status badge */}
              <span className={cn(
                "mt-3 shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]",
                statusClass
              )}>
                {statusLabel}
              </span>

              {event.notes ? (
                <p className="mt-4 max-w-md rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-[#d4d4d4] italic">
                  &ldquo;{event.notes}&rdquo;
                </p>
              ) : null}
            </div>
          </div>

          {/* ─── Financial KPIs Grid ─── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* KPI 1: Peruntukan Bajet */}
            <div className="event-kpi-card">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Peruntukan Bajet", "Event Budget")}
              </span>
              <div className="mt-1">
                {event.budget != null && Number(event.budget) > 0 ? (
                  <MoneyAmount value={Number(event.budget)} currency={currency} size="sm" className="font-black" />
                ) : (
                  <span className="text-xs font-bold text-[var(--muted)]">{tr("Tiada Had", "No Limit")}</span>
                )}
              </div>
            </div>

            {/* KPI 2: Dibelanjakan */}
            <div className="event-kpi-card">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Dibelanjakan", "Total Spent")}
              </span>
              <div className="mt-1">
                <MoneyAmount value={stats.spent} currency={currency} size="sm" className="font-black text-[var(--text)]" />
              </div>
            </div>

            {/* KPI 3: Baki / Lebihan */}
            <div className="event-kpi-card">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                {stats.remaining != null && stats.remaining < 0 ? tr("Lebihan Bajet", "Over Budget") : tr("Baki Bajet", "Remaining")}
              </span>
              <div className="mt-1">
                {stats.remaining != null ? (
                  <span className={cn("font-black", stats.remaining < 0 ? "text-rose-500" : "text-emerald-500")}>
                    <MoneyAmount value={Math.abs(stats.remaining)} currency={currency} size="sm" />
                  </span>
                ) : (
                  <span className="text-xs font-bold text-[var(--muted)]">—</span>
                )}
              </div>
            </div>

            {/* KPI 4: Status Transaksi */}
            <div className="event-kpi-card">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Status Transaksi", "Txn Status")}
              </span>
              <div className="mt-1 flex items-baseline gap-1 text-xs font-black text-[var(--text)]">
                <span>{stats.countedCount} {tr("dikira", "counted")}</span>
                {stats.excludedCount > 0 && (
                  <span className="text-[0.65rem] font-bold text-[var(--muted)]">
                    ({stats.excludedCount} {tr("abai", "ignored")})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ─── Budget Utilization Progress Bar Card ─── */}
          {event.budget != null && Number(event.budget) > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[var(--text)]">{tr("Penggunaan Bajet", "Budget Utilization")}</span>
                <span className={cn(stats.ratio >= 1 ? "text-rose-500" : "text-[var(--muted)]")}>
                  {Math.round(stats.ratio * 100)}%
                </span>
              </div>

              <div className="mt-2.5">
                <div className="event-progress-track">
                  <div
                    className={cn(
                      "event-progress-fill",
                      stats.ratio >= 1
                        ? "bg-[var(--expense)]"
                        : stats.ratio >= 0.8
                          ? "bg-amber-500"
                          : "bg-[var(--income)]"
                    )}
                    style={{ width: `${Math.min(100, stats.ratio * 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[0.6875rem] font-semibold text-[var(--muted)]">
                <span>
                  {tr(
                    `${moneyLabel(stats.spent, currency)} daripada ${moneyLabel(Number(event.budget), currency)} digunakan`,
                    `${moneyLabel(stats.spent, currency)} of ${moneyLabel(Number(event.budget), currency)} used`
                  )}
                </span>
                <span className={cn("font-black", stats.remaining != null && stats.remaining < 0 ? "text-rose-500" : "text-emerald-500")}>
                  {stats.remaining != null && stats.remaining >= 0
                    ? tr(`Baki ${moneyLabel(stats.remaining, currency)}`, `${moneyLabel(stats.remaining, currency)} left`)
                    : tr(`Lebih ${moneyLabel(Math.abs(stats.remaining || 0), currency)}`, `Over by ${moneyLabel(Math.abs(stats.remaining || 0), currency)}`)}
                </span>
              </div>
            </div>
          )}

          {/* ─── Transactions List Section ─── */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  {tr("Transaksi Dalam Tempoh Acara", "Transactions in Event Date Range")}
                </h2>
                <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[0.625rem] font-bold text-[var(--muted)]">
                  {transactions.length}
                </span>
              </div>

              <span className="text-[0.6875rem] font-medium text-[var(--muted)]">
                {stats.countedCount} {tr("termasuk", "included")}
              </span>
            </div>

            {transactions.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-12 text-center shadow-[var(--shadow-card)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--muted)]">
                  <AlertCircle size={24} />
                </div>
                <p className="mt-3 text-sm font-bold text-[var(--text)]">
                  {event.start_date && event.end_date
                    ? tr("Tiada transaksi dalam julat tarikh acara ini.", "No transactions found within this event's dates.")
                    : tr("Acara ini tiada tarikh mula & tamat.", "This event has no start and end dates configured.")}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {tr(
                    "Sebarang transaksi yang direkodkan antara tarikh mula dan tamat akan dipaparkan secara automatik di sini.",
                    "Any transaction dated within the start and end dates will automatically show up here."
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
                <div className="divide-y divide-[var(--border)]/60">
                  {transactions.map((txn) => {
                    const isIncome = txn.type === "income"
                    return (
                      <div
                        key={txn.id}
                        className={cn(
                          "event-txn-row group transition",
                          !txn.included && "opacity-50 bg-[var(--surface-tint)]/20"
                        )}
                      >
                        {/* Toggle Checkbox Button */}
                        <button
                          type="button"
                          disabled={busyId === txn.id}
                          onClick={() => void toggle(txn)}
                          aria-label={
                            txn.included
                              ? tr("Keluarkan dari kiraan bajet", "Exclude from budget count")
                              : tr("Masukkan ke dalam kiraan bajet", "Include in budget count")
                          }
                          aria-pressed={txn.included}
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition active:scale-90 disabled:opacity-40",
                            txn.included
                              ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                              : "border-[var(--border-strong)] bg-[var(--surface-tint)] text-transparent hover:border-emerald-500/50"
                          )}
                        >
                          {busyId === txn.id ? (
                            <Loader2 size={12} className="animate-spin text-[var(--muted)]" />
                          ) : (
                            <Check size={14} strokeWidth={3} />
                          )}
                        </button>

                        {/* Txn Details */}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p
                            className={cn(
                              "truncate text-sm font-bold text-[var(--text)] transition-all",
                              !txn.included && "line-through text-[var(--muted)]"
                            )}
                          >
                            {txn.vendor_or_source || tr("Transaksi", "Transaction")}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-medium text-[var(--muted)]">
                            <span>{formatDateShort(txn.txn_date)}</span>
                            {txn.wallet_name && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1">
                                  <WalletIcon size={10} />
                                  <span>{txn.wallet_name}</span>
                                </span>
                              </>
                            )}
                            {!txn.included && (
                              <span className="rounded bg-rose-500/10 px-1.5 py-0.2 text-[0.6rem] font-black uppercase text-rose-500">
                                {tr("Tidak Dikira", "Excluded")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="text-right">
                          <span
                            className={cn(
                              "text-sm font-black tabular-nums tracking-tight",
                              isIncome ? "text-[var(--income)]" : "text-[var(--text)]"
                            )}
                          >
                            {isIncome ? "+" : "−"}
                            {moneyLabel(txn.amount, txn.currency)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Explanatory note */}
            <div className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-3 text-[0.6875rem] text-[var(--muted)]">
              <Check size={14} className="shrink-0 text-emerald-500 mt-0.5" />
              <p>
                {tr(
                  "Tekan kotak semak untuk masukkan atau keluarkan transaksi daripada pengiraan bajet acara. Rekod transaksi dalam pangkalan data tidak akan dipadam atau diubah suai.",
                  "Tap the checkbox to include or exclude transactions from the event budget. Records in the database remain completely intact."
                )}
              </p>
            </div>
          </div>
        </div>
      </DesktopPageBody>

      {alertModal}
    </div>
  )
}
