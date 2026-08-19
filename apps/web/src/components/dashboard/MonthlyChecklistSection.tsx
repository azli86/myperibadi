"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Check, CreditCard, Landmark } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useParams } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang"
import { ConfettiBurst } from "./ConfettiBurst"

interface Subscription {
  id: number
  name: string
  amount: number
  due_day_of_month: number
  status: string
  last_payment_date?: string | null
}

interface Loan {
  id: number
  name: string
  outstanding_amount: number
  monthly_payment: number | null
  due_day_of_month: number | null
  status: string
}

interface Checkoff {
  id: number
  item_type: "loan" | "subscription"
  item_id: number
  period_start: string
  period_end: string
}

function formatCurrency(amount: number) {
  return `RM ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function dueDateForMonth(year: number, month: number, dueDay: number) {
  return new Date(year, month, Math.min(dueDay, lastDayOfMonth(year, month)))
}

function computeCurrentPeriod(dueDay: number, today: Date) {
  const currentDue = dueDateForMonth(today.getFullYear(), today.getMonth(), dueDay)
  if (today > currentDue) {
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const periodEnd = dueDateForMonth(next.getFullYear(), next.getMonth(), dueDay)
    return { start: currentDue, end: periodEnd }
  }
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const periodStart = dueDateForMonth(prev.getFullYear(), prev.getMonth(), dueDay)
  return { start: periodStart, end: currentDue }
}

function daysUntilDue(dueDay: number, today: Date) {
  const due = dueDateForMonth(today.getFullYear(), today.getMonth(), dueDay)
  return Math.round((due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
}

function formatPeriodLabel(dueDay: number, today: Date, locale: string) {
  const { start, end } = computeCurrentPeriod(dueDay, today)
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
  const startStr = start.toLocaleDateString(locale === "BM" ? "ms-MY" : "en-MY", opts)
  const endStr = end.toLocaleDateString(locale === "BM" ? "ms-MY" : "en-MY", opts)
  return `${startStr} – ${endStr}`
}

export function MonthlyChecklistSection() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || "" // eslint-disable-line @typescript-eslint/no-unused-vars
  const { lang } = useLang()

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [checkoffs, setCheckoffs] = useState<Checkoff[]>([])
  const [loading, setLoading] = useState(true)
  const [celebratingId, setCelebratingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const t = getAccessToken()
      const [subsRes, loansRes, checkoffsRes] = await Promise.all([
        fetch(`/api/subscriptions?include_settled=false`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } }),
        fetch(`/api/loans?include_settled=false`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } }),
        fetch(`/api/monthly-checkoffs`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } }),
      ])
      if (subsRes.ok) setSubscriptions(await subsRes.json())
      if (loansRes.ok) setLoans(await loansRes.json())
      if (checkoffsRes.ok) setCheckoffs(await checkoffsRes.json())
    } catch (err) {
      console.error("Failed to load checklist:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleToggle = useCallback(async (itemType: "loan" | "subscription", itemId: number, checked: boolean) => {
    const t = getAccessToken()
    if (checked) {
      const res = await fetch(`/api/monthly-checkoffs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({ item_type: itemType, item_id: itemId }),
      })
      if (res.ok) {
        const created: Checkoff = await res.json()
        setCheckoffs((prev) => {
          const exists = prev.some((c) => c.item_type === created.item_type && c.item_id === created.item_id)
          if (exists) return prev
          return [...prev, created]
        })
        setCelebratingId(`${itemType}-${itemId}`)
        setTimeout(() => setCelebratingId(null), 900)
      }
    } else {
      const res = await fetch(`/api/monthly-checkoffs/${itemType}/${itemId}`, {
        method: "DELETE",
        headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      })
      if (res.ok) {
        setCheckoffs((prev) => prev.filter((c) => !(c.item_type === itemType && c.item_id === itemId)))
      }
    }
  }, [])

  const isChecked = useCallback((itemType: "loan" | "subscription", itemId: number) => {
    if (checkoffs.some((c) => c.item_type === itemType && c.item_id === itemId)) return true
    if (itemType !== "subscription") return false
    const subscription = subscriptions.find((item) => item.id === itemId)
    if (!subscription?.last_payment_date) return false
    const paid = new Date(`${subscription.last_payment_date.slice(0, 10)}T00:00:00`)
    const { start, end } = computeCurrentPeriod(subscription.due_day_of_month, new Date())
    return paid >= start && paid <= end
  }, [checkoffs, subscriptions])

  const today = new Date()

  const items = useMemo(() => {
    const subs = subscriptions
      .filter((s) => s.status === "active")
      .map((s) => ({
        type: "subscription" as const,
        id: s.id,
        name: s.name,
        amount: s.amount,
        dueDay: s.due_day_of_month,
        sortDay: s.due_day_of_month,
      }))
    const ln = loans
      .filter((l) => l.status === "active" && (l.outstanding_amount || 0) > 0.004)
      .map((l) => ({
        type: "loan" as const,
        id: l.id,
        name: l.name,
        amount: l.monthly_payment ?? l.outstanding_amount,
        dueDay: l.due_day_of_month || 1,
        sortDay: l.due_day_of_month || 1,
      }))
    return [...subs, ...ln].sort((a, b) => a.sortDay - b.sortDay)
  }, [subscriptions, loans])

  const periodLabel = useMemo(() => {
    if (items.length === 0) return ""
    return formatPeriodLabel(items[0].dueDay, today, lang)
  }, [items, today, lang])

  const paidCount = useMemo(
    () => items.filter((item) => isChecked(item.type, item.id)).length,
    [items, isChecked]
  )
  const progressPct = items.length > 0 ? (paidCount / items.length) * 100 : 0
  const remainingAmount = useMemo(
    () => items
      .filter((item) => !isChecked(item.type, item.id))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [items, isChecked]
  )
  const allPaid = !loading && items.length > 0 && paidCount === items.length

  if (!loading && items.length === 0) return null

  const title = lang === "EN" ? "Commitments" : "Komitmen"

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]">
      {/* Header */}
      <div className="px-3.5 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-[var(--text)]">{title}</h3>
            <p className="mt-0.5 truncate text-[0.62rem] font-medium text-[var(--muted)]">
              {periodLabel || (lang === "EN" ? "This cycle" : "Kitaran ini")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[0.95rem] font-black tabular-nums leading-none text-[var(--text)]">
              {loading ? "—" : `${paidCount}`}
              <span className="text-[0.7rem] font-bold text-[var(--muted)]">/{loading ? "—" : items.length}</span>
            </p>
            <p className="mt-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {lang === "EN" ? "paid" : "bayar"}
            </p>
          </div>
        </div>

        {/* Progress strip */}
        {!loading && items.length > 0 && (
          <div className="mt-3 rounded-xl bg-[var(--surface-tint)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.62rem] font-semibold text-[var(--muted)]">
                {allPaid
                  ? (lang === "EN" ? "All settled" : "Semua selesai")
                  : (lang === "EN" ? "Left to pay" : "Baki bayar")}
              </span>
              <span className="text-[0.78rem] font-black tabular-nums text-[var(--text)]">
                {allPaid ? "✓" : formatCurrency(remainingAmount)}
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--card)]">
              <div
                className="h-full rounded-full bg-[var(--btn-primary-bg)] transition-all duration-500"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="px-2.5 pb-2.5">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-[var(--surface-tint)]" />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {items.map((item) => {
                const checked = isChecked(item.type, item.id)
                const key = `${item.type}-${item.id}`
                const TypeIcon = item.type === "loan" ? Landmark : CreditCard
                const days = daysUntilDue(item.dueDay, today)
                const dayLabel = checked
                  ? (lang === "EN" ? "Paid" : "Dibayar")
                  : days < 0
                    ? (lang === "EN" ? `${Math.abs(days)} days overdue` : `${Math.abs(days)} hari lewat`)
                    : days === 0
                      ? (lang === "EN" ? "Due today" : "Due hari ini")
                      : (lang === "EN" ? `${days} days left` : `${days} hari lagi`)
                return (
                  <motion.button
                    key={key}
                    type="button"
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    onClick={() => handleToggle(item.type, item.id, !checked)}
                    className={cn(
                      "relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition active:scale-[0.99]",
                      checked
                        ? "bg-[var(--surface-tint)]"
                        : "hover:bg-[var(--surface-tint)]"
                    )}
                  >
                    <ConfettiBurst
                      active={celebratingId === key}
                      onDone={() => setCelebratingId(null)}
                    />

                    {/* Type icon */}
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--muted)]">
                      <TypeIcon size={13} strokeWidth={2.2} />
                    </span>

                    {/* Name + meta */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8rem] font-bold leading-tight text-[var(--text)]">
                        {item.name}
                      </p>
                      <p className="mt-0.5 truncate text-[0.62rem] font-semibold tabular-nums text-[var(--muted)]">
                        {formatCurrency(item.amount)}
                        <span className="mx-1 opacity-40">·</span>
                        {lang === "EN" ? "Due" : "Due"} {item.dueDay}
                        <span className="mx-1 opacity-40">·</span>
                        {dayLabel}
                      </p>
                    </div>

                    {/* Check circle */}
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
                        checked
                          ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                          : "border-[var(--border-strong)] bg-transparent text-transparent"
                      )}
                      aria-hidden
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  )
}
