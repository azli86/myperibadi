"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CalendarClock,
  ChevronDown,
  Clock,
  Coins,
  Compass,
  Loader2,
  PartyPopper,
  Plus,
  Sparkles,
  Pencil,
  Trash2,
  Upload,
  Wallet as WalletIcon,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
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
import { MoneyAmount, formatMoneyValue, formatCurrencyLabel } from "@/components/ui/MoneyAmount"

/** "RM1,234.00" — compact inline label for balances. */
const moneyLabel = (value: number, currency?: string | null) =>
  `${formatCurrencyLabel(currency)}${formatMoneyValue(value)}`
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import CurrencySelect from "@/components/ui/CurrencySelect"
import { CATEGORY_ICON_OPTIONS, CategoryIconGlyph } from "@/lib/category-icons"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"

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
  /** Derived server-side from the date window (+ wallet), not stored. */
  spent?: number
  transaction_count?: number
  created_at: string
  updated_at: string
}

type WalletItem = {
  id: number
  name: string
  label?: string | null
  image_url?: string | null
  currency: string
}

type EventFormState = {
  name: string
  icon_name: string
  start_date: string
  end_date: string
  currency: string
  wallet_id: string
  budget: string
  notes: string
}

type FilterTab = "all" | "active" | "ended"

const defaultForm = (): EventFormState => ({
  name: "",
  icon_name: "gift",
  start_date: "",
  end_date: "",
  currency: "RM",
  wallet_id: "",
  budget: "",
  notes: "",
})

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

/** Fraction of the event budget used, for the progress bar. */
function spendRatio(ev: { budget?: number | null; spent?: number }): number {
  const budget = Number(ev.budget || 0)
  if (budget <= 0) return 0
  return Math.max(0, Number(ev.spent || 0) / budget)
}

