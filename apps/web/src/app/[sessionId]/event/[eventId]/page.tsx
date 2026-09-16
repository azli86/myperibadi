"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronLeft,
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

  // Chronological grouping reads like a trip journal and needs no category data,
  // which the transactions endpoint does not return.
  const groups = useMemo(() => {
    const byMonth = new Map<string, typeof transactions>()
    for (const t of transactions) {
      const key = t.txn_date ? t.txn_date.slice(0, 7) : ""
      const bucket = byMonth.get(key)
      if (bucket) bucket.push(t)
      else byMonth.set(key, [t])
    }
    return [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => ({
        key,
        label: key
          ? new Date(`${key}-01T00:00:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" })
          : tr("Tiada tarikh", "No date"),
        items,
      }))
  }, [transactions, tr])

  // Sparkline over the running spend, oldest first. Scaled to the window shown,
  // so a flat week reads as a flat line rather than a full-height climb.
  const spark = useMemo(() => {
    const points = [...transactions]
      .sort((a, b) => (a.txn_date || "") < (b.txn_date || "") ? -1 : 1)
      .filter((t) => t.included && t.type === "expense")
    if (points.length < 2) return null
    let running = 0
    const values = points.map((t) => (running += t.amount))
    const max = Math.max(...values, 1)
    const min = Math.min(...values, 0)
    const span = max - min || 1
    return values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 28}`).join(" ")
  }, [transactions])

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
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full bg-[var(--page-bg)] text-[var(--text)]">
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Butiran Acara", "Event Details")}
          breadcrumbs={[{ label: tr("Acara", "Events"), href: `/${sessionId}/event` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/event`}
          backPreferHistory
        />
      </div>

      <DesktopPageBody className="px-0 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
        {/* ─── Immersive hero ─── */}
        <div className="relative overflow-hidden rounded-none md:rounded-3xl">
          <div className="relative h-[220px] w-full sm:h-[260px]">
            {event.has_image && event.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.image_url} alt={event.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[var(--accent)] via-[var(--accent)]/70 to-[var(--text)]" />
            )}

            {/* Dark overlay: the title sits on an unknown photo, so it needs its own floor. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/25" />

            <button
              type="button"
              onClick={() => router.push(`/${sessionId}/event`)}
              aria-label={tr("Kembali", "Back")}
              className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition active:scale-90 md:hidden"
            >
              <ChevronLeft size={22} />
            </button>

            <div className="absolute inset-x-0 bottom-0 px-5 pb-7">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[0.625rem] font-black uppercase tracking-wider text-white">
                <CategoryIconGlyph iconName={event.icon_name} categoryName={event.name} kind="expense" size={12} />
                {event.name}
              </span>
              <h1 className="mt-2.5 break-words text-3xl font-black leading-tight tracking-tight text-white">
                {formatCurrencyLabel(currency)} {formatMoneyValue(stats.spent)}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/75">
                {tr("Perbelanjaan Perjalanan", "Travel Expenses")}
              </p>
            </div>
          </div>
        </div>

        {/* ─── Sheet overlapping the hero ─── */}
        <div className="relative -mt-4 rounded-t-3xl bg-[var(--card)] px-5 pb-5 pt-3 shadow-[var(--shadow-card)] md:px-7">
          <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border-strong)]" />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-wider", statusClass)}>
              {statusLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-0.5 text-[0.625rem] font-bold text-[var(--muted)]">
              <Calendar size={11} />
              {formatDateShort(event.start_date)} → {event.end_date ? formatDateShort(event.end_date) : tr("Tiada tarikh tamat", "No end date")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-0.5 text-[0.625rem] font-bold text-[var(--muted)]">
              <WalletIcon size={11} />
              {event.wallet_id ? tr("Wallet Dipilih", "Linked Wallet") : tr("Semua Wallet", "All Wallets")}
            </span>
          </div>

          {event.notes ? (
            <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-3.5 py-2 text-xs italic text-[var(--muted)]">
              &ldquo;{event.notes}&rdquo;
            </p>
          ) : null}

          {event.budget != null && Number(event.budget) > 0 ? (
            <div className="mt-5">
              <div className="flex items-baseline justify-between text-[0.6875rem]">
                <span className="font-black uppercase tracking-wider text-[var(--muted)]">
                  {tr("Daripada bajet", "Of budget")}
                </span>
                <span className="font-black text-[var(--text)]">
                  <MoneyAmount value={Number(event.budget)} currency={currency} size="sm" />
                </span>
              </div>
              <div className="event-progress-track mt-2">
                <div
                  className={cn(
                    "event-progress-fill",
                    stats.ratio >= 1 ? "bg-[var(--expense)]" : stats.ratio >= 0.8 ? "bg-amber-500" : "bg-[var(--income)]"
                  )}
                  style={{ width: `${Math.min(100, stats.ratio * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[0.6875rem] font-bold">
                <span className="text-[var(--muted)]">
                  {Math.round(stats.ratio * 100)}% {tr("digunakan", "used")}
                </span>
                <span className={cn(stats.remaining != null && stats.remaining < 0 ? "text-rose-500" : "text-emerald-500")}>
                  {stats.remaining != null && stats.remaining >= 0
                    ? tr(`Baki ${moneyLabel(stats.remaining, currency)}`, `${moneyLabel(stats.remaining, currency)} left`)
                    : tr(`Lebih ${moneyLabel(Math.abs(stats.remaining || 0), currency)}`, `Over by ${moneyLabel(Math.abs(stats.remaining || 0), currency)}`)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-5 text-[0.6875rem] font-bold text-[var(--muted)]">
              {tr("Tiada had bajet", "No budget limit")}
            </div>
          )}
        </div>

        {/* ─── Transactions, grouped by month ─── */}
        <div className="mt-5 space-y-5">
          {transactions.length === 0 ? (
            <div className="mx-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-14 text-center shadow-[var(--shadow-card)] md:mx-0">
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
            groups.map((group) => (
              <section key={group.key || "none"}>
                <div className="flex items-center justify-between px-5 md:px-1">
                  <h2 className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                    {group.label}
                  </h2>
                  <span className="text-[0.6875rem] font-bold text-[var(--muted)]">
                    {group.items.length} {tr("transaksi", "transactions")}
                  </span>
                </div>

                <div className="mt-2.5 overflow-hidden bg-[var(--card)] md:rounded-2xl md:border md:border-[var(--border)] md:shadow-[var(--shadow-card)]">
                  <div className="divide-y divide-[var(--border)]/60">
                    {group.items.map((txn) => {
                      const isIncome = txn.type === "income"
                      return (
                        <div
                          key={txn.id}
                          className={cn(
                            "event-txn-row group flex items-center gap-3 px-4 py-3.5 transition md:px-5",
                            !txn.included && "opacity-55"
                          )}
                        >
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
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition active:scale-90 disabled:opacity-40",
                              txn.included
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-[var(--border-strong)] bg-[var(--surface-tint)] text-transparent"
                            )}
                          >
                            {busyId === txn.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Check size={14} strokeWidth={3} />
                            )}
                          </button>

                          <div className="flex min-w-0 flex-1 flex-col">
                            <p className={cn("truncate text-sm font-bold text-[var(--text)]", !txn.included && "line-through text-[var(--muted)]")}>
                              {txn.vendor_or_source || tr("Transaksi", "Transaction")}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-medium text-[var(--muted)]">
                              <span>{formatDateShort(txn.txn_date)}</span>
                              {txn.wallet_name ? (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <WalletIcon size={10} />
                                    {txn.wallet_name}
                                  </span>
                                </>
                              ) : null}
                              {!txn.included ? (
                                <span className="rounded-full bg-rose-500/10 px-1.5 text-[0.6rem] font-black uppercase text-rose-500">
                                  {tr("Tidak Dikira", "Excluded")}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <span
                            className={cn(
                              "shrink-0 text-sm font-black tabular-nums tracking-tight",
                              isIncome ? "text-[var(--income)]" : "text-[var(--text)]"
                            )}
                          >
                            {isIncome ? "+" : "−"}{moneyLabel(txn.amount, txn.currency)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            ))
          )}
        </div>

        {/* ─── Summary slab ─── */}
        <div className="mt-6 px-4 md:px-0">
          <div className="relative overflow-hidden rounded-3xl bg-[var(--summary-bg)] px-6 py-6">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/[0.05] blur-2xl" />
            <div className="relative flex items-end justify-between gap-4">
              <div>
                <p className="text-5xl font-black leading-none tabular-nums tracking-tight text-[var(--summary-text)]">
                  {stats.countedCount}
                </p>
                <p className="mt-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--summary-muted)]">
                  {tr("Transaksi Dikira", "Counted Expenses")}
                </p>
                <p className="mt-1 text-[0.6875rem] font-semibold text-[var(--summary-dim)]">
                  {transactions.length} {tr("keseluruhan", "total")}
                  {stats.excludedCount > 0 ? ` · ${stats.excludedCount} ${tr("diabai", "ignored")}` : ""}
                </p>
              </div>

              {spark ? (
                <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-12 w-28 shrink-0" aria-hidden="true">
                  <polyline
                    points={spark}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mx-4 mt-4 flex items-start gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 text-[0.6875rem] text-[var(--muted)] shadow-[var(--shadow-card)] md:mx-0">
          <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
          <p>
            {tr(
              "Tekan bulatan semak untuk masukkan atau keluarkan transaksi daripada pengiraan bajet acara. Rekod transaksi dalam pangkalan data tidak akan dipadam atau diubah suai.",
              "Tap the checkbox to include or exclude transactions from the event budget. Records in the database remain completely intact."
            )}
          </p>
        </div>
      </DesktopPageBody>

      {alertModal}
    </div>
  )
}
