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

  return (
    <div className="space-y-4 pb-28 md:space-y-6 md:pb-12">
      {/* ─── Mobile View Header ─── */}
      <div className="space-y-3.5 md:hidden">
        <MobilePageHeader
          title={tr("Cukai Pendapatan", "Income Tax")}
          fallbackHref={`/${sessionId}`}
          action={
            <div className="flex items-center gap-1.5">
              <YearPicker year={year} onChange={setYear} tr={tr} />
            </div>
          }
        />

        {/* Mobile Quick Status Banner */}
        <div className="px-1">
          <div className={cn(
            "flex items-center justify-between rounded-2xl px-3.5 py-2.5 shadow-xs border transition-all",
            isPositiveRefund
              ? "border-emerald-500/25 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/5 dark:from-emerald-950/40"
              : "border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/5 dark:from-amber-950/40"
          )}>
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl",
                isPositiveRefund ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
              )}>
                <Banknote size={18} />
              </div>
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                  {tr(`YA ${year} · Anggaran`, `YA ${year} · Estimate`)}
                </p>
                <p className={cn("text-xs font-black", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                  {isPositiveRefund ? tr("Lebihan PCB (Refund)", "Overpayment (Refund)") : tr("Cukai Belum Bayar", "Tax to Pay")}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-base font-black tracking-tight", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                {isPositiveRefund ? "+" : "-"}<RM value={Math.abs(balance)} />
              </p>
              <p className="text-[0.65rem] font-bold text-[var(--muted)]">
                {tr("Kesediaan", "Readiness")}: <span className="font-extrabold text-[var(--text)]">{readinessData?.score ?? 0}%</span>
              </p>
            </div>
          </div>
        </div>

        {/* Tab Bar (Pill Tabs Horizontal Scroll) */}
        <TabBar tab={tab} setTab={setTab} tr={tr} />

        {/* Notification Alert */}
        {notice && <NoticeBar notice={notice} />}

        {/* Active Tab View */}
        {loading ? <Skeleton /> : (
          <div className="px-1">
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
          </div>
        )}
      </div>

      {/* ─── Desktop View Layout ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Cukai Pendapatan (Income Tax)", "Income Tax (HASiL / LHDN)")} />
        <DesktopPageBody className="space-y-6">
          {/* Top Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
                <Landmark size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-[var(--text)]">
                    {tr("Pengurusan Cukai Individu", "Individual Tax Management")}
                  </h2>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[0.68rem] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    HASiL Malaysia (LHDN)
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {tr("Kira cukai pendapatan, pantau pelepasan, sahkan borang EA, dan sediakan e-Filing.", "Calculate income tax, monitor reliefs, confirm EA forms, and prepare e-Filing.")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <YearPicker year={year} onChange={setYear} tr={tr} />
              <button
                type="button"
                onClick={() => {
                  setLoading(true)
                  refreshGlobalMetrics()
                }}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition active:scale-95 cursor-pointer"
                title={tr("Muat Semula", "Refresh")}
              >
                <RefreshCw size={14} className={cn(loading && "animate-spin")} />
                <span>{tr("Muat Semula", "Refresh")}</span>
              </button>
            </div>
          </div>

          {/* Tab Bar (Desktop Filter Pills) */}
          <TabBar tab={tab} setTab={setTab} tr={tr} />

          {/* Global Notice */}
          {notice && <NoticeBar notice={notice} />}

          {/* Desktop Content Grid (Main Content + Live Engine Sidebar) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className={cn(tab === "dashboard" || tab === "estimate" || tab === "summary" ? "lg:col-span-8" : "lg:col-span-12", "space-y-6")}>
              {loading ? <Skeleton /> : (
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
              )}
            </div>

            {/* Desktop Quick Engine Side Panel */}
            {(tab === "dashboard" || tab === "estimate" || tab === "summary") && (
              <div className="lg:col-span-4 space-y-4">
                {/* Live Tax Position Card */}
                <Card className={cn(
                  "relative overflow-hidden border-2 p-5 shadow-md transition-all",
                  isPositiveRefund
                    ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-[var(--card)]"
                    : "border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-[var(--card)]"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.7rem] font-black uppercase tracking-wider text-[var(--muted)]">
                      {tr("Kedudukan Cukai", "Tax Position")} · YA {year}
                    </span>
                    <span className={cn(
                      "rounded-full px-2.5 py-0.5 text-[0.65rem] font-black uppercase tracking-wider",
                      isPositiveRefund ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    )}>
                      {isPositiveRefund ? tr("Lebihan PCB", "Refund") : tr("Cukai Perlu Bayar", "Payable")}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-3xl font-black tracking-tight text-[var(--text)]">
                      {isPositiveRefund ? "+" : "-"}<RM value={Math.abs(balance)} />
                    </p>
                    <p className={cn("mt-1 text-xs font-bold", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                      {isPositiveRefund
                        ? tr("Anggaran bayaran balik daripada HASiL", "Estimated refund from HASiL")
                        : tr("Anggaran baki cukai perlu dibayar", "Estimated remaining tax balance to settle")}
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[var(--border)]/70 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">{tr("Pendapatan Kasar", "Gross Income")}</span>
                      <span className="font-bold text-[var(--text)]"><RM value={calcData?.income_total} /></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">{tr("Jumlah Pelepasan", "Total Reliefs")}</span>
                      <span className="font-bold text-rose-500">-<RM value={calcData?.relief_total} /></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">{tr("Pendapatan Bercukai", "Chargeable Income")}</span>
                      <span className="font-black text-[var(--text)]"><RM value={calcData?.chargeable_income} /></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">{tr("Cukai Kena Bayar", "Net Tax Payable")}</span>
                      <span className="font-bold text-[var(--text)]"><RM value={calcData?.net_tax} /></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">{tr("PCB / MTD Telah Dipotong", "PCB / MTD Deducted")}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">-<RM value={calcData?.pcb_total} /></span>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTab("estimate")}
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition cursor-pointer"
                    >
                      {tr("Perincian Pengiraan", "Full Calculation")}
                    </button>
                    <a
                      href={`/api/tax/export?assessment_year=${year}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-3 py-2 text-xs font-bold text-[var(--btn-primary-text)] shadow-sm hover:opacity-95 transition"
                    >
                      <Download size={13} />
                      <span>{tr("PDF", "PDF")}</span>
                    </a>
                  </div>
                </Card>

                {/* Readiness Progress Card */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-[var(--accent)]" />
                      <p className="text-xs font-black text-[var(--text)]">{tr("Status Kesediaan e-Filing", "e-Filing Readiness")}</p>
                    </div>
                    <span className="text-sm font-black text-[var(--accent)]">{readinessData?.score ?? 0}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${Math.max(5, readinessData?.score ?? 0)}%` }}
                    />
                  </div>
                  <div className="space-y-1.5 pt-1 text-xs">
                    {readinessData?.checks && Object.entries(readinessData.checks).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between py-0.5">
                        <span className="text-[var(--muted)] capitalize">{key.replace(/_/g, " ")}</span>
                        {val ? (
                          <span className="flex items-center gap-1 text-[0.7rem] font-bold text-emerald-600 dark:text-emerald-400">
                            <Check size={12} /> {tr("Lengkap", "Done")}
                          </span>
                        ) : (
                          <span className="text-[0.7rem] font-bold text-amber-500">
                            {tr("Perlu Diisi", "Pending")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </DesktopPageBody>
      </div>
    </div>
  )
}

/* ─────────────────────────── Shared Components ─────────────────────────── */

function YearPicker({ year, onChange, tr }: { year: number; onChange: (y: number) => void; tr: (b: string, e: string) => string }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)] shadow-2xs hover:bg-[var(--surface-tint)] transition cursor-pointer">
      <Calendar className="h-3.5 w-3.5 text-[var(--accent)]" />
      <span className="font-extrabold text-[var(--muted)] uppercase tracking-wider">YA</span>
      <select
        value={year}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="bg-transparent text-xs font-black text-[var(--text)] outline-none cursor-pointer"
      >
        {YEARS.map((y) => (
          <option key={y} value={y} className="bg-[var(--card)] text-[var(--text)]">
            {y}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="text-[var(--muted)]" />
    </label>
  )
}

function TabBar({ tab, setTab, tr }: { tab: TabKey; setTab: (t: TabKey) => void; tr: (b: string, e: string) => string }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const active = t.key === tab
        const Icon = t.icon
        const label = tr(t.labelBm, t.labelEn)
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all active:scale-95 shadow-2xs cursor-pointer",
              active
                ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-extrabold shadow-sm"
                : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
            )}
          >
            <Icon size={14} />
            <span>{label}</span>
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
        "flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold shadow-xs",
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
      <div className="h-32 animate-pulse rounded-3xl bg-[var(--surface-tint)]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
      </div>
      <div className="h-44 animate-pulse rounded-3xl bg-[var(--surface-tint)]" />
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs", className)}>
      {children}
    </div>
  )
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pb-1 pt-2">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">{children}</p>
      {right}
    </div>
  )
}

function RM({ value, decimals = 2 }: { value: number | null | undefined; decimals?: number }) {
  if (value == null || isNaN(value)) return <span>RM 0.00</span>
  return (
    <span>
      RM {Number(value).toLocaleString("en-MY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[0.7rem] font-black uppercase tracking-wider text-[var(--muted)]">{label}</span>
        {hint && <span className="text-[0.65rem] text-[var(--muted)]">{hint}</span>}
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
      className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--text)] outline-none transition focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--accent)]/15 disabled:opacity-60"
    />
  )
}

function NumInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3.5 text-xs font-bold text-[var(--muted)]">RM</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "0.00"}
        disabled={disabled}
        className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] pl-10 pr-3.5 py-2.5 text-xs font-bold text-[var(--text)] outline-none transition focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--accent)]/15 disabled:opacity-60"
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
        "flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-3 text-xs font-black text-[var(--btn-primary-text)] shadow-sm transition active:scale-[0.98] disabled:opacity-50 hover:opacity-95 cursor-pointer",
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
        "flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-3 text-xs font-bold text-[var(--text)] shadow-2xs transition active:scale-[0.98] hover:bg-[var(--surface-tint-strong)] disabled:opacity-50 cursor-pointer",
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

