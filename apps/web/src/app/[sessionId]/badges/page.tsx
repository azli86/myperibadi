"use client"

import Link from "next/link"
import React, { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, Award, BadgeCheck, Bot, Flame, Receipt, ShieldCheck, Sparkles, Star, Target, TrendingUp, Wallet } from "lucide-react"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { APP_BADGES, buildLiveBadges, type AppBadge, type AppBadgeTone, type BadgeBudgetItemLike, type BadgeTransactionLike } from "@/lib/badges"

type BadgeTone = AppBadgeTone
type BadgeIdea = AppBadge
type BadgeApiTransaction = BadgeTransactionLike
type BadgeApiBudgetItem = BadgeBudgetItemLike

const badgeIdeas: BadgeIdea[] = APP_BADGES

function BadgeSvg({ icon, tone, animated = true }: { icon: BadgeIdea["icon"], tone: BadgeTone, animated?: boolean }) {
  const toneMap: Record<BadgeTone, { top: string; left: string; right: string; base: string; glow: string; spark: string }> = {
    cyan: { top: "#a5f3fc", left: "#22d3ee", right: "#0ea5e9", base: "#083344", glow: "rgba(34,211,238,0.32)", spark: "#cffafe" },
    gold: { top: "#fde68a", left: "#f59e0b", right: "#f97316", base: "#3b2206", glow: "rgba(245,158,11,0.30)", spark: "#fff7cc" },
    emerald: { top: "#a7f3d0", left: "#34d399", right: "#10b981", base: "#07261d", glow: "rgba(16,185,129,0.30)", spark: "#d1fae5" },
    violet: { top: "#ddd6fe", left: "#a78bfa", right: "#8b5cf6", base: "#1d1238", glow: "rgba(139,92,246,0.30)", spark: "#ede9fe" },
    rose: { top: "#fecdd3", left: "#fb7185", right: "#f43f5e", base: "#34101b", glow: "rgba(244,63,94,0.30)", spark: "#ffe4e6" },
    blue: { top: "#bfdbfe", left: "#60a5fa", right: "#2563eb", base: "#091b3a", glow: "rgba(37,99,235,0.32)", spark: "#dbeafe" },
  }
  const toneStyle = toneMap[tone]

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
    <div className={cn("relative grid h-28 w-28 place-items-center overflow-visible md:h-32 md:w-32", animated && "gem-motion") }>
      <style jsx>{`
        @keyframes gemFloat { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.03); } }
        @keyframes gemGlow { 0%, 100% { transform: scale(1); opacity: .22; } 50% { transform: scale(1.12); opacity: .4; } }
        @keyframes gemSpark { 0%, 100% { transform: scale(.7) rotate(0deg); opacity: .2; } 45% { transform: scale(1.16) rotate(14deg); opacity: 1; } }
        @keyframes gemShine { 0% { transform: translateX(-52px) translateY(12px) rotate(-24deg); opacity: 0; } 30% { opacity: .66; } 68%, 100% { transform: translateX(54px) translateY(-12px) rotate(-24deg); opacity: 0; } }
        .gem-motion .gem-main { animation: gemFloat 2.8s ease-in-out infinite; transform-origin: center; }
        .gem-motion .gem-glow { animation: gemGlow 2.3s ease-in-out infinite; transform-origin: center; }
        .gem-motion .gem-spark-a { animation: gemSpark 1.9s ease-in-out infinite; transform-origin: center; }
        .gem-motion .gem-spark-b { animation: gemSpark 2.15s ease-in-out infinite .22s; transform-origin: center; }
        .gem-motion .gem-shine { animation: gemShine 2.8s ease-in-out infinite; transform-origin: center; }
      `}</style>
      <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
        <defs>
          <clipPath id={`gem-clip-${tone}`}>
            <path d="M80 18 L116 54 L104 110 L80 142 L56 110 L44 54 Z" />
          </clipPath>
        </defs>
        <ellipse className="gem-glow" cx="80" cy="86" rx="46" ry="50" fill={toneStyle.glow} />
        <path className="gem-spark-a" d="M26 50 l4 9 9 3-9 4-4 9-4-9-9-4 9-3z" fill={toneStyle.spark} />
        <path className="gem-spark-b" d="M128 112 l4 9 9 3-9 4-4 9-4-9-9-4 9-3z" fill={toneStyle.spark} />
        <g className="gem-main drop-shadow-[0_20px_28px_rgba(15,23,42,0.22)]">
          <path d="M80 18 L116 54 L104 110 L80 142 L56 110 L44 54 Z" fill={toneStyle.base} />
          <path d="M80 18 L116 54 L80 72 L44 54 Z" fill={toneStyle.top} />
          <path d="M44 54 L80 72 L56 110 Z" fill={toneStyle.left} />
          <path d="M116 54 L80 72 L104 110 Z" fill={toneStyle.right} />
          <path d="M56 110 L80 72 L104 110 L80 142 Z" fill={toneStyle.base} opacity="0.92" />
          <g clipPath={`url(#gem-clip-${tone})`}>
            <rect className="gem-shine" x="26" y="22" width="20" height="116" rx="10" fill="white" opacity="0.52" />
          </g>
          <g transform="translate(80 82)">{innerIcon}</g>
        </g>
      </svg>
    </div>
  )
}

