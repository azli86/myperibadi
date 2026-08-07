"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  AtSign,
  CheckCircle2,
  ChevronDown,
  Fingerprint,
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
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken, setAuthTokens, logoutAuthSession } from "@/lib/auth-session"
import { MobilePageHeader, DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal"

type Profile = {
  id: string
  name: string
  email: string
  bot_personality: string
  has_password?: boolean
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
}

export default function AccountPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang, t } = useLang()

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
  const { showAlert, alertModal } = usePageAlert(lang)
  const router = useRouter()

  const [dangerAction, setDangerAction] = useState<"reset" | "delete" | null>(null)
  const [dangerPassword, setDangerPassword] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [dangerBusy, setDangerBusy] = useState(false)
  const [dangerError, setDangerError] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stats, setStats] = useState<{
    transaction_count: number
    wallet_count: number
    debt_count: number
    loan_count: number
    subscription_count: number
  } | null>(null)

  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => isBm ? bm : en

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

  const personalityPreview = useMemo(() => {
    const custom = normalizePersonalityInput(botPersonality)
    if (custom) return custom
    return tr(
      "Mesra, jelas, dan fokus pada langkah bajet yang praktikal.",
      "Friendly, clear, and focused on practical budgeting steps."
    )
  }, [botPersonality, isBm])

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
  return (
    <div className="flex flex-col gap-5 pb-20 md:gap-0 md:pb-0">
      {/* ─── Mobile Header ─── */}
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Akaun Saya", "My Account")}
          fallbackHref={`/${sessionId}/settings`}
          backPreferHistory
        />
      </div>

      <DesktopPageHeader
        title={tr("Akaun Saya", "My Account")}
        breadcrumbs={[{ label: tr("Tetapan", "Settings"), href: `/${sessionId}/settings` }]}
        homeHref={`/${sessionId}`}
        showBack={false}
        className="hidden md:block"
      />

      <DesktopPageBody className="flex flex-col gap-5 md:gap-7">
      {/* ─── Edit Profile Form ─── */}
      <section className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] bg-[var(--surface-tint)]/30 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--text)] text-[var(--bg)]">
              <PencilLine size={22} />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-[var(--text)]">
                {tr("Edit Profil", "Edit Profile")}
              </h3>
              <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                {tr("Nama & personaliti bot", "Name & bot personality")}
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <form onSubmit={handleSave} className="space-y-5">
            <TextField
              label={t.fullName}
              value={name}
              onChange={setName}
              placeholder={tr("Nama anda", "Your name")}
            />

            <div className="space-y-2.5">
              <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                {tr("Bot Personality", "Bot Personality")}
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPersonalityOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-left text-sm font-bold text-[var(--text)] outline-none transition-all active:scale-[0.99]"
                  aria-expanded={personalityOpen}
                >
                  <span className="truncate">
                    {personalityPresets.includes(normalizePersonalityInput(botPersonality))
                      ? normalizePersonalityInput(botPersonality)
                      : tr("Pilih personaliti bot", "Choose bot personality")}
                  </span>
                  <ChevronDown
                    size={17}
                    className={cn("shrink-0 text-[var(--muted)] transition-transform", personalityOpen && "rotate-180")}
                  />
                </button>
                {personalityOpen ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
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
                            "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold transition active:scale-[0.99]",
                            active
                              ? "bg-[var(--text)] text-[var(--bg)]"
                              : "bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface-tint)]"
                          )}
                        >
                          <span>{preset}</span>
                          {active ? <CheckCircle2 size={16} className="shrink-0" /> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              <p className="text-[0.7rem] font-medium leading-relaxed text-[var(--muted)]">
                {tr(
                  "Pilih nada komunikasi bot. Logic, command, dan flow sistem bajet kekal sama.",
                  "Choose the bot communication tone. Budget logic, commands, and system flow stay the same."
                )}
              </p>
            </div>

            {message && <SuccessBox>{message}</SuccessBox>}
            {error && <ErrorBox>{error}</ErrorBox>}

            <button
              type="submit"
              disabled={saving || !hasChanges}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {tr("Simpan Perubahan", "Save Changes")}
            </button>
          </form>
        </div>
      </section>

      {/* ─── Change Email ─── */}
      <section className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] bg-[var(--surface-tint)]/30 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--text)] text-[var(--bg)]">
              <MailCheck size={22} />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-[var(--text)]">
                {tr("Tukar E-mel", "Change Email")}
              </h3>
              <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                {profile?.email || "-"}
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="mb-5 flex gap-3 rounded-2xl bg-[var(--surface-tint)]/30 p-3.5">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <p className="text-[0.7rem] font-medium leading-relaxed text-[var(--muted)]">
              {tr(
                "Anda perlu sahkan e-mel baru melalui kod verifikasi. Proses ini memerlukan kata laluan semasa.",
                "You must verify your new email via a verification code. This process requires your current password."
              )}
            </p>
          </div>

          <form onSubmit={handleRequestEmailCode} className="space-y-4">
            <TextField
              label={tr("E-mel Baru", "New Email")}
              value={newEmail}
              onChange={setNewEmail}
              placeholder="name@email.com"
              type="email"
            />
            <div>
              <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                {tr("Kata Laluan Semasa", "Current Password")}
              </span>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={tr("Masukkan kata laluan", "Enter current password")}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 pr-12 text-sm font-semibold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none transition-all focus:border-[var(--text)]/25 focus:bg-[var(--surface-tint-strong)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={requestingEmailCode || !newEmail.trim() || !currentPassword}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-[var(--border)] font-bold text-sm transition-all hover:border-[var(--text)]/30 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {requestingEmailCode ? <Loader2 size={16} className="animate-spin" /> : <MailCheck size={16} />}
              {tr("Hantar Kod Verifikasi", "Send Verification Code")}
            </button>
          </form>

          {emailStep === "code_sent" && (
              <form
                onSubmit={handleConfirmEmailCode}
                className="mt-4 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/20 p-4"
              >
                <div>
                  <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {tr("Kod Verifikasi (6 digit)", "Verification Code (6 digits)")}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-lg font-black text-[var(--text)] placeholder:text-[var(--muted)]/30 outline-none transition-all focus:border-[var(--text)]/25 focus:bg-[var(--surface-tint-strong)] tracking-[0.2em] text-center"
                  />
                </div>
                <button
                  type="submit"
                  disabled={confirmingEmail || verificationCode.trim().length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                >
                  {confirmingEmail ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {tr("Sahkan E-mel Baru", "Verify New Email")}
                </button>
              </form>
            )}

          {emailMessage && <div className="mt-4"><SuccessBox>{emailMessage}</SuccessBox></div>}
          {emailError && <div className="mt-4"><ErrorBox>{emailError}</ErrorBox></div>}
        </div>
      </section>

      {/* ─── Danger Zone: Reset / Delete Account ─── */}
      <section className="overflow-hidden rounded-[1.5rem] border border-red-500/30 bg-[var(--card)] shadow-sm">
        <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-[var(--text)]">
                {tr("Zon Bahaya", "Danger Zone")}
              </h3>
              <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                {tr("Reset atau padam akaun", "Reset or delete account")}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setDangerError("")
                setDangerPassword("")
                setConfirmText("")
                setDangerAction("reset")
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border)] px-4 py-3.5 text-sm font-bold text-[var(--text)] transition-all hover:border-[var(--text)]/30 active:scale-[0.98]"
            >
              <RefreshCw size={16} />
              {tr("Reset Akaun", "Reset Account")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDangerError("")
                setDangerPassword("")
                setConfirmText("")
                setDangerAction("delete")
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-red-500/40 bg-red-500/10 px-4 py-3.5 text-sm font-bold text-red-600 dark:text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98]"
            >
              <Trash2 size={16} />
              {tr("Padam Akaun", "Delete Account")}
            </button>
          </div>

          {dangerAction && (
            <form
              onSubmit={handleDangerAction}
              className="space-y-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-4"
            >
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-[0.7rem] font-medium leading-relaxed text-[var(--muted)]">
                  {dangerAction === "delete"
                    ? tr(
                        "Tindakan ini MEMADAM AKAUN dan SEMUA data secara kekal. Anda tidak akan dapat log masuk semula. Taip PADAM untuk sahkan.",
                        "This will PERMANENTLY DELETE your account and ALL data. You will not be able to log in again. Type DELETE to confirm."
                      )
                    : tr(
                        "Tindakan ini mengosongkan SEMUA data (transaksi, wallet, bajet, hutang, loan, subskripsi, kenderaan, waranti, tempat). Akaun dan e-mel anda kekal. Taip RESET untuk sahkan.",
                        "This clears ALL data (transactions, wallets, budgets, debts, loans, subscriptions, vehicles, warranties, places). Your account and email remain. Type RESET to confirm."
                      )}
                </p>
              </div>

              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {tr("Kata Laluan Semasa", "Current Password")}
                </span>
                <input
                  type="password"
                  value={dangerPassword}
                  onChange={(e) => setDangerPassword(e.target.value)}
                  placeholder={tr("Masukkan kata laluan", "Enter current password")}
                  autoComplete="current-password"
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-semibold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none transition-all focus:border-[var(--text)]/25 focus:bg-[var(--surface-tint-strong)]"
                />
                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  {tr("Akaun Google tidak perlu kata laluan.", "Google sign-in accounts don't need a password.")}
                </p>
              </div>

              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {tr("Taip untuk sahkan", "Type to confirm")}
                </span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={activeConfirmWord}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-semibold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none transition-all focus:border-[var(--text)]/25 focus:bg-[var(--surface-tint-strong)]"
                />
              </div>

              {dangerError && <ErrorBox>{dangerError}</ErrorBox>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDangerAction(null)
                    setDangerPassword("")
                    setConfirmText("")
                    setConfirmOpen(false)
                  }}
                  className="flex-1 rounded-2xl border border-[var(--border)] py-3.5 text-sm font-bold text-[var(--muted)] transition hover:border-[var(--text)]/25"
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
                    "flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40",
                    dangerAction === "delete"
                      ? "bg-red-600 hover:bg-red-500"
                      : "bg-[var(--text)] text-[var(--bg)] hover:opacity-90"
                  )}
                >
                  {dangerBusy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : dangerAction === "delete" ? (
                    <Trash2 size={16} />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {dangerAction === "delete"
                    ? tr("Padam Akaun Kekal", "Delete Account Permanently")
                    : tr("Reset Semua Data", "Reset All Data")}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
      </DesktopPageBody>

      {confirmOpen && stats && dangerAction && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-[var(--surface)]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
            <button
              type="button"
              disabled={dangerBusy}
              onClick={() => setConfirmOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-[var(--muted)] transition hover:bg-[var(--surface-tint)]"
            >
              ✕
            </button>
            <h2 className="text-base font-bold text-[var(--text)]">
              {dangerAction === "delete"
                ? tr("Padam Akaun", "Delete Account")
                : tr("Reset Akaun", "Reset Account")}
            </h2>
            <div className="w-10" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6">
            <div className="mx-auto w-full max-w-md">
              {/* Icon + warning */}
              <div className="flex flex-col items-center pt-6 pb-6 text-center">
                <div className={`flex h-16 w-16 items-center justify-center rounded-3xl ${dangerAction === "delete" ? "bg-red-500/15 text-red-500" : "bg-[var(--text)]/10 text-[var(--text)]"}`}>
                  {dangerAction === "delete" ? <Trash2 size={30} /> : <RefreshCw size={30} />}
                </div>
                <h3 className="mt-4 text-xl font-extrabold text-[var(--text)]">
                  {dangerAction === "delete"
                    ? tr("Sahkan Padam Akaun", "Confirm Account Deletion")
                    : tr("Sahkan Reset Akaun", "Confirm Account Reset")}
                </h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--muted)]">
                  {dangerAction === "delete"
                    ? tr("Tindakan ini kekal dan tidak boleh dibatalkan. Akaun anda dan semua data akan dipadam selama-lamanya.", "This action is permanent and cannot be undone. Your account and all data will be deleted forever.")
                    : tr("Semua data akan dikosongkan. Akaun dan e-mel anda kekal.", "All data will be cleared. Your account and email remain.")}
                </p>
              </div>

              {/* Account summary card */}
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-5">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs font-semibold text-[var(--muted)]">{tr("Nama", "Name")}</span>
                  <span className="text-sm font-bold text-[var(--text)]">{profile?.name || "-"}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs font-semibold text-[var(--muted)]">{tr("E-mel", "Email")}</span>
                  <span className="text-sm font-bold text-[var(--text)]">{profile?.email || "-"}</span>
                </div>
                <div className="my-3 border-t border-dashed border-[var(--border)]" />
                <p className="pb-2 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {tr("Data yang akan dibuang", "Data to be removed")}
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl bg-[var(--surface-tint)]/60 px-4 py-3">
                    <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{tr("Transaksi", "Transactions")}</p>
                    <p className="text-xl font-extrabold text-[var(--text)]">{stats.transaction_count.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-tint)]/60 px-4 py-3">
                    <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{tr("Wallet", "Wallets")}</p>
                    <p className="text-xl font-extrabold text-[var(--text)]">{stats.wallet_count.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-tint)]/60 px-4 py-3">
                    <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{tr("Hutang", "Debts")}</p>
                    <p className="text-xl font-extrabold text-[var(--text)]">{stats.debt_count.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-tint)]/60 px-4 py-3">
                    <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{tr("Loan", "Loans")}</p>
                    <p className="text-xl font-extrabold text-[var(--text)]">{stats.loan_count.toLocaleString()}</p>
                  </div>
                  {stats.subscription_count > 0 && (
                    <div className="rounded-2xl bg-[var(--surface-tint)]/60 px-4 py-3">
                      <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{tr("Subskripsi", "Subscriptions")}</p>
                      <p className="text-xl font-extrabold text-[var(--text)]">{stats.subscription_count.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-md gap-2.5">
              <button
                type="button"
                disabled={dangerBusy}
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-[var(--border)] py-3.5 text-sm font-bold text-[var(--muted)] transition hover:border-[var(--text)]/25 disabled:opacity-40"
              >
                {tr("Batal", "Cancel")}
              </button>
              <button
                type="button"
                disabled={dangerBusy}
                onClick={confirmDangerAction}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40",
                  dangerAction === "delete" ? "bg-red-600 hover:bg-red-500" : "bg-[var(--text)] text-[var(--bg)] hover:opacity-90"
                )}
              >
                {dangerBusy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : dangerAction === "delete" ? (
                  <Trash2 size={16} />
                ) : (
                  <RefreshCw size={16} />
                )}
                {dangerAction === "delete"
                  ? tr("Setuju Padam", "Agree & Delete")
                  : tr("Setuju Reset", "Agree & Reset")}
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
    <label className="block">
      <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-semibold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none transition-all focus:border-[var(--text)]/25 focus:bg-[var(--surface-tint-strong)]"
      />
    </label>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
      <AlertTriangle size={16} className="shrink-0 text-red-500 mt-0.5" />
      <p className="text-sm font-semibold text-red-600 dark:text-red-400">{children}</p>
    </div>
  )
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-[var(--surface-tint)] px-4 py-3">
      <CheckCircle2 size={16} className="shrink-0 text-emerald-500 mt-0.5" />
      <p className="text-sm font-semibold text-[var(--text)]">{children}</p>
    </div>
  )
}

function normalizePersonalityInput(value: string) {
  return value.replace(/\s+/g, " ").trim()
}
