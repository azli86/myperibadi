"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { BadgeCheck, CalendarClock, Check, CreditCard, Loader2, Plus } from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type LoanItem = {
  id: number
  name: string
  opening_amount: number
  outstanding_amount: number
  monthly_payment?: number | null
  paid_amount: number
  remaining_months?: number | null
  start_date: string
  notes?: string | null
  status: string
  category_id?: number | null
  payment_count: number
  last_payment_at?: string | null
}

type Category = { id: number; name: string; kind: string }
type Form = { name: string; opening_amount: string; monthly_payment: string; category_id: string; notes: string }
const emptyForm: Form = { name: "", opening_amount: "", monthly_payment: "", category_id: "", notes: "" }

const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function LoanPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showAlert, alertModal } = usePageAlert(lang)

  const [loans, setLoans] = useState<LoanItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filter, setFilter] = useState<"active" | "all" | "settled">("active")
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/loans?include_settled=true", { headers: headers(), cache: "no-store" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLoans(Array.isArray(data) ? data : [])
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void load()
    void (async () => {
      try {
        const res = await fetch("/api/categories", { credentials: "include", headers: headers(), cache: "no-store" })
        const list = await res.json()
        if (Array.isArray(list)) setCategories(list.filter((c: Category) => c.kind === "expense"))
      } catch {
        // optional
      }
    })()
  }, [load, headers])

  const open = useMemo(() => loans.filter((l) => l.outstanding_amount > 0.004), [loans])
  const owed = open.reduce((s, l) => s + Number(l.outstanding_amount || 0), 0)
  const monthly = open.reduce((s, l) => s + Number(l.monthly_payment || 0), 0)
  const paid = loans.reduce((s, l) => s + Number(l.paid_amount || 0), 0)
  const visible = loans.filter((l) => (filter === "all" ? true : filter === "active" ? l.outstanding_amount > 0.004 : l.outstanding_amount <= 0.004))

  const openingNum = parseFloat(form.opening_amount) || 0
  const monthlyNum = parseFloat(form.monthly_payment) || 0
  const problem = !form.name.trim()
    ? tr("Nama diperlukan.", "A name is required.")
    : openingNum <= 0
      ? tr("Masukkan jumlah pinjaman.", "Enter the loan amount.")
      : monthlyNum < 0 || monthlyNum > openingNum
        ? tr("Bayaran bulanan mesti tidak melebihi jumlah pinjaman.", "The monthly payment cannot be more than the loan.")
        : null

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          name: form.name.trim(),
          opening_amount: openingNum,
          monthly_payment: monthlyNum > 0 ? monthlyNum : null,
          category_id: form.category_id ? Number(form.category_id) : null,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: unknown } | null
        throw new Error(typeof body?.detail === "string" ? body.detail : tr("Gagal simpan loan.", "Failed to save the loan."))
      }
      setShowForm(false)
      await load()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

  const tabs: Array<["active" | "all" | "settled", string, number]> = [
    ["active", tr("Aktif", "Active"), open.length],
    ["settled", tr("Selesai", "Settled"), loans.length - open.length],
    ["all", tr("Semua", "All"), loans.length],
  ]

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader
          title="Loan"
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={() => { setForm(emptyForm); setShowForm(true) }} label={tr("Tambah loan", "Add loan")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden lg:block"
        title="Loan"
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={() => { setForm(emptyForm); setShowForm(true) }}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah loan", "Add loan")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <CreditCard size={16} />
              {tr("Baki loan", "Loan balance")}
            </>
          }
          currency="RM"
          amount={showSkeleton ? "—" : money(owed)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "monthly", tone: "out", icon: <CalendarClock size={15} strokeWidth={2.2} />, label: tr("Bayaran sebulan", "Per month"), value: `RM ${money(monthly)}` },
            { key: "paid", tone: "in", icon: <BadgeCheck size={15} strokeWidth={2.2} />, label: tr("Sudah dibayar", "Paid so far"), value: `RM ${money(paid)}` },
          ]}
        />

        {loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-base font-bold text-[var(--text)]">{tr("Loan tidak dapat dimuatkan", "Loans could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void load() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
              {tr("Cuba lagi", "Try again")}
            </button>
          </div>
        ) : (
          <>
            <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map(([key, text, count]) => (
                <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", filter === key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")}>
                  {text}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", filter === key ? "bg-white/20" : "bg-[var(--surface-tint-strong)]")}>{count}</span>
                </button>
              ))}
            </div>

            {showSkeleton ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                  <CreditCard size={24} />
                </span>
                <p className="mt-4 text-base font-bold text-[var(--text)]">{loans.length ? tr("Tiada dalam tapisan ini", "None in this filter") : tr("Belum ada loan", "No loans yet")}</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{tr("Jejak pinjaman kereta, rumah atau peribadi dan bayarannya.", "Track a car, home or personal loan and its payments.")}</p>
                {!loans.length && (
                  <button type="button" onClick={() => { setForm(emptyForm); setShowForm(true) }} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                    <Plus size={15} />
                    {tr("Tambah loan", "Add loan")}
                  </button>
                )}
              </div>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {visible.map((l) => {
                  const settled = l.outstanding_amount <= 0.004
                  const pct = l.opening_amount ? Math.min(100, Math.max(0, (l.paid_amount / l.opening_amount) * 100)) : 0
                  return (
                    <li key={l.id}>
                      <button type="button" onClick={() => router.push(`/${sessionId}/loan/${l.id}`)} className="w-full rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.99]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-[var(--text)]">{l.name}</p>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {l.payment_count} {tr("bayaran", l.payment_count === 1 ? "payment" : "payments")}
                              {!settled && l.remaining_months ? ` · ${tr(`lagi ${l.remaining_months} bulan`, `${l.remaining_months} months left`)}` : ""}
                            </p>
                          </div>
                          {settled ? (
                            <span className="shrink-0 rounded-full border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{tr("Selesai", "Settled")}</span>
                          ) : l.monthly_payment ? (
                            <span className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">RM {money(l.monthly_payment)} / {tr("bulan", "mo")}</span>
                          ) : null}
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                          <div className="h-full rounded-full bg-[var(--btn-primary-bg)] transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-[var(--muted)]">
                            {tr("Dibayar", "Paid")} <span className="font-semibold tabular-nums text-[var(--text)]">RM {money(l.paid_amount)}</span>
                          </span>
                          <span className="font-bold tabular-nums text-[var(--text)]">{settled ? tr("Tiada baki", "Nothing left") : `${tr("Baki", "Left")} RM ${money(l.outstanding_amount)}`}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </DesktopPageBody>

      <AppSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        id="loan-create-sheet"
        title={tr("Loan baharu", "New loan")}
        size="md"
        footer={
          <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Tambah loan", "Add loan")}
          </button>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="ln-name" className={label}>{tr("Nama (cth. Kereta, Rumah)", "Name (e.g. Car, Home)")}</label>
            <input id="ln-name" value={form.name} maxLength={190} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ln-amount" className={label}>{tr("Jumlah pinjaman (RM)", "Loan amount (RM)")}</label>
              <input id="ln-amount" inputMode="decimal" value={form.opening_amount} onChange={(e) => setForm({ ...form, opening_amount: e.target.value })} placeholder="0.00" className={field} />
            </div>
            <div>
              <label htmlFor="ln-monthly" className={label}>{tr("Bayaran bulanan (RM)", "Monthly payment (RM)")}</label>
              <input id="ln-monthly" inputMode="decimal" value={form.monthly_payment} onChange={(e) => setForm({ ...form, monthly_payment: e.target.value })} placeholder="0.00" className={field} />
            </div>
          </div>
          {openingNum > 0 && monthlyNum > 0 && monthlyNum <= openingNum ? (
            <p className="text-xs text-[var(--muted)]">{tr(`Kira-kira ${Math.ceil(openingNum / monthlyNum)} bulan untuk selesai.`, `About ${Math.ceil(openingNum / monthlyNum)} months to clear it.`)}</p>
          ) : null}
          <div>
            <label htmlFor="ln-cat" className={label}>{tr("Kategori bayaran (pilihan)", "Payment category (optional)")}</label>
            <select id="ln-cat" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={field}>
              <option value="">{tr("Tiada kategori", "No category")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ln-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <textarea id="ln-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]" />
          </div>
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
