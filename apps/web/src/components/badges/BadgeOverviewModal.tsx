"use client"

import { createPortal } from "react-dom"
import Link from "next/link"
import React, { useEffect, useMemo, useState } from "react"
import { ArrowUpRight, Lock, Trophy, X } from "lucide-react"
import { buildLiveBadges, type AppBadge, type AppBadgeTone, type BadgeBudgetItemLike, type BadgeTransactionLike } from "@/lib/badges"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"

type BadgeOverviewModalProps = {
  open: boolean
  onClose: () => void
  sessionId: string
  lang: string
}

function BadgeSvg({
  icon,
  tone,
  animated = true,
  size = "sm",
  locked = false,
}: {
  icon: AppBadge["icon"]
  tone: AppBadgeTone
  animated?: boolean
  size?: "sm" | "md" | "lg"
  locked?: boolean
}) {
  const toneMap: Record<AppBadgeTone, { top: string; left: string; right: string; base: string; glow: string; spark: string }> = {
    cyan: { top: "#a5f3fc", left: "#22d3ee", right: "#0ea5e9", base: "#083344", glow: "rgba(34,211,238,0.32)", spark: "#cffafe" },
    gold: { top: "#fde68a", left: "#f59e0b", right: "#f97316", base: "#3b2206", glow: "rgba(245,158,11,0.30)", spark: "#fff7cc" },
    emerald: { top: "#a7f3d0", left: "#34d399", right: "#10b981", base: "#07261d", glow: "rgba(16,185,129,0.30)", spark: "#d1fae5" },
    violet: { top: "#ddd6fe", left: "#a78bfa", right: "#8b5cf6", base: "#1d1238", glow: "rgba(139,92,246,0.30)", spark: "#ede9fe" },
    rose: { top: "#fecdd3", left: "#fb7185", right: "#f43f5e", base: "#34101b", glow: "rgba(244,63,94,0.30)", spark: "#ffe4e6" },
    blue: { top: "#bfdbfe", left: "#60a5fa", right: "#2563eb", base: "#091b3a", glow: "rgba(37,99,235,0.32)", spark: "#dbeafe" },
  }
  const toneStyle = toneMap[tone]
  const sizeClass = size === "lg" ? "h-[5.5rem] w-[5.5rem]" : size === "md" ? "h-14 w-14" : "h-11 w-11"

  const innerIcon = (() => {
    switch (icon) {
      case "verified":
        return <path d="M-16 2 l10 10 l22 -24" fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      case "active":
        return <path d="M0 -22 l6 12 l14 2 l-10 9 l3 14 l-13 -7 l-13 7 l3 -14 l-10 -9 l14 -2 z" fill="white" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      case "streak":
        return <path d="M3 -24 C15 -13 13 -1 4 6 C13 5 18 16 11 24 C0 20 -10 9 -10 -1 C-10 -11 -3 -18 3 -24 Z" fill="white" />
      case "budget":
        return <><circle cx="0" cy="0" r="18" fill="none" stroke="white" strokeWidth="8" /><path d="M0 -18 L0 0 L13 8" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" /></>
      case "receipt":
        return <path d="M-14 -20 h28 v40 l-6 -4 l-8 4 l-8 -4 l-6 4 z M-8 -7 h12 M-8 4 h16 M-8 14 h10" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      case "bot":
        return <path d="M0 -23 v8 M-18 -10 h36 v26 h-36 z M-8 0 h0 M8 0 h0 M-10 12 h20" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      default:
        return <path d="M-16 2 l10 10 l22 -24" fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    }
  })()

  return (
    <div className={`relative grid place-items-center overflow-visible ${sizeClass} ${animated && !locked ? "gem-motion" : ""} ${locked ? "opacity-55 grayscale-[0.35]" : ""}`}>
      <style jsx>{`
        @keyframes gemFloat { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-5px) scale(1.03); } }
        @keyframes gemGlow { 0%, 100% { transform: scale(1); opacity: .2; } 50% { transform: scale(1.12); opacity: .42; } }
        @keyframes gemSpark { 0%, 100% { transform: scale(.7) rotate(0deg); opacity: .18; } 45% { transform: scale(1.16) rotate(14deg); opacity: 1; } }
        @keyframes gemShine { 0% { transform: translateX(-52px) translateY(12px) rotate(-24deg); opacity: 0; } 30% { opacity: .66; } 68%, 100% { transform: translateX(54px) translateY(-12px) rotate(-24deg); opacity: 0; } }
        .gem-motion :global(.gem-main) { animation: gemFloat 2.8s ease-in-out infinite; transform-origin: center; }
        .gem-motion :global(.gem-glow) { animation: gemGlow 2.3s ease-in-out infinite; transform-origin: center; }
        .gem-motion :global(.gem-spark-a) { animation: gemSpark 1.9s ease-in-out infinite; transform-origin: center; }
        .gem-motion :global(.gem-spark-b) { animation: gemSpark 2.15s ease-in-out infinite .22s; transform-origin: center; }
        .gem-motion :global(.gem-shine) { animation: gemShine 2.8s ease-in-out infinite; transform-origin: center; }
      `}</style>
      <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
        <defs>
          <clipPath id={`modal-gem-clip-${tone}-${icon}-${size}-${locked ? "l" : "u"}`}>
            <path d="M80 18 L116 54 L104 110 L80 142 L56 110 L44 54 Z" />
          </clipPath>
        </defs>
        {!locked && <ellipse className="gem-glow" cx="80" cy="86" rx="46" ry="50" fill={toneStyle.glow} />}
        {!locked && <path className="gem-spark-a" d="M26 50 l4 9 9 3-9 4-4 9-4-9-9-4 9-3z" fill={toneStyle.spark} />}
        {!locked && <path className="gem-spark-b" d="M128 112 l4 9 9 3-9 4-4 9-4-9-9-4 9-3z" fill={toneStyle.spark} />}
        <g className="gem-main drop-shadow-[0_18px_24px_rgba(15,23,42,0.28)]">
          <path d="M80 18 L116 54 L104 110 L80 142 L56 110 L44 54 Z" fill={toneStyle.base} />
          <path d="M80 18 L116 54 L80 72 L44 54 Z" fill={toneStyle.top} />
          <path d="M44 54 L80 72 L56 110 Z" fill={toneStyle.left} />
          <path d="M116 54 L80 72 L104 110 Z" fill={toneStyle.right} />
          <path d="M56 110 L80 72 L104 110 L80 142 Z" fill={toneStyle.base} opacity="0.92" />
          {!locked && (
            <g clipPath={`url(#modal-gem-clip-${tone}-${icon}-${size}-u)`}>
              <rect className="gem-shine" x="26" y="22" width="20" height="116" rx="10" fill="white" opacity="0.52" />
            </g>
          )}
          <g transform="translate(80 82)">{innerIcon}</g>
        </g>
      </svg>
    </div>
  )
}

