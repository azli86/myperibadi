"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Loader2, Eye, EyeOff, Check } from "lucide-react"
import { useLang } from "@/lib/lang"
import ThemeToggle from "@/components/theme/ThemeToggle"
import Turnstile from "@/components/auth/Turnstile"
import { useTheme } from "@/components/theme/ThemeProvider"
import styles from "../auth-page.module.css"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY

type Step = 1 | 2 | 3

export default function RegisterPage() {
  const router = useRouter()
  // ponytail: registration closed at UI level only; remove redirect to reopen. API stays open for Google sign-in account creation.
  React.useEffect(() => { router.replace("/login") }, [router])
  return null
}

function RegisterForm() {
  const router = useRouter()
  const { lang, setLang } = useLang()
  const { theme, resolvedTheme } = useTheme()
  
  const [step, setStep] = useState<Step>(1)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [showTurnstile, setShowTurnstile] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const canContinueStep1 = email.includes("@") && email.includes(".")
  const canContinueStep2 = password.length >= 8
  const canContinueStep3 = name.trim().length >= 2

  async function handleFinalRegister() {
    setError("")
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError(lang === "BM" ? "Sila lengkapkan pengesahan keselamatan." : "Please complete the security check.")
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          turnstile_token: turnstileToken,
        }),
      })

      if (res.ok) {
        router.push("/login?registered=true")
      } else {
        const err = await res.json()
        const detail = err.detail || ""
        setError(detail || (lang === "BM" ? "Pendaftaran gagal. Cuba lagi." : "Registration failed. Please try again."))
        setLoading(false)
      }
    } catch {
      setError("A technical error occurred. Please try again later.")
      setLoading(false)
    }
  }

  const stepContent = {
    1: {
      header: lang === "BM" ? "Masukkan alamat emel" : "Enter email address",
      subtext: lang === "BM" ? "Emel anda akan digunakan untuk log masuk akaun." : "Your email address will be used to sign in to your account.",
    },
    2: {
      header: lang === "BM" ? "Cipta kata laluan" : "Create a password",
      subtext: lang === "BM" ? "Kata laluan perlu sekurang-kurangnya 8 aksara." : "Your password must be at least 8 characters long.",
    },
    3: {
      header: lang === "BM" ? "Siapa nama anda?" : "What's your name?",
      subtext: lang === "BM" ? "Guna nama samaran untuk privasi. Jangan letak nama sebenar." : "Use an alias for privacy. Do not enter your real name.",
    },
  }

  const emailDomains = ["@gmail.com", "@hotmail.com", "@outlook.com", "@yahoo.com"]

  return (
    <div className={`${styles.screen} h-dvh bg-[var(--auth-bg)] text-[var(--auth-text)] font-sans selection:bg-[var(--auth-tint)] flex flex-col justify-between p-6 overflow-hidden`}>
      {/* Top Bar */}
      <div className="flex items-center justify-between relative z-10">
        {step > 1 ? (
          <button 
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="h-10 w-10 flex items-center justify-center rounded-full bg-[var(--auth-card)] hover:bg-[var(--auth-card-hover)] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <Link href="/login" className="h-10 w-10 flex items-center justify-center rounded-full bg-[var(--auth-card)] hover:bg-[var(--auth-card-hover)] transition-colors">
            <ArrowLeft size={20} />
          </Link>
        )}
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
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="space-y-8"
          >
            <div>
              <h1 className="text-4xl font-black tracking-tight mb-4 leading-tight">
                {stepContent[step].header}
              </h1>
              <p className="text-[var(--auth-muted)] font-medium leading-relaxed">
                {stepContent[step].subtext}
              </p>
            </div>

            <div className="space-y-4">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-500 font-bold animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div className="relative">
                    <input
                      autoFocus
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${styles.input} w-full bg-[var(--auth-card)] border-none rounded-2xl p-5 text-lg font-medium focus:ring-1 focus:ring-[var(--auth-border-strong)] transition-all outline-none`}
                    />
                  </div>
                  
                  <div className="flex gap-2 overflow-x-auto pb-1 whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {emailDomains.map(domain => (
                        <button
                            key={domain}
                            onClick={() => {
                                const base = email.split('@')[0] || ""
                                setEmail(base + domain)
                            }}
                            className="shrink-0 px-4 py-2 rounded-full border border-[var(--auth-border)] text-xs font-bold text-[var(--auth-muted)] hover:text-[var(--auth-text)] hover:bg-[var(--auth-tint)] transition-all"
                        >
                            {domain}
                        </button>
                    ))}
                  </div>

                  <button
                    disabled={!canContinueStep1}
                    onClick={() => { setError(""); setStep(2) }}
                    className="w-full py-4 bg-[var(--auth-button-bg)] text-[var(--auth-button-text)] disabled:bg-[var(--auth-card)] disabled:text-[var(--auth-muted)] rounded-full font-bold text-lg transition-all active:scale-[0.98] mt-4"
                  >
                    {lang === "BM" ? "Seterusnya" : "Continue"}
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="relative">
                    <input
                        autoFocus
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${styles.input} w-full bg-[var(--auth-card)] border-none rounded-2xl p-5 text-lg font-medium focus:ring-1 focus:ring-[var(--auth-border-strong)] transition-all outline-none pr-14`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-[var(--auth-muted)] hover:text-[var(--auth-text)] transition-colors"
                    >
                        {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                    </button>
                  </div>

                  <button
                    disabled={!canContinueStep2}
                    onClick={() => setStep(3)}
                    className="w-full py-4 bg-[var(--auth-button-bg)] text-[var(--auth-button-text)] disabled:bg-[var(--auth-card)] disabled:text-[var(--auth-muted)] rounded-full font-bold text-lg transition-all active:scale-[0.98]"
                  >
                    {lang === "BM" ? "Seterusnya" : "Continue"}
                  </button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                          autoFocus
                          type="text"
                          placeholder={lang === "BM" ? "Nama Samaran" : "Alias"}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className={`${styles.input} w-full bg-[var(--auth-card)] border-none rounded-2xl p-5 text-lg font-medium focus:ring-1 focus:ring-[var(--auth-border-strong)] transition-all outline-none`}
                      />
                    </div>
                    <div className="rounded-2xl border border-amber-400/24 bg-amber-400/10 px-4 py-3 text-[0.78rem] font-semibold leading-relaxed text-amber-200 dark:text-amber-100">
                      {lang === "BM"
                        ? "Privasi: letak nama samaran sahaja. Elakkan nama sebenar atau nama penuh."
                        : "Privacy: use an alias only. Avoid your real or full legal name."}
                    </div>
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

                  <button
                    disabled={!canContinueStep3 || loading}
                    onClick={handleFinalRegister}
                    className="w-full py-4 bg-[var(--auth-button-bg)] text-[var(--auth-button-text)] disabled:bg-[var(--auth-card)] disabled:text-[var(--auth-muted)] rounded-full font-bold text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        <>
                            {lang === "BM" ? "Selesai" : "Finish"}
                            <Check size={20} />
                        </>
                    )}
                  </button>
                </div>
              )}

              <div className="pt-3">
                <p className="text-[0.6875rem] text-[var(--auth-muted)] text-center leading-relaxed font-medium">
                  Already have an account?{" "}
                  <Link href="/login" className="text-[var(--auth-text)] font-bold hover:underline">Sign in here</Link>.
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
