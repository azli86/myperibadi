"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Landmark, LayoutDashboard, UserCircle2, Briefcase, FileText, Gift,
  BadgePercent, Receipt, FolderOpen, Calculator, ClipboardCheck,
  ChevronDown, ChevronRight, Check, Loader2, Camera, Upload, Plus,
  Trash2, ShieldCheck, AlertTriangle, Info, Sparkles, Banknote,
  FileUp, PencilLine, X, Eye, EyeOff, Search, Download, ArrowLeft,
  Calendar, CheckCircle2, AlertCircle, ArrowUpRight, HelpCircle,
  ExternalLink, Layers, RefreshCw, FileCheck, DollarSign, PieChart,
  Sliders, User, Building, GraduationCap, Heart, Shield, Smartphone
} from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { MobilePageHeader, DesktopPageHeader, DesktopPageBody } from "@/components/layout/PageHeader"
import { ModenHero, ModenHeroIconButton, heroPrimaryButtonStyle, heroQuietButtonStyle } from "@/components/ui/ModenHero"
import { cn } from "@/lib/utils"

type TabKey =
  | "dashboard"
  | "profile"
  | "ea"
  | "income"
  | "reliefs"
  | "rebates"
  | "transactions"
  | "documents"
  | "estimate"
  | "summary"

