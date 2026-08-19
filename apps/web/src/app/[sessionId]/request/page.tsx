"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
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
} from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

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
    labelEn: "Request Feature",
    descBm: "Cadangkan fungsi atau pembaharuan baru",
    descEn: "Suggest new tools or workflow enhancements",
    icon: Lightbulb,
    badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    borderActive: "border-amber-500/60 bg-amber-500/5",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    key: "support",
    labelBm: "Bantuan Teknikal",
    labelEn: "Get Support",
    descBm: "Pertanyaan akaun, data atau penggunaan",
    descEn: "Questions regarding account, sync, or usage",
    icon: LifeBuoy,
    badgeBg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    borderActive: "border-sky-500/60 bg-sky-500/5",
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  {
    key: "bug",
    labelBm: "Lapor Pepijat / Bug",
    labelEn: "Report Bug",
    descBm: "Masalah paparan, ralat atau kerosakan sistem",
    descEn: "Glitch, unexpected error or calculation issue",
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
  const tr = (ms: string, en: string) => (isBm ? ms : en)

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

  // Filtering & view state
  const [mobileTab, setMobileTab] = useState<"form" | "list">("form")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const token = getAccessToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token && token !== "cookie") headers["Authorization"] = `Bearer ${token}`

  async function loadMine(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    try {
      const r = await fetch("/api/support/tickets/mine", {
        credentials: "include",
        headers: { ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}) },
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
  }

  useEffect(() => {
    void loadMine()
  }, [])

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
      setTitle("")
      setDescription("")
      setPriority("medium")
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

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ── Mobile Layout ── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Request & Bantuan", "Support & Requests")}
          fallbackHref={`/${sessionId}`}
        />

        <section className="px-1 space-y-4">
          {/* Mobile Segmented Switcher */}
          <div className="flex rounded-xl bg-[var(--surface-tint)] p-1 border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setMobileTab("form")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition",
                mobileTab === "form"
                  ? "bg-[var(--card)] text-[var(--text)] shadow-sm font-bold"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <Sparkles size={14} />
              <span>{tr("Hantar Baru", "New Request")}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("list")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition",
                mobileTab === "list"
                  ? "bg-[var(--card)] text-[var(--text)] shadow-sm font-bold"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <Inbox size={14} />
              <span>{tr("Senarai Tiket", "My Tickets")}</span>
              {tickets.length > 0 && (
                <span className="ml-1 rounded-full bg-[var(--surface-tint-strong)] px-1.5 py-0.2 text-[0.68rem] font-bold">
                  {tickets.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          {mobileTab === "form" ? (
            <div className="space-y-4">
              {done && renderSuccessNotice()}
              {renderFormCard()}
            </div>
          ) : (
            <div className="space-y-4">
              {renderTicketListCard()}
            </div>
          )}
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
            <button
              type="button"
              onClick={() => void loadMine(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.98] disabled:opacity-50"
            >
              <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
              <span>{tr("Segarkan", "Refresh")}</span>
            </button>
          }
        />

        <DesktopPageBody className="space-y-6 pt-6">
          {/* Top Hero Banner & Metrics */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Sparkles size={12} />
                  <span>{tr("Maklum Balas & Bantuan Terus", "Direct Feedback & Assistance")}</span>
                </div>
                <h1 className="text-xl font-black tracking-tight text-[var(--text)]">
                  {tr("Ada idea baharu atau perlukan bantuan teknikal?", "Have an idea or need technical assistance?")}
                </h1>
                <p className="text-xs text-[var(--muted)] max-w-2xl">
                  {tr(
                    "Hantarkan permohonan ciri baharu, pertanyaan sistem, atau laporan pepijat. Pasukan kami akan menyemak dan memberi maklum balas terus dalam tiket anda.",
                    "Submit feature requests, system questions, or bug reports. Our team reviews submissions and provides direct updates in your ticket thread."
                  )}
                </p>
              </div>

              {/* Stats Counters */}
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5 text-center min-w-[84px]">
                  <div className="text-xs font-medium text-[var(--muted)]">{tr("Jumlah", "Total")}</div>
                  <div className="text-lg font-black text-[var(--text)]">{stats.total}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5 text-center min-w-[84px]">
                  <div className="text-xs font-medium text-[var(--muted)]">{tr("Aktif", "Active")}</div>
                  <div className="text-lg font-black text-amber-500">{stats.inProgress}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5 text-center min-w-[84px]">
                  <div className="text-xs font-medium text-[var(--muted)]">{tr("Selesai", "Resolved")}</div>
                  <div className="text-lg font-black text-emerald-500">{stats.resolved}</div>
                </div>
              </div>
            </div>
          </div>

          {done && renderSuccessNotice()}

          {/* 2-Column Responsive Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Form (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              {renderFormCard()}
            </div>

            {/* Right Column: Ticket List & Search (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              {renderTicketListCard()}
            </div>
          </div>
        </DesktopPageBody>
      </div>
    </div>
  )

  /* ── Component: Success Banner ── */
  function renderSuccessNotice() {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-[var(--text)] transition-all animate-in fade-in slide-in-from-top-2">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-emerald-500/20 p-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-[var(--text)]">
              {tr("Tiket Berjaya Dihantar!", "Ticket Successfully Submitted!")}
            </h4>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {tr(
                "Terima kasih atas perkongsian anda. Pasukan kami akan menyemak dan mengemaskini status permohonan ini.",
                "Thank you for reaching out. Our team will review your request and update the status accordingly."
              )}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDone(false)
                  setMobileTab("list")
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <span>{tr("Lihat dalam Senarai Tiket →", "View in Tickets List →")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Component: Request Form Card ── */
  function renderFormCard() {
    return (
      <form
        onSubmit={submit}
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-6 shadow-sm space-y-4 md:space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
              <Sparkles size={16} />
            </div>
            <h2 className="text-sm md:text-base font-extrabold text-[var(--text)]">
              {tr("Hantar Permohonan Baru", "Create New Request")}
            </h2>
          </div>
          <span className="text-[0.7rem] font-semibold text-[var(--muted)] uppercase tracking-wider">
            {tr("Borang", "Form")}
          </span>
        </div>

        {/* 1. Kind Options Grid */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[var(--text)]">
            {tr("Jenis Permohonan", "Request Type")} <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {KIND_CONFIG.map((item) => {
              const Icon = item.icon
              const isSelected = kind === item.key
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setKind(item.key)}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-xl border text-left transition-all relative overflow-hidden",
                    isSelected
                      ? `${item.borderActive} ring-1 ring-emerald-500/30`
                      : "border-[var(--border)] bg-[var(--surface-tint)] hover:bg-[var(--surface-tint-strong)]"
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px]">
                      <Check size={10} strokeWidth={3} />
                    </div>
                  )}
                  <div className={cn("p-1.5 rounded-lg mb-2", item.iconBg)}>
                    <Icon size={16} />
                  </div>
                  <div className="text-xs font-bold text-[var(--text)]">
                    {tr(item.labelBm, item.labelEn)}
                  </div>
                  <div className="mt-0.5 text-[0.68rem] text-[var(--muted)] line-clamp-2 leading-tight">
                    {tr(item.descBm, item.descEn)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 2. Priority Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[var(--text)]">
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
                    "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition",
                    isSelected
                      ? `${cfg.bg} ${cfg.text} border-current font-bold ring-1 ring-current/20`
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
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-[var(--text)]">
            {tr("Tajuk / Perkara Ringkas", "Subject / Short Title")}{" "}
            <span className="text-rose-500">*</span>
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
            className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs md:text-sm text-[var(--text)] placeholder-[var(--input-placeholder)] outline-none transition focus:border-[var(--input-focus)] focus:ring-1 focus:ring-[var(--input-focus)]"
          />
        </div>

        {/* 4. Description Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-[var(--text)]">
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
            className="w-full resize-none rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs md:text-sm text-[var(--text)] placeholder-[var(--input-placeholder)] outline-none transition focus:border-[var(--input-focus)] focus:ring-1 focus:ring-[var(--input-focus)]"
          />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-medium text-rose-600 dark:text-rose-400 animate-in fade-in">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit CTA */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-3 text-xs md:text-sm font-bold text-[var(--btn-primary-text)] shadow-sm transition active:scale-[0.98] hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>{tr("Sedang Menghantar…", "Submitting…")}</span>
            </>
          ) : (
            <>
              <Send size={15} />
              <span>{tr("Hantar Permohonan", "Submit Request")}</span>
            </>
          )}
        </button>
      </form>
    )
  }

  /* ── Component: Ticket List Card ── */
  function renderTicketListCard() {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 md:p-6 shadow-sm space-y-4">
        {/* Card Header & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
              <Inbox size={16} />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-extrabold text-[var(--text)]">
                {tr("Senarai Permohonan Saya", "My Submitted Tickets")}
              </h2>
              <p className="text-[0.7rem] text-[var(--muted)]">
                {tickets.length} {tr("rekod dijumpai", "records found")}
              </p>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-56">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr("Cari tajuk / tiket…", "Search tickets…")}
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] pl-8 pr-3 py-1.5 text-xs text-[var(--text)] placeholder-[var(--input-placeholder)] outline-none focus:border-[var(--input-focus)]"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { key: "all", labelBm: "Semua", labelEn: "All" },
            { key: "new", labelBm: "Baru", labelEn: "New" },
            { key: "in_progress", labelBm: "Dalam Proses", labelEn: "In Progress" },
            { key: "resolved", labelBm: "Selesai", labelEn: "Resolved" },
            { key: "closed", labelBm: "Ditutup", labelEn: "Closed" },
          ].map((f) => {
            const isSelected = statusFilter === f.key
            const count =
              f.key === "all"
                ? tickets.length
                : tickets.filter((t) => t.status === f.key).length
            return (
              <button
                type="button"
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border transition",
                  isSelected
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)] font-bold shadow-xs"
                    : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
                )}
              >
                <span>{tr(f.labelBm, f.labelEn)}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[0.65rem] font-bold",
                    isSelected
                      ? "bg-[var(--bg)] text-[var(--text)]"
                      : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* List Content */}
        {!loaded ? (
          <div className="space-y-3 py-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] animate-pulse"
              />
            ))}
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
              <Inbox size={20} />
            </div>
            <h3 className="mt-3 text-xs md:text-sm font-bold text-[var(--text)]">
              {searchQuery || statusFilter !== "all"
                ? tr("Tiada tiket sepadan", "No matching tickets")
                : tr("Tiada permohonan dibuat lagi", "No requests submitted yet")}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)] max-w-sm mx-auto">
              {searchQuery || statusFilter !== "all"
                ? tr("Cuba ubah kata carian atau tetapan penapis anda.", "Try changing your search term or filter selection.")
                : tr("Permohonan atau laporan yang anda hantar akan dipaparkan di sini berserta jawapan admin.", "Tickets you submit will be tracked here along with admin feedback.")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((tk) => {
              const kindMeta = KIND_CONFIG.find((k) => k.key === tk.kind) || KIND_CONFIG[0]
              const KindIcon = kindMeta.icon
              const statusMeta = STATUS_CONFIG[tk.status] || STATUS_CONFIG.new
              const priorityMeta = PRIORITY_CONFIG[tk.priority] || PRIORITY_CONFIG.medium

              return (
                <div
                  key={tk.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 transition-all hover:bg-[var(--surface-tint-strong)]/80 hover:border-[var(--border-strong)]"
                >
                  {/* Top Bar: Kind + Status + Priority + Time */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--divider)]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.68rem] font-bold border",
                          kindMeta.badgeBg
                        )}
                      >
                        <KindIcon size={11} />
                        <span>{tr(kindMeta.labelBm, kindMeta.labelEn)}</span>
                      </span>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.68rem] font-bold border",
                          priorityMeta.bg,
                          priorityMeta.text
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", priorityMeta.dot)} />
                        <span>{tr(priorityMeta.labelBm, priorityMeta.labelEn)}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold border",
                          statusMeta.badge
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                        <span>{tr(statusMeta.labelBm, statusMeta.labelEn)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="pt-2.5">
                    <h3 className="text-xs md:text-sm font-bold text-[var(--text)] leading-snug">
                      {tk.title}
                    </h3>
                    {tk.description && (
                      <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
                        {tk.description}
                      </p>
                    )}
                  </div>

                  {/* Admin Feedback Box if available */}
                  {tk.admin_note && (
                    <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-sky-600 dark:text-sky-400 mb-1">
                        <MessageSquare size={13} />
                        <span>{tr("Maklum Balas Admin", "Admin Response")}</span>
                      </div>
                      <p className="text-[var(--text)] leading-relaxed">{tk.admin_note}</p>
                    </div>
                  )}

                  {/* Timestamp Footer */}
                  <div className="mt-2.5 flex items-center justify-between text-[0.68rem] text-[var(--muted)]">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      <span>{formatTimestamp(tk.created_at)}</span>
                    </span>
                    <span className="font-mono text-[0.65rem] opacity-70">#{tk.id}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
}
