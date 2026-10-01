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
  Copy,
  LayoutGrid,
  List,
  Loader2,
  Wallet,
  X,
} from "lucide-react"
import { useParams } from "next/navigation"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useLang } from "@/lib/lang"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { cn } from "@/lib/utils"
import { HERO_CHIP_LINE, HERO_MUTED, HERO_TEXT, ModenHero, ModenHeroPill, ModenHeroTile } from "@/components/ui/ModenHero"
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
  const previousMonthKey = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number)
    if (!Number.isFinite(y) || !Number.isFinite(m)) return ""
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }, [monthKey])
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
  const [copying, setCopying] = useState(false)
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

  const handleResetBudget = () => {    if (!activeModalItem?.id) return
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
        soft: "bg-[var(--home-line)] text-[var(--muted)]",
        icon: "border border-[var(--home-line)] text-[var(--muted)]",
      }
    }
    if (item.status === "over_budget") {
      return {
        hasBudget: true as const,
        tone: "rose" as const,
        label: tr("Lebih", "Over"),
        bar: "bg-rose-500",
        soft: "bg-rose-500/15 text-rose-500",
        icon: "bg-rose-500/12 text-rose-500",
      }
    }
    if (item.status === "warning") {
      return {
        hasBudget: true as const,
        tone: "amber" as const,
        label: tr("Hampir", "Near"),
        bar: "bg-amber-500",
        soft: "bg-amber-500/15 text-amber-500",
        icon: "bg-amber-500/12 text-amber-500",
      }
    }
    return {
      hasBudget: true as const,
      tone: "emerald" as const,
      label: tr("Baik", "Good"),
      bar: "bg-[#0550B8]",
      soft: "bg-[#0550B8]/15 text-[#2f8cf9]",
      icon: "bg-[#0550B8]/12 text-[#2f8cf9]",
    }
  }

  const copyFromPreviousMonth = async () => {
    if (!previousMonthKey) return
    setCopying(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/budgets/copy", {
        credentials: "include",
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from_month: previousMonthKey, to_month: monthKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.detail || tr("Gagal salin bajet.", "Failed to copy budget."))
      }
      await loadData()
      const copied = Number(data?.copied || 0)
      const skipped = Number(data?.skipped || 0)
      if (copied === 0 && skipped === 0) {
        showAlert(
          tr("Tiada Bajet", "Nothing to Copy"),
          tr(
            `Bulan ${previousMonthKey} tiada bajet untuk disalin.`,
            `No budgets found in ${previousMonthKey} to copy.`,
          ),
          "info",
        )
      } else {
        showAlert(
          tr("Berjaya Disalin", "Copied"),
          skipped > 0
            ? tr(
                `${copied} bajet disalin. ${skipped} kategori sudah ada bajet dan tidak diubah.`,
                `${copied} budgets copied. ${skipped} categories already had a budget and were left alone.`,
              )
            : tr(`${copied} bajet disalin.`, `${copied} budgets copied.`),
          "success",
        )
      }
    } catch (err: unknown) {
      showAlert(
        tr("Salin Gagal", "Copy Failed"),
        getErrorMessage(err, tr("Gagal salin bajet.", "Failed to copy budget.")),
        "error",
      )
    } finally {
      setCopying(false)
    }
  }


  const copyBudgetButton = counts.unset > 0 && previousMonthKey && (
    <button
      type="button"
      onClick={copyFromPreviousMonth}
      disabled={copying}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--home-line)] bg-[var(--home-card)] px-3.5 text-xs font-semibold text-[var(--text)] transition active:scale-[0.97] disabled:opacity-50"
    >
      <Copy size={14} strokeWidth={2} />
      {copying ? tr("Menyalin…", "Copying…") : tr("Salin bulan lepas", "Copy last month")}
    </button>
  )

  const filterToggle = (
    <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
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
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition active:scale-[0.97]",
            filterTab === chip.key
              ? "bg-[var(--text)] text-[var(--bg)]"
              : "border border-[var(--home-line)] bg-[var(--home-card)] text-[var(--text)]",
          )}
        >
          {chip.label}
          <span className="tabular-nums opacity-60">{chip.count}</span>
        </button>
      ))}
    </div>
  )

  const viewToggle = (
    <div className="inline-flex rounded-full border border-[var(--home-line)] bg-[var(--home-card)] p-0.5">
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
            aria-pressed={active}
          >
            <Icon size={15} />
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
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[var(--home-line)] bg-[var(--home-card)] px-3.5 text-xs font-semibold text-[var(--text)] transition active:scale-95"
          aria-label={tr("Pilih bulan", "Select month")}
        >
          <Calendar size={15} strokeWidth={2} />
          {monthPickerLabel}
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

  // One category, as a row: icon, name and status, then spent of budget with a
  // bar, then what is left.
  const renderCard = (item: BudgetItem, compact = false) => {
    const meta = statusMeta(item)
    const progressWidth = meta.hasBudget ? clamp(item.progress_percent, 4, 100) : 0

    return (
      <button
        key={item.category_id}
        type="button"
        onClick={() => openBudgetModal(item.category_id)}
        className={cn(
          "w-full rounded-[1.25rem] border border-[var(--home-line)] bg-[var(--home-card)] text-left transition active:scale-[0.985]",
          compact ? "p-4" : "p-3.5",
        )}
      >
        <div className="flex items-center gap-3">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", meta.icon)}>
            <CategoryIconGlyph iconName={item.category_icon_name} categoryName={item.category_name} kind="expense" size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[0.9375rem] font-bold text-[var(--text)]">{item.category_name}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", meta.soft)}>{meta.label}</span>
            </span>
            <span className="mt-0.5 block text-xs font-medium text-[var(--muted)]">
              {meta.hasBudget ? (
                <>
                  <MoneyAmount value={item.used_amount} digits={0} size="xs" className="!text-xs font-semibold text-[var(--text)]" currencyClassName="!text-[0.625rem]" />{" "}
                  {tr("daripada", "of")}{" "}
                  <MoneyAmount value={item.budget_amount} digits={0} size="xs" className="!text-xs text-[var(--muted)]" currencyClassName="!text-[0.625rem]" />
                </>
              ) : (
                tr("Belum set bajet · tekan untuk set", "No budget yet · tap to set")
              )}
            </span>
          </span>
        </div>

        {meta.hasBudget ? (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--home-line)]">
              <div className={cn("h-full rounded-full transition-all", meta.bar)} style={{ width: `${progressWidth}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs font-medium text-[var(--muted)]">
              <span className="tabular-nums">{item.progress_percent.toFixed(0)}% {tr("diguna", "used")}</span>
              <span>
                {item.remaining_amount < 0 ? tr("Lebih", "Over") : tr("Baki", "Left")}{" "}
                <MoneyAmount value={Math.abs(item.remaining_amount)} digits={0} size="xs" className="!text-xs font-semibold text-[var(--text)]" currencyClassName="!text-[0.625rem]" />
              </span>
            </div>
          </div>
        ) : null}
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
        className="flex flex-col rounded-[1.25rem] border border-[var(--home-line)] bg-[var(--home-card)] p-3.5 text-left transition active:scale-[0.98]"
      >
        <span className="flex items-start justify-between gap-2">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", meta.icon)}>
            <CategoryIconGlyph iconName={item.category_icon_name} categoryName={item.category_name} kind="expense" size={18} />
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[0.625rem] font-semibold", meta.soft)}>{meta.label}</span>
        </span>
        <span className="mt-2.5 line-clamp-2 text-[0.8125rem] font-bold leading-tight text-[var(--text)]">{item.category_name}</span>
        {meta.hasBudget ? (
          <>
            <span className="mt-2 block truncate text-[var(--text)]">
              {showDataSkeleton ? (
                <AmountSkeleton className="h-4 w-16" />
              ) : (
                <MoneyAmount value={Math.abs(item.remaining_amount)} digits={0} size="xs" prefix={item.remaining_amount < 0 ? "-" : ""} className="!text-[1.0625rem] font-bold text-[var(--text)]" currencyClassName="!text-[0.6875rem]" />
              )}
            </span>
            <span className="text-[0.6875rem] font-medium text-[var(--muted)]">
              {item.remaining_amount < 0 ? tr("lebih bajet", "over budget") : tr("baki", "left")}
            </span>
            <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-[var(--home-line)]">
              <span className={cn("block h-full rounded-full", meta.bar)} style={{ width: `${progressWidth}%` }} />
            </span>
          </>
        ) : (
          <span className="mt-2 text-[0.6875rem] font-medium text-[var(--muted)]">{tr("Tekan untuk set", "Tap to set")}</span>
        )}
      </button>
    )
  }

  // The summary: the Moden hero card, as on the home.
  const heroBlock = (desktop = false) => {
    const money = (value: number) => `RM ${Number(value || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`
    return (
      <ModenHero
        className={cn(desktop ? "mt-2" : "mt-1")}
        label={
          <>
            {tr("Baki bajet", "Budget left")} · {monthMeta.label}
            <ModenHeroPill dot={summaryStatus === "over_budget" ? "#FF7A7A" : summaryStatus === "warning" ? "#FDBA74" : "#4ADE80"}>
              {summaryStatus === "over_budget" ? tr("Lebih", "Over") : summaryStatus === "warning" ? tr("Hampir", "Near") : tr("Sihat", "Healthy")}
            </ModenHeroPill>
          </>
        }
        currency={summary.remaining_amount < 0 ? "-RM" : "RM"}
        amount={
          showDataSkeleton ? (
            <AmountSkeleton className="h-11 w-44" />
          ) : (
            Math.abs(summary.remaining_amount).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          )
        }
        amountSize={desktop ? "3.25rem" : "clamp(2.5rem, 11vw, 3rem)"}
        stats={[
          { key: "in", tone: "in", label: tr("Pendapatan", "Income"), value: showDataSkeleton ? <AmountSkeleton className="h-3 w-16" /> : money(summary.cycle_income) },
          { key: "out", tone: "out", label: tr("Belanja", "Spent"), value: showDataSkeleton ? <AmountSkeleton className="h-3 w-16" /> : money(summary.total_used) },
        ]}
      >
        <div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: HERO_CHIP_LINE }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${clamp(summary.overall_progress_percent, 2, 100)}%`,
                background: summaryStatus === "over_budget" ? "var(--expense)" : summaryStatus === "warning" ? "#f59e0b" : "var(--btn-primary-bg)",
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs font-medium" style={{ color: HERO_MUTED }}>
            <span>{tr("Penggunaan bulan ini", "Used this month")}</span>
            <span className="tabular-nums font-semibold" style={{ color: HERO_TEXT }}>{summary.overall_progress_percent.toFixed(0)}%</span>
          </div>
        </div>
        <div className={cn("grid grid-cols-2 gap-2", desktop && "max-w-lg")}>
          <ModenHeroTile label={tr("Bajet", "Budget")} value={showDataSkeleton ? <AmountSkeleton className="h-4 w-16" /> : money(summary.total_budget)} />
          <ModenHeroTile
            label={summary.unallocated_amount < 0 ? tr("Terlebih agih", "Overallocated") : tr("Belum diagih", "Unallocated")}
            value={showDataSkeleton ? <AmountSkeleton className="h-4 w-16" /> : money(Math.abs(summary.unallocated_amount))}
          />
        </div>
      </ModenHero>
    )
  }

  const emptyState = (
    <div className="flex flex-col items-center rounded-[1.5rem] border border-[var(--home-line)] bg-[var(--home-card)] px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] bg-[#0550B8]/12 text-[#2f8cf9]">
        <Wallet size={24} />
      </span>
      <p className="mt-4 text-[0.9375rem] font-bold text-[var(--text)]">
        {items.length === 0 ? tr("Belum ada kategori", "No categories yet") : tr("Tiada item dalam penapis ini", "Nothing in this filter")}
      </p>
      {items.length === 0 && (
        <p className="mt-1 text-xs font-medium text-[var(--muted)]">{tr("Tambah kategori perbelanjaan dulu.", "Add expense categories first.")}</p>
      )}
    </div>
  )

  const modalProgress = activeModalItem ? clamp(activeModalItem.progress_percent, 0, 100) : 0
  const modalBarClass =
    activeModalItem?.status === "over_budget"
      ? "bg-rose-500"
      : activeModalItem?.status === "warning"
        ? "bg-amber-500"
        : "bg-[#0550B8]"
  const modalStatusLabel =
    activeModalItem?.status === "over_budget"
      ? tr("Lebih", "Over")
      : activeModalItem?.status === "warning"
        ? tr("Hampir had", "Near limit")
        : tr("Selamat", "Healthy")

  return (
    <div className="moden-surface space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Bajet", "Budget")}
          fallbackHref={`/${sessionId}`}
          action={monthPicker(true)}
        />
        <section className="px-1">{heroBlock(false)}</section>

        <div className="space-y-2.5 px-1">
          {filterToggle}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[1.125rem] font-bold tracking-tight text-[var(--text)]">{tr("Kategori", "Categories")}</h2>
            <div className="flex shrink-0 items-center gap-2">
              {copyBudgetButton}
              {viewToggle}
            </div>
          </div>
        </div>

        <section className="px-1">
          {showDataSkeleton ? (
            mobileBudgetView === "grid" ? (
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-surface h-36 rounded-[1.25rem]" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-surface h-24 rounded-[1.25rem]" />
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          {filterToggle}
          <div className="flex shrink-0 items-center gap-2">
            {copyBudgetButton}
            {viewToggle}
          </div>
        </div>

        {showDataSkeleton ? (
          mobileBudgetView === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-surface h-40 rounded-[1.25rem]" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-surface h-20 rounded-[1.25rem]" />
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
                    onClose={requestBudgetModalClose}
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
                                  : "bg-[#0550B8]/15 text-[#2f8cf9]",
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
