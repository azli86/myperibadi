"use client"

import { getWalletAccent as walletAccent } from "@/lib/wallet-accents"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { createPortal } from "react-dom"
import { ArrowLeftRight, Bell, ChevronRight, Eye, EyeClosed, Wallet, X } from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { fetchApiJson, readApiCache } from "@/lib/api-cache"
import { categoryCycleMonthBounds, cycleMonthBounds } from "@/lib/cycle"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useLang } from "@/lib/lang"
import { cn, getTodayDateInTimeZone } from "@/lib/utils"
import { formatCurrencyLabel } from "@/components/ui/MoneyAmount"
import { useAnnouncements } from "@/lib/announcements"
import { AnnouncementList } from "@/components/announcements/AnnouncementList"

// The chart library comes with the popup, and only once the balance is tapped.
const MobileHomeCharts = dynamic(() => import("./MobileHomeCharts"), {
  ssr: false,
  loading: () => (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton-surface h-[290px] rounded-2xl" />
      <div className="skeleton-surface h-[310px] rounded-2xl" />
    </div>
  ),
})
import { usePageAlert } from "@/hooks/usePageAlert"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { AppSheet } from "@/components/ui/AppSheet"
import { onDataChanged, shouldRefetchFor } from "@/hooks/useRealtime"

// The home screen on phones. The full dashboard
// ships two chart libraries and a 3,600-line page before it can paint; this
// shows only the balance, the wallets and the latest activity. It reads the
// same URLs as the dashboard, so both share one cache and show the same
// numbers.

type Txn = {
  id: number
  reference_id?: string | null
  type: "income" | "expense"
  amount: number
  txn_date: string
  created_at?: string | null
  vendor_or_source: string
  wallet_name?: string | null
  category_name?: string | null
  category_icon_name?: string | null
  is_wallet_transfer?: boolean
  is_debt_movement?: boolean
}

type WalletRow = {
  id: number
  name: string
  label?: string | null
  card_color?: string | null
  image_url?: string | null
  balance: number
  currency: string
  type?: string | null
  is_saving?: boolean
  is_bot_default?: boolean | null
  transaction_count?: number | null
  show_on_dashboard?: boolean
  dashboard_rank?: number | null
}

type Stats = { balance: number }

type Profile = {
  name?: string | null
  email?: string | null
  avatar_url?: string | null
  show_hero_amounts?: boolean | null
  cycle_start_day?: number | null
  cycle_mode?: string | null
  onboarding_done?: boolean | null
}

type CycleInfo = { mode?: string | null; month_key?: string | null; salary_dates?: string[] | null }

const URLS = {
  stats: "/api/stats",
  transactions: "/api/transactions",
  user: "/api/users/me",
  cycle: "/api/cycles/me",
  wallets: "/api/wallets",
} as const

// A cold PWA launch is usually hours after the last visit, past the 5-minute
// cache the dashboard uses. Painting last known figures at once and refreshing
// beats a blank screen, so this reads the cache with a long window.
const STALE_OK_MS = 7 * 24 * 60 * 60 * 1000



// Wording as the wallet page's type labels.
const WALLET_KINDS: Record<string, [string, string]> = {
  cash: ["Tunai", "Cash"],
  bank: ["Bank", "Bank"],
  bank_digital: ["Bank Digital", "Digital Bank"],
  ewallet: ["E-Wallet", "E-Wallet"],
  credit_card: ["Kad Kredit", "Credit Card"],
  saving: ["Saving", "Saving"],
  shared: ["Kongsi", "Shared"],
  personal: ["Peribadi", "Personal"],
}

function walletKind(w: Pick<WalletRow, "type" | "is_saving">, isBm: boolean) {
  const pair = WALLET_KINDS[String(w.type || "").trim().toLowerCase()]
  const base = pair ? pair[isBm ? 0 : 1] : ""
  return w.is_saving && base !== "Saving" ? [base, "Saving"].filter(Boolean).join(" · ") : base
}

