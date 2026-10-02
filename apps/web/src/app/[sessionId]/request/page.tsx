"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
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
  User,
  ShieldCheck,
  Bot,
  Headphones,
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

type DiscussionMessage = {
  id: string
  sender: "user" | "admin"
  text: string
  title?: string
  timestamp?: string | null
}

const KIND_CONFIG = [
  {
    key: "feature",
    labelBm: "Cadang Ciri",
    labelEn: "Feature",
    descBm: "Fungsi baharu",
    descEn: "New feature",
    icon: Lightbulb,
    badgeBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    borderActive: "border-violet-500/60 bg-violet-500/5",
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  {
    key: "support",
    labelBm: "Bantuan",
    labelEn: "Support",
    descBm: "Pertanyaan akaun",
    descEn: "Account help",
    icon: LifeBuoy,
    badgeBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    borderActive: "border-orange-500/60 bg-orange-500/5",
    iconBg: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
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
    dot: "bg-neutral-300 dark:bg-neutral-600",
    bg: "bg-[var(--surface-tint-strong)] border-transparent",
    text: "text-[var(--muted)]",
  },
  medium: {
    labelBm: "Biasa",
    labelEn: "Medium",
    dot: "bg-neutral-500",
    bg: "bg-[var(--surface-tint-strong)] border-transparent",
    text: "text-[var(--text-soft)]",
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
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25",
    dot: "bg-orange-500",
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
  const [error, setError] = useState("")
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateSheet, setShowCreateSheet] = useState(false)

  // Filtering & Search
  const [kindFilter, setKindFilter] = useState<string>("support")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Ticket Chat / Discussion Modal
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [serverReplies, setServerReplies] = useState<Record<number, DiscussionMessage[]>>({})
  const [userReplyText, setUserReplyText] = useState("")
  const [replying, setReplying] = useState(false)
  const [replyError, setReplyError] = useState("")
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", {
        detail: { hidden: showCreateSheet || Boolean(selectedTicket) },
      })
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } })
      )
    }
  }, [showCreateSheet, selectedTicket])

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
        const list: Ticket[] = Array.isArray(data) ? data : []
        setTickets(list)
        setSelectedTicket((prev) => {
          if (!prev) return null
          const updated = list.find((t) => t.id === prev.id)
          return updated || prev
        })
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

  const loadReplies = useCallback(
    async (ticketId: number) => {
      try {
        const r = await fetch(`/api/support/tickets/${ticketId}/replies`, {
          credentials: "include",
          headers:
            token && token !== "cookie"
              ? { Authorization: `Bearer ${token}` }
              : {},
          cache: "no-store",
        })
        if (r.ok) {
          const data = (await r.json()) as {
            id: number
            sender: string
            body: string
            created_at?: string | null
          }[]
          const msgs: DiscussionMessage[] = (Array.isArray(data) ? data : []).map(
            (m) => ({
              id: `srv-${m.id}`,
              sender: m.sender === "admin" ? "admin" : "user",
              text: m.body,
              timestamp: m.created_at,
            })
          )
          setServerReplies((prev) => ({ ...prev, [ticketId]: msgs }))
        }
      } catch {
        // Ignore
      }
    },
    [token]
  )

  const openTicketChat = useCallback((tk: Ticket) => {
    // Only support tickets have a live chat; other kinds are display-only (status only).
    if (tk.kind !== "support") return
    setSelectedTicket(tk)
    setUserReplyText("")
    setReplyError("")
    void loadReplies(tk.id)
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 150)
  }, [loadReplies])

  const closeTicketChat = useCallback(() => {
    setSelectedTicket(null)
    setUserReplyText("")
    setReplyError("")
  }, [])

  const { requestClose: requestCreateSheetClose } = useOverlayBackClose({
    id: "request-create-sheet",
    isOpen: showCreateSheet,
    onClose: closeCreateSheet,
  })

  const { requestClose: requestChatClose } = useOverlayBackClose({
    id: "request-chat-sheet",
    isOpen: Boolean(selectedTicket),
    onClose: closeTicketChat,
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
      closeCreateSheet()
      await loadMine()
    } catch {
      setError(tr("Ralat rangkaian. Sila cuba lagi.", "Network error. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendChatMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTicket || !userReplyText.trim()) return
    const textToSend = userReplyText.trim()
    setReplying(true)
    setReplyError("")

    try {
      const r = await fetch(`/api/support/tickets/${selectedTicket.id}/reply`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ reply: textToSend }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        const errMsg = (d && (d.detail || d.message)) || tr("Gagal menghantar mesej.", "Failed to send message.")
        setReplyError(errMsg)
        return
      }

      setUserReplyText("")
      await loadReplies(selectedTicket.id)
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 100)
      await loadMine()
    } catch {
      setReplyError(tr("Ralat rangkaian. Sila cuba lagi.", "Network error. Please try again."))
    } finally {
      setReplying(false)
    }
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false
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
  }, [tickets, kindFilter, statusFilter, searchQuery])

  const stats = useMemo(() => {
    const total = tickets.length
    const inProgress = tickets.filter((t) => t.status === "in_progress" || t.status === "new").length
    const resolved = tickets.filter((t) => t.status === "resolved").length
    return { total, inProgress, resolved }
  }, [tickets])

  function parseDateSafe(isoStr?: string | null): Date | null {
    if (!isoStr) return null
    try {
      // API returns naive UTC datetimes (no timezone). Treat as UTC so the
      // browser renders it in the user's local timezone.
      const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(isoStr.trim())
      const normalized = hasZone ? isoStr : isoStr.trim() + "Z"
      const d = new Date(normalized)
      return Number.isNaN(d.getTime()) ? null : d
    } catch {
      return null
    }
  }

  function formatTimestamp(isoStr?: string | null) {
    const d = parseDateSafe(isoStr)
    if (!d) return isoStr || "—"
    try {
      return d.toLocaleDateString(isBm ? "ms-MY" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return isoStr || "—"
    }
  }

  function formatChatTime(isoStr?: string | null) {
    const d = parseDateSafe(isoStr)
    if (!d) return ""
    try {
      return d.toLocaleTimeString(isBm ? "ms-MY" : "en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return ""
    }
  }

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { support: 0, bug: 0, feature: 0 }
    for (const t of tickets) counts[t.kind] = (counts[t.kind] || 0) + 1
    return counts
  }, [tickets])

  const listCardClass =
    "overflow-hidden rounded-[1.25rem] bg-[var(--card)] shadow-[var(--shadow-card)] divide-y divide-[color-mix(in_srgb,var(--divider)_55%,transparent)]"

  // ─── Summary, in the home's plain style ───
  const renderSummary = () => (
    <section className="px-2">
      <p className="text-sm font-semibold text-[var(--muted)]">{tr("Tiket anda", "Your tickets")}</p>
      {!loaded ? (
        <div className="mt-1 h-10 w-24 animate-pulse rounded-lg bg-[var(--surface-tint-strong)]" />
      ) : (
        <p className="mt-0.5 text-[2.5rem] font-black leading-none tracking-tight tabular-nums text-[var(--text)]">{stats.total}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          {loaded ? stats.inProgress : "—"} {tr("aktif", "active")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <Check size={12} strokeWidth={3} />
          {loaded ? stats.resolved : "—"} {tr("selesai", "resolved")}
        </span>
      </div>
    </section>
  )

  // ─── Support / Bug / Feature switch ───
  const renderKindTabs = () => (
    <div role="tablist" className="flex w-full rounded-full bg-[var(--surface-tint-strong)] p-1">
      {(["support", "bug", "feature"] as const).map((key) => {
        const meta = KIND_CONFIG.find((k) => k.key === key)!
        const Icon = meta.icon
        const isSelected = kindFilter === key
        return (
          <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            key={key}
            onClick={() => setKindFilter(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-black transition active:scale-[0.98]",
              isSelected ? "bg-[var(--card)] text-[var(--text)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]" : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <Icon size={14} />
            <span className="truncate">{key === "support" ? "Support" : key === "bug" ? "Bug" : "Feature"}</span>
            <span className="tabular-nums text-[var(--muted)]">{kindCounts[key] || 0}</span>
          </button>
        )
      })}
    </div>
  )

  // ─── Status chips ───
  const renderStatusChips = () => {
    const ofKind = kindFilter === "all" ? tickets : tickets.filter((t) => t.kind === kindFilter)
    const chips = [
      { key: "all", labelBm: "Semua", labelEn: "All", count: ofKind.length },
      { key: "new", labelBm: "Baru", labelEn: "New", count: ofKind.filter((t) => t.status === "new").length },
      { key: "in_progress", labelBm: "Dalam Proses", labelEn: "In Progress", count: ofKind.filter((t) => t.status === "in_progress").length },
      { key: "resolved", labelBm: "Selesai", labelEn: "Resolved", count: ofKind.filter((t) => t.status === "resolved").length },
      { key: "closed", labelBm: "Ditutup", labelEn: "Closed", count: ofKind.filter((t) => t.status === "closed").length },
    ]
    return (
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none">
        {chips.map((f) => {
          const isSelected = statusFilter === f.key
          return (
            <button
              type="button"
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95",
                isSelected ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--card)] text-[var(--muted)] shadow-[var(--shadow-card)] hover:text-[var(--text)]"
              )}
            >
              <span>{tr(f.labelBm, f.labelEn)}</span>
              <span className={cn("tabular-nums", isSelected ? "opacity-60" : "")}>{f.count}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderSearch = () => (
    <div className="relative w-full">
      <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={tr("Cari tajuk permohonan atau mesej…", "Search request tickets…")}
        className="h-11 w-full rounded-full border-0 bg-[var(--card)] pl-10 pr-10 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-card)] outline-none transition placeholder:font-medium placeholder:text-[var(--muted)]/70 focus:ring-2 focus:ring-orange-500/30"
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          aria-label={tr("Kosongkan carian", "Clear search")}
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center rounded-[1.25rem] bg-[var(--card)] px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <div className="grid h-14 w-14 place-items-center rounded-[1.1rem] bg-orange-500/10 text-orange-600 dark:text-orange-400">
        <Inbox size={26} />
      </div>
      <p className="mt-4 text-base font-black text-[var(--text)]">
        {searchQuery || statusFilter !== "all"
          ? tr("Tiada tiket sepadan", "No matching tickets")
          : tr("Tiada permohonan dibuat lagi", "No requests submitted yet")}
      </p>
      <p className="mt-1.5 max-w-xs text-xs font-medium leading-relaxed text-[var(--muted)]">
        {searchQuery || statusFilter !== "all"
          ? tr("Cuba ubah kata carian atau tetapan penapis anda.", "Try changing your search term or filter selection.")
          : tr("Permohonan atau laporan yang anda hantar akan dipaparkan di sini berserta jawapan admin.", "Tickets you submit will be tracked here along with admin feedback.")}
      </p>
      <button
        type="button"
        onClick={openCreateSheet}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--text)] px-5 py-2.5 text-xs font-black text-[var(--bg)] transition active:scale-95"
      >
        <Plus size={14} strokeWidth={3} />
        <span>{tr("Permohonan Baru", "New Request")}</span>
      </button>
    </div>
  )

  // ─── One ticket in the list (phone and desktop share it) ───
  const renderTicketRow = (tk: Ticket) => {
    const kindMeta = KIND_CONFIG.find((k) => k.key === tk.kind) || KIND_CONFIG[0]
    const KindIcon = kindMeta.icon
    const statusMeta = STATUS_CONFIG[tk.status] || STATUS_CONFIG.new
    const priorityMeta = PRIORITY_CONFIG[tk.priority] || PRIORITY_CONFIG.medium
    const isSupport = tk.kind === "support"
    const isDone = tk.status === "resolved" || tk.status === "closed"

    return (
      <div
        key={tk.id}
        onClick={() => openTicketChat(tk)}
        className={cn("flex items-start gap-3 px-4 py-3.5 transition-colors", isSupport && "cursor-pointer hover:bg-[var(--surface-tint)]/40 active:bg-[var(--surface-tint)]")}
      >
        <span className={cn("mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem]", kindMeta.iconBg, isDone && "opacity-60")}>
          <KindIcon size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className={cn("min-w-0 text-[0.9375rem] font-bold leading-snug tracking-tight text-[var(--text)] line-clamp-2", isDone && "text-[var(--text-soft)]")}>
              {tk.title}
            </h3>
            <span className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-black", statusMeta.badge)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
              {tr(statusMeta.labelBm, statusMeta.labelEn)}
            </span>
          </div>

          {tk.description ? <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">{tk.description}</p> : null}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] font-medium text-[var(--muted)]">
            <span className="font-mono">#{tk.id}</span>
            <span aria-hidden>·</span>
            <span>{tr(kindMeta.labelBm, kindMeta.labelEn)}</span>
            <span aria-hidden>·</span>
            <span className={cn("inline-flex items-center gap-1 font-bold", priorityMeta.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", priorityMeta.dot)} />
              {tr(priorityMeta.labelBm, priorityMeta.labelEn)}
            </span>
            <span aria-hidden>·</span>
            <span>{formatTimestamp(tk.created_at)}</span>
          </div>

          {/* Only support tickets have a chat; bug/feature show their status only. */}
          {isSupport ? (
            tk.admin_note ? (
              <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-orange-500/10 px-3 py-2 text-xs">
                <MessageSquare size={14} className="shrink-0 text-orange-600 dark:text-orange-400" />
                <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                  <span className="font-bold text-orange-700 dark:text-orange-300">{tr("Admin: ", "Admin: ")}</span>
                  {tk.admin_note}
                </span>
                <ChevronRight size={14} className="shrink-0 text-orange-600 dark:text-orange-400" />
              </div>
            ) : (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--text-soft)]">
                <MessageSquare size={13} />
                {tr("Buka chat tiket", "Open ticket chat")}
                <ChevronRight size={13} />
              </span>
            )
          ) : null}
        </div>
      </div>
    )
  }

  const renderList = (skeletonRows: number) =>
    !loaded ? (
      <div className={listCardClass}>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3.5">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-[0.95rem] bg-[var(--surface-tint-strong)]" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-[var(--surface-tint-strong)]" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--surface-tint-strong)]" />
            </div>
          </div>
        ))}
      </div>
    ) : filteredTickets.length === 0 ? (
      renderEmpty()
    ) : (
      <div className={listCardClass}>{filteredTickets.map((tk) => renderTicketRow(tk))}</div>
    )

  // ─── Desktop side panel ───
  const renderSidePanel = () => (
    <aside className="grid content-start gap-3 md:grid-cols-2 lg:sticky lg:top-20 lg:grid-cols-1">
      <div className="rounded-[1.25rem] bg-[var(--card)] p-5 shadow-[var(--shadow-card)]">{renderSummary()}</div>
      <div className="rounded-[1.25rem] bg-[var(--card)] p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm font-black text-[var(--text)]">{tr("Perlukan bantuan?", "Need a hand?")}</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-[var(--muted)]">
          {tr(
            "Tiket Support ada chat terus dengan admin. Laporan Bug dan cadangan Feature dikemas kini melalui statusnya.",
            "Support tickets come with a direct chat with admin. Bug reports and feature ideas are updated through their status."
          )}
        </p>
        <button
          type="button"
          onClick={openCreateSheet}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs font-black text-[var(--btn-primary-text)] transition active:scale-[0.98]"
        >
          <Plus size={14} strokeWidth={3} />
          {tr("Permohonan Baru", "New Request")}
        </button>
      </div>
    </aside>
  )

  return (
    <div className="pb-20 md:pb-0">
      {/* ── Mobile ── */}
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

        {renderSummary()}

        <div className="space-y-3 px-1">
          {renderKindTabs()}
          {renderStatusChips()}
          {renderSearch()}
        </div>

        <section className="px-1">{renderList(3)}</section>
      </div>

      {/* ── Desktop ── */}
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
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)] shadow-[var(--shadow-card)] transition hover:bg-[var(--surface-tint)] active:scale-[0.98] disabled:opacity-50"
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

        <DesktopPageBody>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="lg:order-2">{renderSidePanel()}</div>
            <div className="min-w-0 space-y-4 lg:order-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-full max-w-[22rem]">{renderKindTabs()}</div>
                <div className="min-w-[16rem] flex-1">{renderSearch()}</div>
              </div>
              {renderStatusChips()}
              {renderList(4)}
            </div>
          </div>
        </DesktopPageBody>
      </div>

      {/* ─── Popup Sheet / Modal for Create Request ─── */}
      {mounted && showCreateSheet
        ? createPortal(
            <div
              className="fixed inset-0 z-[140] flex h-[100dvh] w-screen items-end justify-center bg-[var(--overlay)] p-0 md:items-center md:p-4"
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
                                  ? `${item.borderActive} shadow-xs`
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

      {/* ─── Ticket Live Chat Interface Modal (Styled like /chat page) ─── */}
      {mounted && selectedTicket
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-end justify-center bg-[var(--overlay)] p-0 md:items-center md:p-4"
              onClick={requestChatClose}
            >
              <div
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel relative flex h-[88dvh] max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--card)] shadow-2xl md:h-[82vh] md:max-w-lg md:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                {/* ── Chat Header ── */}
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                      <Headphones size={20} />
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--card)] bg-emerald-500" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-black text-[var(--text)]">
                          {selectedTicket.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 text-[0.65rem] font-bold text-[var(--muted)]">
                        <span>#{selectedTicket.id}</span>
                        <span>·</span>
                        {(() => {
                          const sm = STATUS_CONFIG[selectedTicket.status] || STATUS_CONFIG.new
                          return (
                            <span className="inline-flex items-center gap-1">
                              <span className={cn("h-1.5 w-1.5 rounded-full", sm.dot)} />
                              <span>{tr(sm.labelBm, sm.labelEn)}</span>
                            </span>
                          )
                        })()}
                        <span>·</span>
                        {(() => {
                          const pm = PRIORITY_CONFIG[selectedTicket.priority] || PRIORITY_CONFIG.medium
                          return <span className={pm.text}>{tr(pm.labelBm, pm.labelEn)}</span>
                        })()}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={requestChatClose}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] active:scale-95 transition"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* ── Chat Message Stream (Feed) ── */}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 bg-[var(--bg)]/50">
                  {/* Date separator */}
                  <div className="flex items-center justify-center my-2">
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-0.5 text-[0.65rem] font-bold text-[var(--muted)] shadow-2xs">
                      {formatTimestamp(selectedTicket.created_at)}
                    </span>
                  </div>

                  {/* 1. Initial User Ticket Message Bubble */}
                  <div className="flex flex-col items-end space-y-1">
                    <div className="flex items-center gap-1.5 pr-1 text-[0.65rem] font-bold text-[var(--muted)]">
                      <span>{tr("Anda", "You")}</span>
                      <span>·</span>
                      <span>{formatChatTime(selectedTicket.created_at)}</span>
                    </div>
                    <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-[var(--text)] text-[var(--bg)] p-3.5 shadow-sm text-xs leading-relaxed">
                      <p className="font-black text-xs md:text-sm mb-1 opacity-95">
                        {selectedTicket.title}
                      </p>
                      <p className="whitespace-pre-wrap opacity-90 leading-relaxed font-medium">
                        {selectedTicket.description || tr("Tiada keterangan tambahan.", "No additional details provided.")}
                      </p>
                    </div>
                  </div>

                  {/* 2. Full Conversation (server replies) */}
                  {(() => {
                    const serverMsgs = serverReplies[selectedTicket.id] || []
                    const hasConversation = serverMsgs.length > 0
                    return hasConversation ? (
                      <>
                        {serverMsgs.map((msg) =>
                          msg.sender === "admin" ? (
                            <div
                              key={msg.id}
                              className="flex flex-col items-start space-y-1"
                            >
                              <div className="flex items-center gap-1.5 pl-1 text-[0.65rem] font-bold text-orange-600 dark:text-orange-400">
                                <ShieldCheck size={13} />
                                <span>{tr("Admin / Sokongan", "Admin Support")}</span>
                                {msg.timestamp ? (
                                  <span className="font-normal text-[var(--muted)]">
                                    · {formatChatTime(msg.timestamp)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="max-w-[85%] rounded-2xl rounded-tl-xs bg-[var(--surface-tint-strong)] p-3.5 shadow-sm text-xs leading-relaxed text-[var(--text)]">
                                <p className="whitespace-pre-wrap font-medium leading-relaxed">
                                  {msg.text}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={msg.id}
                              className="flex flex-col items-end space-y-1"
                            >
                              <div className="flex items-center gap-1.5 pr-1 text-[0.65rem] font-bold text-[var(--muted)]">
                                <span>{tr("Anda", "You")}</span>
                                {msg.timestamp ? (
                                  <span>· {formatChatTime(msg.timestamp)}</span>
                                ) : null}
                              </div>
                              <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-[var(--text)] text-[var(--bg)] p-3.5 shadow-sm text-xs leading-relaxed">
                                <p className="whitespace-pre-wrap opacity-95 leading-relaxed font-medium">
                                  {msg.text}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </>
                    ) : selectedTicket.admin_note ? (
                      <div className="flex flex-col items-start space-y-1 pt-1">
                        <div className="flex items-center gap-1.5 pl-1 text-[0.65rem] font-bold text-orange-600 dark:text-orange-400">
                          <ShieldCheck size={13} />
                          <span>{tr("Admin / Sokongan", "Admin Support")}</span>
                        </div>
                        <div className="max-w-[85%] rounded-2xl rounded-tl-xs bg-[var(--surface-tint-strong)] p-3.5 shadow-sm text-xs leading-relaxed text-[var(--text)]">
                          <p className="whitespace-pre-wrap font-medium leading-relaxed">
                            {selectedTicket.admin_note}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/40 p-3 text-xs text-[var(--muted)]">
                        <Clock size={14} className="shrink-0 text-amber-500" />
                        <span>{tr("Menunggu balasan & semakan daripada pentadbir…", "Awaiting reply & review from administrator…")}</span>
                      </div>
                    )
                  })()}

                  {/* Error Notification */}
                  {replyError && (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{replyError}</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* ── Chat Input Bar (Sticky Footer like /chat) ── */}
                {selectedTicket.status !== "closed" ? (
                  <form
                    onSubmit={handleSendChatMessage}
                    className="border-t border-[var(--border)] bg-[var(--card)] p-3 sm:p-4"
                  >
                    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-1.5 pl-3.5 focus-within:border-[var(--btn-primary-bg)] transition">
                      <input
                        type="text"
                        value={userReplyText}
                        onChange={(e) => setUserReplyText(e.target.value)}
                        placeholder={tr("Tulis mesej kepada admin…", "Type a message to admin…")}
                        className="min-w-0 flex-1 bg-transparent py-1.5 text-xs md:text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none"
                      />

                      <button
                        type="submit"
                        disabled={replying || !userReplyText.trim()}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--btn-primary-bg)] text-white shadow-xs transition active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {replying ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Send size={15} />
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="border-t border-[var(--border)] bg-[var(--card)] p-3.5 text-center text-xs font-medium text-[var(--muted)]">
                    {tr("Tiket ini telah ditutup oleh admin.", "This ticket has been closed by admin.")}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
