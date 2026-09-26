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
  Copy,
  Check,
  History,
  RotateCcw,
  CreditCard,
  Plus,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"
import { CategoryIconGlyph } from "@/lib/category-icons"
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
  category_id?: number | null
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
  category_id: string
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [form, setForm] = useState<SubscriptionFormState>({ name: "", amount: "", due_day: "1", category_id: "", notes: "" })
  const [categories, setCategories] = useState<{ id: number; name: string; icon_name?: string | null; kind: string }[]>([])
  const [catOpen, setCatOpen] = useState(false)

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
          category_id: subData?.category_id ? String(subData.category_id) : "",
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
    const token = getAccessToken()
    void fetch("/api/categories", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setCategories(list.filter((c) => c.kind === "expense"))
      })
      .catch(() => {
        /* ignore */
      })
  }, [])

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

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) =>
        String(b.txn_date || b.created_at || "").localeCompare(String(a.txn_date || a.created_at || ""))
      ),
    [transactions],
  )

  const category = useMemo(
    () => categories.find((c) => c.id === subscription?.category_id) || null,
    [categories, subscription?.category_id],
  )

  // Next due date as a calendar date, from the same KL-based day count.
  const nextDueLabel = useMemo(() => {
    const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
    kl.setHours(12, 0, 0, 0)
    kl.setDate(kl.getDate() + days)
    return kl.toLocaleDateString(isBM ? "ms-MY" : "en-MY", { day: "numeric", month: "short", year: "numeric" })
  }, [days, isBM])

  // How far through the monthly cycle we are: empty just after paying, full
  // on the due day, and pinned full once overdue.
  const cycleProgress = days <= 0 ? 1 : Math.min(1, Math.max(0, (30 - days) / 30))

  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoadedData)
  const mutedClass = isLight ? "text-slate-500" : "text-white/55"

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
            category_id: form.category_id ? Number(form.category_id) : null,
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
    [form.amount, form.category_id, form.due_day, form.name, form.notes, loadData, showAlert, subscription, tr],
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
          // When shown inside the subscriptions list's iframe, tell the parent
          // to close the panel and refetch so the removed row disappears.
          try {
            if (typeof window !== "undefined" && window.parent && window.parent !== window) {
              window.parent.postMessage({ type: "SUBSCRIPTION_DELETED" }, "*")
            }
          } catch {}
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

  const statusLabel = !isActive
    ? tr("Tak Aktif", "Inactive")
    : urgency === "overdue"
      ? tr("Lewat", "Overdue")
      : urgency === "today"
        ? tr("Hari Ini", "Today")
        : urgency === "soon"
          ? tr("Hampir Due", "Due Soon")
          : tr("Aktif", "Active")
  const urgencyColor =
    urgency === "overdue" ? "var(--expense)" : urgency === "today" || urgency === "soon" ? "var(--warning)" : "var(--income)"

  const subListHref = `/${sessionId}/subscription`

  if (loading && !hasLoadedData) {
    // Initial load: keep the header (with its actions) and show a skeleton body
    // so no raw text flashes before data arrives.
    const loadTitle = tr("Detail Subscription", "Subscription Detail")
    return (
      <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
        <div className="md:hidden">
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
            <div className="h-64 rounded-2xl bg-[var(--card)]" />
            <div className="h-28 rounded-2xl bg-[var(--card)]" />
            <div className="h-56 rounded-2xl bg-[var(--card)]" />
          </div>
        </DesktopPageBody>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      <div className="md:hidden">
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

      <div className="grid grid-cols-1 gap-4 px-1 pt-2 md:gap-5 md:pt-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        {/* The money column stays in view on desktop while the history scrolls. */}
        <div className="space-y-4 lg:sticky lg:top-6">
          {/* Identity + the monthly amount on the subscription hero: the dark
              premium card globals.css defines for this module (.subscription-hero
              keeps its text light in both themes), with the debt page's gradient
              and blooms. */}
          <section className="subscription-hero relative overflow-hidden rounded-2xl bg-[#1a1a1a] p-5 text-[#f5f5f5] md:p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
            <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
            <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#e5e5e5]">
                  {category ? (
                    <CategoryIconGlyph iconName={category.icon_name} categoryName={category.name} kind="expense" size={22} />
                  ) : (
                    <CalendarClock size={22} aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-lg font-black leading-tight tracking-tight text-[#f5f5f5] md:text-xl">
                    {subscription?.name || title}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {/* The hero forces light text, so the tone rides on a dot. */}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-[#e5e5e5]">
                      <i
                        aria-hidden
                        className="block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: isActive ? urgencyColor : "#8c8c8c" }}
                      />
                      {statusLabel}
                    </span>
                    {category ? (
                      <span className="truncate text-[0.6875rem] font-semibold text-[#a3a3a3]">{category.name}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <p className="mt-5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[#a3a3a3]">
                {tr("Bayaran Bulanan", "Monthly Payment")}
              </p>
              <div className="subscription-hero-amount mt-2 leading-none text-[#f5f5f5]">
                {showDataSkeleton ? (
                  <AmountSkeleton className="h-8 w-36 bg-white/10" />
                ) : (
                  <MoneyAmount
                    value={summary.amount}
                    size="hero"
                    className="text-[#f5f5f5] md:text-4xl"
                    currencyClassName="text-[#f5f5f5] opacity-55"
                  />
                )}
              </div>

              {/* Where this month's cycle stands: the bar fills toward the due day. */}
              {isActive ? (
                <div className="mt-4">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.round(cycleProgress * 100)}%`, backgroundColor: urgencyColor }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs font-bold">
                    <span className="text-[#a3a3a3]">
                      {tr("Seterusnya", "Next")} {nextDueLabel}
                    </span>
                    <span className="tabular-nums text-[#f5f5f5]">{dueLabel}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs font-bold text-[#a3a3a3]">
                  {tr("Subscription ini tidak aktif.", "This subscription is inactive.")}
                </p>
              )}

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {[
                  { label: tr("Due Day", "Due Day"), value: formatDueDay(summary.dueDay, lang) },
                  { label: tr("Dibayar", "Paid"), value: showDataSkeleton ? null : formatCurrency(summary.paidTotal) },
                  { label: tr("Mula", "Start"), value: formatDateLabel(subscription?.start_date) },
                ].map((tile) => (
                  <div key={tile.label} className="min-w-0 rounded-[1.15rem] bg-white/[0.06] p-3">
                    <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#a3a3a3]">{tile.label}</p>
                    <p className="mt-2 truncate text-sm font-black tabular-nums text-[#f5f5f5]">
                      {tile.value ?? <AmountSkeleton className="h-4 w-12 bg-white/10" />}
                    </p>
                  </div>
                ))}
              </div>

              {subscription?.notes ? (
                <div className="mt-3 rounded-[1.15rem] bg-white/[0.06] px-3 py-2.5">
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#a3a3a3]">{tr("Nota", "Notes")}</p>
                  <p className="mt-1 whitespace-pre-line text-xs font-medium leading-snug text-[#e5e5e5] [overflow-wrap:anywhere]">
                    {subscription.notes}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          {/* SUBX command: the bot is how payments are recorded, so the exact
              line to send sits right under the amount. */}
          <section className="rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)] sm:p-5">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              {tr("Rekod bayaran melalui chat", "Record a payment via chat")}
            </p>
            <div className="mt-2 flex items-stretch gap-2">
              <code className="flex min-w-0 flex-1 select-all items-center overflow-x-auto whitespace-nowrap rounded-xl bg-[var(--surface-tint-strong)] px-3 py-2.5 font-mono text-xs text-[var(--text)]">
                {subxPayCommand}
              </code>
              <button
                type="button"
                onClick={handleCopyCommand}
                aria-label={tr("Salin arahan", "Copy command")}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--surface-tint-strong)] px-3 text-xs font-bold text-[var(--text)] transition active:scale-95"
              >
                {copiedCmd ? <Check size={14} /> : <Copy size={14} />}
                {copiedCmd ? tr("Disalin", "Copied") : tr("Salin", "Copy")}
              </button>
            </div>
            <p className="mt-2 text-[0.6875rem] text-[var(--muted)]">
              {tr("Format: SUBX PAY [nama] [jumlah] [wallet]", "Format: SUBX PAY [name] [amount] [wallet]")}
            </p>
          </section>
        </div>

        {/* Payment history */}
        <section aria-labelledby="subscription-txn-heading" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 px-3 pb-3 pt-2 md:px-1 lg:pt-0">
            <h2 id="subscription-txn-heading" className="text-base font-black text-[var(--text)]">
              {tr("Sejarah Bayaran", "Payment History")}
            </h2>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--muted)]">
              {transactions.length} {tr("rekod", "records")}
              {summary.latest && transactions.length > 0 ? ` · ${tr("terkini", "latest")} ${formatDateLabel(summary.latest)}` : ""}
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl bg-[var(--card)] shadow-[var(--shadow-card)]">
            {showDataSkeleton ? (
              <div className="divide-y divide-[var(--divider)]">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-3.5">
                    <AmountSkeleton className="h-11 w-11 rounded-xl" />
                    <div className="flex-1">
                      <AmountSkeleton className="h-4 w-32" />
                      <AmountSkeleton className="mt-2 h-3 w-44" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedTransactions.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                  <History size={20} aria-hidden />
                </span>
                <p className="mt-3 text-sm font-bold text-[var(--text)]">
                  {tr("Belum ada transaksi subscription.", "No subscription transactions yet.")}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {tr("Guna SUBX PAY di chat untuk rekod bayaran.", "Use SUBX PAY in chat to record payments.")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--divider)]">
                {sortedTransactions.map((item) => {
                  const txnLinkId = item.reference_id || String(item.id)
                  const rawDate = String(item.txn_date || item.created_at || "").slice(0, 10)
                  const dateObj = rawDate ? new Date(`${rawDate}T12:00:00`) : null
                  const validDate = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj : null
                  const locale = isBM ? "ms-MY" : "en-MY"
                  const meta = [item.wallet_name || item.source_channel, item.vendor_or_source || item.notes]
                    .filter(Boolean)
                    .join(" · ")
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/${sessionId}/transactions/${txnLinkId}`)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
                      >
                        {/* Date tile: one payment a month, so the date is the row's identity. */}
                        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] leading-none">
                          <span className="text-base font-black tabular-nums text-[var(--text)]">
                            {validDate ? validDate.toLocaleDateString(locale, { day: "numeric" }) : "–"}
                          </span>
                          <span className="mt-0.5 text-[0.5625rem] font-bold uppercase text-[var(--muted)]">
                            {validDate ? validDate.toLocaleDateString(locale, { month: "short" }) : ""}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[var(--text)]">
                            {validDate
                              ? validDate.toLocaleDateString(locale, { month: "long", year: "numeric" })
                              : tr("Tiada tarikh", "No date")}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.6875rem] font-semibold text-[var(--muted)]">
                            {item.reference_id ? `#${item.reference_id}` : `${tr("Transaksi", "Transaction")} #${item.id}`}
                            {meta ? ` · ${meta}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-black tabular-nums text-[var(--text)]">
                          −{formatCurrency(item.amount)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
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
                  action={
                    <button
                      type="submit"
                      form="subscription-edit-form"
                      disabled={saving}
                      className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {saving
                        ? (isBM ? "Menyimpan…" : "Saving…")
                        : tr("Update", "Update")}
                    </button>
                  }
                />
                <form id="subscription-edit-form" onSubmit={handleSaveSubscription} className="space-y-4 px-4 py-4 md:px-6 md:py-6">
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
                      {tr("Kategori", "Category")}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setCatOpen((o) => !o)}
                          className="flex w-full items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 text-left"
                        >
                          {form.category_id ? (
                            <CategoryIconGlyph
                              iconName={categories.find((c) => String(c.id) === form.category_id)?.icon_name}
                              categoryName={(() => {
                                const c = categories.find((x) => String(x.id) === form.category_id)
                                return c ? c.name : tr("Kategori lain", "Other")
                              })()}
                              kind="expense"
                              size={16}
                            />
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                              <CreditCard size={13} />
                            </span>
                          )}
                          <span className={cn("truncate text-sm", form.category_id ? "font-bold text-[var(--text)]" : "text-[var(--muted)]")}>
                            {(() => {
                              const c = categories.find((x) => String(x.id) === form.category_id)
                              return form.category_id ? (c ? c.name : tr("Kategori lain", "Other")) : tr("Pilih kategori", "Select category")
                            })()}
                          </span>
                          <ChevronDown size={16} className="ml-auto shrink-0 text-[var(--muted)]" />
                        </button>
                        {catOpen && (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl shadow-black/20">
                            <button
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({ ...prev, category_id: "" }))
                                setCatOpen(false)
                              }}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                            >
                              {tr("Tiada kategori", "No category")}
                            </button>
                            {categories.map((c) => {
                              const selected = form.category_id === String(c.id)
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setForm((prev) => ({ ...prev, category_id: String(c.id) }))
                                    setCatOpen(false)
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
                  </label>
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
