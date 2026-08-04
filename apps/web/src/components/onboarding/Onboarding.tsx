"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  PenLine,
  Languages,
  Clock,
  UtensilsCrossed,
  CarFront,
  Wallet,
  ChevronDown,
  MapPin,
  Tag,
  CircleCheckBig,
} from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { invalidateApiCachePrefix } from "@/lib/api-cache"
import { useLang } from "@/lib/lang"

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur (GMT+8)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (GMT+8)" },
  { value: "Asia/Jakarta", label: "Asia/Jakarta (GMT+7)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (GMT+7)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (GMT+9)" },
  { value: "UTC", label: "UTC (GMT+0)" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
]

type CategoryMode = "bm" | "en" | "manual"
type Step = "category" | "settings" | "confirm"
const STEP_ORDER: Step[] = ["category", "settings", "confirm"]

// Rubber-band "tali tarik" spring: overshoots then snaps back into place.
const PULL_TRANSITION = { type: "spring" as const, stiffness: 320, damping: 16, mass: 0.8 }

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { lang, setLang, setTimezone, setTimeFormat } = useLang()
  const [step, setStep] = useState<Step>("category")
  const [categoryMode, setCategoryMode] = useState<CategoryMode | null>(null)
  const [appLang, setAppLang] = useState<"BM" | "EN">("EN")
  const [tz, setTz] = useState("Asia/Kuala_Lumpur")
  const [tf, setTf] = useState<"12h" | "24h">("24h")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [setupPhase, setSetupPhase] = useState<0 | 1 | 2 | 3 | 4>(0) // 0=off 1=categories 2=timezone 3=language 4=done
  const tr = (bm: string, en: string) => (appLang === "BM" ? bm : en)
  const stepIndex = STEP_ORDER.indexOf(step)
  const canContinue = step === "category" ? categoryMode !== null : true

  async function handleDone() {
    setSaving(true)
    setSetupPhase(1)
    setError("")
    try {
      const token = getAccessToken()
      const res = await fetch("/api/users/me/onboarding", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          language: appLang,
          timezone: tz,
          time_format: tf,
          category_mode: categoryMode,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || "Failed to save preferences")
      }
      setSetupPhase(2)
      await new Promise(r => setTimeout(r, 4000))
      setSetupPhase(3)
      await new Promise(r => setTimeout(r, 4000))
      setSetupPhase(4)
      await new Promise(r => setTimeout(r, 3000))
      // Drop stale cached dashboard data (esp. /users/me onboarding_done)
      // so the post-onboarding reload doesn't re-trigger onboarding.
      invalidateApiCachePrefix("/api", token)
      setLang(appLang)
      setTimezone(tz)
      setTimeFormat(tf)
      onDone()
    } catch (e) {
      setSetupPhase(0)
      setError(e instanceof Error ? e.message : "A technical error occurred. Please try again.")
      setSaving(false)
    }
  }

  const go = (next: Step) => {
    setError("")
    setStep(next)
  }

  const goNext = () => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx < STEP_ORDER.length - 1) go(STEP_ORDER[idx + 1])
  }
  const goPrev = () => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx > 0) go(STEP_ORDER[idx - 1])
  }

  // Drag-to-pull gesture: drag the page sideways like pulling a sheet.
  const [dragging, setDragging] = useState(false)
  const onDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    setDragging(false)
    if (info.offset.x < -70) goNext()
    else if (info.offset.x > 70) goPrev()
  }

  return (
    <div className="fixed inset-0 z-[999999] flex flex-col overflow-y-auto bg-[var(--page-bg)] text-[var(--text)] font-sans">
      {/* Account setup loading graphic */}
      <AnimatePresence>
        {saving && (
          <SetupLoading phase={setupPhase} lang={appLang} />
        )}
      </AnimatePresence>

      {/* Top progress bar */}
      <div className="fixed left-0 right-0 top-0 z-10 h-1 bg-[var(--border)]">
        <motion.div
          className="h-full rounded-r-full bg-[var(--btn-primary-bg)]"
          initial={false}
          animate={{ width: `${((stepIndex + 1) / STEP_ORDER.length) * 100}%` }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        {/* Tali tarik: elastic band that stretches when step changes */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`band-${step}`}
            initial={{ scaleY: 1.8, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 15, mass: 0.7 }}
            className="mx-auto mb-8 h-1.5 w-24 origin-center rounded-full bg-gradient-to-r from-[var(--btn-primary-bg)] via-[var(--btn-primary-bg)]/60 to-transparent"
            style={{ transformOrigin: "center" }}
          />
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {step === "category" && (
            <motion.div
              key="cat"
              initial={{ opacity: 0, y: 46, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -46, scale: 0.96 }}
              transition={PULL_TRANSITION}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDragEnd={onDragEnd}
              className={`space-y-6 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              {/* Hero */}
              <div className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-gradient-to-br from-[var(--btn-primary-bg)]/25 via-[var(--surface-tint)] to-[var(--page-bg)] p-6">
                <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[var(--btn-primary-bg)]/15 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-[var(--btn-primary-bg)]/10 blur-2xl" />
                <div className="relative space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--card)]/70 px-3 py-1 text-[0.625rem] font-black uppercase tracking-[0.18em] text-[var(--btn-primary-bg)]">
                    <Sparkles size={12} />
                    {tr("Langkah 1 daripada 3", "Step 1 of 3")}
                  </div>
                  <h1 className="text-3xl font-black leading-tight tracking-tight text-[var(--text)]">
                    {tr("Selamat datang! 🎉", "Welcome! 🎉")}
                  </h1>
                  <p className="text-sm font-medium leading-relaxed text-[var(--muted)]">
                    {tr(
                      "Siapkan akaun anda dalam masa kurang seminit.",
                      "Set up your account in under a minute.",
                    )}
                  </p>
                </div>
              </div>

              {/* Language */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
                  <Languages size={13} />
                  {tr("Bahasa", "Language")}
                </p>
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--surface-tint)] p-1.5">
                  {(["BM", "EN"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setAppLang(l)}
                      className={`relative rounded-xl px-4 py-3 text-center text-sm font-bold transition-all ${
                        appLang === l ? "bg-[var(--card)] text-[var(--text)] shadow-md" : "text-[var(--muted)]"
                      }`}
                    >
                      {l === "BM" ? "Bahasa Melayu" : "English"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category choice */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
                  <Wallet size={13} />
                  {tr("Kategori", "Categories")}
                </p>
                <div className="space-y-3">
                  {optionCard(
                    <UtensilsCrossed size={20} />,
                    tr("Auto — Bahasa Melayu", "Auto — Bahasa Melayu"),
                    tr("Makanan, Pengangkutan, Bil & banyak lagi.", "Food, Transport, Bills & more."),
                    categoryMode === "bm",
                    () => setCategoryMode("bm"),
                  )}
                  {optionCard(
                    <CarFront size={20} />,
                    tr("Auto — English", "Auto — English"),
                    tr("Food & Drinks, Transport, Bills & more.", "Food & Drinks, Transport, Bills & more."),
                    categoryMode === "en",
                    () => setCategoryMode("en"),
                  )}
                  {optionCard(
                    <PenLine size={20} />,
                    tr("Manual", "Manual"),
                    tr("Mula kosong, cipta kategori sendiri.", "Start empty, create your own categories."),
                    categoryMode === "manual",
                    () => setCategoryMode("manual"),
                  )}
                </div>
              </div>

              <PrimaryButton disabled={!canContinue} onClick={() => go("settings")}>
                {tr("Seterusnya", "Continue")}
                <ArrowRight size={20} />
              </PrimaryButton>
            </motion.div>
          )}

          {step === "settings" && (
            <motion.div
              key="set"
              initial={{ opacity: 0, y: 46, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -46, scale: 0.96 }}
              transition={PULL_TRANSITION}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDragEnd={onDragEnd}
              className={`space-y-6 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-tint)] px-3 py-1 text-[0.625rem] font-black uppercase tracking-[0.18em] text-[var(--btn-primary-bg)]">
                  <Clock size={12} />
                  {tr("Langkah 2 daripada 3", "Step 2 of 3")}
                </div>
                <h1 className="text-3xl font-black leading-tight tracking-tight">
                  {tr("Tetapan Asas", "Basic Settings")}
                </h1>
                <p className="text-sm font-medium leading-relaxed text-[var(--muted)]">
                  {tr("Tetapkan zon masa dan format masa anda.", "Set your timezone and time format.")}
                </p>
              </div>

              <div className="space-y-4">
                {/* Timezone */}
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label className="mb-2 block text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Zon Masa", "Timezone")}</label>
                  <TimezoneDropdown value={tz} onChange={setTz} />
                  <p className="mt-2 text-xs font-medium text-[var(--muted)]">
                    {tr("Default ialah Asia/Kuala_Lumpur (GMT+8).", "Default is Asia/Kuala_Lumpur (GMT+8).")}
                  </p>
                </div>

                {/* Time format */}
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label className="mb-2 block text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{tr("Format Masa", "Time Format")}</label>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-tint)] p-1.5">
                    {(["12h", "24h"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setTf(f)}
                        className={`rounded-lg px-4 py-3 text-center text-sm font-bold transition-all ${
                          tf === f ? "bg-[var(--card)] text-[var(--text)] shadow-md" : "text-[var(--muted)]"
                        }`}
                      >
                        {f === "12h" ? tr("12-Jam", "12-Hour") : tr("24-Jam", "24-Hour")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <SecondaryButton onClick={() => go("category")}>
                  <ArrowLeft size={20} />
                </SecondaryButton>
                <PrimaryButton onClick={() => go("confirm")}>
                  {tr("Seterusnya", "Continue")}
                  <ArrowRight size={20} />
                </PrimaryButton>
              </div>
            </motion.div>
          )}

          {step === "confirm" && (
            <motion.div
              key="conf"
              initial={{ opacity: 0, y: 46, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -46, scale: 0.96 }}
              transition={PULL_TRANSITION}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDragEnd={onDragEnd}
              className={`space-y-6 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              {/* Success hero */}
              <div className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-gradient-to-br from-[var(--btn-primary-bg)]/25 via-[var(--surface-tint)] to-[var(--page-bg)] p-6">
                <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[var(--btn-primary-bg)]/15 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-[var(--btn-primary-bg)]/10 blur-2xl" />
                <div className="relative space-y-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-lg">
                    <Check size={24} strokeWidth={3} />
                  </div>
                  <h1 className="text-3xl font-black leading-tight tracking-tight">
                    {tr("Semua sedia!", "All set!")}
                  </h1>
                  <p className="text-sm font-medium leading-relaxed text-[var(--muted)]">
                    {tr("Semak ringkasan anda sebelum mula.", "Review your summary before you start.")}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm">
                <Row label={tr("Kategori", "Categories")} value={
                  categoryMode === "manual" ? tr("Manual (tiada kategori)", "Manual (no categories)")
                    : categoryMode === "en" ? tr("Auto — English", "Auto — English") : tr("Auto — Bahasa Melayu", "Auto — Bahasa Melayu")
                } />
                <Row label={tr("Bahasa", "Language")} value={appLang === "BM" ? "Bahasa Melayu" : "English"} />
                <Row label={tr("Zon Masa", "Timezone")} value={TIMEZONE_OPTIONS.find(o => o.value === tz)?.label || tz} />
                <Row label={tr("Format Masa", "Time Format")} value={tf === "12h" ? tr("12-Jam", "12-Hour") : tr("24-Jam", "24-Hour")} />
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-bold text-red-500">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <SecondaryButton onClick={() => go("settings")} disabled={saving}>
                  <ArrowLeft size={20} />
                </SecondaryButton>
                <PrimaryButton onClick={handleDone} disabled={saving}>
                  {saving ? <Loader2 size={20} className="animate-spin" /> : <>{tr("Mula Guna", "Get Started")}<Check size={20} /></>}
                </PrimaryButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )

  function optionCard(
    icon: React.ReactNode,
    title: string,
    desc: string,
    active: boolean,
    onClick: () => void,
  ) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        className={`group flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors ${
          active
            ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)]/10 shadow-lg"
            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]"
        }`}
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "bg-[var(--surface-tint)] text-[var(--text)]"}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--text)]">{title}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-[var(--muted)]">{desc}</p>
        </div>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          active ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border-strong)]"
        }`}>
          {active && <Check size={14} strokeWidth={3} />}
        </div>
      </motion.button>
    )
  }

  function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={{ scale: 0.94, y: 3 }}
        whileHover={disabled ? undefined : { scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-4 text-lg font-bold text-[var(--btn-primary-text)] shadow-lg transition-colors active:scale-[0.98] disabled:bg-[var(--card)] disabled:text-[var(--muted)] disabled:shadow-none"
      >
        {children}
      </motion.button>
    )
  }

  function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className="flex w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] py-4 font-bold text-[var(--text)] transition-colors disabled:opacity-50"
      >
        {children}
      </motion.button>
    )
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <span className="font-semibold text-[var(--muted)]">{label}</span>
      <span className="text-right font-bold text-[var(--text)]">{value}</span>
    </div>
  )
}

