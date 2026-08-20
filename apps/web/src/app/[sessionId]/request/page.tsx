"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useParams } from "next/navigation"
import { createPortal } from "react-dom"
import {
  Lightbulb,
  LifeBuoy,
  Bug,
  Send,
  Inbox,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Search,
  RefreshCw,
  Loader2,
  MessageSquare,
  Flame,
  Check,
  Filter,
  Layers,
  HelpCircle,
  Plus,
  X,
  ChevronRight,
} from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"

type Ticket = {
  id: number
  kind: string
  title: string
  description?: string | null
  status: string
  priority: string
  admin_note?: string | null
  created_at?: string | null
}

const KIND_CONFIG = [
  {
    key: "feature",
    labelBm: "Cadang Ciri",
    labelEn: "Feature",
    descBm: "Fungsi baharu",
    descEn: "New feature",
    icon: Lightbulb,
    badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    borderActive: "border-amber-500/60 bg-amber-500/5",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    key: "support",
    labelBm: "Bantuan",
    labelEn: "Support",
    descBm: "Pertanyaan akaun",
    descEn: "Account help",
    icon: LifeBuoy,
    badgeBg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    borderActive: "border-sky-500/60 bg-sky-500/5",
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  {
    key: "bug",
    labelBm: "Lapor Bug",
    labelEn: "Bug Report",
    descBm: "Ralat sistem",
    descEn: "System glitch",
    icon: Bug,
    badgeBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    borderActive: "border-rose-500/60 bg-rose-500/5",
    iconBg: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
] as const

const PRIORITY_CONFIG: Record<
  string,
  { labelBm: string; labelEn: string; dot: string; bg: string; text: string }
> = {
  low: {
    labelBm: "Rendah",
    labelEn: "Low",
    dot: "bg-slate-400",
    bg: "bg-slate-500/10 border-slate-500/20",
    text: "text-slate-600 dark:text-slate-400",
  },
  medium: {
    labelBm: "Biasa",
    labelEn: "Medium",
    dot: "bg-blue-500",
    bg: "bg-blue-500/10 border-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
  },
  high: {
    labelBm: "Tinggi",
    labelEn: "High",
    dot: "bg-amber-500",
    bg: "bg-amber-500/10 border-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
  },
  urgent: {
    labelBm: "Kritikal",
    labelEn: "Urgent",
    dot: "bg-rose-500 animate-pulse",
    bg: "bg-rose-500/10 border-rose-500/20",
    text: "text-rose-600 dark:text-rose-400",
  },
}

const STATUS_CONFIG: Record<
  string,
  { labelBm: string; labelEn: string; badge: string; dot: string }
> = {
  new: {
    labelBm: "Baru",
    labelEn: "New",
    badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25",
    dot: "bg-sky-500",
  },
  in_progress: {
    labelBm: "Dalam Proses",
    labelEn: "In Progress",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
    dot: "bg-amber-500 animate-pulse",
  },
  resolved: {
    labelBm: "Selesai",
    labelEn: "Resolved",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  closed: {
    labelBm: "Ditutup",
    labelEn: "Closed",
    badge: "bg-[var(--surface-tint-strong)] text-[var(--muted)] border-[var(--border)]",
    dot: "bg-[var(--muted)]",
  },
}

export default function RequestPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((ms: string, en: string) => (isBm ? ms : en), [isBm])

  const [mounted, setMounted] = useState(false)
  const [kind, setKind] = useState<"feature" | "support" | "bug">("feature")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateSheet, setShowCreateSheet] = useState(false)

  // Filtering & Search
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [replyTicket, setReplyTicket] = useState<Ticket | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showCreateSheet } })
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } })
      )
    }
  }, [showCreateSheet])

  const token = getAccessToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token && token !== "cookie") headers["Authorization"] = `Bearer ${token}`

  const loadMine = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const r = await fetch("/api/support/tickets/mine", {
        credentials: "include",
        headers: { ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}) },
        cache: "no-store",
      })
      if (r.ok) {
        const data = await r.json()
        setTickets(Array.isArray(data) ? data : [])
      }
    } catch {
      // Ignore
    } finally {
      setLoaded(true)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    void loadMine()
  }, [loadMine])

  const openCreateSheet = useCallback(() => {
    setTitle("")
    setDescription("")
    setPriority("medium")
    setKind("feature")
    setError("")
    setShowCreateSheet(true)
  }, [])

  const closeCreateSheet = useCallback(() => {
    setShowCreateSheet(false)
    setError("")
  }, [])

  const { requestClose: requestCreateSheetClose } = useOverlayBackClose({
    id: "request-create-sheet",
    isOpen: showCreateSheet,
    onClose: closeCreateSheet,
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(tr("Sila masukkan tajuk atau perkara.", "Please enter a subject or title."))
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const r = await fetch("/api/support/tickets", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          kind,
          title: title.trim(),
          description: description.trim() || null,
          priority,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        setError((d && (d.detail || d.message)) || tr("Gagal menghantar permohonan.", "Failed to submit request."))
        return
      }
      setDone(true)
      closeCreateSheet()
      await loadMine()
    } catch {
      setError(tr("Ralat rangkaian. Sila cuba lagi.", "Network error. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = t.title.toLowerCase().includes(q)
        const matchDesc = (t.description || "").toLowerCase().includes(q)
        const matchKind = t.kind.toLowerCase().includes(q)
        if (!matchTitle && !matchDesc && !matchKind) return false
      }
      return true
    })
  }, [tickets, statusFilter, searchQuery])

  const stats = useMemo(() => {
    const total = tickets.length
    const inProgress = tickets.filter((t) => t.status === "in_progress" || t.status === "new").length
    const resolved = tickets.filter((t) => t.status === "resolved").length
    return { total, inProgress, resolved }
  }, [tickets])

  function formatTimestamp(isoStr?: string | null) {
    if (!isoStr) return "—"
    try {
      const d = new Date(isoStr)
      if (Number.isNaN(d.getTime())) return isoStr
      return d.toLocaleDateString(isBm ? "ms-MY" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return isoStr
    }
  }

  // Hero Card Component (matches loan/bnpl hero card design)
  const renderHeroStats = (isDesktop = false) => (
    <div className={cn("request-hero relative overflow-hidden rounded-2xl bg-[#1a1a1a] text-center text-white", isDesktop ? "p-6" : "p-5")}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className={cn("relative flex flex-col items-center justify-center", isDesktop ? "min-h-28" : "min-h-24")}>
        <p className={cn("font-bold uppercase tracking-[0.14em] text-[#a3a3a3]", isDesktop ? "text-[0.7rem]" : "text-[0.625rem]")}>
          {tr("Jumlah Permohonan & Tiket", "Total Requests & Tickets")}
        </p>
        <div className="mt-2 text-[#ffffff]">
          {!loaded ? (
            <div className={cn("animate-pulse rounded bg-white/10 mx-auto", isDesktop ? "h-10 w-40" : "h-7 w-32")} />
          ) : (
            <div className="flex items-baseline justify-center gap-2 font-black text-white">
              <span className={cn("tracking-tight font-black", isDesktop ? "text-4xl" : "text-3xl")}>
                {stats.total}
              </span>
              <span className={cn("font-bold text-white opacity-55 uppercase tracking-wider", isDesktop ? "text-sm" : "text-xs")}>
                {tr("tiket", "tickets")} · {stats.inProgress} {tr("aktif", "active")} · {stats.resolved} {tr("selesai", "resolved")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // Filter Pills & Search Bar
  const renderFilterControls = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {[
          { key: "all", labelBm: "Semua", labelEn: "All", count: tickets.length },
          { key: "new", labelBm: "Baru", labelEn: "New", count: tickets.filter((t) => t.status === "new").length },
          { key: "in_progress", labelBm: "Dalam Proses", labelEn: "In Progress", count: tickets.filter((t) => t.status === "in_progress").length },
          { key: "resolved", labelBm: "Selesai", labelEn: "Resolved", count: tickets.filter((t) => t.status === "resolved").length },
          { key: "closed", labelBm: "Ditutup", labelEn: "Closed", count: tickets.filter((t) => t.status === "closed").length },
        ].map((f) => {
          const isSelected = statusFilter === f.key
          return (
            <button
              type="button"
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95",
                isSelected
                  ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                  : "bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <span>{tr(f.labelBm, f.labelEn)}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[0.625rem] font-black",
                  isSelected ? "bg-[var(--bg)]/20 text-[var(--bg)]" : "bg-[var(--card)] text-[var(--muted)]"
                )}
              >
                {f.count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={tr("Cari tajuk permohonan atau mesej…", "Search request tickets…")}
          className="w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] pl-9 pr-4 py-2.5 text-xs font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--btn-primary-bg)]"
        />
      </div>
    </div>
  )

  // Ticket Card Component
  const renderTicketCard = (tk: Ticket) => {
    const kindMeta = KIND_CONFIG.find((k) => k.key === tk.kind) || KIND_CONFIG[0]
    const KindIcon = kindMeta.icon
    const statusMeta = STATUS_CONFIG[tk.status] || STATUS_CONFIG.new
    const priorityMeta = PRIORITY_CONFIG[tk.priority] || PRIORITY_CONFIG.medium
    const isResolved = tk.status === "resolved"

    return (
      <div
        key={tk.id}
        className={cn(
          "rounded-2xl border p-4 transition-all relative overflow-hidden text-left shadow-[var(--shadow-card)]",
          isResolved
            ? "border-emerald-500/40 bg-emerald-950/10 [background-image:repeating-linear-gradient(135deg,rgba(16,185,129,0.08)_0,rgba(16,185,129,0.08)_10px,transparent_10px,transparent_20px)] shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]"
            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]"
        )}
        onClick={() => { if (tk.admin_note) setReplyTicket(tk) }}
        role={tk.admin_note ? "button" : undefined}
      >
        {/* Top Row: Kind Badge + Priority + Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border)]/60">
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.68rem] font-bold border", kindMeta.badgeBg)}>
              <KindIcon size={12} />
              <span>{tr(kindMeta.labelBm, kindMeta.labelEn)}</span>
            </span>

            <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.68rem] font-bold border", priorityMeta.bg, priorityMeta.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", priorityMeta.dot)} />
              <span>{tr(priorityMeta.labelBm, priorityMeta.labelEn)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold border", statusMeta.badge)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
              <span>{tr(statusMeta.labelBm, statusMeta.labelEn)}</span>
            </span>
          </div>
        </div>

        {/* Title & Description */}
        <div className="pt-3">
          <h3 className="text-sm font-black text-[var(--text)] leading-snug">
            {tk.title}
          </h3>
          {tk.description && (
            <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
              {tk.description}
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-1.5 text-[0.68rem] text-[var(--muted)]">
            <Clock size={11} />
            <span>{formatTimestamp(tk.created_at)}</span>
          </div>
        </div>

        {/* Admin Response — NOT shown inline in card; shown via popup instead */}
        {tk.admin_note && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setReplyTicket(tk) }}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-left text-xs transition hover:bg-sky-500/15"
          >
            <div className="flex items-center gap-1.5 font-bold text-sky-600 dark:text-sky-400">
              <MessageSquare size={13} />
              <span>{tr("Admin Respond to Your Ticket", "Admin Balas Tiket Anda")}</span>
            </div>
            <ChevronRight size={14} className="shrink-0 text-sky-600/60 dark:text-sky-400/60" />
          </button>
        )}
      </div>
    )
  }

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--muted)] shadow-xs">
        <Inbox size={32} />
      </div>
      <p className="text-sm font-bold text-[var(--text)]">
        {searchQuery || statusFilter !== "all"
          ? tr("Tiada tiket sepadan", "No matching tickets")
          : tr("Tiada permohonan dibuat lagi", "No requests submitted yet")}
      </p>
      <p className="max-w-xs text-xs text-[var(--muted)]">
        {searchQuery || statusFilter !== "all"
          ? tr("Cuba ubah kata carian atau tetapan penapis anda.", "Try changing your search term or filter selection.")
          : tr("Permohonan atau laporan yang anda hantar akan dipaparkan di sini berserta jawapan admin.", "Tickets you submit will be tracked here along with admin feedback.")}
      </p>
      <button
        type="button"
        onClick={openCreateSheet}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2 text-xs font-black text-white shadow-sm transition active:scale-95"
      >
        <Plus size={15} />
        <span>{tr("Permohonan Baru", "New Request")}</span>
      </button>
    </div>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ── Mobile Layout ── */}
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Request & Bantuan", "Support & Requests")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Hantar Baru", "New Request")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        <section className="px-1 space-y-4">
          {renderHeroStats(false)}
          {renderFilterControls()}

          <div className="space-y-3">
            {!loaded ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
              ))
            ) : filteredTickets.length === 0 ? (
              renderEmpty()
            ) : (
              filteredTickets.map((tk) => renderTicketCard(tk))
            )}
          </div>
        </section>
      </div>

      {/* ── Desktop Layout ── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Pusat Request & Tiket", "Request & Support Hub")}
          homeHref={`/${sessionId}`}
          breadcrumbs={[
            { label: tr("Tetapan", "Settings"), href: `/${sessionId}/settings` },
            { label: tr("Request & Support", "Support Hub") },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadMine(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.98] disabled:opacity-50"
              >
                <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
                <span>{tr("Segarkan", "Refresh")}</span>
              </button>
              <DesktopPageAction onClick={openCreateSheet}>
                <Plus strokeWidth={2.5} />
                {tr("Hantar Permohonan", "New Request")}
              </DesktopPageAction>
            </div>
          }
        />

        <DesktopPageBody className="space-y-6">
          {renderHeroStats(true)}
          {renderFilterControls()}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {!loaded ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
              ))
            ) : filteredTickets.length === 0 ? (
              <div className="col-span-full">{renderEmpty()}</div>
            ) : (
              filteredTickets.map((tk) => renderTicketCard(tk))
            )}
          </div>
        </DesktopPageBody>
      </div>

      {/* ─── Popup Sheet / Modal for Create Request (matches /bnpl modal style) ─── */}
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
                  title={tr("Permohonan Baru", "New Request")}
                  onClose={requestCreateSheetClose}
                  action={
                    <button
                      type="submit"
                      form="request-create-form"
                      disabled={submitting}
                      className="px-2 py-1 text-sm font-black text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {submitting ? (isBm ? "Menghantar…" : "Submitting…") : tr("Hantar", "Submit")}
                    </button>
                  }
                />

                <form
                  id="request-create-form"
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  onSubmit={submit}
                >
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 text-[var(--text)] sm:px-6 sm:py-5">
                    {/* 1. Request Type (3-Column Grid) */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Jenis Permohonan", "Request Type")} <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {KIND_CONFIG.map((item) => {
                          const Icon = item.icon
                          const isSelected = kind === item.key
                          return (
                            <button
                              type="button"
                              key={item.key}
                              onClick={() => setKind(item.key)}
                              className={cn(
                                "flex flex-col items-start p-2.5 sm:p-3 rounded-2xl border text-left transition-all relative overflow-hidden",
                                isSelected
                                  ? `${item.borderActive} ring-1 ring-emerald-500/40 shadow-xs`
                                  : "border-[var(--border)] bg-[var(--surface-tint)] hover:bg-[var(--surface-tint-strong)]"
                              )}
                            >
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px]">
                                  <Check size={10} strokeWidth={3} />
                                </div>
                              )}
                              <div className={cn("p-1.5 rounded-xl mb-1.5 sm:mb-2", item.iconBg)}>
                                <Icon size={16} />
                              </div>
                              <div className="text-[0.68rem] sm:text-xs font-black text-[var(--text)] line-clamp-1">
                                {tr(item.labelBm, item.labelEn)}
                              </div>
                              <div className="mt-0.5 text-[0.62rem] sm:text-[0.68rem] text-[var(--muted)] line-clamp-2 leading-tight">
                                {tr(item.descBm, item.descEn)}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 2. Priority Selection */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Tahap Keutamaan", "Priority Level")}
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(["low", "medium", "high", "urgent"] as const).map((p) => {
                          const cfg = PRIORITY_CONFIG[p]
                          const isSelected = priority === p
                          return (
                            <button
                              type="button"
                              key={p}
                              onClick={() => setPriority(p)}
                              className={cn(
                                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold border transition",
                                isSelected
                                  ? `${cfg.bg} ${cfg.text} border-current font-black ring-1 ring-current/20`
                                  : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]"
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                              <span className="truncate">{tr(cfg.labelBm, cfg.labelEn)}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 3. Title Input */}
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Tajuk / Perkara Ringkas", "Subject / Short Title")} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={
                          kind === "feature"
                            ? tr("Cth: Tambah graf unjuran bulanan", "E.g. Add monthly forecast chart")
                            : kind === "bug"
                            ? tr("Cth: Resit tidak dapat diimbas pada format PNG", "E.g. Receipt scan fails for PNG format")
                            : tr("Cth: Pertanyaan mengenai eksport data CSV", "E.g. Question regarding CSV data export")
                        }
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] placeholder:text-[var(--muted)]/40"
                      />
                    </div>

                    {/* 4. Description Textarea */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                          {tr("Keterangan & Butiran", "Description & Details")}
                        </label>
                        <span className="text-[0.68rem] text-[var(--muted)]">
                          {description.length} {tr("aksara", "chars")}
                        </span>
                      </div>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder={tr(
                          "Nyatakan maklumat terperinci, langkah menghasilkan ralat, atau sebab cadangan ini memudahkan anda…",
                          "Describe your requirement, steps to reproduce the bug, or why this feature helps your daily workflow…"
                        )}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] placeholder:text-[var(--muted)]/40"
                      />
                    </div>

                    {/* Error Alert */}
                    {error && (
                      <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-medium text-rose-600 dark:text-rose-400">
                        <AlertCircle size={15} className="shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}
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
                      disabled={submitting}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs md:text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>{tr("Sedang Menghantar…", "Submitting…")}</span>
                        </>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>{tr("Hantar Permohonan", "Submit Request")}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* ─── Admin Reply Popup ─── */}
      {mounted && replyTicket && replyTicket.admin_note
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-end justify-center bg-[var(--overlay)] backdrop-blur-xs p-0 md:items-center md:p-4"
              onClick={() => setReplyTicket(null)}
            >
              <div
                className="app-sheet-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl md:max-h-[80vh] md:max-w-md md:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={tr("Balasan Admin", "Admin Response")}
                  onClose={() => setReplyTicket(null)}
                  showCancel={false}
                />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                  <div className="flex items-start gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400">
                      <MessageSquare size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.62rem] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                        {tr("Admin Respond to Your Ticket", "Admin Balas Tiket Anda")}
                      </p>
                      <h3 className="mt-0.5 text-sm font-black text-[var(--text)] leading-snug">
                        {replyTicket.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-[var(--text)]">
                        {replyTicket.admin_note}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
