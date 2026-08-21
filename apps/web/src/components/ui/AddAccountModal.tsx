"use client"

import { useCallback, useState } from "react"
import { createPortal } from "react-dom"
import { X, Loader2 } from "lucide-react"
import { useLang } from "@/lib/lang"
import { addAccount } from "@/lib/multi-account"
import { signInWithGoogleProfile } from "@/lib/firebase"
import Turnstile from "@/components/auth/Turnstile"

type AddAccountModalProps = {
  open: boolean
  onClose: () => void
  onAdded?: () => void
}

/**
 * Reusable "Add Account" login modal for multi-account switching.
 * Used by the Shell bottom-sheet menu AND the /account page so both entry
 * points share the exact same Google / email multi-account login UX.
 */
export function AddAccountModal({ open, onClose, onAdded }: AddAccountModalProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)

  const reset = useCallback(() => {
    setError("")
    setEmail("")
    setPassword("")
    setTurnstileToken(null)
    setCaptchaKey((k) => k + 1)
    setGoogleLoading(false)
    setLoading(false)
    setShowEmailForm(false)
    onClose()
  }, [onClose])

  const handleGoogleLogin = useCallback(async () => {
    setError("")
    setGoogleLoading(true)
    try {
      const profile = await signInWithGoogleProfile()
      const newSessionId =
        crypto.randomUUID?.() ||
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
        })
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: profile.idToken, session_id: newSessionId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.access_token) {
          let email = profile.email
          let name = profile.name
          try {
            const payload = JSON.parse(atob(data.access_token.split(".")[1] || ""))
            email = String(payload.sub || payload.email || email || "")
            name = String(payload.name || name || email.split("@")[0] || "User")
          } catch {
            /* keep firebase profile */
          }
          if (!email) {
            setError(isBm ? "Google akaun tiada email." : "Google account has no email.")
            return
          }
          addAccount(email, name || email.split("@")[0], data.access_token, data.refresh_token ?? null, newSessionId)
          reset()
          if (onAdded) onAdded()
          else window.location.reload()
          return
        }
        setError(isBm ? "Google log masuk gagal." : "Google sign in failed.")
      } else {
        const err = await res.json().catch(() => null)
        setError(typeof err?.detail === "string" ? err.detail : (isBm ? "Google log masuk gagal." : "Google sign in failed."))
      }
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") return
      if (err?.code === "auth/cancelled-popup-request") return
      setError(err?.code || err?.message || (isBm ? "Ralat Google." : "Google error."))
    } finally {
      setGoogleLoading(false)
    }
  }, [isBm, reset, onAdded])

  const handleEmailLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError("")
      if (!turnstileToken) {
        setError(isBm ? "Sila lengkapkan pengesahan keselamatan." : "Please complete the security check.")
        return
      }
      if (!email || !password) {
        setError(isBm ? "Sila isi email dan kata laluan." : "Please fill in email and password.")
        return
      }
      setLoading(true)
      try {
        const newSessionId = crypto.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16) })
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, turnstile_token: turnstileToken, session_id: newSessionId }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.access_token) {
            const nameFromEmail = email.split("@")[0]
            addAccount(email, nameFromEmail, data.access_token, data.refresh_token, newSessionId)
            reset()
            if (onAdded) onAdded()
            else window.location.reload()
          }
        } else {
          const err = await res.json().catch(() => null)
          setError(typeof err?.detail === "string" ? err.detail : (isBm ? "Log masuk gagal." : "Login failed."))
          setTurnstileToken(null)
          setCaptchaKey((k) => k + 1)
        }
      } catch {
        setError(isBm ? "Ralat pelayan." : "Server error.")
        setTurnstileToken(null)
        setCaptchaKey((k) => k + 1)
      } finally {
        setLoading(false)
      }
    },
    [isBm, turnstileToken, email, password, reset, onAdded]
  )

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) reset()
      }}
    >
      <div className="w-full max-w-[380px] overflow-visible rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight text-[var(--text)]">
            {isBm ? "Tambah Akaun" : "Add Account"}
          </h2>
          <button
            type="button"
            onClick={reset}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-tint)]"
          >
            <X size={18} className="text-[var(--muted)]" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13px] font-bold text-rose-500">
            {error}
          </div>
        )}

        {/* Primary: Google Firebase */}
        <button
          type="button"
          onClick={() => { void handleGoogleLogin() }}
          disabled={googleLoading || loading}
          className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white py-3.5 text-[15px] font-bold text-gray-800 shadow-sm transition-all hover:bg-gray-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {googleLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {isBm ? "Sedang log masuk..." : "Signing in..."}
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {isBm ? "Log masuk dengan Google" : "Sign in with Google"}
            </>
          )}
        </button>

        {!showEmailForm ? (
          <button
            type="button"
            onClick={() => {
              setError("")
              setShowEmailForm(true)
            }}
            disabled={googleLoading}
            className="mt-4 w-full text-center text-[0.8rem] font-semibold text-[var(--muted)] underline-offset-2 transition hover:text-[var(--text)] hover:underline disabled:opacity-50"
          >
            {isBm ? "Guna email & kata laluan" : "Use email & password"}
          </button>
        ) : (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">email</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-[15px] font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-all focus:ring-2 focus:ring-indigo-500/40"
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder={isBm ? "Kata laluan" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-[15px] font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-all focus:ring-2 focus:ring-indigo-500/40"
              />

              <div className="flex w-full flex-col items-center gap-2 py-1">
                {process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ? (
                  <Turnstile
                    key={`add-account-captcha-${captchaKey}`}
                    sitekey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY}
                    theme="auto"
                    onVerify={(t) => setTurnstileToken(t)}
                    onError={() => setTurnstileToken(null)}
                    className="flex min-h-[70px] w-full max-w-full items-center justify-center overflow-visible"
                  />
                ) : (
                  <p className="text-center text-[0.75rem] font-semibold text-rose-500">
                    {isBm ? "Captcha tidak dikonfigurasi." : "Captcha is not configured."}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTurnstileToken(null)
                    setCaptchaKey((k) => k + 1)
                  }}
                  className="text-[0.7rem] font-semibold text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                >
                  {isBm ? "Muat semula captcha" : "Reload captcha"}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || googleLoading || !turnstileToken}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  isBm ? "Log masuk email" : "Sign in with email"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false)
                  setError("")
                  setEmail("")
                  setPassword("")
                  setTurnstileToken(null)
                  setCaptchaKey((k) => k + 1)
                }}
                className="w-full text-center text-[0.75rem] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                {isBm ? "Sembunyi login email" : "Hide email login"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
