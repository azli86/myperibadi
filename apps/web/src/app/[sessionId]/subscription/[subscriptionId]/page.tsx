"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, CalendarClock, Copy, History, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
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
  updated_at: string
}

type SubscriptionTxn = {
  id: number
  reference_id: string | null
  amount: number
  vendor_or_source: string
  txn_date: string | null
  notes: string | null
  wallet_name: string | null
  source_channel: string | null
  created_at: string
}

type Category = { id: number; name: string; kind: string }
type Form = { name: string; amount: string; due_day: string; category_id: string; status: string; notes: string }

const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown; message?: unknown } | null
  const detail = payload?.detail ?? payload?.message
  return typeof detail === "string" && detail.trim() ? detail : fallback
}

/** Days until next due (KL). Negative = overdue. */
function daysUntilDueDay(dueDay: number, lastPaymentDate?: string | null, startDate?: string | null): number {
  const day = Math.min(31, Math.max(1, Math.floor(dueDay || 1)))
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  kl.setHours(0, 0, 0, 0)
  const due = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate()
    const d = new Date(y, m, Math.min(day, last))
    d.setHours(0, 0, 0, 0)
    return d
  }
  const dueThis = due(kl.getFullYear(), kl.getMonth())
  const lastDue = due(kl.getFullYear(), kl.getMonth() - 1)
  const start = startDate ? new Date(`${String(startDate).slice(0, 10)}T12:00:00`) : null
  start?.setHours(0, 0, 0, 0)
  const lp = lastPaymentDate ? new Date(`${String(lastPaymentDate).slice(0, 10)}T12:00:00`) : null
  lp?.setHours(0, 0, 0, 0)
  if (lp) {
    // A payment covers the due date nearest to the day it was paid.
    const lpDue = due(lp.getFullYear(), lp.getMonth())
    const nextLpDue = due(lp.getFullYear(), lp.getMonth() + 1)
    const paidDue = lp.getTime() - lpDue.getTime() <= nextLpDue.getTime() - lp.getTime() ? lpDue : nextLpDue
    const nextDue = due(paidDue.getFullYear(), paidDue.getMonth() + 1)
    return Math.round((nextDue.getTime() - kl.getTime()) / 86400000)
  }
  const anchor = kl >= dueThis ? dueThis : lastDue
  if (start && start > anchor) return Math.round((dueThis.getTime() - kl.getTime()) / 86400000)
  return Math.round((anchor.getTime() - kl.getTime()) / 86400000)
}

