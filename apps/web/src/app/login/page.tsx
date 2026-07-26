"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Loader2, Mail } from "lucide-react"
import { isLang, useLang } from "@/lib/lang"
import ThemeToggle from "@/components/theme/ThemeToggle"
import Turnstile from "@/components/auth/Turnstile"
import { useTheme } from "@/components/theme/ThemeProvider"
import { isThemeMode } from "@/lib/theme"
import styles from "../auth-page.module.css"
import {
  ensureSessionId,
  getAccessToken,
  getRefreshToken,
  getSessionId,
  setAuthTokens,
  getLoginRedirectPath,
} from "@/lib/auth-session"
import { initFirstAccount, initActiveAccount } from "@/lib/multi-account"
import { PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY, PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY, SHARED_TRANSACTION_TOKEN_QUERY_KEY, getActiveSharedTransactionTokenStorageKey, getSharedTransactionPinBypassStorageKey } from "@/lib/share-target"
import { signInWithGoogle } from "@/lib/firebase"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY

export default function LoginPage() {
  const router = useRouter()
  const { t, lang, setLang } = useLang()
  const { resolvedTheme, setTheme } = useTheme()
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [showTurnstile, setShowTurnstile] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    return () => {
      document.documentElement.style.overflow = ""
      document.body.style.overflow = ""
    }
  }, [])

  useEffect(() => {
    const token = getAccessToken()
    const refreshToken = getRefreshToken()
    if (!token && !refreshToken) return

    const session = ensureSessionId()
    if (session) {
      const pendingShareToken = localStorage.getItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY)
        || localStorage.getItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
      if (pendingShareToken) {
        window.sessionStorage.setItem(`pin_verified_${session}`, "true")
        window.sessionStorage.setItem(getSharedTransactionPinBypassStorageKey(session), "true")
        window.sessionStorage.setItem(getActiveSharedTransactionTokenStorageKey(session), pendingShareToken)
        localStorage.removeItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY)
        localStorage.removeItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
        router.replace(getLoginRedirectPath(session))
        return
      }
      router.replace(getLoginRedirectPath(session))
    }
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!email || !password) {
      setError(t.fillEmailPass)
      return
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError(lang === "BM" ? "Sila lengkapkan pengesahan keselamatan." : "Please complete the security check.")
      return
    }

    setLoading(true)
    try {
      const sessionId = ensureSessionId()
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstile_token: turnstileToken, session_id: sessionId }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.access_token) {
          setAuthTokens(data.access_token, data.refresh_token)
          initFirstAccount(email, email.split("@")[0], data.access_token, data.refresh_token ?? null, sessionId!)
          if (isThemeMode(data.theme_mode)) {
            setTheme(data.theme_mode)
          }
          if (isLang(data.language)) {
            setLang(data.language)
          }
          ensureSessionId()
        }
        setSuccess(true)
        setTimeout(() => {
          const session = getSessionId()
          const pendingShareToken = localStorage.getItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY)
            || localStorage.getItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
          if (session && pendingShareToken) {
            window.sessionStorage.setItem(`pin_verified_${session}`, "true")
            window.sessionStorage.setItem(getSharedTransactionPinBypassStorageKey(session), "true")
            window.sessionStorage.setItem(getActiveSharedTransactionTokenStorageKey(session), pendingShareToken)
            localStorage.removeItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY)
            localStorage.removeItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
            router.push(getLoginRedirectPath(session))
            return
          }
          router.push(getLoginRedirectPath(session!))
        }, 1000)
      } else {
        const err = await res.json()
        setError(err.detail || t.loginFailed)
      }
    } catch {
      setError(t.serverError)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError("")
    setGoogleLoading(true)
    try {
      const idToken = await signInWithGoogle()
      const sessionId = ensureSessionId()
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken, session_id: sessionId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.access_token) {
          setAuthTokens(data.access_token, data.refresh_token)
          const email = (() => { try { const p = JSON.parse(atob(data.access_token.split('.')[1])); return p.sub || "" } catch { return "" } })()
          initFirstAccount(email, email.split("@")[0], data.access_token, data.refresh_token ?? null, sessionId!)
          if (isThemeMode(data.theme_mode)) setTheme(data.theme_mode)
          if (isLang(data.language)) setLang(data.language)
          ensureSessionId()
        }
        setSuccess(true)
        setTimeout(() => {
          const session = getSessionId()
          if (session) router.push(getLoginRedirectPath(session))
        }, 500)
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.detail || (lang === "BM" ? "Google log masuk gagal." : "Google sign in failed."))
      }
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") return
      if (err?.code === "auth/cancelled-popup-request") return
      setError(err?.code || err?.message || (lang === "BM" ? "Ralat Google." : "Google error."))
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className={`${styles.screen} fixed inset-0 flex flex-col justify-center overflow-hidden px-6 bg-[var(--auth-bg)] text-[var(--auth-text)] font-sans selection:bg-[var(--auth-tint)]`}>
      {/* Subtle top controls */}
      <div className="flex justify-end gap-4 opacity-[var(--auth-control-opacity)] hover:opacity-[var(--auth-control-opacity-hover)] transition-opacity absolute top-6 right-6 z-50">
        <ThemeToggle compact className="bg-transparent border-none p-0" />
        <button onClick={() => setLang(lang === "EN" ? "BM" : "EN")} className="text-[0.625rem] font-black uppercase tracking-widest px-2 py-1 rounded-md border border-[var(--auth-control-border)] text-[var(--auth-control-text)]">
          {lang}
        </button>
      </div>

      <div className="w-full max-w-sm mx-auto max-h-full overflow-hidden">
        <h1 className="text-5xl font-black tracking-tight mb-12">
          {lang === "BM" ? "Log masuk" : "Sign in"}
        </h1>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-500 font-bold mb-4 animate-in fade-in slide-in-from-top-2">
            {error}
          </div>
        )}

        {showLoginForm ? (
          <>
            <button
              type="button"
              onClick={() => { setShowLoginForm(false); setError("") }}
              className="flex items-center gap-2 text-[var(--auth-muted)] text-sm font-bold hover:text-[var(--auth-text)] transition-colors mb-6"
            >
              <ArrowLeft size={16} strokeWidth={2.5} />
              {lang === "BM" ? "Kembali" : "Back"}
            </button>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`${styles.input} w-full bg-[var(--auth-card)] border-none rounded-2xl p-4 md:p-5 text-lg font-medium focus:ring-1 focus:ring-[var(--auth-border-strong)] transition-all outline-none`}
                />
              </div>

              <div className="relative group">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder={lang === "BM" ? "Kata laluan" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${styles.input} w-full bg-[var(--auth-card)] border-none rounded-2xl p-4 md:p-5 text-lg font-medium focus:ring-1 focus:ring-[var(--auth-border-strong)] transition-all outline-none pr-14`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-[var(--auth-muted)] hover:text-[var(--auth-text)] transition-colors"
                >
                  {showPassword ? <EyeOff size={22} strokeWidth={2} /> : <Eye size={22} strokeWidth={2} />}
                </button>
              </div>

              <div className="flex justify-end -mb-1">
                <Link
                  href="/forgot-password"
                  className="text-[var(--auth-muted)] text-xs font-bold hover:text-[var(--auth-text)] transition-colors"
                >
                  {lang === "BM" ? "Lupa kata laluan?" : "Forgot password?"}
                </Link>
              </div>

              {showTurnstile && TURNSTILE_SITE_KEY ? (
                <div className="pt-1 pb-1">
                  <Turnstile 
                    sitekey={TURNSTILE_SITE_KEY} 
                    onVerify={setTurnstileToken} 
                    theme={resolvedTheme}
                  />
                </div>
              ) : null}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || success}
                  className="w-full py-4 bg-[var(--auth-button-bg)] text-[var(--auth-button-text)] rounded-full font-bold text-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : (lang === "BM" ? "Log masuk" : "Sign in")}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading || success}
              className="w-full py-4 bg-white text-gray-800 rounded-full font-bold text-lg hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-sm border border-gray-200"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  {lang === "BM" ? "Sedang log masuk..." : "Signing in..."}
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  {lang === "BM" ? "Log masuk dengan Google" : "Sign in with Google"}
                </>
              )}
            </button>

            <Link 
              href="/register" 
              className="block w-full py-4 mt-4 bg-[var(--auth-secondary-button-bg)] text-[var(--auth-secondary-button-text)] rounded-full font-bold text-lg text-center hover:bg-[var(--auth-secondary-button-hover)] active:scale-[0.98] transition-all"
            >
              {lang === "BM" ? "Daftar akaun" : "Create account"}
            </Link>

            <button
              type="button"
              onClick={() => setShowLoginForm(true)}
              className="w-full py-4 mt-4 bg-transparent text-[var(--auth-muted)] rounded-full font-bold text-base hover:text-[var(--auth-text)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Mail size={18} strokeWidth={2} />
              {lang === "BM" ? "Log masuk dengan emel" : "Sign in with email"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
