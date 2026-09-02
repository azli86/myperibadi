"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import {
  Shield,
  Bot,
  ScrollText,
  Info,
  LogOut,
  ChevronRight,
  Clock,
  Check,
  Award,
  Palette,
  Globe,
  CalendarDays,
  UserCircle2,
  PencilLine,
  Camera,
  MailCheck,
  CheckCircle2,
  AlertTriangle,
  Users,
  RefreshCw,
  Trash2,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  Save,
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal"
import CycleResetCalendar from "@/components/settings/CycleResetCalendar"
import { DesktopPageBody, DesktopPageChip, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { useLang, Lang } from "@/lib/lang"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme/ThemeProvider"
import { getAccessToken, setAuthTokens, logoutAuthSession } from "@/lib/auth-session"
import { getAccounts, getActiveEmail, switchToAccount, type AccountProfile } from "@/lib/multi-account"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { UserAvatar } from "@/components/ui/UserAvatar"
import { AddAccountModal } from "@/components/ui/AddAccountModal"

type ProfileData = {
  id: string
  name: string
  email: string
  phone: string
  bot_personality: string
  avatar_url: string | null
  cycle_start_day: number
  cycle_mode: "day" | "category"
  auth_provider?: string
  has_password?: boolean
}

type MobileSheetType =
  | "profile"
  | "email"
  | "accounts"
  | "language"
  | "theme"
  | "timezone"
  | "timeFormat"
  | "cycleReset"
  | "danger"
  | null

export default function SettingsPage() {
  const { lang, setLang, timezone, setTimezone, timeFormat, setTimeFormat, t } = useLang()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const router = useRouter()
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  // Profile & System States
  const [profile, setProfile] = useState<ProfileData | null>(null)
  // Google sign-in accounts don't need a typed password for reset/delete -
  // being logged in via Google is the identity proof.
  const isGoogleSignIn = profile?.auth_provider === "google"
  const needsDangerPassword = !!(profile?.has_password && !isGoogleSignIn)
  const [name, setName] = useState("")
  const [botPersonality, setBotPersonality] = useState("")
  const [stats, setStats] = useState({ balance: 0 })
  const [profileLoading, setProfileLoading] = useState(true)
  const showProfileSkeleton = useDelayedSkeleton(profileLoading)
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Email Change States
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [requestingEmailCode, setRequestingEmailCode] = useState(false)
  const [confirmingEmail, setConfirmingEmail] = useState(false)
  const [emailStep, setEmailStep] = useState<"idle" | "code_sent">("idle")
  const [emailError, setEmailError] = useState("")

  // Multi-Account States
  const [accounts, setAccounts] = useState<AccountProfile[]>([])
  const [activeEmail, setActiveEmail] = useState<string | null>(null)
  const [showAddAccountModal, setShowAddAccountModal] = useState(false)

  // Cycle States
  const [cycleStartDay, setCycleStartDay] = useState(1)
  const [cycleMode, setCycleMode] = useState<"day" | "category">("day")
  const [cycleSaving, setCycleSaving] = useState(false)
  const [cycleModeSaving, setCycleModeSaving] = useState(false)

  // Danger Zone States
  const [dangerAction, setDangerAction] = useState<"reset" | "delete" | null>(null)
  const [dangerPassword, setDangerPassword] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [dangerBusy, setDangerBusy] = useState(false)
  const [dangerError, setDangerError] = useState("")
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [dangerStats, setDangerStats] = useState<{
    transaction_count: number
    wallet_count: number
    debt_count: number
    loan_count: number
    subscription_count: number
  } | null>(null)

  // Mobile Bottom Sheet & Badges
  const [activeMobileSheet, setActiveMobileSheet] = useState<MobileSheetType>(null)
  const [showBadgeModal, setShowBadgeModal] = useState(false)

  const closeMobileSheet = useCallback(() => setActiveMobileSheet(null), [])

  const { requestClose: requestMobileSheetClose, requestCloseThen: requestMobileSheetCloseThen } =
    useOverlayBackClose({
      id: "settings-mobile-sheet",
      isOpen: Boolean(activeMobileSheet),
      onClose: closeMobileSheet,
    })

  // Load Accounts from Local Storage
  useEffect(() => {
    setAccounts(getAccounts())
    setActiveEmail(getActiveEmail())
  }, [])

  // Load User & Stats Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setProfileLoading(true)
        const token = getAccessToken()
        if (!token) return
        const headers = { Authorization: `Bearer ${token}` }

        const meRes = await fetch("/api/users/me", { credentials: "include", headers })
        if (meRes.ok) {
          const data = await meRes.json()
          const norm: ProfileData = {
            id: data.id ? `BD-${data.id.toString().padStart(4, "0")}` : "BD-0001",
            name: data.name || data.email.split("@")[0],
            email: data.email,
            phone: data.phone || "",
            bot_personality: data.bot_personality || "",
            avatar_url: data.avatar_url || null,
            cycle_start_day: Number(data.cycle_start_day) || 1,
            cycle_mode: data.cycle_mode === "category" ? "category" : "day",
            auth_provider: data.auth_provider || "email",
            has_password: data.has_password,
          }
          setProfile(norm)
          setName(norm.name)
          setBotPersonality(norm.bot_personality)
          setCycleStartDay(norm.cycle_start_day)
          setCycleMode(norm.cycle_mode)
        }

        const statsRes = await fetch("/api/stats", { credentials: "include", headers })
        if (statsRes.ok) {
          const s = await statsRes.json()
          setStats(s)
        }
      } catch (err) {
        console.error("Settings data fetch error:", err)
      } finally {
        setProfileLoading(false)
      }
    }
    fetchData()
  }, [])

  // Check dirty profile changes
  const hasProfileChanges = useMemo(() => {
    if (!profile) return false
    const normBot = botPersonality.trim()
    const origBot = (profile.bot_personality || "").trim()
    return name.trim() !== profile.name || normBot !== origBot
  }, [name, botPersonality, profile])

  const personalityPresets = useMemo(
    () =>
      isBm
        ? [
            { label: "Mesra & santai", desc: "Nada ramah dan santai dengan emoji ceria" },
            { label: "Straight to point", desc: "Ringkas, pantas tanpa mesej panjang" },
            { label: "Coach bajet tegas", desc: "Tegas menjaga disiplin bajet anda" },
            { label: "Professional ringkas", desc: "Formal, jelas dan tepat untuk rekod" },
          ]
        : [
            { label: "Friendly & casual", desc: "Warm and approachable with friendly tone" },
            { label: "Straight to the point", desc: "Quick and concise without fluff" },
            { label: "Strict budget coach", desc: "Disciplined and focused on your savings" },
            { label: "Professional concise", desc: "Clear, formal and executive tone" },
          ],
    [isBm]
  )

  // Save Profile Name & Bot Tone
  async function handleSaveProfile(e?: React.FormEvent) {
    e?.preventDefault()
    if (!profile) return
    setProfileSaving(true)
    try {
      const token = getAccessToken()
      const payload = {
        name: name.trim(),
        bot_personality: botPersonality.trim(),
      }
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.detail || "Gagal mengemas kini profil")
      }
      const updated = await res.json()
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name: updated.name || name.trim(),
              bot_personality: updated.bot_personality ?? botPersonality.trim(),
            }
          : prev
      )
      showAlert(tr("Berjaya Disimpan", "Saved Successfully"), tr("Profil anda telah dikemaskini.", "Your profile has been updated."), "success")
      if (activeMobileSheet === "profile") {
        closeMobileSheet()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Gagal menyimpan profil.", "Failed to save profile.")
      showAlert(tr("Ralat", "Error"), msg, "error")
    } finally {
      setProfileSaving(false)
    }
  }

  // Upload Avatar
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    if (file.size > 2 * 1024 * 1024) {
      showAlert(tr("Saiz Terlalu Besar", "File Too Large"), tr("Maksimum saiz imej ialah 2 MB.", "Maximum image size is 2 MB."), "error")
      return
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showAlert(tr("Format Tidak Sah", "Invalid Format"), tr("Sila muat naik format JPG, PNG atau WEBP.", "Please upload JPG, PNG or WEBP."), "error")
      return
    }

    setAvatarUploading(true)
    try {
      const token = getAccessToken()
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.detail || "Gagal memuat naik gambar")
      }
      const data = await res.json()
      setProfile((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : prev))
      showAlert(tr("Gambar Dikemaskini", "Avatar Updated"), tr("Gambar profil anda telah berjaya dimuat naik.", "Your profile avatar has been updated."), "success")
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Gagal memuat naik gambar.", "Upload failed.")
      showAlert(tr("Ralat Muat Naik", "Upload Failed"), msg, "error")
    } finally {
      setAvatarUploading(false)
      e.target.value = ""
    }
  }

  // Request Email Change Code
  async function handleRequestEmailCode(e: React.FormEvent) {
    e.preventDefault()
    setRequestingEmailCode(true)
    setEmailError("")
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/email-change/request", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          new_email: newEmail.trim().toLowerCase(),
          current_password: currentPassword,
        }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.detail || tr("Gagal menghantar kod pengesahan.", "Failed to send verification code."))
      }
      setEmailStep("code_sent")
      showAlert(
        tr("Kod Dihantar", "Code Sent"),
        tr("Kod pengesahan 6-digit telah dihantar ke e-mel baharu anda.", "A 6-digit verification code was sent to your new email."),
        "success"
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Gagal menghantar kod.", "Failed to send code.")
      setEmailError(msg)
    } finally {
      setRequestingEmailCode(false)
    }
  }

  // Confirm Email Change Code
  async function handleConfirmEmailCode(e: React.FormEvent) {
    e.preventDefault()
    setConfirmingEmail(true)
    setEmailError("")
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/email-change/confirm", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: verificationCode.trim() }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.detail || tr("Kod pengesahan tidak sah.", "Invalid verification code."))
      }
      const data = await res.json()
      setAuthTokens(data.access_token, data.refresh_token)
      const confirmedEmail = newEmail.trim().toLowerCase()
      setProfile((prev) => (prev ? { ...prev, email: confirmedEmail } : prev))
      setNewEmail("")
      setCurrentPassword("")
      setVerificationCode("")
      setEmailStep("idle")
      if (activeMobileSheet === "email") closeMobileSheet()
      showAlert(tr("E-mel Disahkan", "Email Verified"), tr("E-mel akaun anda telah berjaya ditukar.", "Your email has been successfully updated."), "success")
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Pengesahan gagal.", "Verification failed.")
      setEmailError(msg)
    } finally {
      setConfirmingEmail(false)
    }
  }

  // Save Cycle Settings
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
      if (!res.ok) throw new Error("Gagal simpan tarikh kitaran")
      setCycleStartDay(day)
      setProfile((prev) => (prev ? { ...prev, cycle_start_day: day } : prev))
    } catch (err) {
      showAlert(tr("Gagal Simpan", "Save Failed"), tr("Gagal menyimpan tarikh kitaran.", "Failed to save cycle day."), "error")
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
      if (!res.ok) throw new Error("Gagal simpan mod kitaran")
      setCycleMode(mode)
      setProfile((prev) => (prev ? { ...prev, cycle_mode: mode } : prev))
    } catch (err) {
      showAlert(tr("Gagal Simpan", "Save Failed"), tr("Gagal menyimpan mod kitaran.", "Failed to save cycle mode."), "error")
    } finally {
      setCycleModeSaving(false)
    }
  }

  // Danger Zone Actions
  async function openDangerModal(action: "reset" | "delete") {
    setDangerAction(action)
    setDangerError("")
    setDangerPassword("")
    setConfirmText("")
    setDangerBusy(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/stats", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        const data = await res.json()
        setDangerStats({
          transaction_count: data.transaction_count ?? 0,
          wallet_count: data.wallet_count ?? 0,
          debt_count: data.debt_count ?? 0,
          loan_count: data.loan_count ?? 0,
          subscription_count: data.subscription_count ?? 0,
        })
      }
      setConfirmModalOpen(true)
    } catch (err) {
      console.error("Failed to load danger stats:", err)
      setConfirmModalOpen(true)
    } finally {
      setDangerBusy(false)
    }
  }

  async function executeDangerAction() {
    if (!dangerAction) return
    setDangerBusy(true)
    setDangerError("")
    try {
      const token = getAccessToken()
      const url = dangerAction === "delete" ? "/api/users/me" : "/api/users/me/reset"
      const res = await fetch(url, {
        method: dangerAction === "delete" ? "DELETE" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ current_password: dangerPassword }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.detail || tr("Tindakan gagal dilaksanakan.", "Action failed to execute."))
      }
      setConfirmModalOpen(false)
      if (dangerAction === "delete") {
        await logoutAuthSession()
        router.push("/login")
      } else {
        setDangerAction(null)
        setDangerPassword("")
        setConfirmText("")
        if (activeMobileSheet === "danger") closeMobileSheet()
        showAlert(
          tr("Akaun Direset", "Account Reset"),
          tr("Semua data transaksi dan rekod telah dikosongkan.", "All transaction data has been cleared."),
          "success"
        )
        // Reset flips onboarding_done to false; route to the dashboard where
        // onboarding auto-shows, instead of staying on this page.
        setTimeout(() => router.push(`/${sessionId}`), 600)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Tindakan gagal.", "Action failed.")
      setDangerError(msg)
    } finally {
      setDangerBusy(false)
    }
  }

  const resetWord = tr("RESET", "RESET")
  const deleteWord = tr("PADAM", "DELETE")
  const activeDangerWord = dangerAction === "delete" ? deleteWord : resetWord

  // Logout Handler
  async function handleLogout() {
    showConfirm(
      tr("Log Keluar?", "Log Out?"),
      tr("Adakah anda pasti mahu log keluar dari sesi ini?", "Are you sure you want to log out of this session?"),
      async () => {
        await logoutAuthSession()
        router.push("/login")
      },
      "warning"
    )
  }

  // Options Definitions
  const themeOptions = [
    { value: "system" as const, label: t.system || "System", icon: Monitor, desc: tr("Ikut tetapan peranti", "Follow device theme") },
    { value: "dark" as const, label: t.darkMode || "Dark", icon: Moon, desc: tr("Tema gelap moden & jimat bateri", "Modern dark aesthetic") },
    { value: "light" as const, label: t.lightMode || "Light", icon: Sun, desc: tr("Tema cerah berbayang lembut", "Clean high-contrast light") },
  ]

  const languageOptions = [
    { value: "BM" as Lang, label: "Bahasa Melayu", short: "BM", flag: "🇲🇾", region: "Malaysia" },
    { value: "EN" as Lang, label: "English", short: "EN", flag: "🇬🇧", region: "International" },
  ]

  const timeFormatOptions = [
    { value: "12h" as const, label: t.timeFormat12 || "12 Jam (AM/PM)", desc: "10:30 PM" },
    { value: "24h" as const, label: t.timeFormat24 || "24 Jam", desc: "22:30" },
  ]

  const timezoneOptions = [
    { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur (GMT+8)", desc: "Malaysia / KL Standard Time" },
    { value: "Asia/Singapore", label: "Asia/Singapore (GMT+8)", desc: "Singapore Standard Time" },
    { value: "Asia/Jakarta", label: "Asia/Jakarta (GMT+7)", desc: "Western Indonesia Time" },
    { value: "Asia/Bangkok", label: "Asia/Bangkok (GMT+7)", desc: "Indochina Time" },
    { value: "Asia/Tokyo", label: "Asia/Tokyo (GMT+9)", desc: "Japan Standard Time" },
    { value: "UTC", label: "UTC (GMT+0)", desc: "Universal Coordinated Time" },
    { value: "Europe/London", label: "Europe/London (GMT+0/+1)", desc: "Greenwich / BST" },
    { value: "America/New_York", label: "America/New_York (GMT-5/-4)", desc: "Eastern Time" },
    { value: "America/Los_Angeles", label: "America/Los_Angeles (GMT-8/-7)", desc: "Pacific Time" },
  ]

  const currentThemeObj = themeOptions.find((o) => o.value === theme)
  const currentLangObj = languageOptions.find((o) => o.value === lang)
  const currentTimezoneObj = timezoneOptions.find((o) => o.value === timezone)

  const systemLinks = [
    {
      icon: Shield,
      label: t.security || tr("Keselamatan Portal", "Portal Security"),
      desc: tr("PIN, biometrik & sandaran akaun", "PIN, biometrics & account backup"),
      href: `/${sessionId}/security`,
    },
    {
      icon: Bot,
      label: tr("Command Bot Pintar", "Smart Bot Commands"),
      desc: tr("Senarai arahan WhatsApp & Telegram", "WhatsApp & Telegram command handbook"),
      href: `/${sessionId}/bot-command`,
    },
    {
      icon: ScrollText,
      label: t.changelog || tr("Apa Yang Baharu", "What's New"),
      desc: tr("Log kemas kini versi sistem portal", "Changelog & feature update notes"),
      href: `/${sessionId}/whatsnew`,
    },
    {
      icon: Award,
      label: tr("Lencana & Pencapaian", "Badges & Rewards"),
      desc: tr("Pencapaian bajet & ganjaran akaun", "Budget streaks & award milestones"),
      href: `/${sessionId}/badges`,
      onClick: () => setShowBadgeModal(true),
    },
    {
      icon: Info,
      label: t.about || tr("Mengenai MyPeribadi", "About MyPeribadi"),
      desc: tr("Versi portal & maklumat sistem", "Portal version & system credits"),
      href: `/${sessionId}/about`,
    },
  ]

  return (
    <div className="space-y-6 pb-24 md:space-y-0 md:pb-8">
      {/* Hidden File Input for Avatars */}
      <input
        id="settings-avatar-upload-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAvatarUpload}
        disabled={avatarUploading}
      />

      {/* ─────────────────────────────────────────────────────────────────
          MOBILE VIEW (md:hidden)
          Sleek, Apple/Linear style grouped lists with current avatar hero
      ───────────────────────────────────────────────────────────────── */}
      <div className="space-y-5 md:hidden">
        {/* Mobile Page Header */}
        <MobilePageHeader
          title={tr("Tetapan", "Settings")}
          fallbackHref={`/${sessionId}`}
          action={
            <button
              type="button"
              onClick={() => setActiveMobileSheet("accounts")}
              className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)] transition active:scale-95"
            >
              <Users size={14} />
              <span>{accounts.length > 1 ? `${accounts.length}` : tr("Akaun", "Account")}</span>
            </button>
          }
        />

        {/* ─── Profile Avatar Hero Section (Material 3 style: Seamless, no card) ─── */}
        <section className="px-4 pt-3 pb-3 text-center flex flex-col items-center">
          {/* Avatar with Camera badge */}
          <div className="relative">
            <div className="rounded-full p-1 ring-4 ring-[var(--surface-tint)] bg-[var(--card)] shadow-md">
              <UserAvatar
                name={name || profile?.name}
                size={96}
                src={profile?.avatar_url}
                className="transition-transform"
              />
            </div>
            <label
              htmlFor="settings-avatar-upload-input"
              className={cn(
                "absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-md cursor-pointer active:scale-90 transition border-2 border-[var(--bg)]",
                avatarUploading && "pointer-events-none opacity-50"
              )}
              aria-label={tr("Tukar Gambar", "Change Avatar")}
            >
              {avatarUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={14} />}
            </label>
          </div>

          {/* Name, Bot Tone Chip & Email */}
          <div className="mt-3.5 space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-[var(--text)]">
              {showProfileSkeleton ? "..." : profile?.name || tr("Pengguna", "User")}
            </h2>

            <div className="flex items-center justify-center pt-0.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-3 py-1 text-xs font-bold text-[var(--text)] shadow-2xs">
                <Sparkles size={11} className="text-[var(--text)] opacity-80" />
                <span className="truncate max-w-[200px]">
                  {profile?.bot_personality || tr("Personaliti Mesra", "Friendly Tone")}
                </span>
              </span>
            </div>

            <p className="pt-0.5 text-xs font-medium text-[var(--muted)]">{profile?.email || "—"}</p>
          </div>

          {/* Material 3 Outlined Action Chips */}
          <div className="mt-4 grid w-full max-w-xs grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setActiveMobileSheet("profile")}
              className="flex items-center justify-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-tint)] py-2.5 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95 shadow-2xs"
            >
              <PencilLine size={13} />
              <span>{tr("Edit Profil", "Edit Profile")}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMobileSheet("email")}
              className="flex items-center justify-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-tint)] py-2.5 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95 shadow-2xs"
            >
              <MailCheck size={13} />
              <span>{tr("Tukar E-mel", "Change Email")}</span>
            </button>
          </div>
        </section>

        {/* ─── Group 1: Keutamaan & Paparan (Preferences) ─── */}
        <section className="px-1 space-y-2">
          <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
            {tr("Keutamaan & Paparan", "Preferences & Display")}
          </p>
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--divider)] shadow-xs">
            {/* Bahasa */}
            <button
              type="button"
              onClick={() => setActiveMobileSheet("language")}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                <Globe size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-bold text-[var(--text)]">{t.language || tr("Bahasa", "Language")}</p>
                <p className="truncate text-[0.7rem] text-[var(--muted)]">{tr("Pilihan bahasa paparan", "Portal display language")}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-0.5 text-xs font-bold text-[var(--text)]">
                  {currentLangObj?.label}
                </span>
                <ChevronRight size={15} className="text-[var(--muted)]" />
              </div>
            </button>

            {/* Tema */}
            <button
              type="button"
              onClick={() => setActiveMobileSheet("theme")}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                <Palette size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-bold text-[var(--text)]">{t.theme || tr("Tema & Rupa", "Theme & Appearance")}</p>
                <p className="truncate text-[0.7rem] text-[var(--muted)]">{tr("Mod cerah, gelap atau sistem", "Light, dark or system")}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-0.5 text-xs font-bold text-[var(--text)]">
                  {currentThemeObj?.label}
                </span>
                <ChevronRight size={15} className="text-[var(--muted)]" />
              </div>
            </button>

            {/* Zon Masa */}
            <button
              type="button"
              onClick={() => setActiveMobileSheet("timezone")}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                <Clock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-bold text-[var(--text)]">{t.timezone || tr("Zon Masa", "Timezone")}</p>
                <p className="truncate text-[0.7rem] text-[var(--muted)]">{timezone}</p>
              </div>
              <ChevronRight size={15} className="text-[var(--muted)]" />
            </button>

            {/* Format Masa */}
            <button
              type="button"
              onClick={() => setActiveMobileSheet("timeFormat")}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                <Clock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-bold text-[var(--text)]">{t.timeFormat || tr("Format Masa", "Time Format")}</p>
                <p className="truncate text-[0.7rem] text-[var(--muted)]">{timeFormat === "12h" ? "12 Jam (AM/PM)" : "24 Jam"}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-0.5 text-xs font-bold text-[var(--text)]">
                  {timeFormat}
                </span>
                <ChevronRight size={15} className="text-[var(--muted)]" />
              </div>
            </button>

            {/* Kitaran Reset Bulanan */}
            <button
              type="button"
              onClick={() => setActiveMobileSheet("cycleReset")}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                <CalendarDays size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-bold text-[var(--text)]">{tr("Kitaran Reset Bulanan", "Monthly Reset Cycle")}</p>
                <p className="truncate text-[0.7rem] text-[var(--muted)]">
                  {cycleMode === "category" ? tr("Ikut Tarikh Gaji", "By Salary Date") : tr(`Setiap ${cycleStartDay} hari bulan`, `Every ${cycleStartDay}th of month`)}
                </p>
              </div>
              <ChevronRight size={15} className="text-[var(--muted)]" />
            </button>
          </div>
        </section>

        {/* ─── Group 2: Sistem & Panduan ─── */}
        <section className="px-1 space-y-2">
          <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
            {tr("Sistem & Panduan", "System & Handbook")}
          </p>
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--divider)] shadow-xs">
            {systemLinks.map((item) => {
              const IconComp = item.icon
              if (item.onClick) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.onClick}
                    className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                      <IconComp size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs md:text-sm font-bold text-[var(--text)]">{item.label}</p>
                      <p className="truncate text-[0.7rem] text-[var(--muted)]">{item.desc}</p>
                    </div>
                    <ChevronRight size={15} className="text-[var(--muted)]" />
                  </button>
                )
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                    <IconComp size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs md:text-sm font-bold text-[var(--text)]">{item.label}</p>
                    <p className="truncate text-[0.7rem] text-[var(--muted)]">{item.desc}</p>
                  </div>
                  <ChevronRight size={15} className="text-[var(--muted)]" />
                </Link>
              )
            })}
          </div>
        </section>

        {/* ─── Group 3: Keselamatan Data & Sesi ─── */}
        <section className="px-1 space-y-2">
          <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
            {tr("Keselamatan Data & Sesi", "Data Safety & Session")}
          </p>
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--divider)] shadow-xs">
            {/* Danger Zone Sheet Trigger */}
            <button
              type="button"
              onClick={() => setActiveMobileSheet("danger")}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-rose-500/5 active:bg-rose-500/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-bold text-rose-600 dark:text-rose-400">{tr("Reset Data / Padam Akaun", "Reset Data / Delete Account")}</p>
                <p className="truncate text-[0.7rem] text-[var(--muted)]">{tr("Tindakan kritikal pemadaman data", "Critical data wipe options")}</p>
              </div>
              <ChevronRight size={15} className="text-rose-500/60" />
            </button>
          </div>
        </section>

        {/* ─── Logout Button ─── */}
        <div className="px-1 pt-2">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 py-3.5 text-xs font-black uppercase tracking-wider text-red-500 transition hover:bg-red-500/20 active:scale-[0.98]"
          >
            <LogOut size={16} strokeWidth={2.5} />
            <span>{t.logout || tr("Log Keluar", "Log Out")}</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          DESKTOP VIEW (hidden md:block)
          Sleek 2-column layout with hero identity, preferences & safety
      ───────────────────────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Tetapan Portal", "Portal Settings")}
          homeHref={`/${sessionId}`}
          actions={
            <div className="flex items-center gap-2">
              <DesktopPageChip>
                RM {showProfileSkeleton ? "..." : stats.balance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
              </DesktopPageChip>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
              >
                <Users size={14} />
                <span>{tr("Tukar Akaun", "Switch Account")}</span>
              </button>
            </div>
          }
        />

        <DesktopPageBody className="space-y-6 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ─── Left Column: Identity, Persona & Preferences (7 Cols) ─── */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card 1: Profile & Identity Hero */}
              <section className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--card)] via-[var(--card)] to-[var(--surface-tint)] p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--divider)] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <UserAvatar
                        name={name || profile?.name}
                        size={64}
                        src={profile?.avatar_url}
                        className="ring-2 ring-[var(--border-strong)]"
                      />
                      <label
                        htmlFor="settings-avatar-upload-input"
                        className={cn(
                          "absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)] border-2 border-[var(--card)] shadow cursor-pointer active:scale-90 transition",
                          avatarUploading && "pointer-events-none opacity-50"
                        )}
                        title={tr("Muat naik gambar", "Upload photo")}
                      >
                        {avatarUploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                      </label>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
                          {profile?.name || tr("Pengguna", "User")}
                        </h2>
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck size={11} />
                          <span>{tr("Disahkan", "Verified")}</span>
                        </span>
                      </div>
                      <p className="text-xs font-medium text-[var(--muted)]">{profile?.email || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Edit Name & Bot Tone Form */}
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {t.fullName || tr("Nama Paparan", "Display Name")}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={tr("Nama anda", "Your name")}
                      className="mt-1.5 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs md:text-sm text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                    />
                  </div>

                  {/* Bot Personality Presets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                        {tr("Gaya Personaliti Bot", "Bot Personality Tone")}
                      </label>
                      <span className="text-[0.68rem] text-[var(--muted)]">WhatsApp & Telegram</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {personalityPresets.map((p) => {
                        const active = botPersonality === p.label
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setBotPersonality(p.label)}
                            className={cn(
                              "flex flex-col text-left p-3 rounded-2xl border transition active:scale-[0.98]",
                              active
                                ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] shadow-xs"
                                : "border-[var(--border)] bg-[var(--surface-tint)]/40 text-[var(--muted)] hover:border-[var(--border-strong)]"
                            )}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs font-black text-[var(--text)]">{p.label}</span>
                              {active && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                            </div>
                            <span className="mt-1 text-[0.68rem] text-[var(--muted)] leading-tight">{p.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Save Button */}
                  <button
                    type="submit"
                    disabled={profileSaving || !hasProfileChanges}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-3 text-xs md:text-sm font-bold text-[var(--btn-primary-text)] shadow-sm transition active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
                  >
                    {profileSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} />}
                    <span>{tr("Simpan Profil", "Save Profile")}</span>
                  </button>
                </form>
              </section>

              {/* Card 2: Change Email */}
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-[var(--divider)] pb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                    <MailCheck size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-[var(--text)]">{tr("Tukar Alamat E-mel", "Change Email Address")}</h3>
                    <p className="text-xs text-[var(--muted)]">{tr("Pengesahan melalui kod e-mel baharu", "Verification via security code")}</p>
                  </div>
                </div>

                <form onSubmit={handleRequestEmailCode} className="space-y-3.5">
                  <div>
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("E-mel Baharu", "New Email Address")}
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="nama@contoh.com"
                      className="mt-1.5 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs md:text-sm text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                    />
                  </div>

                  <div>
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("Kata Laluan Semasa", "Current Password")}
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={tr("Masukkan kata laluan", "Enter current password")}
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 pr-10 text-xs md:text-sm text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {emailError && (
                    <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>{emailError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={requestingEmailCode || !newEmail.trim() || !currentPassword}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 text-xs md:text-sm font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.98] disabled:opacity-40"
                  >
                    {requestingEmailCode ? <Loader2 size={15} className="animate-spin" /> : <MailCheck size={15} />}
                    <span>{tr("Hantar Kod Verifikasi", "Send Verification Code")}</span>
                  </button>
                </form>

                {emailStep === "code_sent" && (
                  <form onSubmit={handleConfirmEmailCode} className="space-y-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-tint)] p-4">
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text)]">
                      {tr("Kod Verifikasi 6-Digit", "6-Digit Verification Code")}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 text-center text-lg font-black tracking-[0.25em] text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                    />
                    <button
                      type="submit"
                      disabled={confirmingEmail || verificationCode.trim().length !== 6}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs md:text-sm font-bold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40"
                    >
                      {confirmingEmail ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      <span>{tr("Sahkan & Tukar E-mel", "Verify & Update Email")}</span>
                    </button>
                  </form>
                )}
              </section>

              {/* Card 3: Keutamaan Bahasa, Tema, Masa & Kitaran */}
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-6">
                <div className="border-b border-[var(--divider)] pb-3">
                  <h3 className="text-sm font-extrabold text-[var(--text)]">{tr("Keutamaan Sistem & Paparan", "System & Display Preferences")}</h3>
                  <p className="text-xs text-[var(--muted)]">{tr("Konfigurasi bahasa, rupa tema, zon masa dan kitaran", "Customize language, look, timezone and cycle")}</p>
                </div>

                {/* Bahasa Selector */}
                <div className="space-y-2">
                  <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">{t.language || "Bahasa"}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {languageOptions.map((opt) => {
                      const active = lang === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setLang(opt.value)}
                          className={cn(
                            "flex items-center justify-between p-3.5 rounded-2xl border text-left transition active:scale-[0.98]",
                            active
                              ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold"
                              : "border-[var(--border)] bg-[var(--surface-tint)]/30 text-[var(--muted)] hover:border-[var(--border-strong)]"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl">{opt.flag}</span>
                            <div>
                              <p className="text-xs font-black text-[var(--text)]">{opt.label}</p>
                              <p className="text-[0.68rem] text-[var(--muted)]">{opt.region}</p>
                            </div>
                          </div>
                          {active && <Check size={16} className="text-[var(--text)]" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Tema Selector */}
                <div className="space-y-2">
                  <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">{t.theme || "Tema"}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {themeOptions.map((opt) => {
                      const active = theme === opt.value
                      const IconComp = opt.icon
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setTheme(opt.value)}
                          className={cn(
                            "flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition active:scale-[0.98]",
                            active
                              ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold"
                              : "border-[var(--border)] bg-[var(--surface-tint)]/30 text-[var(--muted)] hover:border-[var(--border-strong)]"
                          )}
                        >
                          <IconComp size={18} className="mb-1.5 text-[var(--text)]" />
                          <span className="text-xs font-bold">{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Zon Masa & Format */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">{t.timezone || "Zon Masa"}</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] outline-none"
                    >
                      {timezoneOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">{t.timeFormat || "Format Masa"}</label>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      {timeFormatOptions.map((o) => {
                        const active = timeFormat === o.value
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setTimeFormat(o.value)}
                            className={cn(
                              "rounded-xl border py-2.5 text-xs font-bold text-center transition",
                              active
                                ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)]"
                                : "border-[var(--border)] bg-[var(--surface-tint)]/30 text-[var(--muted)]"
                            )}
                          >
                            {o.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Kitaran Reset Bulanan */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("Kitaran Reset Bulanan", "Monthly Reset Cycle")}
                    </label>
                    <span className="text-xs font-medium text-[var(--muted)]">
                      {cycleMode === "category" ? tr("Ikut Tarikh Gaji", "By Salary") : tr(`Hari ${cycleStartDay}`, `Day ${cycleStartDay}`)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => saveCycleMode("day")}
                      disabled={cycleModeSaving}
                      className={cn(
                        "rounded-xl py-2 text-xs font-bold transition",
                        cycleMode === "day"
                          ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                          : "bg-[var(--surface-tint)] text-[var(--muted)]"
                      )}
                    >
                      {tr("Ikut Hari", "By Day")}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCycleMode("category")}
                      disabled={cycleModeSaving}
                      className={cn(
                        "rounded-xl py-2 text-xs font-bold transition",
                        cycleMode === "category"
                          ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                          : "bg-[var(--surface-tint)] text-[var(--muted)]"
                      )}
                    >
                      {tr("Ikut Gaji", "By Salary")}
                    </button>
                  </div>

                  {cycleMode === "day" ? (
                    <div className="mt-2">
                      <CycleResetCalendar
                        value={cycleStartDay}
                        onChange={(d) => saveCycleStartDay(d)}
                        lang={lang}
                      />
                      <p className="mt-2 text-center text-xs text-[var(--muted)]">
                        {cycleSaving ? tr("Menyimpan...", "Saving...") : tr(`Kitaran bajet bermula setiap ${cycleStartDay} hari bulan`, `Budget cycle resets on the ${cycleStartDay}th each month`)}
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 text-center text-xs text-[var(--muted)]">
                      {tr("Kitaran bajet akan direset secara automatik mengikut tarikh rekod gaji (Mgaji / Msalary).", "Budget cycle resets automatically on your salary date record.")}
                    </p>
                  )}
                </div>
              </section>
            </div>

            {/* ─── Right Column: Multi-Account, System & Danger (5 Cols) ─── */}
            <div className="lg:col-span-5 space-y-6">
              {/* Card 1: Multi-Account Switcher */}
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--divider)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Users size={16} />
                    </div>
                    <h3 className="text-sm font-extrabold text-[var(--text)]">{tr("Profil Akaun Tersimpan", "Saved Accounts")}</h3>
                  </div>
                  <span className="text-xs font-bold text-[var(--muted)]">{accounts.length} akaun</span>
                </div>

                <div className="divide-y divide-[var(--divider)] rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 overflow-hidden">
                  {accounts.map((acct) => {
                    const isActive = acct.email === activeEmail
                    return (
                      <button
                        key={acct.email}
                        type="button"
                        onClick={() => {
                          if (!isActive) {
                            switchToAccount(acct.email)
                            setActiveEmail(acct.email)
                            window.location.reload()
                          }
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-3.5 py-3 text-left transition",
                          isActive ? "bg-[var(--surface-tint-strong)]" : "hover:bg-[var(--surface-tint-strong)]/60"
                        )}
                      >
                        <UserAvatar name={acct.name || acct.email} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-[var(--text)]">{acct.name || acct.email}</p>
                          <p className="truncate text-[0.68rem] text-[var(--muted)]">{acct.email}</p>
                        </div>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={11} />
                            <span>{tr("Aktif", "Active")}</span>
                          </span>
                        ) : (
                          <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
                        )}
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => setShowAddAccountModal(true)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.99]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <UserCircle2 size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[var(--text)]">{tr("Tambah Akaun Lain", "Add Another Account")}</p>
                      <p className="text-[0.68rem] text-[var(--muted)]">{tr("Log masuk profil kedua", "Sign in second profile")}</p>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
                  </button>
                </div>
              </section>

              {/* Card 2: System Links & Docs */}
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-3">
                <p className="text-[0.68rem] font-black uppercase tracking-wider text-[var(--muted)]">
                  {tr("Pautan & Ciri Portal", "Portal Features & Docs")}
                </p>

                <div className="space-y-1.5">
                  {systemLinks.map((item) => {
                    const IconComp = item.icon
                    if (item.onClick) {
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={item.onClick}
                          className="group flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/20 px-3.5 py-3 text-left transition hover:bg-[var(--surface-tint)] hover:border-[var(--border-strong)]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                              <IconComp size={16} />
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-bold text-[var(--text)]">{item.label}</p>
                              <p className="text-[0.68rem] text-[var(--muted)] truncate">{item.desc}</p>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5" />
                        </button>
                      )
                    }
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="group flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/20 px-3.5 py-3 transition hover:bg-[var(--surface-tint)] hover:border-[var(--border-strong)]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                            <IconComp size={16} />
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-bold text-[var(--text)]">{item.label}</p>
                            <p className="text-[0.68rem] text-[var(--muted)] truncate">{item.desc}</p>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    )
                  })}
                </div>
              </section>

              {/* Card 3: Danger Zone & Logout */}
              <section className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 border-b border-rose-500/15 pb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-rose-600 dark:text-rose-400">{tr("Zon Keselamatan & Bahaya", "Danger Zone")}</h3>
                    <p className="text-[0.68rem] text-[var(--muted)]">{tr("Tindakan pemadaman kekal rekod akaun", "Irreversible account wipe actions")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openDangerModal("reset")}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
                  >
                    <RefreshCw size={13} />
                    <span>{tr("Reset Rekod", "Reset Records")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openDangerModal("delete")}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-600 dark:text-rose-400 transition hover:bg-rose-500/20 active:scale-95"
                  >
                    <Trash2 size={13} />
                    <span>{tr("Padam Akaun", "Delete Profile")}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-rose-500/15">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-3 text-xs font-black uppercase tracking-wider text-red-500 transition hover:bg-red-500/20 active:scale-[0.98]"
                  >
                    <LogOut size={15} strokeWidth={2.5} />
                    <span>{t.logout || tr("Log Keluar Sesi", "Log Out Session")}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </DesktopPageBody>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          MOBILE BOTTOM SHEETS
      ───────────────────────────────────────────────────────────────── */}
      {activeMobileSheet && (
        <div
          className="fixed inset-0 z-[80] flex items-end bg-[var(--overlay)] backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          onClick={requestMobileSheetClose}
        >
          <div
            className="app-sheet-panel max-h-[90dvh] w-full overflow-y-auto border-t border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(2rem+env(safe-area-inset-bottom,0px))] shadow-2xl rounded-t-[36px] transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <AppSheetHeader
              title={
                activeMobileSheet === "profile"
                  ? tr("Kemaskini Profil", "Edit Profile")
                  : activeMobileSheet === "email"
                  ? tr("Tukar Alamat E-mel", "Change Email")
                  : activeMobileSheet === "accounts"
                  ? tr("Tukar Akaun", "Switch Account")
                  : activeMobileSheet === "language"
                  ? t.language || "Bahasa"
                  : activeMobileSheet === "theme"
                  ? t.theme || "Tema"
                  : activeMobileSheet === "timezone"
                  ? t.timezone || "Zon Masa"
                  : activeMobileSheet === "timeFormat"
                  ? t.timeFormat || "Format Masa"
                  : activeMobileSheet === "cycleReset"
                  ? tr("Kitaran Reset", "Reset Cycle")
                  : tr("Zon Bahaya", "Danger Zone")
              }
              onClose={requestMobileSheetClose}
            />

            <div className="px-5 pt-3 pb-2 space-y-4">
              {/* Profile Sheet */}
              {activeMobileSheet === "profile" && (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-3.5">
                    <div className="relative">
                      <UserAvatar name={name || profile?.name} size={64} src={profile?.avatar_url} />
                      <label
                        htmlFor="settings-avatar-upload-input"
                        className={cn(
                          "absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow cursor-pointer active:scale-90 transition border border-[var(--bg)]",
                          avatarUploading && "pointer-events-none opacity-50"
                        )}
                        title={tr("Tukar Gambar", "Change Photo")}
                      >
                        {avatarUploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                      </label>
                    </div>
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="settings-avatar-upload-input"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-tint-strong)] px-3 py-1.5 text-xs font-bold text-[var(--text)] active:scale-95 transition"
                      >
                        {avatarUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                        <span>{tr("Muat Naik Gambar", "Upload Photo")}</span>
                      </label>
                      <p className="mt-1 text-[0.68rem] text-[var(--muted)]">JPG, PNG atau WEBP (&le; 2MB)</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {t.fullName || tr("Nama Paparan", "Display Name")}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={tr("Nama anda", "Your name")}
                      className="mt-1.5 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                        {tr("Gaya Personaliti Bot", "Bot Personality Tone")}
                      </label>
                      <span className="text-[0.68rem] text-[var(--muted)]">WhatsApp & Telegram</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {personalityPresets.map((p) => {
                        const active = botPersonality === p.label
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setBotPersonality(p.label)}
                            className={cn(
                              "flex items-center justify-between p-3.5 rounded-2xl border text-left transition active:scale-[0.99]",
                              active
                                ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] shadow-2xs font-bold"
                                : "border-[var(--border)] bg-[var(--surface-tint)]/40 text-[var(--muted)] hover:border-[var(--border-strong)]"
                            )}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="text-xs font-black text-[var(--text)]">{p.label}</p>
                              <p className="text-[0.68rem] text-[var(--muted)] mt-0.5">{p.desc}</p>
                            </div>
                            <div
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                                active ? "border-emerald-500 bg-emerald-500 text-white" : "border-[var(--border-strong)] bg-[var(--card)]"
                              )}
                            >
                              {active && <Check size={12} strokeWidth={3} />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={profileSaving || !hasProfileChanges}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-3.5 text-xs font-bold text-[var(--btn-primary-text)] shadow-md transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {profileSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    <span>{tr("Simpan Profil", "Save Changes")}</span>
                  </button>
                </form>
              )}

              {/* Email Sheet */}
              {activeMobileSheet === "email" && (
                <div className="space-y-4">
                  <form onSubmit={handleRequestEmailCode} className="space-y-3.5">
                    <div>
                      <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                        {tr("E-mel Baharu", "New Email Address")}
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="nama@email.com"
                        className="mt-1.5 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                      />
                    </div>

                    <div>
                      <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                        {tr("Kata Laluan Semasa", "Current Password")}
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder={tr("Masukkan kata laluan", "Enter password")}
                          className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 pr-10 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    {emailError && (
                      <div className="flex items-center gap-2 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>{emailError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={requestingEmailCode || !newEmail.trim() || !currentPassword}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-3 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.98] disabled:opacity-40"
                    >
                      {requestingEmailCode ? <Loader2 size={14} className="animate-spin" /> : <MailCheck size={14} />}
                      <span>{tr("Hantar Kod Verifikasi", "Send Verification Code")}</span>
                    </button>
                  </form>

                  {emailStep === "code_sent" && (
                    <form onSubmit={handleConfirmEmailCode} className="space-y-3 rounded-3xl border border-[var(--border-strong)] bg-[var(--surface-tint)] p-4 shadow-xs">
                      <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text)]">
                        {tr("Kod Verifikasi 6-Digit", "6-Digit Verification Code")}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="123456"
                        className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-center text-xl font-black tracking-[0.25em] text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                      />
                      <button
                        type="submit"
                        disabled={confirmingEmail || verificationCode.trim().length !== 6}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-3 text-xs font-bold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40"
                      >
                        {confirmingEmail ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        <span>{tr("Sahkan E-mel", "Verify Email")}</span>
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Multi-Account Sheet */}
              {activeMobileSheet === "accounts" && (
                <div className="space-y-3">
                  <div className="divide-y divide-[var(--divider)] rounded-3xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-xs">
                    {accounts.map((acct) => {
                      const isActive = acct.email === activeEmail
                      return (
                        <button
                          key={acct.email}
                          type="button"
                          onClick={() => {
                            if (!isActive) {
                              switchToAccount(acct.email)
                              setActiveEmail(acct.email)
                              window.location.reload()
                            }
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-3.5 text-left transition",
                            isActive ? "bg-[var(--surface-tint-strong)]" : "hover:bg-[var(--surface-tint)] active:bg-[var(--surface-tint-strong)]"
                          )}
                        >
                          <UserAvatar name={acct.name || acct.email} size={38} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-[var(--text)]">{acct.name || acct.email}</p>
                            <p className="truncate text-[0.68rem] text-[var(--muted)]">{acct.email}</p>
                          </div>
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 size={11} />
                              <span>{tr("Aktif", "Active")}</span>
                            </span>
                          ) : (
                            <ChevronRight size={15} className="text-[var(--muted)]" />
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      closeMobileSheet()
                      setShowAddAccountModal(true)
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-tint)] py-3.5 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.98]"
                  >
                    <UserCircle2 size={16} />
                    <span>{tr("Tambah / Log Masuk Akaun Lain", "Add Another Account")}</span>
                  </button>
                </div>
              )}

              {/* Language Sheet */}
              {activeMobileSheet === "language" && (
                <div className="space-y-2.5">
                  {languageOptions.map((option) => {
                    const isActive = lang === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => requestMobileSheetCloseThen(() => setLang(option.value))}
                        className={cn(
                          "flex w-full items-center justify-between p-4 rounded-3xl border text-left transition active:scale-[0.99] shadow-xs",
                          isActive ? "border-[var(--text)] bg-[var(--surface-tint-strong)]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-tint)]"
                        )}
                      >
                        <div className="flex items-center gap-3.5">
                          <span className="text-2xl">{option.flag}</span>
                          <div>
                            <p className="text-sm font-bold text-[var(--text)]">{option.label}</p>
                            <p className="text-xs text-[var(--muted)]">{option.region}</p>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                            isActive ? "border-emerald-500 bg-emerald-500 text-white" : "border-[var(--border-strong)] bg-[var(--surface-tint)]"
                          )}
                        >
                          {isActive && <Check size={13} strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Theme Sheet */}
              {activeMobileSheet === "theme" && (
                <div className="space-y-2.5">
                  {themeOptions.map((option) => {
                    const isActive = theme === option.value
                    const IconComp = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => requestMobileSheetCloseThen(() => setTheme(option.value))}
                        className={cn(
                          "flex w-full items-center justify-between p-4 rounded-3xl border text-left transition active:scale-[0.99] shadow-xs",
                          isActive ? "border-[var(--text)] bg-[var(--surface-tint-strong)]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-tint)]"
                        )}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--text)] border border-[var(--border)]">
                            <IconComp size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[var(--text)]">{option.label}</p>
                            <p className="text-xs text-[var(--muted)]">{option.desc}</p>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                            isActive ? "border-emerald-500 bg-emerald-500 text-white" : "border-[var(--border-strong)] bg-[var(--surface-tint)]"
                          )}
                        >
                          {isActive && <Check size={13} strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Timezone Sheet */}
              {activeMobileSheet === "timezone" && (
                <div className="space-y-2">
                  <div className="divide-y divide-[var(--divider)] rounded-3xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-xs">
                    {timezoneOptions.map((option) => {
                      const isActive = timezone === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => requestMobileSheetCloseThen(() => setTimezone(option.value))}
                          className={cn(
                            "flex w-full items-center justify-between px-4 py-3.5 text-left transition active:scale-[0.99]",
                            isActive ? "bg-[var(--surface-tint-strong)] font-bold" : "hover:bg-[var(--surface-tint)]"
                          )}
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <p className="text-xs font-bold text-[var(--text)]">{option.label}</p>
                            <p className="text-[0.68rem] text-[var(--muted)]">{option.desc}</p>
                          </div>
                          <div
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                              isActive ? "border-emerald-500 bg-emerald-500 text-white" : "border-[var(--border-strong)] bg-[var(--surface-tint)]"
                            )}
                          >
                            {isActive && <Check size={11} strokeWidth={3} />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Time Format Sheet */}
              {activeMobileSheet === "timeFormat" && (
                <div className="space-y-2.5">
                  {timeFormatOptions.map((option) => {
                    const isActive = timeFormat === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => requestMobileSheetCloseThen(() => setTimeFormat(option.value))}
                        className={cn(
                          "flex w-full items-center justify-between p-4 rounded-3xl border text-left transition active:scale-[0.99] shadow-xs",
                          isActive ? "border-[var(--text)] bg-[var(--surface-tint-strong)]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-tint)]"
                        )}
                      >
                        <div>
                          <p className="text-sm font-bold text-[var(--text)]">{option.label}</p>
                          <p className="text-xs text-[var(--muted)]">{tr("Contoh:", "Example:")} {option.desc}</p>
                        </div>
                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                            isActive ? "border-emerald-500 bg-emerald-500 text-white" : "border-[var(--border-strong)] bg-[var(--surface-tint)]"
                          )}
                        >
                          {isActive && <Check size={13} strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Cycle Reset Sheet */}
              {activeMobileSheet === "cycleReset" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5">
                    <button
                      type="button"
                      onClick={() => saveCycleMode("day")}
                      disabled={cycleModeSaving}
                      className={cn(
                        "rounded-xl py-2.5 text-xs font-bold transition",
                        cycleMode === "day"
                          ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                          : "text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      {tr("Ikut Hari", "By Day")}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCycleMode("category")}
                      disabled={cycleModeSaving}
                      className={cn(
                        "rounded-xl py-2.5 text-xs font-bold transition",
                        cycleMode === "category"
                          ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                          : "text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      {tr("Ikut Gaji", "By Salary")}
                    </button>
                  </div>

                  {cycleMode === "day" ? (
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
                      <CycleResetCalendar
                        value={cycleStartDay}
                        onChange={(d) => {
                          setCycleStartDay(d)
                          saveCycleStartDay(d)
                        }}
                        lang={lang}
                      />
                      <p className="mt-3 text-center text-xs text-[var(--muted)]">
                        {cycleSaving ? tr("Menyimpan...", "Saving...") : tr(`Kitaran bermula setiap ${cycleStartDay} hari bulan`, `Cycle restarts on day ${cycleStartDay}`)}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 text-center shadow-xs space-y-1">
                      <p className="text-xs font-bold text-[var(--text)]">{tr("Mod Automatik Gaji", "Salary Automatic Mode")}</p>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">
                        {tr("Kitaran reset secara automatik mengikut tarikh rekod gaji bulanan anda (Mgaji / Msalary).", "Cycle automatically resets on your monthly salary transaction date.")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Danger Sheet */}
              {activeMobileSheet === "danger" && (
                <div className="space-y-3">
                  <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                      <AlertTriangle size={22} />
                    </div>
                    <h4 className="mt-2.5 text-sm font-black text-rose-600 dark:text-rose-400">{tr("Tindakan Berbahaya", "Critical Actions")}</h4>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {tr("Pilih tindakan pemadaman di bawah. Sila berhati-hati sebelum meneruskan.", "Select an action below. Please proceed with caution.")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileSheet()
                        openDangerModal("reset")
                      }}
                      className="flex items-center justify-between p-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.99] shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                          <RefreshCw size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[var(--text)]">{tr("Reset Rekod Transaksi", "Reset Transaction Records")}</p>
                          <p className="text-[0.68rem] text-[var(--muted)]">{tr("Kosongkan transaksi & baki dompet", "Clear transactions & wallet balances")}</p>
                        </div>
                      </div>
                      <ChevronRight size={15} className="text-[var(--muted)]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        closeMobileSheet()
                        openDangerModal("delete")
                      }}
                      className="flex items-center justify-between p-4 rounded-3xl border border-rose-500/30 bg-rose-500/10 text-left transition hover:bg-rose-500/20 active:scale-[0.99] shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400">
                          <Trash2 size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{tr("Padam Akaun Secara Kekal", "Permanently Delete Account")}</p>
                          <p className="text-[0.68rem] text-rose-500/80">{tr("Padam profil, sesi & rekod mutlak", "Delete profile, session & all data")}</p>
                        </div>
                      </div>
                      <ChevronRight size={15} className="text-rose-600 dark:text-rose-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          CONFIRMATION MODAL (Reset / Delete Data)
      ───────────────────────────────────────────────────────────────── */}
      {confirmModalOpen && dangerAction && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-[var(--bg)] animate-in fade-in">
          <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-[var(--divider)]">
            <button
              type="button"
              disabled={dangerBusy}
              onClick={() => setConfirmModalOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-[var(--muted)] hover:bg-[var(--surface-tint)]"
            >
              ✕
            </button>
            <h2 className="text-sm font-extrabold text-[var(--text)]">
              {dangerAction === "delete"
                ? tr("Pengesahan Padam Akaun", "Delete Account Confirmation")
                : tr("Pengesahan Reset Rekod", "Reset Records Confirmation")}
            </h2>
            <div className="w-9" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto w-full max-w-md space-y-6">
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl",
                    dangerAction === "delete"
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : "bg-[var(--surface-tint-strong)] text-[var(--text)]"
                  )}
                >
                  {dangerAction === "delete" ? <Trash2 size={26} /> : <RefreshCw size={26} />}
                </div>

                <h3 className="mt-4 text-lg font-black text-[var(--text)]">
                  {dangerAction === "delete"
                    ? tr("Padam Akaun & Semua Rekod Secara Mutlak?", "Permanently Delete Account & Data?")
                    : tr("Kosongkan Semua Transaksi & Rekod?", "Reset & Clear All Records?")}
                </h3>

                <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">
                  {dangerAction === "delete"
                    ? tr(
                        "Tindakan ini kekal dan tidak boleh diundur. Akaun, log masuk dan semua rekod anda akan dipadam.",
                        "This action is irreversible. Your account and all records will be completely deleted."
                      )
                    : tr(
                        "Semua rekod transaksi, dompet, dan hutang akan dikosongkan. Profil log masuk e-mel anda akan dikekalkan.",
                        "All transaction history, wallets and debts will be cleared. Your email login will remain intact."
                      )}
                </p>
              </div>

              {/* Data Breakdown Cards */}
              {dangerStats && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
                  <p className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                    {tr("Ringkasan Data Terjejas", "Summary of Affected Data")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Transaksi", "Transactions")}</p>
                      <p className="text-base font-black text-[var(--text)] mt-0.5">{dangerStats.transaction_count.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Dompet / Wallets", "Wallets")}</p>
                      <p className="text-base font-black text-[var(--text)] mt-0.5">{dangerStats.wallet_count.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Rekod Hutang", "Debts")}</p>
                      <p className="text-base font-black text-[var(--text)] mt-0.5">{dangerStats.debt_count.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                      <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Pinjaman", "Loans")}</p>
                      <p className="text-base font-black text-[var(--text)] mt-0.5">{dangerStats.loan_count.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation Inputs Form */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
                {needsDangerPassword ? (
                  <div>
                    <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("Kata Laluan Semasa", "Current Password")}
                    </label>
                    <input
                      type="password"
                      value={dangerPassword}
                      onChange={(e) => setDangerPassword(e.target.value)}
                      placeholder={tr("Masukkan kata laluan", "Enter password")}
                      className="mt-1 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text)] outline-none"
                    />
                  </div>
                ) : (
                  <p className="rounded-xl bg-[var(--surface-tint)] px-3 py-2 text-[11px] font-semibold text-[var(--muted)]">
                    {tr("Anda log masuk dengan Google — log masuk semasa sudah cukup pengesahan. Teruskan sahaja.", "You signed in with Google — your current sign-in is already verified. Just continue.")}
                  </p>
                )}

                <div>
                  <label className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                    {tr(`Taip perkataan "${activeDangerWord}" untuk sahkan:`, `Type "${activeDangerWord}" to confirm:`)}
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={activeDangerWord}
                    className="mt-1 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-black uppercase tracking-wider text-[var(--text)] outline-none"
                  />
                </div>

                {dangerError && (
                  <p className="text-xs text-rose-500 font-semibold">{dangerError}</p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--divider)] bg-[var(--bg)] px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-md gap-3">
              <button
                type="button"
                disabled={dangerBusy}
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 rounded-xl border border-[var(--border)] py-3 text-xs font-bold text-[var(--muted)] hover:bg-[var(--surface-tint)] transition"
              >
                {tr("Batal", "Cancel")}
              </button>
              <button
                type="button"
                disabled={
                  dangerBusy ||
                  (needsDangerPassword && !dangerPassword) ||
                  confirmText.trim().toUpperCase() !== activeDangerWord
                }
                onClick={executeDangerAction}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white transition active:scale-[0.98] disabled:opacity-40",
                  dangerAction === "delete" ? "bg-rose-600 hover:bg-rose-500" : "bg-[var(--text)] text-[var(--bg)]"
                )}
              >
                {dangerBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>{dangerAction === "delete" ? tr("Setuju & Padam", "Agree & Delete") : tr("Setuju & Reset", "Agree & Reset")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals & Alerts */}
      {alertModal}

      <BadgeOverviewModal
        open={showBadgeModal}
        onClose={() => setShowBadgeModal(false)}
        sessionId={sessionId}
        lang={lang}
      />

      <AddAccountModal
        open={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onAdded={() => window.location.reload()}
      />
    </div>
  )
}