function ProgressRing({ percent, size = 112 }: { percent: number; size?: number }) {
  const stroke = 7
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--text)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  )
}

export default function BadgeOverviewModal({ open, onClose, sessionId, lang }: BadgeOverviewModalProps) {
  const [transactions, setTransactions] = useState<BadgeTransactionLike[]>([])
  const [budgetItems, setBudgetItems] = useState<BadgeBudgetItemLike[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const loadBadgeData = async () => {
      setLoading(true)
      const token = getAccessToken()
      const authHeaders = token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : undefined
      const monthKey = new Date().toISOString().slice(0, 7)

      try {
        const [transactionsRes, budgetsRes] = await Promise.all([
          fetch("/api/transactions", { cache: "no-store", credentials: "include", headers: authHeaders }),
          fetch(`/api/budgets?month=${monthKey}`, { cache: "no-store", credentials: "include", headers: authHeaders }),
        ])
        if (cancelled) return
        if (transactionsRes.ok) {
          const data = await transactionsRes.json()
          setTransactions(Array.isArray(data) ? data : [])
        }
        if (budgetsRes.ok) {
          const data = await budgetsRes.json()
          setBudgetItems(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        console.error("Badge modal data fetch error:", error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadBadgeData()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || typeof document === "undefined") return
    const body = document.body
    const previousOverflow = body.style.overflow
    const previousOverscroll = body.style.overscrollBehavior
    body.style.overflow = "hidden"
    body.style.overscrollBehavior = "none"
    return () => {
      body.style.overflow = previousOverflow
      body.style.overscrollBehavior = previousOverscroll
    }
  }, [open])

  const liveBadges = useMemo(() => buildLiveBadges(transactions, budgetItems), [transactions, budgetItems])
  const unlockedBadges = liveBadges.filter((badge) => badge.status === "unlocked")
  const lockedBadges = liveBadges.filter((badge) => badge.status === "locked")
  const primaryBadge = unlockedBadges[0] ?? lockedBadges[0] ?? liveBadges[0]
  const nextBadge = lockedBadges[0]
  const progressPercent = Math.round((unlockedBadges.length / Math.max(liveBadges.length, 1)) * 100)
  const isEN = lang === "EN"

  if (typeof document === "undefined") return null

  if (!open) return null

  return createPortal(
        <div
          className="fixed inset-0 z-[140] flex h-[100dvh] w-screen items-end justify-center overflow-hidden bg-transparent px-0 py-0 sm:items-center sm:px-4 sm:py-6"
          onClick={onClose}
        >
          <div
            className="app-sheet-panel relative flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-[0_-12px_60px_rgba(0,0,0,0.45)] sm:shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <AppSheetHeader
              title={isEN ? "Badge Vault" : "Vault Badge"}
              subtitle={isEN
                ? "Unlock gems as you manage money better."
                : "Buka gem bila anda lebih disiplin urus duit."}
              onClose={onClose}
            />

            {/* Body */}
            <div
              className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-3 pt-2 custom-scrollbar"
              onWheel={(event) => event.stopPropagation()}
              onTouchMove={(event) => event.stopPropagation()}
            >
              {/* Hero */}
              <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface-tint)] p-4">
                <div className="relative flex items-center gap-4">
                  <div className="relative grid place-items-center">
                    <ProgressRing percent={progressPercent} />
                    <div className="absolute inset-0 grid place-items-center">
                      {primaryBadge ? (
                        <BadgeSvg icon={primaryBadge.icon} tone={primaryBadge.tone} size="md" locked={primaryBadge.status === "locked"} animated={primaryBadge.status === "unlocked"} />
                      ) : (
                        <Trophy className="text-[var(--muted)]" size={28} />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-lg font-black tracking-[-0.03em] text-[var(--text)]">
                      {primaryBadge
                        ? (isEN ? primaryBadge.titleEN : primaryBadge.titleBM)
                        : (isEN ? "Start recording" : "Mula rekod")}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                      {primaryBadge
                        ? (isEN ? primaryBadge.descEN : primaryBadge.descBM)
                        : (isEN ? "Your first badge unlocks after the first transaction." : "Badge pertama dibuka selepas transaksi pertama.")}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[0.62rem] font-black text-[var(--text)]">
                        <Trophy size={11} />
                        {unlockedBadges.length}/{liveBadges.length}
                      </span>
                      <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[0.62rem] font-black text-[var(--muted)]">
                        {progressPercent}%
                      </span>
                      {loading && (
                        <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[0.62rem] font-bold text-[var(--muted)]">
                          {isEN ? "Syncing…" : "Muat…"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Collection grid */}
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
                    {isEN ? "Collection" : "Koleksi"}
                  </h4>
                  <span className="text-[0.65rem] font-bold text-[var(--muted)]">
                    {isEN ? `${unlockedBadges.length} unlocked` : `${unlockedBadges.length} dibuka`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {liveBadges.map((badge) => {
                    const unlocked = badge.status === "unlocked"
                    return (
                      <div
                        key={badge.key}
                        className={`relative flex flex-col items-center rounded-[18px] border px-2 py-3 text-center transition ${
                          unlocked
                            ? "border-[var(--border)] bg-[var(--surface-tint)]"
                            : "border-[var(--border)] bg-[var(--card)] opacity-80"
                        }`}
                      >
                        {unlocked ? (
                          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--text)]" />
                        ) : (
                          <span className="absolute right-1.5 top-1.5 text-[var(--muted)]">
                            <Lock size={10} />
                          </span>
                        )}
                        <BadgeSvg icon={badge.icon} tone={badge.tone} size="sm" locked={!unlocked} animated={unlocked} />
                        <p className={`mt-2 line-clamp-2 min-h-[2rem] text-[0.62rem] font-black leading-tight tracking-[-0.01em] ${unlocked ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
                          {isEN ? badge.titleEN : badge.titleBM}
                        </p>
                        <span className={`mt-1.5 rounded-full px-1.5 py-0.5 text-[0.5rem] font-black uppercase tracking-[0.12em] ${
                          unlocked
                            ? "bg-[var(--text)]/10 text-[var(--text)]"
                            : "bg-[var(--surface-tint)] text-[var(--muted)]"
                        }`}>
                          {unlocked ? (isEN ? "Live" : "Aktif") : (isEN ? "Locked" : "Kunci")}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Next unlock */}
              {nextBadge && (
                <div className="mt-5 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <BadgeSvg icon={nextBadge.icon} tone={nextBadge.tone} size="sm" locked animated={false} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                        {isEN ? "Next Unlock" : "Unlock Seterusnya"}
                      </p>
                      <p className="mt-1 text-sm font-black tracking-[-0.02em] text-[var(--text)]">
                        {isEN ? nextBadge.titleEN : nextBadge.titleBM}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        {isEN ? nextBadge.ruleEN : nextBadge.ruleBM}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!nextBadge && unlockedBadges.length > 0 && (
                <div className="mt-5 rounded-[20px] border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3.5 text-center">
                  <p className="text-sm font-black text-[var(--text)]">
                    {isEN ? "Vault complete ✨" : "Vault lengkap ✨"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                    {isEN ? "All badges unlocked. Keep the streak going." : "Semua badge dibuka. Teruskan streak anda."}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="relative shrink-0 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4">
              <Link
                href={`/${sessionId}/badges`}
                className="group flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black tracking-[-0.02em] text-[var(--bg)] transition active:scale-[0.985]"
                onClick={onClose}
              >
                {isEN ? "Open Full Badge Page" : "Buka Halaman Badge"}
                <ArrowUpRight size={16} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
        </div>
    ,
    document.body
  )
}
