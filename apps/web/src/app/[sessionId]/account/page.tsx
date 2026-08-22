"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  MailCheck,
  PencilLine,
  Save,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ChevronRight,
  Camera,
  Users,
  ShieldAlert,
  KeyRound,
  Layers,
  ArrowRight,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { UserAvatar } from "@/components/ui/UserAvatar"
import { getAccessToken, setAuthTokens, logoutAuthSession } from "@/lib/auth-session"
import { getAccounts, getActiveEmail, switchToAccount, type AccountProfile } from "@/lib/multi-account"
import { MobilePageHeader, DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal"
import { AddAccountModal } from "@/components/ui/AddAccountModal"

type Profile = {
  id: string
  name: string
  email: string
  bot_personality: string
  has_password?: boolean
  avatar_url?: string | null
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
}

export function AccountContent({ embedded = false }: { embedded?: boolean }) {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang, t } = useLang()
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState("")
  const [botPersonality, setBotPersonality] = useState("")
  const [personalityOpen, setPersonalityOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [requestingEmailCode, setRequestingEmailCode] = useState(false)
  const [confirmingEmail, setConfirmingEmail] = useState(false)
  const [emailStep, setEmailStep] = useState<"idle" | "code_sent">("idle")
  const [emailMessage, setEmailMessage] = useState("")
  const [emailError, setEmailError] = useState("")
  const [showBadgeModal, setShowBadgeModal] = useState(false)
  const [showAddAccountModal, setShowAddAccountModal] = useState(false)
  const { showAlert, alertModal } = usePageAlert(lang)

  const [dangerAction, setDangerAction] = useState<"reset" | "delete" | null>(null)
  const [dangerPassword, setDangerPassword] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [dangerBusy, setDangerBusy] = useState(false)
  const [dangerError, setDangerError] = useState("")
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stats, setStats] = useState<{
    transaction_count: number
    wallet_count: number
    debt_count: number
    loan_count: number
    subscription_count: number
  } | null>(null)
  const [activeMobileSheet, setActiveMobileSheet] = useState<"profile" | "email" | "danger" | null>(null)
  const [accounts, setAccounts] = useState<AccountProfile[]>([])
  const [activeEmail, setActiveEmail] = useState<string | null>(null)

  useEffect(() => {
    setAccounts(getAccounts())
    setActiveEmail(getActiveEmail())
  }, [])

  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const token = getAccessToken()
        const res = await fetch("/api/users/me", {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const normalized: Profile = {
          id: data.id,
          name: data.name || "",
          email: data.email || "",
          bot_personality: data.bot_personality || "",
          avatar_url: data.avatar_url || null,
        }
        setProfile(normalized)
        setName(normalized.name)
        setBotPersonality(normalized.bot_personality)
      } catch (err) {
        console.error("Failed loading account:", err)
        setError(tr("Gagal memuatkan profil akaun.", "Failed to load account profile."))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lang])

  const hasChanges = useMemo(() => {
    if (!profile) return false
    const normalizedPersonality = normalizePersonalityInput(botPersonality)
    const profilePersonality = normalizePersonalityInput(profile.bot_personality || "")
    return name.trim() !== profile.name || normalizedPersonality !== profilePersonality
  }, [name, botPersonality, profile])

  const personalityPresets = useMemo(
    () =>
      isBm
        ? ["Mesra & santai", "Straight to point", "Coach bajet tegas", "Professional ringkas"]
        : ["Friendly & casual", "Straight to the point", "Strict budget coach", "Professional concise"],
    [isBm]
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const token = getAccessToken()
      const payload = { name: name.trim(), bot_personality: normalizePersonalityInput(botPersonality) }
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const apiErr = await res.json().catch(() => ({}))
        throw new Error(apiErr?.detail || "Request failed")
      }
      const updated = await res.json()
      const normalized: Profile = {
        id: updated.id,
        name: updated.name || "",
        email: updated.email || "",
        bot_personality: updated.bot_personality || "",
        avatar_url: updated.avatar_url || null,
      }
      setProfile(normalized)
      setName(normalized.name)
      setBotPersonality(normalized.bot_personality)
      setMessage(tr("Profil berjaya dikemaskini.", "Profile updated successfully."))
      showAlert(
        tr("Berjaya Disimpan", "Saved"),
        tr("Profil berjaya dikemaskini.", "Profile updated successfully."),
        "success"
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      const finalMessage = msg || tr("Gagal kemaskini profil.", "Failed to update profile.")
      setError(finalMessage)
      showAlert(tr("Kemaskini Gagal", "Update Failed"), finalMessage, "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    if (file.size > 2_097_152) {
      setError(tr("Imej terlalu besar. Maksimum 2 MB.", "Image too large. Maximum 2 MB."))
      return
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(tr("Hanya PNG, JPG atau WEBP dibenarkan.", "Only PNG, JPG or WEBP allowed."))
      return
    }
    setAvatarUploading(true)
    setError("")
    try {
      const token = getAccessToken()
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const apiErr = await res.json().catch(() => ({}))
        throw new Error(apiErr?.detail || "Upload failed")
      }
      const data = await res.json()
      setProfile((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : prev))
      setMessage(tr("Gambar profil berjaya dikemaskini.", "Profile picture updated."))
      showAlert(tr("Berjaya", "Success"), tr("Gambar profil berjaya dikemaskini.", "Profile picture updated."), "success")
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr("Gagal muat naik gambar.", "Upload failed.")
      setError(msg)
      showAlert(tr("Muat Naik Gagal", "Upload Failed"), msg, "error")
    } finally {
      setAvatarUploading(false)
      e.target.value = ""
    }
  }

  async function handleRequestEmailCode(e: React.FormEvent) {
    e.preventDefault()
    setRequestingEmailCode(true)
    setEmailError("")
    setEmailMessage("")
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/email-change/request", {
        method: "POST",
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ new_email: newEmail.trim(), current_password: currentPassword }),
      })
      if (!res.ok) {
        const apiErr = await res.json().catch(() => ({}))
        throw new Error(apiErr?.detail || "Request failed")
      }
      setEmailStep("code_sent")
      setEmailMessage(tr("Kod verifikasi telah dihantar ke e-mel baru anda.", "Verification code has been sent to your new email."))
      showAlert(
        tr("Kod Dihantar", "Code Sent"),
        tr("Kod verifikasi telah dihantar ke e-mel baru anda.", "Verification code has been sent to your new email."),
        "success"
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      const finalMessage = msg || tr("Gagal hantar kod verifikasi.", "Failed to send verification code.")
      setEmailError(finalMessage)
      showAlert(tr("Tindakan Gagal", "Action Failed"), finalMessage, "error")
    } finally {
      setRequestingEmailCode(false)
    }
  }

  async function handleConfirmEmailCode(e: React.FormEvent) {
    e.preventDefault()
    setConfirmingEmail(true)
    setEmailError("")
    setEmailMessage("")
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/email-change/confirm", {
        method: "POST",
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: verificationCode.trim() }),
      })
      if (!res.ok) {
        const apiErr = await res.json().catch(() => ({}))
        throw new Error(apiErr?.detail || "Request failed")
      }
      const tokenData: TokenResponse = await res.json()
      setAuthTokens(tokenData.access_token, tokenData.refresh_token)
      const updatedEmail = newEmail.trim().toLowerCase()
      setProfile((prev) => (prev ? { ...prev, email: updatedEmail } : prev))
      setNewEmail("")
      setCurrentPassword("")
      setVerificationCode("")
      setEmailStep("idle")
      setEmailMessage(tr("E-mel berjaya ditukar dan disahkan.", "Email updated and verified successfully."))
      showAlert(
        tr("Berjaya Disahkan", "Verified"),
        tr("E-mel berjaya ditukar dan disahkan.", "Email updated and verified successfully."),
        "success"
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      const finalMessage = msg || tr("Gagal sahkan e-mel baru.", "Failed to verify new email.")
      setEmailError(finalMessage)
      showAlert(tr("Pengesahan Gagal", "Verification Failed"), finalMessage, "error")
    } finally {
      setConfirmingEmail(false)
    }
  }

  async function handleDangerAction(e: React.FormEvent) {
    e.preventDefault()
    if (!dangerAction) return
    if (profile?.has_password && !dangerPassword) return
    setDangerBusy(true)
    setDangerError("")
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/stats", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error("Failed to load account stats")
      const data = await res.json()
      setStats({
        transaction_count: data.transaction_count ?? 0,
        wallet_count: data.wallet_count ?? 0,
        debt_count: data.debt_count ?? 0,
        loan_count: data.loan_count ?? 0,
        subscription_count: data.subscription_count ?? 0,
      })
      setConfirmOpen(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      const finalMessage = msg || tr("Tindakan gagal. Sila cuba lagi.", "Action failed. Please try again.")
      setDangerError(finalMessage)
      showAlert(tr("Tindakan Gagal", "Action Failed"), finalMessage, "error")
    } finally {
      setDangerBusy(false)
    }
  }

  async function confirmDangerAction() {
    if (!dangerAction) return
    setDangerBusy(true)
    setDangerError("")
    try {
      const token = getAccessToken()
      const url =
        dangerAction === "delete"
          ? "/api/users/me"
          : "/api/users/me/reset"
      const res = await fetch(url, {
        method: dangerAction === "delete" ? "DELETE" : "POST",
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ current_password: dangerPassword }),
      })
      if (!res.ok) {
        const apiErr = await res.json().catch(() => ({}))
        throw new Error(apiErr?.detail || "Request failed")
      }
      setConfirmOpen(false)
      if (dangerAction === "delete") {
        await logoutAuthSession()
        router.push("/login")
      } else {
        setDangerAction(null)
        setDangerPassword("")
        setConfirmText("")
        setActiveMobileSheet(null)
        showAlert(
          tr("Akaun Direset", "Account Reset"),
          tr("Semua data akaun telah dikosongkan. Anda akan mula semula dari onboarding.", "All account data has been cleared. You will start fresh from onboarding."),
          "success"
        )
        router.refresh()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      const finalMessage = msg || tr("Tindakan gagal. Sila cuba lagi.", "Action failed. Please try again.")
      setDangerError(finalMessage)
      showAlert(tr("Tindakan Gagal", "Action Failed"), finalMessage, "error")
    } finally {
      setDangerBusy(false)
    }
  }

  const resetConfirmWord = tr("RESET", "RESET")
  const deleteConfirmWord = tr("PADAM", "DELETE")
  const activeConfirmWord = dangerAction === "delete" ? deleteConfirmWord : resetConfirmWord

  const { requestClose: requestMobileSheetClose } = useOverlayBackClose({
    id: "account-mobile-sheet",
    isOpen: Boolean(activeMobileSheet),
    onClose: () => setActiveMobileSheet(null),
  })

  const mobileSheetMeta = activeMobileSheet
    ? {
        profile: {
          title: tr("Edit Profil", "Edit Profile"),
          subtitle: tr("Nama & personaliti bot", "Name & bot personality"),
        },
        email: {
          title: tr("Tukar E-mel", "Change Email"),
          subtitle: profile?.email || "-",
        },
        danger: {
          title: tr("Zon Bahaya", "Danger Zone"),
          subtitle: tr("Tindakan kritikal pemadaman atau tetapan semula data", "Critical reset or account deletion actions"),
        },
      }[activeMobileSheet]
    : null

  return (
    <div className={cn("space-y-4 md:space-y-0", embedded ? "" : "pb-20 md:pb-0")}>
      {/* ─── Mobile View ─── */}
      <div className="space-y-5 md:hidden">
        {!embedded && (
          <MobilePageHeader
            title={tr("Akaun Saya", "My Account")}
            fallbackHref={`/${sessionId}/settings`}
            backPreferHistory
          />
        )}

        <section className="px-1 space-y-4">
          {/* Profile Overview Card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveMobileSheet("profile")}
              className="flex w-full items-center gap-3 text-left active:scale-[0.99] transition"
            >
              <div className="relative shrink-0">
                <UserAvatar name={name || profile?.name} size={52} src={profile?.avatar_url} />
                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] border border-[var(--border)] text-[var(--text)]">
                  <Camera size={10} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-[var(--text)]">
                  {profile?.name || tr("Memuatkan…", "Loading…")}
                </p>
                <p className="truncate text-xs font-medium text-[var(--muted)]">{profile?.email || "—"}</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Sparkles size={9} />
                  <span>{normalizePersonalityInput(botPersonality) || tr("Personaliti Standard", "Standard Personality")}</span>
                </span>
              </div>
              <ChevronRight size={18} className="shrink-0 text-[var(--muted)]" />
            </button>
          </div>

          {/* Account Settings Menu */}
          <div className="space-y-1.5">
            <p className="px-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              {tr("Tetapan Profil & Keselamatan", "Profile & Security")}
            </p>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--divider)] shadow-sm">
              <button
                type="button"
                onClick={() => setActiveMobileSheet("profile")}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.99]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <PencilLine size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-bold text-[var(--text)]">{tr("Edit Profil", "Edit Profile")}</p>
                  <p className="mt-0.5 truncate text-[0.7rem] text-[var(--muted)]">{tr("Nama paparan & gaya komunikasi bot", "Display name & bot tone")}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
              </button>

              <button
                type="button"
                onClick={() => setActiveMobileSheet("email")}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.99]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <MailCheck size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-bold text-[var(--text)]">{tr("Tukar E-mel", "Change Email")}</p>
                  <p className="mt-0.5 truncate text-[0.7rem] text-[var(--muted)]">{profile?.email || "—"}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
              </button>
            </div>
          </div>

          {/* Stored Accounts List */}
          <div className="space-y-1.5">
            <p className="px-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              {tr("Tukar Akaun / Multi-Account", "Multi-Account Switching")}
            </p>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--divider)] shadow-sm">
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
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]",
                      isActive ? "bg-[var(--surface-tint)]" : "hover:bg-[var(--surface-tint)]/60"
                    )}
                  >
                    <UserAvatar name={acct.name || acct.email} size={34} />
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
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-tint)]/80 active:scale-[0.99]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                  <UserCircle2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--text)]">{tr("Tambah / Log Masuk Akaun Lain", "Add Another Account")}</p>
                  <p className="truncate text-[0.68rem] text-[var(--muted)]">{tr("Log masuk akaun kedua atau perniagaan", "Sign in to a second personal or business account")}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
              </button>
            </div>
          </div>

          {/* Danger Zone Row */}
          <div className="space-y-1.5 pt-2">
            <p className="px-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-rose-500">
              {tr("Zon Berbahaya", "Danger Zone")}
            </p>
            <button
              type="button"
              onClick={() => setActiveMobileSheet("danger")}
              className="flex w-full items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3.5 text-left transition hover:bg-rose-500/10 active:scale-[0.99]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <AlertTriangle size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{tr("Reset Data atau Padam Akaun", "Reset Data or Delete Account")}</p>
                <p className="truncate text-[0.68rem] text-[var(--muted)]">{tr("Tindakan pemadaman kekal", "Permanent data wipe actions")}</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-rose-500/60" />
            </button>
          </div>
        </section>
      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        {!embedded && (
          <DesktopPageHeader
            title={tr("Akaun & Keselamatan", "Account & Security")}
            homeHref={`/${sessionId}`}
            breadcrumbs={[
              { label: tr("Tetapan", "Settings"), href: `/${sessionId}/settings` },
              { label: tr("Akaun", "Account") },
            ]}
          />
        )}

        <DesktopPageBody className={cn("space-y-6", embedded ? "" : "pt-6")}>
          {/* Hero Profile Overview Bar */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <UserAvatar name={name || profile?.name} size={64} src={profile?.avatar_url} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-black tracking-tight text-[var(--text)]">
                      {profile?.name || tr("Memuatkan Profil…", "Loading Profile…")}
                    </h1>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <ShieldCheck size={12} />
                      <span>{tr("Disahkan", "Verified")}</span>
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[var(--muted)]">{profile?.email || "—"}</p>
                </div>
              </div>

              {/* Avatar Uploader Button */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="desktop-avatar-upload"
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.98]",
                    avatarUploading && "pointer-events-none opacity-60"
                  )}
                >
                  {avatarUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  <span>{avatarUploading ? tr("Memuat naik…", "Uploading…") : tr("Tukar Gambar Profil", "Change Picture")}</span>
                </label>
                <input
                  id="desktop-avatar-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={avatarUploading}
                />
              </div>
            </div>
          </div>

          {/* 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Edit Profile (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Form 1: Edit Profile Info */}
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-[var(--divider)] pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <PencilLine size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold text-[var(--text)]">{tr("Maklumat Profil", "Profile Details")}</h2>
                      <p className="text-xs text-[var(--muted)]">{tr("Nama paparan & gaya bot", "Display name & bot personality")}</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                  <TextField
                    label={t.fullName || tr("Nama Penuh", "Full Name")}
                    value={name}
                    onChange={setName}
                    placeholder={tr("Nama anda", "Your name")}
                  />

                  {/* Personality Picker */}
                  <div className="space-y-1.5">
                    <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("Personaliti Bot", "Bot Personality")}
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPersonalityOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-left text-xs md:text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--input-focus)]"
                      >
                        <span className="truncate">
                          {personalityPresets.includes(normalizePersonalityInput(botPersonality))
                            ? normalizePersonalityInput(botPersonality)
                            : tr("Pilih personaliti bot", "Choose bot personality")}
                        </span>
                        <ChevronDown
                          size={16}
                          className={cn("shrink-0 text-[var(--muted)] transition-transform", personalityOpen && "rotate-180")}
                        />
                      </button>

                      {personalityOpen && (
                        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg divide-y divide-[var(--divider)]">
                          {personalityPresets.map((preset) => {
                            const active = normalizePersonalityInput(botPersonality) === preset
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setBotPersonality(preset)
                                  setPersonalityOpen(false)
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs md:text-sm font-medium transition",
                                  active
                                    ? "bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold"
                                    : "hover:bg-[var(--surface-tint)] text-[var(--text)]"
                                )}
                              >
                                <span>{preset}</span>
                                {active && <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <p className="text-[0.7rem] text-[var(--muted)] leading-relaxed">
                      {tr(
                        "Menentukan nada santai atau formal mesej respon bot. Format logic dan arahan perbelanjaan kekal sama.",
                        "Sets the conversational tone of bot replies. Calculation logic and commands remain unchanged."
                      )}
                    </p>
                  </div>

                  {message && <SuccessBox>{message}</SuccessBox>}
                  {error && <ErrorBox>{error}</ErrorBox>}

                  <button
                    type="submit"
                    disabled={saving || !hasChanges}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-3 text-xs md:text-sm font-bold text-[var(--btn-primary-text)] shadow-sm transition active:scale-[0.98] hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} />}
                    <span>{tr("Simpan Perubahan Profil", "Save Profile Changes")}</span>
                  </button>
                </form>
              </section>

              {/* Form 2: Change Email */}
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-[var(--divider)] pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <MailCheck size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold text-[var(--text)]">{tr("Tukar Alamat E-mel", "Change Email Address")}</h2>
                      <p className="text-xs text-[var(--muted)]">{profile?.email || "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 rounded-xl bg-[var(--surface-tint)] p-3 text-xs text-[var(--muted)]">
                  <ShieldCheck size={16} className="shrink-0 text-indigo-500 mt-0.5" />
                  <p>
                    {tr(
                      "Kod pengesahan akan dihantar ke e-mel baharu anda. Pengesahan memerlukan kata laluan semasa.",
                      "A verification code will be sent to your new email. Requires your current password."
                    )}
                  </p>
                </div>

                <form onSubmit={handleRequestEmailCode} className="space-y-4">
                  <TextField
                    label={tr("Alamat E-mel Baharu", "New Email Address")}
                    value={newEmail}
                    onChange={setNewEmail}
                    placeholder="nama@email.com"
                    type="email"
                  />

                  <div className="space-y-1.5">
                    <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("Kata Laluan Semasa", "Current Password")}
                    </span>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={tr("Masukkan kata laluan akaun", "Enter account password")}
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 pr-10 text-xs md:text-sm text-[var(--text)] placeholder-[var(--input-placeholder)] outline-none focus:border-[var(--input-focus)]"
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
                  <form onSubmit={handleConfirmEmailCode} className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                    <span className="text-[0.68rem] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {tr("Masukkan Kod Verifikasi 6-Digit", "Enter 6-Digit Verification Code")}
                    </span>
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

                {emailMessage && <SuccessBox>{emailMessage}</SuccessBox>}
                {emailError && <ErrorBox>{emailError}</ErrorBox>}
              </section>
            </div>

            {/* Right Column: Multi-Account & Danger Zone (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Card 1: Multi-Account Switcher */}
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--divider)] pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Users size={16} />
                    </div>
                    <h3 className="text-sm font-extrabold text-[var(--text)]">{tr("Senarai Akaun", "Active Accounts")}</h3>
                  </div>
                  <span className="text-[0.68rem] text-[var(--muted)]">{accounts.length} akaun</span>
                </div>

                <div className="divide-y divide-[var(--divider)] rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] overflow-hidden">
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
                          "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition",
                          isActive ? "bg-[var(--surface-tint-strong)]" : "hover:bg-[var(--surface-tint-strong)]/60"
                        )}
                      >
                        <UserAvatar name={acct.name || acct.email} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-[var(--text)]">{acct.name || acct.email}</p>
                          <p className="truncate text-[0.68rem] text-[var(--muted)]">{acct.email}</p>
                        </div>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={11} />
                            <span>{tr("Aktif", "Active")}</span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddAccountModal(true)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-[var(--surface-tint-strong)]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <UserCircle2 size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[var(--text)]">{tr("Tambah Akaun Lain", "Add Account")}</p>
                      <p className="text-[0.68rem] text-[var(--muted)]">{tr("Log masuk akaun kedua", "Sign in another profile")}</p>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
                  </button>
                </div>
              </section>

              {/* Card 2: Danger Zone */}
              <section className="rounded-2xl border border-rose-500/30 bg-[var(--card)] p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-rose-500/20 pb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-rose-600 dark:text-rose-400">{tr("Zon Bahaya", "Danger Zone")}</h3>
                    <p className="text-[0.68rem] text-[var(--muted)]">{tr("Tindakan pemadaman kekal", "Irreversible actions")}</p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDangerError("")
                      setDangerPassword("")
                      setConfirmText("")
                      setDangerAction("reset")
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition active:scale-[0.98]"
                  >
                    <RefreshCw size={14} />
                    <span>{tr("Reset Semua Data", "Reset All Data")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDangerError("")
                      setDangerPassword("")
                      setConfirmText("")
                      setDangerAction("delete")
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition active:scale-[0.98]"
                  >
                    <Trash2 size={14} />
                    <span>{tr("Padam Akaun Kekal", "Delete Account")}</span>
                  </button>
                </div>

                {dangerAction && (
                  <form onSubmit={handleDangerAction} className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {dangerAction === "delete"
                        ? tr("Padam akaun dan semua data secara kekal. Taip PADAM untuk teruskan.", "Permanently deletes account and all data. Type DELETE to proceed.")
                        : tr("Kosongkan semua data perbelanjaan dan rekod. Taip RESET untuk teruskan.", "Wipes all expense records and data. Type RESET to proceed.")}
                    </p>

                    <div>
                      <input
                        type="password"
                        value={dangerPassword}
                        onChange={(e) => setDangerPassword(e.target.value)}
                        placeholder={tr("Kata laluan semasa", "Current password")}
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={activeConfirmWord}
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                      />
                    </div>

                    {dangerError && <ErrorBox>{dangerError}</ErrorBox>}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDangerAction(null)
                          setDangerPassword("")
                          setConfirmText("")
                        }}
                        className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-bold text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                      >
                        {tr("Batal", "Cancel")}
                      </button>
                      <button
                        type="submit"
                        disabled={
                          dangerBusy ||
                          (profile?.has_password && !dangerPassword) ||
                          confirmText.trim().toUpperCase() !== activeConfirmWord
                        }
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white transition active:scale-[0.98] disabled:opacity-40",
                          dangerAction === "delete" ? "bg-rose-600 hover:bg-rose-500" : "bg-[var(--text)] text-[var(--bg)]"
                        )}
                      >
                        {dangerBusy ? <Loader2 size={13} className="animate-spin" /> : null}
                        <span>{tr("Sahkan", "Confirm")}</span>
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          </div>
        </DesktopPageBody>
      </div>

      {/* ─── Mobile Bottom Sheets ─── */}
      {activeMobileSheet && mobileSheetMeta && (
        <div
          className="fixed inset-0 z-[80] flex items-end bg-[var(--overlay)] backdrop-blur-xs md:hidden animate-in fade-in"
          onClick={requestMobileSheetClose}
        >
          <div
            className="app-sheet-panel max-h-[88dvh] w-full overflow-y-auto border-t border-[var(--border)] bg-[var(--card)] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AppSheetHeader title={mobileSheetMeta.title} onClose={requestMobileSheetClose} />
            <div className="px-4 pt-2">
              {/* Profile Sheet */}
              {activeMobileSheet === "profile" && (
                <form onSubmit={handleSave} className="space-y-4 pb-2">
                  <div className="flex items-center gap-4 py-1">
                    <UserAvatar name={name || profile?.name} size={60} src={profile?.avatar_url} />
                    <label
                      htmlFor="mobile-avatar-upload"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1.5 text-xs font-bold text-[var(--text)]"
                    >
                      {avatarUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      <span>{tr("Tukar Gambar", "Change Photo")}</span>
                    </label>
                    <input
                      id="mobile-avatar-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={avatarUploading}
                    />
                  </div>

                  <TextField
                    label={t.fullName || tr("Nama Penuh", "Full Name")}
                    value={name}
                    onChange={setName}
                    placeholder={tr("Nama anda", "Your name")}
                  />

                  <div className="space-y-1.5">
                    <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {tr("Personaliti Bot", "Bot Personality")}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {personalityPresets.map((preset) => {
                        const active = normalizePersonalityInput(botPersonality) === preset
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setBotPersonality(preset)}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold text-left transition",
                              active
                                ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold"
                                : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
                            )}
                          >
                            <span className="truncate">{preset}</span>
                            {active && <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {message && <SuccessBox>{message}</SuccessBox>}
                  {error && <ErrorBox>{error}</ErrorBox>}

                  <button
                    type="submit"
                    disabled={saving || !hasChanges}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-3 text-xs font-bold text-[var(--btn-primary-text)] shadow-sm transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    <span>{tr("Simpan Perubahan", "Save Changes")}</span>
                  </button>
                </form>
              )}

              {/* Email Sheet */}
              {activeMobileSheet === "email" && (
                <div className="space-y-4 pb-2">
                  <form onSubmit={handleRequestEmailCode} className="space-y-3">
                    <TextField
                      label={tr("E-mel Baharu", "New Email")}
                      value={newEmail}
                      onChange={setNewEmail}
                      placeholder="nama@email.com"
                      type="email"
                    />

                    <div className="space-y-1">
                      <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                        {tr("Kata Laluan Semasa", "Current Password")}
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={tr("Masukkan kata laluan", "Enter password")}
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={requestingEmailCode || !newEmail.trim() || !currentPassword}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 text-xs font-bold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-40"
                    >
                      {requestingEmailCode ? <Loader2 size={14} className="animate-spin" /> : <MailCheck size={14} />}
                      <span>{tr("Hantar Kod Verifikasi", "Send Code")}</span>
                    </button>
                  </form>

                  {emailStep === "code_sent" && (
                    <form onSubmit={handleConfirmEmailCode} className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                      <span className="text-[0.68rem] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        {tr("Kod Verifikasi 6-Digit", "6-Digit Code")}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="123456"
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2 text-center text-lg font-black tracking-[0.25em] text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
                      />
                      <button
                        type="submit"
                        disabled={confirmingEmail || verificationCode.trim().length !== 6}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40"
                      >
                        {confirmingEmail ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        <span>{tr("Sahkan E-mel", "Verify Email")}</span>
                      </button>
                    </form>
                  )}

                  {emailMessage && <SuccessBox>{emailMessage}</SuccessBox>}
                  {emailError && <ErrorBox>{emailError}</ErrorBox>}
                </div>
              )}

              {/* Danger Sheet */}
              {activeMobileSheet === "danger" && (
                <div className="space-y-3 pb-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDangerError("")
                        setDangerPassword("")
                        setConfirmText("")
                        setDangerAction("reset")
                      }}
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 text-xs font-bold text-[var(--text)]"
                    >
                      {tr("Reset Data", "Reset Data")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDangerError("")
                        setDangerPassword("")
                        setConfirmText("")
                        setDangerAction("delete")
                      }}
                      className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-xs font-bold text-rose-600 dark:text-rose-400"
                    >
                      {tr("Padam Akaun", "Delete Account")}
                    </button>
                  </div>

                  {dangerAction && (
                    <form onSubmit={handleDangerAction} className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                      <p className="text-[0.7rem] text-[var(--muted)]">
                        {dangerAction === "delete"
                          ? tr("Taip PADAM untuk padam akaun secara kekal.", "Type DELETE to delete account.")
                          : tr("Taip RESET untuk padam semua data.", "Type RESET to reset all data.")}
                      </p>
                      <input
                        type="password"
                        value={dangerPassword}
                        onChange={(e) => setDangerPassword(e.target.value)}
                        placeholder={tr("Kata laluan semasa", "Password")}
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text)] outline-none"
                      />
                      <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={activeConfirmWord}
                        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-bold uppercase text-[var(--text)] outline-none"
                      />
                      {dangerError && <ErrorBox>{dangerError}</ErrorBox>}
                      <button
                        type="submit"
                        disabled={
                          dangerBusy ||
                          (profile?.has_password && !dangerPassword) ||
                          confirmText.trim().toUpperCase() !== activeConfirmWord
                        }
                        className={cn(
                          "w-full py-2.5 rounded-xl text-xs font-bold text-white transition active:scale-[0.98] disabled:opacity-40",
                          dangerAction === "delete" ? "bg-rose-600" : "bg-[var(--text)] text-[var(--bg)]"
                        )}
                      >
                        {dangerBusy ? <Loader2 size={13} className="animate-spin inline mr-1" /> : null}
                        <span>{tr("Sahkan Tindakan", "Confirm Action")}</span>
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirmation Modal ─── */}
      {confirmOpen && stats && dangerAction && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-[var(--bg)]">
          <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-[var(--divider)]">
            <button
              type="button"
              disabled={dangerBusy}
              onClick={() => setConfirmOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-[var(--muted)] hover:bg-[var(--surface-tint)]"
            >
              ✕
            </button>
            <h2 className="text-sm font-extrabold text-[var(--text)]">
              {dangerAction === "delete" ? tr("Pengesahan Padam Akaun", "Delete Account Confirmation") : tr("Pengesahan Reset Akaun", "Reset Account Confirmation")}
            </h2>
            <div className="w-9" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto w-full max-w-md space-y-6">
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl",
                    dangerAction === "delete" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-[var(--surface-tint-strong)] text-[var(--text)]"
                  )}
                >
                  {dangerAction === "delete" ? <Trash2 size={26} /> : <RefreshCw size={26} />}
                </div>
                <h3 className="mt-4 text-lg font-black text-[var(--text)]">
                  {dangerAction === "delete"
                    ? tr("Padam Akaun & Data Kekal?", "Permanently Delete Account & Data?")
                    : tr("Reset & Kosongkan Semua Data?", "Reset & Clear All Data?")}
                </h3>
                <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">
                  {dangerAction === "delete"
                    ? tr(
                        "Tindakan ini tidak boleh dibatalkan. Akaun, login, dan semua rekod anda akan dipadam secara mutlak.",
                        "This action is permanent and cannot be undone. Your account and all records will be deleted completely."
                      )
                    : tr(
                        "Semua rekod transaksi, akaun dompet, dan bajet akan dikosongkan. Profil log masuk e-mel anda kekal.",
                        "All transaction history, wallets, and budgets will be emptied. Your account profile and email login will remain."
                      )}
                </p>
              </div>

              {/* Data Breakdown Cards */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
                <p className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Ringkasan Data Terjejas", "Summary of Data Affected")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Transaksi", "Transactions")}</p>
                    <p className="text-base font-black text-[var(--text)] mt-0.5">{stats.transaction_count.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Dompet / Wallet", "Wallets")}</p>
                    <p className="text-base font-black text-[var(--text)] mt-0.5">{stats.wallet_count.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Rekod Hutang", "Debts")}</p>
                    <p className="text-base font-black text-[var(--text)] mt-0.5">{stats.debt_count.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">{tr("Rekod Pinjaman", "Loans")}</p>
                    <p className="text-base font-black text-[var(--text)] mt-0.5">{stats.loan_count.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--divider)] bg-[var(--bg)] px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-md gap-3">
              <button
                type="button"
                disabled={dangerBusy}
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-xl border border-[var(--border)] py-3 text-xs font-bold text-[var(--muted)] hover:bg-[var(--surface-tint)] transition"
              >
                {tr("Batal", "Cancel")}
              </button>
              <button
                type="button"
                disabled={dangerBusy}
                onClick={confirmDangerAction}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white transition active:scale-[0.98] disabled:opacity-40",
                  dangerAction === "delete" ? "bg-rose-600 hover:bg-rose-500" : "bg-[var(--text)] text-[var(--bg)]"
                )}
              >
                {dangerBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>
                  {dangerAction === "delete" ? tr("Setuju Padam", "Agree & Delete") : tr("Setuju Reset", "Agree & Reset")}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

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

type TextFieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: "text" | "email"
}

function TextField({ label, value, onChange, placeholder, type = "text" }: TextFieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs md:text-sm text-[var(--text)] placeholder-[var(--input-placeholder)] outline-none transition focus:border-[var(--input-focus)] focus:ring-1 focus:ring-[var(--input-focus)]"
      />
    </label>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5">
      <AlertTriangle size={15} className="shrink-0 text-rose-500 mt-0.5" />
      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{children}</p>
    </div>
  )
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
      <CheckCircle2 size={15} className="shrink-0 text-emerald-500 mt-0.5" />
      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{children}</p>
    </div>
  )
}

function normalizePersonalityInput(value: string) {
  return value.replace(/\s+/g, " ").trim()
}


// /account now merged into /settings — redirect to keep old links working
export default function AccountRedirect() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const router = useRouter()
  return (
    <RedirectToSettings sessionId={sessionId} router={router} />
  )
}

function RedirectToSettings({ sessionId, router }: { sessionId: string; router: ReturnType<typeof useRouter> }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    router.replace(`/${sessionId}/settings`)
    setDone(true)
  }, [sessionId, router])
  return null
}
