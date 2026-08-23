"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Landmark, LayoutDashboard, UserCircle2, Briefcase, FileText, Gift,
  BadgePercent, Receipt, FolderOpen, Calculator, ClipboardCheck,
  ChevronDown, ChevronRight, Check, Loader2, Camera, Upload, Plus,
  Trash2, ShieldCheck, AlertTriangle, Info, Sparkles, Banknote,
  FileUp, PencilLine, X, Eye, EyeOff, Search, Download, ArrowLeft,
} from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { MobilePageHeader, DesktopPageHeader, DesktopPageBody } from "@/components/layout/PageHeader"
import { UserAvatar } from "@/components/ui/UserAvatar"
import { cn } from "@/lib/utils"

type TabKey =
  | "dashboard" | "profile" | "income" | "ea" | "reliefs"
  | "rebates" | "transactions" | "documents" | "estimate" | "summary"

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "profile", label: "Tax Profile", icon: UserCircle2 },
  { key: "ea", label: "EA / EC", icon: FileText },
  { key: "income", label: "Income", icon: Briefcase },
  { key: "reliefs", label: "Reliefs", icon: Gift },
  { key: "rebates", label: "Rebates", icon: BadgePercent },
  { key: "transactions", label: "Transactions", icon: Receipt },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "estimate", label: "Estimate", icon: Calculator },
  { key: "summary", label: "Summary", icon: ClipboardCheck },
]

const YEARS = [2027, 2026, 2025, 2024]

export default function TaxPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const router = useRouter()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const [year, setYear] = useState(2026)
  const [tab, setTab] = useState<TabKey>("dashboard")
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")

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
      throw new Error(err.detail || "Ralat")
    }
    return res.json()
  }, [authHeaders])

  const showNotice = useCallback((msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(""), 3000)
  }, [])

  // load profile once for header
  const [profile, setProfile] = useState<any>(null)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const p = await api(`/profile?assessment_year=${year}`)
        if (mounted) setProfile(p)
      } catch (e) { /* ignore */ } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  return (
    <div className="space-y-4 pb-24 md:space-y-0 md:pb-0">
      {/* ─── Mobile View ─── */}
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Cukai", "Tax")}
          fallbackHref={`/${sessionId}`}
          action={
            <div className="flex items-center gap-1.5">
              <YearPicker year={year} onChange={setYear} tr={tr} />
            </div>
          }
        />
        <TabBar tab={tab} setTab={setTab} />
        {notice && <NoticeBar msg={notice} />}
        {loading ? <Skeleton /> : (
          <div className="px-1">
            <ActiveTab
              tab={tab} year={year} tr={tr} api={api} sessionId={sessionId}
              profile={profile} setProfile={setProfile} showNotice={showNotice}
            />
          </div>
        )}
      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Cukai Pendapatan", "Income Tax")} />
        <DesktopPageBody className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <YearPicker year={year} onChange={setYear} tr={tr} />
            <p className="text-sm text-[var(--muted)]">{tr("Sumber: HASiL", "Source: HASiL")}</p>
          </div>
          <TabBar tab={tab} setTab={setTab} />
          {notice && <NoticeBar msg={notice} />}
          {loading ? <Skeleton /> : (
            <ActiveTab
              tab={tab} year={year} tr={tr} api={api} sessionId={sessionId}
              profile={profile} setProfile={setProfile} showNotice={showNotice}
            />
          )}
        </DesktopPageBody>
      </div>
    </div>
  )
}

/* ─────────────────────────── shared bits ─────────────────────────── */

function YearPicker({ year, onChange, tr }: { year: number; onChange: (y: number) => void; tr: (b: string, e: string) => string }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)]">
      <CalendarIcon className="h-3.5 w-3.5 text-[var(--muted)]" />
      <span className="uppercase tracking-wide text-[var(--muted)]">YA</span>
      <select
        value={year}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="bg-transparent text-[var(--text)] outline-none"
      >
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <ChevronDown size={14} className="text-[var(--muted)]" />
    </label>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
}

function TabBar({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const active = t.key === tab
        const Icon = t.icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition",
              active ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                     : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
            )}
          >
            <Icon size={13} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function NoticeBar({ msg }: { msg: string }) {
  return (
    <div className="px-1">
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
        <Check size={14} /> {msg}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3 px-1">
      <div className="h-28 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
      <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-tint)]" />
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm", className)}>{children}</div>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{children}</p>
}

