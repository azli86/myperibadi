"use client"

import React, { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Globe, Loader2, Lock, Mail, MessageCircle, Send } from "lucide-react"
import { isLang, useLang } from "@/lib/lang"
import ThemeToggle from "@/components/theme/ThemeToggle"
import Turnstile from "@/components/auth/Turnstile"
import { useTheme } from "@/components/theme/ThemeProvider"
import { isThemeMode } from "@/lib/theme"
import styles from "./login-page.module.css"
import {
  ensureSessionId,
  getAccessToken,
  getRefreshToken,
  getSessionId,
  setAuthTokens,
  setEmailVerified,
  getLoginRedirectPath,
} from "@/lib/auth-session"
import { initFirstAccount, initActiveAccount } from "@/lib/multi-account"
import { PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY, PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY, SHARED_CHAT_TOKEN_QUERY_KEY, getActiveSharedTransactionTokenStorageKey, getSharedTransactionPinBypassStorageKey } from "@/lib/share-target"
import { signInWithGoogle, signInWithGoogleCredential } from "@/lib/firebase"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY

/**
 * Ask the Android WebView wrapper (AndroidApp bridge) to run the native Google
 * account picker (Credential Manager). Resolves with the Google ID token, or
 * with the sentinel "cancel" when the user dismisses the picker, or null when
 * the native bridge is unavailable (plain browser / PWA).
 */
function getNativeGoogleToken(): Promise<string | null> {
  const a = (window as unknown as { AndroidApp?: { nativeGoogleSignIn?: () => void } }).AndroidApp
  if (!a?.nativeGoogleSignIn) return Promise.resolve(null)
  return new Promise<string>((resolve) => {
    ;(window as unknown as { __googleNativeResolve?: (t: string) => void }).__googleNativeResolve = resolve
    a.nativeGoogleSignIn!()
  })
}

// Phones get their own email step; knowing it in JS keeps only one form (and one
// Turnstile widget) mounted. The email step opens on a tap, never on the server.
const PHONE_QUERY = "(max-width: 899.98px)"
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
const isPhoneNow = () => window.matchMedia(PHONE_QUERY).matches

