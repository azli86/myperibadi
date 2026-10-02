"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertTriangle, BadgeCheck, CalendarClock, Check, CreditCard, Loader2, Plus, Trash2 } from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type SubscriptionItem = {
  id: number
  name: string
  amount: number
  due_day_of_month: number
  notes?: string | null
  status: string
  category_id?: number | null
  start_date: string
  last_payment_date?: string | null
}

type Category = { id: number; name: string; icon_name?: string | null; kind: string }
type Form = { name: string; amount: string; due_day: string; category_id: string; notes: string }
const emptyForm: Form = { name: "", amount: "", due_day: "1", category_id: "", notes: "" }

const money = (n: number | null | undefined, digits = 2) =>
  Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Days until the next due date in Kuala Lumpur; negative when the last one is unpaid and past. */
function daysUntilDue(dueDay: number, lastPayment?: string | null, startDate?: string | null): number {
  const day = Math.min(31, Math.max(1, Math.floor(dueDay || 1)))
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  kl.setHours(0, 0, 0, 0)
  const due = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate()
    const d = new Date(y, m, Math.min(day, last))
    d.setHours(0, 0, 0, 0)
    return d
  }
  const at = (v?: string | null) => {
    if (!v) return null
    const d = new Date(`${String(v).slice(0, 10)}T12:00:00`)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const dueThis = due(kl.getFullYear(), kl.getMonth())
  const lastDue = due(kl.getFullYear(), kl.getMonth() - 1)
  const lp = at(lastPayment)
  const start = at(startDate)
  if (lp) {
    // A payment covers the due date nearest to it.
    const lpDue = due(lp.getFullYear(), lp.getMonth())
    const nextLpDue = due(lp.getFullYear(), lp.getMonth() + 1)
    const paidDue = lp.getTime() - lpDue.getTime() <= nextLpDue.getTime() - lp.getTime() ? lpDue : nextLpDue
    const next = due(paidDue.getFullYear(), paidDue.getMonth() + 1)
    return Math.round((next.getTime() - kl.getTime()) / 86400000)
  }
  const anchor = kl >= dueThis ? dueThis : lastDue
  if (start && start > anchor) return Math.round((dueThis.getTime() - kl.getTime()) / 86400000)
  return Math.round((anchor.getTime() - kl.getTime()) / 86400000)
}