function RM({ value }: { value: number | null | undefined }) {
  return <span>{value == null ? "—" : `RM ${Number(value).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, placeholder, type }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type || "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
    />
  )
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "0.00"}
      className="mt-1 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--text)] outline-none focus:border-[var(--input-focus)]"
    />
  )
}

function PrimaryButton({ children, onClick, disabled, type }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type || "button"}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 text-xs font-bold text-[var(--text)] transition active:scale-[0.98]"
    >
      {children}
    </button>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {msg}
    </div>
  )
}

/* ─────────────────────────── active tab dispatcher ─────────────────────────── */

function ActiveTab(props: {
  tab: TabKey; year: number; tr: (b: string, e: string) => string
  api: (p: string, o?: RequestInit) => Promise<any>
  sessionId: string; profile: any; setProfile: (p: any) => void; showNotice: (m: string) => void
}) {
  switch (props.tab) {
    case "dashboard": return <DashboardTab {...props} />
    case "profile": return <ProfileTab {...props} />
    case "ea": return <EATab {...props} />
    case "income": return <IncomeTab {...props} />
    case "reliefs": return <ReliefsTab {...props} />
    case "rebates": return <RebatesTab {...props} />
    case "transactions": return <TxTab {...props} />
    case "documents": return <DocsTab {...props} />
    case "estimate": return <EstimateTab {...props} />
    case "summary": return <SummaryTab {...props} />
    default: return <DashboardTab {...props} />
  }
}

const DISCLAIMER = "MyPeribadi helps organize tax information and provides estimates based on the information you provide and the applicable Tax Rules configured for the selected assessment year. Final eligibility, tax liability and filing remain subject to HASiL requirements and your official tax return."

/* ─────────────────────────── Dashboard ─────────────────────────── */

function DashboardTab({ year, tr, api }: any) {
  const [calc, setCalc] = useState<any>(null)
  const [ready, setReady] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, r] = await Promise.all([
        api(`/dashboard?assessment_year=${year}`),
        api(`/readiness?assessment_year=${year}`),
      ])
      setCalc(c); setReady(r)
    } catch (e) { } finally { setLoading(false) }
  }, [api, year])

  useEffect(() => { load() }, [load])

  const positive = (calc?.estimated_balance ?? 0) >= 0
  const needAttention = (ready?.attention?.length || 0) + (ready?.pending_links || 0)

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden bg-gradient-to-br from-teal-600/30 to-emerald-600/10">
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[var(--accent)]/10 blur-3xl" />
        <p className="relative text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Kedudukan Cukai", "Tax Position")}</p>
        <p className="relative mt-1 text-3xl font-black tracking-tight text-[var(--text)]">
          {positive ? "+" : ""}{calc ? `RM ${Number(Math.abs(calc.estimated_balance)).toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "—"}
        </p>
        <p className="relative mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {positive ? tr("Anggaran Lebihan PCB", "Estimated Overpayment") : tr("Anggaran Cukai Belum Bayar", "Estimated Tax To Pay")}
        </p>
      </Card>

      {/* Readiness */}
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-[var(--text)]">{tr("Kesediaan Cukai", "Tax Readiness")}</p>
          <p className="text-xl font-black text-[var(--text)]">{ready?.score ?? 0}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${ready?.score ?? 0}%` }} />
        </div>
        <div className="mt-3 space-y-1.5">
          {ready && Object.entries(ready.checks).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">{k}</span>
              {v ? <Check size={15} className="text-emerald-500" /> : <span className="text-[var(--muted)]">•</span>}
            </div>
          ))}
        </div>
      </Card>

      {needAttention > 0 && (
        <Card className="border-amber-500/30">
          <p className="text-sm font-extrabold text-[var(--text)]">{needAttention} {tr("perkara perlu perhatian", "items need attention")}</p>
          <div className="mt-2 space-y-2">
            {(ready?.attention || []).map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-[var(--text)]">{a.name}</p>
                  <p className="text-[var(--muted)]">{a.issue}</p>
                </div>
                <span className="font-bold text-[var(--text)]"><RM value={a.amount} /></span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label={tr("Pendapatan", "Income")} value={calc?.income_total} />
        <Stat label={tr("Relief", "Reliefs")} value={calc?.relief_total} />
        <Stat label={tr("PCB", "PCB")} value={calc?.pcb_total} />
      </div>

      <p className="px-1 text-[0.6rem] leading-relaxed text-[var(--muted)]">{tr(DISCLAIMER, DISCLAIMER)}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-[0.65rem] font-bold text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-black text-[var(--text)]">{value == null ? "—" : `RM ${Number(value).toLocaleString("en-MY")}`}</p>
    </Card>
  )
}

/* ─────────────────────────── Tax Profile ─────────────────────────── */

function ProfileTab({ year, tr, api, profile, setProfile, showNotice }: any) {
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
      const p = await api(`/profile?assessment_year=${year}`, { method: "PATCH", body: JSON.stringify(body) })
      setProfile(p)
      setTin("")
      showNotice(tr("Profil cukai disimpan", "Tax profile saved"))
    } catch (e: any) { showNotice(e.message || "Ralat") } finally { setBusy(false) }
  }

  const options = (list: { field: string; val: any }[], active: string) => (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {list.map((opt) => {
        const sel = form[opt.field] === opt.val
        return (
          <button key={opt.val} type="button"
            onClick={() => setForm({ ...form, [opt.field]: opt.val })}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition",
              sel ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                  : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]")}
          >{opt.val}</button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      <SectionLabel>{tr("Status Cukai", "Tax Status")}</SectionLabel>
      <Card className="space-y-4">
        <Field label={tr("Status Pemastautin", "Tax Residency")}>
          {options([{ field: "residency_status", val: "resident" }, { field: "residency_status", val: "non_resident" }], form.residency_status)}
        </Field>
        <Field label={tr("Status Perkahwinan", "Marital Status")}>
          {options([
            { field: "marital_status", val: "single" }, { field: "marital_status", val: "married" },
            { field: "marital_status", val: "divorced" }, { field: "marital_status", val: "widowed" },
          ], form.marital_status)}
        </Field>
        <Field label={tr("Sumber Pendapatan", "Income Source")}>
          {options([
            { field: "income_source", val: "employment" }, { field: "income_source", val: "business" }, { field: "income_source", val: "both" },
          ], form.income_source)}
        </Field>
        <Field label={tr("Individu OKU", "Disabled Individual")}>
          {options([
            { field: "disabled_status", val: false }, { field: "disabled_status", val: true },
          ], form.disabled_status)}
        </Field>
      </Card>

      {form.marital_status === "married" && (
        <>
          <SectionLabel>{tr("Pasangan", "Spouse")}</SectionLabel>
          <Card className="space-y-4">
            <Field label={tr("Pendapatan Pasangan", "Spouse Income")}>
              {options([
                { field: "spouse_income_status", val: "has_income" }, { field: "spouse_income_status", val: "no_income" },
              ], form.spouse_income_status)}
            </Field>
            <Field label={tr("Taksiran", "Assessment")}>
              {options([
                { field: "assessment_type", val: "separate" }, { field: "assessment_type", val: "joint" },
              ], form.assessment_type)}
            </Field>
          </Card>
        </>
      )}

      <SectionLabel>{tr("Zakat", "Zakat")}</SectionLabel>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold text-[var(--text)]">{tr("Jejak zakat untuk rebat?", "Track zakat for tax rebate?")}</p>
            <p className="text-xs text-[var(--muted)]">{tr("Zakat dikendalikan oleh Rebat, bukan Relief", "Zakat is handled by Rebates, not Reliefs")}</p>
          </div>
          <button type="button" onClick={() => setForm({ ...form, zakat_tracking_enabled: !form.zakat_tracking_enabled })}
            className={cn("h-7 w-12 rounded-full p-1 transition", form.zakat_tracking_enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-tint-strong)]")}>
            <div className={cn("h-5 w-5 rounded-full bg-white transition", form.zakat_tracking_enabled && "translate-x-5")} />
          </button>
        </div>
      </Card>

      <SectionLabel>{tr("TIN", "TIN")}</SectionLabel>
      <Card className="space-y-3">
        <p className="text-xs text-[var(--muted)]">{tr("Nombor Pengenalan Cukai (sensitif — disulitkan)", "Tax Identification Number (sensitive — encrypted)")}</p>
        {profile?.tax_identifier_masked && (
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <ShieldCheck size={16} className="text-emerald-500" />
            {profile.tax_identifier_masked}
          </div>
        )}
        <TextInput value={tin} onChange={setTin} placeholder={tr("Masukkan TIN baru", "Enter new TIN")} />
        <ErrorBox msg="" />
      </Card>

      <PrimaryButton onClick={save} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {tr("Simpan Profil Cukai", "Save Tax Profile")}
      </PrimaryButton>
    </div>
  )
}

/* ─────────────────────────── EA / EC ─────────────────────────── */

function EATab({ year, tr, api, showNotice }: any) {
  const [forms, setForms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [stage, setStage] = useState("")
  const [reviewing, setReviewing] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setForms(await api(`/ea-forms?assessment_year=${year}`)) } catch (e) { } finally { setLoading(false) }
  }, [api, year])
  useEffect(() => { load() }, [load])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    fd.append("assessment_year", String(year))
    setUploading(true)
    setStage(tr("Memuat naik…", "Uploading…"))
    try {
      setStage(tr("Membaca dokumen…", "Reading document…"))
      const form = await fetch(`/api/tax/ea-forms/upload?assessment_year=${year}`, {
        method: "POST", headers: authHeadersSafe(), credentials: "include", body: fd,
      }).then(async (r) => { if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Gagal") } return r.json() })
      setStage(tr("Sedia untuk semakan", "Ready for review"))
      setForms(await api(`/ea-forms?assessment_year=${year}`))
      setReviewing(form)
    } catch (err: any) {
      showNotice(err.message || "Gagal muat naik")
    } finally { setUploading(false); setStage("") }
  }

  function authHeadersSafe(): HeadersInit {
    const token = getAccessToken()
    const h: Record<string, string> = {}
    if (token && !isCookieAuthSentinel(token)) h["Authorization"] = `Bearer ${token}`
    return h
  }

  async function confirmForm(id: number) {
    try {
      await api(`/ea-forms/${id}/confirm`, { method: "POST" })
      setReviewing(null)
      setForms(await api(`/ea-forms?assessment_year=${year}`))
      showNotice(tr("EA disahkan", "EA confirmed"))
    } catch (e: any) { showNotice(e.message || "Ralat") }
  }

  const totalIncome = forms.reduce((s, f) => s + (f.total_employment_income || 0), 0)

  return (
    <div className="space-y-4">
      {/* Upload */}
      <Card className="border-dashed text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
          <FileUp size={20} />
        </div>
        <p className="mt-2 text-sm font-extrabold text-[var(--text)]">{tr("Muat Naik Borang EA / EC", "Upload EA / EC Form")}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{tr("Muat naik penyata gaji tahunan untuk mempercepatkan penyediaan profil cukai.", "Upload your annual remuneration statement to speed up Tax Profile setup.")}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Camera size={15} /> <span className="text-xs text-[var(--muted)]">PDF · JPG · PNG</span>
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-[var(--btn-primary-text)]">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {stage || (uploading ? tr("Memproses…", "Processing…") : tr("Pilih Dokumen", "Choose Document"))}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} disabled={uploading} />
        </label>
      </Card>

      {/* Review modal */}
      {reviewing && (
        <ReviewEAModal form={reviewing} onConfirm={() => confirmForm(reviewing.id)} onEdit={() => setReviewing({ ...reviewing, editing: true })}
          onClose={() => setReviewing(null)} api={api} tr={tr} year={year} showNotice={showNotice} onSaved={(f: any) => { setReviewing(null); setForms(prev => prev.map(x => x.id === f.id ? f : x)) }} />
      )}

      {loading ? <Skeleton /> : forms.length === 0 ? (
        <Card className="text-center text-sm text-[var(--muted)]">{tr("Belum ada borang EA / EC.", "No EA / EC forms yet.")}</Card>
      ) : (
        <>
          <SectionLabel>{tr("Borang EA / EC", "EA / EC Forms")}</SectionLabel>
          <div className="space-y-2">
            {forms.map((f) => (
              <Card key={f.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-[var(--text)]">{f.employer_name || tr("Majikan", "Employer")}</p>
                  <p className="text-xs text-[var(--muted)]"><RM value={f.total_employment_income} /></p>
                </div>
                {f.review_status === "confirmed" ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-500"><Check size={13} /> Confirmed</span>
                ) : (
                  <button onClick={() => setReviewing(f)} className="rounded-full border border-[var(--btn-primary-bg)] px-3 py-1 text-xs font-bold text-[var(--text)]">
                    {tr("Semak", "Review")}
                  </button>
                )}
              </Card>
            ))}
          </div>
          {forms.length > 1 && (
            <Card className="flex items-center justify-between bg-[var(--surface-tint)]">
              <p className="text-sm font-extrabold text-[var(--text)]">{tr("Jumlah Pendapatan Pekerjaan", "Total Employment Income")}</p>
              <p className="text-base font-black text-[var(--text)]"><RM value={totalIncome} /></p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function ReviewEAModal({ form, onConfirm, onEdit, onClose, api, tr, year, showNotice, onSaved }: any) {
  const [f, setF] = useState<any>({ ...form })
  const [editing, setEditing] = useState<boolean>(!!form.editing)
  const [busy, setBusy] = useState(false)

  const conf = Math.round((form.confidence || 0.5) * 100)

  function num(v: any) { return v == null ? "" : String(v) }
  function setNum(key: string, val: string) {
    const n = val === "" ? null : Number(val)
    setF({ ...f, [key]: val === "" ? null : n !== null && isNaN(n) ? val : n })
  }

  async function save() {
    setBusy(true)
    try {
      const body: any = { ...f, editing: undefined, confidence: f.confidence }
      const saved = await api(`/ea-forms/${f.id}`, { method: "PATCH", body: JSON.stringify(body) })
      onSaved(saved)
      showNotice(tr("EA disahkan & pendapatan dikemas kini", "EA confirmed & income updated"))
    } catch (e: any) { showNotice(e.message || "Ralat") } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[var(--overlay)] backdrop-blur-xs md:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--bg)] p-5 md:rounded-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 items-center rounded-full bg-emerald-500/10 px-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">EA DETECTED</span>
            <span className="text-xs font-bold text-[var(--muted)]">{tr("Keyakinan", "Confidence")}: {conf}%</span>
          </div>
          <button onClick={onClose} className="rounded-full bg-[var(--surface-tint)] p-1.5 text-[var(--muted)]"><X size={16} /></button>
        </div>

        <div className="mt-4 space-y-2.5">
          <ReviewRow label={tr("Majikan", "Employer")} value={f.employer_name} editing={editing} onChange={(v) => setF({ ...f, employer_name: v })} />
          <ReviewRow label={tr("Tahun", "Year")} value={f.assessment_year} editing={false} />
          <div className="border-t border-[var(--border)] pt-2">
            <p className="text-[0.65rem] font-black uppercase tracking-wider text-[var(--muted)]">{tr("Pendapatan Pekerjaan", "Employment Income")}</p>
            <ReviewNumRow label="Salary" value={f.salary} editing={editing} onChange={(v) => setNum("salary", v)} />
            <ReviewNumRow label="Bonus" value={f.bonus} editing={editing} onChange={(v) => setNum("bonus", v)} />
            <ReviewNumRow label="Allowance" value={f.allowances} editing={editing} onChange={(v) => setNum("allowances", v)} />
            <ReviewNumRow label={tr("Jumlah", "Total")} value={f.total_employment_income} editing={editing} onChange={(v) => setNum("total_employment_income", v)} strong />
          </div>
          <div className="border-t border-[var(--border)] pt-2">
            <p className="text-[0.65rem] font-black uppercase tracking-wider text-[var(--muted)]">{tr("Potongan / Sumbangan", "Deductions / Contributions")}</p>
            <ReviewNumRow label="PCB" value={f.pcb_amount} editing={editing} onChange={(v) => setNum("pcb_amount", v)} />
            <ReviewNumRow label="EPF" value={f.epf_amount} editing={editing} onChange={(v) => setNum("epf_amount", v)} />
            <ReviewNumRow label="SOCSO" value={f.socso_amount} editing={editing} onChange={(v) => setNum("socso_amount", v)} />
            <ReviewNumRow label="Zakat" value={f.zakat_amount} editing={editing} onChange={(v) => setNum("zakat_amount", v)} />
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {editing ? (
            <PrimaryButton onClick={save} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {tr("Sahkan & Simpan", "Confirm & Save")}
            </PrimaryButton>
          ) : (
            <>
              <PrimaryButton onClick={onConfirm}>{tr("Sahkan", "Confirm")}</PrimaryButton>
              <GhostButton onClick={() => setEditing(true)}>{tr("Edit", "Edit")}</GhostButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, editing, onChange }: { label: string; value: any; editing?: boolean; onChange?: (v: string) => void }) {
  if (editing && onChange) return <Field label={label}><TextInput value={value || ""} onChange={onChange} /></Field>
  return <div className="flex items-center justify-between text-sm"><span className="text-[var(--muted)]">{label}</span><span className="font-bold text-[var(--text)]">{value ?? "—"}</span></div>
}

function ReviewNumRow({ label, value, editing, onChange, strong }: { label: string; value: any; editing?: boolean; onChange?: (v: string) => void; strong?: boolean }) {
  if (editing && onChange) return (
    <div className="mt-1"><Field label={label}><NumInput value={value ?? ""} onChange={onChange} /></Field></div>
  )
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={cn("font-bold", strong ? "text-base text-[var(--text)]" : "text-[var(--text)]")}>{value == null ? "—" : `RM ${Number(value).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`}</span>
    </div>
  )
}

/* ─────────────────────────── Income ─────────────────────────── */

function IncomeTab({ year, tr, api, showNotice }: any) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<any>({ gross_amount: "", taxable_amount: "", income_type: "employment", business_name: "", business_expenses: "" })

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await api(`/income?assessment_year=${year}`)) } catch (e) { } finally { setLoading(false) }
  }, [api, year])
  useEffect(() => { load() }, [load])

  async function add() {
    try {
      await api("/income", { method: "POST", body: JSON.stringify({
        assessment_year: year,
        income_type: draft.income_type,
        source_type: "manual",
        gross_amount: draft.gross_amount ? Number(draft.gross_amount) : null,
        taxable_amount: draft.taxable_amount ? Number(draft.taxable_amount) : null,
        business_name: draft.business_name || undefined,
        business_expenses: draft.business_expenses ? Number(draft.business_expenses) : null,
        status: "confirmed",
      }) })
      setShowAdd(false)
      setDraft({ gross_amount: "", taxable_amount: "", income_type: "employment", business_name: "", business_expenses: "" })
      load()
      showNotice(tr("Pendapatan ditambah", "Income added"))
    } catch (e: any) { showNotice(e.message || "Ralat") }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel>{tr("Pendapatan", "Income")}</SectionLabel>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-3 py-1.5 text-xs font-bold text-[var(--btn-primary-text)]">
          <Plus size={13} /> {tr("Tambah", "Add")}
        </button>
      </div>

      {loading ? <Skeleton /> : rows.length === 0 ? (
        <Card className="text-center text-sm text-[var(--muted)]">{tr("Belum ada rekod pendapatan. Tambah manual atau sahkan Borang EA.", "No income records yet. Add manually or confirm an EA Form.")}</Card>
      ) : rows.map((r) => (
        <Card key={r.id} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold text-[var(--text)]">{r.income_type === "business" ? r.business_name || "Perniagaan" : r.employer_name || tr("Pekerjaan", "Employment")}</p>
            <p className="text-xs text-[var(--muted)]">{r.source_type === "ea" ? tr("Sumber: Borang EA", "Source: EA Form") : tr("Sumber: Manual", "Source: Manual")}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-[var(--text)]"><RM value={r.gross_amount} /></p>
            {r.business_expenses != null && <p className="text-[0.65rem] text-[var(--muted)]">Expenses: <RM value={r.business_expenses} /></p>}
          </div>
        </Card>
      ))}

      {showAdd && (
        <Card className="space-y-3">
          <Field label={tr("Jenis", "Type")}>
            <div className="mt-1.5 flex gap-1.5">
              {["employment", "business"].map((t) => (
                <button key={t} onClick={() => setDraft({ ...draft, income_type: t })}
                  className={cn("flex-1 rounded-xl border px-3 py-2 text-xs font-bold", draft.income_type === t ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]")}>
                  {t === "employment" ? tr("Pekerjaan", "Employment") : tr("Perniagaan", "Business")}
                </button>
              ))}
            </div>
          </Field>
          {draft.income_type === "business" && (
            <Field label={tr("Nama Perniagaan", "Business Name")}><TextInput value={draft.business_name} onChange={(v) => setDraft({ ...draft, business_name: v })} /></Field>
          )}
          {draft.income_type === "employment" ? (
            <Field label={tr("Pendapatan Kasar", "Gross Income")}><NumInput value={draft.gross_amount} onChange={(v) => setDraft({ ...draft, gross_amount: v })} /></Field>
          ) : (
            <>
              <Field label={tr("Pendapatan Kasar Perniagaan", "Gross Business Income")}><NumInput value={draft.gross_amount} onChange={(v) => setDraft({ ...draft, gross_amount: v })} /></Field>
              <Field label={tr("Perbelanjaan Dibenarkan", "Allowable Expenses")}><NumInput value={draft.business_expenses} onChange={(v) => setDraft({ ...draft, business_expenses: v })} /></Field>
            </>
          )}
          <div className="flex gap-2">
            <GhostButton onClick={() => setShowAdd(false)}>{tr("Batal", "Cancel")}</GhostButton>
            <PrimaryButton onClick={add}><Check size={14} /> {tr("Simpan", "Save")}</PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ─────────────────────────── Reliefs ─────────────────────────── */

function ReliefsTab({ year, tr, api, showNotice }: any) {
  const [reliefs, setReliefs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try { setReliefs(await api(`/reliefs?assessment_year=${year}`)) } catch (e) { } finally { setLoading(false) }
  }, [api, year])
  useEffect(() => { load() }, [load])

  async function save(code: string) {
    const val = Number(drafts[code] || 0)
    try {
      await api("/reliefs", { method: "POST", body: JSON.stringify({ assessment_year: year, relief_code: code, claimed_amount: val }) })
      setDrafts({ ...drafts, [code]: "" })
      load()
      showNotice(tr("Relief dikemas kini", "Relief updated"))
    } catch (e: any) { showNotice(e.message || "Ralat") }
  }

  const groups: Record<string, { name: string; color: string }> = {
    personal: { name: tr("Peribadi", "Personal"), color: "text-sky-500" },
    epf_insurance: { name: tr("EPF / Insurans", "EPF / Insurance"), color: "text-indigo-500" },
    medical: { name: tr("Perubatan", "Medical"), color: "text-rose-500" },
    lifestyle: { name: tr("Gaya Hidup", "Lifestyle"), color: "text-amber-500" },
    education: { name: tr("Pendidikan", "Education"), color: "text-violet-500" },
    children: { name: tr("Anak", "Children"), color: "text-emerald-500" },
    parents: { name: tr("Ibu Bapa / Keluarga", "Parents / Family"), color: "text-teal-500" },
    other: { name: tr("Lain-lain", "Other Reliefs"), color: "text-slate-500" },
  }

  const grouped: Record<string, any[]> = {}
  reliefs.forEach((r) => { const g = r.group || "other"; (grouped[g] = grouped[g] || []).push(r) })

  return (
    <div className="space-y-4">
      <SectionLabel>{tr("Pelepasan Cukai", "Tax Reliefs")} — YA {year}</SectionLabel>
      {loading ? <Skeleton /> : Object.keys(grouped).length === 0 ? (
        <Card className="text-center text-sm text-[var(--muted)]">{tr("Tiada pelepasan.", "No reliefs.")}</Card>
      ) : Object.entries(grouped).map(([g, list]) => (
        <div key={g}>
          <p className={cn("px-1 pb-1.5 text-xs font-black uppercase tracking-wider", groups[g]?.color || "text-slate-500")}>{groups[g]?.name || g}</p>
          <Card className="space-y-1 p-2">
            {list.map((r) => {
              const claimed = r.claimed_amount || 0
              const limit = r.max_limit
              const pct = limit ? Math.min(100, (claimed / limit) * 100) : claimed > 0 ? 100 : 0
              return (
                <div key={r.relief_code}>
                  <button onClick={() => setExpanded(expanded === r.relief_code ? null : r.relief_code)} className="flex w-full items-center justify-between px-2 py-2.5 text-left">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--text)]">{r.name}</p>
                      <p className="text-xs text-[var(--muted)]">{claimed > 0 ? `RM ${Number(claimed).toLocaleString("en-MY")} / ` : ""}{limit ? `RM ${Number(limit).toLocaleString("en-MY")}` : tr("Maksimum", "Max")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-[var(--text)]"><RM value={claimed} /></span>
                      <ChevronRight size={16} className={cn("text-[var(--muted)] transition", expanded === r.relief_code && "rotate-90")} />
                    </div>
                  </button>
                  <div className="px-2 pb-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {expanded === r.relief_code && (
                    <div className="space-y-2 px-2 pb-3 pt-1">
                      <div className="flex items-end gap-2">
                        <Field label={tr("Jumlah Dituntut", "Claimed")}><NumInput value={drafts[r.relief_code] ?? (claimed ? String(claimed) : "")} onChange={(v) => setDrafts({ ...drafts, [r.relief_code]: v })} /></Field>
                        <button onClick={() => save(r.relief_code)} className="mb-0.5 flex h-10 items-center gap-1 rounded-xl bg-[var(--btn-primary-bg)] px-3 text-xs font-bold text-[var(--btn-primary-text)]"><Check size={14} /> {tr("Simpan", "Save")}</button>
                      </div>
                      {r.doc_requirement && <p className="text-[0.65rem] text-[var(--muted)]">📎 {r.doc_requirement}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        </div>
      ))}
      <p className="px-1 text-[0.6rem] text-[var(--muted)]">{tr("Had & kategori mengikut peraturan HASiL untuk tahun taksiran terpilih.", "Limits & categories per HASiL rules for the selected assessment year.")}</p>
    </div>
  )
}

/* ─────────────────────────── Rebates ─────────────────────────── */

function RebatesTab({ year, tr, api, showNotice }: any) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await api(`/rebates?assessment_year=${year}`)) } catch (e) { } finally { setLoading(false) }
  }, [api, year])
  useEffect(() => { load() }, [load])

  async function add() {
    try {
      await api("/rebates", { method: "POST", body: JSON.stringify({ assessment_year: year, rebate_code: "rebate_zakat", amount: Number(amount || 0), source: "manual" }) })
      setAmount("")
      load()
      showNotice(tr("Zakat direkod", "Zakat recorded"))
    } catch (e: any) { showNotice(e.message || "Ralat") }
  }

  return (
    <div className="space-y-4">
      <SectionLabel>{tr("Rebat", "Rebates")}</SectionLabel>
      <Card className="space-y-3">
        <p className="text-sm font-extrabold text-[var(--text)]">{tr("Zakat", "Zakat")}</p>
        <p className="text-xs text-[var(--muted)]">{tr("Zakat mengurangkan cukai (bukan pendapatan bercukai).", "Zakat reduces tax (not chargeable income).")}</p>
        <Field label={tr("Zakat Dibayar (RM)", "Zakat Paid (RM)")}><NumInput value={amount} onChange={setAmount} /></Field>
        <PrimaryButton onClick={add}><Plus size={14} /> {tr("Rekod Zakat", "Record Zakat")}</PrimaryButton>
      </Card>
      {rows.map((r) => (
        <Card key={r.id} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold text-[var(--text)]">{r.name}</p>
            <p className="text-xs text-[var(--muted)]">{r.source}</p>
          </div>
          <p className="text-sm font-black text-[var(--text)]"><RM value={r.amount} /></p>
        </Card>
      ))}
    </div>
  )
}

/* ─────────────────────────── Tax Transactions ─────────────────────────── */

function TxTab({ year, tr, api, showNotice }: any) {
  const [links, setLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setLinks(await api(`/transaction-links?assessment_year=${year}`)) } catch (e) { } finally { setLoading(false) }
  }, [api, year])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <SectionLabel>{tr("Transaksi Cukai", "Tax Transactions")}</SectionLabel>
      <Card className="text-xs text-[var(--muted)]">
        {tr("Transaksi MyPeribadi boleh dikaitkan dengan pelepasan. Gunakan halaman Transaksi untuk menandakan item sebagai Potential Relief, kemudian ia muncul di sini.", "MyPeribadi transactions can be linked to reliefs. Use the Transactions page to flag items as Potential Relief, then they appear here.")}
      </Card>
      {loading ? <Skeleton /> : links.length === 0 ? (
        <Card className="text-center text-sm text-[var(--muted)]">{tr("Belum ada transaksi dikaitkan.", "No linked transactions yet.")}</Card>
      ) : links.map((l) => (
        <Card key={l.id} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold text-[var(--text)]">#{l.transaction_id} · {l.tax_type}</p>
            <p className="text-xs text-[var(--muted)]">{l.status}</p>
          </div>
          <p className="text-sm font-black text-[var(--text)]"><RM value={l.claim_amount} /></p>
        </Card>
      ))}
    </div>
  )
}

/* ─────────────────────────── Documents ─────────────────────────── */

function DocsTab({ year, tr, api, showNotice }: any) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState("receipt")

  const load = useCallback(async () => {
    setLoading(true)
    try { setDocs(await api(`/documents?assessment_year=${year}`)) } catch (e) { } finally { setLoading(false) }
  }, [api, year])
  useEffect(() => { load() }, [load])

  const TYPES = ["ea", "receipt", "insurance", "epf", "education", "medical", "zakat", "business", "other"]

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    fd.append("assessment_year", String(year))
    fd.append("document_type", docType)
    setUploading(true)
    try {
      await fetch(`/api/tax/documents`, { method: "POST", headers: authHeadersSafe(), credentials: "include", body: fd })
      load()
      showNotice(tr("Dokumen dimuat naik", "Document uploaded"))
    } catch (e: any) { showNotice(e.message || "Gagal") } finally { setUploading(false) }
  }
  function authHeadersSafe(): HeadersInit {
    const token = getAccessToken()
    const h: Record<string, string> = {}
    if (token && !isCookieAuthSentinel(token)) h["Authorization"] = `Bearer ${token}`
    return h
  }

  const byType: Record<string, any[]> = {}
  docs.forEach((d) => { (byType[d.document_type] = byType[d.document_type] || []).push(d) })

  return (
    <div className="space-y-4">
      <SectionLabel>{tr("Dokumen Sokongan", "Supporting Documents")}</SectionLabel>
      <Card className="space-y-2">
        <Field label={tr("Jenis Dokumen", "Document Type")}>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--text)] outline-none">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-[var(--btn-primary-text)]">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {tr("Muat Naik Dokumen", "Upload Document")}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} disabled={uploading} />
        </label>
      </Card>
      {loading ? <Skeleton /> : TYPES.map((t) => {
        const list = byType[t]
        if (!list) return null
        return (
          <div key={t}>
            <p className="px-1 pb-1.5 text-xs font-black uppercase tracking-wider text-[var(--muted)]">{t} · {list.length}</p>
            {list.map((d) => (
              <Card key={d.id} className="mb-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--text)]">{d.original_filename}</p>
                  <p className="text-xs text-[var(--muted)]">{d.document_date || "—"}</p>
                </div>
                <a href={`/api/tax/documents/${d.id}`} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 text-xs font-bold text-[var(--text)]">
                  <Download size={13} />
                </a>
              </Card>
            ))}
          </div>
        )
      })}
      {!loading && docs.length === 0 && <Card className="text-center text-sm text-[var(--muted)]">{tr("Belum ada dokumen.", "No documents yet.")}</Card>}
    </div>
  )
}

/* ─────────────────────────── Estimate ─────────────────────────── */

function EstimateTab({ year, tr, api }: any) {
  const [calc, setCalc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try { setCalc(await api(`/dashboard?assessment_year=${year}`)) } catch (e) { } finally { setLoading(false) }
    })()
  }, [api, year])

  const positive = (calc?.estimated_balance ?? 0) >= 0

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-600/25 to-emerald-600/10">
        <p className="relative text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Anggaran Cukai", "Tax Estimate")} — YA {year}</p>
        {loading ? <p className="mt-2 h-8 animate-pulse rounded bg-[var(--surface-tint)]" /> : (
          <p className="relative mt-1 text-3xl font-black tracking-tight text-[var(--text)]">
            {positive ? "+" : ""}{calc ? `RM ${Number(Math.abs(calc.estimated_balance)).toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "—"}
          </p>
        )}
        <p className="relative mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {positive ? tr("Anggaran Lebihan PCB", "Estimated Overpayment") : tr("Anggaran Cukai Belum Bayar", "Estimated Tax To Pay")}
        </p>
      </Card>

      {!loading && calc && (
        <Card className="space-y-2">
          <EstimateRow label={tr("Jumlah Pendapatan", "Total Income")} value={calc.income_total} />
          <EstimateRow label={tr("Pelepasan Layak", "Eligible Reliefs")} value={calc.relief_total} negative />
          <div className="border-t border-[var(--border)] pt-2">
            <EstimateRow label={tr("Anggaran Pendapatan Bercukai", "Estimated Chargeable Income")} value={calc.chargeable_income} strong />
          </div>
          <EstimateRow label={tr("Anggaran Cukai", "Estimated Tax")} value={calc.gross_tax} />
          <EstimateRow label={tr("Rebat", "Rebates")} value={calc.rebate_total} negative />
          <div className="border-t border-[var(--border)] pt-2">
            <EstimateRow label={tr("Anggaran Cukai Kena Bayar", "Estimated Tax Payable")} value={calc.net_tax} strong />
          </div>
          <EstimateRow label={tr("PCB Dibayar", "PCB Paid")} value={calc.pcb_total} negative />
        </Card>
      )}

      <button onClick={() => setShowBreakdown(!showBreakdown)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 text-xs font-bold text-[var(--text)]">
        {tr("Lihat Pengiraan", "View Calculation")} <ChevronDown size={14} className={cn("transition", showBreakdown && "rotate-180")} />
      </button>

      {showBreakdown && calc && (
        <Card className="space-y-2 text-sm">
          <p className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">{tr("Cara kami mengira", "How we calculated this")}</p>
          <BreakRow label={tr("Pendapatan", "Income")} value={calc.income_total} />
          <BreakRow label={tr("Tolak Relief", "Less Relief")} value={calc.relief_total} negative />
          <BreakRow label={tr("Pendapatan Bercukai", "Chargeable Income")} value={calc.chargeable_income} />
          <BreakRow label={tr("Cukai Kasar", "Gross Tax")} value={calc.gross_tax} />
          <BreakRow label={tr("Tolak Rebat", "Less Rebates")} value={calc.rebate_total} negative />
          <BreakRow label={tr("Tolak PCB", "Less PCB")} value={calc.pcb_total} negative />
          <div className="border-t border-[var(--border)] pt-2">
            <BreakRow label={tr("Anggaran Hasil", "Estimated Result")} value={Math.abs(calc.estimated_balance)} positive={positive} />
          </div>
          <p className="text-[0.65rem] text-[var(--muted)]">{positive ? tr("Lebihan bayaran", "overpayment") : tr("Cukai belum bayar", "tax to pay")}</p>
        </Card>
      )}

      <p className="px-1 text-[0.6rem] leading-relaxed text-[var(--muted)]">{tr(DISCLAIMER, DISCLAIMER)}</p>
    </div>
  )
}

