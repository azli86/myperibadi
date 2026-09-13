"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
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
      showAlert(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal muat acara.", "Failed to load event."),
        "error"
      )
    } finally {
      setLoading(false)
    }
  }, [eventId, authHeaders, tr, showAlert])

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
        showAlert(
          tr("Gagal kemas kini", "Update failed"),
          err instanceof Error ? err.message : tr("Gagal kemas kini transaksi.", "Failed to update transaction."),
          "error"
        )
      } finally {
        setBusyId(null)
      }
    },
    [eventId, authHeaders, load, tr, showAlert]
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

  const header = (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--icon-fg)]">
        {event.has_image && event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.image_url} alt={event.name} className="h-full w-full object-cover" />
        ) : (
          <CategoryIconGlyph iconName={event.icon_name} categoryName={event.name} kind="expense" size={20} />
        )}
      </span>
      <div className="flex min-w-0 flex-col">
        <p className="truncate text-sm font-black text-[var(--text)]">{event.name}</p>
        <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--muted)]">
          <Calendar size={11} className="shrink-0" />
          <span className="truncate">
            {formatDateShort(event.start_date)} → {event.end_date ? formatDateShort(event.end_date) : tr("Tiada tarikh tamat", "No end date")}
          </span>
        </span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--page-bg)] pb-24">
      <div className="md:hidden">
        <MobilePageHeader title={event.name} fallbackHref={`/${sessionId}/event`} />
      </div>
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Butiran Acara", "Event Details")} backHref={`/${sessionId}/event`} />
      </div>

      <DesktopPageBody>
        <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-0">
          <div className="mb-3">{header}</div>
          {/* Totals */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[0.625rem] font-bold text-[var(--muted)] uppercase tracking-wider">
                  {tr("Terpakai", "Spent")}
                </span>
                <MoneyAmount value={stats.spent} currency={currency} size="md" />
              </div>
              {event.budget != null ? (
                <div className="flex flex-col items-end">
                  <span className="text-[0.625rem] font-bold text-[var(--muted)] uppercase tracking-wider">
                    {tr("Bajet", "Budget")}
                  </span>
                  <MoneyAmount value={Number(event.budget)} currency={currency} size="sm" />
                </div>
              ) : null}
            </div>

            {event.budget != null && Number(event.budget) > 0 ? (
              <>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-tint)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      stats.ratio >= 1 ? "bg-[var(--expense)]" : stats.ratio >= 0.8 ? "bg-amber-500" : "bg-[var(--income)]"
                    )}
                    style={{ width: `${Math.min(100, stats.ratio * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                  {stats.remaining != null && stats.remaining >= 0
                    ? tr(`Baki ${moneyLabel(stats.remaining, currency)}`, `${moneyLabel(stats.remaining, currency)} left`)
                    : tr(
                        `Lebih ${moneyLabel(Math.abs(stats.remaining || 0), currency)}`,
                        `Over by ${moneyLabel(Math.abs(stats.remaining || 0), currency)}`
                      )}
                </p>
              </>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border)]/60 pt-3 text-[0.6875rem] font-semibold text-[var(--muted)]">
              <span>
                {tr("Dikira", "Counted")}: <span className="text-[var(--text)] font-black">{stats.countedCount}</span>
              </span>
              <span>
                {tr("Tidak dikira", "Excluded")}: <span className="text-[var(--text)] font-black">{stats.excludedCount}</span>
              </span>
              <span>
                {tr("Jumlah rekod", "Total records")}: <span className="text-[var(--text)] font-black">{stats.totalCount}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <WalletIcon size={11} />
                {tr("Wallet", "Wallet")}:{" "}
                <span className="text-[var(--text)] font-black">
                  {event.wallet_id ? tr("Dipilih", "Selected") : tr("Semua", "All")}
                </span>
              </span>
            </div>

            {event.notes ? (
              <p className="mt-3 border-t border-[var(--border)]/60 pt-3 text-xs font-medium text-[var(--muted)] whitespace-pre-wrap">
                {event.notes}
              </p>
            ) : null}
          </div>

          {/* Transactions — the list never drops rows, unticking only stops the count. */}
          <div className="mt-4">
            <h2 className="mb-2 px-0.5 text-[0.6875rem] font-bold text-[var(--muted)] uppercase tracking-wider">
              {tr("Transaksi dalam tempoh acara", "Transactions in the event dates")}
            </h2>

            {transactions.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
                <p className="text-xs font-medium text-[var(--muted)]">
                  {event.start_date && event.end_date
                    ? tr(
                        "Tiada transaksi dalam tempoh tarikh acara ini.",
                        "No transactions in this event's date range."
                      )
                    : tr(
                        "Acara ini tiada tarikh mula dan tamat. Tetapkan tarikh dahulu di halaman Acara Saya.",
                        "This event has no start and end dates. Set them on the My Events page first."
                      )}
                </p>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
                {transactions.map((txn) => {
                  const isIncome = txn.type === "income"
                  return (
                    <li
                      key={txn.id}
                      className={cn(
                        "flex items-center gap-3 border-b border-[var(--border)]/60 px-4 py-3 last:border-b-0 transition",
                        !txn.included && "opacity-60"
                      )}
                    >
                      <button
                        type="button"
                        disabled={busyId === txn.id}
                        onClick={() => void toggle(txn)}
                        aria-label={
                          txn.included
                            ? tr("Keluarkan dari kiraan", "Exclude from count")
                            : tr("Masukkan dalam kiraan", "Include in count")
                        }
                        aria-pressed={txn.included}
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition active:scale-90 disabled:opacity-40",
                          txn.included
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-[var(--border-strong)] bg-transparent text-transparent"
                        )}
                      >
                        {busyId === txn.id ? (
                          <Loader2 size={12} className="animate-spin text-[var(--muted)]" />
                        ) : (
                          <Check size={13} strokeWidth={3} />
                        )}
                      </button>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className={cn("truncate text-xs font-bold text-[var(--text)]", !txn.included && "line-through")}>
                          {txn.vendor_or_source}
                        </p>
                        <p className="truncate text-[0.6875rem] font-medium text-[var(--muted)]">
                          {formatDateShort(txn.txn_date)}
                          {txn.wallet_name ? ` · ${txn.wallet_name}` : ""}
                          {!txn.included ? ` · ${tr("tidak dikira", "not counted")}` : ""}
                        </p>
                      </div>

                      <span
                        className={cn(
                          "shrink-0 text-xs font-black tabular-nums",
                          isIncome ? "text-[var(--income)]" : "text-[var(--text)]"
                        )}
                      >
                        {isIncome ? "+" : "−"}
                        {moneyLabel(txn.amount, txn.currency)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            <p className="mt-2 px-0.5 text-[0.6875rem] font-medium text-[var(--muted)]">
              {tr(
                "Semua transaksi dalam tempoh tarikh acara disenaraikan. Tekan kotak untuk keluarkan dari kiraan bajet — rekod kekal dalam senarai dan boleh dimasukkan semula.",
                "Every transaction in the event's dates is listed. Tap the box to exclude it from the budget — the record stays in the list and can be added back."
              )}
            </p>
          </div>
        </div>
      </DesktopPageBody>

      {alertModal}
    </div>
  )
}
