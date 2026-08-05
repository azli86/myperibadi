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
  CircleAlert,
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
type Step = "welcome" | "category" | "settings" | "confirm"
const STEP_ORDER: Step[] = ["welcome", "category", "settings", "confirm"]

// Gravity-feel spring: heavier mass, slower settle — like an object dropping and landing.
const CARD_LAND_TRANSITION = { type: "spring" as const, stiffness: 360, damping: 20, mass: 1.1 }

// Staggered card entrance (each card drops in one after another).
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 26, scale: 0.96 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...CARD_LAND_TRANSITION, delay: 0.05 + i * 0.07 },
  }),
}

// Part-by-part slide-in from the right, sequenced for "next" navigation.
const SLIDE_RIGHT_VARIANTS = {
  hidden: { opacity: 0, x: 52 },
  show: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 300, damping: 26, mass: 1 } },
}

// Step wrapper: whole step slides/zooms in, exits upward, and staggers its children.
const STEP_WRAPPER_VARIANTS = {
  hidden: { opacity: 0, y: 46, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 320, damping: 16, mass: 0.8, staggerChildren: 0.1 } },
  exit: { opacity: 0, y: -46, scale: 0.96, transition: { duration: 0.18 } },
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { lang, setLang, setTimezone, setTimeFormat } = useLang()
  const [step, setStep] = useState<Step>("welcome")
  const [categoryMode, setCategoryMode] = useState<CategoryMode | null>(null)
  const [appLang, setAppLang] = useState<"BM" | "EN">("EN")
  const [tz, setTz] = useState("Asia/Kuala_Lumpur")
  const [tf, setTf] = useState<"12h" | "24h">("24h")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [setupPhase, setSetupPhase] = useState<0 | 1 | 2 | 3 | 4>(0) // 0=off 1=categories 2=timezone 3=language 4=done
  const tr = (bm: string, en: string) => (appLang === "BM" ? bm : en)
  const stepIndex = STEP_ORDER.indexOf(step)
  const canContinue = true // validation happens on click so we can show a clear error

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
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={STEP_WRAPPER_VARIANTS}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDragEnd={onDragEnd}
              className={`space-y-6 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              {/* Logo + Welcome hero */}
              <motion.div
                variants={SLIDE_RIGHT_VARIANTS}
                className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-gradient-to-br from-[var(--btn-primary-bg)]/25 via-[var(--surface-tint)] to-[var(--page-bg)] p-8 text-center"
              >
                <motion.div
                  className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-[var(--btn-primary-bg)]/20 blur-3xl"
                  animate={{ y: [0, -14, 0], scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
                />
                <motion.div
                  className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-[var(--btn-primary-bg)]/12 blur-3xl"
                  animate={{ y: [0, 12, 0], scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 1 }}
                />
                <div className="relative flex flex-col items-center">
                  <motion.div
                    initial={{ scale: 0, rotate: -18 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 15, mass: 1 }}
                    className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl shadow-[var(--btn-primary-bg)]/20"
                  >
                    <img
                      src="/icon-512-v3.png"
                      alt={tr("Logo", "Logo")}
                      className="h-24 w-24 rounded-[20px] object-cover"
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, type: "spring", stiffness: 260, damping: 20 }}
                    className="mt-5"
                  >
                    <h1 className="text-3xl font-black leading-tight tracking-tight text-[var(--text)]">
                      {tr("Selamat datang!", "Welcome!")}
                    </h1>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--muted)]">
                      {tr(
                        "Jejak wang anda dengan mudah. Sediakan akaun dalam masa kurang seminit.",
                        "Track your money effortlessly. Set up your account in under a minute.",
                      )}
                    </p>
                  </motion.div>
                </div>
              </motion.div>

              <motion.div variants={SLIDE_RIGHT_VARIANTS}>
                <PrimaryButton onClick={() => go("category")}>
                  {tr("Mula", "Get Started")}
                  <ArrowRight size={20} />
                </PrimaryButton>
              </motion.div>
            </motion.div>
          )}

          {step === "category" && (
            <motion.div
              key="cat"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={STEP_WRAPPER_VARIANTS}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDragEnd={onDragEnd}
              className={`space-y-6 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              {/* Hero */}
              <motion.div
                variants={SLIDE_RIGHT_VARIANTS}
                className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-gradient-to-br from-[var(--btn-primary-bg)]/25 via-[var(--surface-tint)] to-[var(--page-bg)] p-6"
              >
                <motion.div
                  className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[var(--btn-primary-bg)]/20 blur-3xl"
                  animate={{ y: [0, -12, 0], scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
                />
                <motion.div
                  className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-[var(--btn-primary-bg)]/12 blur-3xl"
                  animate={{ y: [0, 10, 0], scale: [1, 1.06, 1] }}
                  transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 1 }}
                />
                <div className="relative space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--card)]/70 px-3 py-1 text-[0.625rem] font-black uppercase tracking-[0.18em] text-[var(--btn-primary-bg)]">
                    <Sparkles size={12} />
                    {tr("Langkah 1 daripada 3", "Step 1 of 3")}
                  </div>
                  <h1 className="text-3xl font-black leading-tight tracking-tight text-[var(--text)]">
                    {tr("Kategori & Bahasa", "Categories & Language")}
                  </h1>
                  <p className="text-sm font-medium leading-relaxed text-[var(--muted)]">
                    {tr(
                      "Siapkan akaun anda dalam masa kurang seminit.",
                      "Set up your account in under a minute.",
                    )}
                  </p>
                </div>
              </motion.div>

              {/* Language */}
              <motion.div variants={SLIDE_RIGHT_VARIANTS}>
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
              </motion.div>

              {/* Category choice */}
              <motion.div variants={SLIDE_RIGHT_VARIANTS}>
                <p className="mb-2 flex items-center gap-1.5 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
                  <Wallet size={13} />
                  {tr("Kategori", "Categories")}
                </p>
                <p className="mb-3 text-xs font-medium leading-relaxed text-[var(--muted)]">
                  {tr(
                    "Ketik satu untuk mula dengan kategori ringkas.",
                    "Tap one to start with ready-made categories.",
                  )}
                </p>
                <motion.div
                  className="space-y-3"
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.07 } } }}
                >
                  <motion.div variants={CARD_VARIANTS} custom={0}>{optionCard(
                    <UtensilsCrossed size={20} />,
                    tr("Auto — Bahasa Melayu", "Auto — Bahasa Melayu"),
                    tr("Makanan, Pengangkutan, Bil & banyak lagi.", "Food, Transport, Bills & more."),
                    categoryMode === "bm",
                    () => { setCategoryMode("bm"); setError("") },
                  )}</motion.div>
                  <motion.div variants={CARD_VARIANTS} custom={1}>{optionCard(
                    <CarFront size={20} />,
                    tr("Auto — English", "Auto — English"),
                    tr("Food & Drinks, Transport, Bills & more.", "Food & Drinks, Transport, Bills & more."),
                    categoryMode === "en",
                    () => { setCategoryMode("en"); setError("") },
                  )}</motion.div>
                  <motion.div variants={CARD_VARIANTS} custom={2}>{optionCard(
                    <PenLine size={20} />,
                    tr("Manual", "Manual"),
                    tr("Mula kosong, cipta kategori sendiri.", "Start empty, create your own categories."),
                    categoryMode === "manual",
                    () => { setCategoryMode("manual"); setError("") },
                  )}</motion.div>
                </motion.div>
              </motion.div>

              {error && step === "category" && (
                <motion.div
                  variants={SLIDE_RIGHT_VARIANTS}
                  className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm font-bold text-red-500"
                >
                  <CircleAlert size={16} />
                  {error}
                </motion.div>
              )}

              <motion.div variants={SLIDE_RIGHT_VARIANTS}>
                <PrimaryButton disabled={!canContinue} onClick={() => {
                  if (!categoryMode) {
                    setError(tr("Sila pilih satu kategori untuk teruskan.", "Please select a category option to continue."))
                    return
                  }
                  go("settings")
                }}>
                  {tr("Seterusnya", "Continue")}
                  <ArrowRight size={20} />
                </PrimaryButton>
              </motion.div>
            </motion.div>
          )}

          {step === "settings" && (
            <motion.div
              key="set"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={STEP_WRAPPER_VARIANTS}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDragEnd={onDragEnd}
              className={`space-y-6 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              <motion.div
                variants={SLIDE_RIGHT_VARIANTS}
                className="space-y-2"
              >
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
              </motion.div>

              <motion.div variants={SLIDE_RIGHT_VARIANTS} className="space-y-4">
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
              </motion.div>

              <motion.div variants={SLIDE_RIGHT_VARIANTS} className="flex gap-3">
                <SecondaryButton onClick={() => go("category")}>
                  <ArrowLeft size={20} />
                </SecondaryButton>
                <PrimaryButton onClick={() => go("confirm")}>
                  {tr("Seterusnya", "Continue")}
                  <ArrowRight size={20} />
                </PrimaryButton>
              </motion.div>
            </motion.div>
          )}

          {step === "confirm" && (
            <motion.div
              key="conf"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={STEP_WRAPPER_VARIANTS}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDragEnd={onDragEnd}
              className={`space-y-6 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            >
              {/* Success hero */}
              <motion.div
                variants={SLIDE_RIGHT_VARIANTS}
                className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-gradient-to-br from-[var(--btn-primary-bg)]/25 via-[var(--surface-tint)] to-[var(--page-bg)] p-6"
              >
                <motion.div
                  className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[var(--btn-primary-bg)]/20 blur-3xl"
                  animate={{ y: [0, -12, 0], scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
                />
                <motion.div
                  className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-[var(--btn-primary-bg)]/12 blur-3xl"
                  animate={{ y: [0, 10, 0], scale: [1, 1.06, 1] }}
                  transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 1 }}
                />
                <div className="relative space-y-2">
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 14, mass: 1 }}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-lg shadow-[var(--btn-primary-bg)]/30"
                  >
                    <Check size={24} strokeWidth={3} />
                  </motion.div>
                  <h1 className="text-3xl font-black leading-tight tracking-tight">
                    {tr("Semua sedia!", "All set!")}
                  </h1>
                  <p className="text-sm font-medium leading-relaxed text-[var(--muted)]">
                    {tr("Semak ringkasan anda sebelum mula.", "Review your summary before you start.")}
                  </p>
                </div>
              </motion.div>

              <motion.div
                variants={SLIDE_RIGHT_VARIANTS}
                className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm"
              >
                <Row label={tr("Kategori", "Categories")} value={
                  categoryMode === "manual" ? tr("Manual (tiada kategori)", "Manual (no categories)")
                    : categoryMode === "en" ? tr("Auto — English", "Auto — English") : tr("Auto — Bahasa Melayu", "Auto — Bahasa Melayu")
                } />
                <Row label={tr("Bahasa", "Language")} value={appLang === "BM" ? "Bahasa Melayu" : "English"} />
                <Row label={tr("Zon Masa", "Timezone")} value={TIMEZONE_OPTIONS.find(o => o.value === tz)?.label || tz} />
                <Row label={tr("Format Masa", "Time Format")} value={tf === "12h" ? tr("12-Jam", "12-Hour") : tr("24-Jam", "24-Hour")} />
              </motion.div>

              {error && (
                <motion.div
                  variants={SLIDE_RIGHT_VARIANTS}
                  className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-bold text-red-500"
                >
                  {error}
                </motion.div>
              )}

              <motion.div variants={SLIDE_RIGHT_VARIANTS} className="flex gap-3">
                <SecondaryButton onClick={() => go("settings")} disabled={saving}>
                  <ArrowLeft size={20} />
                </SecondaryButton>
                <PrimaryButton onClick={handleDone} disabled={saving}>
                  {saving ? <Loader2 size={20} className="animate-spin" /> : <>{tr("Mula Guna", "Get Started")}<Check size={20} /></>}
                </PrimaryButton>
              </motion.div>
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
        whileTap={{ scale: 0.97, y: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 18, mass: 0.9 }}
        className={`group flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors duration-200 ${
          active
            ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)]/10 shadow-lg shadow-[var(--btn-primary-bg)]/10"
            : "border-[var(--border)] bg-[var(--card)]"
        }`}
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          active
            ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
            : "bg-[var(--surface-tint)] text-[var(--text)]"
        }`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--text)]">{title}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-[var(--muted)]">{desc}</p>
        </div>
        <div className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          active
            ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
            : "border-[var(--border-strong)]"
        }`}>
          {active && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="absolute inset-0 rounded-full bg-[var(--btn-primary-bg)]/30"
              style={{ animation: "none" }}
            />
          )}
          {active && <Check size={14} strokeWidth={3} className="relative" />}
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
        whileTap={disabled ? undefined : { scale: 0.95, y: 4 }}
        transition={{ type: "spring", stiffness: 380, damping: 19, mass: 1.1 }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-4 text-lg font-bold text-[var(--btn-primary-text)] shadow-lg shadow-[var(--btn-primary-bg)]/20 transition-colors disabled:bg-[var(--card)] disabled:text-[var(--muted)] disabled:shadow-none"
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
        whileTap={disabled ? undefined : { scale: 0.9, y: 3 }}
        transition={{ type: "spring", stiffness: 380, damping: 19, mass: 1.1 }}
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