function EstimateRow({ label, value, negative, strong }: { label: string; value: number; negative?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-xs", strong ? "font-black text-[var(--text)]" : "text-[var(--muted)]")}>{label}</span>
      <span className={cn("text-sm", strong ? "font-black" : "font-bold", negative ? "text-red-500" : "text-[var(--text)]")}>-{negative ? "" : ""}RM {Number(value).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
    </div>
  )
}

function BreakRow({ label, value, negative, positive }: { label: string; value: number; negative?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={cn("font-bold", positive ? "text-emerald-500" : negative ? "text-red-500" : "text-[var(--text)]")}>{negative ? "-" : ""}RM {Number(value).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</span>
    </div>
  )
}

/* ─────────────────────────── Summary ─────────────────────────── */

function SummaryTab({ year, tr, api }: any) {
  const [calc, setCalc] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [c, p] = await Promise.all([api(`/dashboard?assessment_year=${year}`), api(`/profile?assessment_year=${year}`)])
        setCalc(c); setProfile(p)
      } catch (e) { } finally { setLoading(false) }
    })()
  }, [api, year])

  const positive = (calc?.estimated_balance ?? 0) >= 0

  return (
    <div className="space-y-4">
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-500" />
          <p className="text-sm font-extrabold text-[var(--text)]">{tr("Ringkasan Cukai", "Tax Summary")} — YA {year}</p>
        </div>
        <div className="mt-3 space-y-1 text-xs">
          <p className="flex justify-between"><span className="text-[var(--muted)]">Profile</span><span className="font-bold text-[var(--text)]">{profile?.residency_status} · {profile?.income_source}</span></p>
          <p className="flex justify-between"><span className="text-[var(--muted)]">{tr("Pendapatan", "Income")}</span><span className="font-bold text-[var(--text)]"><RM value={calc?.income_total} /></span></p>
          <p className="flex justify-between"><span className="text-[var(--muted)]">{tr("Relief", "Reliefs")}</span><span className="font-bold text-[var(--text)]"><RM value={calc?.relief_total} /></span></p>
          <p className="flex justify-between"><span className="text-[var(--muted)]">{tr("Rebat", "Rebates")}</span><span className="font-bold text-[var(--text)]"><RM value={calc?.rebate_total} /></span></p>
          <p className="flex justify-between"><span className="text-[var(--muted)]">PCB</span><span className="font-bold text-[var(--text)]"><RM value={calc?.pcb_total} /></span></p>
          <div className="border-t border-[var(--border)] pt-2">
            <p className="flex justify-between"><span className="font-bold text-[var(--text)]">{tr("Anggaran Cukai", "Estimated Tax")}</span><span className="font-black text-[var(--text)]"><RM value={calc?.net_tax} /></span></p>
          </div>
        </div>
        <div className={cn("mt-3 rounded-xl p-3 text-center", positive ? "bg-emerald-500/10" : "bg-amber-500/10")}>
          <p className={cn("text-2xl font-black", positive ? "text-emerald-500" : "text-amber-500")}>
            {positive ? "+" : ""}<RM value={calc ? Math.abs(calc.estimated_balance) : undefined} />
          </p>
          <p className="text-xs font-bold text-[var(--muted)]">{positive ? tr("Anggaran Lebihan", "Estimated Overpayment") : tr("Anggaran Cukai Belum Bayar", "Estimated Tax To Pay")}</p>
        </div>
      </Card>
      <Card>
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--muted)]" />
          <p className="text-sm font-extrabold text-[var(--text)]">{tr("Bersedia untuk e-Filing", "Ready for e-Filing")}</p>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{tr("Penyertaan muktamad dilakukan oleh anda melalui MyTax / HASiL.", "Final submission is done by you via MyTax / HASiL.")}</p>
        <a
          href={`/api/tax/export?assessment_year=${year}`}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-[var(--btn-primary-text)]"
        >
          <Download size={14} /> {tr("Eksport Tax Pack (PDF)", "Export Tax Pack (PDF)")}
        </a>
      </Card>
      {loading && <Skeleton />}
    </div>
  )
}
