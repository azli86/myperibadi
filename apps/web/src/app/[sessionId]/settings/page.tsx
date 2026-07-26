"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import {
  User,
  Wallet,
  Shield,
  HelpCircle,
  ScrollText,
  Info,
  LogOut,
  ChevronRight,
  MessageSquare,
  Clock,
  Check,
  X,
  Award,
  Sparkles,
  Palette,
  Globe,
  type LucideIcon,

} from "lucide-react"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal"
import { DesktopPageBody, DesktopPageChip, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { useLang, Lang } from "@/lib/lang"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme/ThemeProvider"
import { getAccessToken, logoutAuthSession } from "@/lib/auth-session"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type AccountLink = {
  icon: LucideIcon
  label: string
  sub: string
  href: string
  accent: string
}

export default function LagiPage() {
  const { lang, setLang, timezone, setTimezone, timeFormat, setTimeFormat, t } = useLang()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const router = useRouter()
  const params = useParams()
  const sessionId = params.sessionId as string || ""
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const isLight = resolvedTheme === "light"

  const [userProfile, setUserProfile] = useState({ name: "Loading...", email: "...", id: "...", phone: "" })
  const [stats, setStats] = useState({ balance: 0 })
  const [profileLoading, setProfileLoading] = useState(true)
  const showProfileSkeleton = useDelayedSkeleton(profileLoading)
  const [activeMobileSheet, setActiveMobileSheet] = useState<"language" | "theme" | "timezone" | "timeFormat" | null>(null)
  const [showBadgeModal, setShowBadgeModal] = useState(false)
  const closeMobileSheet = React.useCallback(() => setActiveMobileSheet(null), [])

  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => isBm ? bm : en

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = getAccessToken()
        if (!token) return
        const headers = { Authorization: `Bearer ${token}` }
        const meRes = await fetch("/api/users/me", { credentials: "include", headers })
        if (meRes.ok) {
          const data = await meRes.json()
          setUserProfile({ name: data.name || data.email.split("@")[0], email: data.email, id: `BD-${data.id.toString().padStart(4, "0")}`, phone: data.phone || "" })
        }
        const statsRes = await fetch("/api/stats", { credentials: "include", headers })
        if (statsRes.ok) setStats(await statsRes.json())
      } catch (err) {
        console.error("Lagi page fetch error:", err)
      }
    }
    fetchData()
  }, [])


  async function handleLogout() {
    showConfirm(
      tr("Log Keluar?", "Log Out?"),
      tr("Adakah anda pasti mahu log keluar?", "Are you sure you want to log out?"),
      async () => { await logoutAuthSession(); router.push("/login") },
      "warning"
    )
  }

  const accountLinks: AccountLink[] = [
    { icon: User, label: t.myAccount, sub: tr("Profil, emel dan maklumat peribadi", "Profile, email and personal info"), href: `/${sessionId}/account`, accent: "bg-[var(--surface-tint)] text-[var(--text)]" },
    { icon: Wallet, label: t.walletSettings, sub: tr("Dompet, baki dan struktur akaun", "Wallets, balances and account structure"), href: `/${sessionId}/wallet-settings`, accent: "bg-[var(--surface-tint)] text-[var(--text)]" },
    { icon: MessageSquare, label: t.linkedWhatsApp, sub: tr("Sambungan bot dan status nombor aktif", "Bot connection and active number status"), href: `/${sessionId}/whatsapp`, accent: "bg-[var(--surface-tint)] text-[var(--text)]" },
  ]

  const systemLinks = [
    { icon: Shield, label: t.security, href: `/${sessionId}/security` },
    { icon: HelpCircle, label: t.helpSupport, href: `/${sessionId}/help` },
    { icon: ScrollText, label: t.changelog, href: `/${sessionId}/changelog` },
    { icon: Award, label: tr("Reward Badge", "Reward Badge"), href: `/${sessionId}/badges` },
    { icon: Info, label: t.about, href: `/${sessionId}/about` },
  ]

  const themeOptions = [
    { value: "system" as const, label: t.system || "System" },
    { value: "dark" as const, label: t.darkMode || "Dark" },
    { value: "light" as const, label: t.lightMode || "Light" },
  ]
  const languageOptions = [
    { value: "EN" as Lang, label: "English", short: "EN" },
    { value: "BM" as Lang, label: "Bahasa Melayu", short: "BM" },
  ]
  const timeFormatOptions = ["12h", "24h"] as const
  const timezoneOptions = [
    { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur (GMT+8)" },
    { value: "Asia/Singapore", label: "Asia/Singapore (GMT+8)" },
    { value: "Asia/Jakarta", label: "Asia/Jakarta (GMT+7)" },
    { value: "Asia/Bangkok", label: "Asia/Bangkok (GMT+7)" },
    { value: "Asia/Tokyo", label: "Asia/Tokyo (GMT+9)" },
    { value: "UTC", label: "UTC (GMT+0)" },
    { value: "Europe/London", label: "Europe/London" },
    { value: "America/New_York", label: "America/New_York" },
    { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  ]
  const currentThemeLabel = themeOptions.find(o => o.value === theme)?.label || theme
  const currentLanguageLabel = languageOptions.find(o => o.value === lang)?.label || lang
  const currentTimezoneLabel = timezoneOptions.find(o => o.value === timezone)?.label || timezone
  const currentTimeFormatLabel = timeFormat === "12h" ? t.timeFormat12 : t.timeFormat24

  const mobilePreferenceRows: Array<{ key: "language" | "theme" | "timezone" | "timeFormat"; icon: LucideIcon; label: string; value: string }> = [
    { key: "language", icon: Globe, label: t.language, value: currentLanguageLabel },
    { key: "theme", icon: Palette, label: t.theme, value: currentThemeLabel },
    { key: "timezone", icon: Clock, label: t.timezone, value: currentTimezoneLabel },
    { key: "timeFormat", icon: Clock, label: t.timeFormat, value: currentTimeFormatLabel },
  ]

  const activeConfig = activeMobileSheet ? {
    language: { title: t.language, subtitle: tr("Pilih bahasa utama portal anda", "Choose your portal language") },
    theme: { title: t.theme, subtitle: tr("Pilih rupa portal yang anda suka", "Choose the portal look you prefer") },
    timezone: { title: t.timezone, subtitle: t.timezoneNote },
    timeFormat: { title: t.timeFormat, subtitle: t.timeFormatDesc },
  }[activeMobileSheet] : null

  const { requestClose: requestMobileSheetClose, requestCloseThen: requestMobileSheetCloseThen } = useOverlayBackClose({
    id: "settings-mobile-sheet",
    isOpen: Boolean(activeMobileSheet),
    onClose: closeMobileSheet,
  })

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile View ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Tetapan", "Settings")}
          fallbackHref={`/${sessionId}`}
        />

        {/* Profile Link */}
        <div className="px-1">
          <Link
            href={`/${sessionId}/account`}
            className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 active:scale-[0.98] transition-all"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black text-[var(--text)]">{userProfile.name}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted)]">{userProfile.email}</p>
            </div>
            <ChevronRight size={18} className="text-[var(--muted)]" />
          </Link>
        </div>

        {/* Account Links */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{t.myAccount}</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            {accountLinks.map((item, i) => {
              const content = (
                <>
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", item.accent)}><item.icon size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text)]">{item.label}</p>
                    <p className="mt-0.5 truncate text-[0.625rem] font-medium text-[var(--muted)]">{item.sub}</p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--muted)]" />
                </>
              )
              const cls = cn("flex items-center gap-3 px-4 py-3.5 transition-all", i !== 0 && "border-t border-[var(--border)]")
              return (
                <Link key={item.label} href={item.href} className={cls}>{content}</Link>
              )
            })}
          </div>
        </section>


        {/* Preferences */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{t.preferences}</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            {mobilePreferenceRows.map((item, i) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveMobileSheet(item.key)}
                className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all", i !== 0 && "border-t border-[var(--border)]")}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"><item.icon size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text)]">{item.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--muted)] truncate max-w-[140px]">{item.value}</span>
                  <ChevronRight size={16} className="text-[var(--muted)]" />
                </div>
              </button>
            ))}
          </div>
        </section>
        {/* System */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{t.system}</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            {systemLinks.map((item, i) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn("flex items-center gap-3 px-4 py-3.5 transition-all", i !== 0 && "border-t border-[var(--border)]")}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"><item.icon size={18} /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-[var(--text)]">{item.label}</p></div>
                <ChevronRight size={16} className="text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        </section>

        {/* Logout */}
        <div className="px-1">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 text-left transition-all active:scale-[0.98]">
            <LogOut size={16} className="shrink-0 text-red-500" />
            <span className="text-sm font-bold text-red-500">{t.logout}</span>
          </button>
        </div>

      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Tetapan", "Settings")}
          actions={
            <DesktopPageChip>
              RM {showProfileSkeleton ? "..." : stats.balance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </DesktopPageChip>
          }
        />
        <DesktopPageBody className="space-y-6">
        {/* Account Links Card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
            {accountLinks.map((item) => {
              const inner = (
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", item.accent)}><item.icon size={18} /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text)]">{item.label}</p>
                    <p className="mt-0.5 truncate text-[0.625rem] font-medium text-[var(--muted)]">{item.sub}</p>
                  </div>
                </div>
              )
              const cls = "flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[var(--surface-tint)]/50"
              return (
                <Link key={item.label} href={item.href} className={cls}>{inner}<ChevronRight size={16} className="shrink-0 text-[var(--muted)]" /></Link>
              )
            })}
          </div>
        </div>

        {/* Desktop Grid */}

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          {/* Left Column */}
          <div className="space-y-5">
            {/* Language */}
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]"><Globe size={20} /></div>
                <div>
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{t.language}</p>
                  <p className="text-sm font-semibold text-[var(--muted)]">{tr("Pilih bahasa utama portal anda", "Choose primary portal language")}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {languageOptions.map((option) => {
                  const isActive = lang === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLang(option.value)}
                      className={cn(
                        "rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.98]",
                        isActive ? "border-[var(--border-strong)] bg-[var(--surface-tint-strong)] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface-tint)]/30 text-[var(--text)] hover:border-[var(--border-strong)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{option.label}</p>
                          <p className={cn("mt-1 text-[0.625rem] font-bold uppercase tracking-widest", isActive ? "text-[var(--muted)]" : "text-[var(--muted)]")}>{option.short}</p>
                        </div>
                        {isActive && <Check size={18} className="text-[var(--text)]" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time & Timezone */}
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]"><Clock size={20} /></div>
                <div>
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{t.timeFormat}</p>
                  <p className="text-sm font-semibold text-[var(--muted)]">{t.timeFormatDesc}</p>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{t.timezone}</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--text)]/25"
                  >
                    {!timezoneOptions.some(o => o.value === timezone) && <option value={timezone}>{timezone}</option>}
                    {timezoneOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <p className="mt-2 text-xs font-medium text-[var(--muted)]">{t.timezoneNote}</p>
                </div>
                <div>
                  <label className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{t.timeFormat}</label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {timeFormatOptions.map((option) => {
                      const isActive = timeFormat === option
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setTimeFormat(option)}
                          className={cn(
                            "rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.98]",
                            isActive ? "border-[var(--border-strong)] bg-[var(--surface-tint-strong)] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface-tint)]/30 text-[var(--text)] hover:border-[var(--border-strong)]"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-black">{option === "12h" ? t.timeFormat12 : t.timeFormat24}</p>
                              <p className={cn("mt-1 text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]")}>{option}</p>
                            </div>
                            {isActive && <Check size={18} className="text-[var(--text)]" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Theme */}
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]"><Palette size={20} /></div>
                <div>
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{t.theme}</p>
                  <p className="text-sm font-semibold text-[var(--muted)]">{tr("Padankan rupa portal anda", "Match your portal look")}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {themeOptions.map((option) => {
                  const isActive = theme === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        "rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.98]",
                        isActive ? "border-[var(--border-strong)] bg-[var(--surface-tint-strong)] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface-tint)]/30 text-[var(--text)] hover:border-[var(--border-strong)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{option.label}</p>
                          <p className={cn("mt-1 text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]")}>{option.value}</p>
                        </div>
                        {isActive && <Check size={18} className="text-[var(--text)]" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* System Links */}
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{t.system}</p>
              <div className="mt-4 space-y-2">
                {systemLinks.map((item) => (
                  <Link key={item.label} href={item.href} className="block">
                    <div className="group flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/20 px-4 py-4 transition-all hover:bg-[var(--surface-tint)]">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"><item.icon size={18} /></div>
                        <p className="truncate text-sm font-bold text-[var(--text)]">{item.label}</p>
                      </div>
                      <ChevronRight size={16} className="text-[var(--muted)] transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{t.dangerZone}</p>
              <h3 className="mt-3 text-xl font-black tracking-tight text-[var(--text)]">{tr("Keluar dari sesi", "Exit session")}</h3>
              <p className="mt-2 text-sm font-medium text-[var(--muted)]">{tr("Anda akan log keluar dari peranti ini.", "You will be logged out from this device.")}</p>
              <button
                onClick={handleLogout}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 py-4 text-sm font-black text-red-500 transition-all hover:bg-red-500/20 active:scale-[0.98]"
              >
                <LogOut size={16} strokeWidth={3} />
                {t.logout.toUpperCase()}
              </button>
            </div>

          </div>
        </div>
        </DesktopPageBody>
      </div>

      {/* ─── Mobile Bottom Sheet ─── */}
      
        {activeMobileSheet && activeConfig && (
          <div
            className="fixed inset-0 z-[80] bg-transparent md:hidden flex items-end"
            onClick={requestMobileSheetClose}
          >
            <div
              className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[36px] border border-[var(--border)] bg-[var(--card)] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] touch-pan-y shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 mb-5 rounded-t-[36px] border-b border-[var(--border)] bg-[var(--card)] px-5 pt-3 pb-4 backdrop-blur-sm">
                <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-[var(--border)]" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{t.preferences}</p>
                    <h2 className="mt-2 text-[1.6rem] font-black text-[var(--text)]">{activeConfig.title}</h2>
                    <p className="mt-2 text-sm font-medium text-[var(--muted)]">{activeConfig.subtitle}</p>
                  </div>
                  <button type="button" onClick={requestMobileSheetClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--text)]">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="px-5">
                <div className="divide-y divide-[var(--border)]">
                  {activeMobileSheet === "language" && languageOptions.map((option) => {
                    const isActive = lang === option.value
                    return (
                      <button key={option.value} type="button" onClick={() => requestMobileSheetCloseThen(() => setLang(option.value))} className="flex w-full items-center gap-3 py-4 text-left">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"><Globe size={16} /></div>
                        <div className="min-w-0 flex-1"><p className="text-base font-bold text-[var(--text)]">{option.label}</p><p className="mt-0.5 text-sm text-[var(--muted)]">{option.short}</p></div>
                        {isActive && <Check size={18} className="text-[var(--text)]" />}
                      </button>
                    )
                  })}
                  {activeMobileSheet === "theme" && themeOptions.map((option) => {
                    const isActive = theme === option.value
                    return (
                      <button key={option.value} type="button" onClick={() => requestMobileSheetCloseThen(() => setTheme(option.value))} className="flex w-full items-center gap-3 py-4 text-left">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"><Palette size={16} /></div>
                        <div className="min-w-0 flex-1"><p className="text-base font-bold text-[var(--text)]">{option.label}</p><p className="mt-0.5 text-sm uppercase text-[var(--muted)]">{option.value}</p></div>
                        {isActive && <Check size={18} className="text-[var(--text)]" />}
                      </button>
                    )
                  })}
                  {activeMobileSheet === "timezone" && timezoneOptions.map((option) => {
                    const isActive = timezone === option.value
                    return (
                      <button key={option.value} type="button" onClick={() => requestMobileSheetCloseThen(() => setTimezone(option.value))} className="flex w-full items-center gap-3 py-4 text-left">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"><Clock size={16} /></div>
                        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-[var(--text)]">{option.label}</p></div>
                        {isActive && <Check size={18} className="text-[var(--text)]" />}
                      </button>
                    )
                  })}
                  {activeMobileSheet === "timeFormat" && timeFormatOptions.map((option) => {
                    const isActive = timeFormat === option
                    return (
                      <button key={option} type="button" onClick={() => requestMobileSheetCloseThen(() => setTimeFormat(option))} className="flex w-full items-center gap-3 py-4 text-left">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]"><Clock size={16} /></div>
                        <div className="min-w-0 flex-1"><p className="text-base font-bold text-[var(--text)]">{option === "12h" ? t.timeFormat12 : t.timeFormat24}</p><p className="mt-0.5 text-sm uppercase text-[var(--muted)]">{option}</p></div>
                        {isActive && <Check size={18} className="text-[var(--text)]" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      

      {alertModal}
      <BadgeOverviewModal open={showBadgeModal} onClose={() => setShowBadgeModal(false)} sessionId={sessionId} lang={lang} />
    </div>
  )
}
