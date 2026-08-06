"use client"

import { getAccessToken } from "@/lib/auth-session"
import { currentCycleKey, categoryCycleKeyForRef } from "@/lib/cycle"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Wallet,
  X,
  BadgeCheck,
  TrendingDown,
} from "lucide-react"
import { useParams } from "next/navigation"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useLang } from "@/lib/lang"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { fetchApiJson, readApiCache } from "@/lib/api-cache"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"

type BudgetItem = {
  id: number | null
  category_id: number
  category_name: string
  category_icon_name?: string | null
  month_key: string
  budget_amount: number
  used_amount: number
  remaining_amount: number
  progress_percent: number
  status: "normal" | "warning" | "over_budget" | string
}

type BudgetSummary = {
  month_key: string
  total_budget: number
  cycle_income: number
  unallocated_amount: number
  total_used: number
  remaining_amount: number
  overall_progress_percent: number
  alert_count: number
  over_budget_count: number
}

type FilterTab = "all" | "active" | "alert" | "unset"

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export default function BudgetPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang, timezone } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const currentMonthKey = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        timeZone: timezone,
      }).format(new Date())
    } catch {
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
      }).format(new Date())
    }
  }, [timezone])

  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [cycleStartDay, setCycleStartDay] = useState(1)
  const [cycleMode, setCycleMode] = useState<"day" | "category">("day")
  const [salaryDates, setSalaryDates] = useState<string[]>([])
  const currentCycleMonthKey = useMemo(
    () => {
      if (cycleMode === "category") {
        const ck = categoryCycleKeyForRef(salaryDates, new Date())
        if (ck) return ck
      }
      return cycleStartDay > 1 ? currentCycleKey(new Date(), cycleStartDay) : currentMonthKey
    },
    [cycleMode, salaryDates, cycleStartDay, currentMonthKey]
  )
  const [items, setItems] = useState<BudgetItem[]>([])
  const [summary, setSummary] = useState<BudgetSummary>({
    month_key: currentCycleMonthKey,
    total_budget: 0,
    cycle_income: 0,
    unallocated_amount: 0,
    total_used: 0,
    remaining_amount: 0,
    overall_progress_percent: 0,
    alert_count: 0,
    over_budget_count: 0,
  })
  const [budgetModalCategoryId, setBudgetModalCategoryId] = useState<number | null>(null)
  const [mobileBudgetView, setMobileBudgetView] = useState<"grid" | "list">("grid")
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [draftAmount, setDraftAmount] = useState("")
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const showDataSkeleton = useDelayedSkeleton(loading)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (typeof err === "object" && err && "message" in err && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message
    }
    return fallback
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const token = getAccessToken()
      const budgetUrl = `/api/budgets?month=${encodeURIComponent(monthKey)}`
      const summaryUrl = `/api/budgets/summary?month=${encodeURIComponent(monthKey)}`
      const cachedBudgets = readApiCache<BudgetItem[]>(budgetUrl, token)
      const cachedSummary = readApiCache<BudgetSummary>(summaryUrl, token)
      if (cachedBudgets) {
        setItems(Array.isArray(cachedBudgets) ? cachedBudgets : [])
        setLoading(false)
      }
      if (cachedSummary) {
        setSummary(cachedSummary)
        setLoading(false)
      }

      const [budgetResult, summaryResult] = await Promise.allSettled([
        fetchApiJson<BudgetItem[]>(budgetUrl, token),
        fetchApiJson<BudgetSummary>(summaryUrl, token),
      ])

      if (budgetResult.status === "fulfilled") {
        setItems(Array.isArray(budgetResult.value) ? budgetResult.value : [])
      } else if (!cachedBudgets) {
        throw new Error(tr("Gagal ambil senarai budget.", "Failed to load budget list."))
      }

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value)
      } else if (!cachedSummary) {
        setSummary((prev) => ({ ...prev, month_key: monthKey }))
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, tr("Gagal muat data budget.", "Failed to load budgets.")))
    } finally {
      setLoading(false)
    }
  }, [monthKey, tr])

  useEffect(() => {
    setMonthKey(currentCycleMonthKey)
  }, [currentCycleMonthKey])

  useEffect(() => {
    let alive = true
    const fetchMe = async () => {
      try {
        const token = getAccessToken()
        const [res, cycleRes] = await Promise.all([
          fetch("/api/users/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined }),
          fetch("/api/cycles/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined }),
        ])
        if (res.ok && alive) {
          const data = await res.json()
          setCycleStartDay(Number(data.cycle_start_day) || 1)
          setCycleMode(data.cycle_mode === "category" ? "category" : "day")
        }
        if (cycleRes.ok && alive) {
          const cycleData = await cycleRes.json()
          setSalaryDates(Array.isArray(cycleData.salary_dates) ? cycleData.salary_dates : [])
        }
      } catch {}
    }
    fetchMe()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const hidden = Boolean(budgetModalCategoryId)
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [budgetModalCategoryId])

  const openBudgetModal = (categoryId?: number) => {
    const targetItem =
      items.find((item) => item.category_id === categoryId) ||
      items.find((item) => item.budget_amount > 0) ||
      items[0]
    if (!targetItem) return
    setBudgetModalCategoryId(targetItem.category_id)
    setDraftAmount(targetItem.budget_amount > 0 ? targetItem.budget_amount.toFixed(2) : "")
    setError("")
  }

  const closeBudgetModal = useCallback(() => {
    setBudgetModalCategoryId(null)
    setDraftAmount("")
  }, [])

  const activeModalItem = useMemo(
    () => items.find((item) => item.category_id === budgetModalCategoryId) ?? null,
    [budgetModalCategoryId, items],
  )

  const { requestClose: requestBudgetModalClose } = useOverlayBackClose({
    id: "budget-modal",
    isOpen: Boolean(activeModalItem),
    onClose: closeBudgetModal,
  })
  const budgetSheetSwipe = useSwipeDownToClose(requestBudgetModalClose)

  const saveBudget = async () => {
    if (!activeModalItem) return
    const amount = Number(draftAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(tr("Masukkan jumlah sah lebih daripada 0.", "Enter a valid amount greater than 0."))
      return
    }
    setSaving(true)
    setError("")
    try {
      const token = getAccessToken()
      const payload = {
        category_id: activeModalItem.category_id,
        month_key: monthKey,
        budget_amount: amount,
      }
      const endpoint = activeModalItem.id ? `/api/budgets/${activeModalItem.id}` : "/api/budgets"
      const method = activeModalItem.id ? "PATCH" : "POST"
      const res = await fetch(endpoint, {
        credentials: "include",
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || tr("Gagal simpan budget.", "Failed to save budget."))
      }
      requestBudgetModalClose()
      await loadData()
      showAlert(tr("Berjaya Disimpan", "Saved"), tr("Bajet berjaya dikemaskini.", "Budget updated successfully."), "success")
    } catch (err: unknown) {
      const message = getErrorMessage(err, tr("Gagal simpan budget.", "Failed to save budget."))
      setError(message)
      showAlert(tr("Simpan Gagal", "Save Failed"), message, "error")
    } finally {
      setSaving(false)
    }
  }

  const handleResetBudget = () => {
    if (!activeModalItem?.id) return
    showConfirm(
      tr("Reset Bajet?", "Reset Budget?"),
      tr("Adakah anda pasti mahu reset bajet ini?", "Are you sure you want to reset this budget?"),
      async () => {
        setSaving(true)
        setError("")
        try {
          const token = getAccessToken()
          const res = await fetch(`/api/budgets/${activeModalItem.id}`, {
            credentials: "include",
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data?.detail || tr("Gagal reset bajet.", "Failed to reset budget."))
          }
          requestBudgetModalClose()
          await loadData()
          showAlert(tr("Reset Berjaya", "Reset Done"), tr("Bajet telah direset.", "Budget has been reset."), "success")
        } catch (err: unknown) {
          const message = getErrorMessage(err, tr("Gagal reset bajet.", "Failed to reset budget."))
          setError(message)
          showAlert(tr("Reset Gagal", "Reset Failed"), message, "error")
        } finally {
          setSaving(false)
        }
      },
    )
  }

  const formatCurrency = (value: number) =>
    `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatCurrencyCompact = (value: number) =>
    `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const monthMeta = useMemo(() => {
    const [yearText, monthText] = monthKey.split("-")
    const year = Number(yearText)
    const month = Number(monthText)
    const totalDays =
      Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12
        ? new Date(year, month, 0).getDate()
        : 30

    let label = monthKey
    try {
      label = new Intl.DateTimeFormat(lang === "EN" ? "en-MY" : "ms-MY", {
        month: "long",
        year: "numeric",
        timeZone: timezone,
      }).format(new Date(Date.UTC(year, month - 1, 1)))
    } catch {
      label = monthKey
    }

    let todayYear = year
    let todayMonth = month
    let todayDay = 1
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: timezone,
      }).formatToParts(new Date())
      todayYear = Number(parts.find((part) => part.type === "year")?.value || yearText)
      todayMonth = Number(parts.find((part) => part.type === "month")?.value || monthText)
      todayDay = Number(parts.find((part) => part.type === "day")?.value || "1")
    } catch {
      const now = new Date()
      todayYear = now.getUTCFullYear()
      todayMonth = now.getUTCMonth() + 1
      todayDay = now.getUTCDate()
    }

    const selectedValue = year * 100 + month
    const currentValue = todayYear * 100 + todayMonth
    const isCurrentMonth = selectedValue === currentValue

    let daysLeft = 0
    if (selectedValue > currentValue) daysLeft = totalDays
    else if (isCurrentMonth) daysLeft = Math.max(totalDays - todayDay, 0)

    return { label, totalDays, daysLeft, isCurrentMonth }
  }, [lang, monthKey, timezone])

  const counts = useMemo(() => {
    let active = 0
    let alert = 0
    let unset = 0
    for (const item of items) {
      if (item.budget_amount <= 0) unset++
      else {
        active++
        if (item.status === "over_budget" || item.status === "warning") alert++
      }
    }
    return { active, alert, unset, all: items.length }
  }, [items])

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const statusRank = (s: string, hasBudget: boolean) => {
        if (!hasBudget) return 3
        if (s === "over_budget") return 0
        if (s === "warning") return 1
        return 2
      }
      const aHas = a.budget_amount > 0
      const bHas = b.budget_amount > 0
      const rankDiff = statusRank(a.status, aHas) - statusRank(b.status, bHas)
      if (rankDiff !== 0) return rankDiff
      const usageDiff = b.used_amount - a.used_amount
      if (usageDiff !== 0) return usageDiff
      return a.category_name.localeCompare(b.category_name)
    })
  }, [items])

  const filteredItems = useMemo(() => {
    if (filterTab === "active") return sortedItems.filter((i) => i.budget_amount > 0)
    if (filterTab === "alert")
      return sortedItems.filter((i) => i.budget_amount > 0 && (i.status === "over_budget" || i.status === "warning"))
    if (filterTab === "unset") return sortedItems.filter((i) => i.budget_amount <= 0)
    return sortedItems
  }, [filterTab, sortedItems])

  const summaryStatus =
    summary.remaining_amount < 0 ? "over_budget" : summary.overall_progress_percent >= 80 ? "warning" : "normal"

  const monthPickerLabel =
    monthKey === currentCycleMonthKey ? tr("Bulan Ini", "This Month") : monthMeta.label

  const statusMeta = (item: BudgetItem) => {
    const hasBudget = item.budget_amount > 0
    if (!hasBudget) {
      return {
        hasBudget: false as const,
        tone: "muted" as const,
        label: tr("Kosong", "Unset"),
        bar: "bg-[var(--muted)]",
        soft: "bg-[var(--surface-tint)] text-[var(--muted)]",
        icon: "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]",
      }
    }
    if (item.status === "over_budget") {
      return {
        hasBudget: true as const,
        tone: "rose" as const,
        label: tr("Lebih", "Over"),
        bar: "bg-rose-500",
        soft: "bg-rose-500/15 text-rose-500",
        icon: "border-rose-500/20 bg-rose-500/10 text-rose-500",
      }
    }
    if (item.status === "warning") {
      return {
        hasBudget: true as const,
        tone: "amber" as const,
        label: tr("Hampir", "Near"),
        bar: "bg-amber-500",
        soft: "bg-amber-500/15 text-amber-500",
        icon: "border-amber-500/20 bg-amber-500/10 text-amber-500",
      }
    }
    return {
      hasBudget: true as const,
      tone: "emerald" as const,
      label: tr("Baik", "Good"),
      bar: "bg-[var(--btn-primary-bg)]",
      soft: "bg-[var(--btn-primary-bg)]/15 text-emerald-500",
      icon: "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10 text-emerald-500",
    }
  }

  const filterToggle = (
    <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/40 p-0.5">
      {(
        [
          { key: "all" as const, label: tr("Semua", "All"), count: counts.all },
          { key: "active" as const, label: tr("Aktif", "Active"), count: counts.active },
          { key: "alert" as const, label: tr("Amaran", "Alert"), count: counts.alert },
          { key: "unset" as const, label: tr("Kosong", "Unset"), count: counts.unset },
        ] as const
      ).map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setFilterTab(chip.key)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.1em] transition",
            filterTab === chip.key ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
          )}
        >
          {chip.label}
          <span className="ml-1 opacity-70">({chip.count})</span>
        </button>
      ))}
    </div>
  )

  const viewToggle = (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/40 p-0.5">
      {(
        [
          { key: "grid" as const, icon: LayoutGrid, label: "Grid" },
          { key: "list" as const, icon: List, label: "List" },
        ] as const
      ).map((view) => {
        const Icon = view.icon
        const active = mobileBudgetView === view.key
        return (
          <button
            key={view.key}
            type="button"
            onClick={() => setMobileBudgetView(view.key)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition",
              active ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
            )}
            aria-label={view.label}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )

  const monthInputRef = useRef<HTMLInputElement>(null)
  const monthInputCompactRef = useRef<HTMLInputElement>(null)

  const openNativeMonthPicker = (compact = false) => {
    const el = compact ? monthInputCompactRef.current : monthInputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === "function") {
        void el.showPicker()
        return
      }
    } catch {
      // showPicker may throw outside a trusted gesture / unsupported context
    }
    el.focus()
    el.click()
  }

  const monthPicker = (compact = false) =>
    compact ? (
      <div className="relative">
        <button
          type="button"
          onClick={() => openNativeMonthPicker(true)}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--btn-primary-bg)] text-white shadow-sm shadow-black/10 [&_svg]:h-4 [&_svg]:w-4"
          aria-label={tr("Pilih bulan", "Select month")}
        >
          <Calendar strokeWidth={2.5} />
        </button>
        <input
          ref={monthInputCompactRef}
          type="month"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute left-0 top-full h-px w-px opacity-0"
        />
      </div>
    ) : (
      <div className="relative z-[60]">
        <DesktopPageAction type="button" onClick={() => openNativeMonthPicker(false)}>
          <Calendar strokeWidth={2.5} />
          {monthPickerLabel}
          <ChevronDown strokeWidth={2.5} />
        </DesktopPageAction>
        <input
          ref={monthInputRef}
          type="month"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute left-0 top-full h-px w-px opacity-0"
        />
      </div>
    )

  const renderCard = (item: BudgetItem, compact = false) => {
    const meta = statusMeta(item)
    const progressWidth = meta.hasBudget ? clamp(item.progress_percent, 4, 100) : 0

    return (
      <button
        key={item.category_id}
        type="button"
        onClick={() => openBudgetModal(item.category_id)}
        className={cn(
          "group w-full overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] text-left transition active:scale-[0.985]",
          compact && "hover:border-[color-mix(in_srgb,var(--accent2)_30%,var(--border))]",
          compact ? "p-4" : "p-3.5",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-2xl border",
              compact ? "h-12 w-12" : "h-11 w-11",
              meta.icon,
            )}
          >
            <CategoryIconGlyph
              iconName={item.category_icon_name}
              categoryName={item.category_name}
              kind="expense"
              size={compact ? 20 : 18}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn("truncate font-black leading-tight text-[var(--text)]", compact ? "text-base" : "text-sm")}>
                  {item.category_name}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                  {meta.hasBudget
                    ? `${item.progress_percent.toFixed(0)}% ${tr("diguna", "used")}`
                    : tr("Belum set bajet", "No budget set")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]", meta.soft)}>
                  {meta.label}
                </span>
                {!compact && <ChevronRight size={14} className="text-[var(--muted)]" />}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {meta.hasBudget ? (
                <>
                  <span className="inline-flex items-center rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[var(--text)]">
                    <MoneyAmount value={item.budget_amount} digits={0} size="xs" className="text-[var(--text)]" />
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[var(--muted)]">
                    <MoneyAmount value={item.used_amount} digits={0} size="xs" className="text-[var(--muted)]" currencyClassName="text-[var(--muted)] opacity-55" />
                    <span className="text-[10px] font-semibold">{tr("belanja", "spent")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[var(--text)]">
                    <span className="text-[10px] font-semibold text-[var(--muted)]">
                      {item.remaining_amount < 0 ? tr("Lebih", "Over") : tr("Baki", "Left")}
                    </span>
                    <MoneyAmount value={Math.abs(item.remaining_amount)} digits={0} size="xs" className="text-[var(--text)]" />
                  </span>
                </>
              ) : (
                <span className="text-[10px] font-semibold text-[var(--muted)]">
                  {tr("Tekan untuk set", "Tap to set")}
                </span>
              )}
            </div>

            {meta.hasBudget && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                  <div className={cn("h-full rounded-full transition-all", meta.bar)} style={{ width: `${progressWidth}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </button>
    )
  }

  const renderGridCard = (item: BudgetItem) => {
    const meta = statusMeta(item)
    const progressWidth = meta.hasBudget ? clamp(item.progress_percent, 6, 100) : 0
    return (
      <button
        key={item.category_id}
        type="button"
        onClick={() => openBudgetModal(item.category_id)}
        className="relative overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-3.5 text-left transition active:scale-[0.98]"
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-0 h-1",
            meta.tone === "rose" ? "bg-rose-500" : meta.tone === "amber" ? "bg-amber-500" : meta.tone === "emerald" ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--border)]",
          )}
        />
        <div className="flex items-start gap-2.5">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", meta.icon)}>
            <CategoryIconGlyph iconName={item.category_icon_name} categoryName={item.category_name} kind="expense" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-black leading-tight text-[var(--text)]">{item.category_name}</p>
            <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase", meta.soft)}>
              {meta.label}
            </span>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
            <span className="text-[var(--muted)]">{tr("Bajet", "Budget")}</span>
            <span className="truncate text-[var(--text)]">
              {showDataSkeleton && meta.hasBudget ? (
                <AmountSkeleton className="h-3 w-14" />
              ) : meta.hasBudget ? (
                <MoneyAmount value={item.budget_amount} digits={0} size="xs" className="text-[var(--text)]" />
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
            <span className="text-[var(--muted)]">{tr("Belanja", "Spent")}</span>
            <span className="truncate text-[var(--text)]">
              {showDataSkeleton && meta.hasBudget ? (
                <AmountSkeleton className="h-3 w-14" />
              ) : meta.hasBudget ? (
                <MoneyAmount value={item.used_amount} digits={0} size="xs" className="text-[var(--text)]" />
              ) : (
                "—"
              )}
            </span>
          </div>
          {meta.hasBudget ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                <div className={cn("h-full rounded-full", meta.bar)} style={{ width: `${progressWidth}%` }} />
              </div>
              <p className="truncate text-[10px] font-semibold text-[var(--muted)]">
                {item.remaining_amount >= 0 ? tr("Baki", "Left") : tr("Lebih", "Over")}{" "}
                <MoneyAmount value={Math.abs(item.remaining_amount)} digits={0} size="xs" className="text-[var(--text)]" />
              </p>
            </>
          ) : (
            <p className="text-[10px] font-semibold text-[var(--muted)]">{tr("Tekan untuk set", "Tap to set")}</p>
          )}
        </div>
      </button>
    )
  }

  const heroBlock = (desktop = false) => (
    <div
      className={cn(
        "budget-hero relative overflow-hidden border border-[var(--border)] bg-[#1a1a1a] text-[#f5f5f5]",
        desktop ? "rounded-[1.75rem] p-6" : "rounded-[2rem] p-5",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

      <div className={cn("relative", desktop && "flex items-center gap-5")}>
        <div className={cn(desktop && "min-w-[10rem] shrink-0")}>
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn(
              "font-bold uppercase tracking-[0.14em] text-[#a3a3a3]",
              desktop ? "text-[0.7rem]" : "text-[0.625rem]",
            )}>
              {tr("Baki Bajet", "Budget Remaining")}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]",
                summaryStatus === "over_budget"
                  ? "bg-rose-500/25 text-[#fecdd3]"
                  : summaryStatus === "warning"
                    ? "bg-amber-500/25 text-[#fde68a]"
                    : "bg-[var(--btn-primary-bg)]/20 text-[#e5e5e5]",
              )}
            >
              {summaryStatus === "over_budget"
                ? tr("Lebih", "Over")
                : summaryStatus === "warning"
                  ? tr("Hampir", "Near")
                  : tr("Sihat", "Healthy")}
            </span>
          </div>
          <p className="budget-hero-amount mt-2 leading-none text-[#ffffff]">
            {showDataSkeleton ? (
              <AmountSkeleton className={cn("bg-white/10", desktop ? "h-10 w-40" : "h-7 w-32")} />
            ) : (
              <MoneyAmount
                value={Math.abs(summary.remaining_amount)}
                size={desktop ? "heroLg" : "hero"}
                prefix={summary.remaining_amount < 0 ? "- " : ""}
                className="text-[#ffffff]"
                currencyClassName="text-[#ffffff] opacity-55"
              />
            )}
          </p>
          <div className="mt-4 max-w-md">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-[#a3a3a3]">
              <span>{tr("Penggunaan bulanan", "Monthly usage")}</span>
              <span className="tabular-nums text-[#e5e5e5]">{summary.overall_progress_percent.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  summaryStatus === "over_budget"
                    ? "bg-gradient-to-r from-rose-400 to-rose-500"
                    : summaryStatus === "warning"
                      ? "bg-gradient-to-r from-amber-400 to-orange-500"
                      : "bg-gradient-to-r from-emerald-400 to-teal-500",
                )}
                style={{ width: `${clamp(summary.overall_progress_percent, 2, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className={cn(
          "grid grid-cols-2",
          desktop ? "min-w-0 flex-1 gap-3 lg:grid-cols-4" : "mt-5 gap-2.5",
        )}>
          {[
            {
              label: tr("Pendapatan", "Income"),
              value: summary.cycle_income,
              icon: <Wallet size={desktop ? 16 : 12} className="text-emerald-400" />,
              color: "text-emerald-300",
              isMoney: true,
            },
            {
              label: summary.unallocated_amount < 0 ? tr("Terlebih Agih", "Overallocated") : tr("Belum Diagih", "Unallocated"),
              value: Math.abs(summary.unallocated_amount),
              icon: summary.unallocated_amount < 0 ? <AlertTriangle size={desktop ? 16 : 12} className="text-rose-400" /> : <BadgeCheck size={desktop ? 16 : 12} className="text-[#b3b3b3]" />,
              color: summary.unallocated_amount < 0 ? "text-[#fecdd3]" : "text-[#e5e5e5]",
              isMoney: true,
            },
            {
              label: tr("Bajet", "Budget"),
              value: summary.total_budget,
              icon: <Wallet size={desktop ? 16 : 12} className="text-[#b3b3b3]" />,
              color: "text-[#e5e5e5]",
              isMoney: true,
            },
            {
              label: tr("Belanja", "Spent"),
              value: summary.total_used,
              icon: <TrendingDown size={desktop ? 16 : 12} className="text-[#fda4af]" />,
              color: "text-[#fecdd3]",
              isMoney: true,
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
                  "font-bold uppercase text-[#a3a3a3]",
                  desktop ? "text-[0.6rem] tracking-[0.12em]" : "text-[0.5rem] tracking-[0.1em]",
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

  const emptyState = (
    <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-12 text-center">
      <Wallet size={36} className="mx-auto text-[var(--muted)]/40" />
      <p className="mt-3 text-sm font-bold text-[var(--muted)]">
        {items.length === 0
          ? tr("Belum ada kategori.", "No categories yet.")
          : tr("Tiada item dalam penapis ini.", "No items in this filter.")}
      </p>
      {items.length === 0 && (
        <p className="mt-1 text-[11px] font-medium text-[var(--muted)]/80">
          {tr("Tambah kategori perbelanjaan dulu.", "Add expense categories first.")}
        </p>
      )}
    </div>
  )

  const modalProgress = activeModalItem ? clamp(activeModalItem.progress_percent, 0, 100) : 0
  const modalBarClass =
    activeModalItem?.status === "over_budget"
      ? "bg-rose-500"
      : activeModalItem?.status === "warning"
        ? "bg-amber-500"
        : "bg-[var(--btn-primary-bg)]"
  const modalStatusLabel =
    activeModalItem?.status === "over_budget"
      ? tr("Lebih", "Over")
      : activeModalItem?.status === "warning"
        ? tr("Hampir had", "Near limit")
        : tr("Selamat", "Healthy")

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Bajet", "Budget")}
          fallbackHref={`/${sessionId}`}
          action={monthPicker(true)}
        />
        <p className="px-1 text-center text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
          {monthPickerLabel}
        </p>

        <section className="px-1">{heroBlock(false)}</section>

        <div className="flex items-center justify-between gap-2 px-1">
          {filterToggle}
          {viewToggle}
        </div>

        <section className="px-1">
          {showDataSkeleton ? (
            mobileBudgetView === "grid" ? (
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 animate-pulse rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)]" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)]" />
                ))}
              </div>
            )
          ) : filteredItems.length === 0 ? (
            emptyState
          ) : mobileBudgetView === "grid" ? (
            <div className="grid grid-cols-2 gap-2.5">{filteredItems.map(renderGridCard)}</div>
          ) : (
            <div className="space-y-3">{filteredItems.map((item) => renderCard(item, false))}</div>
          )}
        </section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Papan Bajet", "Budget Board")}
          homeHref={`/${sessionId}`}
          actions={monthPicker(false)}
        />

        <DesktopPageBody className="space-y-5">
        {heroBlock(true)}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {filterToggle}
          {viewToggle}
        </div>

        {showDataSkeleton ? (
          mobileBudgetView === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)]" />
              ))}
            </div>
          )
        ) : filteredItems.length === 0 ? (
          emptyState
        ) : mobileBudgetView === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredItems.map(renderGridCard)}</div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => renderCard(item, true))}
          </div>
        )}
        </DesktopPageBody>
      </div>

      {/* ─── Budget Sheet ─── */}
      {mounted
        ? createPortal(
            budgetModalCategoryId && activeModalItem ? (
              <div
                className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center"
                onClick={requestBudgetModalClose}
                onTouchMove={(e) => e.preventDefault()}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  data-swipe-sheet
                  data-prevent-pull-refresh="true"
                  {...budgetSheetSwipe}
                  style={{ transform: "translateZ(0)" }}
                  className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh] md:max-w-md"
                >
                  <AppSheetHeader
                    title={activeModalItem.category_name}
                    eyebrow={tr("Tetapan Bajet", "Budget Setting")}
                    onClose={requestBudgetModalClose}
                    icon={
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]">
                        <CategoryIconGlyph
                          iconName={activeModalItem.category_icon_name}
                          categoryName={activeModalItem.category_name}
                          size={20}
                          kind="expense"
                        />
                      </div>
                    }
                  />

                  <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Jumlah Bajet", "Budget Amount")}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-[var(--muted)]">
                          RM
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={draftAmount}
                          onChange={(e) => setDraftAmount(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-4 pl-14 pr-4 text-2xl font-black text-[var(--text)] outline-none placeholder:text-[var(--muted)]/30"
                        />
                      </div>
                    </div>

                    {activeModalItem.budget_amount > 0 && (
                      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                            {tr("Status Semasa", "Current Status")}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
                              activeModalItem.status === "over_budget"
                                ? "bg-rose-500/15 text-rose-500"
                                : activeModalItem.status === "warning"
                                  ? "bg-amber-500/15 text-amber-500"
                                  : "bg-[var(--btn-primary-bg)]/15 text-emerald-500",
                            )}
                          >
                            {modalStatusLabel}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                          <div
                            className={cn("h-full rounded-full transition-all", modalBarClass)}
                            style={{ width: `${modalProgress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-[var(--muted)]">
                            <MoneyAmount value={activeModalItem.used_amount} digits={0} size="xs" className="text-[var(--muted)]" />{" "}
                            {tr("belanja", "spent")}
                          </span>
                          <span className="text-[var(--text)]">{activeModalItem.progress_percent.toFixed(0)}%</span>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-medium text-rose-500">
                        <AlertTriangle size={16} className="shrink-0" />
                        {error}
                      </div>
                    )}

                    <div className="-mx-4 flex items-center gap-2 border-t border-[var(--border)] px-4 pt-4 md:-mx-6 md:px-6">
                      <button
                        type="button"
                        onClick={saveBudget}
                        disabled={saving || !draftAmount}
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={20} className="animate-spin" /> : tr("Simpan", "Save")}
                      </button>
                      {activeModalItem.id && (
                        <button
                          type="button"
                          onClick={handleResetBudget}
                          disabled={saving}
                          className="h-12 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 text-sm font-black text-rose-500 transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {tr("Reset", "Reset")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null,
            document.body,
          )
        : null}

      {alertModal}
    </div>
  )
}
