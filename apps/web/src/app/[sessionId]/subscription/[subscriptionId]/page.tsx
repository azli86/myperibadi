"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  CalendarClock,
  ChevronDown,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  BadgeCheck,
  Calendar,
  Copy,
  Check,
  AlertTriangle,
  History,
  RotateCcw,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
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
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"

type SubscriptionItem = {
  id: number
  name: string
  key: string
  amount: number
  due_day_of_month: number
  notes?: string | null
  status: string
  start_date: string
  last_payment_date?: string | null
  created_at: string
  updated_at: string
}

type SubscriptionTxn = {
  id: number
  reference_id: string | null
  type: string
  amount: number
  vendor_or_source: string
  txn_date: string | null
  notes: string | null
  wallet_name: string | null
  category_name: string | null
  source_channel: string | null
  created_at: string
}

type SubscriptionFormState = {
  name: string
  amount: string
  due_day: string
  notes: string
}

async function readApiErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown; message?: unknown } | null
  const detail = payload?.detail ?? payload?.message
  if (typeof detail === "string" && detail.trim()) return detail
  return fallback
}

function formatDateLabel(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

/** Days until next due (KL). Negative = overdue. */
function daysUntilDueDay(dueDay: number, lastPaymentDate?: string | null, startDate?: string | null): number {
  const day = Math.min(31, Math.max(1, Math.floor(dueDay || 1)))
  const now = new Date()
  const kl = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  kl.setHours(0, 0, 0, 0)
  const year = kl.getFullYear()
  const month = kl.getMonth()
  const due = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate()
    const d = new Date(y, m, Math.min(day, last))
    d.setHours(0, 0, 0, 0)
    return d
  }
  const dueThis = due(year, month)
  const lastDue = due(year, month - 1)
  const start = startDate ? new Date(`${String(startDate).slice(0, 10)}T12:00:00`) : null
  start?.setHours(0, 0, 0, 0)
  const lp = lastPaymentDate ? new Date(`${String(lastPaymentDate).slice(0, 10)}T12:00:00`) : null
  lp?.setHours(0, 0, 0, 0)
  if (lp) {
    // Bayaran cover kitaran due yang paling hampir dengan tarikh bayar.
    const lpDue = due(lp.getFullYear(), lp.getMonth())
    const nextLpDue = due(lp.getFullYear(), lp.getMonth() + 1)
    const toLpDue = lp.getTime() - lpDue.getTime()
    const toNextLpDue = nextLpDue.getTime() - lp.getTime()
    const paidDue = toLpDue <= toNextLpDue ? lpDue : nextLpDue
    const nextDue = due(paidDue.getFullYear(), paidDue.getMonth() + 1)
    return Math.round((nextDue.getTime() - kl.getTime()) / (1000 * 60 * 60 * 24))
  }
  const anchor = kl >= dueThis ? dueThis : lastDue
  if (start && start > anchor) {
    return Math.round((dueThis.getTime() - kl.getTime()) / (1000 * 60 * 60 * 24))
  }
  return Math.round((anchor.getTime() - kl.getTime()) / (1000 * 60 * 60 * 24))
}


function formatDueDay(day: number, lang: string) {
  if (lang === "BM") return `${day}HB`
  const mod100 = day % 100
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"
  return `${day}${suffix}`
}

