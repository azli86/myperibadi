"use client"

import React, { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { useLang } from "@/lib/lang"
import ThemeToggle from "@/components/theme/ThemeToggle"
import styles from "../auth-page.module.css"

export default function VerifyEmailPage() {
  return (
    <div className={`${styles.screen} h-dvh flex flex-col justify-center overflow-hidden p-6 bg-[var(--auth-bg)] text-[var(--auth-text)] font-sans selection:bg-[var(--auth-tint)]`}>
      <div className="flex justify-between items-center relative z-10">
        <Link href="/login" className="h-10 w-10 flex items-center justify-center rounded-full bg-[var(--auth-card)] hover:bg-[var(--auth-card-hover)] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex gap-4 items-center">
          <ThemeToggle compact className="bg-transparent border-none p-0 opacity-[var(--auth-control-opacity)] hover:opacity-[var(--auth-control-opacity-hover)]" />
        </div>
      </div>
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center mt-[-40px]">
        <Suspense fallback={<div className="flex justify-center p-12"><Loader2 size={32} className="animate-spin text-[var(--auth-text)]" /></div>}>
          <VerifyForm />
        </Suspense>
      </div>
      <div className="w-full max-w-xs mx-auto mb-8 h-10" />
    </div>
  )
}

function VerifyForm() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const [state, setState] = useState<"loading" | "success" | "error">("loading")
  const [detail, setDetail] = useState("")

  useEffect(() => {
    const token = searchParams.get("token") || ""
    if (!token) {
      setState("error")
      setDetail(lang === "BM" ? "Pautan tidak sah." : "Invalid link.")
      return
    }
    fetch(`/api/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setState("success")
        } else {
          setState("error")
          setDetail(lang === "BM" ? "Pautan tidak sah atau telah tamat tempoh." : "Invalid or expired verification link.")
        }
      })
      .catch(() => {
        setState("error")
        setDetail(lang === "BM" ? "Ralat. Cuba lagi." : "Something went wrong. Please try again.")
      })
  }, [searchParams, lang])

  return (
    <div className="auth-card rounded-2xl p-6 bg-[var(--auth-card)] border border-[var(--auth-card-border)] shadow-lg text-center">
      {state === "loading" && (
        <>
          <Loader2 size={40} className="animate-spin mx-auto text-[var(--auth-tint)]" />
          <h3 className="mt-4 text-lg font-bold">{lang === "BM" ? "Mengesahkan e-mel..." : "Verifying email..."}</h3>
        </>
      )}
      {state === "success" && (
        <>
          <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
          <h3 className="mt-4 text-lg font-bold">{lang === "BM" ? "E-mel Disahkan" : "Email Verified"}</h3>
          <p className="mt-2 text-sm opacity-80">{lang === "BM" ? "Terima kasih! Alamat e-mel anda telah disahkan." : "Thanks! Your email address has been verified."}</p>
        </>
      )}
      {state === "error" && (
        <>
          <AlertCircle size={44} className="mx-auto text-red-500" />
          <h3 className="mt-4 text-lg font-bold">{lang === "BM" ? "Pengesahan Gagal" : "Verification Failed"}</h3>
          <p className="mt-2 text-sm opacity-80">{detail}</p>
        </>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm font-bold text-[var(--auth-tint)] underline">
        {lang === "BM" ? "Ke halaman log masuk" : "Go to sign in"}
      </Link>
    </div>
  )
}
