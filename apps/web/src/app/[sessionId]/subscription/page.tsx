"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Loader2,
  Plus,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  BadgeCheck,
  CreditCard,
  ChevronDown,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { CategoryIconGlyph } from "@/lib/category-icons"
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

type SubscriptionFormState = {
  name: string
  amount: string
  due_day: string
  category_id: string
  notes: string
}

const defaultForm = (): SubscriptionFormState => ({
  name: "",
  amount: "",
  due_day: "1",
  category_id: "",
  notes: "",
})

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
  // Tiada bayar: anchor = due terakhir yang dah lepas & belum dibayar.
  const anchor = kl >= dueThis ? dueThis : lastDue
  if (start && start > anchor) {
    return Math.round((dueThis.getTime() - kl.getTime()) / (1000 * 60 * 60 * 24))
  }
  return Math.round((anchor.getTime() - kl.getTime()) / (1000 * 60 * 60 * 24))
}

function urgencyTone(days: number): "overdue" | "today" | "soon" | "ok" {
  if (days < 0) return "overdue"
  if (days === 0) return "today"
  if (days <= 7) return "soon"
  return "ok"
}


function formatDueDay(day: number, lang: string) {
  if (lang === "BM") return `${day}HB`
  const mod100 = day % 100
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"
  return `${day}${suffix}`
}

