"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
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
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken, setAuthTokens } from "@/lib/auth-session"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal"

type Profile = {
  id: string
  name: string
  email: string
  bot_personality: string
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

  return (
    <div className="flex flex-col gap-5 pb-20 md:gap-0 md:pb-0">
      {/* ─── Mobile Header ─── */}
      <div className="md:hidden">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 pt-4">
          <HistoryBackButton
            fallbackHref={`/${sessionId}/settings`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--text)] active:scale-95 transition-all"
          >
            <ArrowLeft size={18} />
          </HistoryBackButton>
          <h1 className="text-center text-[1.2rem] font-extrabold tracking-tight text-[var(--text)]">
            {tr("Akaun Saya", "My Account")}
          </h1>
          <div className="h-10 w-10" aria-hidden="true" />
        </div>
      </div>

      <DesktopPageHeader className="hidden md:block" title={tr("Akaun Saya", "My Account")} />

      <DesktopPageBody className="flex flex-col gap-5 md:gap-7">
      {/* ─── Profile Hero Card ─── */}
      <div>
        <div className="relative overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-[var(--accent)]/5 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
            <Link
              href={`/${sessionId}/badges`}
              className="shrink-0 active:scale-95 transition-transform"
              aria-label={tr("Buka info badge", "Open badge details")}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-[var(--surface-tint)] text-[var(--text)] ring-1 ring-cyan-500/20">
                <Sparkles size={28} />
              </div>
            </Link>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black tracking-tight text-[var(--text)] truncate">
                {profile?.name || tr("Pengguna Budget", "Budget User")}
              </h2>
              <div className="mt-1 flex items-center gap-2">
                <AtSign size={13} className="shrink-0 text-[var(--muted)]" />
                <p className="text-xs font-semibold text-[var(--muted)] truncate">{profile?.email || "-"}</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[0.625rem] font-black uppercase tracking-wider text-[var(--muted)]">
                  <Sparkles size={10} />
                  {tr("Bot Aktif", "Bot Active")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bot Personality Preview ─── */}
      <div>
        <div className="relative overflow-hidden rounded-[16px] border border-[var(--border)] bg-gradient-to-br from-[var(--card)] via-[var(--card)] to-[var(--surface-tint)] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Sparkles size={14} />
            </div>
            <span className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">
              {tr("Gaya Komunikasi Bot", "Bot Communication Style")}
            </span>
          </div>
          <p className="text-sm font-semibold text-[var(--text)] leading-relaxed italic">
            &ldquo;{personalityPreview}&rdquo;
          </p>
        </div>
      </div>

      {/* ─── Edit Profile Form ─── */}
      <section className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
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
      <section className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
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
      </DesktopPageBody>

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
