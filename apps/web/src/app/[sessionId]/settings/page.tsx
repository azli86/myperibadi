"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import {
  User,
  Shield,
  HelpCircle,
  ScrollText,
  Info,
  LogOut,
  ChevronRight,
  Clock,
  Check,
  X,
  Award,
  Sparkles,
  Palette,
  Globe,
  CalendarDays,
  type LucideIcon,

} from "lucide-react"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal"
import CycleResetCalendar from "@/components/settings/CycleResetCalendar"
import { DesktopPageBody, DesktopPageChip, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { useLang, Lang } from "@/lib/lang"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme/ThemeProvider"
import { getAccessToken, logoutAuthSession } from "@/lib/auth-session"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"


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
  const [activeMobileSheet, setActiveMobileSheet] = useState<"language" | "theme" | "timezone" | "timeFormat" | "cycleReset" | null>(null)
  const [showBadgeModal, setShowBadgeModal] = useState(false)
  const [cycleStartDay, setCycleStartDay] = useState(1)
  const [cycleMode, setCycleMode] = useState<"day" | "category">("day")
  const [cycleSaving, setCycleSaving] = useState(false)
  const [cycleModeSaving, setCycleModeSaving] = useState(false)
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
          setCycleStartDay(Number(data.cycle_start_day) || 1)
          setCycleMode(data.cycle_mode === "category" ? "category" : "day")
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

  async function saveCycleStartDay(day: number) {
    try {
      setCycleSaving(true)
      const token = getAccessToken()
      if (!token) return
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cycle_start_day: day }),
      })
      if (!res.ok) throw new Error("save failed")
      setCycleStartDay(day)
    } catch (err) {
      showAlert(tr("Gagal simpan tetapan", "Failed to save setting"), "error")
    } finally {
      setCycleSaving(false)
    }
  }

  async function saveCycleMode(mode: "day" | "category") {
    try {
      setCycleModeSaving(true)
      const token = getAccessToken()
      if (!token) return
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cycle_mode: mode }),
      })
      if (!res.ok) throw new Error("save failed")
      setCycleMode(mode)
    } catch (err) {
      showAlert(tr("Gagal simpan tetapan", "Failed to save setting"), "error")
    } finally {
      setCycleModeSaving(false)
    }
  }

  const systemLinks = [
    { icon: User, label: t.myAccount, href: `/${sessionId}/account` },
    { icon: Shield, label: t.security, href: `/${sessionId}/security` },
    { icon: HelpCircle, label: t.helpSupport, href: `/${sessionId}/help` },
    { icon: ScrollText, label: t.changelog, href: `/${sessionId}/whatsnew` },
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

  const mobilePreferenceRows: Array<{ key: "language" | "theme" | "timezone" | "timeFormat" | "cycleReset"; icon: LucideIcon; label: string; value: string }> = [
    { key: "language", icon: Globe, label: t.language, value: currentLanguageLabel },
    { key: "theme", icon: Palette, label: t.theme, value: currentThemeLabel },
    { key: "timezone", icon: Clock, label: t.timezone, value: currentTimezoneLabel },
    { key: "timeFormat", icon: Clock, label: t.timeFormat, value: currentTimeFormatLabel },
    { key: "cycleReset", icon: CalendarDays, label: tr("Kitaran Reset", "Reset Cycle"), value: cycleMode === "category" ? tr("Ikut Gaji", "By Salary") : tr(`Setiap ${cycleStartDay} hari bulan`, `Day ${cycleStartDay} each month`) },
  ]

  const activeConfig = activeMobileSheet ? {
    language: { title: t.language, subtitle: tr("Pilih bahasa utama portal anda", "Choose your portal language") },
    theme: { title: t.theme, subtitle: tr("Pilih rupa portal yang anda suka", "Choose the portal look you prefer") },
    timezone: { title: t.timezone, subtitle: t.timezoneNote },
    timeFormat: { title: t.timeFormat, subtitle: t.timeFormatDesc },
    cycleReset: { title: tr("Kitaran Reset Bulanan", "Monthly Reset Cycle"), subtitle: tr("Pilih hari kitaran baharu bermula", "Choose the day your cycle restarts") },
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

        {/* Preferences */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{t.preferences}</p>
          <div className="mt-2 overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)]">
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
          <div className="mt-2 overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)]">
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
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 text-left transition-all active:scale-[0.99]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><LogOut size={18} /></div>
            <span className="text-sm font-bold text-red-500">{t.logout}</span>
          </button>
        </div>

      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Tetapan", "Settings")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageChip>
              RM {showProfileSkeleton ? "..." : stats.balance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </DesktopPageChip>
          }
        />
        <DesktopPageBody className="space-y-6">
        {/* Profile Hero Card */}
        <Link href={`/${sessionId}/account`} className="block">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-gradient-to-br from-[var(--card)] to-[var(--surface-tint)] p-6 shadow-sm transition-all hover:shadow-md">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[var(--accent)]/8 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] ring-1 ring-[var(--accent)]/15">
                <Sparkles size={28} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-black tracking-tight text-[var(--text)]">{userProfile.name}</h2>
                <p className="mt-0.5 truncate text-sm font-semibold text-[var(--muted)]">{userProfile.email}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/12 px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-wider text-[var(--accent)]">
                    <Sparkles size={10} />
                    {tr("Bot Aktif", "Bot Active")}
                  </span>
                </div>
              </div>
              <ChevronRight size={20} className="relative shrink-0 text-[var(--muted)]" />
            </div>
          </div>
        </Link>

        {/* Desktop Grid */}

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          {/* Left Column */}
          <div className="space-y-5">
            {/* Language */}
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
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
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
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
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
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
            {/* Cycle Reset */}
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]"><CalendarDays size={20} /></div>
                <div>
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{tr("Kitaran Reset", "Reset Cycle")}</p>
                  <p className="text-sm font-semibold text-[var(--muted)]">{tr("Hari kitaran baharu bermula", "Day your new cycle starts")}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => saveCycleMode("day")} disabled={cycleModeSaving} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${cycleMode === "day" ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "bg-[var(--surface-tint)] text-[var(--muted)]"}`}>{tr("Ikut Hari", "By Day")}</button>
                <button type="button" onClick={() => saveCycleMode("category")} disabled={cycleModeSaving} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${cycleMode === "category" ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "bg-[var(--surface-tint)] text-[var(--muted)]"}`}>{tr("Ikut Gaji", "By Salary")}</button>
              </div>
              {cycleMode === "day" ? (
                <>
                  <div className="mt-4">
                    <CycleResetCalendar value={cycleStartDay} onChange={(d) => saveCycleStartDay(d)} lang={lang} />
                  </div>
                  <p className="mt-3 text-center text-xs font-medium text-[var(--muted)]">{cycleSaving ? (isBm ? "Menyimpan..." : "Saving...") : tr(`Kitaran bermula setiap hari ${cycleStartDay} bulan`, `Cycle restarts on day ${cycleStartDay} of each month`)}</p>
                </>
              ) : (
                <p className="mt-4 text-center text-xs font-medium text-[var(--muted)]">{cycleModeSaving ? (isBm ? "Menyimpan..." : "Saving...") : tr("Kitaran reset mengikut tarikh gaji (Monthly Salary: Mgaji / Msalary).", "Cycle resets on your salary date (Monthly Salary: Mgaji / Msalary).")}</p>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* System Links */}
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
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
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
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
              <AppSheetHeader
                title={activeConfig.title}
                subtitle={activeConfig.subtitle}
                onClose={requestMobileSheetClose}
              />
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
                  {activeMobileSheet === "cycleReset" && (
                    <div className="py-4">
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => saveCycleMode("day")} disabled={cycleModeSaving} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${cycleMode === "day" ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "bg-[var(--surface-tint)] text-[var(--muted)]"}`}>{tr("Ikut Hari", "By Day")}</button>
                        <button type="button" onClick={() => saveCycleMode("category")} disabled={cycleModeSaving} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${cycleMode === "category" ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "bg-[var(--surface-tint)] text-[var(--muted)]"}`}>{tr("Ikut Gaji", "By Salary")}</button>
                      </div>
                      {cycleMode === "day" ? (
                        <>
                          <div className="mt-4">
                            <CycleResetCalendar value={cycleStartDay} onChange={(d) => { setCycleStartDay(d); saveCycleStartDay(d) }} lang={lang} />
                          </div>
                          <p className="mt-3 text-center text-xs font-medium text-[var(--muted)]">{tr(`Kitaran bermula setiap hari ${cycleStartDay} bulan`, `Cycle restarts on day ${cycleStartDay} of each month`)}</p>
                        </>
                      ) : (
                        <p className="mt-4 text-center text-xs font-medium text-[var(--muted)]">{tr("Kitaran reset mengikut tarikh gaji (Monthly Salary: Mgaji / Msalary).", "Cycle resets on your salary date (Monthly Salary: Mgaji / Msalary).")}</p>
                      )}
                    </div>
                  )}
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