export default function SubscriptionPage() {
  const params = useParams()
  const router = useRouter()
  const [detailId, setDetailId] = useState<string | number | null>(null)
  const detailHistoryArmedRef = useRef(false)
  const openDetail = (id: string | number) => {
    detailHistoryArmedRef.current = false
    setDetailId(id)
  }
  const armDetailHistory = () => {
    if (detailHistoryArmedRef.current) return
    detailHistoryArmedRef.current = true
    window.history.pushState({ detailSlide: true }, "")
  }
  useEffect(() => {
    const closeDetailOnBack = () => {
      detailHistoryArmedRef.current = false
      setDetailId(null)
    }
    window.addEventListener("popstate", closeDetailOnBack)
    return () => window.removeEventListener("popstate", closeDetailOnBack)
  }, [])
  const closeDetail = () => {
    if (window.history.state?.detailSlide) window.history.back()
    else setDetailId(null)
  }
  const subscriptionsRefreshRef = useRef<() => void>(() => {})
  const [mounted, setMounted] = useState(false)
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([])
  const [includeSettled, setIncludeSettled] = useState(false)
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoadedSubscriptions, setHasLoadedSubscriptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoadedSubscriptions)
  const [form, setForm] = useState<SubscriptionFormState>(defaultForm)

  const [categories, setCategories] = useState<{ id: number; name: string; icon_name?: string | null; kind: string }[]>([])
  const [catOpen, setCatOpen] = useState(false)
  const catById = useMemo(() => {
    const m = new Map<number, { id: number; name: string; icon_name?: string | null; kind: string }>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])
  const catName = (id: string) => {
    if (!id) return tr("Pilih kategori", "Select category")
    const c = catById.get(Number(id))
    return c ? c.name : tr("Kategori lain", "Other")
  }

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

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

  const formatCurrency = useCallback((value: number) => {
    return `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }, [])

  const formatCurrencyShort = useCallback((value: number) => {
    return `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }, [])

  const loadSubscriptions = useCallback(
    async (options: { forceSkeleton?: boolean } = {}) => {
      if (options.forceSkeleton || !hasLoadedSubscriptions) setLoading(true)
      try {
        const token = getAccessToken()
        const url = `/api/subscriptions?include_settled=${includeSettled ? "true" : "false"}`
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) throw new Error(tr("Gagal muat data subscription.", "Failed to load subscriptions."))
        const data = await res.json()
        setSubscriptions(Array.isArray(data) ? data : [])
        setHasLoadedSubscriptions(true)
      } catch (err) {
        showAlertRef.current(
          tr("Ralat subscription", "Subscription error"),
          err instanceof Error ? err.message : tr("Gagal muat data subscription.", "Failed to load subscriptions."),
          "error",
        )
      } finally {
        setLoading(false)
      }
      subscriptionsRefreshRef.current = loadSubscriptions
    },
    [hasLoadedSubscriptions, includeSettled, tr],
  )

  useEffect(() => {
    loadSubscriptions({ forceSkeleton: !hasLoadedSubscriptions })
  }, [loadSubscriptions])

  // When the subscription-detail iframe deletes a subscription it posts a
  // SUBSCRIPTION_DELETED message so this list closes the panel and refetches
  // instead of only navigating inside the iframe.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "SUBSCRIPTION_DELETED") {
        setDetailId(null)
        subscriptionsRefreshRef.current()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showCreateSheet } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showCreateSheet])

  useEffect(() => {
    setMounted(true)
  }, [])

  const summary = useMemo(() => {
    return subscriptions.reduce(
      (acc, c) => {
        const amt = Number(c.amount || 0)
        const days = daysUntilDueDay(Number(c.due_day_of_month || 1), c.last_payment_date, c.start_date)
        if (c.status === "active") {
          acc.totalMonthly += amt
          acc.activeCount += 1
          if (days <= 7) {
            acc.dueSoonCount += 1
            acc.dueSoonTotal += amt
          }
          if (days < acc.nearestDays) {
            acc.nearestDays = days
            acc.nearestName = c.name
            acc.nearestDueDay = Number(c.due_day_of_month || 1)
          }
        }
        return acc
      },
      {
        totalMonthly: 0,
        activeCount: 0,
        dueSoonCount: 0,
        dueSoonTotal: 0,
        nearestDays: Number.POSITIVE_INFINITY as number,
        nearestName: "" as string,
        nearestDueDay: 0 as number,
      },
    )
  }, [subscriptions])

  const sortedSubscriptions = useMemo(() => {
    return [...subscriptions].sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1
      const bActive = b.status === "active" ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      const aDays = daysUntilDueDay(Number(a.due_day_of_month || 1), a.last_payment_date, a.start_date)
      const bDays = daysUntilDueDay(Number(b.due_day_of_month || 1), b.last_payment_date, b.start_date)
      if (aDays !== bDays) return aDays - bDays
      return Number(a.due_day_of_month || 1) - Number(b.due_day_of_month || 1)
    })
  }, [subscriptions])

  const resetForm = useCallback(() => setForm(defaultForm()), [])

  const openCreateSheet = useCallback(() => {
    setEditingSubscription(null)
    resetForm()
    setShowCreateSheet(true)
  }, [resetForm])

  const openEditSheet = useCallback((c: SubscriptionItem) => {
    setEditingSubscription(c)
    setForm({
      name: c.name || "",
      amount: String(Number(c.amount || 0)),
      due_day: String(c.due_day_of_month || 1),
      category_id: c.category_id ? String(c.category_id) : "",
      notes: c.notes || "",
    })
    setShowCreateSheet(true)
  }, [])

  const closeCreateSheet = useCallback(() => {
    setShowCreateSheet(false)
    setEditingSubscription(null)
    resetForm()
  }, [resetForm])

  const { requestClose: requestCreateSheetClose } = useOverlayBackClose({
    id: "subscription-create-sheet",
    isOpen: showCreateSheet,
    onClose: closeCreateSheet,
  })
  const showCreateSheetSwipe = useSwipeDownToClose(requestCreateSheetClose)

  async function handleSaveSubscription(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(form.amount)
    const dueDay = Number(form.due_day)
    if (!form.name.trim() || amount <= 0) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), tr("Nama dan jumlah perlu diisi.", "Name and amount are required."), "error")
      return
    }
    if (dueDay < 1 || dueDay > 31) {
      showAlert(tr("Due day tak sah", "Invalid due day"), tr("Due day mesti 1-31.", "Due day must be 1-31."), "error")
      return
    }
    setSaving(true)
    try {
      const token = getAccessToken()
      const url = editingSubscription ? `/api/subscriptions/${editingSubscription.id}` : "/api/subscriptions"
      const method = editingSubscription ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: form.name.trim(),
          amount,
          due_day_of_month: dueDay,
          category_id: form.category_id ? Number(form.category_id) : null,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan subscription.", "Failed to save subscription."))
      }
      closeCreateSheet()
      await loadSubscriptions()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : tr("Gagal simpan subscription.", "Failed to save subscription."), "error")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSubscription = useCallback(
    (c: SubscriptionItem) => {
      showConfirm(tr("Padam subscription?", "Delete subscription?"), tr(`Padam ${c.name}?`, `Delete ${c.name}?`), async () => {
        setSaving(true)
        try {
          const token = getAccessToken()
          const res = await fetch(`/api/subscriptions/${c.id}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as { detail?: string } | null
            throw new Error(payload?.detail || tr("Gagal padam subscription.", "Failed to delete subscription."))
          }
          closeCreateSheet()
          await loadSubscriptions()
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : tr("Gagal padam subscription.", "Failed to delete subscription."), "error")
        } finally {
          setSaving(false)
        }
      }, "warning")
    },
    [closeCreateSheet, tr, loadSubscriptions, showAlert, showConfirm],
  )

  const dueLabel = useCallback(
    (days: number) => {
      if (days < 0) return tr(`${Math.abs(days)} hari lewat`, `${Math.abs(days)} ${Math.abs(days) === 1 ? "Day" : "Days"} overdue`)
      if (days === 0) return tr("Hari ini", "Due today")
      if (days === 1) return tr("Esok", "Tomorrow")
      return tr(`${days} hari lagi`, `in ${days} Days`)
    },
    [tr],
  )

  const renderSubscriptionRow = (c: SubscriptionItem) => {
    const isActive = c.status === "active"
    const days = daysUntilDueDay(Number(c.due_day_of_month || 1), c.last_payment_date, c.start_date)
    const tone = isActive ? urgencyTone(days) : "ok"
    const category = c.category_id ? catById.get(c.category_id) : undefined
    // The bar fills toward the due day, the same cycle bar as the detail page.
    const cycle = days <= 0 ? 1 : Math.min(1, Math.max(0, (30 - days) / 30))
    const toneColor = tone === "overdue" ? "var(--expense)" : tone === "ok" ? "var(--income)" : "var(--warning)"

    return (
      <li key={c.id}>
        <button
          type="button"
          onClick={() => openDetail(c.id)}
          className={cn(
            "flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]",
            !isActive && "opacity-60"
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-sm font-black text-[var(--text-soft)]">
            {category ? (
              <CategoryIconGlyph iconName={category.icon_name} categoryName={category.name} kind="expense" size={20} />
            ) : (
              (c.name?.[0] || "S").toUpperCase()
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-black text-[var(--text)]">{c.name}</span>
              <span className="shrink-0 whitespace-nowrap text-sm font-black tabular-nums text-[var(--text)]">
                {formatCurrency(Number(c.amount || 0))}
                <span className="text-[0.625rem] font-semibold text-[var(--muted)]">/{tr("bln", "mo")}</span>
              </span>
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-3 text-[0.6875rem] font-semibold">
              <span className="truncate text-[var(--muted)]">
                {formatDueDay(c.due_day_of_month, lang)}
                {category ? ` · ${category.name}` : ""}
              </span>
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap",
                  !isActive
                    ? "text-[var(--muted)]"
                    : tone === "overdue"
                      ? "text-rose-700 dark:text-rose-400"
                      : tone === "ok"
                        ? "text-[var(--muted)]"
                        : "text-amber-700 dark:text-amber-400"
                )}
              >
                {isActive ? dueLabel(days) : tr("Tak aktif", "Inactive")}
              </span>
            </span>
            {isActive ? (
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.round(cycle * 100)}%`, backgroundColor: toneColor }}
                />
              </span>
            ) : null}
          </span>
        </button>
      </li>
    )
  }

  // Grouped by what the user has to do: pay now, pay later, or nothing.
  const sections = (() => {
    const due: SubscriptionItem[] = []
    const later: SubscriptionItem[] = []
    const inactive: SubscriptionItem[] = []
    for (const c of sortedSubscriptions) {
      if (c.status !== "active") inactive.push(c)
      else if (daysUntilDueDay(Number(c.due_day_of_month || 1), c.last_payment_date, c.start_date) <= 7) due.push(c)
      else later.push(c)
    }
    return [
      { key: "due", label: tr("Perlu dibayar", "Due soon"), items: due },
      { key: "later", label: tr("Akan datang", "Upcoming"), items: later },
      { key: "inactive", label: tr("Tak aktif", "Inactive"), items: inactive },
    ].filter((s) => s.items.length > 0)
  })()

  const filterToggle = (
    <div className="inline-flex rounded-full bg-[var(--surface-tint-strong)] p-0.5">
      {[
        { value: false, label: tr("Aktif", "Active") },
        { value: true, label: tr("Semua", "All") },
      ].map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => setIncludeSettled(opt.value)}
          aria-pressed={includeSettled === opt.value}
          className={cn(
            "min-h-8 rounded-full px-3.5 text-xs font-bold transition",
            includeSettled === opt.value ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  // Summary on the subscription hero: the dark premium card globals.css defines
  // for this module (.subscription-hero keeps its text light in both themes),
  // with the debt page's gradient and blooms. The monthly total leads, then
  // what is due now.
  const renderSummary = (isDesktop: boolean) => {
    const hasNearest = summary.activeCount > 0 && Number.isFinite(summary.nearestDays)
    return (
      <section
        className={cn(
          "subscription-hero relative overflow-hidden rounded-2xl bg-[#1a1a1a] text-[#f5f5f5]",
          isDesktop ? "p-6" : "p-5"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
        <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

        <div className="relative">
          <p className={cn("font-bold uppercase tracking-[0.14em] text-[#a3a3a3]", isDesktop ? "text-[0.7rem]" : "text-[0.625rem]")}>
            {tr("Jumlah Bayaran Bulanan", "Total Monthly Payment")}
          </p>
          <div className="subscription-hero-amount mt-2 leading-none text-[#f5f5f5]">
            {showDataSkeleton ? (
              <AmountSkeleton className={cn("bg-white/10", isDesktop ? "h-10 w-40" : "h-8 w-32")} />
            ) : (
              <MoneyAmount
                value={Number(summary.totalMonthly || 0)}
                size={isDesktop ? "heroLg" : "hero"}
                className="text-[#f5f5f5]"
                currencyClassName="text-[#f5f5f5] opacity-55"
              />
            )}
          </div>

          {/* What needs paying this week. The hero forces light text, so the
              warning tone rides on a dot rather than on the words. */}
          <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] font-bold text-[#e5e5e5]">
            <i
              aria-hidden
              className="block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: summary.dueSoonCount > 0 ? "var(--warning)" : "var(--income)" }}
            />
            {summary.dueSoonCount > 0
              ? tr(
                  `${summary.dueSoonCount} perlu dibayar dalam 7 hari · ${formatCurrency(summary.dueSoonTotal)}`,
                  `${summary.dueSoonCount} due within 7 days · ${formatCurrency(summary.dueSoonTotal)}`
                )
              : tr("Tiada bayaran dalam 7 hari", "Nothing due in the next 7 days")}
          </p>

          <div className={cn("grid grid-cols-3", isDesktop ? "mt-6 gap-3" : "mt-5 gap-2.5")}>
            {[
              { label: tr("Aktif", "Active"), value: String(summary.activeCount), sub: null },
              { label: tr("Setahun", "Per year"), value: formatCurrencyShort(summary.totalMonthly * 12), sub: null },
              {
                label: tr("Terdekat", "Next"),
                value: hasNearest ? dueLabel(summary.nearestDays) : "—",
                sub: hasNearest ? summary.nearestName : null,
              },
            ].map((tile) => (
              <div key={tile.label} className={cn("min-w-0 bg-white/[0.06]", isDesktop ? "rounded-2xl p-4" : "rounded-[1.15rem] p-3")}>
                <p className={cn("font-bold uppercase tracking-[0.1em] text-[#a3a3a3]", isDesktop ? "text-[0.6rem]" : "text-[0.5rem]")}>
                  {tile.label}
                </p>
                <p className={cn("truncate font-black tabular-nums tracking-tight text-[#f5f5f5]", isDesktop ? "mt-3 text-lg" : "mt-2 text-sm")}>
                  {tile.value}
                </p>
                {tile.sub ? <p className="mt-0.5 truncate text-[0.625rem] font-semibold text-[#a3a3a3]">{tile.sub}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  const renderList = () => (
    <section aria-labelledby="subscription-list-heading" className="min-w-0">
      <div className="flex items-center justify-between gap-3 px-3 pb-3 md:px-1">
        <h2 id="subscription-list-heading" className="text-base font-black text-[var(--text)]">
          {tr("Langganan", "Subscriptions")}
        </h2>
        {filterToggle}
      </div>

      {showDataSkeleton ? (
        <div className="divide-y divide-[var(--divider)] overflow-hidden rounded-2xl bg-[var(--card)] shadow-[var(--shadow-card)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3.5 py-3.5">
              <AmountSkeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1">
                <AmountSkeleton className="h-4 w-32" />
                <AmountSkeleton className="mt-2 h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-2xl bg-[var(--card)] px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
            <CalendarClock size={22} aria-hidden />
          </span>
          <p className="mt-3 text-sm font-bold text-[var(--text)]">{tr("Belum ada subscription.", "No subscriptions yet.")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {tr("Simpan bil & langganan bulanan di sini.", "Track monthly bills & subscriptions here.")}
          </p>
          <button
            type="button"
            onClick={openCreateSheet}
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 text-xs font-black text-[var(--btn-primary-text)] transition active:scale-95"
          >
            <Plus size={15} />
            {tr("Tambah Subscription", "Add Subscription")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.key}>
              <p className="flex items-center justify-between px-3 pb-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)] md:px-1">
                <span>{section.label}</span>
                <span className="tabular-nums">{section.items.length}</span>
              </p>
              <ul className="divide-y divide-[var(--divider)] overflow-hidden rounded-2xl bg-[var(--card)] shadow-[var(--shadow-card)]">
                {section.items.map((c) => renderSubscriptionRow(c))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Subscription", "Subscription")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Tambah Subscription", "Add Subscription")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
        <div className="space-y-5 px-1">
          {renderSummary(false)}
          {renderList()}
        </div>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Papan Subscription", "Subscription Board")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={openCreateSheet}>
              <Plus strokeWidth={2.5} />
              {tr("Tambah Subscription", "Add Subscription")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
            <div className="lg:sticky lg:top-6">{renderSummary(true)}</div>
            {renderList()}
          </div>
        </DesktopPageBody>
      </div>

      {/* ─── Add/Edit Sheet ─── */}
      {mounted && showCreateSheet
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center"
              onClick={requestCreateSheetClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...showCreateSheetSwipe}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh] md:max-w-md"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={editingSubscription ? tr("Edit Subscription", "Edit Subscription") : tr("Tambah Subscription", "Add Subscription")}
                  onClose={requestCreateSheetClose}
                  action={
                    <button
                      type="submit"
                      form="subscription-sheet-form"
                      disabled={saving}
                      className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editingSubscription ? tr("Update", "Update") : tr("Simpan", "Save")}
                    </button>
                  }
                />

                <form id="subscription-sheet-form" className="space-y-4 px-3 py-3 pb-4 text-[var(--text)] md:px-6 md:py-6" onSubmit={handleSaveSubscription}>
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Nama Subscription", "Subscription Name")}
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder={tr("Contoh: Bil Internet", "Example: Internet Bill")}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Jumlah (RM)", "Amount (RM)")}
                      </label>
                      <input
                        inputMode="decimal"
                        value={form.amount}
                        onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                        placeholder="89.90"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Due Day", "Due Day")}
                      </label>
                      <div className="relative">
                        <input
                          inputMode="numeric"
                          value={form.due_day}
                          onChange={(e) => setForm((prev) => ({ ...prev, due_day: e.target.value }))}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 pr-12 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                          placeholder="15"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--muted)]">{lang === "BM" ? "HB" : "Day"}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Kategori", "Category")}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setCatOpen((o) => !o)}
                          className="flex w-full items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 text-left"
                        >
                          {form.category_id ? (
                            <CategoryIconGlyph
                              iconName={catById.get(Number(form.category_id))?.icon_name}
                              categoryName={catName(form.category_id)}
                              kind="expense"
                              size={16}
                            />
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                              <CreditCard size={13} />
                            </span>
                          )}
                          <span className={cn("truncate text-sm", form.category_id ? "font-bold text-[var(--text)]" : "text-[var(--muted)]")}>
                            {catName(form.category_id)}
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
                  </div>
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

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-4">
                    <p className="mb-3 text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">SUBX</p>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                      SUBX {form.name || "BIL"} {form.amount || "89.90"} {form.due_day || "15"}{lang === "BM" ? "HB" : ""}
                    </div>
                    <p className="mt-2 text-[0.58rem] text-[var(--muted)]">
                      {tr("Format: SUBX [nama] [jumlah] [hari]HB", "Format: SUBX [name] [amount] [day]")}
                    </p>
                    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                      SUBX PAY {form.name || "BIL"} {form.amount || "89.90"} WALLET
                    </div>
                    <p className="mt-2 text-[0.58rem] text-[var(--muted)]">
                      {tr("Bayar: SUBX PAY [nama] [jumlah] [wallet]", "Pay: SUBX PAY [name] [amount] [wallet]")}
                    </p>
                  </div>

                  <div className="mt-6 -mx-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-3 pb-2 pt-5 md:-mx-6 md:px-6">
                    {editingSubscription && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDeleteSubscription(editingSubscription)}
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-black text-[var(--text)] transition active:scale-[0.98] disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {detailId !== null && (
        <div className="fixed inset-0 z-[500]">
          <button type="button" aria-label={tr("Tutup butiran", "Close details")} onClick={closeDetail} className="absolute inset-0 bg-[var(--overlay)]" />
          <section className="absolute bottom-0 right-0 top-0 h-[100dvh] w-full overflow-hidden bg-[var(--page-bg)] md:w-[min(420px,80vw)] md:border-l md:border-[var(--border)] md:shadow-2xl">
            <iframe onLoad={armDetailHistory} title={tr("Butiran langganan", "Subscription details")} src={`/${sessionId}/subscription/${detailId}`} className="block h-[100dvh] w-full border-0" />
            <button type="button" aria-label={tr("Kembali", "Back")} onClick={closeDetail} className="absolute left-0 top-0 z-[600] h-16 w-16 bg-transparent md:hidden" />
            <button
              type="button"
              aria-label={tr("Tutup butiran", "Close details")}
              onClick={closeDetail}
              className="absolute right-3 top-3 z-[600] hidden h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--muted)] shadow transition hover:text-[var(--text)] md:flex"
            >
              <X size={16} />
            </button>
          </section>
        </div>
      )}

      {alertModal}
    </div>
  )
}