function isJwtLike(t: string | null): t is string {
  return !!t && t.split(".").length === 3
}

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
        const chatToken = localStorage.getItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
        localStorage.removeItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY)
        localStorage.removeItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
        if (chatToken) {
          router.replace(`/${session}/chat?${SHARED_CHAT_TOKEN_QUERY_KEY}=${encodeURIComponent(chatToken)}`)
          return
        }
        window.sessionStorage.setItem(getActiveSharedTransactionTokenStorageKey(session), pendingShareToken)
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
          setEmailVerified(data.email_verified ?? false)
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
            const chatToken = localStorage.getItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
            localStorage.removeItem(PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY)
            localStorage.removeItem(PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY)
            if (chatToken) {
              router.push(`/${session}/chat?${SHARED_CHAT_TOKEN_QUERY_KEY}=${encodeURIComponent(chatToken)}`)
              return
            }
            window.sessionStorage.setItem(getActiveSharedTransactionTokenStorageKey(session), pendingShareToken)
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
      // Prefer the native on-device Google account picker when running inside the
      // Android WebView wrapper (no typing / no OAuth popup). Falls back to the
      // regular Firebase popup on desktop browsers or if the native path fails.
      const nativeToken = await getNativeGoogleToken()
      if (nativeToken === "cancel") return
      if (nativeToken === "no_account") {
        throw new Error(
          lang === "BM"
            ? "Tiada akaun Google pada telefon. Tambah akaun Google dalam Tetapan yang terbuka, kemudian tekan Google sekali lagi."
            : "No Google account on this device. Add one in the Settings screen that just opened, then tap Google again."
        )
      }
      if (nativeToken !== null && !isJwtLike(nativeToken)) {
        // Native path failed inside the wrapper — surface the real cause instead
        // of silently falling back to the OAuth popup.
        console.warn("[google] native failure:", nativeToken)
        throw new Error(
          lang === "BM"
            ? `Ralat log masuk Google peranti (${nativeToken}). Cuba sekali lagi.`
            : `Device Google sign-in failed (${nativeToken}). Try again.`
        )
      }
      const idToken = nativeToken
        ? (await signInWithGoogleCredential(nativeToken)).idToken
        : await signInWithGoogle()
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
          setEmailVerified(true) // Google verified the email at sign-in
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

  const isBm = lang === "BM"
  const isPhone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false)
  const phoneEmail = isPhone && showLoginForm
  const ghostButton =
    "flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-base font-bold text-[var(--l-muted)] transition hover:text-[var(--l-text)] active:scale-[0.98]"

  return (
    <div className={styles.screen} data-step={showLoginForm ? "email" : "welcome"}>
      {/* Phone: the logo sits in a top bar with the controls; on desktop it is in the colour block. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedTheme === "light" ? "/logoweb.png" : "/logowebdark.png"}
        alt="MyPeribadi"
        className="absolute left-6 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-50 h-9 w-auto object-contain min-[900px]:hidden"
      />

      {/* Theme and language */}
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-50 flex items-center gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--l-card-line)] bg-[var(--l-card)]">
          <ThemeToggle compact className="bg-transparent border-none p-0" />
        </span>
        <button
          type="button"
          onClick={() => setLang(lang === "EN" ? "BM" : "EN")}
          aria-label={isBm ? "Tukar bahasa" : "Change language"}
          className="flex h-11 items-center gap-1.5 rounded-full border border-[var(--l-card-line)] bg-[var(--l-card)] px-4 text-[13px] font-bold tracking-[0.06em] text-[var(--l-text)]"
        >
          <Globe size={15} strokeWidth={1.8} />
          {lang}
        </button>
      </div>

      {/* ── Phone welcome ("Login Moden"): balance card over a blue circle, the
          headline with "teratur." highlighted, and the two ways in at the foot.
          The email step and desktop use the sections below. */}
      <section className={styles.mWelcome}>
        <div className="relative mt-2 h-[300px] shrink-0" aria-hidden>
          <div className="absolute -right-2 top-1.5 h-[190px] w-[190px] rounded-full bg-[#0878F8]" />
          <div className="absolute right-10 top-[54px] h-[94px] w-[94px] rounded-full border-[1.5px] border-white opacity-35" />
          <div className="absolute left-0 top-[70px] flex h-[164px] w-[268px] -rotate-[5deg] flex-col justify-between rounded-3xl border border-[var(--l-card-line)] bg-[var(--l-card)] p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--l-muted)]">{isBm ? "Jumlah baki" : "Total balance"}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--l-card-line)] text-[var(--l-muted)]">
                <Eye size={14} strokeWidth={1.8} />
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold text-[var(--l-muted)]">RM</span>
              <span className="text-[34px] font-semibold leading-none tracking-[0.08em]">••••••</span>
            </div>
            <div className="flex gap-1.5">
              <span className="h-1.5 w-[72px] rounded-full bg-[#0878F8]" />
              <span className="h-1.5 w-10 rounded-full bg-[var(--l-card-line)]" />
              <span className="h-1.5 w-6 rounded-full bg-[var(--l-card-line)]" />
            </div>
          </div>
          <div className="absolute bottom-[18px] right-1.5 flex h-11 items-center gap-2 rounded-full border border-[var(--l-card-line)] bg-[var(--l-card)] pl-2 pr-3.5 text-[13px] font-semibold shadow-[0_16px_32px_-20px_rgba(0,0,0,0.5)]">
            <span className="flex gap-1">
              {[MessageCircle, Send, Globe].map((Icon, i) => (
                <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--l-card-line)]">
                  <Icon size={15} strokeWidth={1.8} />
                </span>
              ))}
            </span>
            {isBm ? "Rekod di mana-mana" : "Record anywhere"}
          </div>
        </div>

        <div className="mt-5">
          <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.03em]">
            {isBm ? "Duit anda," : "Your money,"}
            <br />
            {isBm ? "lebih " : "better "}
            {/* Inline colour: some themes remap the text-white class. */}
            <span className="rounded-[10px] bg-[#0878F8] px-2" style={{ color: "#ffffff" }}>
              {isBm ? "teratur." : "organised."}
            </span>
          </h1>
          <p className="mt-3.5 max-w-[310px] text-[15px] font-medium leading-relaxed text-[var(--l-muted)]">
            {isBm
              ? "Rekod melalui WhatsApp, Telegram atau web. Semuanya di satu tempat."
              : "Record from WhatsApp, Telegram or the web. Everything in one place."}
          </p>
        </div>

        {error && !showLoginForm ? (
          <div className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-500">{error}</div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 pt-6">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || success}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[var(--l-button-bg)] text-base font-bold text-[var(--l-button-text)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {googleLoading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                {isBm ? "Sedang log masuk..." : "Signing in..."}
              </>
            ) : (
              <>
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                </span>
                {isBm ? "Teruskan dengan Google" : "Continue with Google"}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setShowLoginForm(true); setError("") }}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full border border-[var(--l-card-line)] bg-[var(--l-card)] text-base font-bold text-[var(--l-text)] transition active:scale-[0.98]"
          >
            <Mail size={18} strokeWidth={1.8} />
            {isBm ? "Teruskan dengan emel" : "Continue with email"}
          </button>
          <p className="mt-1.5 text-center text-sm text-[var(--l-muted)]">
            {isBm ? "Belum ada akaun?" : "No account yet?"}{" "}
            <Link href="/register" className="font-bold text-[var(--l-text)] underline decoration-[#0878F8] decoration-2 underline-offset-4">
              {isBm ? "Daftar percuma" : "Register free"}
            </Link>
          </p>
        </div>
      </section>

      {/* Colour area: three wallet-style cards stacked over the mesh */}
      <section className={styles.hero}>
        <div className={styles.cards} aria-hidden>
          <span className={`${styles.card} ${styles.cardA}`} />
          <span className={`${styles.card} ${styles.cardB}`} />
          <span className={`${styles.card} ${styles.cardC}`}>
            <span className={styles.chip} />
            <span className={styles.line} />
            <span className={`${styles.line} ${styles.lineShort}`} />
          </span>
        </div>
        <div className={`${styles.heroText} relative z-10 flex h-full flex-col justify-end p-6 min-[900px]:justify-between min-[900px]:p-10`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolvedTheme === "light" ? "/logoweb.png" : "/logowebdark.png"} alt="MyPeribadi" className="hidden h-9 w-auto self-start object-contain min-[900px]:block" />
          <div className="max-w-md pb-2 md:pb-6">
            <p className="max-w-[16rem] text-[1.5rem] font-black leading-[1.05] tracking-tight sm:max-w-none sm:text-[1.75rem] md:text-5xl">
              {isBm ? "Duit anda, lebih teratur." : "Your money, better organised."}
            </p>
            <p className="mt-2.5 text-base font-medium text-[var(--l-muted)]">
              {isBm
                ? "Rekod melalui WhatsApp, Telegram atau web. Semuanya di satu tempat."
                : "Record from WhatsApp, Telegram or the web. Everything in one place."}
            </p>
          </div>
        </div>
      </section>

      {/* ── Phone email step, in the same "Login Moden" style ── */}
      {phoneEmail ? (
        <section className={styles.mEmail}>
          <button
            type="button"
            onClick={() => { setShowLoginForm(false); setError("") }}
            aria-label={isBm ? "Kembali" : "Back"}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--l-card-line)] bg-[var(--l-card)] text-[var(--l-text)] transition active:scale-95"
          >
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>

          <h1 className="mt-6 text-[34px] font-bold leading-[1.08] tracking-[-0.03em]">
            {isBm ? "Log masuk" : "Sign in"}
            <br />
            {isBm ? "dengan " : "with "}
            {/* Inline colour: some themes remap the text-white class. */}
            <span className="rounded-[10px] bg-[#0878F8] px-2" style={{ color: "#ffffff" }}>
              {isBm ? "emel." : "email."}
            </span>
          </h1>
          <p className="mt-3 text-[15px] font-medium leading-relaxed text-[var(--l-muted)]">
            {isBm ? "Masukkan emel dan kata laluan akaun anda." : "Enter your account's email and password."}
          </p>

          {error ? <div className="mt-5 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-500">{error}</div> : null}

          <form onSubmit={handleLogin} className="mt-7 flex flex-1 flex-col">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--l-muted)]">{isBm ? "Emel" : "Email"}</span>
              <span className="relative block">
                <Mail size={18} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--l-muted)]" />
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="nama@contoh.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={styles.mField}
                />
              </span>
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--l-muted)]">{isBm ? "Kata laluan" : "Password"}</span>
              <span className="relative block">
                <Lock size={18} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--l-muted)]" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${styles.mField} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? (isBm ? "Sembunyi kata laluan" : "Hide password") : (isBm ? "Tunjuk kata laluan" : "Show password")}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[var(--l-muted)] transition active:bg-[var(--l-card-line)]"
                >
                  {showPassword ? <EyeOff size={19} strokeWidth={1.8} /> : <Eye size={19} strokeWidth={1.8} />}
                </button>
              </span>
            </label>

            <div className="mt-3 flex justify-end">
              <Link href="/forgot-password" className="text-sm font-semibold text-[var(--l-text)] underline decoration-[#0878F8] decoration-2 underline-offset-4">
                {isBm ? "Lupa kata laluan?" : "Forgot password?"}
              </Link>
            </div>

            {showTurnstile && TURNSTILE_SITE_KEY ? (
              <div className="mt-4">
                <Turnstile sitekey={TURNSTILE_SITE_KEY} onVerify={setTurnstileToken} theme={resolvedTheme} />
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-3 pt-8">
              <button
                type="submit"
                disabled={loading || success}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[var(--l-button-bg)] text-base font-bold text-[var(--l-button-text)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : isBm ? "Log masuk" : "Sign in"}
              </button>
              <p className="mt-1.5 text-center text-sm text-[var(--l-muted)]">
                {isBm ? "Belum ada akaun?" : "No account yet?"}{" "}
                <Link href="/register" className="font-bold text-[var(--l-text)] underline decoration-[#0878F8] decoration-2 underline-offset-4">
                  {isBm ? "Daftar percuma" : "Register free"}
                </Link>
              </p>
            </div>
          </form>
        </section>
      ) : null}

      {/* Sign-in panel */}
      {phoneEmail ? null : (
      <section className={styles.panel}>
        <div className="mx-auto w-full max-w-sm">
          <div className={styles.intro}>
            <h1 className="text-[2rem] font-black tracking-tight md:text-4xl">{isBm ? "Log masuk" : "Sign in"}</h1>
            <p className="mb-6 mt-1.5 text-sm font-medium text-[var(--l-muted)]">
              {isBm ? "Selamat kembali. Teruskan urus kewangan anda." : "Welcome back. Carry on with your money."}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-500 animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}

          {showLoginForm ? (
            <>
              <button
                type="button"
                onClick={() => { setShowLoginForm(false); setError("") }}
                className="mb-5 flex items-center gap-2 text-sm font-bold text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]"
              >
                <ArrowLeft size={16} strokeWidth={2.5} />
                {isBm ? "Kembali" : "Back"}
              </button>

              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={styles.field}
                />

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder={isBm ? "Kata laluan" : "Password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`${styles.field} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? (isBm ? "Sembunyi kata laluan" : "Hide password") : (isBm ? "Tunjuk kata laluan" : "Show password")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]"
                  >
                    {showPassword ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-xs font-bold text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]">
                    {isBm ? "Lupa kata laluan?" : "Forgot password?"}
                  </Link>
                </div>

                {showTurnstile && TURNSTILE_SITE_KEY ? (
                  <div className="py-1">
                    <Turnstile sitekey={TURNSTILE_SITE_KEY} onVerify={setTurnstileToken} theme={resolvedTheme} />
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading || success}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--l-button-bg)] py-4 text-base font-black text-[var(--l-button-text)] transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : isBm ? "Log masuk" : "Sign in"}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || success}
                className="flex w-full items-center justify-center gap-3 rounded-full bg-white py-4 text-base font-bold text-gray-900 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)] transition hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    {isBm ? "Sedang log masuk..." : "Signing in..."}
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    {isBm ? "Log masuk dengan Google" : "Sign in with Google"}
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 py-1 text-xs font-bold text-[var(--l-muted)]">
                <span className="h-px flex-1 bg-[var(--l-line)]" />
                {isBm ? "atau" : "or"}
                <span className="h-px flex-1 bg-[var(--l-line)]" />
              </div>

              <button type="button" onClick={() => setShowLoginForm(true)} className={`${ghostButton} bg-[var(--l-field)] text-[var(--l-text)]`}>
                <Mail size={18} strokeWidth={2} />
                {isBm ? "Log masuk dengan emel" : "Sign in with email"}
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-sm font-medium text-[var(--l-muted)]">
            {isBm ? "Belum ada akaun?" : "No account yet?"}{" "}
            <Link href="/register" className="font-black text-[var(--l-text)] underline-offset-4 hover:underline">
              {isBm ? "Daftar" : "Register"}
            </Link>
          </p>
        </div>
      </section>
      )}
    </div>
  )
}