const num = (v: number, digits = 2) =>
  Number(v || 0).toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function MobileHome({
  sessionId,
  onNeedsFullDashboard,
}: {
  sessionId: string
  /** First-login onboarding lives in the full dashboard; hand over when it is due. */
  onNeedsFullDashboard: () => void
}) {
  const { lang, timezone } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showConfirm, alertModal } = usePageAlert(lang)

  const [stats, setStats] = useState<Stats | null>(null)
  const [transactions, setTransactions] = useState<Txn[] | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [cycle, setCycle] = useState<CycleInfo | null>(null)
  const [wallets, setWallets] = useState<WalletRow[] | null>(null)
  const [showAmounts, setShowAmounts] = useState(true)
  const [walletsOpen, setWalletsOpen] = useState(false)
  const [chartsOpen, setChartsOpen] = useState(false)

  // ── Announcement bell ── history of notices published from Mastermind, in a
  // full-screen panel that slides in from the right.
  const { items: notices, unread, seenId, markAllSeen } = useAnnouncements()
  const [bellOpen, setBellOpen] = useState(false)
  const [bellShown, setBellShown] = useState(false)
  // Which notices count as new is fixed when the panel opens, before they are
  // marked seen, so their dots stay visible while the panel is up.
  const [newAbove, setNewAbove] = useState(0)
  const closeBell = useCallback(() => {
    setBellShown(false)
    window.setTimeout(() => setBellOpen(false), 220)
  }, [])
  const { requestClose: requestBellClose } = useOverlayBackClose({ id: "mobile-home-notices", isOpen: bellOpen, onClose: closeBell })
  const openBell = () => {
    setNewAbove(seenId)
    setBellOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setBellShown(true)))
    markAllSeen()
  }
  useEffect(() => {
    if (!bellOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestBellClose()
    }
    document.addEventListener("keydown", onKey)
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: true } }))
    return () => {
      document.removeEventListener("keydown", onKey)
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [bellOpen, requestBellClose])
  // Swipe right to close, the reverse of how the panel came in.
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const [dragX, setDragX] = useState(0)
  const onPanelPointerDown = (e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPanelPointerMove = (e: React.PointerEvent) => {
    const start = swipeRef.current
    if (!start) return
    const dx = e.clientX - start.x
    if (Math.abs(e.clientY - start.y) > Math.abs(dx) && dragX === 0) return
    setDragX(Math.max(0, dx))
  }
  const onPanelPointerUp = () => {
    if (dragX > 80) requestBellClose()
    swipeRef.current = null
    setDragX(0)
  }
  // The Shell shows the same notice as a banner on the home route; the bell
  // replaces it here, so ask for the banner to stay hidden while this is up.
  // The flag on <html> covers the first render after login, when the Shell
  // mounts alongside this and its listener is not attached yet.
  useEffect(() => {
    document.documentElement.dataset.noticeInline = "hidden"
    window.dispatchEvent(new CustomEvent("portal:notice-banner-inline", { detail: { hidden: true } }))
    return () => {
      delete document.documentElement.dataset.noticeInline
      window.dispatchEvent(new CustomEvent("portal:notice-banner-inline", { detail: { hidden: false } }))
    }
  }, [])
  const handoffRef = useRef(onNeedsFullDashboard)
  handoffRef.current = onNeedsFullDashboard

  const applyProfile = useCallback((me: Profile | null) => {
    if (!me) return
    setProfile(me)
    if (typeof me.show_hero_amounts === "boolean") setShowAmounts(me.show_hero_amounts)
    if (me.onboarding_done === false) handoffRef.current()
  }, [])

  const load = useCallback(async () => {
    const token = getAccessToken()
    const cached = {
      stats: readApiCache<Stats>(URLS.stats, token, STALE_OK_MS),
      transactions: readApiCache<Txn[]>(URLS.transactions, token, STALE_OK_MS),
      user: readApiCache<Profile>(URLS.user, token, STALE_OK_MS),
      cycle: readApiCache<CycleInfo>(URLS.cycle, token, STALE_OK_MS),
      wallets: readApiCache<WalletRow[]>(URLS.wallets, token, STALE_OK_MS),
    }
    if (cached.stats) setStats(cached.stats)
    if (cached.transactions) setTransactions(cached.transactions)
    if (cached.user) applyProfile(cached.user)
    if (cached.cycle) setCycle(cached.cycle)
    if (cached.wallets) setWallets(cached.wallets)

    const [s, t, u, c, w] = await Promise.allSettled([
      fetchApiJson<Stats>(URLS.stats, token),
      fetchApiJson<Txn[]>(URLS.transactions, token),
      fetchApiJson<Profile>(URLS.user, token),
      fetchApiJson<CycleInfo>(URLS.cycle, token),
      fetchApiJson<WalletRow[]>(URLS.wallets, token),
    ])
    if (s.status === "fulfilled") setStats(s.value)
    if (t.status === "fulfilled") setTransactions(Array.isArray(t.value) ? t.value : [])
    if (u.status === "fulfilled") applyProfile(u.value)
    if (c.status === "fulfilled") setCycle(c.value)
    if (w.status === "fulfilled") setWallets(Array.isArray(w.value) ? w.value : [])
  }, [applyProfile])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () =>
      onDataChanged(({ resource }) => {
        if (shouldRefetchFor(resource, "transactions")) void load()
      }),
    [load]
  )

  // Same once-per-launch notice as the dashboard: an admin answered a ticket.
  useEffect(() => {
    const token = getAccessToken()
    const auth: Record<string, string> = token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch("/api/support/tickets/unread", { credentials: "include", headers: auth, cache: "no-store" })
        if (!r.ok) return
        const list = (await r.json()) as { id: number; title: string }[]
        if (cancelled || !list.length) return
        const first = list[0]
        const more = list.length > 1 ? (isBm ? ` (+${list.length - 1} lagi)` : ` (+${list.length - 1} more)`) : ""
        showConfirm(
          isBm ? "Balasan daripada sokongan" : "Reply from support",
          isBm
            ? `Tiket #${first.id} "${first.title}" ada balasan.${more}`
            : `Ticket #${first.id} "${first.title}" has a reply.${more}`,
          () => {
            void Promise.all(
              list.map((t) =>
                fetch(`/api/support/tickets/${t.id}/read`, { method: "POST", credentials: "include", headers: auth }).catch(() => {})
              )
            )
          },
          "info"
        )
      } catch {
        // A failed popup must never break the home screen.
      }
    })()
    return () => {
      cancelled = true
    }
    // Once per mount; showConfirm's identity is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleAmounts = () => {
    setShowAmounts((prev) => {
      const next = !prev
      const token = getAccessToken()
      void fetch("/api/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ show_hero_amounts: next }),
      }).catch(() => {})
      window.dispatchEvent(new CustomEvent("budget-hero-amounts", { detail: { show: next } }))
      return next
    })
  }

  // Income and spend for the current cycle, computed exactly as the dashboard
  // hero does, so the two screens never disagree.
  const month = useMemo(() => {
    if (!transactions) return null
    // The dashboard takes the mode from the profile, then lets /cycles/me override it.
    const mode = cycle ? (cycle.mode === "category" ? "category" : "day") : profile?.cycle_mode === "category" ? "category" : "day"
    const monthKey =
      mode === "category" && cycle?.month_key ? cycle.month_key : getTodayDateInTimeZone(timezone).slice(0, 7)
    const startDay = Math.min(28, Math.max(1, Number(profile?.cycle_start_day || 1)))
    const bounds =
      mode === "category" ? categoryCycleMonthBounds(cycle?.salary_dates || [], monthKey) : cycleMonthBounds(monthKey, startDay)
    const start = bounds ? (bounds.start instanceof Date ? bounds.start.toISOString().slice(0, 10) : bounds.start) : null
    const end = bounds ? (bounds.end instanceof Date ? bounds.end.toISOString().slice(0, 10) : bounds.end) : null
    let income = 0
    let expense = 0
    for (const tx of transactions) {
      if (tx.is_wallet_transfer || tx.is_debt_movement) continue
      const d = String(tx.txn_date).slice(0, 10)
      const inCycle = start && end ? d >= start && d <= end : d.startsWith(monthKey)
      if (!inCycle) continue
      if (tx.type === "income") income += Number(tx.amount || 0)
      else if (tx.type === "expense") expense += Number(tx.amount || 0)
    }
    return { income, expense }
  }, [transactions, cycle, profile, timezone])

  // Wallets shown on the dashboard, in the order the user dragged them into
  // (dashboard_rank, then balance), exactly as the old dashboard deck.
  const heroWallets = useMemo(() => {
    if (!wallets) return null
    return wallets
      .filter((w) => w.show_on_dashboard !== false)
      .map((w) => ({ ...w, balance: Number(w.balance || 0) }))
      .sort((a, b) => {
        const ra = a.dashboard_rank == null ? Infinity : a.dashboard_rank
        const rb = b.dashboard_rank == null ? Infinity : b.dashboard_rank
        return ra !== rb ? ra - rb : b.balance - a.balance
      })
  }, [wallets])
  // The home card shows the wallet at the top of that order.
  const homeWallet = heroWallets === null ? undefined : heroWallets[0] ?? null

  // ── Drag to reorder (ported from the old dashboard's wallet deck) ──
  // Long-press a row (230ms) to lift it, then drag within its group; the order
  // is saved to /api/wallets/dashboard-order on release.
  type DeckKind = "regular" | "saving"
  const [deckRows, setDeckRows] = useState<WalletRow[] | null>(null)
  const [deckDraggingId, setDeckDraggingId] = useState<number | null>(null)
  const [deckDragY, setDeckDragY] = useState(0)
  const deckHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deckDragRef = useRef<{
    kind: DeckKind
    startIndex: number
    index: number
    startY: number
    startX: number
    rowH: number
    pointerId: number
    activated: boolean
    el: HTMLElement | null
    kindIds: number[]
  } | null>(null)
  useEffect(() => {
    deckDragRef.current = null
    if (!walletsOpen) setDeckRows(null)
  }, [walletsOpen])
  const deckRowsByKind = (kind: DeckKind) =>
    (deckRows ?? heroWallets ?? []).filter((w) => (kind === "saving" ? !!w.is_saving : !w.is_saving))
  const commitDeckOrder = (rows: WalletRow[]) => {
    const orderedIds = rows.map((w) => w.id)
    const visibleIds = new Set(orderedIds)
    const all = wallets || []
    const ranked = rows.map((w, i) => ({ ...w, dashboard_rank: i as number | null }))
    const hidden = all.filter((w) => w.show_on_dashboard === false).map((w) => ({ ...w, dashboard_rank: null }))
    const missing = all.filter((w) => w.show_on_dashboard !== false && !visibleIds.has(w.id))
    setWallets([...ranked, ...hidden, ...missing])
    const token = getAccessToken()
    fetch("/api/wallets/dashboard-order", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ordered_ids: orderedIds }),
    })
      // Refresh the cached list so the next launch opens on the new order.
      .then(() => fetchApiJson<WalletRow[]>(URLS.wallets, token))
      .catch(() => {})
  }
  const clearDeckHoldTimer = () => {
    if (deckHoldTimerRef.current) {
      clearTimeout(deckHoldTimerRef.current)
      deckHoldTimerRef.current = null
    }
  }
  const activateDeckDrag = (kind: DeckKind, wallet: WalletRow) => {
    const meta = deckDragRef.current
    if (!meta || meta.activated || !meta.el) return
    meta.activated = true
    meta.rowH = meta.el.getBoundingClientRect().height || 72
    meta.kindIds = deckRowsByKind(kind).map((w) => w.id)
    meta.el.setPointerCapture?.(meta.pointerId)
    try {
      navigator.vibrate?.(10)
    } catch {}
    setDeckDraggingId(wallet.id)
    setDeckDragY(0)
  }
  const downDeckRow = (e: React.PointerEvent, kind: DeckKind, wallet: WalletRow) => {
    if (e.button !== undefined && e.button !== 0) return
    const idx = deckRowsByKind(kind).findIndex((w) => w.id === wallet.id)
    if (idx < 0) return
    e.stopPropagation()
    clearDeckHoldTimer()
    deckDragRef.current = {
      kind,
      startIndex: idx,
      index: idx,
      startY: e.clientY,
      startX: e.clientX,
      rowH: 0,
      pointerId: e.pointerId,
      activated: false,
      el: e.currentTarget as HTMLElement,
      kindIds: [],
    }
    deckHoldTimerRef.current = setTimeout(() => activateDeckDrag(kind, wallet), 230)
  }
  const moveDeckRow = (e: React.PointerEvent) => {
    const meta = deckDragRef.current
    if (!meta) return
    if (!meta.activated) {
      if (Math.hypot(e.clientX - meta.startX, e.clientY - meta.startY) > 8) {
        clearDeckHoldTimer()
        deckDragRef.current = null
      }
      return
    }
    e.preventDefault()
    const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-deck-kind="${meta.kind}"]`))
    if (!els.length) return
    const y = e.clientY
    let target = els.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return y >= r.top && y <= r.bottom
    })
    if (target < 0) target = y < els[0].getBoundingClientRect().top ? 0 : els.length - 1
    // Only swap once the pointer passes a neighbour's middle, so a boundary
    // position never oscillates between two slots.
    if (target !== meta.index) {
      const nr = els[target]?.getBoundingClientRect()
      if (nr) {
        const mid = nr.top + nr.height / 2
        if ((target > meta.index && y < mid) || (target < meta.index && y > mid)) target = meta.index
      }
    }
    if (target !== meta.index) {
      const id = meta.kindIds[meta.index]
      meta.kindIds.splice(meta.index, 1)
      meta.kindIds.splice(target, 0, id)
      meta.index = target
      setDeckRows((prev) => {
        const base = prev ?? heroWallets ?? []
        const byId = new Map(base.map((w) => [w.id, w]))
        const ordered = meta.kindIds.map((kid) => byId.get(kid)).filter((w): w is WalletRow => !!w)
        return meta.kind === "regular"
          ? [...ordered, ...base.filter((w) => !!w.is_saving)]
          : [...base.filter((w) => !w.is_saving), ...ordered]
      })
    }
    setDeckDragY(e.clientY - meta.startY - (meta.index - meta.startIndex) * meta.rowH)
  }
  const endDeckRow = () => {
    const meta = deckDragRef.current
    if (!meta) return
    clearDeckHoldTimer()
    deckDragRef.current = null
    setDeckDraggingId(null)
    setDeckDragY(0)
    if (meta.activated && meta.startIndex !== meta.index && deckRows && deckRows.length > 1) commitDeckOrder(deckRows)
    setDeckRows(null)
  }
  const cancelDeckRow = () => {
    clearDeckHoldTimer()
    deckDragRef.current = null
    setDeckDraggingId(null)
    setDeckDragY(0)
    setDeckRows(null)
  }

  const activity = useMemo(() => {
    if (!transactions) return null
    const latest = [...transactions]
      .sort((a, b) => {
        const d = String(b.txn_date).localeCompare(String(a.txn_date))
        return d !== 0 ? d : String(b.created_at || "").localeCompare(String(a.created_at || ""))
      })
      .slice(0, 8)
    const today = getTodayDateInTimeZone(timezone)
    const y = new Date(`${today}T12:00:00`)
    y.setDate(y.getDate() - 1)
    const yesterday = y.toISOString().slice(0, 10)
    // A day's net covers every transaction that day, not only the ones shown.
    const netByDay = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.is_wallet_transfer || tx.is_debt_movement) continue
      const d = String(tx.txn_date).slice(0, 10)
      const signed = tx.type === "income" ? Number(tx.amount || 0) : tx.type === "expense" ? -Number(tx.amount || 0) : 0
      netByDay.set(d, (netByDay.get(d) || 0) + signed)
    }
    const groups: { date: string; label: string; net: number; items: Txn[] }[] = []
    for (const tx of latest) {
      const d = String(tx.txn_date).slice(0, 10)
      const label =
        d === today
          ? tr("Hari ini", "Today")
          : d === yesterday
            ? tr("Semalam", "Yesterday")
            : new Date(`${d}T12:00:00`).toLocaleDateString(isBm ? "ms-MY" : "en-MY", { weekday: "short", day: "numeric", month: "short" })
      const last = groups[groups.length - 1]
      if (last && last.date === d) last.items.push(tx)
      else groups.push({ date: d, label, net: Math.round((netByDay.get(d) || 0) * 100) / 100, items: [tx] })
    }
    return groups
  }, [transactions, timezone, tr, isBm])

  const firstName = (profile?.name || profile?.email?.split("@")[0] || "").trim().split(/\s+/)[0]
  const hidden = "••••••"
  const money = (v: number, digits = 2) => (showAmounts ? `RM ${num(v, digits)}` : `RM ${hidden}`)
  const skeleton = (cls: string) => <span aria-hidden className={cn("skeleton-surface inline-block rounded-full align-middle", cls)} />


  return (
    <div className="px-1 pb-24 pt-1 text-[0.8125rem]">
      {/* ── Balance ── option A: no hero card, the number sits on the page. */}
      <section className="px-2 pb-5 pt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-bold text-[var(--muted)]">
            {firstName ? tr(`Hai, ${firstName}`, `Hi, ${firstName}`) : tr("Selamat datang", "Welcome")}
          </p>
          <button
            type="button"
            onClick={openBell}
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
            aria-label={unread ? tr("Pengumuman baru", "New announcement") : tr("Pengumuman", "Announcements")}
            className="relative -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--text)] transition active:scale-90"
          >
            <Bell size={22} />
            {unread ? (
              <span aria-hidden className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full bg-rose-500" style={{ boxShadow: "0 0 0 2px var(--page-bg)" }} />
            ) : null}
          </button>
        </div>

        <p className="mt-5 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
          {tr("Jumlah Baki", "Total Balance")}
        </p>
        {/* The eye sits right after the number it hides. */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {/* Tapping the balance opens the old dashboard's expense charts popup. */}
          <button
            type="button"
            onClick={() => setChartsOpen(true)}
            disabled={stats == null}
            aria-haspopup="dialog"
            aria-label={tr("Lihat graf perbelanjaan", "See spending charts")}
            className="min-w-0 truncate text-left font-black leading-none tracking-tight tabular-nums text-[var(--text)] transition active:opacity-70"
          >
            {stats == null ? (
              skeleton("h-10 w-48")
            ) : (
              <>
                <span className="mr-1.5 align-top text-base font-bold text-[var(--muted)]">RM</span>
                <span className="text-[2.7rem]">{showAmounts ? num(stats.balance) : hidden}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={toggleAmounts}
            aria-label={showAmounts ? tr("Sembunyikan jumlah", "Hide amounts") : tr("Tunjuk jumlah", "Show amounts")}
            aria-pressed={!showAmounts}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition active:scale-90"
          >
            {showAmounts ? <Eye size={20} /> : <EyeClosed size={20} />}
          </button>
        </div>

        {/* This cycle's money in and out, computed as the dashboard hero does. */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          {[
            { key: "in", label: tr("Masuk", "In"), value: month?.income, dot: "var(--income)" },
            { key: "out", label: tr("Keluar", "Out"), value: month?.expense, dot: "var(--expense)" },
          ].map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-extrabold tabular-nums text-[var(--text)] shadow-[var(--shadow-card)]"
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chip.dot }} />
              {chip.label} {chip.value == null ? skeleton("h-3 w-12") : money(chip.value, 0)}
            </span>
          ))}
        </div>

      </section>

      {/* ── Wallet ── the top wallet in the user's dashboard order, drawn as the wallet page draws its cards. */}
      <section aria-labelledby="mobile-wallets-heading">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 id="mobile-wallets-heading" className="text-base font-black text-[var(--text)]">
            {tr("Dompet", "Wallet")}
          </h2>
          <button
            type="button"
            onClick={() => setWalletsOpen(true)}
            disabled={!homeWallet}
            className="-mr-1 flex min-h-10 items-center gap-0.5 px-1 text-xs font-bold text-[var(--muted)] disabled:opacity-40"
          >
            {tr("Semua dompet", "All wallets")}
            {heroWallets && heroWallets.length ? <span className="ml-0.5 tabular-nums">({heroWallets.length})</span> : null}
            <ChevronRight size={14} />
          </button>
        </div>

        {homeWallet === undefined ? (
          <div className="skeleton-surface h-[196px] rounded-2xl" />
        ) : homeWallet === null ? (
          <Link
            href={`/${sessionId}/wallet-settings`}
            className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-[var(--divider)] text-sm font-bold text-[var(--muted)]"
          >
            {tr("Tambah dompet pertama", "Add your first wallet")}
          </Link>
        ) : (
          (() => {
            const w = homeWallet
            const accent = walletAccent(w)
            const count = Number(w.transaction_count || 0)
            return (
              <button
                type="button"
                onClick={() => setWalletsOpen(true)}
                aria-label={tr("Lihat semua dompet", "See all wallets")}
                className="group relative flex h-[196px] w-full flex-col overflow-hidden rounded-2xl p-5 pb-6 text-left shadow-[0_14px_30px_-16px_rgba(0,0,0,0.55)] transition active:scale-[0.98]"
                // The wallet's own colour from its settings, at full strength.
                // Text colours are set inline: the light theme remaps the
                // text-white class to var(--text), which would turn them dark.
                style={{ background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)`, color: "#ffffff" }}
              >
                {w.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.image_url}
                    alt=""
                    className="absolute -right-5 -top-8 h-[135%] w-[62%] rotate-[9deg] object-cover opacity-45 [mask-image:linear-gradient(to_right,transparent_0%,transparent_8%,black_55%)]"
                  />
                ) : null}
                {/* Keeps the left side, where the text sits, readable over any picture. */}
                <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 55%, transparent 85%)" }} />
                <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="relative shrink-0">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full shadow-sm" style={{ background: "rgba(255,255,255,0.2)", color: "#ffffff" }}>
                      {w.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Wallet size={19} />
                      )}
                    </div>
                    {w.is_bot_default ? (
                      <span
                        className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[0.5rem] font-black leading-none shadow-sm"
                        style={{ color: "#ffffff", boxShadow: `0 0 0 2px ${accent.from}` }}
                        title="Bot"
                        aria-label="Bot"
                      >
                        B
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="truncate text-sm font-black tracking-tight" style={{ color: "#ffffff" }}>
                      {w.label || w.name}
                    </p>
                    <p className="mt-1 truncate text-[0.58rem] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {walletKind(w, isBm)}
                    </p>
                  </div>
                </div>

                <div className="relative mt-5">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {tr("Baki", "Balance")}
                  </p>
                  <p className="mt-1 truncate text-2xl font-black tabular-nums tracking-tight" style={{ color: "#ffffff" }}>
                    <span className="mr-1 text-sm font-bold" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {formatCurrencyLabel(w.currency)}
                    </span>
                    {showAmounts ? num(w.balance) : hidden}
                  </p>
                </div>

                <div className="relative mt-auto flex items-center justify-between pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.22)" }}>
                  <span className="truncate text-[0.65rem] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.8)" }}>
                    Prefix: {w.name}
                    {count > 0 ? ` · ${count} ${tr("rekod", "txns")}` : ""}
                  </span>
                  <ChevronRight size={16} className="shrink-0" style={{ color: "rgba(255,255,255,0.8)" }} />
                </div>
              </button>
            )
          })()
        )}
      </section>

      {/* ── Current activity ── the latest transactions, by day, with each day's net. */}
      <section aria-labelledby="mobile-activity-heading" className="mt-5">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 id="mobile-activity-heading" className="text-base font-black text-[var(--text)]">
            {tr("Aktiviti Terkini", "Recent Activity")}
          </h2>
          <Link href={`/${sessionId}/transactions`} className="-mr-1 flex min-h-10 items-center gap-0.5 px-1 text-xs font-bold text-[var(--muted)]">
            {tr("Lihat semua", "See all")}
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="overflow-hidden rounded-[1.5rem] bg-[var(--card)] px-1 pb-1 shadow-[var(--shadow-card)]">
          {activity == null ? (
            <div>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <span className="skeleton-surface h-10 w-10 shrink-0 rounded-2xl" />
                  <span className="flex-1 space-y-2">
                    <span className="skeleton-surface block h-3.5 w-32 rounded-full" />
                    <span className="skeleton-surface block h-3 w-20 rounded-full" />
                  </span>
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm font-semibold text-[var(--muted)]">
              {tr("Belum ada transaksi. Tekan + untuk rekod yang pertama.", "No transactions yet. Tap + to record your first.")}
            </p>
          ) : (
            activity.map((group) => (
              <div key={group.date}>
                <p className="flex items-center justify-between px-3 pb-0.5 pt-3 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">
                  <span>{group.label}</span>
                  <span className="tabular-nums">
                    {group.net === 0 ? "" : `${group.net > 0 ? "+" : "−"}${money(Math.abs(group.net))}`}
                  </span>
                </p>
                <ul>
                  {group.items.map((tx) => {
                    const isTransfer = Boolean(tx.is_wallet_transfer)
                    const isIncome = tx.type === "income"
                    return (
                      <li key={tx.id}>
                        <Link
                          href={`/${sessionId}/transactions/${tx.reference_id || tx.id}`}
                          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition active:bg-[var(--surface-tint-strong)]"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text-soft)]">
                            {isTransfer ? (
                              <ArrowLeftRight size={17} />
                            ) : (
                              <CategoryIconGlyph
                                iconName={tx.category_icon_name}
                                categoryName={tx.category_name || tx.vendor_or_source}
                                kind={isIncome ? "income" : "expense"}
                                size={18}
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-[var(--text)]">
                              {tx.vendor_or_source || tx.category_name || tr("Transaksi", "Transaction")}
                            </span>
                            <span className="mt-0.5 block truncate text-xs font-medium text-[var(--muted)]">
                              {[isTransfer ? tr("Pindahan", "Transfer") : tx.category_name, tx.wallet_name].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-sm font-black tabular-nums",
                              isTransfer
                                ? "text-[var(--muted)]"
                                : isIncome
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-[var(--text)]"
                            )}
                          >
                            {showAmounts ? `${isTransfer ? "" : isIncome ? "+" : "−"}RM ${num(tx.amount)}` : `RM ${hidden}`}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>

      <AppSheet open={chartsOpen} onClose={() => setChartsOpen(false)} id="mobile-home-charts" title={tr("Graf Perbelanjaan", "Expense Charts")} size="xl">
        <MobileHomeCharts transactions={transactions || []} lang={lang} timezone={timezone} />
      </AppSheet>

      <AppSheet
        open={walletsOpen}
        onClose={() => setWalletsOpen(false)}
        id="mobile-home-wallets"
        title={tr("Semua Dompet", "All Wallets")}
        subtitle={`${tr("Jumlah", "Total")} ${showAmounts && stats ? `RM ${num(stats.balance)}` : `RM ${hidden}`}`}
        bodyClassName="space-y-4"
      >
                  <p className="px-1 text-xs font-medium text-[var(--muted)]">
                    {tr(
                      "Tekan lama dan seret untuk susun. Dompet paling atas dipaparkan di page utama.",
                      "Press and hold, then drag to reorder. The top wallet is shown on the home screen."
                    )}
                  </p>
                  {[
                    { key: "regular" as const, label: tr("Dompet", "Wallets"), rows: deckRowsByKind("regular") },
                    { key: "saving" as const, label: tr("Simpanan", "Savings"), rows: deckRowsByKind("saving") },
                  ]
                    .filter((g) => g.rows.length > 0)
                    .map((group) => (
                      <div key={group.key}>
                        <p className="mb-2 flex items-center justify-between px-1 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
                          <span>{group.label}</span>
                          <span className="tabular-nums">{group.rows.length}</span>
                        </p>
                        <ul className="space-y-2">
                          {group.rows.map((w) => {
                            const accent = walletAccent(w)
                            const isDragging = deckDraggingId === w.id
                            return (
                              <li
                                key={w.id}
                                data-deck-kind={group.key}
                                onPointerDown={(e) => downDeckRow(e, group.key, w)}
                                onPointerMove={moveDeckRow}
                                onPointerUp={endDeckRow}
                                onPointerCancel={cancelDeckRow}
                                onContextMenu={(e) => e.preventDefault()}
                                className="wallet-card-solid relative flex cursor-grab touch-none select-none items-center gap-3 overflow-hidden rounded-[1.25rem] px-4 py-3.5 active:cursor-grabbing"
                                style={{
                                  background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)`,
                                  ...({ "--wallet-from": accent.from } as React.CSSProperties),
                                  WebkitTouchCallout: "none",
                                  ...(isDragging
                                    ? { transform: `translateY(${deckDragY}px) scale(1.03)`, zIndex: 20, boxShadow: "0 18px 40px -12px rgba(0,0,0,0.45)" }
                                    : { transition: "transform 120ms ease" }),
                                }}
                              >
                                <span aria-hidden className="absolute -right-6 -top-8 h-20 w-20 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
                                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                  {w.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <Wallet size={17} strokeWidth={2.3} />
                                  )}
                                  {w.is_bot_default ? (
                                    <span
                                      className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[0.5rem] font-black leading-none"
                                      style={{ color: "#ffffff", boxShadow: `0 0 0 2px ${accent.from}` }}
                                      title="Bot"
                                      aria-label="Bot"
                                    >
                                      B
                                    </span>
                                  ) : null}
                                </span>
                                <span className="relative min-w-0 flex-1">
                                  <span className="block truncate text-sm font-black tracking-tight text-[var(--text)]">{w.label || w.name}</span>
                                  <span className="mt-0.5 block truncate text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                                    {[w.name, walletKind(w, isBm)].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                                <span className="relative shrink-0 text-right text-base font-black tabular-nums tracking-tight text-[var(--text)]">
                                  <span className="mr-1 text-[0.65rem] font-bold text-[var(--muted)]">{formatCurrencyLabel(w.currency)}</span>
                                  {showAmounts ? num(w.balance) : hidden}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}

                  <Link
                    href={`/${sessionId}/wallet-settings`}
                    className="flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-[var(--card)] text-sm font-bold text-[var(--text)] shadow-[var(--shadow-card)]"
                  >
                    {tr("Urus dompet", "Manage wallets")}
                    <ChevronRight size={16} />
                  </Link>
      </AppSheet>

      {bellOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[150]" role="presentation">
              <button
                type="button"
                aria-label={tr("Tutup", "Close")}
                onClick={requestBellClose}
                className={cn("absolute inset-0 bg-[var(--overlay)] transition-opacity duration-200", bellShown ? "opacity-100" : "opacity-0")}
              />
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-notices-title"
                onPointerDown={onPanelPointerDown}
                onPointerMove={onPanelPointerMove}
                onPointerUp={onPanelPointerUp}
                onPointerCancel={onPanelPointerUp}
                className="absolute inset-0 flex flex-col bg-[var(--page-bg)] transition-transform duration-250 ease-out motion-reduce:transition-none"
                style={{
                  transform: bellShown ? `translateX(${dragX}px)` : "translateX(100%)",
                  transitionDuration: dragX ? "0ms" : undefined,
                  touchAction: "pan-y",
                }}
              >
                <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
                  <h2 id="mobile-notices-title" className="text-lg font-black text-[var(--text)]">
                    {tr("Pengumuman", "Announcements")}
                  </h2>
                  <button
                    type="button"
                    onClick={requestBellClose}
                    aria-label={tr("Tutup", "Close")}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--card)] text-[var(--text)] shadow-[var(--shadow-card)]"
                  >
                    <X size={18} />
                  </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <AnnouncementList
                    items={notices}
                    lang={lang}
                    sessionId={sessionId}
                    newAbove={newAbove}
                    onNavigate={() => setBellOpen(false)}
                  />
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {alertModal}
    </div>
  )
}
