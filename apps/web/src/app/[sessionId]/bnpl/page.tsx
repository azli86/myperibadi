"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle, CalendarClock, Check, CreditCard, ImagePlus, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { BNPL_PROVIDERS, BnplProviderBadge } from "@/components/bnpl/bnpl-providers"

type BnplItem = {
  id: number
  name: string
  provider: string
  category_id: number
  category_name?: string | null
  has_image: boolean
  image_url?: string | null
  total_amount: number
  installment_count: number
  monthly_amount: number
  due_day_of_month: number
  start_date: string
  last_payment_date?: string | null
  outstanding_amount: number
  paid_amount: number
  status: string
  notes?: string | null
  next_due_date?: string | null
  overdue?: boolean
  days_overdue?: number
}

type Payment = { id: number; amount: number; payment_date?: string | null; notes?: string | null; wallet_id?: number | null }
type CategoryItem = { id: number; name: string; kind: string }
type WalletItem = { id: number; name: string; label?: string | null; currency: string }

type FormState = {
  name: string
  provider: string
  category_id: string
  total_amount: string
  installment_count: string
  monthly_amount: string
  due_day_of_month: string
  start_date: string
  notes: string
}

const emptyForm: FormState = {
  name: "",
  provider: "SPayLater",
  category_id: "",
  total_amount: "",
  installment_count: "3",
  monthly_amount: "",
  due_day_of_month: "15",
  start_date: "",
  notes: "",
}

