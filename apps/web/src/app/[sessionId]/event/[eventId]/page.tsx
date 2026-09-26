"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Receipt,
  StickyNote,
  Wallet as WalletIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { EventHeroCard } from "./EventHeroCard"
import { EventSummaryCard } from "./EventSummaryCard"
import { formatCurrencyLabel, formatMoneyValue } from "@/components/ui/MoneyAmount"
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
  category_id?: number | null
  category_name?: string | null
  category_icon?: string | null
  notes?: string | null
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
  // Category groups start collapsed: each header already shows the category's
  // total and share, so the closed list is the overview, and a trip's full
  // list of rows is too long to scroll one-handed.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
  const toggleGroup = useCallback((key: string, open?: boolean) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (open ?? !next.has(key)) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])
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

  // Grouped by category: a trip budget is only useful if you can see what the
  // money went on. Uncategorised rows fall into their own group rather than
  // being hidden or merged into a real one.
  const groups = useMemo(() => {
    const byCategory = new Map<string, { label: string; icon: string | null; items: typeof transactions }>()
    for (const t of transactions) {
      const key = t.category_name || ""
      const bucket = byCategory.get(key)
      if (bucket) bucket.items.push(t)
      else
        byCategory.set(key, {
          label: t.category_name || tr("Tanpa Kategori", "Uncategorised"),
          icon: t.category_icon || null,
          items: [t],
        })
    }
    // Biggest spend first — the whole point of grouping is to surface where the
    // money actually went. Uncategorised sinks to the bottom regardless.
    return [...byCategory.entries()]
      .map(([key, group]) => ({
        key,
        ...group,
        total: group.items
          .filter((t) => t.included && t.type === "expense")
          .reduce((sum, t) => sum + t.amount, 0),
      }))
      .sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : b.total - a.total))
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

  const hasImage = Boolean(event.has_image && event.image_url)
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
    ? "bg-[var(--surface-tint-strong)] text-[var(--muted)] border-transparent font-bold"
    : isToday
      ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30 font-bold"
      : isSoon
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-bold"
        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-bold"

  return (
    <div className="min-h-[70vh] w-full bg-[var(--page-bg)]">
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Butiran Acara", "Event Details")}
          breadcrumbs={[{ label: tr("Acara", "Events"), href: `/${sessionId}/event` }]}
          homeHref={`/${sessionId}`}
          backHref={`/${sessionId}/event`}
          backPreferHistory
        />
      </div>

      <div className="mx-auto w-full px-1 pb-24 pt-0 md:max-w-6xl md:px-6 md:pb-16 lg:max-w-7xl">
        <div className="md:hidden">
          <MobilePageHeader title={tr("Butiran Acara", "Event Details")} fallbackHref={`/${sessionId}/event`} backPreferHistory alignLeft />
        </div>

        <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          {/* The money column stays in view on desktop while the list scrolls,
              so the total is always beside the rows being ticked. */}
          <div className="space-y-4 lg:sticky lg:top-6">
            <EventHeroCard
              event={event}
              statusLabel={statusLabel}
              statusClass={statusClass}
              isBm={isBm}
              totalLabel={`${formatCurrencyLabel(currency)} ${formatMoneyValue(stats.spent)}`}
            />

            <EventSummaryCard
              isBm={isBm}
              currency={currency}
              spent={stats.spent}
              income={stats.income}
              budget={Number(event.budget || 0)}
              remaining={stats.remaining}
              ratio={stats.ratio}
              countedCount={stats.countedCount}
              excludedCount={stats.excludedCount}
              totalCount={transactions.length}
              spark={spark}
              totalOnPhoto={hasImage}
            />

            {event.notes ? (
              <section className="rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)] sm:p-5">
                <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  <StickyNote size={12} aria-hidden />
                  {tr("Nota", "Notes")}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-[var(--text-soft)] [overflow-wrap:anywhere]">
                  {event.notes}
                </p>
              </section>
            ) : null}
          </div>

          <section aria-labelledby="event-txn-heading" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-2 md:px-1 lg:pt-0">
              <h2 id="event-txn-heading" className="text-base font-black text-[var(--text)]">
                {tr("Transaksi", "Transactions")}
              </h2>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--muted)]">
                {transactions.length}
                {stats.excludedCount > 0
                  ? tr(` · ${stats.excludedCount} diabai`, ` · ${stats.excludedCount} ignored`)
                  : ""}
              </span>
            </div>
            {transactions.length > 0 ? (
              <p className="px-3 pb-3 text-xs text-[var(--muted)] md:px-1">
                {tr(
                  "Tekan bulatan untuk masukkan atau keluarkan transaksi daripada bajet acara. Rekod asal tidak diubah.",
                  "Tap the circle to include or exclude a transaction from the event budget. The original record is not changed."
                )}
              </p>
            ) : null}

            {transactions.length === 0 ? (
              <div className="mt-2 rounded-2xl bg-[var(--card)] px-5 py-12 text-center shadow-[var(--shadow-card)]">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                  <Receipt size={20} aria-hidden />
                </span>
                <p className="mt-3 text-sm font-bold text-[var(--text)]">
                  {event.start_date && event.end_date
                    ? tr("Tiada transaksi dalam julat tarikh acara ini.", "No transactions found within this event's dates.")
                    : tr("Acara ini tiada tarikh mula & tamat.", "This event has no start and end dates configured.")}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--muted)]">
                  {tr(
                    "Sebarang transaksi yang direkodkan antara tarikh mula dan tamat akan dipaparkan secara automatik di sini.",
                    "Any transaction dated within the start and end dates will automatically show up here."
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => {
                  const share = stats.spent > 0 ? group.total / stats.spent : 0
                  const isOpen = openGroups.has(group.key)
                  const panelId = `event-group-rows-${group.key || "none"}`
                  return (
                    <div
                      key={group.key || "none"}
                      id={`event-group-${group.key || "none"}`}
                      className="scroll-mt-20 overflow-hidden rounded-2xl bg-[var(--card)] shadow-[var(--shadow-card)]"
                    >
                      <h3>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="flex w-full items-center gap-3 px-3.5 pb-2.5 pt-3.5 text-left"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text-soft)]">
                          <CategoryIconGlyph
                            iconName={group.icon}
                            categoryName={group.label}
                            kind="expense"
                            size={16}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-black text-[var(--text)]">{group.label}</span>
                            <span className="shrink-0 text-sm font-black tabular-nums text-[var(--text)]">
                              {moneyLabel(group.total, currency)}
                            </span>
                          </div>
                          {/* Share of the event's counted spend: the reason the list
                              is grouped at all is to show where the money went. */}
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                              <div
                                className="h-full rounded-full bg-[var(--text-soft)]"
                                style={{ width: `${Math.min(100, share * 100)}%` }}
                              />
                            </div>
                            <span className="w-9 shrink-0 text-right text-[0.625rem] font-bold tabular-nums text-[var(--muted)]">
                              {Math.round(share * 100)}%
                            </span>
                          </div>
                          <span className="mt-1 block text-[0.625rem] font-semibold text-[var(--muted)]">
                            {group.items.length} {tr("transaksi", group.items.length === 1 ? "transaction" : "transactions")}
                          </span>
                        </div>
                        <ChevronDown
                          size={18}
                          aria-hidden
                          className={cn(
                            "shrink-0 text-[var(--muted)] transition-transform",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                      </h3>

                      <ul
                        id={panelId}
                        className={cn(
                          "divide-y divide-[var(--divider)] border-t border-[var(--divider)]",
                          !isOpen && "hidden"
                        )}
                      >
                        {group.items.map((txn) => {
                          const isIncome = txn.type === "income"
                          return (
                            <li
                              key={txn.id}
                              className={cn(
                                "flex items-center gap-1.5 py-1 pl-1 pr-3.5 transition-opacity",
                                !txn.included && "opacity-55"
                              )}
                            >
                              {/* 44px hit area around a 24px mark: this is tapped
                                  one-handed, often while scrolling. */}
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
                                className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                              >
                                <span
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-full border-2 transition group-active:scale-90",
                                    txn.included
                                      ? "border-[var(--income)] bg-[var(--income)] text-white"
                                      : "border-[var(--divider)] bg-transparent text-transparent"
                                  )}
                                >
                                  {busyId === txn.id ? (
                                    <Loader2 size={12} className="animate-spin text-[var(--muted)]" />
                                  ) : (
                                    <Check size={13} strokeWidth={3} />
                                  )}
                                </span>
                              </button>

                              <div className="flex min-w-0 flex-1 flex-col py-1.5">
                                <p
                                  className={cn(
                                    "truncate text-sm font-bold text-[var(--text)]",
                                    !txn.included && "text-[var(--muted)] line-through"
                                  )}
                                >
                                  {txn.vendor_or_source || tr("Transaksi", "Transaction")}
                                </p>
                                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] font-semibold text-[var(--muted)]">
                                  <span className="whitespace-nowrap">{formatDateShort(txn.txn_date)}</span>
                                  {txn.wallet_name ? (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                      <WalletIcon size={10} aria-hidden />
                                      <span className="truncate">{txn.wallet_name}</span>
                                    </span>
                                  ) : null}
                                </div>
                                {txn.notes ? (
                                  <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[0.6875rem] text-[var(--text-soft)]">
                                    <StickyNote size={10} className="shrink-0" aria-hidden />
                                    <span className="truncate">{txn.notes}</span>
                                  </p>
                                ) : null}
                              </div>

                              <span
                                className={cn(
                                  "shrink-0 text-sm font-black tabular-nums tracking-tight",
                                  isIncome ? "text-[var(--income)]" : "text-[var(--text)]",
                                  !txn.included && "line-through"
                                )}
                              >
                                {isIncome ? "+" : "−"}
                                {moneyLabel(txn.amount, txn.currency)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {alertModal}
    </div>
  )
}
