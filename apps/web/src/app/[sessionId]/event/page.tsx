"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronRight,
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

  const renderEventCard = (ev: EventItem, compact = false) => {
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
        ? "bg-[var(--surface-tint)] text-[var(--muted)] border-[var(--border)]"
        : tone === "today"
          ? "bg-cyan-500/15 text-cyan-500 border-cyan-500/30 font-bold"
          : tone === "soon"
            ? "bg-amber-500/15 text-amber-500 border-amber-500/30 font-bold"
            : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-bold"

    const budgetNum = Number(ev.budget || 0)
    const spentNum = Number(ev.spent || 0)
    const hasBudget = ev.budget != null && budgetNum > 0
    const remainingNum = budgetNum - spentNum
    const ratio = spendRatio(ev)

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
        className={cn(
          "event-card event-card-interactive group flex flex-col justify-between p-4.5 text-left transition",
          compact && "p-4"
        )}
      >
        <div>
          {/* Card Header: Icon/Image + Name + Status + Quick Actions */}
          <div className="flex items-start gap-3.5">
            <div className="relative flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--icon-fg)] shadow-xs transition-transform group-hover:scale-105">
              {ev.has_image && ev.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.image_url} alt={ev.name} className="h-full w-full object-cover" />
              ) : (
                <CategoryIconGlyph iconName={ev.icon_name} categoryName={ev.name} kind="expense" size={24} />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-base font-black tracking-tight text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                  {ev.name}
                </p>
                <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[0.625rem] uppercase tracking-wider", statusClass)}>
                  {statusLabel}
                </span>
              </div>

              {/* Date & duration */}
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <Calendar size={12} className="shrink-0 text-[var(--muted)]" />
                <span className="truncate">
                  {ev.start_date ? formatDateShort(ev.start_date) : "—"} → {ev.end_date ? formatDateShort(ev.end_date) : tr("Tiada tarikh tamat", "No end date")}
                </span>
              </div>
            </div>
          </div>

          {/* Hero: what this trip has actually cost. The number the card exists for,
              so it leads at full size instead of sitting in a 2-column grid. */}
          <div className="mt-3.5">
            <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tr("Dibelanjakan", "Spent")}
            </span>
            <p className="mt-1 leading-none">
              <MoneyAmount value={spentNum} currency={ev.currency} size="hero" />
            </p>
          </div>

          {/* Wallet & Tags row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-0.5 text-[0.625rem] font-bold text-[var(--muted)]">
              <WalletIcon size={11} className="text-[var(--muted)]" />
              <span>{walletName(ev.wallet_id) || tr("Semua Wallet", "All Wallets")}</span>
            </span>

            {ev.notes ? (
              <span className="truncate text-[0.6875rem] text-[var(--muted)]/80 italic max-w-[180px]">
                &ldquo;{ev.notes}&rdquo;
              </span>
            ) : null}
          </div>

          {/* Budget context: only when a limit exists. Spent already owns the top. */}
          {hasBudget ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[0.6875rem]">
                <span className="font-bold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Daripada bajet", "Of budget")}
                </span>
                <span className="font-bold text-[var(--text)]">
                  <MoneyAmount value={budgetNum} currency={ev.currency} size="sm" />
                </span>
              </div>

              <div className="event-progress-track mt-1.5">
                <div
                  className={cn(
                    "event-progress-fill",
                    ratio >= 1
                      ? "bg-[var(--expense)]"
                      : ratio >= 0.8
                        ? "bg-amber-500"
                        : "bg-[var(--income)]"
                  )}
                  style={{ width: `${Math.min(100, ratio * 100)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[0.6875rem]">
                <span className="font-semibold text-[var(--muted)]">
                  {Math.round(ratio * 100)}% {tr("digunakan", "used")}
                </span>
                <span className={cn("font-bold", remainingNum >= 0 ? "text-emerald-500" : "text-rose-500")}>
                  {remainingNum >= 0
                    ? tr(`Baki ${moneyLabel(remainingNum, ev.currency)}`, `${moneyLabel(remainingNum, ev.currency)} left`)
                    : tr(`Lebih ${moneyLabel(Math.abs(remainingNum), ev.currency)}`, `Over by ${moneyLabel(Math.abs(remainingNum), ev.currency)}`)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-[0.6875rem] font-semibold text-[var(--muted)]">
              {tr("Tiada had bajet", "No budget limit")}
            </div>
          )}
        </div>

        {/* Card Footer: Transactions link & Action Buttons */}
        <div className="mt-3.5 flex items-center justify-between border-t border-[var(--border)]/60 pt-2.5 text-xs">
          <div className="flex items-center gap-1 font-bold text-[var(--muted)] group-hover:text-[var(--text)] transition-colors">
            <span>{ev.transaction_count || 0} {tr("transaksi", "transactions")}</span>
            <ChevronRight size={13} className="text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openEditSheet(ev)
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-1 text-[0.6875rem] font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95 shadow-xs"
              aria-label={tr("Edit", "Edit")}
            >
              <Pencil size={12} />
              <span>{tr("Edit", "Edit")}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteEvent(ev)
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[0.6875rem] font-bold text-rose-500 transition hover:bg-rose-500/20 active:scale-95 shadow-xs"
              aria-label={tr("Padam", "Delete")}
            >
              <Trash2 size={12} />
              <span>{tr("Padam", "Delete")}</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Hero Card Component (matches TxnSummaryCard design)
  const renderHeroStats = (isDesktop = false) => (
    <div className={cn("relative overflow-hidden rounded-2xl bg-[#1a1a1a] text-[#f5f5f5]", isDesktop ? "p-6 md:p-8" : "p-6")}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl" />

      <div className="relative flex flex-col items-center text-center">
        {/* Category icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#e5e5e5]">
          <PartyPopper size={24} />
        </div>

        {/* Title — big */}
        <h2 className="mt-3 max-w-full break-words text-lg font-black leading-tight text-[#f5f5f5] md:text-xl">
          {tr("Peruntukan Bajet Acara", "Event Budget Allocation")}
        </h2>

        {/* Amount — big */}
        <div className="mt-3 leading-none tabular-nums tracking-tight text-5xl font-black text-white md:text-6xl">
          {showDataSkeleton ? (
            <AmountSkeleton className="mx-auto h-12 w-48 bg-white/10" />
          ) : (
            <p className="leading-none tabular-nums tracking-tight text-5xl font-black text-white md:text-6xl">
              <span className="event-hero-currency text-white font-extrabold opacity-100 text-3xl md:text-4xl mr-1.5 inline-block">RM</span>
              <span>{formatMoneyValue(Number(stats.totalBudget || 0))}</span>
            </p>
          )}
        </div>

        {/* Subtitle / ID */}
        <p className="mt-3 text-xs font-bold text-[#8c8c8c]">
          {stats.activeCount} {tr("acara aktif", "active events")} · {stats.endedCount} {tr("tamat", "ended")}
        </p>

        {/* Time / upcoming — small */}
        <p className="mt-1 text-[0.625rem] font-semibold text-[#6b6b6b]">
          {stats.nextUpcoming
            ? `${tr("Acara terdekat:", "Next upcoming:")} ${stats.nextUpcoming.name} (${stats.nextUpcoming.days === 0 ? tr("Hari ini", "Today") : `${stats.nextUpcoming.days}d`})`
            : tr("Tiada acara terdekat", "No upcoming events")}
        </p>

        {/* Status badge */}
        <span className="mt-3 shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-emerald-400">
          {stats.netRemaining >= 0
            ? `${tr("Baki Keseluruhan", "Total Remaining")}: RM ${formatMoneyValue(stats.netRemaining)}`
            : `${tr("Lebihan Keseluruhan", "Total Over")}: RM ${formatMoneyValue(Math.abs(stats.netRemaining))}`}
        </span>

        {/* Mini breakdown metrics */}
        <div className="mt-5 grid grid-cols-2 gap-4 w-full max-w-sm border-t border-white/10 pt-4 text-center">
          <div>
            <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[#8c8c8c]">
              {tr("Dibelanjakan", "Total Spent")}
            </span>
            <span className="mt-0.5 block text-sm font-black text-white">
              <span className="text-white mr-1 font-bold">RM</span>{formatMoneyValue(stats.totalSpent)}
            </span>
          </div>
          <div>
            <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[#8c8c8c]">
              {stats.netRemaining >= 0 ? tr("Baki Bajet", "Remaining") : tr("Lebihan", "Over Budget")}
            </span>
            <span className={cn("mt-0.5 block text-sm font-black", stats.netRemaining >= 0 ? "text-emerald-400" : "text-rose-400")}>
              <span className="mr-0.5 font-bold">RM</span>{formatMoneyValue(Math.abs(stats.netRemaining))}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

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
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95",
            filterTab === tab.key
              ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
              : "bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]"
          )}
        >
          <span>{tab.label}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.2 text-[0.625rem] font-black",
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
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
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
              <div key={i} className="h-36 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
            ))
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/20 p-8 text-center">
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
            filteredEvents.map((ev) => renderEventCard(ev, false))
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
                <div key={i} className="h-44 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
              ))
            ) : filteredEvents.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/70 px-6 py-14 text-center">
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
              filteredEvents.map((ev) => renderEventCard(ev, true))
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