export default function EventPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params?.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [mounted, setMounted] = useState(false)
  const [events, setEvents] = useState<EventItem[]>([])
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null)
  const [form, setForm] = useState<EventFormState>(defaultForm)
  const [walletOpen, setWalletOpen] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showCreateSheet } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showCreateSheet])

  const loadEvents = useCallback(async () => {
    if (!hasLoaded) setLoading(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/events", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      })
      if (!res.ok) throw new Error(tr("Gagal muat acara.", "Failed to load events."))
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
      setHasLoaded(true)
    } catch (err) {
      showAlertRef.current(
        tr("Ralat", "Error"),
        err instanceof Error ? err.message : tr("Gagal muat acara.", "Failed to load events."),
        "error",
      )
    } finally {
      setLoading(false)
    }
  }, [hasLoaded, tr])

  const loadWallets = useCallback(async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/wallets", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      setWallets(Array.isArray(data) ? data : [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    void loadEvents()
    void loadWallets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetForm = useCallback(() => setForm(defaultForm()), [])

  const openCreateSheet = useCallback(() => {
    setEditingEvent(null)
    resetForm()
    setWalletOpen(false)
    setShowCreateSheet(true)
  }, [resetForm])

  const openEditSheet = useCallback((ev: EventItem) => {
    setEditingEvent(ev)
    setForm({
      name: ev.name || "",
      icon_name: ev.icon_name || "gift",
      start_date: ev.start_date || "",
      end_date: ev.end_date || "",
      currency: ev.currency || "RM",
      wallet_id: ev.wallet_id ? String(ev.wallet_id) : "",
      budget: ev.budget != null ? String(ev.budget) : "",
      notes: ev.notes || "",
    })
    setWalletOpen(false)
    setShowCreateSheet(true)
  }, [])

  const closeCreateSheet = useCallback(() => {
    setShowCreateSheet(false)
    setEditingEvent(null)
    setWalletOpen(false)
    resetForm()
  }, [resetForm])

  const { requestClose: requestCreateSheetClose } = useOverlayBackClose({
    id: "event-create-sheet",
    isOpen: showCreateSheet,
    onClose: closeCreateSheet,
  })

  // The detail page cannot host the edit sheet (it owns a different form), so it
  // links back here with ?edit=<id>; open the sheet once the events arrive.
  const editParam = useSearchParams().get("edit")
  const openedEditRef = useRef<string | null>(null)
  useEffect(() => {
    if (!editParam || openedEditRef.current === editParam) return
    const match = events.find((ev) => String(ev.id) === editParam)
    if (!match) return
    openedEditRef.current = editParam
    openEditSheet(match)
  }, [editParam, events, openEditSheet])

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), tr("Nama acara perlu diisi.", "Event name is required."), "error")
      return
    }
    const budget = form.budget.trim() === "" ? null : Number(form.budget)
    if (budget != null && (isNaN(budget) || budget < 0)) {
      showAlert(tr("Bajet tak sah", "Invalid budget"), tr("Bajet mesti nombor bukan negatif.", "Budget must be a non-negative number."), "error")
      return
    }
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      showAlert(tr("Tarikh tak sah", "Invalid dates"), tr("Tarikh mula tidak boleh lepas tarikh tamat.", "Start date cannot be after end date."), "error")
      return
    }
    setSaving(true)
    try {
      const token = getAccessToken()
      const url = editingEvent ? `/api/events/${editingEvent.id}` : "/api/events"
      const method = editingEvent ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: form.name.trim(),
          icon_name: form.icon_name || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          currency: form.currency || "RM",
          wallet_id: form.wallet_id ? Number(form.wallet_id) : null,
          budget,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan acara.", "Failed to save event."))
      }
      closeCreateSheet()
      await loadEvents()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : tr("Gagal simpan acara.", "Failed to save event."), "error")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEvent = useCallback(    (ev: EventItem) => {
      showConfirm(tr("Padam acara?", "Delete event?"), tr(`Padam ${ev.name}?`, `Delete ${ev.name}?`), async () => {
        setSaving(true)
        try {
          const token = getAccessToken()
          const res = await fetch(`/api/events/${ev.id}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as { detail?: string } | null
            throw new Error(payload?.detail || tr("Gagal padam acara.", "Failed to delete event."))
          }
          await loadEvents()
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : tr("Gagal padam acara.", "Failed to delete event."), "error")
        } finally {
          setSaving(false)
        }
      }, "warning")
    },
    [tr, loadEvents, showAlert, showConfirm],
  )

  async function uploadImage(file: File) {
    if (!editingEvent) return
    if (!file.type.startsWith("image/")) {
      showAlert(tr("Fail tak sah", "Invalid file"), tr("Sila pilih fail gambar.", "Please choose an image file."), "error")
      return
    }
    setUploadingImage(true)
    try {
      const token = getAccessToken()
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/events/${editingEvent.id}/image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal muat naik gambar.", "Failed to upload image."))
      }
      const updated = (await res.json()) as EventItem
      setEvents((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
      setEditingEvent(updated)
    } catch (err) {
      showAlert(tr("Gagal muat naik", "Upload failed"), err instanceof Error ? err.message : tr("Gagal muat naik gambar.", "Failed to upload image."), "error")
    } finally {
      setUploadingImage(false)
    }
  }

  const walletName = (id?: number | null) => {
    const w = wallets.find((x) => x.id === id)
    return w?.name || ""
  }

  // Analytics & Stats
  const stats = useMemo(() => {
    let totalBudget = 0
    let totalSpent = 0
    let activeCount = 0
    let endedCount = 0
    let nextUpcoming: { name: string; days: number } | null = null

    for (const ev of events) {
      const days = daysUntil(ev.end_date)
      const isEnded = ev.status === "ended" || (days != null && days < 0)
      if (isEnded) {
        endedCount++
      } else {
        activeCount++
        totalBudget += Number(ev.budget || 0)
        totalSpent += Number(ev.spent || 0)
        if (days != null && days >= 0) {
          if (!nextUpcoming || days < nextUpcoming.days) {
            nextUpcoming = { name: ev.name, days }
          }
        }
      }
    }

    const netRemaining = totalBudget - totalSpent

    return { totalBudget, totalSpent, netRemaining, activeCount, endedCount, nextUpcoming }
  }, [events])

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aDays = daysUntil(a.end_date) ?? Number.MAX_SAFE_INTEGER
      const bDays = daysUntil(b.end_date) ?? Number.MAX_SAFE_INTEGER
      return aDays - bDays
    })
  }, [events])

  const filteredEvents = useMemo(() => {
    return sortedEvents.filter((ev) => {
      const days = daysUntil(ev.end_date)
      const isEnded = ev.status === "ended" || (days != null && days < 0)
      if (filterTab === "active") return !isEnded
      if (filterTab === "ended") return isEnded
      return true
    })
  }, [sortedEvents, filterTab])

  const currentCurrency = form.currency || "RM"

  const renderEventCard = (ev: EventItem) => {
    const days = daysUntil(ev.end_date)
    const isEnded = ev.status === "ended" || (days != null && days < 0)
    const isToday = days === 0
    const isSoon = days != null && days > 0 && days <= 7

    const tone = isEnded ? "ended" : isToday ? "today" : isSoon ? "soon" : "upcoming"

    const statusLabel =
      tone === "ended"
        ? tr("Tamat", "Ended")
        : tone === "today"
          ? tr("Hari Ini!", "Today!")
          : tone === "soon"
            ? (isBm ? `Tinggal ${days} hari` : `${days} days left`)
            : tr("Akan Datang", "Upcoming")

    const statusClass =
      tone === "ended"
        ? "bg-[var(--surface-tint-strong)] text-[var(--muted)] border-transparent font-bold"
        : tone === "today"
          ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30 font-bold"
          : tone === "soon"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-bold"
            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-bold"

    const budgetNum = Number(ev.budget || 0)
    const spentNum = Number(ev.spent || 0)
    const hasBudget = ev.budget != null && budgetNum > 0
    // Without a budget there is nothing to be under or over, so neither the
    // remaining nor the ratio may be derived from a 0 budget. Doing that made
    // remaining = -spent and painted a no-budget trip as overspent.
    const remainingNum = hasBudget ? budgetNum - spentNum : 0
    const ratio = spendRatio(ev)

    const hasImage = Boolean(ev.has_image && ev.image_url)
    const toneColor = ratio >= 1 ? "var(--expense)" : ratio >= 0.8 ? "var(--warning)" : "var(--income)"

    return (
      <div
        key={ev.id}
        onClick={() => router.push(`/${sessionId}/event/${ev.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            router.push(`/${sessionId}/event/${ev.id}`)
          }
        }}
        className="group relative flex w-full flex-col overflow-hidden rounded-2xl bg-[var(--card)] text-left shadow-[var(--shadow-card)] transition active:scale-[0.99]"
      >
        {/* Photo with the spend total centred on it — the same treatment as the
            event detail page, so the card previews the page it opens. */}
        {hasImage ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--surface-tint-strong)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ev.image_url!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center transition duration-500 group-active:scale-[1.03]"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center event-photo-overlay bg-black/45 px-4 text-center">
              {/* The name sits on the photo with the total, so the card reads
                  as one image rather than a photo with a caption under it. */}
              <p className="line-clamp-2 max-w-full text-2xl font-black leading-tight tracking-tight [overflow-wrap:anywhere] [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
                {ev.name}
              </p>
              <p className="mt-3 text-[0.6rem] event-photo-overlay-label font-bold uppercase tracking-[0.14em]">
                {tr("Dibelanjakan", "Spent")}
              </p>
              <p className="mt-1 text-3xl font-black leading-none tabular-nums tracking-tight [overflow-wrap:anywhere] [text-shadow:0_1px_12px_rgba(0,0,0,0.45)]">
                {moneyLabel(spentNum, ev.currency)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col p-3.5">
          <div className="flex items-start gap-3">
            {!hasImage ? (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text-soft)]">
                <CategoryIconGlyph iconName={ev.icon_name} categoryName={ev.name} kind="expense" size={22} />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              {!hasImage ? (
                <p className="truncate text-xl font-black leading-tight tracking-tight text-[var(--text)]">{ev.name}</p>
              ) : null}
              <div className={cn("flex flex-wrap", hasImage ? "mt-1.5" : "mt-1", "items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-[var(--muted)]")}>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.08em]",
                    statusClass
                  )}
                >
                  {statusLabel}
                </span>
                <span className="whitespace-nowrap">
                  {ev.start_date ? formatDateShort(ev.start_date) : "—"}
                  {" → "}
                  {ev.end_date ? formatDateShort(ev.end_date) : tr("Tiada tarikh tamat", "No end date")}
                </span>
              </div>
            </div>

            {/* Edit / delete stay reachable without opening the event. */}
            <div className="-mr-1.5 -mt-1.5 flex shrink-0 items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  openEditSheet(ev)
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
                aria-label={tr("Edit", "Edit")}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteEvent(ev)
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-rose-600 transition hover:bg-rose-500/10 active:scale-95 dark:text-rose-400"
                aria-label={tr("Padam", "Delete")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Without a photo the total leads the body instead. */}
          {!hasImage ? (
            <div className="mt-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                {tr("Dibelanjakan", "Spent")}
              </p>
              <p className="mt-0.5 truncate text-2xl font-black leading-none tabular-nums tracking-tight text-[var(--text)]">
                {moneyLabel(spentNum, ev.currency)}
              </p>
            </div>
          ) : null}

          {/* Budget bar, only when a limit exists — a 0% bar on a budget-less
              trip reads as an error. */}
          {hasBudget ? (
            <div className="event-progress-track mt-3">
              <div
                className="event-progress-fill"
                style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: toneColor }}
              />
            </div>
          ) : null}

          <dl className="mt-3 grid grid-cols-3 border-t border-[var(--divider)] pt-3">
            <div className="min-w-0">
              <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--muted)]">{tr("Bajet", "Budget")}</dt>
              <dd className="mt-0.5 truncate text-xs font-black tabular-nums text-[var(--text)]">
                {hasBudget ? moneyLabel(budgetNum, ev.currency) : "—"}
              </dd>
            </div>
            <div className="min-w-0 border-l border-[var(--divider)] pl-3">
              <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--muted)]">{tr("Baki", "Left")}</dt>
              <dd
                className={cn(
                  "mt-0.5 truncate text-xs font-black tabular-nums",
                  !hasBudget && "text-[var(--muted)]",
                  hasBudget &&
                    (remainingNum >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")
                )}
              >
                {hasBudget ? moneyLabel(remainingNum, ev.currency) : "—"}
              </dd>
            </div>
            <div className="min-w-0 border-l border-[var(--divider)] pl-3">
              <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--muted)]">{tr("Transaksi", "Txn")}</dt>
              <dd className="mt-0.5 truncate text-xs font-black tabular-nums text-[var(--text)]">
                {ev.transaction_count || 0}
              </dd>
            </div>
          </dl>

          {!hasBudget ? (
            <p className="mt-2 flex items-center gap-1 truncate text-[0.6875rem] font-semibold text-[var(--muted)]">
              <WalletIcon size={11} aria-hidden className="shrink-0" />
              {walletName(ev.wallet_id) || tr("Semua Wallet", "All Wallets")}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  // Summary on the event hero: the dark card globals.css defines for this
  // module (.event-hero keeps its text light in both themes), with the debt
  // page's gradient and blooms. Spend on running events leads, then the budget
  // it is measured against.
  const renderHeroStats = (isDesktop = false) => {
    const hasTotalBudget = stats.totalBudget > 0
    const totalRatio = hasTotalBudget ? Math.max(0, stats.totalSpent / stats.totalBudget) : 0
    const totalTone = totalRatio >= 1 ? "var(--expense)" : totalRatio >= 0.8 ? "var(--warning)" : "var(--income)"
    const over = stats.netRemaining < 0
    return (
      <section className={cn("event-hero", isDesktop ? "p-6 md:p-7" : "p-5")}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
        <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

        <div className={cn("relative", isDesktop && "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-8")}>
          <div className="min-w-0">
            <p className={cn("font-bold uppercase tracking-[0.14em] text-[#a3a3a3]", isDesktop ? "text-[0.7rem]" : "text-[0.625rem]")}>
              {tr("Dibelanjakan · acara aktif", "Spent · active events")}
            </p>
            {showDataSkeleton ? (
              <div className={cn("mt-2 animate-pulse rounded bg-white/10", isDesktop ? "h-10 w-40" : "h-8 w-32")} />
            ) : (
              <p className="event-hero-amount mt-2 text-4xl leading-none tabular-nums md:text-5xl">
                <span className="event-hero-currency mr-1.5 inline-block text-2xl md:text-3xl">RM</span>
                <span>{formatMoneyValue(stats.totalSpent)}</span>
              </p>
            )}

            {hasTotalBudget ? (
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.min(100, totalRatio * 100)}%`, backgroundColor: totalTone }}
                  />
                </div>
                {/* The hero forces light text, so the tone rides on the bar and a dot. */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs font-bold">
                  <span className="text-[#a3a3a3]">
                    {Math.round(totalRatio * 100)}% {tr("daripada", "of")} {moneyLabel(stats.totalBudget, "RM")}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums text-[#f5f5f5]">
                    <i aria-hidden className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: totalTone }} />
                    {over
                      ? tr(
                          `Lebih ${moneyLabel(Math.abs(stats.netRemaining), "RM")}`,
                          `Over by ${moneyLabel(Math.abs(stats.netRemaining), "RM")}`
                        )
                      : tr(`Baki ${moneyLabel(stats.netRemaining, "RM")}`, `${moneyLabel(stats.netRemaining, "RM")} left`)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs font-bold text-[#a3a3a3]">
                {tr("Tiada had bajet ditetapkan", "No budget limit set")}
              </p>
            )}
          </div>

          <div className={cn("grid grid-cols-3", isDesktop ? "gap-3" : "mt-5 gap-2.5")}>
            {[
              { label: tr("Aktif", "Active"), value: String(stats.activeCount), sub: null },
              { label: tr("Tamat", "Ended"), value: String(stats.endedCount), sub: null },
              {
                label: tr("Terdekat", "Next"),
                value: stats.nextUpcoming
                  ? stats.nextUpcoming.days === 0
                    ? tr("Hari ini", "Today")
                    : isBm
                      ? `${stats.nextUpcoming.days} hari`
                      : `${stats.nextUpcoming.days}d`
                  : "—",
                sub: stats.nextUpcoming?.name || null,
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

  // Filter Segmented Tabs
  const renderFilterTabs = () => (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {[
        { key: "all" as FilterTab, label: tr("Semua", "All"), count: events.length },
        { key: "active" as FilterTab, label: tr("Aktif & Akan Datang", "Active & Upcoming"), count: stats.activeCount },
        { key: "ended" as FilterTab, label: tr("Tamat", "Ended"), count: stats.endedCount },
      ].map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setFilterTab(tab.key)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition active:scale-95",
            filterTab === tab.key
              ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
              : "bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]"
          )}
        >
          <span>{tab.label}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[0.625rem] font-black",
              filterTab === tab.key ? "bg-[var(--bg)]/20 text-[var(--bg)]" : "bg-[var(--card)] text-[var(--muted)]"
            )}
          >
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      {/* ─── Mobile ─── */}
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Acara & Majlis", "Events")}
          fallbackHref={`/${sessionId}`}
          backPreferHistory
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Tambah Acara", "Add Event")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>

      <div className="px-1 pb-24 space-y-4 md:hidden">
        {renderHeroStats()}
        {renderFilterTabs()}

        <div className="space-y-3">
          {showDataSkeleton ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-2xl bg-[var(--card)]" />
            ))
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--divider)] bg-[var(--card)] p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                <PartyPopper size={28} />
              </div>
              <p className="mt-3.5 text-sm font-bold text-[var(--text)]">{tr("Tiada rekod acara", "No events found")}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tr("Rancang bajet percutian, majlis hari jadi atau kenduri dengan mudah.", "Plan vacation budgets, parties, or trips effortlessly.")}
              </p>
              <button
                type="button"
                onClick={openCreateSheet}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2 text-xs font-black text-[var(--btn-primary-text)] shadow-xs transition active:scale-95"
              >
                <Plus size={15} />
                <span>{tr("Buat Acara Baru", "Create Event")}</span>
              </button>
            </div>
          ) : (
            filteredEvents.map((ev) => renderEventCard(ev))
          )}
        </div>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Papan Acara & Perancangan", "Events Board")}
          homeHref={`/${sessionId}`}
          backPreferHistory
          actions={
            <DesktopPageAction onClick={openCreateSheet}>
              <Plus strokeWidth={2.5} />
              {tr("Tambah Acara", "Add Event")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl space-y-6">
          {renderHeroStats(true)}
          {renderFilterTabs()}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showDataSkeleton ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-2xl bg-[var(--card)]" />
              ))
            ) : filteredEvents.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--divider)] bg-[var(--card)] px-6 py-14 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--muted)]">
                  <PartyPopper size={32} />
                </div>
                <p className="mt-3.5 text-base font-bold text-[var(--text)]">{tr("Tiada rekod acara", "No events found")}</p>
                <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">
                  {tr("Rancang bajet percutian, majlis hari jadi atau kenduri dengan mudah.", "Plan vacation budgets, parties, or trips effortlessly.")}
                </p>
                <button
                  type="button"
                  onClick={openCreateSheet}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs font-black text-[var(--btn-primary-text)] shadow-xs transition active:scale-95"
                >
                  <Plus size={15} />
                  <span>{tr("Buat Acara Baru", "Create Event")}</span>
                </button>
              </div>
            ) : (
              filteredEvents.map((ev) => renderEventCard(ev))
            )}
          </div>
        </DesktopPageBody>
      </div>

      {/* ─── Add/Edit Sheet ─── */}
      {mounted && showCreateSheet
        ? createPortal(
            <div
              className="fixed inset-0 z-[140] flex h-[100dvh] w-screen items-end justify-center bg-[var(--overlay)] backdrop-blur-xs p-0 md:items-center md:p-4"
              onClick={requestCreateSheetClose}
            >
              <div
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl md:max-h-[86vh] md:max-w-lg md:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={editingEvent ? tr("Edit Acara", "Edit Event") : tr("Tambah Acara", "Add Event")}
                  onClose={requestCreateSheetClose}
                  action={
                    <button
                      type="submit"
                      form="event-sheet-form"
                      disabled={saving}
                      className="px-2 py-1 text-sm font-black text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editingEvent ? tr("Update", "Update") : tr("Simpan", "Save")}
                    </button>
                  }
                />

                <form
                  id="event-sheet-form"
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  onSubmit={handleSaveEvent}
                >
                  <div className="min-h-0 flex-1 space-y-4.5 overflow-y-auto overscroll-contain px-4 py-4 text-[var(--text)] sm:px-6 sm:py-5">
                    {/* Budget Hero Card Input */}
                    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 text-center">
                      <label className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Peruntukan Bajet Acara", "Event Budget Allocation")}
                      </label>
                      <div className="mt-1 flex items-center justify-center gap-2">
                        <span className="text-sm font-bold uppercase text-[var(--muted)]">{form.currency || "RM"}</span>
                        <input
                          inputMode="decimal"
                          value={form.budget}
                          onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value.replace(/[^0-9.]/g, "") }))}
                          placeholder="0.00"
                          className="w-48 bg-transparent text-center text-3xl font-black text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                        />
                      </div>

                      {editingEvent && (
                        <div className="mt-3 border-t border-[var(--border)]/60 pt-3">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingImage}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-xs font-bold text-[var(--text)] shadow-xs transition hover:bg-[var(--surface-tint-strong)] active:scale-95 disabled:opacity-50"
                          >
                            {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            <span>{editingEvent.has_image ? tr("Tukar Gambar Banner", "Change Banner Image") : tr("Muat Naik Gambar Banner", "Upload Banner Image")}</span>
                          </button>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void uploadImage(file)
                          e.target.value = ""
                        }}
                      />
                    </div>

                    {/* Event Name */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Nama Acara", "Event Name")} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] placeholder:text-[var(--muted)]/40"
                        placeholder={tr("Contoh: Percutian Sabah / Kenduri Kahwin", "Example: Trip to Japan / Birthday Party")}
                      />
                    </div>

                    {/* Icon picker */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Pilih Ikon", "Select Icon")}
                      </label>
                      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                        {CATEGORY_ICON_OPTIONS.map((opt) => {
                          const selected = form.icon_name === opt.name
                          return (
                            <button
                              key={opt.name}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, icon_name: opt.name }))}
                              className={cn(
                                "flex h-10 w-full items-center justify-center rounded-xl border transition active:scale-90",
                                selected
                                  ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)]/10 text-[var(--btn-primary-bg)] shadow-xs"
                                  : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]",
                              )}
                              aria-label={opt.label}
                            >
                              <opt.icon size={18} />
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Tarikh Mula", "Start Date")}
                        </label>
                        <input
                          type="date"
                          value={form.start_date}
                          onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-3 text-sm text-[var(--text)] outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Tarikh Tamat", "End Date")}
                        </label>
                        <input
                          type="date"
                          value={form.end_date}
                          onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-3 text-sm text-[var(--text)] outline-none"
                        />
                      </div>
                    </div>

                    {/* Currency & Wallet */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Mata Wang", "Currency")}
                        </label>
                        <CurrencySelect value={currentCurrency} onChange={(v) => setForm((prev) => ({ ...prev, currency: v }))} />
                      </div>
                      <div>
                        <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Dompet Pembayar", "Linked Wallet")}
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setWalletOpen((o) => !o)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)]",
                              walletOpen && "border-[var(--btn-primary-bg)]",
                            )}
                          >
                            {form.wallet_id ? (
                              (() => {
                                const w = wallets.find((x) => x.id === Number(form.wallet_id))
                                return (
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                      {w?.image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <WalletIcon size={11} />
                                      )}
                                    </span>
                                    <span className="truncate font-bold">{w?.name || tr("Pilih wallet", "Select wallet")}</span>
                                  </span>
                                )
                              })()
                            ) : (
                              <span className="flex items-center gap-2 text-[var(--muted)]">
                                <WalletIcon size={14} />
                                <span>{tr("Klik untuk pilih wallet", "Tap to pick a wallet")}</span>
                              </span>
                            )}
                            <ChevronDown size={15} className={cn("shrink-0 text-[var(--muted)] transition-transform", walletOpen && "rotate-180")} />
                          </button>
                          {walletOpen && (
                            <div className="mt-2 max-h-48 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-lg space-y-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((prev) => ({ ...prev, wallet_id: "", currency: prev.currency }))
                                  setWalletOpen(false)
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition",
                                  !form.wallet_id ? "bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold" : "text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                                )}
                              >
                                <span>{tr("Semua Wallet", "All Wallets")}</span>
                                {!form.wallet_id && <Check size={14} className="text-emerald-500" />}
                              </button>
                              <p className="px-3 pb-1 text-[0.625rem] font-medium text-[var(--muted)]">
                                {tr(
                                  "Semua Wallet = kira semua transaksi dalam tarikh acara.",
                                  "All Wallets = count every transaction in the event dates."
                                )}
                              </p>
                              {wallets.map((w) => {
                                const selected = form.wallet_id === String(w.id)
                                return (
                                  <button
                                    key={w.id}
                                    type="button"
                                    onClick={() => {
                                      setForm((prev) => ({ ...prev, wallet_id: String(w.id), currency: w.currency || prev.currency }))
                                      setWalletOpen(false)
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition",
                                      selected ? "bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold" : "hover:bg-[var(--surface-tint)] text-[var(--text)]",
                                    )}
                                  >
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                      {w.image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <WalletIcon size={12} />
                                      )}
                                    </span>
                                    <span className="truncate flex-1 font-medium">{w.name}</span>
                                    {selected && <Check size={14} className="shrink-0 text-emerald-500" />}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Nota Tambahan", "Additional Notes")}
                      </label>
                      <textarea
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                        placeholder={tr("Catatan tambahan (opsyenal)", "Additional notes (optional)")}
                      />
                    </div>
                  </div>

                  {/* Sticky Footer */}
                  <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--sheet-bg)] p-4">
                    <button
                      type="button"
                      onClick={requestCreateSheetClose}
                      className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-xs font-bold text-[var(--muted)] transition hover:bg-[var(--surface-tint)] active:scale-95"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs md:text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editingEvent ? tr("Kemaskini Acara", "Update Event") : tr("Simpan Acara", "Save Event")}
                    </button>
                  </div>
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