export default function SubscriptionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const subscriptionId = String(params.subscriptionId || "")
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const isBM = lang === "BM"
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [subscription, setSubscription] = useState<SubscriptionItem | null>(null)
  const [transactions, setTransactions] = useState<SubscriptionTxn[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoadedData, setHasLoadedData] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [form, setForm] = useState<SubscriptionFormState>({ name: "", amount: "", due_day: "1", notes: "" })

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [mobileMenuOpen])

  const tr = useCallback((bm: string, en: string) => (isBM ? bm : en), [isBM])
  const formatCurrency = useCallback(
    (value: number) => `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [],
  )

  const loadData = useCallback(
    async (options: { forceSkeleton?: boolean } = {}) => {
      if (!subscriptionId) return
      if (options.forceSkeleton || !hasLoadedData) setLoading(true)
      try {
        const token = getAccessToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const [subRes, txnRes] = await Promise.all([
          fetch(`/api/subscriptions/${subscriptionId}`, { headers }),
          fetch(`/api/subscriptions/${subscriptionId}/transactions`, { headers }),
        ])
        if (!subRes.ok) {
          throw new Error(await readApiErrorMessage(subRes, tr("Gagal muat butiran subscription.", "Failed to load subscription details.")))
        }
        const subData = await subRes.json()
        const txnData = txnRes.ok ? await txnRes.json() : []
        setSubscription(subData)
        setTransactions(Array.isArray(txnData) ? txnData : [])
        setForm({
          name: subData?.name || "",
          amount: String(Number(subData?.amount || 0) || ""),
          due_day: String(subData?.due_day_of_month || 1),
          notes: subData?.notes || "",
        })
        setHasLoadedData(true)
      } catch (err) {
        showAlertRef.current(
          tr("Ralat subscription", "Subscription error"),
          err instanceof Error ? err.message : tr("Gagal muat butiran subscription.", "Failed to load subscription details."),
          "error",
        )
      } finally {
        setLoading(false)
      }
    },
    [hasLoadedData, subscriptionId, tr],
  )

  useEffect(() => {
    loadData({ forceSkeleton: !hasLoadedData })
  }, [loadData])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showEditSheet } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showEditSheet])

  const days = useMemo(
    () => daysUntilDueDay(Number(subscription?.due_day_of_month || 1), subscription?.last_payment_date, subscription?.start_date),
    [subscription?.due_day_of_month, subscription?.last_payment_date, subscription?.start_date],
  )

  const dueLabel = useMemo(() => {
    if (days < 0) return tr(`${Math.abs(days)} hari lewat`, `${Math.abs(days)} ${Math.abs(days) === 1 ? "Day" : "Days"} overdue`)
    if (days === 0) return tr("Hari ini", "Due today")
    if (days === 1) return tr("Esok", "Tomorrow")
    return tr(`${days} hari lagi`, `in ${days} Days`)
  }, [days, tr])

  const urgency = useMemo(() => {
    if (subscription?.status !== "active") return "inactive" as const
    if (days < 0) return "overdue" as const
    if (days === 0) return "today" as const
    if (days <= 7) return "soon" as const
    return "ok" as const
  }, [days, subscription?.status])

  const summary = useMemo(() => {
    const amount = Number(subscription?.amount || 0)
    const dueDay = Number(subscription?.due_day_of_month || 1)
    const transactionCount = transactions.length
    const paidTotal = transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0)
    const latest = transactions[0]?.txn_date || transactions[0]?.created_at || subscription?.updated_at || null
    return { amount, dueDay, transactionCount, paidTotal, latest }
  }, [subscription, transactions])

  const subxPayCommand = useMemo(() => {
    const name = subscription?.name || "BIL"
    const amount = Number(subscription?.amount || 0)
    const amountText = amount > 0 ? amount.toFixed(amount % 1 === 0 ? 0 : 2) : "0"
    return `SUBX PAY ${name} ${amountText} WALLET`
  }, [subscription])

  const groupedTransactions = useMemo(() => {
    const noDateLabel = isBM ? "Tiada tarikh" : "No date"
    return Object.entries(
      transactions.reduce(
        (groups, item) => {
          const dateKey = String(item.txn_date || item.created_at || "").trim().slice(0, 10) || noDateLabel
          if (!groups[dateKey]) groups[dateKey] = []
          groups[dateKey].push(item)
          return groups
        },
        {} as Record<string, SubscriptionTxn[]>,
      ),
    )
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => {
        const hasRealDate = date !== noDateLabel
        const dateObj = hasRealDate ? new Date(`${date}T12:00:00`) : null
        const dayNumber = dateObj
          ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { day: "numeric" })
          : "--"
        const weekdayLabel = dateObj
          ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { weekday: "long" })
          : date
        const monthYearLabel = dateObj
          ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { month: "long", year: "numeric" })
          : ""
        const total = items.reduce((acc, item) => acc + Number(item.amount || 0), 0)
        return { date, items, dayNumber, weekdayLabel, monthYearLabel, total }
      })
  }, [isBM, lang, transactions])

  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoadedData)
  const surfaceCardClass = isLight ? "border-[color:var(--border)] bg-[var(--card)]" : "border-white/10 bg-[var(--card)]"
  const mutedClass = isLight ? "text-slate-500" : "text-white/55"
  const softClass = isLight ? "text-slate-400" : "text-white/35"

  const closeEditSheet = useCallback(() => setShowEditSheet(false), [])
  const { requestClose: requestEditSheetClose } = useOverlayBackClose({
    id: "subscription-edit-sheet",
    isOpen: showEditSheet,
    onClose: closeEditSheet,
  })
  const editSheetSwipe = useSwipeDownToClose(requestEditSheetClose)

  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(subxPayCommand)
      setCopiedCmd(true)
      setTimeout(() => setCopiedCmd(false), 1600)
    } catch {
      showAlert(tr("Gagal salin", "Copy failed"), tr("Tidak dapat salin arahan.", "Could not copy command."), "error")
    }
  }, [showAlert, subxPayCommand, tr])

  const handleSaveSubscription = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!subscription) return
      const amount = Number(form.amount)
      const dueDay = Number(form.due_day)
      if (!form.name.trim() || !amount || amount <= 0 || !dueDay || dueDay < 1 || dueDay > 31) {
        showAlert(
          tr("Maklumat tak lengkap", "Incomplete info"),
          tr("Isi nama, jumlah dan due day yang sah.", "Fill in name, amount and valid due day."),
          "error",
        )
        return
      }
      setSaving(true)
      try {
        const token = getAccessToken()
        const res = await fetch(`/api/subscriptions/${subscription.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: form.name.trim(),
            amount,
            due_day_of_month: dueDay,
            notes: form.notes.trim() || null,
          }),
        })
        if (!res.ok) throw new Error(await readApiErrorMessage(res, tr("Gagal simpan subscription.", "Failed to save subscription.")))
        setShowEditSheet(false)
        await loadData({ forceSkeleton: false })
        showAlert(
          tr("Subscription dikemaskini", "Subscription updated"),
          tr("Butiran subscription berjaya dikemaskini.", "Subscription details updated successfully."),
          "success",
        )
      } catch (err) {
        showAlert(
          tr("Gagal simpan", "Save failed"),
          err instanceof Error ? err.message : tr("Gagal simpan subscription.", "Failed to save subscription."),
          "error",
        )
      } finally {
        setSaving(false)
      }
    },
    [form.amount, form.due_day, form.name, form.notes, loadData, showAlert, subscription, tr],
  )

  const handleResetDue = useCallback(() => {
    if (!subscription) return
    showConfirm(
      tr("Reset status?", "Reset status?"),
      tr(`Kira semula status ${subscription.name} dari rekod transaksi?`, `Recompute ${subscription.name} status from transaction records?`),
      async () => {
        try {
          const token = getAccessToken()
          const res = await fetch(`/api/subscriptions/${subscription.id}/reset`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!res.ok) throw new Error(await readApiErrorMessage(res, tr("Gagal reset status.", "Failed to reset status.")))
          await loadData({ forceSkeleton: false })
          showAlert(
            tr("Status diset semula", "Status reset"),
            tr("Status subscription dikira semula dari rekod transaksi.", "Subscription status recomputed from transaction records."),
            "success",
          )
        } catch (err) {
          showAlert(
            tr("Gagal reset", "Reset failed"),
            err instanceof Error ? err.message : tr("Gagal reset status.", "Failed to reset status."),
            "error",
          )
        }
      },
      "warning",
    )
  }, [loadData, showAlert, showConfirm, subscription, tr])

  const handleDeleteSubscription = useCallback(() => {
    if (!subscription) return
    showConfirm(
      tr("Padam subscription?", "Delete subscription?"),
      tr(`Padam ${subscription.name}?`, `Delete ${subscription.name}?`),
      async () => {
        setDeleting(true)
        try {
          const token = getAccessToken()
          const res = await fetch(`/api/subscriptions/${subscription.id}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!res.ok) throw new Error(await readApiErrorMessage(res, tr("Gagal padam subscription.", "Failed to delete subscription.")))
          router.push(`/${sessionId}/subscription`)
        } catch (err) {
          showAlert(
            tr("Gagal padam", "Delete failed"),
            err instanceof Error ? err.message : tr("Gagal padam subscription.", "Failed to delete subscription."),
            "error",
          )
        } finally {
          setDeleting(false)
        }
      },
      "warning",
    )
  }, [router, sessionId, showAlert, showConfirm, subscription, tr])

  const title = subscription?.name || tr("Detail Subscription", "Subscription Detail")
  const isActive = subscription?.status === "active"

  const statusBadge = (() => {
    if (!isActive) return { label: tr("Tak Aktif", "Inactive"), className: "bg-white/10 text-[#8c8c8c]" }
    if (urgency === "overdue") return { label: tr("Lewat", "Overdue"), className: "bg-white/12 text-[#f5f5f5]" }
    if (urgency === "today") return { label: tr("Hari Ini", "Today"), className: "bg-white/12 text-[#f5f5f5]" }
    if (urgency === "soon") return { label: tr("Hampir Due", "Due Soon"), className: "bg-white/10 text-[#e5e5e5]" }
    return { label: tr("Aktif", "Active"), className: "bg-white/10 text-[#e5e5e5]" }
  })()

  const subListHref = `/${sessionId}/subscription`

  if (loading && !hasLoadedData) {
    // Initial load: keep the header (with its actions) and show a skeleton body
    // so no raw text flashes before data arrives.
    const loadTitle = tr("Detail Subscription", "Subscription Detail")
    return (
      <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
        <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
          <MobilePageHeader title={loadTitle} fallbackHref={subListHref} backPreferHistory />
        </div>
        <DesktopPageHeader
          title={loadTitle}
          breadcrumbs={[{ label: tr("Papan Subscription", "Subscription Board"), href: subListHref }]}
          homeHref={`/${sessionId}`}
          showBack={false}
          className="hidden md:block"
          actions={
            <>
              <button
                type="button"
                disabled
                className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2 text-xs font-bold leading-none text-emerald-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"
                aria-label={tr("Reset due date", "Reset due date")}
              >
                <RotateCcw size={16} />
                {tr("Reset", "Reset")}
              </button>
              <DesktopPageAction
                onClick={() => setShowEditSheet(true)}
                disabled
                variant="solid"
                aria-label={tr("Edit subscription", "Edit subscription")}
                className="min-w-0 flex-1 justify-center px-2 sm:flex-none sm:px-3"
              >
                <Pencil size={16} />
                {tr("Edit", "Edit")}
              </DesktopPageAction>
              <button
                type="button"
                disabled
                className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"
                aria-label={tr("Padam subscription", "Delete subscription")}
              >
                <Trash2 size={16} />
                {tr("Padam", "Delete")}
              </button>
            </>
          }
        />
        <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
          <div className="animate-pulse space-y-4">
            <div className="h-44 rounded-[2rem] bg-[var(--surface-tint)]" />
            <div className="h-64 rounded-[16px] bg-[var(--surface-tint)]" />
            <div className="h-40 rounded-[16px] bg-[var(--surface-tint)]" />
          </div>
        </DesktopPageBody>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader
          title={title}
          fallbackHref={subListHref}
          backPreferHistory
          action={
            <div ref={mobileMenuRef} className="relative">
              <MobileIconButton
                onClick={() => setMobileMenuOpen((v) => !v)}
                label={tr("Menu", "Menu")}
              >
                <MoreVertical size={16} />
              </MobileIconButton>
              {mobileMenuOpen ? (
                <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg shadow-black/10">
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowEditSheet(true) }}
                    disabled={loading || !subscription}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-40"
                  >
                    <Pencil size={16} className="text-amber-500" />
                    {tr("Edit", "Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleResetDue() }}
                    disabled={loading || !subscription}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-40"
                  >
                    <RotateCcw size={16} className="text-emerald-500" />
                    {tr("Reset Due", "Reset Due")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleDeleteSubscription() }}
                    disabled={deleting || loading || !subscription}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-rose-500 transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {tr("Padam", "Delete")}
                  </button>
                </div>
              ) : null}
            </div>
          }
        />
      </div>
      <DesktopPageHeader
        title={title}
        breadcrumbs={[{ label: tr("Papan Subscription", "Subscription Board"), href: subListHref }]}
        homeHref={`/${sessionId}`}
        showBack={false}
        className="hidden md:block"
        actions={
          <>
            <button
              type="button"
              onClick={handleResetDue}
              disabled={loading || !subscription}
              className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2 text-xs font-bold leading-none text-emerald-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"
              aria-label={tr("Reset due date", "Reset due date")}
            >
              <RotateCcw size={16} />
              {tr("Reset", "Reset")}
            </button>
            <DesktopPageAction
              onClick={() => setShowEditSheet(true)}
              disabled={loading || !subscription}
              variant="solid"
              aria-label={tr("Edit subscription", "Edit subscription")}
              className="min-w-0 flex-1 justify-center px-2 sm:flex-none sm:px-3"
            >
              <Pencil size={16} />
              {tr("Edit", "Edit")}
            </DesktopPageAction>
            <button
              type="button"
              onClick={handleDeleteSubscription}
              disabled={deleting || loading || !subscription}
              className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"
              aria-label={tr("Padam subscription", "Delete subscription")}
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {tr("Padam", "Delete")}
            </button>
          </>
        }
      />

      <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">

      {/* Hero */}
      <div className="mt-4 px-1">
        <div className="subscription-hero relative overflow-hidden rounded-[2rem] border border-[#2a2a2a] bg-[#1a1a1a] p-5 text-[#f5f5f5] md:p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
          <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
          <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[#a3a3a3]">
                    {tr("Bayaran Bulanan", "Monthly Payment")}
                  </p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]", statusBadge.className)}>
                    {statusBadge.label}
                  </span>
                </div>
                <p className="subscription-hero-amount mt-2 leading-none text-[#f5f5f5]">
                  {showDataSkeleton ? (
                    <AmountSkeleton className="h-7 w-32 bg-white/10" />
                  ) : (
                    <MoneyAmount
                      value={summary.amount}
                      size="hero"
                      className="text-[#f5f5f5] md:text-3xl"
                      currencyClassName="text-[#f5f5f5] opacity-55"
                    />
                  )}
                </p>
                <p className="mt-1.5 text-[0.625rem] font-semibold text-[#8c8c8c]">
                  {formatDueDay(summary.dueDay, lang)}
                  {isActive ? ` · ${dueLabel}` : ""}
                  {summary.transactionCount > 0 ? ` · ${summary.transactionCount} ${tr("rekod", "records")}` : ""}
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#e5e5e5]">
                <CalendarClock size={20} />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-[#b3b3b3]" />
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#a3a3a3]">{tr("Due Day", "Due Day")}</p>
                </div>
                <p className="mt-2 text-sm font-black tabular-nums text-[#f5f5f5]">
                  {showDataSkeleton ? <AmountSkeleton className="h-4 w-10 bg-white/10" /> : `${formatDueDay(summary.dueDay, lang)}`}
                </p>
              </div>
              <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                <div className="flex items-center gap-1.5">
                  {(urgency === "overdue" || urgency === "today" || urgency === "soon") ? (
                    <AlertTriangle size={12} className="text-[#b3b3b3]" />
                  ) : (
                    <BadgeCheck size={12} className="text-[#b3b3b3]" />
                  )}
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#a3a3a3]">{tr("Seterusnya", "Next")}</p>
                </div>
                <p className="mt-2 text-sm font-black tabular-nums text-[#f5f5f5]">
                  {showDataSkeleton ? <AmountSkeleton className="h-4 w-12 bg-white/10" /> : isActive ? dueLabel : "–"}
                </p>
              </div>
              <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                <div className="flex items-center gap-1.5">
                  <History size={12} className="text-[#b3b3b3]" />
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#a3a3a3]">{tr("Dibayar", "Paid")}</p>
                </div>
                <p className="mt-2 text-[#e5e5e5]">
                  {showDataSkeleton ? (
                    <AmountSkeleton className="h-4 w-12 bg-white/10" />
                  ) : (
                    <MoneyAmount
                      value={summary.paidTotal}
                      size="xs"
                      className="text-[#e5e5e5]"
                      currencyClassName="text-[#e5e5e5] opacity-55"
                    />
                  )}
                </p>
              </div>
            </div>

            {subscription?.notes ? (
              <div className="mt-3.5 rounded-[1.15rem] bg-white/[0.06] px-3 py-2.5">
                <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#a3a3a3]">{tr("Nota", "Notes")}</p>
                <p className="mt-1 text-[12px] font-medium leading-snug text-[#e5e5e5]">{subscription.notes}</p>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={handleResetDue}
                disabled={loading || !subscription}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#d4d4d4] underline-offset-4 transition hover:text-[#f5f5f5] hover:underline disabled:opacity-40"
              >
                <RotateCcw size={15} />
                {tr("Reset", "Reset")}
              </button>
              <span className="h-3.5 w-px bg-white/15" aria-hidden />
              <button
                type="button"
                onClick={() => setShowEditSheet(true)}
                disabled={loading || !subscription}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#d4d4d4] underline-offset-4 transition hover:text-[#f5f5f5] hover:underline disabled:opacity-40"
              >
                <Pencil size={15} />
                {tr("Edit", "Edit")}
              </button>
              <span className="h-3.5 w-px bg-white/15" aria-hidden />
              <button
                type="button"
                onClick={handleDeleteSubscription}
                disabled={deleting || loading || !subscription}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-400 underline-offset-4 transition hover:text-rose-300 hover:underline disabled:opacity-40"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {tr("Padam", "Delete")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SUBX command */}
      <div className="mt-3.5 px-1">
        <div className="relative overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">SUBX PAY</p>
            <button
              type="button"
              onClick={handleCopyCommand}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)] transition hover:text-[var(--text)] active:scale-95"
            >
              {copiedCmd ? <Check size={12} className="text-[var(--text)]" /> : <Copy size={12} />}
              {copiedCmd ? tr("Disalin", "Copied") : tr("Salin", "Copy")}
            </button>
          </div>
          <div className="select-all rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 font-mono text-[11px] text-[var(--text)]">
            {subxPayCommand}
          </div>
          <p className="mt-2 text-[0.58rem] font-medium text-[var(--muted)]">
            {tr("Format: SUBX PAY [nama] [jumlah] [wallet]", "Format: SUBX PAY [name] [amount] [wallet]")}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3.5 px-1">
        <div className={cn("overflow-hidden rounded-[1.35rem] border", surfaceCardClass)}>
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--surface-tint)]/10"
          >
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">{tr("Butiran", "Details")}</h2>
              <p className={cn("mt-0.5 text-[0.7rem] font-semibold", mutedClass)}>
                {tr("Maklumat penuh subscription", "Full subscription information")}
              </p>
            </div>
            <ChevronDown size={16} className={cn("transition-transform duration-200", detailsOpen ? "rotate-180" : "", softClass)} />
          </button>

          {detailsOpen && (
            <div className="border-t border-[var(--border)] px-4 py-4">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: tr("Jumlah", "Amount"), value: formatCurrency(summary.amount) },
                  { label: tr("Due Day", "Due Day"), value: `${formatDueDay(summary.dueDay, lang)}` },
                  { label: tr("Transaksi", "Transactions"), value: String(summary.transactionCount) },
                  { label: tr("Jumlah dibayar", "Total paid"), value: formatCurrency(summary.paidTotal) },
                  { label: tr("Mula", "Start"), value: formatDateLabel(subscription?.start_date) },
                  { label: tr("Terkini", "Latest"), value: formatDateLabel(summary.latest) },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
                    <p className="text-[0.5rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{item.label}</p>
                    <p className="mt-1.5 text-sm font-black text-[var(--text)]">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transactions */}
      <div className="mt-3.5 px-1">
        <div className={cn("overflow-hidden rounded-[1.35rem] border", surfaceCardClass)}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-4">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                {tr("Transaksi Subscription", "Subscription Transactions")}
              </h2>
              <p className={cn("mt-0.5 text-[0.7rem] font-semibold", mutedClass)}>
                {tr("Sejarah bayaran melalui SUBX PAY", "Payment history via SUBX PAY")}
              </p>
            </div>
            <span className={cn("text-[0.7rem] font-bold", mutedClass)}>
              {transactions.length} {tr("rekod", "records")}
            </span>
          </div>

          <div>
            {showDataSkeleton ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="border-b border-[var(--border)] px-4 py-4 last:border-b-0">
                  <AmountSkeleton className="h-4 w-32" />
                  <AmountSkeleton className="mt-2 h-3 w-52" />
                </div>
              ))
            ) : groupedTransactions.length === 0 ? (
              <div className={cn("px-4 py-12 text-center", mutedClass)}>
                <History size={28} className="mx-auto opacity-40" />
                <p className="mt-3 text-sm font-bold">{tr("Belum ada transaksi subscription.", "No subscription transactions yet.")}</p>
                <p className="mt-1 text-[11px] font-medium opacity-80">
                  {tr("Guna SUBX PAY di chat untuk rekod bayaran.", "Use SUBX PAY in chat to record payments.")}
                </p>
              </div>
            ) : (
              groupedTransactions.map(({ date, items, dayNumber, weekdayLabel, monthYearLabel, total }) => (
                <div key={date}>
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-tint)]/30 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="text-[1.5rem] font-black leading-none tabular-nums text-[var(--text)]">{dayNumber}</div>
                      <div className="min-w-0">
                        <p className="truncate text-[0.82rem] font-bold text-[var(--text)]">{weekdayLabel}</p>
                        {monthYearLabel ? <p className={cn("mt-0.5 text-[0.7rem]", mutedClass)}>{monthYearLabel}</p> : null}
                      </div>
                    </div>
                    <div className="text-right text-[var(--text)]">
                      <MoneyAmount value={total} size="xs" prefix="- " className="text-[var(--text)]" currencyClassName="text-[var(--muted)]" />
                    </div>
                  </div>

                  <div>
                    {items.map((item, index) => {
                      const txnLinkId = item.reference_id || String(item.id)
                      const rowClassName = cn(
                        "w-full px-4 py-3 text-left transition",
                        txnLinkId ? "hover:bg-[var(--surface-tint)]/30 active:opacity-80" : "cursor-default",
                      )
                      const rowStyle = {
                        borderBottom: index < items.length - 1 ? "1px solid var(--border)" : "none",
                      }
                      const content = (
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                              <CalendarClock size={14} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[0.8125rem] font-bold text-[var(--text)]">
                                {item.reference_id
                                  ? `#${item.reference_id}`
                                  : `${tr("Transaksi", "Transaction")} #${item.id}`}
                              </p>
                              <p className={cn("mt-0.5 truncate text-[0.68rem]", mutedClass)}>
                                {item.wallet_name || item.source_channel || "-"}
                                {item.vendor_or_source
                                  ? ` • ${item.vendor_or_source}`
                                  : item.notes
                                    ? ` • ${item.notes}`
                                    : ""}
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 text-[var(--text)]">
                            <MoneyAmount value={item.amount} size="sm" prefix="- " className="text-[var(--text)]" currencyClassName="text-[var(--muted)]" />
                          </p>
                        </div>
                      )

                      if (txnLinkId) {
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => router.push(`/${sessionId}/transactions/${txnLinkId}`)}
                            className={rowClassName}
                            style={rowStyle}
                          >
                            {content}
                          </button>
                        )
                      }

                      return (
                        <div key={item.id} className={rowClassName} style={rowStyle}>
                          {content}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      </DesktopPageBody>

      {mounted && showEditSheet && subscription
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center"
              onClick={requestEditSheetClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...editSheetSwipe}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh] md:max-w-md"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={tr("Edit Subscription", "Edit Subscription")}
                  onClose={requestEditSheetClose}
                />
                <form onSubmit={handleSaveSubscription} className="space-y-4 px-4 py-4 md:px-6 md:py-6">
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Nama Subscription", "Subscription Name")}
                    </span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                        {tr("Jumlah (RM)", "Amount (RM)")}
                      </span>
                      <input
                        inputMode="decimal"
                        value={form.amount}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            amount: event.target.value
                              .replace(/,/g, ".")
                              .replace(/[^0-9.]/g, "")
                              .replace(/(\..*)\./g, "$1"),
                          }))
                        }
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                        {tr("Due Day", "Due Day")}
                      </span>
                      <div className="relative">
                        <input
                          inputMode="numeric"
                          value={form.due_day}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              due_day: event.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                            }))
                          }
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 pr-12 text-sm text-[var(--text)] outline-none"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--muted)]">{lang === "BM" ? "HB" : "Day"}</span>
                      </div>
                    </label>
                  </div>
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Nota", "Notes")}
                    </span>
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil size={16} />}
                    {tr("Update Subscription", "Update Subscription")}
                  </button>
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