export default function SubscriptionPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [items, setItems] = useState<SubscriptionItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SubscriptionItem | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])
  const errorOf = async (res: Response, fallback: string) => {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof body?.detail === "string" ? body.detail : fallback
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/subscriptions?include_settled=${showInactive}`, { headers: headers(), cache: "no-store" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [headers, showInactive])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/categories", { credentials: "include", headers: headers(), cache: "no-store" })
        const list = await res.json()
        if (Array.isArray(list)) setCategories(list.filter((c: Category) => c.kind === "expense"))
      } catch {
        // optional
      }
    })()
  }, [headers])


  const rows = useMemo(
    () =>
      items
        .map((c) => ({ c, days: daysUntilDue(c.due_day_of_month, c.last_payment_date, c.start_date) }))
        .sort((a, b) => {
          const ai = a.c.status === "active" ? 0 : 1
          const bi = b.c.status === "active" ? 0 : 1
          return ai - bi || a.days - b.days || a.c.due_day_of_month - b.c.due_day_of_month
        }),
    [items]
  )
  const active = rows.filter((r) => r.c.status === "active")
  const monthly = active.reduce((s, r) => s + Number(r.c.amount || 0), 0)
  const soon = active.filter((r) => r.days >= 0 && r.days <= 7)
  const late = active.filter((r) => r.days < 0)
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  // ── Form ─────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }
  const openEdit = (c: SubscriptionItem) => {
    setEditing(c)
    setForm({ name: c.name, amount: String(c.amount), due_day: String(c.due_day_of_month), category_id: c.category_id ? String(c.category_id) : "", notes: c.notes || "" })
    setShowForm(true)
  }

  const amountNum = parseFloat(form.amount) || 0
  const dueNum = parseInt(form.due_day, 10) || 0
  const problem = !form.name.trim()
    ? tr("Nama diperlukan.", "A name is required.")
    : amountNum <= 0
      ? tr("Masukkan amaun.", "Enter the amount.")
      : dueNum < 1 || dueNum > 31
        ? tr("Hari bayaran antara 1 dan 31.", "Due day must be between 1 and 31.")
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
      const res = await fetch(editing ? `/api/subscriptions/${editing.id}` : "/api/subscriptions", {
        method: editing ? "PATCH" : "POST",
        headers: headers(true),
        body: JSON.stringify({
          name: form.name.trim(),
          amount: amountNum,
          due_day_of_month: dueNum,
          category_id: form.category_id ? Number(form.category_id) : null,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan.", "Could not save.")))
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const remove = (c: SubscriptionItem) => {
    showConfirm(
      tr("Padam langganan?", "Delete subscription?"),
      tr(`Padam “${c.name}”? Bayaran lepas kekal dalam transaksi anda.`, `Delete “${c.name}”? Past payments stay in your transactions.`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/subscriptions/${c.id}`, { method: "DELETE", headers: headers() })
          if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
          setShowForm(false)
          setEditing(null)
          await load()
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
        } finally {
          setSaving(false)
        }
      },
      "warning"
    )
  }

  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

  const dueText = (days: number) =>
    days < 0
      ? tr(`${Math.abs(days)} hari lewat`, `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} late`)
      : days === 0
        ? tr("Hari ini", "Today")
        : days === 1
          ? tr("Esok", "Tomorrow")
          : tr(`${days} hari lagi`, `In ${days} days`)

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader
          title={tr("Langganan", "Subscriptions")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreate} label={tr("Tambah langganan", "Add subscription")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden lg:block"
        title={tr("Langganan", "Subscriptions")}
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={openCreate}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah langganan", "Add subscription")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <CreditCard size={16} />
              {tr("Kos sebulan", "Monthly cost")}
            </>
          }
          currency="RM"
          amount={showSkeleton ? "—" : money(monthly)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "active", tone: "neutral", icon: <BadgeCheck size={15} strokeWidth={2.2} />, label: tr("Aktif", "Active"), value: String(active.length) },
            late.length > 0
              ? { key: "late", tone: "out", icon: <AlertTriangle size={15} strokeWidth={2.2} />, label: tr("Lewat bayar", "Overdue"), value: String(late.length) }
              : { key: "soon", tone: "out", icon: <CalendarClock size={15} strokeWidth={2.2} />, label: tr("Dalam 7 hari", "Next 7 days"), value: soon.length ? `${soon.length} · RM ${money(soon.reduce((s, r) => s + r.c.amount, 0), 0)}` : "—" },
          ]}
        />

        {loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-base font-bold text-[var(--text)]">{tr("Langganan tidak dapat dimuatkan", "Subscriptions could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void load() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
              {tr("Cuba lagi", "Try again")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-sm font-semibold text-[var(--muted)]">
                {rows.length} {tr("langganan", rows.length === 1 ? "subscription" : "subscriptions")}
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={showInactive}
                onClick={() => { setShowInactive((v) => !v); setLoading(true) }}
                className={cn("h-9 rounded-full border px-4 text-sm font-semibold transition", showInactive ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")}
              >
                {tr("Papar yang tidak aktif", "Show inactive")}
              </button>
            </div>

            {showSkeleton ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                  <CreditCard size={24} />
                </span>
                <p className="mt-4 text-base font-bold text-[var(--text)]">{tr("Belum ada langganan", "No subscriptions yet")}</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{tr("Jejak Netflix, Spotify, bil telefon dan bayaran berulang lain.", "Track Netflix, Spotify, phone bills and other recurring payments.")}</p>
                <button type="button" onClick={openCreate} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                  <Plus size={15} />
                  {tr("Tambah langganan", "Add subscription")}
                </button>
              </div>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {rows.map(({ c, days }) => {
                  const cat = c.category_id ? catById.get(c.category_id) : undefined
                  const inactive = c.status !== "active"
                  const tone = inactive ? "muted" : days < 0 ? "late" : days <= 7 ? "soon" : "ok"
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => router.push(`/${sessionId}/subscription/${c.id}`)} className={cn("flex w-full items-center gap-3 rounded-[1.5rem] border bg-[var(--card)] p-4 text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.99]", tone === "late" ? "border-rose-500/40" : "border-[var(--border)]", inactive && "opacity-60")}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
                          <CategoryIconGlyph iconName={cat?.icon_name} categoryName={cat?.name || c.name} kind="expense" size={20} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-bold text-[var(--text)]">{c.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">
                            {inactive ? tr("Tidak aktif", "Inactive") : dueText(days)}
                            {` · ${tr("setiap", "every")} ${c.due_day_of_month}${isBm ? "HB" : ""}`}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-base font-bold tabular-nums text-[var(--text)]">RM {money(c.amount)}</span>
                          <span className={cn("block text-xs font-semibold", tone === "late" ? "text-rose-500" : tone === "soon" ? "text-amber-600 dark:text-amber-400" : "text-[var(--muted)]")}>
                            {tone === "late" ? tr("Lewat", "Late") : tone === "soon" ? tr("Hampir", "Soon") : ""}
                          </span>
                        </span>
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
        onClose={() => { setShowForm(false); setEditing(null) }}
        id="subscription-create-sheet"
        title={editing ? tr("Ubah langganan", "Edit subscription") : tr("Langganan baharu", "New subscription")}
        size="md"
        footer={
          <div className="flex gap-2">
            {editing && (
              <button type="button" onClick={() => remove(editing)} disabled={saving} aria-label={tr("Padam", "Delete")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500 disabled:opacity-50">
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editing ? tr("Simpan perubahan", "Save changes") : tr("Tambah langganan", "Add subscription")}
            </button>
          </div>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="sub-name" className={label}>{tr("Nama", "Name")}</label>
            <input id="sub-name" value={form.name} maxLength={190} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Netflix" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="sub-amount" className={label}>{tr("Amaun (RM)", "Amount (RM)")}</label>
              <input id="sub-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className={field} />
            </div>
            <div>
              <label htmlFor="sub-due" className={label}>{tr("Hari bayaran", "Due day")}</label>
              <input id="sub-due" inputMode="numeric" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value.replace(/\D/g, "") })} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="sub-cat" className={label}>{tr("Kategori", "Category")}</label>
            <select id="sub-cat" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={field}>
              <option value="">{tr("Tiada kategori", "No category")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sub-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <textarea id="sub-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]" />
          </div>
          {editing ? (
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); router.push(`/${sessionId}/subscription/${editing.id}`) }} className="text-sm font-semibold text-[var(--muted)] underline underline-offset-4">
              {tr("Lihat bayaran dan sejarah", "See payments and history")}
            </button>
          ) : null}
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
