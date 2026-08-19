"use client"

import React, { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react"
import { useLang } from "@/lib/lang"
import ThemeToggle from "@/components/theme/ThemeToggle"
import Turnstile from "@/components/auth/Turnstile"
import { useTheme } from "@/components/theme/ThemeProvider"
import styles from "../auth-page.module.css"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY

export default function ForgotPasswordPage() {
  const { t, lang, setLang } = useLang()
  const { theme, resolvedTheme } = useTheme()
  const [email, setEmail] = useState("")
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [showTurnstile, setShowTurnstile] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    
    if (!email) {
      setError(lang === "BM" ? "Sila masukkan e-mel anda" : "Please enter your email")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstile_token: turnstileToken }),
      })

      if (res.ok) {
        setSuccess(true)
      } else {
        const err = await res.json()
        setError(err.detail || (lang === "BM" ? "Ralat sistem. Cuba lagi nanti." : "System error. Try again later."))
      }
    } catch {
      setError(t.serverError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${styles.screen} h-dvh flex flex-col justify-center overflow-hidden p-6 bg-[var(--auth-bg)] text-[var(--auth-text)] font-sans selection:bg-[var(--auth-tint)]`}>
      {/* Subtle top controls */}
      <div className="flex justify-between items-center relative z-10">
        <Link href="/login" className="h-10 w-10 flex items-center justify-center rounded-full bg-[var(--auth-card)] hover:bg-[var(--auth-card-hover)] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex gap-4 items-center">
            <ThemeToggle compact className="bg-transparent border-none p-0 opacity-[var(--auth-control-opacity)] hover:opacity-[var(--auth-control-opacity-hover)]" />
            <button 
                onClick={() => setLang(lang === "EN" ? "BM" : "EN")} 
                className="text-[0.625rem] font-black uppercase tracking-widest px-2 py-1 rounded-md border border-[var(--auth-control-border)] text-[var(--auth-control-text)] opacity-[var(--auth-control-opacity)] hover:opacity-[var(--auth-control-opacity-hover)]"
            >
                {lang}
            </button>
        </div>
      </div>

      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center mt-[-40px]">
        {!success ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-4xl font-black tracking-tight mb-4 leading-tight">
                {lang === "BM" ? "Lupa kata laluan?" : "Forgot password?"}
              </h1>
              <p className="text-[var(--auth-muted)] font-medium leading-relaxed">
                {lang === "BM" 
                  ? "Masukkan e-mel anda dan kami akan menghantar pautan untuk menetapkan semula kata laluan anda." 
                  : "Enter your email and we'll send you a link to reset your password."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-500 font-bold mb-4 animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}
              
              <div className="relative">
                <input
                  autoFocus
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`${styles.input} w-full bg-[var(--auth-card)] border-none rounded-2xl p-5 text-lg font-medium focus:ring-1 focus:ring-[var(--auth-border-strong)] transition-all outline-none`}
                />
              </div>

              {showTurnstile && TURNSTILE_SITE_KEY ? (
                <div className="py-2">
                  <Turnstile 
                    sitekey={TURNSTILE_SITE_KEY} 
                    onVerify={setTurnstileToken} 
                    theme={resolvedTheme}
                  />
                </div>
              ) : null}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-[var(--auth-button-bg)] text-[var(--auth-button-text)] rounded-full font-bold text-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : (lang === "BM" ? "Hantar Pautan" : "Send Link")}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center space-y-8 py-4 animate-in fade-in zoom-in duration-500">
            <div className="mx-auto h-24 w-24 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400">
              <CheckCircle2 size={48} />
            </div>
            <div className="space-y-3">
              <h3 className="text-3xl font-black text-[var(--auth-text)] tracking-tight">
                {lang === "BM" ? "E-mel Dihantar!" : "Email Sent!"}
              </h3>
              <p className="text-lg font-medium text-[var(--auth-muted)] leading-relaxed max-w-[280px] mx-auto">
                {lang === "BM" 
                  ? `Kami telah menghantar pautan ke emel anda.` 
                  : `We've sent a link to your email.`}
              </p>
            </div>
            <div className="pt-4">
                <Link href="/login" className="inline-block px-8 py-4 bg-[var(--auth-button-bg)] text-[var(--auth-button-text)] rounded-full font-bold text-lg hover:opacity-90 active:scale-[0.95] transition-all">
                    {lang === "BM" ? "Kembali ke Log Masuk" : "Back to Login"}
                </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