function DashboardTab({ year, tr, setTab, calcData, readinessData, refreshMetrics, showNotice }: any) {
  const balance = calcData?.estimated_balance ?? 0
  const isPositiveRefund = balance >= 0
  const needAttentionCount = (readinessData?.attention?.length || 0) + (readinessData?.pending_links || 0)

  return (
    <div className="space-y-4">
      {/* Hero Position Banner */}
      <Card className={cn(
        "relative overflow-hidden border-2 p-5 sm:p-6 transition-all",
        isPositiveRefund
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-[var(--card)]"
          : "border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-rose-500/10 to-[var(--card)]"
      )}>
        <div className="absolute -right-6 -top-8 h-36 w-36 rounded-full bg-[var(--accent)]/15 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-tint)] px-3 py-1 text-[0.68rem] font-black uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">
              <Landmark size={12} className="text-[var(--accent)]" />
              {tr("Kedudukan Cukai Taksiran", "Assessment Tax Position")} · YA {year}
            </span>
            <h3 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-[var(--text)]">
              {isPositiveRefund ? "+" : "-"}<RM value={Math.abs(balance)} />
            </h3>
            <p className={cn("mt-1 text-xs font-bold", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
              {isPositiveRefund
                ? tr("🎉 Anggaran Lebihan Bayaran Cukai (Akan Dipulangkan / Refund oleh HASiL)", "🎉 Estimated Tax Overpayment (To be Refunded by HASiL)")
                : tr("⚠️ Anggaran Baki Cukai Belum Bayar (Perlu Diselesaikan)", "⚠️ Estimated Tax Payable to HASiL")}
            </p>
          </div>

          <div className="flex sm:flex-col gap-2">
            <button
              type="button"
              onClick={() => setTab("estimate")}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-xs font-black text-[var(--btn-primary-text)] shadow-xs hover:opacity-95 transition active:scale-95 cursor-pointer"
            >
              <Calculator size={14} />
              <span>{tr("Lihat Pengiraan", "View Calculation")}</span>
            </button>
            <a
              href={`/api/tax/export?assessment_year=${year}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-tint)] transition"
            >
              <Download size={14} />
              <span>{tr("Eksport PDF", "Export PDF")}</span>
            </a>
          </div>
        </div>
      </Card>

      {/* 4 Quick Stat KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <StatCard
          icon={Briefcase}
          label={tr("Jumlah Pendapatan", "Total Income")}
          value={calcData?.income_total}
          onClick={() => setTab("income")}
          color="text-sky-500 bg-sky-500/10"
        />
        <StatCard
          icon={Gift}
          label={tr("Jumlah Pelepasan", "Total Reliefs")}
          value={calcData?.relief_total}
          onClick={() => setTab("reliefs")}
          color="text-indigo-500 bg-indigo-500/10"
        />
        <StatCard
          icon={BadgePercent}
          label={tr("Rebat & Zakat", "Rebates & Zakat")}
          value={calcData?.rebate_total}
          onClick={() => setTab("rebates")}
          color="text-emerald-500 bg-emerald-500/10"
        />
        <StatCard
          icon={Banknote}
          label={tr("PCB Telah Dipotong", "PCB / MTD Paid")}
          value={calcData?.pcb_total}
          onClick={() => setTab("ea")}
          color="text-teal-500 bg-teal-500/10"
        />
      </div>

      {/* Tax Readiness & Checklist Card */}
      <Card className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-[var(--text)]">{tr("Tahap Kesediaan e-Filing", "e-Filing Readiness Progress")}</p>
              <p className="text-[0.7rem] text-[var(--muted)]">{tr("Senarai semak dokumen dan pengesahan sebelum menghantar e-Filing", "Checklist of documents and confirmations before e-Filing")}</p>
            </div>
          </div>
          <span className="text-lg font-black text-[var(--accent)]">{readinessData?.score ?? 0}%</span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${Math.max(5, readinessData?.score ?? 0)}%` }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {readinessData?.checks && Object.entries(readinessData.checks).map(([key, val]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key.includes("profile")) setTab("profile")
                else if (key.includes("ea") || key.includes("income")) setTab("ea")
                else if (key.includes("relief")) setTab("reliefs")
                else if (key.includes("rebate") || key.includes("zakat")) setTab("rebates")
              }}
              className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/60 px-3.5 py-2.5 text-left text-xs font-bold hover:bg-[var(--surface-tint-strong)] transition cursor-pointer"
            >
              <span className="text-[var(--text)] capitalize">{key.replace(/_/g, " ")}</span>
              {val ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.68rem] font-extrabold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Check size={11} /> {tr("Selesai", "Completed")}
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.68rem] font-extrabold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {tr("Lengkapkan →", "Complete →")}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Attention / Warnings Card */}
      {needAttentionCount > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 space-y-2.5">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={16} />
            <p className="text-xs font-black uppercase tracking-wider">
              {needAttentionCount} {tr("Perkara Perlu Perhatian Anda", "Items Need Your Attention")}
            </p>
          </div>
          <div className="space-y-2">
            {(readinessData?.attention || []).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-[var(--card)] p-3 text-xs">
                <div>
                  <p className="font-extrabold text-[var(--text)]">{item.name}</p>
                  <p className="text-[var(--muted)]">{item.issue}</p>
                </div>
                {item.amount != null && (
                  <span className="font-black text-[var(--text)]"><RM value={item.amount} /></span>
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

      <p className="px-1 text-[0.65rem] leading-relaxed text-[var(--muted)]">
        {tr(DISCLAIMER_BM, DISCLAIMER_EN)}
      </p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, onClick, color }: { icon: any; label: string; value: number | null | undefined; onClick: () => void; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col justify-between rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3.5 text-left shadow-2xs hover:border-[var(--accent)]/40 hover:bg-[var(--surface-tint)]/40 transition active:scale-95 cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-xl", color)}>
          <Icon size={14} />
        </div>
        <ChevronRight size={14} className="text-[var(--muted)]" />
      </div>
      <div className="mt-3">
        <p className="text-[0.65rem] font-bold text-[var(--muted)] uppercase tracking-wider">{label}</p>
        <p className="mt-0.5 text-sm sm:text-base font-black text-[var(--text)]">
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
      className="flex items-center gap-2.5 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3 text-left shadow-2xs hover:bg-[var(--surface-tint)] transition active:scale-95 cursor-pointer"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--accent)]">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-[var(--text)]">{title}</p>
        <p className="truncate text-[0.65rem] text-[var(--muted)]">{desc}</p>
      </div>
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

  async function save() {
    setBusy(true)
    try {
      const body: any = {
        residency_status: form.residency_status,
        marital_status: form.marital_status,
        income_source: form.income_source,
        disabled_status: form.disabled_status,
        spouse_income_status: form.spouse_income_status || undefined,
        assessment_type: form.assessment_type || undefined,
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
              "flex flex-col justify-between rounded-2xl border p-3 text-left transition-all active:scale-[0.98] cursor-pointer",
              isSelected
                ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black">{tr(opt.labelBm, opt.labelEn)}</span>
              {isSelected ? <Check size={14} /> : <div className="h-3.5 w-3.5 rounded-full border border-[var(--muted)]/40" />}
            </div>
            {(opt.descBm || opt.descEn) && (
              <span className={cn("mt-1 text-[0.68rem]", isSelected ? "opacity-90 text-[var(--btn-primary-text)]" : "text-[var(--muted)]")}>
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
            <p className="text-sm font-extrabold text-[var(--text)]">{tr("Jejak Zakat untuk Rebat Cukai", "Track Zakat for Tax Rebates")}</p>
            <p className="text-xs text-[var(--muted)]">
              {tr("Zakat ditolak terus daripada jumlah cukai sebenar (1:1), bukan sekadar mengurangkan pendapatan bercukai.", "Zakat is deducted directly from actual tax liability (1:1), not just chargeable income.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, zakat_tracking_enabled: !form.zakat_tracking_enabled })}
            className={cn("h-7 w-12 shrink-0 rounded-full p-1 transition-all cursor-pointer", form.zakat_tracking_enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-tint-strong)]")}
          >
            <div className={cn("h-5 w-5 rounded-full bg-white transition-all shadow-xs", form.zakat_tracking_enabled && "translate-x-5")} />
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
          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-tint)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)]">
            <span className="text-[var(--muted)]">{tr("TIN Semasa", "Current TIN")}:</span>
            <span className="font-mono text-sm tracking-wider">{profile.tax_identifier_masked}</span>
          </div>
        )}
        <TextInput
          value={tin}
          onChange={setTin}
          placeholder={profile?.tax_identifier_masked ? tr("Masukkan TIN baru jika ingin tukar", "Enter new TIN to update") : tr("Contoh No Cukai LHDN: IG 12345678090 atau OG 98765432010", "e.g. LHDN Tax No: IG 12345678090 or OG 98765432010")}
        />
      </Card>

      {/* Save Button */}
      <PrimaryButton onClick={save} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        <span>{tr("Simpan Profil Cukai", "Save Tax Profile")}</span>
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
    education18plus: { labelBm: "Anak 18+ Tahun (Pengajian Tinggi)", labelEn: "Child 18+ (Higher Education)", reliefRM: "RM 8,000" },
    disabled_child: { labelBm: "Anak Kurang Upaya (OKU)", labelEn: "Disabled Child (OKU)", reliefRM: "RM 6,000" },
    disabled_education: { labelBm: "Anak OKU (Pengajian Tinggi)", labelEn: "Disabled Child (Higher Education)", reliefRM: "RM 14,000" },
  }

  async function add() {
    try {
      await api("/dependants", {
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
            className="flex items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-3 py-1 text-xs font-bold text-[var(--btn-primary-text)] shadow-2xs hover:opacity-90 transition active:scale-95 cursor-pointer"
          >
            <Plus size={13} />
            <span>{tr("Tambah Anak", "Add Child")}</span>
          </button>
        }
      >
        {tr("Tanggungan / Anak", "Dependants / Children")}
      </SectionLabel>

      {loading ? (
        <div className="h-20 animate-pulse rounded-3xl bg-[var(--surface-tint)]" />
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
                    <p className="text-xs font-black text-[var(--text)]">{tr(info.labelBm, info.labelEn)}</p>
                    <p className="text-[0.68rem] text-[var(--muted)]">
                      {tr("Tuntutan", "Claim")}: <span className="font-bold text-[var(--text)]">{d.relief_percentage}%</span> ({info.reliefRM})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
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
        <Card className="space-y-3 border-2 border-[var(--accent)]/30">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-[var(--text)]">{tr("Tambah Tanggungan Anak", "Add Child Dependant")}</p>
            <button type="button" onClick={() => setShowAdd(false)} className="text-[var(--muted)] cursor-pointer">
              <X size={16} />
            </button>
          </div>

          <Field label={tr("Kategori Tanggungan", "Dependant Category")}>
            <select
              value={draft.dependant_type}
              onChange={(e) => setDraft({ ...draft, dependant_type: e.target.value })}
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] outline-none cursor-pointer"
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
                    "flex-1 rounded-xl border py-2.5 text-xs font-bold transition cursor-pointer",
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
    const file = e.target.files?.[0]
    if (!file) return
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

  const totalIncome = forms.reduce((acc, f) => acc + (f.total_employment_income || 0), 0)

  return (
    <div className="space-y-4">
      {/* Upload Zone Card */}
      <Card className="border-2 border-dashed border-[var(--accent)]/30 text-center p-6 space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--accent)]/15 text-[var(--accent)] shadow-2xs">
          <FileUp size={26} />
        </div>
        <div>
          <h3 className="text-base font-black text-[var(--text)]">
            {tr("Muat Naik Penyata Pendapatan (Borang EA / EC)", "Upload EA / EC Remuneration Statement")}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)] max-w-md mx-auto">
            {tr("Muat naik penyata tahunan majikan anda (PDF, JPG, PNG). Sistem akan mengimbas gaji, bonus, elaun, PCB, KWSP, SOCSO dan Zakat secara automatik.", "Upload your annual EA Form. The system automatically extracts salary, bonus, PCB, EPF, SOCSO, and Zakat.")}
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-5 py-3 text-xs font-black text-[var(--btn-primary-text)] shadow-sm hover:opacity-95 transition active:scale-95">
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
                    <h4 className="text-sm font-black text-[var(--text)]">{f.employer_name || tr("Majikan Tidak Dinyatakan", "Unnamed Employer")}</h4>
                    <p className="text-[0.68rem] text-[var(--muted)]">YA {f.assessment_year} · {f.review_status === "confirmed" ? tr("Disahkan", "Confirmed") : tr("Perlu Disemak", "Pending Review")}</p>
                  </div>
                </div>

                {f.review_status === "confirmed" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-[0.68rem] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Check size={12} /> {tr("Disahkan", "Confirmed")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReviewing(f)}
                    className="rounded-full bg-[var(--btn-primary-bg)] px-3 py-1 text-xs font-black text-[var(--btn-primary-text)] shadow-2xs hover:opacity-90 cursor-pointer"
                  >
                    {tr("Semak Data", "Review")}
                  </button>
                )}
              </div>

              {/* Breakdown Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border)] text-xs">
                <div className="rounded-xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-[0.65rem] text-[var(--muted)] block font-bold">{tr("Pendapatan Kasar", "Gross Income")}</span>
                  <span className="font-black text-[var(--text)]"><RM value={f.total_employment_income} /></span>
                </div>
                <div className="rounded-xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-[0.65rem] text-[var(--muted)] block font-bold">PCB (MTD)</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400"><RM value={f.pcb_amount} /></span>
                </div>
                <div className="rounded-xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-[0.65rem] text-[var(--muted)] block font-bold">KWSP (EPF)</span>
                  <span className="font-black text-[var(--text)]"><RM value={f.epf_amount} /></span>
                </div>
                <div className="rounded-xl bg-[var(--surface-tint)] p-2.5">
                  <span className="text-[0.65rem] text-[var(--muted)] block font-bold">SOCSO / PERKESO</span>
                  <span className="font-black text-[var(--text)]"><RM value={f.socso_amount} /></span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReviewing({ ...f, editing: true })}
                  className="flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline cursor-pointer"
                >
                  <PencilLine size={13} />
                  <span>{tr("Sunting Nilai", "Edit Values")}</span>
                </button>
              </div>
            </Card>
          ))}

          {forms.length > 1 && (
            <Card className="flex items-center justify-between bg-[var(--surface-tint)] p-4">
              <span className="text-xs font-black uppercase text-[var(--muted)]">{tr("Jumlah Keseluruhan Pendapatan Majikan", "Total All Employers")}</span>
              <span className="text-base font-black text-[var(--text)]"><RM value={totalIncome} /></span>
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

  function setNum(key: string, val: string) {
    const n = val === "" ? null : Number(val)
    setF({ ...f, [key]: val === "" ? null : n !== null && isNaN(n) ? val : n })
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-xs md:items-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] md:rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-5 md:p-6 shadow-2xl space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
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
                <p className="text-sm font-black text-[var(--text)]">{f.employer_name || "—"}</p>
              )}
            </Field>
          </div>

          <div className="space-y-2.5 pt-3">
            <p className="text-[0.68rem] font-black uppercase tracking-wider text-[var(--muted)]">{tr("Pecahan Pendapatan Kasar", "Employment Remuneration")}</p>
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
                {editing ? <NumInput value={f.total_employment_income ?? ""} onChange={(v) => setNum("total_employment_income", v)} /> : <p className="text-sm font-black text-[var(--text)]"><RM value={f.total_employment_income} /></p>}
              </Field>
            </div>
          </div>

          <div className="space-y-2.5 pt-3">
            <p className="text-[0.68rem] font-black uppercase tracking-wider text-[var(--muted)]">{tr("Potongan & Caruman", "Deductions & Contributions")}</p>
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
              <GhostButton onClick={() => setEditing(false)}>{tr("Batal Edit", "Cancel")}</GhostButton>
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
    try {
      await api("/income", {
        method: "POST",
        body: JSON.stringify({
          assessment_year: year,
          income_type: draft.income_type,
          source_type: "manual",
          employer_name: draft.income_type === "employment" ? draft.employer_name || undefined : undefined,
          gross_amount: draft.gross_amount ? Number(draft.gross_amount) : 0,
          taxable_amount: draft.taxable_amount ? Number(draft.taxable_amount) : (draft.gross_amount ? Number(draft.gross_amount) : 0),
          business_name: draft.income_type === "business" ? draft.business_name || undefined : undefined,
          business_expenses: draft.business_expenses ? Number(draft.business_expenses) : null,
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

  return (
    <div className="space-y-4">
      <SectionLabel
        right={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-3.5 py-1.5 text-xs font-bold text-[var(--btn-primary-text)] shadow-2xs hover:opacity-90 transition active:scale-95 cursor-pointer"
          >
            <Plus size={13} />
            <span>{tr("Tambah Pendapatan", "Add Income")}</span>
          </button>
        }
      >
        {tr("Senarai Pendapatan", "Income Records")} — YA {year}
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
            <Card key={r.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-2xl",
                  r.income_type === "business" ? "bg-amber-500/15 text-amber-600" : "bg-sky-500/15 text-sky-600"
                )}>
                  {r.income_type === "business" ? <Briefcase size={18} /> : <Building size={18} />}
                </div>
                <div>
                  <h4 className="text-sm font-black text-[var(--text)]">
                    {r.income_type === "business" ? r.business_name || tr("Perniagaan", "Business") : r.employer_name || tr("Pekerjaan", "Employment")}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[0.65rem] font-bold text-[var(--muted)]">
                      {r.source_type === "ea" ? tr("Borang EA Majikan", "EA Form") : tr("Kemasukan Manual", "Manual Entry")}
                    </span>
                    {r.business_expenses != null && (
                      <span className="text-[0.65rem] text-[var(--muted)]">
                        {tr("Perbelanjaan", "Expenses")}: <RM value={r.business_expenses} />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-sm sm:text-base font-black text-[var(--text)]"><RM value={r.gross_amount} /></p>
                <p className="text-[0.65rem] text-emerald-600 dark:text-emerald-400 font-bold">{tr("Bercukai", "Taxable")}: <RM value={r.taxable_amount || r.gross_amount} /></p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <Card className="space-y-3.5 border-2 border-[var(--accent)]/30">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-[var(--text)]">{tr("Tambah Rekod Pendapatan", "Add Income Record")}</h4>
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
                    "flex-1 rounded-xl border py-2 text-xs font-bold transition cursor-pointer",
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
            <Field label={tr("Perbelanjaan Dibenarkan (RM)", "Allowable Business Expenses (RM)")}>
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

  async function saveRelief(code: string) {
    const val = Number(drafts[code] || 0)
    try {
      await api("/reliefs", {
        method: "POST",
        body: JSON.stringify({ assessment_year: year, relief_code: code, claimed_amount: val }),
      })
      setDrafts({ ...drafts, [code]: "" })
      await load()
      await refreshMetrics()
      showNotice(tr("Pelepasan cukai berjaya dikemas kini!", "Relief updated successfully!"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    }
  }

  const groupLabels: Record<string, { nameBm: string; nameEn: string; icon: any; color: string }> = {
    personal: { nameBm: "Individu & Diri Sendiri", nameEn: "Personal & Individual", icon: User, color: "text-sky-500 bg-sky-500/10" },
    epf_insurance: { nameBm: "KWSP, Insurans & PRS", nameEn: "EPF, Insurance & PRS", icon: Shield, color: "text-indigo-500 bg-indigo-500/10" },
    medical: { nameBm: "Rawatan Perubatan & Kesihatan", nameEn: "Medical & Health", icon: Heart, color: "text-rose-500 bg-rose-500/10" },
    lifestyle: { nameBm: "Gaya Hidup & Gajet", nameEn: "Lifestyle & Gadgets", icon: Smartphone, color: "text-amber-500 bg-amber-500/10" },
    education: { nameBm: "Pendidikan & Pengajian", nameEn: "Education & Studies", icon: GraduationCap, color: "text-violet-500 bg-violet-500/10" },
    children: { nameBm: "Anak & Penjagaan", nameEn: "Children & Childcare", icon: Heart, color: "text-emerald-500 bg-emerald-500/10" },
    parents: { nameBm: "Ibu Bapa & Keluarga", nameEn: "Parents & Family", icon: UserCircle2, color: "text-teal-500 bg-teal-500/10" },
    other: { nameBm: "Pelepasan Lain (SSPN, EV, SOCSO)", nameEn: "Other Reliefs (SSPN, EV, SOCSO)", icon: Gift, color: "text-slate-500 bg-slate-500/10" },
  }

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return reliefs
    const q = searchQuery.toLowerCase()
    return reliefs.filter((r) => r.name?.toLowerCase().includes(q) || r.relief_code?.toLowerCase().includes(q))
  }, [reliefs, searchQuery])

  const grouped: Record<string, any[]> = {}
  filtered.forEach((r) => {
    const g = r.group || "other"
    ;(grouped[g] = grouped[g] || []).push(r)
  })

  const totalClaimed = reliefs.reduce((acc, r) => acc + (r.claimed_amount || 0), 0)

  return (
    <div className="space-y-4">
      {/* Header Info Banner */}
      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface-tint)]">
        <div>
          <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Jumlah Pelepasan Dituntut", "Total Reliefs Claimed")}</span>
          <h3 className="text-2xl font-black text-[var(--text)]"><RM value={totalClaimed} /></h3>
          <p className="text-xs text-[var(--muted)]">{tr("Mengurangkan pendapatan bercukai anda mengikut jadual LHDN.", "Reduces your chargeable income per HASiL rules.")}</p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-3 text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr("Cari pelepasan…", "Search reliefs…")}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] pl-9 pr-3.5 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </Card>

      {/* Grouped Relief List */}
      {loading ? (
        <Skeleton />
      ) : Object.keys(grouped).length === 0 ? (
        <Card className="text-center py-8 text-sm text-[var(--muted)]">{tr("Tiada pelepasan dijumpai.", "No reliefs found.")}</Card>
      ) : (
        Object.entries(grouped).map(([groupKey, list]) => {
          const gInfo = groupLabels[groupKey] || { nameBm: groupKey, nameEn: groupKey, icon: Gift, color: "text-slate-500 bg-slate-500/10" }
          const GroupIcon = gInfo.icon

          return (
            <div key={groupKey} className="space-y-2">
              <div className="flex items-center gap-2 px-1 pt-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg text-xs", gInfo.color)}>
                  <GroupIcon size={13} />
                </div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  {tr(gInfo.nameBm, gInfo.nameEn)}
                </h4>
              </div>

              <Card className="space-y-1.5 p-2 sm:p-3 divide-y divide-[var(--border)]/60">
                {list.map((r) => {
                  const claimed = r.claimed_amount || 0
                  const limit = r.max_limit
                  const pct = limit ? Math.min(100, (claimed / limit) * 100) : claimed > 0 ? 100 : 0
                  const isMaxed = limit && claimed >= limit
                  const isExp = expanded === r.relief_code

                  return (
                    <div key={r.relief_code} className="pt-2 first:pt-0">
                      <button
                        type="button"
                        onClick={() => setExpanded(isExp ? null : r.relief_code)}
                        className="flex w-full items-center justify-between p-2 rounded-2xl hover:bg-[var(--surface-tint)]/60 transition text-left cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">{r.name}</p>
                            {isMaxed && (
                              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[0.6rem] font-black text-emerald-600 dark:text-emerald-400">
                                MAX
                              </span>
                            )}
                          </div>
                          <p className="text-[0.68rem] text-[var(--muted)]">
                            {tr("Had Maksimum", "Max Limit")}: <span className="font-bold text-[var(--text)]">{limit ? `RM ${Number(limit).toLocaleString("en-MY")}` : tr("Tiada Had", "No Limit")}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className={cn("text-xs sm:text-sm font-black", claimed > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--text)]")}>
                              <RM value={claimed} />
                            </span>
                          </div>
                          <ChevronRight size={16} className={cn("text-[var(--muted)] transition-transform duration-200", isExp && "rotate-90")} />
                        </div>
                      </button>

                      {/* Progress Bar */}
                      <div className="px-2 pb-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                          <div
                            className={cn("h-full rounded-full transition-all duration-300", isMaxed ? "bg-emerald-500" : "bg-[var(--accent)]")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Expanded Claim Box */}
                      {isExp && (
                        <div className="mt-2 space-y-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5 animate-in fade-in duration-150">
                          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                            <div className="flex-1">
                              <Field label={tr("Jumlah Dituntut (RM)", "Amount Claimed (RM)")}>
                                <NumInput
                                  value={drafts[r.relief_code] ?? (claimed ? String(claimed) : "")}
                                  onChange={(v) => setDrafts({ ...drafts, [r.relief_code]: v })}
                                  placeholder={limit ? `Maksimum: RM ${limit}` : "0.00"}
                                />
                              </Field>
                            </div>
                            <button
                              type="button"
                              onClick={() => saveRelief(r.relief_code)}
                              className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-4 text-xs font-black text-[var(--btn-primary-text)] shadow-xs hover:opacity-90 transition active:scale-95 cursor-pointer"
                            >
                              <Check size={14} />
                              <span>{tr("Simpan", "Save")}</span>
                            </button>
                          </div>

                          {r.doc_requirement && (
                            <div className="flex items-center gap-1.5 text-[0.68rem] text-[var(--muted)] bg-[var(--card)] p-2 rounded-xl border border-[var(--border)]">
                              <Info size={13} className="text-[var(--accent)] shrink-0" />
                              <span>{tr("Dokumen / Resit diperlukan", "Required proof")}: {r.doc_requirement}</span>
                            </div>
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

function RebatesTab({ year, tr, api, refreshMetrics, showNotice }: any) {
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
    if (!amount || Number(amount) <= 0) return
    setBusy(true)
    try {
      await api("/rebates", {
        method: "POST",
        body: JSON.stringify({
          assessment_year: year,
          rebate_code: "rebate_zakat",
          amount: Number(amount || 0),
          source: "manual",
        }),
      })
      setAmount("")
      await load()
      await refreshMetrics()
      showNotice(tr("Zakat direkodkan sebagai rebat cukai!", "Zakat recorded as tax rebate!"))
    } catch (e: any) {
      showNotice(e.message || "Error", "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Explanatory Banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/5 space-y-2">
        <div className="flex items-center gap-2">
          <BadgePercent size={18} className="text-emerald-600 dark:text-emerald-400" />
          <h4 className="text-sm font-black text-[var(--text)]">{tr("Kelebihan Rebat Cukai & Zakat", "Tax Rebates & Zakat Advantage")}</h4>
        </div>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          {tr("Rebat cukai dan bayaran Zakat (Fitrah / Harta) ditolak secara 1-ke-1 (Ringgit-ke-Ringgit) daripada jumlah Cukai Kasar yang perlu dibayar, bukan sekadar mengurangkan pendapatan bercukai.", "Tax rebates and Zakat payments offset your gross tax liability dollar-for-dollar directly.")}
        </p>
      </Card>

      {/* Record Zakat Card */}
      <SectionLabel>{tr("Rekod Pembayaran Zakat", "Record Zakat Payment")}</SectionLabel>
      <Card className="space-y-3.5">
        <Field label={tr("Jumlah Zakat Dibayar (RM)", "Zakat Paid Amount (RM)")} hint={tr("Zakat Fitrah & Zakat Pendapatan", "Zakat Fitrah / Wealth")}>
          <NumInput value={amount} onChange={setAmount} placeholder="0.00" />
        </Field>
        <PrimaryButton onClick={addZakat} disabled={busy || !amount}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          <span>{tr("Rekod Bayaran Zakat", "Record Zakat Payment")}</span>
        </PrimaryButton>
      </Card>

      {/* Rebates List */}
      <SectionLabel>{tr("Senarai Rebat Diperoleh", "Applied Rebates")}</SectionLabel>
      {loading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Card className="text-center py-6 text-sm text-[var(--muted)]">{tr("Tiada rebat direkodkan.", "No rebates recorded.")}</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="flex items-center justify-between p-3.5">
              <div>
                <p className="text-xs sm:text-sm font-black text-[var(--text)]">{r.name || r.rebate_code}</p>
                <p className="text-[0.68rem] text-[var(--muted)] capitalize">{r.source}</p>
              </div>
              <p className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400"><RM value={r.amount} /></p>
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
                  <h4 className="text-xs sm:text-sm font-black text-[var(--text)]">Tx #{l.transaction_id} · {l.tax_type}</h4>
                  <p className="text-[0.68rem] text-[var(--muted)]">{l.notes || tr("Pelepasan Dituntut", "Claimed relief")}</p>
                </div>
                <span className="text-sm font-black text-[var(--text)]"><RM value={l.claim_amount} /></span>
              </div>

              <div className="flex gap-1.5 pt-1">
                {["accepted", "reviewed", "rejected"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(l.id, s)}
                    className={cn(
                      "flex-1 rounded-xl border py-1.5 text-[0.68rem] font-bold capitalize transition cursor-pointer",
                      l.status === s
                        ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                        : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
                    )}
                  >
                    {s}
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
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    fd.append("assessment_year", String(year))
    fd.append("document_type", docType)
    setUploading(true)
    try {
      const token = getAccessToken()
      const headers: Record<string, string> = {}
      if (token && !isCookieAuthSentinel(token)) headers["Authorization"] = `Bearer ${token}`

      await fetch(`/api/tax/documents`, {
        method: "POST",
        headers,
        credentials: "include",
        body: fd,
      })
      await load()
      showNotice(tr("Dokumen berjaya dimuat naik!", "Document uploaded!"))
    } catch (e: any) {
      showNotice(e.message || "Upload error", "error")
    } finally {
      setUploading(false)
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
            className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] outline-none cursor-pointer"
          >
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {tr(v.labelBm, v.labelEn)}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-3 text-xs font-black text-[var(--btn-primary-text)] shadow-xs hover:opacity-95 transition active:scale-95">
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
              <p className="px-1 text-[0.68rem] font-black uppercase tracking-wider text-[var(--muted)]">
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
                        <p className="truncate text-xs font-black text-[var(--text)]">{d.original_filename}</p>
                        <p className="text-[0.65rem] text-[var(--muted)]">{d.document_date || "—"}</p>
                      </div>
                    </div>
                    <a
                      href={`/api/tax/documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition"
                    >
                      <Download size={13} />
                      <span>{tr("Buka", "View")}</span>
                    </a>
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

function EstimateTab({ year, tr, api, calcData, refreshMetrics }: any) {
  const balance = calcData?.estimated_balance ?? 0
  const isPositiveRefund = balance >= 0

  return (
    <div className="space-y-4">
      {/* Position Hero Card */}
      <Card className={cn(
        "relative overflow-hidden border-2 p-5 sm:p-6 transition-all",
        isPositiveRefund
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-[var(--card)]"
          : "border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-[var(--card)]"
      )}>
        <span className="text-[0.68rem] font-black uppercase tracking-wider text-[var(--muted)]">
          {tr("Pengiraan Cukai Muktamad", "Tax Computation Summary")} · YA {year}
        </span>
        <h3 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-[var(--text)]">
          {isPositiveRefund ? "+" : "-"}<RM value={Math.abs(balance)} />
        </h3>
        <p className={cn("mt-1 text-xs font-bold", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
          {isPositiveRefund ? tr("Anggaran Lebihan Bayaran PCB (Bayaran Balik / Refund)", "Estimated PCB Overpayment (Refund)") : tr("Anggaran Baki Cukai Perlu Dibayar", "Estimated Tax Payable")}
        </p>
      </Card>

      {/* Step by Step Breakdown Card */}
      <Card className="space-y-3.5 p-5">
        <h4 className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
          {tr("Jadual Pengiraan Berperingkat HASiL", "HASiL Progressive Tax Schedule")}
        </h4>

        <div className="space-y-2.5 text-xs sm:text-sm">
          <CalcRow label={tr("1. Jumlah Pendapatan Agregat", "1. Aggregate Gross Income")} value={calcData?.income_total} />
          <CalcRow label={tr("2. (-) Jumlah Pelepasan Cukai Layak", "2. (-) Total Eligible Reliefs")} value={calcData?.relief_total} negative />
          <div className="pt-2 border-t border-[var(--border)]">
            <CalcRow label={tr("3. (=) Pendapatan Bercukai (Chargeable Income)", "3. (=) Chargeable Income")} value={calcData?.chargeable_income} strong />
          </div>
          <CalcRow label={tr("4. Cukai Kasar (Kadar Berperingkat LHDN)", "4. Gross Tax (Progressive Brackets)")} value={calcData?.gross_tax} />
          <CalcRow label={tr("5. (-) Rebat Cukai & Zakat", "5. (-) Tax Rebates & Zakat")} value={calcData?.rebate_total} negative />
          <div className="pt-2 border-t border-[var(--border)]">
            <CalcRow label={tr("6. (=) Cukai Kena Bayar Sebenar", "6. (=) Net Tax Payable")} value={calcData?.net_tax} strong />
          </div>
          <CalcRow label={tr("7. (-) Potongan Cukai Bulanan (PCB) Telah Dibayar", "7. (-) Monthly Tax Deduction (PCB) Paid")} value={calcData?.pcb_total} negative />
          <div className="pt-3 border-t-2 border-[var(--border)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-[var(--text)]">{tr("8. (=) Kedudukan Akhir Cukai", "8. (=) Final Tax Balance")}</span>
              <span className={cn("text-lg font-black", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                {isPositiveRefund ? "+" : "-"}<RM value={Math.abs(balance)} />
              </span>
            </div>
          </div>
        </div>
      </Card>

      <p className="px-1 text-[0.65rem] leading-relaxed text-[var(--muted)]">
        {tr(DISCLAIMER_BM, DISCLAIMER_EN)}
      </p>
    </div>
  )
}

function CalcRow({ label, value, negative, strong }: { label: string; value: number | null | undefined; negative?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(strong ? "font-black text-[var(--text)]" : "text-[var(--muted)]")}>{label}</span>
      <span className={cn(strong ? "font-black text-base text-[var(--text)]" : "font-bold text-[var(--text)]", negative && "text-rose-500")}>
        {negative ? "-" : ""}<RM value={value} />
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

  return (
    <div className="space-y-4">
      {/* Official Executive Summary Certificate Card */}
      <Card className="border-2 border-[var(--accent)]/40 p-5 sm:p-6 space-y-4 shadow-md bg-[var(--card)]">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">{tr("Ringkasan Cukai e-Filing", "e-Filing Tax Summary")}</h3>
              <p className="text-xs text-[var(--muted)]">Tahun Taksiran (YA) {year}</p>
            </div>
          </div>
          <span className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-xs font-mono font-bold text-[var(--text)] border border-[var(--border)]">
            HASiL / LHDN
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-[var(--muted)] font-bold">{tr("Status Pemastautin", "Residency")}</span>
            <p className="font-black text-[var(--text)] capitalize">{profile?.residency_status || "Resident"}</p>
          </div>
          <div>
            <span className="text-[var(--muted)] font-bold">{tr("Sumber Pendapatan", "Income Source")}</span>
            <p className="font-black text-[var(--text)] capitalize">{profile?.income_source || "Employment"}</p>
          </div>
          <div>
            <span className="text-[var(--muted)] font-bold">{tr("Jumlah Pendapatan", "Total Income")}</span>
            <p className="font-black text-[var(--text)]"><RM value={calcData?.income_total} /></p>
          </div>
          <div>
            <span className="text-[var(--muted)] font-bold">{tr("Jumlah Pelepasan", "Total Reliefs")}</span>
            <p className="font-black text-rose-500">-<RM value={calcData?.relief_total} /></p>
          </div>
          <div>
            <span className="text-[var(--muted)] font-bold">{tr("Rebat & Zakat", "Rebates & Zakat")}</span>
            <p className="font-black text-emerald-600 dark:text-emerald-400">-<RM value={calcData?.rebate_total} /></p>
          </div>
          <div>
            <span className="text-[var(--muted)] font-bold">PCB (MTD) Dibayar</span>
            <p className="font-black text-emerald-600 dark:text-emerald-400">-<RM value={calcData?.pcb_total} /></p>
          </div>
        </div>

        <div className={cn(
          "rounded-2xl p-4 text-center border",
          isPositiveRefund ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"
        )}>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            {isPositiveRefund ? tr("Anggaran Lebihan Bayaran (Refund)", "Estimated Refund") : tr("Anggaran Baki Cukai", "Estimated Tax to Settle")}
          </span>
          <p className={cn("text-3xl font-black mt-0.5", isPositiveRefund ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
            {isPositiveRefund ? "+" : "-"}<RM value={Math.abs(balance)} />
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={saveSnapshot}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-3 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition cursor-pointer"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
            <span>{tr("Simpan ke Sejarah", "Save to History")}</span>
          </button>
          <a
            href={`/api/tax/export?assessment_year=${year}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-3 text-xs font-black text-[var(--btn-primary-text)] shadow-sm hover:opacity-95 transition"
          >
            <Download size={16} />
            <span>{tr("Muat Turun Tax Pack (PDF)", "Export Tax Pack (PDF)")}</span>
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
                  <p className="text-xs font-black text-[var(--text)]">YA {h.assessment_year} · {new Date(h.created_at).toLocaleDateString()}</p>
                  <p className="text-[0.68rem] text-[var(--muted)]">{tr("Cukai", "Tax")}: <RM value={h.net_tax} /> · PCB: <RM value={h.pcb_total} /></p>
                </div>
                <p className={cn("text-sm font-black", hPos ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
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
