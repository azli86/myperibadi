"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  X,
  Trash2,
  Upload,
  Wallet as WalletIcon,
  PartyPopper,
} from "lucide-react"
import { useParams } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
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
import CurrencySelect from "@/components/ui/CurrencySelect"
import { CATEGORY_ICON_OPTIONS, CategoryIconGlyph } from "@/lib/category-icons"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
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

export default function EventPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
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
      // silent — wallet picker optional
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
    setShowCreateSheet(true)
  }, [])

  const closeCreateSheet = useCallback(() => {
    setShowCreateSheet(false)
    setEditingEvent(null)
    resetForm()
  }, [resetForm])

  const { requestClose: requestCreateSheetClose } = useOverlayBackClose({
    id: "event-create-sheet",
    isOpen: showCreateSheet,
    onClose: closeCreateSheet,
  })
  const showCreateSheetSwipe = useSwipeDownToClose(requestCreateSheetClose)

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

  const handleDeleteEvent = useCallback(
    (ev: EventItem) => {
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

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aDays = daysUntil(a.end_date) ?? Number.MAX_SAFE_INTEGER
      const bDays = daysUntil(b.end_date) ?? Number.MAX_SAFE_INTEGER
      return aDays - bDays
    })
  }, [events])

  const currentCurrency = form.currency || "RM"

  const renderEventCard = (ev: EventItem, compact = false) => {
    const days = daysUntil(ev.end_date)
    const tone = ev.status === "ended" || (days != null && days < 0)
      ? "ended"
      : days === 0
        ? "today"
        : days != null && days <= 7
          ? "soon"
          : "upcoming"
    const statusLabel =
      tone === "ended"
        ? tr("Tamat", "Ended")
        : tone === "today"
          ? tr("Hari Ini", "Today")
          : tone === "soon"
            ? tr("Hampir", "Soon")
            : tr("Akan Datang", "Upcoming")
    const statusClass =
      tone === "ended"
        ? "bg-[var(--muted)]/15 text-[var(--muted)]"
        : tone === "today"
          ? "bg-[var(--accent2)]/15 text-[var(--accent2)]"
          : tone === "soon"
            ? "bg-amber-500/15 text-amber-500"
            : "bg-[var(--accent)]/15 text-[var(--accent)]"

    return (
      <div
        key={ev.id}
        onClick={() => openEditSheet(ev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openEditSheet(ev)
          }
        }}
        className={cn(
          "group w-full overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-left transition",
          compact ? "hover:border-[color-mix(in_srgb,var(--accent2)_30%,var(--border))] active:scale-[0.99] md:px-4 md:py-3.5" : "active:scale-[0.985]",
        )}
      >
        <div className="flex items-center gap-2.5 md:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--icon-fg)]">
            {ev.has_image && ev.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ev.image_url} alt={ev.name} className="h-full w-full object-cover" />
            ) : (
              <CategoryIconGlyph iconName={ev.icon_name} categoryName={ev.name} kind="expense" size={22} />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-[var(--text)]">{ev.name}</p>
              {walletName(ev.wallet_id) ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[0.55rem] font-bold text-[var(--muted)]">
                  <WalletIcon size={10} />
                  {walletName(ev.wallet_id)}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-[var(--muted)]">
              <Calendar size={11} />
              {ev.start_date ? formatDateShort(ev.start_date) : "—"} → {ev.end_date ? formatDateShort(ev.end_date) : tr("Tiada tarikh tamat", "No end date")}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {ev.budget != null ? (
                <span className="text-[0.6875rem] font-bold text-[var(--text)]">
                  <MoneyAmount value={Number(ev.budget || 0)} currency={ev.currency} size="sm" />
                </span>
              ) : null}
              <span className={cn("rounded-full px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider", statusClass)}>{statusLabel}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteEvent(ev)
              }}
              className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--surface-tint)] hover:text-red-500"
              aria-label={tr("Padam", "Delete")}
            >
              <Trash2 size={15} />
            </button>
            <ChevronRight size={16} className="text-[var(--muted)]/50" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Acara Saya", "My Events")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Tambah Acara", "Add Event")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        <section className="px-1">
          <div className="space-y-3">
            {showDataSkeleton ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
                  <AmountSkeleton className="h-4 w-32" />
                  <AmountSkeleton className="mt-2 h-3 w-40" />
                </div>
              ))
            ) : sortedEvents.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 p-8 text-center">
                <PartyPopper size={32} className="mx-auto text-[var(--muted)]/40" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Belum ada acara.", "No events yet.")}</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--muted)]/80">
                  {tr("Simpan acara, majlis atau perjalanan dengan bajet & tarikh tamat.", "Track events, parties or trips with a budget & end date.")}
                </p>
                <button
                  type="button"
                  onClick={openCreateSheet}
                  className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-95"
                >
                  <Plus size={14} className="mr-1 inline" />
                  {tr("Tambah Acara", "Add Event")}
                </button>
              </div>
            ) : (
              sortedEvents.map((ev) => renderEventCard(ev, false))
            )}
          </div>
        </section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Papan Acara", "Events Board")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={openCreateSheet}>
              <Plus strokeWidth={2.5} />
              {tr("Tambah Acara", "Add Event")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="space-y-5">
          <div>
            <div className="space-y-3">
              {showDataSkeleton ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]" />
                ))
              ) : sortedEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--card)]/70 px-6 py-14 text-center">
                  <PartyPopper size={40} className="text-[var(--muted)]/30" />
                  <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Belum ada acara.", "No events yet.")}</p>
                  <button
                    type="button"
                    onClick={openCreateSheet}
                    className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--bg)]"
                  >
                    <Plus size={14} className="mr-1.5 inline" />
                    {tr("Tambah Acara", "Add Event")}
                  </button>
                </div>
              ) : (
                sortedEvents.map((ev) => renderEventCard(ev, true))
              )}
            </div>
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
                  title={editingEvent ? tr("Edit Acara", "Edit Event") : tr("Tambah Acara", "Add Event")}
                  onClose={requestCreateSheetClose}
                  action={
                    <button
                      type="submit"
                      form="event-sheet-form"
                      disabled={saving}
                      className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editingEvent ? tr("Update", "Update") : tr("Simpan", "Save")}
                    </button>
                  }
                />

                <form id="event-sheet-form" className="space-y-4 px-3 py-3 pb-4 text-[var(--text)] md:px-6 md:py-6" onSubmit={handleSaveEvent}>
                  {/* Budget hero + image upload */}
                  <div className="flex flex-col items-center gap-3">
                    <label className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Bajet Acara", "Event Budget")}
                    </label>
                    <div className="inline-flex items-baseline gap-1">
                      <span className="shrink-0 text-[1.6rem] font-black leading-tight text-[var(--muted)]">{form.currency || "RM"}</span>
                      <input
                        inputMode="decimal"
                        value={form.budget}
                        onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value }))}
                        placeholder="0.00"
                        style={{ fontSize: "2.5rem", fontWeight: 900 }}
                        className="w-auto min-w-[3ch] flex-none bg-transparent text-center leading-tight text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage || !editingEvent}
                      className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--text)] active:scale-95 disabled:opacity-50"
                    >
                      {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {tr("Muat Naik Gambar", "Upload Image")}
                    </button>
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
                  {!editingEvent ? (
                    <p className="text-center text-[0.625rem] text-[var(--muted)]">
                      {tr("Simpan dahulu untuk muat naik gambar.", "Save first to upload an image.")}
                    </p>
                  ) : null}

                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Nama Acara", "Event Name")}
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder={tr("Contoh: Majlis Kahwin", "Example: Wedding")}
                    />
                  </div>

                  {/* Icon picker */}
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Ikon", "Icon")}
                    </label>
                    <div className="grid grid-cols-6 gap-1.5 md:grid-cols-8">
                      {CATEGORY_ICON_OPTIONS.map((opt) => {
                        const selected = form.icon_name === opt.name
                        return (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, icon_name: opt.name }))}
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-xl border transition active:scale-90",
                              selected ? "border-[var(--accent2)] bg-[var(--accent2)]/15 text-[var(--accent2)]" : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]",
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
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
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
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                  </div>

                  {/* Currency + Wallet */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Mata Wang", "Currency")}
                      </label>
                      <CurrencySelect value={currentCurrency} onChange={(v) => setForm((prev) => ({ ...prev, currency: v }))} />
                    </div>
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Wallet", "Wallet")}
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setWalletOpen((o) => !o)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] transition",
                            walletOpen && "border-[var(--border-strong)]",
                          )}
                        >
                          {form.wallet_id ? (
                            (() => {
                              const w = wallets.find((x) => x.id === Number(form.wallet_id))
                              return (
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                    {w?.image_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <WalletIcon size={13} />
                                    )}
                                  </span>
                                  <span className="truncate font-medium">{w?.name || tr("Pilih wallet", "Select wallet")}</span>
                                </span>
                              )
                            })()
                          ) : (
                            <span className="flex items-center gap-2 text-[var(--muted)]">
                              <WalletIcon size={15} />
                              {tr("Pilih wallet", "Select wallet")}
                            </span>
                          )}
                          <ChevronDown size={16} className={cn("shrink-0 text-[var(--muted)] transition-transform", walletOpen && "rotate-180")} />
                        </button>
                        {walletOpen ? (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl shadow-black/20">
                            <button
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({ ...prev, wallet_id: "", currency: prev.currency }))
                                setWalletOpen(false)
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--surface-tint)]"
                            >
                              <WalletIcon size={15} />
                              {tr("Tiada wallet", "No wallet")}
                            </button>
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
                                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition",
                                    selected ? "bg-[var(--surface-tint)]" : "hover:bg-[var(--surface-tint)]",
                                  )}
                                >
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                    {w.image_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <WalletIcon size={14} />
                                    )}
                                  </span>
                                  <span className="truncate text-sm font-medium text-[var(--text)]">{w.name}</span>
                                  {selected ? <span className="ml-auto text-[var(--accent2)]">✓</span> : null}
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
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

                  <div className="mt-6 -mx-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-3 pb-2 pt-5 md:-mx-6 md:px-6">
                    <button
                      type="button"
                      onClick={requestCreateSheetClose}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--muted)] transition active:scale-95"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60"
                    >
                      {saving
                        ? (isBm ? "Menyimpan…" : "Saving…")
                        : editingEvent ? tr("Update", "Update") : tr("Simpan Acara", "Save Event")}
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