const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(value?: string | null, locale = "en-MY") {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

export default function BnplPage() {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [items, setItems] = useState<BnplItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<"all" | "active" | "settled">("all")

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BnplItem | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [monthlyTouched, setMonthlyTouched] = useState(false)

  const [detailId, setDetailId] = useState<number | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [showPay, setShowPay] = useState(false)
  const [payFromList, setPayFromList] = useState(false)
  const [payForm, setPayForm] = useState({ amount: "", wallet_id: "", notes: "" })
  const fileRef = useRef<HTMLInputElement>(null)

  const detail = items.find((i) => i.id === detailId) || null
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])
  const errorOf = async (res: Response, fallback: string) => {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof body?.detail === "string" ? body.detail : fallback
  }

  const fetchData = useCallback(async () => {
    try {
      const [b, c, w] = await Promise.all([
        fetch("/api/bnpl?include_settled=true", { credentials: "include", headers: headers(), cache: "no-store" }),
        fetch("/api/categories", { credentials: "include", headers: headers(), cache: "no-store" }),
        fetch("/api/wallets", { credentials: "include", headers: headers(), cache: "no-store" }),
      ])
      if (!b.ok) throw new Error()
      setItems(await b.json())
      if (c.ok) setCategories(await c.json())
      if (w.ok) setWallets(await w.json())
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const loadPayments = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/bnpl/${id}/payments`, { credentials: "include", headers: headers(), cache: "no-store" })
        setPayments(res.ok ? await res.json() : [])
      } catch {
        setPayments([])
      }
    },
    [headers]
  )

  const openDetail = (item: BnplItem) => {
    setDetailId(item.id)
    setPayments([])
    void loadPayments(item.id)
  }

  // ── Totals ───────────────────────────────────────────────────────────────

  const active = useMemo(() => items.filter((i) => i.status === "active"), [items])
  const owed = active.reduce((s, i) => s + Number(i.outstanding_amount || 0), 0)
  const monthly = active.reduce((s, i) => s + Number(i.monthly_amount || 0), 0)
  const lateCount = active.filter((i) => i.overdue).length
  const visible = useMemo(() => items.filter((i) => filter === "all" || i.status === filter), [items, filter])
  const expenseCategories = categories.filter((c) => c.kind === "expense")

  // ── Create / edit ────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, category_id: expenseCategories[0] ? String(expenseCategories[0].id) : "" })
    setMonthlyTouched(false)
    setShowForm(true)
  }

  const openEdit = (item: BnplItem) => {
    setEditing(item)
    setForm({
      name: item.name,
      provider: item.provider,
      category_id: String(item.category_id),
      total_amount: String(item.total_amount),
      installment_count: String(item.installment_count),
      monthly_amount: String(item.monthly_amount),
      due_day_of_month: String(item.due_day_of_month),
      start_date: item.start_date || "",
      notes: item.notes || "",
    })
    setMonthlyTouched(true)
    setDetailId(null)
    setShowForm(true)
  }

  // The monthly amount follows total and count until the user types their own.
  const setPlan = (patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch }
      const t = parseFloat(next.total_amount)
      const n = parseInt(next.installment_count, 10)
      if (!monthlyTouched && t > 0 && n > 0) next.monthly_amount = (Math.round((t / n) * 100) / 100).toFixed(2)
      return next
    })
  }

  const totalNum = parseFloat(form.total_amount) || 0
  const monthlyNum = parseFloat(form.monthly_amount) || 0
  const countNum = parseInt(form.installment_count, 10) || 0
  const dueNum = parseInt(form.due_day_of_month, 10) || 0
  const planCovers = monthlyNum > 0 && countNum > 0 ? Math.round(monthlyNum * countNum * 100) / 100 : 0

  const formProblem = (() => {
    if (!form.name.trim()) return tr("Nama diperlukan.", "A name is required.")
    if (!form.category_id) return tr("Pilih kategori.", "Choose a category.")
    if (totalNum <= 0) return tr("Masukkan jumlah keseluruhan.", "Enter the total amount.")
    if (monthlyNum <= 0) return tr("Masukkan ansuran bulanan.", "Enter the monthly instalment.")
    if (monthlyNum > totalNum) return tr("Ansuran bulanan melebihi jumlah keseluruhan.", "The monthly instalment is more than the total.")
    if (countNum < 1 || countNum > 60) return tr("Bilangan ansuran antara 1 dan 60.", "Instalments must be between 1 and 60.")
    if (dueNum < 1 || dueNum > 31) return tr("Hari bayaran antara 1 dan 31.", "Due day must be between 1 and 31.")
    if (editing && totalNum + 0.005 < editing.paid_amount) return tr(`Jumlah kurang daripada RM ${money(editing.paid_amount)} yang sudah dibayar.`, `The total is below the RM ${money(editing.paid_amount)} already paid.`)
    return null
  })()

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (formProblem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), formProblem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/bnpl/${editing.id}` : "/api/bnpl", {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: headers(true),
        body: JSON.stringify({
          name: form.name.trim(),
          provider: form.provider,
          category_id: Number(form.category_id),
          total_amount: totalNum,
          installment_count: countNum,
          monthly_amount: monthlyNum,
          due_day_of_month: dueNum,
          start_date: form.start_date || null,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan.", "Could not save.")))
      setShowForm(false)
      setEditing(null)
      await fetchData()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  // ── Pay ──────────────────────────────────────────────────────────────────

  const openPay = (item: BnplItem, fromList = false) => {
    setPayFromList(fromList)
    setDetailId(item.id)
    void loadPayments(item.id)
    setPayForm({
      amount: String(Math.min(item.monthly_amount, item.outstanding_amount)),
      wallet_id: wallets[0] ? String(wallets[0].id) : "",
      notes: "",
    })
    setShowPay(true)
  }

  const payAmount = parseFloat(payForm.amount) || 0
  const payProblem = !detail
    ? null
    : payAmount <= 0
      ? tr("Amaun mesti lebih daripada sifar.", "The amount must be above zero.")
      : payAmount > detail.outstanding_amount + 0.01
        ? tr(`Melebihi baki RM ${money(detail.outstanding_amount)}.`, `More than the RM ${money(detail.outstanding_amount)} still owed.`)
        : !payForm.wallet_id
          ? tr("Pilih dompet.", "Choose a wallet.")
          : null

  const savePayment = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!detail || saving) return
    if (payProblem) {
      showAlert(tr("Tak sah", "Not valid"), payProblem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/bnpl/${detail.id}/pay`, {
        method: "POST",
        credentials: "include",
        headers: headers(true),
        body: JSON.stringify({ amount: payAmount, wallet_id: Number(payForm.wallet_id), notes: payForm.notes.trim() || null }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal membayar.", "Payment failed.")))
      setShowPay(false)
      if (payFromList) setDetailId(null)
      await fetchData()
      await loadPayments(detail.id)
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const undoPayment = (p: Payment) => {
    if (!detail) return
    showConfirm(
      tr("Padam bayaran?", "Delete payment?"),
      tr(`Padam bayaran RM ${money(p.amount)}? Belanja yang direkodkan juga dibuang dan baki dompet dikembalikan.`, `Delete the RM ${money(p.amount)} payment? The expense it recorded is removed too and the wallet balance goes back.`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/bnpl/${detail.id}/payments/${p.id}`, { method: "DELETE", credentials: "include", headers: headers() })
          if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam bayaran.", "Could not delete the payment.")))
          await fetchData()
          await loadPayments(detail.id)
        } catch (err) {
          showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "", "error")
        } finally {
          setSaving(false)
        }
      },
      "warning"
    )
  }

  const removeItem = () => {
    if (!detail) return
    showConfirm(
      tr("Padam BNPL?", "Delete BNPL?"),
      tr(`Padam “${detail.name}”? Bayaran yang sudah direkod kekal sebagai belanja dalam transaksi anda.`, `Delete “${detail.name}”? Payments already recorded stay as expenses in your transactions.`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/bnpl/${detail.id}`, { method: "DELETE", credentials: "include", headers: headers() })
          if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
          setDetailId(null)
          await fetchData()
        } catch (err) {
          showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "", "error")
        } finally {
          setSaving(false)
        }
      },
      "warning"
    )
  }

  const uploadImage = async (file: File) => {
    if (!detail) return
    if (file.size > 5 * 1024 * 1024) {
      showAlert(tr("Fail terlalu besar", "File too large"), tr("Had 5 MB.", "The limit is 5 MB."), "warning")
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/bnpl/${detail.id}/image`, { method: "POST", credentials: "include", headers: headers(), body: fd })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal muat naik.", "Upload failed.")))
      await fetchData()
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  // ── Pieces ───────────────────────────────────────────────────────────────

  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

  const dueChip = (item: BnplItem) => {
    if (item.status === "settled") return <span className="shrink-0 rounded-full border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{tr("Selesai", "Settled")}</span>
    if (item.overdue)
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/40 px-2.5 py-0.5 text-xs font-semibold text-rose-500">
          <AlertTriangle size={12} />
          {tr(`Lewat ${item.days_overdue} hari`, `${item.days_overdue}d late`)}
        </span>
      )
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
        <CalendarClock size={12} />
        {fmtDate(item.next_due_date, locale).replace(/\s\d{4}$/, "")}
      </span>
    )
  }

  const tabs: Array<["all" | "active" | "settled", string, number]> = [
    ["all", tr("Semua", "All"), items.length],
    ["active", tr("Aktif", "Active"), active.length],
    ["settled", tr("Selesai", "Settled"), items.length - active.length],
  ]

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader
          title="BNPL"
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreate} label={tr("Tambah BNPL", "Add BNPL")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden lg:block"
        title="BNPL"
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={openCreate}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah BNPL", "Add BNPL")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <CreditCard size={16} />
              {tr("Baki perlu dibayar", "Still to pay")}
            </>
          }
          currency="RM"
          amount={showSkeleton ? "—" : money(owed)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "monthly", tone: "out", icon: <CalendarClock size={15} strokeWidth={2.2} />, label: tr("Ansuran sebulan", "Per month"), value: `RM ${money(monthly)}` },
            lateCount > 0
              ? { key: "late", tone: "out", icon: <AlertTriangle size={15} strokeWidth={2.2} />, label: tr("Lewat bayar", "Overdue"), value: String(lateCount) }
              : { key: "active", tone: "neutral", icon: <CreditCard size={15} strokeWidth={2.2} />, label: tr("Pelan aktif", "Active plans"), value: String(active.length) },
          ]}
        />

        {loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-base font-bold text-[var(--text)]">{tr("BNPL tidak dapat dimuatkan", "BNPL could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void fetchData() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
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
                  <div key={i} className="h-32 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                  <CreditCard size={24} />
                </span>
                <p className="mt-4 text-base font-bold text-[var(--text)]">{items.length ? tr("Tiada dalam tapisan ini", "None in this filter") : tr("Belum ada BNPL", "No BNPL yet")}</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{tr("Jejak bayar-kemudian anda: SPayLater, Atome, Grab dan lain-lain.", "Track your pay-later plans: SPayLater, Atome, Grab and more.")}</p>
                {!items.length && (
                  <button type="button" onClick={openCreate} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                    <Plus size={15} />
                    {tr("Tambah BNPL", "Add BNPL")}
                  </button>
                )}
              </div>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {visible.map((item) => {
                  const pct = item.total_amount ? Math.min(100, Math.max(0, (item.paid_amount / item.total_amount) * 100)) : 0
                  return (
                    <li key={item.id} className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                      <button type="button" onClick={() => openDetail(item)} className="flex w-full items-center gap-3 text-left">
                        {item.has_image && item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                        ) : (
                          <BnplProviderBadge provider={item.provider} size={44} rounded="rounded-full" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-bold text-[var(--text)]">{item.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">
                            {item.provider}
                            {item.category_name ? ` · ${item.category_name}` : ""}
                          </span>
                        </span>
                        {dueChip(item)}
                      </button>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                        <div className="h-full rounded-full bg-[var(--btn-primary-bg)] transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-[var(--muted)]">
                          RM {money(item.monthly_amount)} / {tr("bulan", "mo")}
                        </span>
                        <span className="font-bold tabular-nums text-[var(--text)]">
                          {item.status === "settled" ? tr("Tiada baki", "Nothing left") : `${tr("Baki", "Left")} RM ${money(item.outstanding_amount)}`}
                        </span>
                      </div>
                      {item.status === "active" && (
                        <button type="button" onClick={() => openPay(item, true)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98]">
                          <Check size={15} />
                          {tr("Bayar ansuran", "Pay instalment")}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </DesktopPageBody>

      {/* ── Detail ── */}
      <AppSheet
        open={!!detail && !showForm && !(showPay && payFromList)}
        onClose={() => { setDetailId(null); setShowPay(false) }}
        id="bnpl-detail-sheet"
        title={detail?.name || ""}
        subtitle={detail ? `${detail.provider}${detail.category_name ? ` · ${detail.category_name}` : ""}` : undefined}
        size="lg"
        footer={
          detail ? (
            <div className="space-y-2">
              {detail.status === "active" && (
                <button type="button" onClick={() => openPay(detail)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] active:scale-[0.98]">
                  <Check size={16} />
                  {tr("Bayar ansuran", "Pay instalment")}
                </button>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(detail)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--text)]">
                  <Pencil size={14} />
                  {tr("Ubah", "Edit")}
                </button>
                <button type="button" onClick={removeItem} disabled={saving} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-rose-500/30 text-sm font-semibold text-rose-500 disabled:opacity-50">
                  <Trash2 size={14} />
                  {tr("Padam", "Delete")}
                </button>
              </div>
            </div>
          ) : null
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-[var(--border)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--muted)]">{tr("Baki perlu dibayar", "Still to pay")}</span>
                {dueChip(detail)}
              </div>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[var(--text)]">
                <span className="mr-1.5 text-lg font-semibold text-[var(--muted)]">RM</span>
                {money(detail.outstanding_amount)}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                <div className="h-full rounded-full bg-[var(--btn-primary-bg)]" style={{ width: `${detail.total_amount ? Math.min(100, (detail.paid_amount / detail.total_amount) * 100) : 0}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                {[
                  [tr("Jumlah", "Total"), `RM ${money(detail.total_amount)}`],
                  [tr("Dibayar", "Paid"), `RM ${money(detail.paid_amount)}`],
                  [tr("Sebulan", "Monthly"), `RM ${money(detail.monthly_amount)}`],
                  [tr("Ansuran", "Instalments"), String(detail.installment_count)],
                  [tr("Hari bayaran", "Due day"), String(detail.due_day_of_month)],
                  [tr("Mula", "Started"), fmtDate(detail.start_date, locale)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-[var(--muted)]">{k}</dt>
                    <dd className="font-semibold tabular-nums text-[var(--text)]">{v}</dd>
                  </div>
                ))}
              </dl>
              {detail.notes ? <p className="mt-3 text-sm text-[var(--muted)]">{detail.notes}</p> : null}
            </div>

            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadImage(f) }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={saving} className="flex h-11 items-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] px-5 text-sm font-semibold text-[var(--muted)] disabled:opacity-50">
                <ImagePlus size={15} />
                {detail.has_image ? tr("Tukar gambar", "Change picture") : tr("Tambah gambar (pilihan)", "Add a picture (optional)")}
              </button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-[var(--text)]">{tr("Bayaran dibuat", "Payments made")}</h3>
              {payments.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">{tr("Belum ada bayaran.", "No payments yet.")}</p>
              ) : (
                <ul className="divide-y divide-[var(--border)] rounded-[1.5rem] border border-[var(--border)]">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold tabular-nums text-[var(--text)]">RM {money(p.amount)}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {fmtDate(p.payment_date, locale)}
                          {p.notes ? ` · ${p.notes}` : ""}
                        </p>
                      </div>
                      <button type="button" onClick={() => undoPayment(p)} disabled={saving} aria-label={tr("Padam bayaran", "Delete payment")} className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 hover:bg-rose-500/10 disabled:opacity-50">
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </AppSheet>

      {/* ── Create / edit ── */}
      <AppSheet
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null) }}
        id="bnpl-sheet"
        title={editing ? tr("Ubah BNPL", "Edit BNPL") : tr("BNPL baharu", "New BNPL")}
        size="lg"
        footer={
          <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {editing ? tr("Simpan perubahan", "Save changes") : tr("Tambah BNPL", "Add BNPL")}
          </button>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="bn-name" className={label}>{tr("Nama (cth. barang yang dibeli)", "Name (e.g. what you bought)")}</label>
            <input id="bn-name" value={form.name} maxLength={190} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="bn-provider" className={label}>{tr("Penyedia", "Provider")}</label>
              <select id="bn-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={field}>
                {BNPL_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bn-cat" className={label}>{tr("Kategori bayaran", "Payment category")}</label>
              <select id="bn-cat" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={field}>
                <option value="">{tr("Pilih…", "Choose…")}</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="bn-total" className={label}>{tr("Jumlah keseluruhan (RM)", "Total (RM)")}</label>
              <input id="bn-total" inputMode="decimal" value={form.total_amount} onChange={(e) => setPlan({ total_amount: e.target.value })} placeholder="0.00" className={field} />
            </div>
            <div>
              <label htmlFor="bn-count" className={label}>{tr("Bilangan ansuran", "Instalments")}</label>
              <input id="bn-count" inputMode="numeric" value={form.installment_count} onChange={(e) => setPlan({ installment_count: e.target.value.replace(/\D/g, "") })} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="bn-monthly" className={label}>{tr("Ansuran bulanan (RM)", "Monthly instalment (RM)")}</label>
            <input id="bn-monthly" inputMode="decimal" value={form.monthly_amount} onChange={(e) => { setMonthlyTouched(true); setForm({ ...form, monthly_amount: e.target.value }) }} placeholder="0.00" className={field} />
            {planCovers > 0 && totalNum > 0 && Math.abs(planCovers - totalNum) > 0.5 ? (
              <p className="mt-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                {tr(`${countNum} × RM ${money(monthlyNum)} = RM ${money(planCovers)}, tidak sama dengan jumlah RM ${money(totalNum)}. Ini lazim jika ada caj; baki dikira daripada jumlah.`, `${countNum} × RM ${money(monthlyNum)} = RM ${money(planCovers)}, which differs from the RM ${money(totalNum)} total. That is normal with fees; the balance counts down from the total.`)}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="bn-due" className={label}>{tr("Hari bayaran setiap bulan", "Due day each month")}</label>
              <input id="bn-due" inputMode="numeric" value={form.due_day_of_month} onChange={(e) => setForm({ ...form, due_day_of_month: e.target.value.replace(/\D/g, "") })} className={field} />
            </div>
            <div>
              <label htmlFor="bn-start" className={label}>{tr("Tarikh mula", "Start date")}</label>
              <input id="bn-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="bn-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <textarea id="bn-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]" />
          </div>
          {editing ? <p className="text-xs text-[var(--muted)]">{tr("Baki dikira semula daripada jumlah tolak bayaran yang sudah direkod.", "The balance is recalculated from the total less the payments recorded.")}</p> : null}
        </form>
      </AppSheet>

      {/* ── Pay ── */}
      <AppSheet
        open={showPay}
        onClose={() => { setShowPay(false); if (payFromList) setDetailId(null) }}
        id="bnpl-pay-sheet"
        title={tr("Bayar ansuran", "Pay instalment")}
        subtitle={detail?.name}
        size="md"
        footer={
          <button type="button" onClick={() => void savePayment()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Rekod bayaran", "Record payment")}
          </button>
        }
      >
        <form onSubmit={savePayment} className="space-y-4">
          <div>
            <label htmlFor="bp-amount" className={label}>{tr("Amaun (RM)", "Amount (RM)")}</label>
            <input id="bp-amount" inputMode="decimal" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className={field} />
            {detail ? <p className="mt-1.5 text-xs text-[var(--muted)]">{tr("Baki", "Still owed")}: RM {money(detail.outstanding_amount)}</p> : null}
          </div>
          <div>
            <label htmlFor="bp-wallet" className={label}>{tr("Dibayar daripada dompet", "Paid from wallet")}</label>
            <select id="bp-wallet" value={payForm.wallet_id} onChange={(e) => setPayForm({ ...payForm, wallet_id: e.target.value })} className={field}>
              <option value="">{tr("Pilih dompet…", "Choose a wallet…")}</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.label || w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bp-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <input id="bp-notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className={field} />
          </div>
          <p className="text-xs text-[var(--muted)]">{tr("Ini direkod sebagai belanja dalam kategori yang dipilih.", "This is recorded as an expense in the chosen category.")}</p>
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