export default function BadgesPage() {
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const isLight = resolvedTheme === "light"
  const [transactions, setTransactions] = useState<BadgeApiTransaction[]>([])
  const [budgetItems, setBudgetItems] = useState<BadgeApiBudgetItem[]>([])

  useEffect(() => {
    let cancelled = false

    const loadBadgeData = async () => {
      const token = getAccessToken()
      if (!token) return
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
        console.error("Badge data fetch error:", error)
      }
    }

    void loadBadgeData()
    return () => {
      cancelled = true
    }
  }, [])

  const liveBadges = useMemo(() => buildLiveBadges(transactions, budgetItems), [transactions, budgetItems])
  const unlockedCount = liveBadges.filter((badge) => badge.status === "unlocked").length
  const lockedCount = liveBadges.length - unlockedCount
  const nextLockedBadge = liveBadges.find((badge) => badge.status === "locked")
  const progressPercent = Math.round((unlockedCount / liveBadges.length) * 100)

  const surface = isLight
    ? "border-slate-200/80 bg-[var(--card)]"
    : "border-white/[0.08] bg-[var(--card)]"
  const subtext = isLight ? "text-slate-500" : "text-white/58"
  const strong = isLight ? "text-slate-950" : "text-white"
  const chip = isLight ? "bg-[var(--card2)] text-slate-700" : "bg-white/[0.06] text-white/75"

  return (
    <div className="min-h-screen font-sans transition-colors duration-300">
      <div className="mx-auto max-w-md px-4 pb-16 md:max-w-none md:px-0">
        <div className="mb-6 pt-4 md:hidden">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
            <HistoryBackButton
              fallbackHref={`/${sessionId}/settings`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--text)]"
            >
              <ArrowLeft size={20} />
            </HistoryBackButton>
            <h1 className="truncate text-center text-[1.28rem] font-extrabold tracking-tight text-[var(--text)]">
              Reward Badge
            </h1>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)] shadow-lg shadow-black/10">
              <Award size={18} strokeWidth={2.6} />
            </div>
          </div>
        </div>

        <DesktopPageHeader className="hidden md:block" title="Reward Badge" homeHref={`/${sessionId}`} />

        <DesktopPageBody className="mx-auto grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          <article className={cn("rounded-[16px] border p-5 md:col-span-2 xl:col-span-3", surface)}>
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className={cn("text-[0.72rem] font-black uppercase tracking-[0.22em]", subtext)}>
                  {lang === "EN" ? "Your Badges" : "Badge Anda"}
                </p>
                <h2 className={cn("mt-2 text-3xl font-black tracking-tight md:text-4xl", strong)}>
                  {lang === "EN" ? "Achievements" : "Pencapaian"}
                </h2>
                <p className={cn("mt-3 max-w-xl text-sm leading-7 md:text-[0.95rem]", subtext)}>
                  {lang === "EN"
                    ? "Preview visual badge direction first, then connect them to real streaks, budgets, receipts, and connector activity."
                    : "Preview arah visual badge dulu, kemudian baru sambung dengan streak, budget, resit, dan aktiviti connector sebenar."}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 self-start md:self-auto">
                <div className={cn("rounded-2xl px-3 py-2 text-center", chip)}>
                  <p className="text-lg font-black">{liveBadges.length}</p>
                  <p className="text-[0.62rem] uppercase tracking-[0.18em] opacity-70">{lang === "EN" ? "Badges" : "Badge"}</p>
                </div>
                <div className={cn("rounded-2xl px-3 py-2 text-center", chip)}>
                  <p className="text-lg font-black">{unlockedCount}</p>
                  <p className="text-[0.62rem] uppercase tracking-[0.18em] opacity-70">{lang === "EN" ? "Unlocked" : "Dibuka"}</p>
                </div>
                <div className={cn("rounded-2xl px-3 py-2 text-center", chip)}>
                  <p className="text-lg font-black">{lockedCount}</p>
                  <p className="text-[0.62rem] uppercase tracking-[0.18em] opacity-70">{lang === "EN" ? "Locked" : "Terkunci"}</p>
                </div>
              </div>
            </div>
          </article>

          {liveBadges.map((badge) => (
            <article key={badge.key} className={cn("relative overflow-hidden rounded-[16px] border p-5 transition-all", surface, badge.status === "locked" && "opacity-72 grayscale-[0.18]")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex rounded-full px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em]", chip)}>
                    {badge.key.replace(/-/g, " ")}
                  </span>
                  <span className={cn("inline-flex rounded-full px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.18em]", badge.status === "unlocked" ? "bg-emerald-500/12 text-emerald-500" : "bg-slate-500/12 text-slate-500")}>
                    {badge.status === "unlocked" ? (lang === "EN" ? "Unlocked" : "Dibuka") : (lang === "EN" ? "Locked" : "Terkunci")}
                  </span>
                </div>
                  <h2 className={cn("mt-3 text-xl font-black tracking-tight", strong)}>
                    {lang === "EN" ? badge.titleEN : badge.titleBM}
                  </h2>
                </div>
                <BadgeSvg icon={badge.icon} tone={badge.tone} animated={badge.status === "unlocked"} />
              </div>
              <p className={cn("mt-4 text-sm leading-7", subtext)}>
                {lang === "EN" ? badge.descEN : badge.descBM}
              </p>
              <div className={cn("mt-4 rounded-2xl px-4 py-3", chip)}>
                <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] opacity-70">
                  {lang === "EN" ? "Unlock Rule" : "Syarat Unlock"}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6">
                  {lang === "EN" ? badge.ruleEN : badge.ruleBM}
                </p>
              </div>
            </article>
          ))}

          <section className={cn("rounded-[16px] border p-5 md:col-span-2 xl:col-span-3", surface)}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className={cn("rounded-3xl px-4 py-4", chip)}>
                <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] opacity-70">{lang === "EN" ? "Current Level" : "Tahap Semasa"}</p>
                <p className="mt-2 text-base font-black">{lang === "EN" ? "Starter" : "Starter"}</p>
                <p className="mt-2 text-sm leading-6 opacity-80">{lang === "EN" ? "Complete verification steps to strengthen your account profile." : "Lengkapkan langkah verification untuk kuatkan profil akaun."}</p>
              </div>
              <div className={cn("rounded-3xl px-4 py-4", chip)}>
                <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] opacity-70">{lang === "EN" ? "Next Unlock" : "Unlock Seterusnya"}</p>
                <p className="mt-2 text-base font-black">{nextLockedBadge ? (lang === "EN" ? nextLockedBadge.titleEN : nextLockedBadge.titleBM) : (lang === "EN" ? "All Unlocked" : "Semua Dibuka")}</p>
                <p className="mt-2 text-sm leading-6 opacity-80">{lang === "EN" ? "Keep recording transactions through the month." : "Teruskan rekod transaksi sepanjang bulan."}</p>
              </div>
              <div className={cn("rounded-3xl px-4 py-4", chip)}>
                <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] opacity-70">{lang === "EN" ? "Progress" : "Kemajuan"}</p>
                <p className="mt-2 text-base font-black">{progressPercent}%</p>
                <p className="mt-2 text-sm leading-6 opacity-80">{lang === "EN" ? `${unlockedCount} of ${liveBadges.length} badges unlocked.` : `${unlockedCount} daripada ${liveBadges.length} badge sudah dibuka.`}</p>
              </div>
            </div>
          </section>

          <section className={cn("rounded-[16px] border p-5 md:col-span-2 xl:col-span-3", surface)}>

            <div className="flex items-center gap-3">
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", chip)}>
                <Sparkles size={22} />
              </div>
              <div>
                <h2 className={cn("text-xl font-black tracking-tight", strong)}>
                  {lang === "EN" ? "How to unlock more badges" : "Cara buka badge lain"}
                </h2>
                <p className={cn("mt-1 text-sm", subtext)}>
                  {lang === "EN" ? "Complete these actions while using the portal." : "Lengkapkan tindakan ini semasa guna portal."}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                { icon: ShieldCheck, textEN: "Verified profile and 6PIN enabled", textBM: "Profil lengkap dan 6PIN aktif" },
                { icon: TrendingUp, textEN: "30-day transaction activity rank", textBM: "Ranking aktiviti transaksi 30 hari" },
                { icon: Flame, textEN: "Daily streak badge", textBM: "Badge streak harian" },
                { icon: Wallet, textEN: "Wallet discipline and no-negative streak", textBM: "Disiplin wallet dan streak tiada negatif" },
                { icon: Receipt, textEN: "Receipt attachment consistency", textBM: "Konsisten simpan lampiran resit" },
                { icon: Bot, textEN: "WhatsApp / Telegram power user", textBM: "Power user WhatsApp / Telegram" },
              ].map((idea) => (
                <div key={idea.textEN} className={cn("flex items-start gap-3 rounded-2xl px-4 py-3", chip)}>
                  <idea.icon size={18} className="mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold leading-6">{lang === "EN" ? idea.textEN : idea.textBM}</p>
                </div>
              ))}
            </div>
          </section>
        </DesktopPageBody>

        <DesktopPageBody className="mt-5 flex justify-end">
          <Link href={`/${sessionId}/settings`} className={cn("inline-flex items-center rounded-2xl px-4 py-3 text-sm font-black", chip)}>
            {lang === "EN" ? "Settings" : "Tetapan"}
          </Link>
        </DesktopPageBody>
      </div>
    </div>
  )
}