function TimezoneDropdown({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = TIMEZONE_OPTIONS.find(o => o.value === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-sm font-semibold transition-all ${
          open ? "border-[var(--btn-primary-bg)] bg-[var(--surface-tint)]" : "border-[var(--border)] bg-[var(--surface-tint)]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 text-[var(--text)]">
          <MapPin size={16} className="shrink-0 text-[var(--btn-primary-bg)]" />
          <span className="truncate">{selected?.label || value}</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-2xl"
          >
            {TIMEZONE_OPTIONS.map((o) => {
              const active = o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    active ? "bg-[var(--btn-primary-bg)]/10 font-bold text-[var(--text)]" : "font-medium text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {active && <Check size={16} className="shrink-0 text-[var(--btn-primary-bg)]" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SetupLoading({ phase, lang }: { phase: 0 | 1 | 2 | 3 | 4; lang: "BM" | "EN" }) {
  const tr = (bm: string, en: string) => (lang === "BM" ? bm : en)
  const steps = [
    { icon: Tag, label: tr("Menyediakan kategori anda...", "Setting up your categories...") },
    { icon: Clock, label: tr("Menetapkan zon masa...", "Setting your timezone...") },
    { icon: Languages, label: tr("Menggunakan bahasa anda...", "Applying your language...") },
    { icon: CircleCheckBig, label: tr("Hampir siap!", "Almost there!") },
  ]
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-[var(--page-bg)]/85 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.85, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="mx-6 flex w-full max-w-xs flex-col items-center gap-8"
      >
        {/* Animated logo orb */}
        <div className="relative h-28 w-28">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--btn-primary-bg)]"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-3 rounded-full border border-[var(--btn-primary-bg)]/40"
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={phase === 4 ? { scale: [1, 1.15, 1] } : { scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            {phase === 4 ? (
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 12 }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xl"
              >
                <CircleCheckBig size={34} strokeWidth={2.5} />
              </motion.div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--btn-primary-bg)]/15 text-[var(--btn-primary-bg)]">
                <Wallet size={30} />
              </div>
            )}
          </motion.div>
        </div>

        {/* Step checklist */}
        <div className="w-full space-y-3">
          {steps.map((s, i) => {
            const active = i === phase - 1 && phase < 4
            const done = phase > i + 1
            const Icon = s.icon
            return (
              <motion.div
                key={i}
                animate={done ? { opacity: 1, x: 0 } : { opacity: active ? 1 : 0.45, x: active ? 4 : 0 }}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  done
                    ? "border-[var(--btn-primary-bg)]/30 bg-[var(--btn-primary-bg)]/10"
                    : active
                      ? "border-[var(--btn-primary-bg)]/50 bg-[var(--btn-primary-bg)]/5"
                      : "border-[var(--border)] bg-[var(--card)]"
                }`}
              >
                {done ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 12 }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                  >
                    <Check size={15} strokeWidth={3} />
                  </motion.div>
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--muted)]">
                    <Icon size={15} />
                  </div>
                )}
                <p className={`flex-1 text-sm font-bold ${done || active ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>{s.label}</p>
                {active && <Loader2 size={16} className="animate-spin text-[var(--btn-primary-bg)]" />}
              </motion.div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}
