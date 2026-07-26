"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  Hash,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  Lock,
  Unlock,
  Clock,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Smartphone,
  Wifi,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { DesktopPageBody, DesktopPageChip, DesktopPageHeader } from "@/components/layout/PageHeader"
import { usePageAlert } from "@/hooks/usePageAlert"

type PinStatus = {
  enabled: boolean
  failed_attempts: number
  locked_until?: string | null
}

export default function SecurityPage() {
  const params = useParams()
  const sessionId = params.sessionId as string || ""
  const { lang, t } = useLang()

  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null)
  const [pinStatusLoading, setPinStatusLoading] = useState(true)
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState("")
  const [pinSuccess, setPinSuccess] = useState("")
  const [currentPasswordForPin, setCurrentPasswordForPin] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const { showAlert, alertModal } = usePageAlert(lang)
  const [showOldPw, setShowOldPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => isBm ? bm : en

  async function fetchPinStatus() {
    const token = getAccessToken()
    setPinStatusLoading(true)
    try {
      const res = await fetch("/api/users/me/pin", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
      })
      if (!res.ok) return
      const data = (await res.json()) as PinStatus
      setPinStatus(data)
    } catch {
    } finally {
      setPinStatusLoading(false)
    }
  }

  useEffect(() => {
    void fetchPinStatus()
  }, [])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError(tr("Sila isi semua ruangan.", "Please fill all fields."))
      return
    }
    if (newPassword.length < 8) {
      setError(tr("Kata laluan baru minimum 8 aksara.", "New password must be at least 8 characters."))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(tr("Sahkan kata laluan tidak sepadan.", "Password confirmation does not match."))
      return
    }

    setLoading(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/password", {
        method: "PATCH",
        credentials: "include",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.detail || "Request failed")
      }
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setSuccess(tr("Kata laluan berjaya dikemaskini.", "Password updated successfully."))
      showAlert(
        tr("Berjaya Dikemaskini", "Updated"),
        tr("Kata laluan berjaya dikemaskini.", "Password updated successfully."),
        "success"
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : ""
      const finalMessage = message || tr("Gagal menukar kata laluan.", "Failed to change password.")
      setError(finalMessage)
      showAlert(tr("Kemaskini Gagal", "Update Failed"), finalMessage, "error")
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault()
    setPinError("")
    setPinSuccess("")
    if (!currentPasswordForPin || !pin || !confirmPin) {
      setPinError(tr("Sila isi semua ruangan PIN.", "Please fill in all PIN fields."))
      return
    }
    if (!/^\d{6}$/.test(pin)) {
      setPinError(tr("PIN mesti tepat 6 digit.", "PIN must be exactly 6 digits."))
      return
    }
    if (pin !== confirmPin) {
      setPinError(tr("Sahkan PIN tidak sepadan.", "PIN confirmation does not match."))
      return
    }
    setPinLoading(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/pin", {
        method: "PUT",
        credentials: "include",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ current_password: currentPasswordForPin, pin }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.detail || "Request failed")
      }
      setPin("")
      setConfirmPin("")
      setCurrentPasswordForPin("")
      setPinSuccess(tr("PIN berjaya disimpan.", "PIN saved successfully."))
      await fetchPinStatus()
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("pin-status-changed"))
      }
      showAlert(tr("Berjaya Disimpan", "Saved"), tr("PIN berjaya disimpan.", "PIN saved successfully."), "success")
    } catch (err) {
      const message = err instanceof Error ? err.message : ""
      const finalMessage = message || tr("Gagal simpan PIN.", "Failed to save PIN.")
      setPinError(finalMessage)
      showAlert(tr("Simpan Gagal", "Save Failed"), finalMessage, "error")
    } finally {
      setPinLoading(false)
    }
  }

  async function handleRemovePin() {
    setPinError("")
    setPinSuccess("")
    if (!currentPasswordForPin) {
      setPinError(tr("Masukkan kata laluan semasa untuk buang PIN.", "Enter your current password to remove PIN."))
      return
    }
    setPinLoading(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/pin", {
        credentials: "include",
        method: "DELETE",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ current_password: currentPasswordForPin }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.detail || "Request failed")
      }
      setPin("")
      setConfirmPin("")
      setCurrentPasswordForPin("")
      setPinSuccess(tr("PIN berjaya dibuang.", "PIN removed successfully."))
      await fetchPinStatus()
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(`pin_verified_${sessionId}`)
        window.dispatchEvent(new Event("pin-status-changed"))
      }
      showAlert(tr("Berjaya Dibuang", "Deleted"), tr("PIN berjaya dibuang.", "PIN removed successfully."), "success")
    } catch (err) {
      const message = err instanceof Error ? err.message : ""
      const finalMessage = message || tr("Gagal buang PIN.", "Failed to remove PIN.")
      setPinError(finalMessage)
      showAlert(tr("Buang Gagal", "Delete Failed"), finalMessage, "error")
    } finally {
      setPinLoading(false)
    }
  }

  const securityScore = [
    pinStatus?.enabled,
    true,
    !pinStatus?.locked_until,
  ].filter(Boolean).length

  const statusCards = [
    {
      key: "password",
      icon: <KeyRound size={18} />,
      label: tr("Kata Laluan", "Password"),
      value: tr("Ditetapkan", "Set"),
      tone: "green" as const,
      detail: tr("Aktif & selamat", "Active & secure"),
    },
    {
      key: "pin",
      icon: <Fingerprint size={18} />,
      label: "Login PIN",
      value: pinStatus?.enabled ? tr("Aktif", "Enabled") : tr("Belum Aktif", "Disabled"),
      tone: (pinStatus?.enabled ? "green" : "amber") as "green" | "amber" | "red",
      detail: pinStatus?.enabled ? "6-Digit" : tr("Tidak disetkan", "Not set"),
    },
    {
      key: "attempts",
      icon: <Smartphone size={18} />,
      label: tr("Percubaan Gagal", "Failed Attempts"),
      value: String(pinStatus?.failed_attempts || 0),
      tone: ((pinStatus?.failed_attempts || 0) > 0 ? "red" : "green") as "green" | "amber" | "red",
      detail: pinStatus?.locked_until ? tr("Dikunci", "Locked") : tr("Bersih", "Clear"),
    },
    {
      key: "session",
      icon: <Wifi size={18} />,
      label: tr("Sesi", "Session"),
      value: tr("Aktif", "Active"),
      tone: "green" as const,
      detail: tr("Peranti ini", "This device"),
    },
  ]

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">

      {/* ─── Mobile View ─── */}
      <div className="space-y-5 md:hidden">
        {/* Header */}
        <div className="px-1 pt-1">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 pt-4">
            <HistoryBackButton fallbackHref={`/${sessionId}/settings`} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--text)]">
              <ArrowLeft size={18} />
            </HistoryBackButton>
            <h1 className="text-center text-[1.2rem] font-extrabold tracking-tight text-[var(--text)]">
              {tr("Keselamatan", "Security")}
            </h1>
            <div className="h-10 w-10" aria-hidden="true" />
          </div>

          {/* Security Score Banner */}
          <div className={cn(
            "mt-4 rounded-2xl border p-4",
            securityScore >= 3
              ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-[var(--surface-tint)]"
              : securityScore >= 2
                ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10"
                : "border-red-500/30 bg-red-500/5 dark:bg-red-500/10"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                securityScore >= 3
                  ? "bg-emerald-500/20 text-[var(--text)]"
                  : securityScore >= 2
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    : "bg-red-500/20 text-red-600 dark:text-red-400"
              )}>
                {securityScore >= 3 ? <ShieldCheck size={24} /> : securityScore >= 2 ? <AlertTriangle size={24} /> : <Shield size={24} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-[var(--text)]">
                  {securityScore >= 3
                    ? tr("Akaun Selamat", "Account Secure")
                    : securityScore >= 2
                      ? tr("Keselamatan Sederhana", "Moderate Security")
                      : tr("Perlu Perhatian", "Needs Attention")}
                </h2>
                <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                  {securityScore >= 3
                    ? tr("Akaun anda dilindungi dengan baik.", "Your account is well protected.")
                    : securityScore >= 2
                      ? tr("Aktifkan PIN login untuk perlindungan tambahan.", "Enable login PIN for extra protection.")
                      : tr("Sila aktifkan ciri keselamatan yang tersedia.", "Please enable available security features.")}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  {[1, 2, 3].map((level) => (
                    <div key={level} className={cn(
                      "h-1.5 w-10 rounded-full",
                      securityScore >= level
                        ? level === 3 ? "bg-emerald-500" : level === 2 ? "bg-[var(--text)]" : "bg-amber-400"
                        : "bg-[var(--border)]"
                    )} />
                  ))}
                  <span className="ml-1 text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">
                    {securityScore}/3
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Cards */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Status Keselamatan", "Security Status")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {statusCards.map((card) => (
              <div key={card.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mb-2",
                  card.tone === "green" ? "bg-[var(--surface-tint)] text-[var(--text)]" :
                  card.tone === "amber" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                  "bg-red-500/10 text-red-600 dark:text-red-400"
                )}>
                  {card.icon}
                </div>
                <p className="text-[0.625rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{card.label}</p>
                <p className="mt-1 text-sm font-black text-[var(--text)] truncate">{card.value}</p>
                <p className="mt-0.5 text-[0.6rem] font-medium text-[var(--muted)] truncate">{card.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Password Form */}
        <section className="px-1">
          <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Tukar Kata Laluan", "Change Password")}</p>
          <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
                  <Lock size={15} />
                </div>
                <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">{tr("Minimum 8 aksara", "Minimum 8 characters")}</p>
              </div>
              <PasswordField
                label={tr("Kata Laluan Semasa", "Current Password")}
                value={oldPassword}
                onChange={setOldPassword}
                show={showOldPw}
                onToggle={() => setShowOldPw(v => !v)}
              />
              <PasswordField
                label={tr("Kata Laluan Baru", "New Password")}
                value={newPassword}
                onChange={setNewPassword}
                show={showNewPw}
                onToggle={() => setShowNewPw(v => !v)}
                hint={newPassword.length > 0 && newPassword.length < 8 ? tr("Terlalu pendek", "Too short") : newPassword.length >= 8 ? tr("Panjang mencukupi", "Good length") : ""}
                hintOk={newPassword.length >= 8}
              />
              <PasswordField
                label={tr("Sahkan Kata Laluan Baru", "Confirm New Password")}
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirmPw}
                onToggle={() => setShowConfirmPw(v => !v)}
                hint={confirmPassword.length > 0 ? (newPassword === confirmPassword ? tr("Sepadan", "Match") : tr("Tidak sepadan", "Mismatch")) : ""}
                hintOk={confirmPassword.length > 0 && newPassword === confirmPassword}
              />
              {error && <ErrorBox>{error}</ErrorBox>}
              {success && <SuccessBox>{success}</SuccessBox>}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {tr("Kemaskini Kata Laluan", "Update Password")}
              </button>
            </form>
          </div>
        </section>

        {/* PIN Form */}
        <section className="px-1">
          <div className="flex items-center justify-between px-1">
            <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">6-Digit PIN</p>
            {!pinStatusLoading && (
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-[0.575rem] font-black uppercase tracking-wider",
                pinStatus?.enabled
                  ? "bg-emerald-500/15 text-[var(--text)]"
                  : "bg-[var(--surface-tint)] text-[var(--muted)]"
              )}>
                {pinStatus?.enabled ? tr("Aktif", "On") : tr("Tidak Aktif", "Off")}
              </span>
            )}
          </div>
          <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            {pinStatus?.locked_until && (
              <div className="mb-4 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                <Unlock size={15} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-[0.65rem] font-bold text-red-600 dark:text-red-400">
                  {tr(
                    `PIN dikunci sehingga ${new Date(pinStatus.locked_until).toLocaleString()}.`,
                    `PIN locked until ${new Date(pinStatus.locked_until).toLocaleString()}.`
                  )}
                </p>
              </div>
            )}
            <div className="mb-4 flex gap-3 rounded-xl bg-[var(--surface-tint)]/30 p-3">
              <Clock size={15} className="mt-0.5 shrink-0 text-[var(--muted)]" />
              <p className="text-[0.65rem] font-medium leading-relaxed text-[var(--muted)]">
                {tr(
                  "PIN digunakan untuk akses pantas di mobile. Anda masih perlukan kata laluan utama untuk tetapan ini.",
                  "PIN is for quick mobile access. Your main password is still required to modify these settings."
                )}
              </p>
            </div>
            <form onSubmit={handleSavePin} className="space-y-4">
              <PasswordField
                label={tr("Kata Laluan Semasa", "Current Password")}
                value={currentPasswordForPin}
                onChange={setCurrentPasswordForPin}
                show={false}
                onToggle={() => {}}
                noToggle
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {tr("PIN Baru", "New PIN")}
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-bold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none focus:border-[var(--text)]/25 tracking-[0.3em]"
                  />
                </div>
                <div>
                  <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {tr("Sahkan PIN", "Confirm PIN")}
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-bold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none focus:border-[var(--text)]/25 tracking-[0.3em]"
                  />
                </div>
              </div>
              {pinError && <ErrorBox>{pinError}</ErrorBox>}
              {pinSuccess && <SuccessBox>{pinSuccess}</SuccessBox>}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="submit"
                  disabled={pinLoading}
                  className="flex flex-1 items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {pinLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {tr("Simpan PIN", "Save PIN")}
                </button>
                <button
                  type="button"
                  onClick={handleRemovePin}
                  disabled={pinLoading || !pinStatus?.enabled}
                  className="flex flex-1 items-center justify-center gap-2 py-3.5 rounded-2xl border border-[var(--border)] text-[var(--text)] font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  {pinLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {tr("Padam PIN", "Delete PIN")}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Footer */}
        <div className="px-1 pt-2 text-center">
          <p className="text-[0.625rem] font-black uppercase tracking-[0.3em] text-[var(--muted)]">
            MyPeribadi
          </p>
        </div>
      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Keselamatan", "Security")}
          actions={
            <DesktopPageChip
              className={cn(
                securityScore >= 3
                  ? "border-emerald-500/30 text-[var(--text)]"
                  : securityScore >= 2
                    ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                    : "border-red-500/30 text-red-600 dark:text-red-400",
              )}
            >
              {tr("Skor", "Score")} {securityScore}/3
            </DesktopPageChip>
          }
        />
        <DesktopPageBody className="space-y-6">
        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 text-[var(--accent)]">
                  <ShieldCheck size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.26em] text-[var(--muted)]">{tr("Keselamatan & Privasi", "Security & Privacy")}</p>
                  <h1 className="mt-2 truncate text-xl font-black tracking-tight text-[var(--text)] md:text-2xl">
                    {tr("Urus Keselamatan", "Manage Security")}
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                    {tr("Urus kata laluan, PIN login, dan keselamatan akaun anda", "Manage password, login PIN, and account security")}
                  </p>
                </div>
              </div>

              {/* Score */}
              <div className={cn(
                "shrink-0 rounded-[16px] border p-5 min-w-[220px]",
                securityScore >= 3
                  ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-[var(--surface-tint)]"
                  : securityScore >= 2
                    ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10"
                    : "border-red-500/30 bg-red-500/5 dark:bg-red-500/10"
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Skor Keselamatan", "Security Score")}</p>
                    <p className="mt-2 text-2xl font-black text-[var(--text)]">{securityScore}<span className="text-lg text-[var(--muted)]">/3</span></p>
                  </div>
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl",
                    securityScore >= 3
                      ? "bg-emerald-500/20 text-[var(--text)]"
                      : securityScore >= 2
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : "bg-red-500/20 text-red-600 dark:text-red-400"
                  )}>
                    {securityScore >= 3 ? <ShieldCheck size={24} /> : securityScore >= 2 ? <AlertTriangle size={24} /> : <Shield size={24} />}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  {[1, 2, 3].map((level) => (
                    <div key={level} className={cn(
                      "h-1.5 w-full rounded-full",
                      securityScore >= level
                        ? level === 3 ? "bg-emerald-500" : level === 2 ? "bg-[var(--text)]" : "bg-amber-400"
                        : "bg-[var(--border)]"
                    )} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statusCards.map((card) => (
            <div key={card.key} className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                card.tone === "green" ? "bg-[var(--surface-tint)] text-[var(--text)]" :
                card.tone === "amber" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                "bg-red-500/10 text-red-600 dark:text-red-400"
              )}>
                {card.icon}
              </div>
              <p className="mt-3 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{card.label}</p>
              <p className="mt-2 text-lg font-black text-[var(--text)]">{card.value}</p>
              <p className="mt-1 text-xs font-medium text-[var(--muted)]">{card.detail}</p>
            </div>
          ))}
        </div>

        {/* Forms Grid */}
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          {/* Password */}
          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
                <Lock size={20} />
              </div>
              <div>
                <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">{tr("Tukar Kata Laluan", "Change Password")}</p>
                <p className="text-sm font-semibold text-[var(--muted)]">{tr("Minimum 8 aksara", "Minimum 8 characters")}</p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <PasswordField
                label={tr("Kata Laluan Semasa", "Current Password")}
                value={oldPassword}
                onChange={setOldPassword}
                show={showOldPw}
                onToggle={() => setShowOldPw(v => !v)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <PasswordField
                  label={tr("Kata Laluan Baru", "New Password")}
                  value={newPassword}
                  onChange={setNewPassword}
                  show={showNewPw}
                  onToggle={() => setShowNewPw(v => !v)}
                  hint={newPassword.length > 0 && newPassword.length < 8 ? tr("Terlalu pendek", "Too short") : newPassword.length >= 8 ? tr("Panjang mencukupi", "Good length") : ""}
                  hintOk={newPassword.length >= 8}
                />
                <PasswordField
                  label={tr("Sahkan Kata Laluan Baru", "Confirm New Password")}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  show={showConfirmPw}
                  onToggle={() => setShowConfirmPw(v => !v)}
                  hint={confirmPassword.length > 0 ? (newPassword === confirmPassword ? tr("Sepadan", "Match") : tr("Tidak sepadan", "Mismatch")) : ""}
                  hintOk={confirmPassword.length > 0 && newPassword === confirmPassword}
                />
              </div>
              {error && <ErrorBox>{error}</ErrorBox>}
              {success && <SuccessBox>{success}</SuccessBox>}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {tr("Kemaskini Kata Laluan", "Update Password")}
              </button>
            </form>
          </div>

          {/* PIN */}
          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
                  <Hash size={20} />
                </div>
                <div>
                  <p className="text-[0.625rem] font-black uppercase tracking-[0.24em] text-[var(--muted)]">6-Digit PIN</p>
                  <p className="text-sm font-semibold text-[var(--muted)]">{tr("Login Pantas Mobile", "Quick Mobile Login")}</p>
                </div>
              </div>
              {!pinStatusLoading && (
                <span className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[0.625rem] font-black uppercase tracking-wider",
                  pinStatus?.enabled
                    ? "bg-emerald-500/15 text-[var(--text)]"
                    : "bg-[var(--surface-tint)] text-[var(--muted)]"
                )}>
                  {pinStatus?.enabled ? tr("Aktif", "On") : tr("Tidak Aktif", "Off")}
                </span>
              )}
            </div>

            {pinStatus?.locked_until && (
              <div className="mb-4 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3">
                <Unlock size={16} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-[0.6875rem] font-bold text-red-600 dark:text-red-400">
                  {tr(
                    `PIN dikunci sehingga ${new Date(pinStatus.locked_until).toLocaleString()}.`,
                    `PIN locked until ${new Date(pinStatus.locked_until).toLocaleString()}.`
                  )}
                </p>
              </div>
            )}
            <div className="mb-5 flex gap-3 rounded-2xl bg-[var(--surface-tint)]/30 p-3.5">
              <Clock size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" />
              <p className="text-[0.7rem] font-medium leading-relaxed text-[var(--muted)]">
                {tr(
                  "PIN digunakan untuk akses pantas di mobile. Anda masih perlukan kata laluan utama untuk tetapan ini.",
                  "PIN is for quick mobile access. Your main password is still required to modify these settings."
                )}
              </p>
            </div>
            <form onSubmit={handleSavePin} className="space-y-4">
              <PasswordField
                label={tr("Kata Laluan Semasa", "Current Password")}
                value={currentPasswordForPin}
                onChange={setCurrentPasswordForPin}
                show={false}
                onToggle={() => {}}
                noToggle
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {tr("PIN Baru", "New PIN")}
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-bold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none focus:border-[var(--text)]/25 tracking-[0.3em]"
                  />
                </div>
                <div>
                  <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {tr("Sahkan PIN", "Confirm PIN")}
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 text-sm font-bold text-[var(--text)] placeholder:text-[var(--muted)]/40 outline-none focus:border-[var(--text)]/25 tracking-[0.3em]"
                  />
                </div>
              </div>
              {pinError && <ErrorBox>{pinError}</ErrorBox>}
              {pinSuccess && <SuccessBox>{pinSuccess}</SuccessBox>}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="submit"
                  disabled={pinLoading}
                  className="flex flex-1 items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--text)] text-[var(--bg)] font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                >
                  {pinLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {tr("Simpan PIN", "Save PIN")}
                </button>
                <button
                  type="button"
                  onClick={handleRemovePin}
                  disabled={pinLoading || !pinStatus?.enabled}
                  className="flex flex-1 items-center justify-center gap-2 py-3.5 rounded-2xl border border-[var(--border)] text-[var(--text)] font-bold text-sm transition-all hover:bg-[var(--surface-tint)] active:scale-[0.98] disabled:opacity-40"
                >
                  {pinLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {tr("Padam PIN", "Delete PIN")}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-center shadow-sm">
          <p className="text-[0.625rem] font-black uppercase tracking-[0.3em] text-[var(--muted)]">
            MyPeribadi
          </p>
        </div>
        </DesktopPageBody>
      </div>

      {alertModal}
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  hint,
  hintOk,
  noToggle,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  hint?: string
  hintOk?: boolean
  noToggle?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <div className="relative mt-1.5">
        <input
          type={noToggle ? "password" : (show ? "text" : "password")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/50 px-4 py-3 pr-12 text-sm font-semibold text-[var(--text)] outline-none transition-all focus:border-[var(--text)]/25 focus:bg-[var(--surface-tint-strong)]"
        />
        {!noToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && (
        <p className={cn(
          "mt-1 text-[0.625rem] font-bold",
          hintOk ? "text-emerald-500" : "text-red-400"
        )}>{hint}</p>
      )}
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