interface TabConfig {
  key: TabKey
  labelBm: string
  labelEn: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: TabConfig[] = [
  { key: "dashboard", labelBm: "Papan Pemuka", labelEn: "Dashboard", icon: LayoutDashboard },
  { key: "profile", labelBm: "Profil Cukai", labelEn: "Tax Profile", icon: UserCircle2 },
  { key: "ea", labelBm: "Borang EA / EC", labelEn: "EA / EC Forms", icon: FileText },
  { key: "income", labelBm: "Pendapatan", labelEn: "Income", icon: Briefcase },
  { key: "reliefs", labelBm: "Pelepasan", labelEn: "Reliefs", icon: Gift },
  { key: "rebates", labelBm: "Rebat & Zakat", labelEn: "Rebates & Zakat", icon: BadgePercent },
  { key: "transactions", labelBm: "Transaksi", labelEn: "Transactions", icon: Receipt },
  { key: "documents", labelBm: "Dokumen", labelEn: "Documents", icon: FolderOpen },
  { key: "estimate", labelBm: "Pengiraan", labelEn: "Estimate", icon: Calculator },
  { key: "summary", labelBm: "Ringkasan", labelEn: "Summary", icon: ClipboardCheck },
]

const YEARS = [2027, 2026, 2025, 2024]

// The readiness checks the API reports, in the reader's language, and where each is completed.
const CHECK_META: Record<string, { bm: string; en: string; tab: TabKey }> = {
  "EA reviewed": { bm: "Borang EA disemak", en: "EA form reviewed", tab: "ea" },
  "Income reviewed": { bm: "Pendapatan disahkan", en: "Income confirmed", tab: "income" },
  "Reliefs reviewed": { bm: "Pelepasan disemak", en: "Reliefs reviewed", tab: "reliefs" },
  "PCB reviewed": { bm: "PCB direkod", en: "PCB recorded", tab: "ea" },
  "Documents attached": { bm: "Dokumen dilampirkan", en: "Documents attached", tab: "documents" },
  "Tax profile complete": { bm: "Profil cukai lengkap", en: "Tax profile complete", tab: "profile" },
  "Final review complete": { bm: "Semakan akhir selesai", en: "Final review done", tab: "summary" },
}

const DISCLAIMER_BM = "MyPeribadi membantu menguruskan maklumat cukai dan menyediakan anggaran berdasarkan data yang anda masukkan serta Peraturan Cukai LHDN yang dikonfigurasi untuk tahun taksiran terpilih. Kelayakan muktamad, liabiliti cukai dan pemfailan tertakluk kepada keperluan rasmi HASiL / MyTax."
const DISCLAIMER_EN = "MyPeribadi helps organize tax information and provides estimates based on your inputs and applicable HASiL Tax Rules configured for the selected assessment year. Final eligibility, tax liability, and filing remain subject to official HASiL / MyTax requirements."

export default function TaxPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const router = useRouter()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const [year, setYear] = useState<number>(2026)
  const [tab, setTab] = useState<TabKey>("dashboard")
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ msg: string; type?: "success" | "error" | "info" } | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [calcData, setCalcData] = useState<any>(null)
  const [readinessData, setReadinessData] = useState<any>(null)

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) return { Authorization: `Bearer ${token}` }
    return {}
  }, [])

  const api = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`/api/tax${path}`, {
      headers: { ...authHeaders(), ...(options?.body ? { "Content-Type": "application/json" } : {}) },
      credentials: "include",
      ...options,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || (isBm ? "Ralat memproses permintaan" : "Error processing request"))
    }
    return res.json()
  }, [authHeaders, isBm])

  const showNotice = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setNotice({ msg, type })
    setTimeout(() => setNotice(null), 3500)
  }, [])

  const refreshGlobalMetrics = useCallback(async () => {
    try {
      const [p, c, r] = await Promise.all([
        api(`/profile?assessment_year=${year}`).catch(() => null),
        api(`/dashboard?assessment_year=${year}`).catch(() => null),
        api(`/readiness?assessment_year=${year}`).catch(() => null),
      ])
      if (p) setProfile(p)
      if (c) setCalcData(c)
      if (r) setReadinessData(r)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    setLoading(true)
    refreshGlobalMetrics()
  }, [refreshGlobalMetrics])

  const balance = calcData?.estimated_balance ?? 0
  const isPositiveRefund = balance >= 0
  const hasIncome = (calcData?.income_total ?? 0) > 0
  const score = readinessData?.score ?? 0
  const money = (n: number) => Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const refresh = () => {
    setLoading(true)
    refreshGlobalMetrics()
  }

  const activeTab = loading ? (
    <Skeleton />
  ) : (
    <ActiveTab
      tab={tab}
      setTab={setTab}
      year={year}
      tr={tr}
      api={api}
      sessionId={sessionId}
      profile={profile}
      setProfile={setProfile}
      calcData={calcData}
      readinessData={readinessData}
      refreshMetrics={refreshGlobalMetrics}
      showNotice={showNotice}
    />
  )

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader title={tr("Cukai Pendapatan", "Income Tax")} fallbackHref={`/${sessionId}`} />
      </div>
      <DesktopPageHeader className="hidden lg:block" title={tr("Cukai Pendapatan", "Income Tax")} homeHref={`/${sessionId}`} />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <Landmark size={16} />
              {tr("Cukai pendapatan", "Income tax")}
            </>
          }
          actions={
            <>
              <YearPicker year={year} onChange={setYear} />
              <ModenHeroIconButton onClick={refresh} aria-label={tr("Muat semula", "Refresh")} disabled={loading}>
                <RefreshCw size={17} className={cn(loading && "animate-spin")} />
              </ModenHeroIconButton>
            </>
          }
          currency="RM"
          amount={
            <>
              {hasIncome ? (isPositiveRefund ? "+" : "−") : ""}
              {money(hasIncome ? Math.abs(balance) : 0)}
            </>
          }
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "tax", tone: "out", icon: <Banknote size={15} strokeWidth={2.2} />, label: tr("Cukai", "Net tax"), value: `RM ${money(calcData?.net_tax ?? 0)}` },
            { key: "ready", tone: "in", icon: <ShieldCheck size={15} strokeWidth={2.2} />, label: tr("Kesediaan", "Readiness"), value: `${score}%` },
          ]}
        >
          <p className="text-[0.8125rem] font-medium leading-snug" style={{ color: "var(--hero-muted)" }}>
            {!hasIncome
              ? tr("Tambah pendapatan atau muat naik borang EA untuk mula anggaran.", "Add income or upload an EA form to start the estimate.")
              : isPositiveRefund
                ? tr("Anggaran bayaran balik daripada HASiL.", "Estimated refund from HASiL.")
                : tr("Anggaran baki cukai yang perlu dibayar.", "Estimated tax still to pay.")}
            {calcData?.residency_status === "non_resident" ? ` ${tr("Bukan pemastautin: kadar tetap 30%.", "Non-resident: flat 30%.")}` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("estimate")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98]"
              style={heroPrimaryButtonStyle}
            >
              <Calculator size={15} />
              {tr("Lihat pengiraan", "View calculation")}
            </button>
            <a
              href={`/api/tax/export?assessment_year=${year}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98]"
              style={heroQuietButtonStyle}
            >
              <Download size={15} />
              PDF
            </a>
          </div>
        </ModenHero>

        <TabBar tab={tab} setTab={setTab} tr={tr} />
        {notice && <NoticeBar notice={notice} />}

        {activeTab}

        <p className="px-1 text-xs leading-relaxed text-[var(--muted)]">{tr(DISCLAIMER_BM, DISCLAIMER_EN)}</p>
      </DesktopPageBody>
    </div>
  )
}

/* ─────────────────────────── Shared Components ─────────────────────────── */

/** A rule name is stored as "Malay / English"; show the half that matches the language. */
function localName(name: string | null | undefined, isBm: boolean): string {
  const text = name || ""
  if (text === "Zakat / Fitrah & Harta") return isBm ? "Zakat (Fitrah & Harta)" : "Zakat (Fitrah & Wealth)"
  const cut = text.lastIndexOf(" / ")
  if (cut < 0) return text
  return isBm ? text.slice(0, cut) : text.slice(cut + 3)
}

const UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024

/** Why a file cannot be uploaded, or null when it can. Checked before sending, so a
 *  wrong type or a huge file is explained at once instead of failing at the server. */
function uploadProblem(file: File, tr: (b: string, e: string) => string): string | null {
  if (file.type && !UPLOAD_TYPES.includes(file.type)) {
    return tr("Hanya PDF, JPG, PNG atau WebP diterima.", "Only PDF, JPG, PNG or WebP files are accepted.")
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return tr("Fail terlalu besar. Had 10 MB.", "The file is too large. The limit is 10 MB.")
  }
  return null
}

function YearPicker({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <label
      className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full pl-3.5 pr-2.5 text-[0.8125rem] font-semibold"
      style={heroQuietButtonStyle}
    >
      <span style={{ color: "var(--hero-muted)" }}>YA</span>
      <select
        value={year}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        aria-label="YA"
        className="cursor-pointer appearance-none bg-transparent font-bold outline-none"
        style={{ color: "var(--hero-text)" }}
      >
        {YEARS.map((y) => (
          <option key={y} value={y} className="bg-[var(--card)] text-[var(--text)]">
            {y}
          </option>
        ))}
      </select>
      <ChevronDown size={14} style={{ color: "var(--hero-muted)" }} />
    </label>
  )
}

function TabBar({ tab, setTab, tr }: { tab: TabKey; setTab: (t: TabKey) => void; tr: (b: string, e: string) => string }) {
  return (
    <div role="tablist" aria-label={tr("Bahagian cukai", "Tax sections")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const active = t.key === tab
        const Icon = t.icon
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition active:scale-95",
              active
                ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <Icon size={15} />
            <span>{tr(t.labelBm, t.labelEn)}</span>
          </button>
        )
      })}
    </div>
  )
}

function NoticeBar({ notice }: { notice: { msg: string; type?: "success" | "error" | "info" } }) {
  const isErr = notice.type === "error"
  const isInfo = notice.type === "info"
  return (
    <div className="px-1 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className={cn(
        "flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold",
        isErr
          ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : isInfo
          ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      )}>
        {isErr ? <AlertCircle size={15} className="shrink-0" /> : <CheckCircle2 size={15} className="shrink-0" />}
        <span className="flex-1">{notice.msg}</span>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3.5 px-1">
      <div className="h-32 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
      </div>
      <div className="h-44 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5", className)}>
      {children}
    </div>
  )
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pb-1 pt-2">
      <p className="text-sm font-bold text-[var(--text)]">{children}</p>
      {right}
    </div>
  )
}

function RM({ value, decimals = 2 }: { value: number | null | undefined; decimals?: number }) {
  if (value == null || isNaN(value)) return <span className="whitespace-nowrap">RM 0.00</span>
  return (
    <span className="whitespace-nowrap">
      RM {Number(value).toLocaleString("en-MY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
        {hint && <span className="truncate text-xs text-[var(--muted)]">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, placeholder, type, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean }) {
  return (
    <input
      type={type || "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="h-11 w-full rounded-full border border-[var(--input-border)] bg-[var(--input-bg)] px-4 text-base text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] disabled:opacity-60 md:text-sm"
    />
  )
}

function NumInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-4 text-sm font-semibold text-[var(--muted)]">RM</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "0.00"}
        disabled={disabled}
        className="h-11 w-full rounded-full border border-[var(--input-border)] bg-[var(--input-bg)] pl-11 pr-4 text-base font-semibold text-[var(--text)] outline-none transition focus:border-[var(--btn-primary-bg)] disabled:opacity-60 md:text-sm"
      />
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled, type, className }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  return (
    <button
      type={type || "button"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-50 hover:opacity-95",
        className
      )}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick, disabled, className }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-transparent px-5 text-sm font-semibold text-[var(--text)] transition active:scale-[0.98] hover:bg-[var(--surface-tint)] disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────── Active Tab Dispatcher ─────────────────────────── */

function ActiveTab(props: {
  tab: TabKey
  setTab: (t: TabKey) => void
  year: number
  tr: (b: string, e: string) => string
  api: (p: string, o?: RequestInit) => Promise<any>
  sessionId: string
  profile: any
  setProfile: (p: any) => void
  calcData: any
  readinessData: any
  refreshMetrics: () => Promise<void>
  showNotice: (m: string, type?: "success" | "error" | "info") => void
}) {
  switch (props.tab) {
    case "dashboard":
      return <DashboardTab {...props} />
    case "profile":
      return <ProfileTab {...props} />
    case "ea":
      return <EATab {...props} />
    case "income":
      return <IncomeTab {...props} />
    case "reliefs":
      return <ReliefsTab {...props} />
    case "rebates":
      return <RebatesTab {...props} />
    case "transactions":
      return <TxTab {...props} />
    case "documents":
      return <DocsTab {...props} />
    case "estimate":
      return <EstimateTab {...props} />
    case "summary":
      return <SummaryTab {...props} />
    default:
      return <DashboardTab {...props} />
  }
}

/* ─────────────────────────── 1. Dashboard Tab ─────────────────────────── */

function DashboardTab({ year, tr, setTab, calcData, readinessData }: any) {
  const needAttentionCount = (readinessData?.attention?.length || 0) + (readinessData?.pending_links || 0)

  return (
    <div className="space-y-4">
      {/* 4 Quick Stat KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <StatCard
          icon={Briefcase}
          label={tr("Jumlah Pendapatan", "Total Income")}
          value={calcData?.income_total}
          onClick={() => setTab("income")}
        />
        <StatCard
          icon={Gift}
          label={tr("Jumlah Pelepasan", "Total Reliefs")}
          value={calcData?.relief_total}
          onClick={() => setTab("reliefs")}
        />
        <StatCard
          icon={BadgePercent}
          label={tr("Rebat & Zakat", "Rebates & Zakat")}
          value={calcData?.rebate_total}
          onClick={() => setTab("rebates")}
        />
        <StatCard
          icon={Banknote}
          label={tr("PCB Telah Dipotong", "PCB / MTD Paid")}
          value={calcData?.pcb_total}
          onClick={() => setTab("ea")}
        />
      </div>

      {/* Tax Readiness & Checklist Card */}
      <Card className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text)]">{tr("Tahap Kesediaan e-Filing", "e-Filing Readiness Progress")}</p>
              <p className="text-xs text-[var(--muted)]">{tr("Senarai semak dokumen dan pengesahan sebelum menghantar e-Filing", "Checklist of documents and confirmations before e-Filing")}</p>
            </div>
          </div>
          <span className="text-lg font-bold text-[var(--accent)]">{readinessData?.score ?? 0}%</span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${Math.max(5, readinessData?.score ?? 0)}%` }}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          {readinessData?.checks && Object.entries(readinessData.checks).map(([key, val]) => {
            const meta = CHECK_META[key] || { bm: key, en: key, tab: "dashboard" as TabKey }
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(meta.tab)}
                className="flex min-h-12 items-center justify-between gap-3 rounded-full border border-[var(--border)] px-4 text-left text-sm font-semibold transition hover:bg-[var(--surface-tint)] active:scale-[0.99]"
              >
                <span className="min-w-0 truncate text-[var(--text)]">{tr(meta.bm, meta.en)}</span>
                {val ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Check size={13} /> {tr("Selesai", "Done")}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-amber-600 dark:text-amber-400">{tr("Lengkapkan", "Complete")} →</span>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Attention / Warnings Card */}
      {needAttentionCount > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 space-y-2.5">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={16} />
            <p className="text-xs font-bold">
              {needAttentionCount} {tr("Perkara Perlu Perhatian Anda", "Items Need Your Attention")}
            </p>
          </div>
          <div className="space-y-2">
            {(readinessData?.attention || []).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-[var(--card)] p-3 text-xs">
                <div>
                  <p className="font-bold text-[var(--text)]">{item.name}</p>
                  <p className="text-[var(--muted)]">{item.issue}</p>
                </div>
                {item.amount != null && (
                  <span className="font-bold text-[var(--text)]"><RM value={item.amount} /></span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Launchpad Action Cards */}
      <SectionLabel>{tr("Tindakan Pantas", "Quick Actions")}</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <ActionCard
          icon={FileUp}
          title={tr("Muat Naik EA", "Upload EA")}
          desc={tr("Imbas slip gaji", "Scan payslip")}
          onClick={() => setTab("ea")}
        />
        <ActionCard
          icon={Gift}
          title={tr("Tuntut Pelepasan", "Claim Reliefs")}
          desc={tr("Gaya hidup, insuran", "Lifestyle, insurance")}
          onClick={() => setTab("reliefs")}
        />
        <ActionCard
          icon={BadgePercent}
          title={tr("Rekod Zakat", "Record Zakat")}
          desc={tr("Tolak cukai terus", "Direct tax rebate")}
          onClick={() => setTab("rebates")}
        />
        <ActionCard
          icon={Download}
          title={tr("Muat Turun PDF", "Export PDF")}
          desc={tr("Simpan rekod", "Save tax pack")}
          onClick={() => window.open(`/api/tax/export?assessment_year=${year}`, "_blank")}
        />
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, onClick }: { icon: any; label: string; value: number | null | undefined; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col justify-between rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
          <Icon size={16} />
        </span>
        <ChevronRight size={15} className="text-[var(--muted)]" />
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-[var(--text)]">
          <RM value={value} />
        </p>
      </div>
    </button>
  )
}

function ActionCard({ icon: Icon, title, desc, onClick }: { icon: any; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-3.5 text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[var(--text)]">{title}</span>
        <span className="block truncate text-xs text-[var(--muted)]">{desc}</span>
      </span>
    </button>
  )
}

/* ─────────────────────────── 2. Tax Profile Tab ─────────────────────────── */

function ProfileTab({ year, tr, api, profile, setProfile, refreshMetrics, showNotice }: any) {
  const [form, setForm] = useState<any>({})
  const [tin, setTin] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) setForm({ ...profile })
  }, [profile])

  const PROFILE_FIELDS = ["residency_status", "marital_status", "income_source", "disabled_status", "spouse_income_status", "assessment_type", "zakat_tracking_enabled"]
  const dirty = !!tin.trim() || PROFILE_FIELDS.some((k) => (form[k] ?? null) !== (profile?.[k] ?? null))

  async function save() {
    setBusy(true)
    try {
      const body: any = {
        residency_status: form.residency_status,
        marital_status: form.marital_status,
        income_source: form.income_source,
        disabled_status: form.disabled_status,
        // Only a married taxpayer has a spouse; otherwise clear them, so an old answer
        // does not keep giving the spouse relief.
        spouse_income_status: form.marital_status === "married" ? form.spouse_income_status || null : null,
        assessment_type: form.marital_status === "married" ? form.assessment_type || null : null,
        zakat_tracking_enabled: form.zakat_tracking_enabled,
        tax_identifier: tin || undefined,
      }
      const updated = await api(`/profile?assessment_year=${year}`, { method: "PATCH", body: JSON.stringify(body) })
      setProfile(updated)
      setTin("")
      await refreshMetrics()
      showNotice(tr("Profil cukai berjaya disimpan!", "Tax profile successfully saved!"))
    } catch (e: any) {
      showNotice(e.message || tr("Ralat menyimpan profil", "Error saving profile"), "error")
    } finally {
      setBusy(false)
    }
  }

  const renderChips = (
    field: string,
    options: { val: any; labelBm: string; labelEn: string; descBm?: string; descEn?: string }[]
  ) => (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const isSelected = form[field] === opt.val
        return (
          <button
            key={String(opt.val)}
            type="button"
            onClick={() => setForm({ ...form, [field]: opt.val })}
            className={cn(
              "flex flex-col justify-between rounded-[1.25rem] border p-3.5 text-left transition active:scale-[0.98]",
              isSelected
                ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                : "border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--surface-tint)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{tr(opt.labelBm, opt.labelEn)}</span>
              {isSelected ? <Check size={14} /> : <div className="h-3.5 w-3.5 rounded-full border border-[var(--muted)]/40" />}
            </div>
            {(opt.descBm || opt.descEn) && (
              <span className={cn("mt-1 text-xs", isSelected ? "opacity-90 text-[var(--btn-primary-text)]" : "text-[var(--muted)]")}>
                {tr(opt.descBm || "", opt.descEn || "")}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
          <Info size={16} />
        </span>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {tr(
            "Profil ini menentukan pelepasan yang dikira secara automatik: RM9,000 untuk diri sendiri, tambahan OKU, pelepasan pasangan RM4,000 jika pasangan tiada pendapatan, dan anak daripada senarai tanggungan. Anda tidak perlu menuntutnya lagi di tab Pelepasan.",
            "This profile decides the reliefs counted automatically: RM9,000 for yourself, the disabled-individual extra, the RM4,000 spouse relief when your spouse has no income, and your children from the dependants list. You do not claim them again in the Reliefs tab."
          )}
        </p>
      </Card>

      {form.residency_status === "non_resident" && (
        <Card className="flex items-start gap-3 border-amber-500/40">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm leading-relaxed text-[var(--text)]">
            {tr(
              "Bukan pemastautin dikenakan cukai kadar tetap 30% atas semua pendapatan, tanpa pelepasan dan rebat. Status pemastautin bergantung pada tempoh anda berada di Malaysia (biasanya 182 hari atau lebih dalam setahun).",
              "A non-resident pays a flat 30% on all income, with no reliefs or rebates. Residency depends on how long you are in Malaysia (usually 182 days or more in a year)."
            )}
          </p>
        </Card>
      )}

      {/* General Status */}
      <SectionLabel>{tr("Status Pemastautin & Peribadi", "Tax Residency & Personal Status")}</SectionLabel>
      <Card className="space-y-4">
        <Field label={tr("Status Pemastautin Cukai", "Tax Residency Status")}>
          {renderChips("residency_status", [
            { val: "resident", labelBm: "Pemastautin (Resident)", labelEn: "Resident", descBm: "Layak untuk semua pelepasan cukai HASiL", descEn: "Eligible for full HASiL tax reliefs" },
            { val: "non_resident", labelBm: "Bukan Pemastautin (Non-Resident)", labelEn: "Non-Resident", descBm: "Kadar cukai tetap 30%, tiada pelepasan", descEn: "Flat 30% tax rate, no personal reliefs" },
          ])}
        </Field>

        <Field label={tr("Status Perkahwinan", "Marital Status")}>
          {renderChips("marital_status", [
            { val: "single", labelBm: "Bujang", labelEn: "Single" },
            { val: "married", labelBm: "Berkahwin", labelEn: "Married" },
            { val: "divorced", labelBm: "Bercerai", labelEn: "Divorced" },
            { val: "widowed", labelBm: "Balu / Duda", labelEn: "Widowed" },
          ])}
        </Field>

        <Field label={tr("Sumber Utama Pendapatan", "Primary Income Source")}>
          {renderChips("income_source", [
            { val: "employment", labelBm: "Pekerjaan Sahaja (Borang BE)", labelEn: "Employment Only (Form BE)" },
            { val: "business", labelBm: "Perniagaan Sahaja (Borang B)", labelEn: "Business Only (Form B)" },
            { val: "both", labelBm: "Pekerjaan + Perniagaan", labelEn: "Both Employment & Business" },
          ])}
        </Field>

        <Field label={tr("Status Orang Kurang Upaya (OKU)", "Disabled Status (OKU)")}>
          {renderChips("disabled_status", [
            { val: false, labelBm: "Bukan OKU", labelEn: "Not Disabled" },
            { val: true, labelBm: "Individu OKU (Pelepasan Tambahan RM6,000)", labelEn: "Disabled (Extra RM6,000 Relief)" },
          ])}
        </Field>
      </Card>

      {/* Spouse Section (If Married) */}
      {form.marital_status === "married" && (
        <>
          <SectionLabel>{tr("Maklumat Pasangan (Suami / Isteri)", "Spouse Information")}</SectionLabel>
          <Card className="space-y-4">
            <Field label={tr("Status Pendapatan Pasangan", "Spouse Income Status")}>
              {renderChips("spouse_income_status", [
                { val: "has_income", labelBm: "Pasangan Mempunyai Pendapatan", labelEn: "Spouse Has Income" },
                { val: "no_income", labelBm: "Pasangan Tiada Pendapatan (Pelepasan RM4,000)", labelEn: "Spouse No Income (RM4,000 Relief)" },
              ])}
            </Field>

            <Field label={tr("Jenis Taksiran Bersama / Berasingan", "Assessment Type")}>
              {renderChips("assessment_type", [
                { val: "separate", labelBm: "Taksiran Berasingan (Disyorkan)", labelEn: "Separate Assessment (Recommended)" },
                { val: "joint", labelBm: "Taksiran Bersama", labelEn: "Joint Assessment" },
              ])}
            </Field>
          </Card>
        </>
      )}

      {/* Dependants Section */}
      <DependantsSection year={year} tr={tr} api={api} showNotice={showNotice} refreshMetrics={refreshMetrics} />

      {/* Zakat Tracking Option */}
      <SectionLabel>{tr("Tetapan Zakat & Rebat", "Zakat & Rebate Settings")}</SectionLabel>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--text)]">{tr("Jejak Zakat untuk Rebat Cukai", "Track Zakat for Tax Rebates")}</p>
            <p className="text-xs text-[var(--muted)]">
              {tr("Zakat ditolak terus daripada jumlah cukai sebenar (1:1), bukan sekadar mengurangkan pendapatan bercukai.", "Zakat is deducted directly from actual tax liability (1:1), not just chargeable income.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, zakat_tracking_enabled: !form.zakat_tracking_enabled })}
            className={cn("h-7 w-12 shrink-0 rounded-full p-1 transition-all cursor-pointer", form.zakat_tracking_enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-tint-strong)]")}
          >
            <div className={cn("h-5 w-5 rounded-full bg-white transition-all", form.zakat_tracking_enabled && "translate-x-5")} />
          </button>
        </div>
      </Card>

      {/* Tax Identification Number (TIN) */}
      <SectionLabel>{tr("Nombor Pengenalan Cukai (TIN)", "Tax Identification Number (TIN)")}</SectionLabel>
      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
          <p>{tr("Nombor fail cukai HASiL anda disulitkan secara selamat.", "Your HASiL tax file number is securely encrypted.")}</p>
        </div>
        {profile?.tax_identifier_masked && (
          <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-tint)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)]">
            <span className="text-[var(--muted)]">{tr("TIN Semasa", "Current TIN")}:</span>
            <span className="font-mono text-sm">{profile.tax_identifier_masked}</span>
          </div>
        )}
        <TextInput
          value={tin}
          onChange={setTin}
          placeholder={profile?.tax_identifier_masked ? tr("Masukkan TIN baru jika ingin tukar", "Enter new TIN to update") : tr("Contoh No Cukai LHDN: IG 12345678090 atau OG 98765432010", "e.g. LHDN Tax No: IG 12345678090 or OG 98765432010")}
        />
      </Card>

      {/* Save Button */}
      <PrimaryButton onClick={save} disabled={busy || !dirty}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        <span>{dirty ? tr("Simpan Profil Cukai", "Save Tax Profile") : tr("Tiada perubahan", "No changes")}</span>
      </PrimaryButton>
    </div>
  )
}

function DependantsSection({ year, tr, api, showNotice, refreshMetrics }: any) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<any>({ dependant_type: "under18", relief_percentage: 100 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api(`/dependants?assessment_year=${year}`))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    load()
  }, [load])

  const LABELS: Record<string, { labelBm: string; labelEn: string; reliefRM: string }> = {
    under18: { labelBm: "Anak Bawah 18 Tahun", labelEn: "Child Under 18", reliefRM: "RM 2,000" },
    preuniversity18plus: { labelBm: "Anak 18+ (A-Level / Pra-U)", labelEn: "Child 18+ (A-Level / Pre-University)", reliefRM: "RM 2,000" },
    education18plus: { labelBm: "Anak 18+ (Diploma ke Atas)", labelEn: "Child 18+ (Diploma and Above)", reliefRM: "RM 8,000" },
    disabled_child: { labelBm: "Anak Kurang Upaya (OKU)", labelEn: "Disabled Child (OKU)", reliefRM: "RM 6,000" },
    disabled_education: { labelBm: "Anak OKU (Diploma ke Atas)", labelEn: "Disabled Child (Diploma and Above)", reliefRM: "RM 14,000" },
  }

  async function add() {
    try {
      await api(`/dependants?assessment_year=${year}`, {
        method: "POST",
        body: JSON.stringify({
          assessment_year: year,
          dependant_type: draft.dependant_type,
          relief_percentage: draft.relief_percentage,
        }),
      })
      setShowAdd(false)
      setDraft({ dependant_type: "under18", relief_percentage: 100 })
      await load()
      await refreshMetrics()
      showNotice(tr("Tanggungan anak berjaya ditambah!", "Child dependant successfully added!"))
    } catch (e: any) {
      showNotice(e.message || tr("Ralat menambah tanggungan", "Error adding dependant"), "error")
    }
  }

  async function remove(id: number) {
    if (!window.confirm(tr("Padam tanggungan ini? Pelepasannya tidak lagi dikira.", "Delete this dependant? Its relief will no longer count."))) return
    try {
      await api(`/dependants/${id}`, { method: "DELETE" })
      await load()
      await refreshMetrics()
      showNotice(tr("Tanggungan dipadam", "Dependant deleted"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  return (
    <>
      <SectionLabel
        right={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-3 py-1 text-xs font-bold text-[var(--btn-primary-text)] hover:opacity-90 transition active:scale-95 cursor-pointer"
          >
            <Plus size={13} />
            <span>{tr("Tambah Anak", "Add Child")}</span>
          </button>
        }
      >
        {tr("Tanggungan / Anak", "Dependants / Children")}
      </SectionLabel>

      {loading ? (
        <div className="h-20 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
      ) : rows.length === 0 ? (
        <Card className="text-center py-6 space-y-1">
          <p className="text-sm font-bold text-[var(--text)]">{tr("Tiada Rekod Tanggungan Anak", "No Child Dependants")}</p>
          <p className="text-xs text-[var(--muted)]">{tr("Tambah maklumat anak untuk menuntut pelepasan anak secara automatik.", "Add children to claim child tax reliefs automatically.")}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => {
            const info = LABELS[d.dependant_type] || { labelBm: d.dependant_type, labelEn: d.dependant_type, reliefRM: "—" }
            return (
              <Card key={d.id} className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
                    <Heart size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text)]">{tr(info.labelBm, info.labelEn)}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {tr("Tuntutan", "Claim")}: <span className="font-bold text-[var(--text)]">{d.relief_percentage}%</span> ({info.reliefRM})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-2xl text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                  title={tr("Padam", "Delete")}
                >
                  <Trash2 size={15} />
                </button>
              </Card>
            )
          })}
        </div>
      )}

      {showAdd && (
        <Card className="space-y-3 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--text)]">{tr("Tambah Tanggungan Anak", "Add Child Dependant")}</p>
            <button type="button" onClick={() => setShowAdd(false)} className="text-[var(--muted)] cursor-pointer">
              <X size={16} />
            </button>
          </div>

          <Field label={tr("Kategori Tanggungan", "Dependant Category")}>
            <select
              value={draft.dependant_type}
              onChange={(e) => setDraft({ ...draft, dependant_type: e.target.value })}
              className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] outline-none cursor-pointer"
            >
              {Object.entries(LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {tr(v.labelBm, v.labelEn)} ({v.reliefRM})
                </option>
              ))}
            </select>
          </Field>

          <Field label={tr("Peratusan Tuntutan (100% atau 50% kongsi bersama pasangan)", "Claim Share")}>
            <div className="flex gap-2">
              {[100, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDraft({ ...draft, relief_percentage: pct })}
                  className={cn(
                    "flex-1 rounded-2xl border py-2.5 text-xs font-bold transition cursor-pointer",
                    draft.relief_percentage === pct
                      ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                      : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]"
                  )}
                >
                  {pct}% {pct === 100 ? tr("(Penuh)", "(100% Full)") : tr("(50% Kongsi)", "(50% Shared)")}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex gap-2 pt-1">
            <GhostButton onClick={() => setShowAdd(false)} className="py-2.5">{tr("Batal", "Cancel")}</GhostButton>
            <PrimaryButton onClick={add} className="py-2.5">{tr("Simpan", "Save")}</PrimaryButton>
          </div>
        </Card>
      )}
    </>
  )
}