export default function SubscriptionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const subscriptionId = String(params.subscriptionId || "")
  const { lang } = useLang()
  const isBM = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBM ? bm : en), [isBM])
  const locale = isBM ? "ms-MY" : "en-MY"
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  const [subscription, setSubscription] = useState<SubscriptionItem | null>(null)
  const [transactions, setTransactions] = useState<SubscriptionTxn[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<Form>({ name: "", amount: "", due_day: "1", category_id: "", status: "active", notes: "" })

  const authHeaders = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])

  const loadData = useCallback(async () => {
    if (!subscriptionId) return
    try {
      const [subRes, txnRes] = await Promise.all([
        fetch(`/api/subscriptions/${subscriptionId}`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/subscriptions/${subscriptionId}/transactions`, { headers: authHeaders(), cache: "no-store" }),
      ])
      if (!subRes.ok) throw new Error(await readError(subRes, tr("Gagal muat langganan.", "Failed to load the subscription.")))
      const subData = (await subRes.json()) as SubscriptionItem
      const txnData = txnRes.ok ? await txnRes.json() : []
      setSubscription(subData)
      setTransactions(Array.isArray(txnData) ? txnData : [])
      setHasLoaded(true)
    } catch (err) {
      showAlertRef.current(tr("Ralat", "Error"), err instanceof Error ? err.message : "", "error")
    } finally {
      setLoading(false)
    }
  }, [authHeaders, subscriptionId, tr])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    void fetch("/api/categories", { headers: authHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setCategories(list.filter((c: Category) => c.kind === "expense"))
      })
      .catch(() => {})
  }, [authHeaders])

  const openEdit = () => {
    if (!subscription) return
    setForm({
      name: subscription.name,
      amount: String(Number(subscription.amount || 0) || ""),
      due_day: String(subscription.due_day_of_month || 1),
      category_id: subscription.category_id ? String(subscription.category_id) : "",
      status: subscription.status === "active" ? "active" : "settled",
      notes: subscription.notes || "",
    })
    setShowEdit(true)
  }

  const isActive = subscription?.status === "active"
  const days = useMemo(
    () => daysUntilDueDay(Number(subscription?.due_day_of_month || 1), subscription?.last_payment_date, subscription?.start_date),
    [subscription?.due_day_of_month, subscription?.last_payment_date, subscription?.start_date]
  )
  const dueLabel =
    days < 0
      ? tr(`${Math.abs(days)} hari lewat`, `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`)
      : days === 0
        ? tr("Hari ini", "Due today")
        : days === 1
          ? tr("Esok", "Tomorrow")
          : tr(`${days} hari lagi`, `In ${days} days`)
  const overdue = isActive && days < 0
  const soon = isActive && days >= 0 && days <= 7
  const cycleProgress = days <= 0 ? 1 : Math.min(1, Math.max(0, (30 - days) / 30))

  const nextDueLabel = useMemo(() => {
    const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
    kl.setHours(12, 0, 0, 0)
    kl.setDate(kl.getDate() + days)
    return kl.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
  }, [days, locale])

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => String(b.txn_date || b.created_at || "").localeCompare(String(a.txn_date || a.created_at || ""))),
    [transactions]
  )
  const paidTotal = transactions.reduce((s, t) => s + Number(t.amount || 0), 0)
  const category = categories.find((c) => c.id === subscription?.category_id) || null
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const payCommand = useMemo(() => {
    const amount = Number(subscription?.amount || 0)
    const amountText = amount > 0 ? amount.toFixed(amount % 1 === 0 ? 0 : 2) : "0"
    return `SUBX PAY ${subscription?.name || "NAMA"} ${amountText} WALLET`
  }, [subscription])

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(payCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      showAlert(tr("Gagal salin", "Copy failed"), tr("Tidak dapat salin arahan.", "Could not copy the command."), "error")
    }
  }

  const amountNum = Number(form.amount)
  const dueNum = Number(form.due_day)
  const problem = !form.name.trim()
    ? tr("Nama diperlukan.", "A name is required.")
    : !amountNum || amountNum <= 0
      ? tr("Masukkan jumlah yang sah.", "Enter a valid amount.")
      : !Number.isInteger(dueNum) || dueNum < 1 || dueNum > 31
        ? tr("Hari due mesti antara 1 dan 31.", "The due day must be between 1 and 31.")
        : null

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!subscription || saving) return
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          name: form.name.trim(),
          amount: amountNum,
          due_day_of_month: dueNum,
          category_id: form.category_id ? Number(form.category_id) : null,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await readError(res, tr("Gagal simpan.", "Could not save.")))
      setShowEdit(false)
      await loadData()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const resetDue = () => {
    if (!subscription) return
    showConfirm(
      tr("Reset status?", "Reset status?"),
      tr("Kira semula status daripada rekod transaksi? Bayaran lama tidak lagi dikira.", "Recompute the status from transaction records? Earlier payments will no longer count."),
      async () => {
        try {
          const res = await fetch(`/api/subscriptions/${subscription.id}/reset`, { method: "POST", headers: authHeaders() })
          if (!res.ok) throw new Error(await readError(res, tr("Gagal reset.", "Could not reset.")))
          await loadData()
        } catch (err) {
          showAlert(tr("Gagal reset", "Reset failed"), err instanceof Error ? err.message : "", "error")
        }
      },
      "warning"
    )
  }

  const remove = () => {
    if (!subscription) return
    showConfirm(
      tr("Padam langganan?", "Delete subscription?"),
      tr("Langganan ini akan dipadam. Transaksi lama kekal.", "This subscription will be deleted. Past transactions stay."),
      async () => {
        setDeleting(true)
        try {
          const res = await fetch(`/api/subscriptions/${subscription.id}`, { method: "DELETE", headers: authHeaders() })
          if (!res.ok) throw new Error(await readError(res, tr("Gagal padam.", "Could not delete.")))
          try {
            if (window.parent && window.parent !== window) window.parent.postMessage({ type: "SUBSCRIPTION_DELETED" }, "*")
          } catch {}
          router.push(`/${sessionId}/subscription`)
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
          setDeleting(false)
        }
      },
      "warning"
    )
  }

  const title = subscription?.name || tr("Langganan", "Subscription")
  const listHref = `/${sessionId}/subscription`
  const disabled = loading || !subscription
  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"
  const dangerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-rose-500/30 px-3 text-xs font-bold text-rose-500 disabled:opacity-40"

  const statusText = !isActive ? tr("Selesai", "Settled") : overdue ? tr("Lewat", "Overdue") : soon ? tr("Hampir due", "Due soon") : tr("Aktif", "Active")
  const barColor = overdue ? "bg-rose-500" : soon ? "bg-amber-500" : "bg-[var(--btn-primary-bg)]"

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      <div className="md:hidden">
        <MobilePageHeader
          title={title}
          fallbackHref={listHref}
          backPreferHistory
          action={
            <>
              <MobileIconButton onClick={openEdit} disabled={disabled} label={tr("Ubah", "Edit")}>
                <Pencil />
              </MobileIconButton>
              <MobileIconButton onClick={resetDue} disabled={disabled} label={tr("Reset", "Reset")}>
                <RotateCcw />
              </MobileIconButton>
              <MobileIconButton onClick={remove} disabled={deleting || disabled} label={tr("Padam", "Delete")} className="!bg-rose-500">
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </MobileIconButton>
            </>
          }
        />
      </div>
      <DesktopPageHeader
        title={title}
        breadcrumbs={[{ label: tr("Langganan", "Subscriptions"), href: listHref }]}
        homeHref={`/${sessionId}`}
        showBack={false}
        className="hidden md:block"
        actions={
          <>
            <DesktopPageAction onClick={openEdit} disabled={disabled} variant="solid">
              <Pencil size={16} />
              {tr("Ubah", "Edit")}
            </DesktopPageAction>
            <button type="button" onClick={resetDue} disabled={disabled} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold text-[var(--text)] disabled:opacity-40">
              <RotateCcw size={14} />
              {tr("Reset", "Reset")}
            </button>
            <button type="button" onClick={remove} disabled={deleting || disabled} className={dangerBtn}>
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {tr("Padam", "Delete")}
            </button>
          </>
        }
      />

      <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
        <div className="grid grid-cols-1 gap-4 pt-2 md:gap-5 md:pt-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="space-y-4 lg:sticky lg:top-6">
            <ModenHero
              label={
                <>
                  <CalendarClock size={16} />
                  {tr("Bayaran bulanan", "Monthly payment")} · {statusText}
                </>
              }
              currency="RM"
              amount={showSkeleton ? "—" : money(subscription?.amount)}
              amountSize="clamp(2rem, 9vw, 2.75rem)"
              stats={[
                { key: "due", tone: overdue ? "out" : "neutral", label: isActive ? tr("Seterusnya", "Next due") : tr("Status", "Status"), value: isActive ? nextDueLabel : statusText },
                { key: "paid", tone: "in", label: tr("Jumlah dibayar", "Total paid"), value: `RM ${money(paidTotal)}` },
              ]}
            >
              {isActive && (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                    <div className={cn("h-full rounded-full transition-[width] duration-300", barColor)} style={{ width: `${Math.round(cycleProgress * 100)}%` }} />
                  </div>
                  <p className={cn("mt-2 text-xs font-semibold", overdue ? "text-rose-500" : "text-[var(--muted)]")}>{dueLabel}</p>
                </div>
              )}
            </ModenHero>

            <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-[var(--muted)]">{tr("Hari due", "Due day")}</dt>
                  <dd className="font-bold text-[var(--text)]">{tr(`Setiap ${subscription?.due_day_of_month ?? "—"}hb`, `Day ${subscription?.due_day_of_month ?? "—"} each month`)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">{tr("Mula", "Started")}</dt>
                  <dd className="font-bold text-[var(--text)]">{subscription?.start_date ? new Date(`${subscription.start_date.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">{tr("Kategori", "Category")}</dt>
                  <dd className="font-bold text-[var(--text)]">{category?.name || tr("Tiada", "None")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">{tr("Bayaran terakhir", "Last payment")}</dt>
                  <dd className="font-bold text-[var(--text)]">{subscription?.last_payment_date ? new Date(`${subscription.last_payment_date.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }) : tr("Belum ada", "None yet")}</dd>
                </div>
              </dl>
              {subscription?.notes ? <p className="mt-3 whitespace-pre-line border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)] [overflow-wrap:anywhere]">{subscription.notes}</p> : null}
            </section>

            <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs font-semibold text-[var(--muted)]">{tr("Rekod bayaran melalui chat", "Record a payment via chat")}</p>
              <div className="mt-2 flex items-stretch gap-2">
                <code className="flex min-w-0 flex-1 select-all items-center overflow-x-auto whitespace-nowrap rounded-full bg-[var(--surface-tint-strong)] px-4 py-2.5 font-mono text-xs text-[var(--text)]">{payCommand}</code>
                <button type="button" onClick={() => void copyCommand()} aria-label={tr("Salin arahan", "Copy command")} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-4 text-xs font-bold text-[var(--text)]">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? tr("Disalin", "Copied") : tr("Salin", "Copy")}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">{tr("Format: SUBX PAY [nama] [jumlah] [dompet]", "Format: SUBX PAY [name] [amount] [wallet]")}</p>
            </section>
          </div>

          <section aria-labelledby="sub-history" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 px-1 pb-3">
              <h2 id="sub-history" className="text-base font-bold text-[var(--text)]">{tr("Sejarah bayaran", "Payment history")}</h2>
              <span className="text-xs font-semibold tabular-nums text-[var(--muted)]">{transactions.length} {tr("rekod", "records")}</span>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]">
              {showSkeleton ? (
                <div className="space-y-px">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse bg-[var(--surface-tint)]" />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                    <History size={20} />
                  </span>
                  <p className="mt-3 text-sm font-bold text-[var(--text)]">{tr("Belum ada bayaran.", "No payments yet.")}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{tr("Guna SUBX PAY di chat untuk rekod bayaran.", "Use SUBX PAY in chat to record a payment.")}</p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--divider)]">
                  {sorted.map((item) => {
                    const raw = String(item.txn_date || item.created_at || "").slice(0, 10)
                    const d = raw ? new Date(`${raw}T12:00:00`) : null
                    const valid = d && !Number.isNaN(d.getTime()) ? d : null
                    const meta = [item.wallet_name || item.source_channel, item.vendor_or_source || item.notes].filter(Boolean).join(" · ")
                    return (
                      <li key={item.id}>
                        <button type="button" onClick={() => router.push(`/${sessionId}/transactions/${item.reference_id || item.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-tint)]">
                          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full bg-[var(--surface-tint-strong)] leading-none">
                            <span className="text-sm font-bold tabular-nums text-[var(--text)]">{valid ? valid.toLocaleDateString(locale, { day: "numeric" }) : "–"}</span>
                            <span className="mt-0.5 text-[0.5625rem] font-semibold uppercase text-[var(--muted)]">{valid ? valid.toLocaleDateString(locale, { month: "short" }) : ""}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-[var(--text)]">{valid ? valid.toLocaleDateString(locale, { month: "long", year: "numeric" }) : tr("Tiada tarikh", "No date")}</span>
                            <span className="block truncate text-xs text-[var(--muted)]">{meta || `#${item.reference_id || item.id}`}</span>
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">−RM {money(item.amount)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </DesktopPageBody>

      <AppSheet
        open={showEdit && !!subscription}
        onClose={() => setShowEdit(false)}
        id="subscription-edit-sheet"
        title={tr("Ubah langganan", "Edit subscription")}
        size="md"
        footer={
          <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Simpan perubahan", "Save changes")}
          </button>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="sd-name" className={label}>{tr("Nama", "Name")}</label>
            <input id="sd-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="sd-amount" className={label}>{tr("Jumlah (RM)", "Amount (RM)")}</label>
              <input id="sd-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") })} className={field} />
            </div>
            <div>
              <label htmlFor="sd-due" className={label}>{tr("Hari due (1–31)", "Due day (1–31)")}</label>
              <input id="sd-due" inputMode="numeric" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="sd-cat" className={label}>{tr("Kategori", "Category")}</label>
            <select id="sd-cat" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={field}>
              <option value="">{tr("Tiada kategori", "No category")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={label}>{tr("Status", "Status")}</span>
            <div className="flex gap-1.5">
              {([["active", tr("Aktif", "Active")], ["settled", tr("Selesai", "Settled")]] as const).map(([value, text]) => (
                <button key={value} type="button" aria-pressed={form.status === value} onClick={() => setForm({ ...form, status: value })} className={cn("h-10 flex-1 rounded-full border text-sm font-semibold transition", form.status === value ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="sd-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <textarea id="sd-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]" />
          </div>
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