/* ─────────────────────────── 3. EA / EC Form Tab ─────────────────────────── */

function EATab({ year, tr, api, refreshMetrics, showNotice }: any) {
  const [forms, setForms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [stage, setStage] = useState("")
  const [reviewing, setReviewing] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setForms(await api(`/ea-forms?assessment_year=${year}`))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    load()
  }, [load])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    // Clear the input so choosing the same file again still fires a change.
    input.value = ""
    if (!file) return
    const problem = uploadProblem(file, tr)
    if (problem) {
      showNotice(problem, "error")
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("assessment_year", String(year))
    setUploading(true)
    setStage(tr("Memuat naik fail…", "Uploading file…"))

    try {
      const token = getAccessToken()
      const headers: Record<string, string> = {}
      if (token && !isCookieAuthSentinel(token)) headers["Authorization"] = `Bearer ${token}`

      setStage(tr("Membaca data EA dengan AI…", "Parsing EA Form data with AI…"))
      const res = await fetch(`/api/tax/ea-forms/upload?assessment_year=${year}`, {
        method: "POST",
        headers,
        credentials: "include",
        body: fd,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || tr("Gagal memproses fail EA", "Failed to process EA file"))
      }

      const parsed = await res.json()
      setStage(tr("Sedia untuk semakan", "Ready for review"))
      await load()
      await refreshMetrics()
      setReviewing(parsed)
      showNotice(tr("Borang EA berjaya dimuat naik & diimbas!", "EA Form uploaded and parsed!"))
    } catch (err: any) {
      showNotice(err.message || tr("Ralat muat naik fail", "Upload error"), "error")
    } finally {
      setUploading(false)
      setStage("")
    }
  }

  async function confirmForm(id: number) {
    try {
      await api(`/ea-forms/${id}/confirm`, { method: "POST" })
      setReviewing(null)
      await load()
      await refreshMetrics()
      showNotice(tr("Borang EA telah disahkan!", "EA form confirmed!"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  async function removeForm(f: any) {
    if (!window.confirm(tr("Padam borang EA ini? Pendapatan, PCB dan zakat daripadanya turut dibuang.", "Delete this EA form? The income, PCB and zakat from it are removed too."))) return
    try {
      await api(`/ea-forms/${f.id}`, { method: "DELETE" })
      await load()
      await refreshMetrics()
      showNotice(tr("Borang EA dipadam", "EA form deleted"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  const totalIncome = forms.reduce((acc, f) => acc + (f.total_employment_income || 0), 0)

  return (
    <div className="space-y-4">
      {/* Upload Zone Card */}
      <Card className="border border-dashed border-[var(--accent)]/30 text-center p-6 space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-[var(--accent)]/15 text-[var(--accent)]">
          <FileUp size={26} />
        </div>
        <div>
          <h3 className="text-base font-bold text-[var(--text)]">
            {tr("Muat Naik Penyata Pendapatan (Borang EA / EC)", "Upload EA / EC Remuneration Statement")}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)] max-w-md mx-auto">
            {tr("Muat naik penyata tahunan majikan anda (PDF, JPG, PNG). Sistem akan mengimbas gaji, bonus, elaun, PCB, KWSP, SOCSO dan Zakat secara automatik.", "Upload your annual EA Form. The system automatically extracts salary, bonus, PCB, EPF, SOCSO, and Zakat.")}
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-5 py-3 text-xs font-bold text-[var(--btn-primary-text)] hover:opacity-95 transition active:scale-95">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span>{stage || (uploading ? tr("Memproses Dokumen…", "Processing Document…") : tr("Pilih Fail EA / Ambil Gambar", "Select EA File / Take Photo"))}</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFile}
            disabled={uploading}
          />
        </label>
      </Card>

      {/* Review Modal / Bottom Sheet */}
      {reviewing && (
        <ReviewEAModal
          form={reviewing}
          onConfirm={() => confirmForm(reviewing.id)}
          onClose={() => setReviewing(null)}
          api={api}
          tr={tr}
          year={year}
          showNotice={showNotice}
          onSaved={(saved: any) => {
            setReviewing(null)
            load()
            refreshMetrics()
          }}
        />
      )}

      {/* List of EA Forms */}
      <SectionLabel>{tr("Senarai Borang EA / EC", "EA / EC Forms List")}</SectionLabel>

      {loading ? (
        <Skeleton />
      ) : forms.length === 0 ? (
        <Card className="text-center py-8 space-y-1">
          <p className="text-sm font-bold text-[var(--text)]">{tr("Belum ada Borang EA / EC untuk YA", "No EA / EC Forms for YA")} {year}</p>
          <p className="text-xs text-[var(--muted)]">{tr("Muat naik borang EA majikan untuk mengisi pendapatan pekerjaan secara automatik.", "Upload your EA form to populate employment income automatically.")}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((f) => (
            <Card key={f.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--accent)]">
                    <Building size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text)]">{f.employer_name || tr("Majikan Tidak Dinyatakan", "Unnamed Employer")}</h4>
                    <p className="text-xs text-[var(--muted)]">YA {f.assessment_year} · {f.review_status === "confirmed" ? tr("Disahkan", "Confirmed") : tr("Perlu Disemak", "Pending Review")}</p>
                  </div>
                </div>

                {f.review_status === "confirmed" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Check size={12} /> {tr("Disahkan", "Confirmed")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReviewing(f)}
                    className="rounded-full bg-[var(--btn-primary-bg)] px-3 py-1 text-xs font-bold text-[var(--btn-primary-text)] hover:opacity-90 cursor-pointer"
                  >
                    {tr("Semak Data", "Review")}
                  </button>
                )}
              </div>

              {/* Breakdown Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border)] text-xs">
                <div className="rounded-2xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-xs text-[var(--muted)] block font-bold">{tr("Pendapatan Kasar", "Gross Income")}</span>
                  <span className="font-bold text-[var(--text)]"><RM value={f.total_employment_income} /></span>
                </div>
                <div className="rounded-2xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-xs text-[var(--muted)] block font-bold">PCB (MTD)</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400"><RM value={f.pcb_amount} /></span>
                </div>
                <div className="rounded-2xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-xs text-[var(--muted)] block font-bold">KWSP (EPF)</span>
                  <span className="font-bold text-[var(--text)]"><RM value={f.epf_amount} /></span>
                </div>
                <div className="rounded-2xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-xs text-[var(--muted)] block font-bold">SOCSO / PERKESO</span>
                  <span className="font-bold text-[var(--text)]"><RM value={f.socso_amount} /></span>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => setReviewing({ ...f, editing: true })}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)] hover:underline"
                >
                  <PencilLine size={14} />
                  <span>{tr("Sunting nilai", "Edit values")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void removeForm(f)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-rose-500 hover:underline"
                >
                  <Trash2 size={14} />
                  <span>{tr("Padam", "Delete")}</span>
                </button>
              </div>
            </Card>
          ))}

          {forms.length > 1 && (
            <Card className="flex items-center justify-between bg-[var(--surface-tint)] p-4">
              <span className="text-xs font-bold text-[var(--muted)]">{tr("Jumlah Keseluruhan Pendapatan Majikan", "Total All Employers")}</span>
              <span className="text-base font-bold text-[var(--text)]"><RM value={totalIncome} /></span>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function ReviewEAModal({ form, onConfirm, onClose, api, tr, year, showNotice, onSaved }: any) {
  const [f, setF] = useState<any>({ ...form })
  const [editing, setEditing] = useState<boolean>(!!form.editing)
  const [busy, setBusy] = useState(false)

  const conf = Math.round((form.confidence || 0.85) * 100)

  const PARTS = ["salary", "bonus", "allowances"]

  function setNum(key: string, val: string) {
    const n = val === "" ? null : Number(val)
    if (n !== null && (isNaN(n) || n < 0)) return
    const next: any = { ...f, [key]: n }
    if (PARTS.includes(key)) {
      // The gross total moves with the part that changed, so the two never disagree.
      next.total_employment_income = Math.round(((Number(f.total_employment_income) || 0) - (Number(f[key]) || 0) + (n || 0)) * 100) / 100
    }
    setF(next)
  }

  async function save() {
    setBusy(true)
    try {
      const body: any = { ...f, editing: undefined }
      const saved = await api(`/ea-forms/${f.id}`, { method: "PATCH", body: JSON.stringify(body) })
      onSaved(saved)
      showNotice(tr("Borang EA dikemas kini & pendapatan diselaraskan!", "EA Form updated & income synced!"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 md:items-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-[2rem] border border-[var(--border)] bg-[var(--bg)] p-5 md:rounded-[2rem] md:p-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {tr("Borang EA Dikesan", "EA Form Detected")}
            </span>
            <span className="text-xs font-bold text-[var(--muted)]">{tr("Ketepatan AI", "AI Confidence")}: {conf}%</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-[var(--surface-tint)] p-2 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Form Details */}
        <div className="space-y-3 divide-y divide-[var(--border)]">
          <div className="space-y-2 pt-1">
            <Field label={tr("Nama Majikan", "Employer Name")}>
              {editing ? (
                <TextInput value={f.employer_name || ""} onChange={(v) => setF({ ...f, employer_name: v })} />
              ) : (
                <p className="text-sm font-bold text-[var(--text)]">{f.employer_name || "—"}</p>
              )}
            </Field>
          </div>

          <div className="space-y-2.5 pt-3">
            <p className="text-xs font-bold text-[var(--muted)]">{tr("Pecahan Pendapatan Kasar", "Employment Remuneration")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label={tr("Gaji Pokok", "Salary")}>
                {editing ? <NumInput value={f.salary ?? ""} onChange={(v) => setNum("salary", v)} /> : <p className="text-xs font-bold text-[var(--text)]"><RM value={f.salary} /></p>}
              </Field>
              <Field label={tr("Bonus", "Bonus")}>
                {editing ? <NumInput value={f.bonus ?? ""} onChange={(v) => setNum("bonus", v)} /> : <p className="text-xs font-bold text-[var(--text)]"><RM value={f.bonus} /></p>}
              </Field>
              <Field label={tr("Elaun", "Allowances")}>
                {editing ? <NumInput value={f.allowances ?? ""} onChange={(v) => setNum("allowances", v)} /> : <p className="text-xs font-bold text-[var(--text)]"><RM value={f.allowances} /></p>}
              </Field>
              <Field label={tr("Jumlah Kasar", "Total Gross")}>
                {editing ? <NumInput value={f.total_employment_income ?? ""} onChange={(v) => setNum("total_employment_income", v)} /> : <p className="text-sm font-bold text-[var(--text)]"><RM value={f.total_employment_income} /></p>}
              </Field>
            </div>
          </div>

          <div className="space-y-2.5 pt-3">
            <p className="text-xs font-bold text-[var(--muted)]">{tr("Potongan & Caruman", "Deductions & Contributions")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="PCB / MTD">
                {editing ? <NumInput value={f.pcb_amount ?? ""} onChange={(v) => setNum("pcb_amount", v)} /> : <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400"><RM value={f.pcb_amount} /></p>}
              </Field>
              <Field label="KWSP / EPF">
                {editing ? <NumInput value={f.epf_amount ?? ""} onChange={(v) => setNum("epf_amount", v)} /> : <p className="text-xs font-bold text-[var(--text)]"><RM value={f.epf_amount} /></p>}
              </Field>
              <Field label="SOCSO / PERKESO">
                {editing ? <NumInput value={f.socso_amount ?? ""} onChange={(v) => setNum("socso_amount", v)} /> : <p className="text-xs font-bold text-[var(--text)]"><RM value={f.socso_amount} /></p>}
              </Field>
              <Field label="Zakat (Melalui Gaji)">
                {editing ? <NumInput value={f.zakat_amount ?? ""} onChange={(v) => setNum("zakat_amount", v)} /> : <p className="text-xs font-bold text-[var(--text)]"><RM value={f.zakat_amount} /></p>}
              </Field>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex gap-2 pt-2">
          {editing ? (
            <>
              <GhostButton onClick={() => { setF({ ...form }); setEditing(false) }}>{tr("Batal Edit", "Cancel")}</GhostButton>
              <PrimaryButton onClick={save} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                <span>{tr("Simpan Perubahan", "Save Changes")}</span>
              </PrimaryButton>
            </>
          ) : (
            <>
              <GhostButton onClick={() => setEditing(true)}>{tr("Sunting", "Edit")}</GhostButton>
              <PrimaryButton onClick={onConfirm}>
                <Check size={16} />
                <span>{tr("Sahkan Borang EA", "Confirm EA Form")}</span>
              </PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── 4. Income Tab ─────────────────────────── */

function IncomeTab({ year, tr, api, refreshMetrics, showNotice }: any) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<any>({
    gross_amount: "",
    taxable_amount: "",
    income_type: "employment",
    employer_name: "",
    business_name: "",
    business_expenses: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api(`/income?assessment_year=${year}`))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    load()
  }, [load])

  async function add() {
    const gross = Number(draft.gross_amount)
    const expenses = draft.income_type === "business" && draft.business_expenses ? Number(draft.business_expenses) : 0
    if (!gross || gross <= 0) {
      showNotice(tr("Masukkan pendapatan kasar yang lebih daripada sifar.", "Enter a gross income above zero."), "error")
      return
    }
    if (expenses < 0 || expenses > gross) {
      showNotice(tr("Perbelanjaan tidak boleh lebih daripada pendapatan kasar.", "Expenses cannot be more than the gross income."), "error")
      return
    }
    try {
      await api("/income", {
        method: "POST",
        body: JSON.stringify({
          assessment_year: year,
          income_type: draft.income_type,
          source_type: "manual",
          employer_name: draft.income_type === "employment" ? draft.employer_name || undefined : undefined,
          gross_amount: gross,
          // A business is taxed on what is left after its allowable expenses.
          taxable_amount: Math.round((gross - expenses) * 100) / 100,
          business_name: draft.income_type === "business" ? draft.business_name || undefined : undefined,
          business_expenses: draft.income_type === "business" && draft.business_expenses ? expenses : null,
          status: "confirmed",
        }),
      })
      setShowAdd(false)
      setDraft({ gross_amount: "", taxable_amount: "", income_type: "employment", employer_name: "", business_name: "", business_expenses: "" })
      await load()
      await refreshMetrics()
      showNotice(tr("Rekod pendapatan berjaya ditambah!", "Income record added!"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  async function remove(r: any) {
    if (!window.confirm(tr("Padam rekod pendapatan ini?", "Delete this income record?"))) return
    try {
      await api(`/income/${r.id}`, { method: "DELETE" })
      await load()
      await refreshMetrics()
      showNotice(tr("Rekod pendapatan dipadam", "Income record deleted"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  return (
    <div className="space-y-4">
      <SectionLabel
        right={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-4 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-95"
          >
            <Plus size={13} />
            <span className="whitespace-nowrap">{tr("Tambah", "Add")}</span>
          </button>
        }
      >
        {tr("Pendapatan", "Income")}
      </SectionLabel>

      {loading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Card className="text-center py-8 space-y-1">
          <p className="text-sm font-bold text-[var(--text)]">{tr("Tiada Rekod Pendapatan", "No Income Records")}</p>
          <p className="text-xs text-[var(--muted)]">{tr("Tambah pendapatan pekerjaan atau perniagaan untuk mengira cukai anda.", "Add employment or business income to calculate tax.")}</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-2xl",
                  r.income_type === "business" ? "bg-amber-500/15 text-amber-600" : "bg-sky-500/15 text-sky-600"
                )}>
                  {r.income_type === "business" ? <Briefcase size={18} /> : <Building size={18} />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">
                    {r.income_type === "business" ? r.business_name || tr("Perniagaan", "Business") : r.employer_name || tr("Pekerjaan", "Employment")}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-xs font-bold text-[var(--muted)]">
                      {r.source_type === "ea" ? tr("Daripada borang EA", "From the EA form") : tr("Kemasukan manual", "Manual entry")}
                    </span>
                    {r.business_expenses != null && (
                      <span className="text-xs text-[var(--muted)]">
                        {tr("Perbelanjaan", "Expenses")}: <RM value={r.business_expenses} />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-base font-bold tabular-nums text-[var(--text)]"><RM value={r.gross_amount} /></p>
                  <p className="text-xs font-semibold text-[var(--muted)]">{tr("Bercukai", "Taxable")}: <RM value={r.taxable_amount ?? r.gross_amount} /></p>
                </div>
                {r.source_type === "ea" ? null : (
                  <button
                    type="button"
                    onClick={() => void remove(r)}
                    aria-label={tr("Padam", "Delete")}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-500/10"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <Card className="space-y-3.5 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[var(--text)]">{tr("Tambah Rekod Pendapatan", "Add Income Record")}</h4>
            <button type="button" onClick={() => setShowAdd(false)} className="text-[var(--muted)] cursor-pointer">
              <X size={16} />
            </button>
          </div>

          <Field label={tr("Jenis Pendapatan", "Income Type")}>
            <div className="flex gap-2">
              {["employment", "business"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDraft({ ...draft, income_type: t })}
                  className={cn(
                    "flex-1 rounded-2xl border py-2 text-xs font-bold transition cursor-pointer",
                    draft.income_type === t
                      ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                      : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]"
                  )}
                >
                  {t === "employment" ? tr("Pekerjaan (Gaji)", "Employment (Salary)") : tr("Perniagaan / Bebas", "Business / Freelance")}
                </button>
              ))}
            </div>
          </Field>

          {draft.income_type === "employment" ? (
            <Field label={tr("Nama Majikan", "Employer Name")}>
              <TextInput value={draft.employer_name} onChange={(v) => setDraft({ ...draft, employer_name: v })} placeholder="Contoh: Digital Port Sdn Bhd" />
            </Field>
          ) : (
            <Field label={tr("Nama Perniagaan / Entiti", "Business Name")}>
              <TextInput value={draft.business_name} onChange={(v) => setDraft({ ...draft, business_name: v })} placeholder="Contoh: My Business Enterprise" />
            </Field>
          )}

          <Field label={tr("Pendapatan Kasar Tahunan (RM)", "Gross Annual Income (RM)")}>
            <NumInput value={draft.gross_amount} onChange={(v) => setDraft({ ...draft, gross_amount: v })} />
          </Field>

          {draft.income_type === "business" && (
            <Field label={tr("Perbelanjaan Dibenarkan (RM)", "Allowable Business Expenses (RM)")} hint={tr("Ditolak sebelum cukai", "Deducted before tax")}>
              <NumInput value={draft.business_expenses} onChange={(v) => setDraft({ ...draft, business_expenses: v })} placeholder="0.00" />
            </Field>
          )}

          <div className="flex gap-2 pt-2">
            <GhostButton onClick={() => setShowAdd(false)} className="py-2.5">{tr("Batal", "Cancel")}</GhostButton>
            <PrimaryButton onClick={add} className="py-2.5">{tr("Simpan Rekod", "Save Record")}</PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ─────────────────────────── 5. Reliefs Tab ─────────────────────────── */

function ReliefsTab({ year, tr, api, refreshMetrics, showNotice }: any) {
  const [reliefs, setReliefs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReliefs(await api(`/reliefs?assessment_year=${year}`))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    load()
  }, [load])

  // What the box shows: what the user is typing, else what is claimed now.
  const draftOf = (r: any) => drafts[r.relief_code] ?? (r.claimed_amount ? String(r.claimed_amount) : "")

  async function saveRelief(r: any, amount?: number) {
    const val = amount ?? Number(draftOf(r) || 0)
    if (isNaN(val) || val < 0) {
      showNotice(tr("Masukkan jumlah yang sah.", "Enter a valid amount."), "error")
      return
    }
    setSaving(r.relief_code)
    try {
      await api("/reliefs", {
        method: "POST",
        body: JSON.stringify({ assessment_year: year, relief_code: r.relief_code, claimed_amount: val }),
      })
      setDrafts((d) => {
        const next = { ...d }
        delete next[r.relief_code]
        return next
      })
      await load()
      await refreshMetrics()
      showNotice(val > 0 ? tr("Pelepasan dikemas kini", "Relief updated") : tr("Tuntutan dibuang", "Claim removed"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    } finally {
      setSaving(null)
    }
  }

  const groupLabels: Record<string, { nameBm: string; nameEn: string; icon: any }> = {
    personal: { nameBm: "Diri sendiri", nameEn: "Yourself", icon: User },
    family: { nameBm: "Pasangan & keluarga", nameEn: "Spouse & family", icon: Heart },
    children: { nameBm: "Anak", nameEn: "Children", icon: Heart },
    parents: { nameBm: "Ibu bapa", nameEn: "Parents", icon: UserCircle2 },
    medical: { nameBm: "Perubatan", nameEn: "Medical", icon: Heart },
    epf_insurance: { nameBm: "KWSP, insurans & persaraan", nameEn: "EPF, insurance & retirement", icon: Shield },
    education: { nameBm: "Pendidikan", nameEn: "Education", icon: GraduationCap },
    lifestyle: { nameBm: "Gaya hidup", nameEn: "Lifestyle", icon: Smartphone },
    other: { nameBm: "Lain-lain", nameEn: "Other", icon: Gift },
  }
  const GROUP_ORDER = ["personal", "family", "children", "parents", "medical", "epf_insurance", "education", "lifestyle", "other"]

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return reliefs
    const q = searchQuery.toLowerCase()
    return reliefs.filter((r) => r.name?.toLowerCase().includes(q) || r.relief_code?.toLowerCase().includes(q))
  }, [reliefs, searchQuery])

  const grouped: Record<string, any[]> = {}
  filtered.forEach((r) => {
    const g = groupLabels[r.group] ? r.group : "other"
    ;(grouped[g] = grouped[g] || []).push(r)
  })
  const orderedGroups = GROUP_ORDER.filter((g) => grouped[g])

  const totalApplied = reliefs.reduce((acc, r) => acc + (r.applied_amount || 0), 0)

  return (
    <div className="space-y-4">
      <Card className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">{tr("Jumlah pelepasan yang dikira", "Total reliefs counted")}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-[var(--text)]"><RM value={totalApplied} /></p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {tr("Mengurangkan pendapatan bercukai, setiap satu dihadkan kepada had LHDN.", "Reduces your chargeable income, each capped at its HASiL limit.")}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-4 top-3.5 text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr("Cari pelepasan…", "Search reliefs…")}
            className="h-11 w-full rounded-full border border-[var(--border)] bg-transparent pl-11 pr-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)] md:text-sm"
          />
        </div>
      </Card>

      {loading ? (
        <Skeleton />
      ) : orderedGroups.length === 0 ? (
        <Card className="py-8 text-center text-sm text-[var(--muted)]">{tr("Tiada pelepasan dijumpai.", "No reliefs found.")}</Card>
      ) : (
        orderedGroups.map((groupKey) => {
          const list = grouped[groupKey]
          const gInfo = groupLabels[groupKey]
          const GroupIcon = gInfo.icon
          return (
            <div key={groupKey} className="space-y-2">
              <div className="flex items-center gap-2 px-1 pt-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
                  <GroupIcon size={14} />
                </span>
                <h4 className="text-sm font-bold text-[var(--text)]">{tr(gInfo.nameBm, gInfo.nameEn)}</h4>
              </div>

              <Card className="divide-y divide-[var(--border)] p-0 md:p-0">
                {list.map((r) => {
                  const applied = r.applied_amount || 0
                  const limit = r.max_limit
                  const pct = limit ? Math.min(100, (applied / limit) * 100) : applied > 0 ? 100 : 0
                  const isMaxed = !!limit && applied >= limit
                  const isExp = expanded === r.relief_code
                  const overLimit = !!limit && Number(draftOf(r) || 0) > limit
                  const fromEa = r.applied_source === "ea"
                  return (
                    <div key={r.relief_code} className="px-4 py-3 md:px-5">
                      <button
                        type="button"
                        onClick={() => !r.auto && setExpanded(isExp ? null : r.relief_code)}
                        className={cn("flex w-full items-center justify-between gap-3 text-left", r.auto && "cursor-default")}
                        aria-expanded={r.auto ? undefined : isExp}
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-[var(--text)]">{localName(r.name, tr("1", "0") === "1")}</span>
                            {r.auto && (
                              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">{tr("Automatik", "Automatic")}</span>
                            )}
                            {fromEa && !r.auto && (
                              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">{tr("Daripada EA", "From EA")}</span>
                            )}
                            {isMaxed && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">MAX</span>}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--muted)]">
                            {tr("Had", "Limit")}: {limit ? `RM ${Number(limit).toLocaleString("en-MY")}` : tr("Tiada had", "No limit")}
                            {r.shared ? ` · ${tr("kongsi had RM10,000", "shares the RM10,000 limit")}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={cn("text-sm font-bold tabular-nums", applied > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]")}>
                            <RM value={applied} />
                          </span>
                          {!r.auto && <ChevronRight size={16} className={cn("text-[var(--muted)] transition-transform duration-200", isExp && "rotate-90")} />}
                        </span>
                      </button>

                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                        <div className={cn("h-full rounded-full transition-all duration-300", isMaxed ? "bg-emerald-500" : "bg-[var(--btn-primary-bg)]")} style={{ width: `${pct}%` }} />
                      </div>

                      {isExp && !r.auto && (
                        <div className="mt-3 space-y-3 rounded-[1.25rem] border border-[var(--border)] p-3.5">
                          {r.note && <p className="text-xs leading-relaxed text-[var(--muted)]">{r.note}</p>}
                          <Field label={tr("Jumlah dituntut (RM)", "Amount claimed (RM)")}>
                            <NumInput
                              value={draftOf(r)}
                              onChange={(v) => setDrafts({ ...drafts, [r.relief_code]: v })}
                              placeholder={limit ? `${tr("Maksimum", "Maximum")}: RM ${limit}` : "0.00"}
                            />
                          </Field>
                          {overLimit && (
                            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                              {tr(`Hanya RM ${Number(limit).toLocaleString("en-MY")} dikira, iaitu had pelepasan ini.`, `Only RM ${Number(limit).toLocaleString("en-MY")} counts, the limit for this relief.`)}
                            </p>
                          )}
                          <div className="flex gap-2">
                            {r.claimed_amount > 0 && (
                              <GhostButton onClick={() => void saveRelief(r, 0)} disabled={saving === r.relief_code}>
                                {tr("Buang tuntutan", "Remove claim")}
                              </GhostButton>
                            )}
                            <PrimaryButton onClick={() => void saveRelief(r)} disabled={saving === r.relief_code}>
                              {saving === r.relief_code ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                              <span>{tr("Simpan", "Save")}</span>
                            </PrimaryButton>
                          </div>
                          {r.doc_requirement && (
                            <p className="flex items-start gap-1.5 text-xs text-[var(--muted)]">
                              <Info size={13} className="mt-0.5 shrink-0" />
                              <span>{tr("Dokumen / resit diperlukan", "Required proof")}: {r.doc_requirement}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </Card>
            </div>
          )
        })
      )}
    </div>
  )
}

/* ─────────────────────────── 6. Rebates Tab ─────────────────────────── */

function RebatesTab({ year, tr, api, calcData, refreshMetrics, showNotice }: any) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api(`/rebates?assessment_year=${year}`))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    load()
  }, [load])

  async function addZakat() {
    const value = Number(amount)
    if (!amount || isNaN(value) || value <= 0) {
      showNotice(tr("Masukkan jumlah zakat yang lebih daripada sifar.", "Enter a zakat amount above zero."), "error")
      return
    }
    setBusy(true)
    try {
      await api("/rebates", {
        method: "POST",
        body: JSON.stringify({ assessment_year: year, rebate_code: "rebate_zakat", amount: value, source: "manual" }),
      })
      setAmount("")
      await load()
      await refreshMetrics()
      showNotice(tr("Zakat direkodkan sebagai rebat cukai", "Zakat recorded as a tax rebate"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: any) {
    if (!window.confirm(tr("Padam rekod rebat ini?", "Delete this rebate record?"))) return
    try {
      await api(`/rebates/${r.id}`, { method: "DELETE" })
      await load()
      await refreshMetrics()
      showNotice(tr("Rebat dipadam", "Rebate deleted"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  // Rebates the estimate adds by itself: the RM400 individual rebate and zakat from the EA form.
  const autoLines: any[] = (calcData?.rebate_lines || []).filter((l: any) => l.auto)
  const applied = calcData?.rebate_total ?? 0
  const available = calcData?.rebate_available ?? 0

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
            <BadgePercent size={17} />
          </span>
          <h4 className="text-sm font-bold text-[var(--text)]">{tr("Rebat dan zakat", "Rebates and zakat")}</h4>
        </div>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {tr(
            "Rebat dan zakat ditolak terus daripada cukai yang perlu dibayar, ringgit demi ringgit, bukan daripada pendapatan bercukai. Jika pendapatan bercukai anda RM35,000 atau kurang, rebat individu RM400 ditambah secara automatik. Rebat tidak boleh melebihi cukai.",
            "Rebates and zakat come off the tax itself, ringgit for ringgit, not off chargeable income. When your chargeable income is RM35,000 or less, the RM400 individual rebate is added automatically. A rebate cannot be more than the tax."
          )}
        </p>
        {available > applied && (
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            {tr(`Hanya RM ${applied.toLocaleString("en-MY")} daripada RM ${available.toLocaleString("en-MY")} digunakan kerana cukai anda lebih rendah.`, `Only RM ${applied.toLocaleString("en-MY")} of RM ${available.toLocaleString("en-MY")} is used, because your tax is lower.`)}
          </p>
        )}
      </Card>

      <SectionLabel>{tr("Rekod bayaran zakat", "Record a zakat payment")}</SectionLabel>
      <Card className="space-y-3.5">
        <Field label={tr("Jumlah zakat dibayar (RM)", "Zakat paid (RM)")} hint={tr("Fitrah, pendapatan atau harta", "Fitrah, income or wealth")}>
          <NumInput value={amount} onChange={setAmount} placeholder="0.00" />
        </Field>
        <PrimaryButton onClick={addZakat} disabled={busy || !amount}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          <span>{tr("Rekod bayaran zakat", "Record zakat payment")}</span>
        </PrimaryButton>
      </Card>

      <SectionLabel>{tr("Rebat yang dikira", "Rebates counted")}</SectionLabel>
      {loading ? (
        <Skeleton />
      ) : rows.length === 0 && autoLines.length === 0 ? (
        <Card className="py-6 text-center text-sm text-[var(--muted)]">{tr("Tiada rebat direkodkan.", "No rebates recorded.")}</Card>
      ) : (
        <div className="space-y-2">
          {autoLines.map((l) => (
            <Card key={`auto-${l.code}`} className="flex items-center justify-between gap-3 p-3.5 md:p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text)]">{localName(l.name, tr("1", "0") === "1")}</p>
                <p className="text-xs text-[var(--muted)]">{l.source === "ea" ? tr("Daripada borang EA", "From the EA form") : tr("Automatik", "Automatic")}</p>
              </div>
              <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400"><RM value={l.amount} /></p>
            </Card>
          ))}
          {rows.map((r) => (
            <Card key={r.id} className="flex items-center justify-between gap-3 p-3.5 md:p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text)]">{localName(r.name || r.rebate_code, tr("1", "0") === "1")}</p>
                <p className="text-xs capitalize text-[var(--muted)]">{r.source}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400"><RM value={r.amount} /></p>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  aria-label={tr("Padam", "Delete")}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-500/10"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── 7. Tax Transactions Tab ─────────────────────────── */

function TxTab({ year, tr, api, refreshMetrics, showNotice }: any) {
  const [links, setLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setLinks(await api(`/transaction-links?assessment_year=${year}`))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id: number, status: string) {
    try {
      await api(`/transaction-links/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      await load()
      await refreshMetrics()
      showNotice(tr("Status transaksi cukai dikemas kini", "Tax transaction status updated"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  return (
    <div className="space-y-4">
      {/* Help Card */}
      <Card className="flex items-start gap-3 bg-[var(--surface-tint)] p-4 text-xs text-[var(--muted)]">
        <Receipt size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <p className="leading-relaxed">
          {tr("Kaitkan resit perbelanjaan harian anda secara langsung dengan Pelepasan Cukai daripada halaman Butiran Transaksi.", "Link daily expense transactions directly to tax relief claims from any transaction detail page.")}
        </p>
      </Card>

      <SectionLabel>{tr("Senarai Transaksi Berkaitan Cukai", "Linked Tax Transactions")}</SectionLabel>

      {loading ? (
        <Skeleton />
      ) : links.length === 0 ? (
        <Card className="text-center py-8 space-y-1">
          <p className="text-sm font-bold text-[var(--text)]">{tr("Tiada Transaksi Dikaitkan", "No Linked Transactions")}</p>
          <p className="text-xs text-[var(--muted)]">{tr("Buka transaksi anda dan klik 'Cukai' untuk memautkannya ke pelepasan cukai tahun ini.", "Open transactions and tag them as tax deductible.")}</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {links.map((l) => (
            <Card key={l.id} className="space-y-3 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[var(--text)]">Tx #{l.transaction_id} · {l.tax_type}</h4>
                  <p className="text-xs text-[var(--muted)]">{l.notes || tr("Pelepasan Dituntut", "Claimed relief")}</p>
                </div>
                <span className="text-sm font-bold text-[var(--text)]"><RM value={l.claim_amount} /></span>
              </div>

              <div className="flex gap-1.5 pt-1">
                {([["accepted", "Diterima", "Accepted"], ["reviewed", "Disemak", "Reviewed"], ["rejected", "Ditolak", "Rejected"]] as const).map(([s, bm, en]) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(l.id, s)}
                    className={cn(
                      "h-10 flex-1 rounded-full border text-sm font-semibold transition",
                      l.status === s
                        ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                        : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                  >
                    {tr(bm, en)}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── 8. Supporting Documents Tab ─────────────────────────── */

function DocsTab({ year, tr, api, showNotice }: any) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState("receipt")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDocs(await api(`/documents?assessment_year=${year}`))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [api, year])

  useEffect(() => {
    load()
  }, [load])

  const TYPES: Record<string, { labelBm: string; labelEn: string }> = {
    ea: { labelBm: "Borang EA / Penyata Gaji", labelEn: "EA Form / Remuneration" },
    receipt: { labelBm: "Resit Belanja (Gaya Hidup)", labelEn: "Lifestyle Receipt" },
    medical: { labelBm: "Resit Perubatan", labelEn: "Medical Receipt" },
    insurance: { labelBm: "Penyata Insurans / KWSP", labelEn: "Insurance / EPF Statement" },
    education: { labelBm: "Resit Yuran Pendidikan / Taska", labelEn: "Education / Childcare Fee" },
    zakat: { labelBm: "Resit Bayaran Zakat", labelEn: "Zakat Payment Receipt" },
    business: { labelBm: "Dokumen Perniagaan", labelEn: "Business Document" },
    other: { labelBm: "Dokumen Lain-lain", labelEn: "Other Supporting Document" },
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    const problem = uploadProblem(file, tr)
    if (problem) {
      showNotice(problem, "error")
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("assessment_year", String(year))
    fd.append("document_type", docType)
    setUploading(true)
    try {
      const token = getAccessToken()
      const headers: Record<string, string> = {}
      if (token && !isCookieAuthSentinel(token)) headers["Authorization"] = `Bearer ${token}`

      const res = await fetch(`/api/tax/documents`, {
        method: "POST",
        headers,
        credentials: "include",
        body: fd,
      })
      if (!res.ok) {
        // A refused upload used to be reported as a success.
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.detail === "string" ? err.detail : tr("Gagal memuat naik dokumen.", "The document could not be uploaded."))
      }
      await load()
      showNotice(tr("Dokumen dimuat naik", "Document uploaded"))
    } catch (e: any) {
      showNotice(e.message || tr("Ralat muat naik", "Upload error"), "error")
    } finally {
      setUploading(false)
    }
  }

  async function removeDoc(d: any) {
    if (!window.confirm(tr("Padam dokumen ini?", "Delete this document?"))) return
    try {
      await api(`/documents/${d.id}`, { method: "DELETE" })
      await load()
      showNotice(tr("Dokumen dipadam", "Document deleted"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  const byType: Record<string, any[]> = {}
  docs.forEach((d) => {
    ;(byType[d.document_type] = byType[d.document_type] || []).push(d)
  })

  return (
    <div className="space-y-4">
      {/* Upload Document Box */}
      <Card className="space-y-3.5">
        <Field label={tr("Kategori Dokumen", "Document Type")}>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] outline-none cursor-pointer"
          >
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {tr(v.labelBm, v.labelEn)}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-3 text-xs font-bold text-[var(--btn-primary-text)] hover:opacity-95 transition active:scale-95">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span>{uploading ? tr("Memuat Naik…", "Uploading…") : tr("Pilih & Muat Naik Dokumen (PDF / Imej)", "Upload Supporting Document")}</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFile}
            disabled={uploading}
          />
        </label>
      </Card>

      {/* Grouped Documents */}
      <SectionLabel>{tr("Arkib Dokumen Sokongan", "Supporting Documents Archive")}</SectionLabel>

      {loading ? (
        <Skeleton />
      ) : docs.length === 0 ? (
        <Card className="text-center py-8 text-sm text-[var(--muted)]">{tr("Belum ada dokumen sokongan dimuat naik.", "No documents uploaded yet.")}</Card>
      ) : (
        Object.entries(byType).map(([typeKey, list]) => {
          const tInfo = TYPES[typeKey] || { labelBm: typeKey, labelEn: typeKey }
          return (
            <div key={typeKey} className="space-y-2">
              <p className="px-1 text-xs font-bold text-[var(--muted)]">
                {tr(tInfo.labelBm, tInfo.labelEn)} · {list.length}
              </p>
              <div className="space-y-2">
                {list.map((d) => (
                  <Card key={d.id} className="flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--accent)] shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[var(--text)]">{d.original_filename}</p>
                        <p className="text-xs text-[var(--muted)]">{d.document_date || "—"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a
                        href={`/api/tax/documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
                      >
                        <Download size={14} />
                        <span>{tr("Buka", "View")}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => void removeDoc(d)}
                        aria-label={tr("Padam", "Delete")}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-500/10"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

/* ─────────────────────────── 9. Estimate & Calculation Engine Tab ─────────────────────────── */

function EstimateTab({ year, tr, calcData }: any) {
  const balance = calcData?.estimated_balance ?? 0
  const isPositiveRefund = balance >= 0
  const reliefLines: any[] = calcData?.relief_lines || []
  const rebateLines: any[] = calcData?.rebate_lines || []
  const bands: any[] = calcData?.bracket_lines || []
  const nonResident = calcData?.residency_status === "non_resident"
  const [showReliefs, setShowReliefs] = useState(false)

  const reliefName = (l: any) => localName(l.name, tr("1", "0") === "1")

  return (
    <div className="space-y-4">
      <Card className="space-y-3.5">
        <h4 className="text-sm font-bold text-[var(--text)]">{tr("Pengiraan cukai langkah demi langkah", "Step-by-step tax calculation")} · YA {year}</h4>
        {nonResident && (
          <p className="rounded-[1.25rem] border border-amber-500/40 px-3.5 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            {tr("Bukan pemastautin: cukai 30% atas semua pendapatan, tanpa pelepasan dan rebat.", "Non-resident: 30% on all income, with no reliefs or rebates.")}
          </p>
        )}

        <div className="space-y-2.5 text-sm">
          <CalcRow label={tr("1. Jumlah pendapatan kasar", "1. Gross income")} value={calcData?.income_total} />
          {calcData?.taxable_income != null && calcData?.taxable_income !== calcData?.income_total && (
            <CalcRow label={tr("   Pendapatan bercukai (selepas perbelanjaan perniagaan)", "   Taxable income (after business expenses)")} value={calcData?.taxable_income} />
          )}
          <button
            type="button"
            onClick={() => setShowReliefs((v) => !v)}
            aria-expanded={showReliefs}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-1.5 text-[var(--muted)]">
              {tr("2. (−) Pelepasan cukai", "2. (−) Tax reliefs")}
              <ChevronRight size={14} className={cn("transition-transform", showReliefs && "rotate-90")} />
            </span>
            <span className="font-semibold tabular-nums text-rose-500">−<RM value={calcData?.relief_total} /></span>
          </button>
          {showReliefs && (
            <ul className="space-y-1.5 rounded-[1.25rem] border border-[var(--border)] px-3.5 py-3 text-xs">
              {reliefLines.length === 0 ? (
                <li className="text-[var(--muted)]">{tr("Tiada pelepasan.", "No reliefs.")}</li>
              ) : (
                reliefLines.map((l) => (
                  <li key={l.code} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[var(--muted)]">
                      {reliefName(l)}
                      {l.auto ? ` · ${l.source === "ea" ? tr("EA", "EA") : tr("auto", "auto")}` : ""}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]"><RM value={l.amount} /></span>
                  </li>
                ))
              )}
            </ul>
          )}
          <div className="border-t border-[var(--border)] pt-2.5">
            <CalcRow label={tr("3. (=) Pendapatan bercukai", "3. (=) Chargeable income")} value={calcData?.chargeable_income} strong />
          </div>

          {bands.length > 0 && (
            <div className="overflow-hidden rounded-[1.25rem] border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--muted)]">
                    <th className="px-3.5 py-2 font-semibold">{tr("Pendapatan bercukai", "Chargeable income")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{tr("Kadar", "Rate")}</th>
                    <th className="px-3.5 py-2 text-right font-semibold">{tr("Cukai", "Tax")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {bands.map((b, i) => (
                    <tr key={i}>
                      <td className="px-3.5 py-2 text-[var(--text)]">
                        {Number(b.from).toLocaleString("en-MY")} – {b.to == null ? tr("ke atas", "and above") : Number(b.to).toLocaleString("en-MY")}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--muted)]">{b.rate}%</td>
                      <td className="px-3.5 py-2 text-right font-semibold tabular-nums text-[var(--text)]"><RM value={b.tax} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <CalcRow label={tr("4. Cukai kasar", "4. Gross tax")} value={calcData?.gross_tax} />
          <CalcRow label={tr("5. (−) Rebat dan zakat", "5. (−) Rebates and zakat")} value={calcData?.rebate_total} negative />
          {rebateLines.length > 0 && (
            <ul className="space-y-1.5 text-xs text-[var(--muted)]">
              {rebateLines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3 pl-3">
                  <span className="min-w-0 truncate">{localName(l.name, tr("1", "0") === "1")}</span>
                  <span className="shrink-0 tabular-nums"><RM value={l.amount} /></span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-[var(--border)] pt-2.5">
            <CalcRow label={tr("6. (=) Cukai kena bayar", "6. (=) Net tax payable")} value={calcData?.net_tax} strong />
          </div>
          <CalcRow label={tr("7. (−) PCB / MTD telah dipotong", "7. (−) PCB / MTD already deducted")} value={calcData?.pcb_total} negative />
          <div className="border-t border-[var(--border)] pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-[var(--text)]">{tr("8. (=) Kedudukan akhir", "8. (=) Final position")}</span>
              <span className={cn("text-lg font-bold tabular-nums", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                {isPositiveRefund ? "+" : "−"}<RM value={Math.abs(balance)} />
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {isPositiveRefund ? tr("Lebihan PCB: anggaran bayaran balik.", "PCB overpaid: an estimated refund.") : tr("Baki cukai yang perlu dibayar.", "Tax still to pay.")}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function CalcRow({ label, value, negative, strong }: { label: string; value: number | null | undefined; negative?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("min-w-0 whitespace-pre-wrap", strong ? "font-bold text-[var(--text)]" : "text-[var(--muted)]")}>{label}</span>
      <span className={cn("shrink-0 tabular-nums", strong ? "text-base font-bold text-[var(--text)]" : "font-semibold text-[var(--text)]", negative && "text-rose-500")}>
        {negative ? "−" : ""}<RM value={value} />
      </span>
    </div>
  )
}

/* ─────────────────────────── 10. Summary & e-Filing Export Tab ─────────────────────────── */

function SummaryTab({ year, tr, api, profile, calcData, refreshMetrics, showNotice }: any) {
  const [history, setHistory] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const balance = calcData?.estimated_balance ?? 0
  const isPositiveRefund = balance >= 0

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api(`/history?assessment_year=${year}`))
    } catch {
      /* ignore */
    }
  }, [api, year])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  async function saveSnapshot() {
    setSaving(true)
    try {
      await api(`/calculate?assessment_year=${year}`, { method: "POST", body: "{}" })
      await loadHistory()
      await refreshMetrics()
      showNotice(tr("Pengiraan cukai disimpan ke sejarah!", "Tax calculation saved to history!"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    } finally {
      setSaving(false)
    }
  }

  const residencyLabel = profile?.residency_status === "non_resident" ? tr("Bukan pemastautin", "Non-resident") : tr("Pemastautin", "Resident")
  const sourceLabel: Record<string, [string, string]> = {
    employment: ["Pekerjaan", "Employment"],
    business: ["Perniagaan", "Business"],
    both: ["Pekerjaan + perniagaan", "Employment + business"],
  }
  const source = sourceLabel[profile?.income_source || "employment"] || sourceLabel.employment

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h3 className="text-base font-bold text-[var(--text)]">{tr("Ringkasan cukai e-Filing", "e-Filing tax summary")}</h3>
            <p className="text-xs text-[var(--muted)]">{tr("Tahun Taksiran", "Year of Assessment")} {year}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{tr("Status pemastautin", "Residency")}</dt>
            <dd className="font-bold text-[var(--text)]">{residencyLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{tr("Sumber pendapatan", "Income source")}</dt>
            <dd className="font-bold text-[var(--text)]">{tr(source[0], source[1])}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{tr("Jumlah pendapatan", "Total income")}</dt>
            <dd className="font-bold tabular-nums text-[var(--text)]"><RM value={calcData?.income_total} /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{tr("Jumlah pelepasan", "Total reliefs")}</dt>
            <dd className="font-bold tabular-nums text-rose-500">−<RM value={calcData?.relief_total} /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{tr("Rebat dan zakat", "Rebates and zakat")}</dt>
            <dd className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">−<RM value={calcData?.rebate_total} /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{tr("PCB (MTD) dibayar", "PCB (MTD) paid")}</dt>
            <dd className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">−<RM value={calcData?.pcb_total} /></dd>
          </div>
        </dl>

        <div className={cn("rounded-[1.25rem] border p-4 text-center", isPositiveRefund ? "border-emerald-500/30" : "border-amber-500/30")}>
          <span className="text-xs font-semibold text-[var(--muted)]">
            {isPositiveRefund ? tr("Anggaran bayaran balik", "Estimated refund") : tr("Anggaran baki cukai", "Estimated tax to settle")}
          </span>
          <p className={cn("mt-0.5 text-3xl font-bold tabular-nums tracking-tight", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
            {isPositiveRefund ? "+" : "−"}<RM value={Math.abs(balance)} />
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <GhostButton onClick={saveSnapshot} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
            <span>{tr("Simpan ke sejarah", "Save to history")}</span>
          </GhostButton>
          <a
            href={`/api/tax/export?assessment_year=${year}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98]"
          >
            <Download size={16} />
            <span>{tr("Muat turun Tax Pack (PDF)", "Export Tax Pack (PDF)")}</span>
          </a>
        </div>
      </Card>

      {/* Calculation History */}
      <SectionLabel>{tr("Sejarah Simpanan Pengiraan", "Calculation History Archive")}</SectionLabel>
      {history.length === 0 ? (
        <Card className="text-center py-6 text-xs text-[var(--muted)]">{tr("Tiada sejarah pengiraan disimpan.", "No saved history.")}</Card>
      ) : (
        <div className="space-y-2">
          {history.map((h) => {
            const hPos = (h.estimated_balance ?? 0) >= 0
            return (
              <Card key={h.id} className="flex items-center justify-between p-3.5">
                <div>
                  <p className="text-xs font-bold text-[var(--text)]">YA {h.assessment_year} · {new Date(h.created_at).toLocaleDateString()}</p>
                  <p className="text-xs text-[var(--muted)]">{tr("Cukai", "Tax")}: <RM value={h.net_tax} /> · PCB: <RM value={h.pcb_total} /></p>
                </div>
                <p className={cn("text-sm font-bold", hPos ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                  {hPos ? "+" : "-"}<RM value={Math.abs(h.estimated_balance || 0)} />
                </p>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
