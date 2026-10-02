"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  CheckCircle2,
  HandCoins,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Receipt as ReceiptIcon,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type Member = { name: string; amount: number }

type SplitBill = {
  id: number
  title: string
  transaction_id?: number | null
  currency: string
  total_amount?: number | null
  people_count: number
  share_amount?: number | null
  collect_amount?: number | null
  amount_received: number
  balance_amount: number
  am_i_included: boolean
  members?: Member[] | null
  status: string
  notes?: string | null
  original_txn_date?: string | null
  created_at: string
  updated_at: string
}

type SplitBillPayment = {
  id: number
  split_bill_id: number
  wallet_id?: number | null
  transaction_id?: number | null
  amount: number
  payment_date?: string | null
  payment_time?: string | null
  notes?: string | null
  has_media: boolean
  media_url?: string | null
  created_at: string
}

type SplitBillDetail = SplitBill & { payments: SplitBillPayment[] }

type WalletItem = { id: number; name: string; label?: string | null; currency: string }

type TxnOption = {
  id: number
  type: string
  amount: number
  vendor_or_source?: string | null
  txn_date?: string | null
  wallet_name?: string | null
}

type FormMember = { id: number; name: string; amount: string }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatDateShort(value?: string | null, locale = "en-MY") {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

const STATUS_LABEL: Record<string, [string, string]> = {
  active: ["Menunggu", "Waiting"],
  partial: ["Separa", "Partial"],
  completed: ["Selesai", "Completed"],
  cancelled: ["Dibatalkan", "Cancelled"],
}

export default function SplitBillsPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)
  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  const [splits, setSplits] = useState<SplitBill[]>([])
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [transactions, setTransactions] = useState<TxnOption[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<"all" | "active" | "partial" | "completed">("all")
  const [search, setSearch] = useState("")

  // Create / edit
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SplitBillDetail | null>(null)
  const newMembers = (): FormMember[] => [
    { id: 1, name: "", amount: "" },
    { id: 2, name: "", amount: "" },
  ]
  const [form, setForm] = useState({
    transaction_id: "",
    total: "",
    title: "",
    people_count: "2",
    am_i_included: true,
    notes: "",
    mode: "equal" as "equal" | "manual",
    members: newMembers(),
  })

  // Detail and payment
  const [detail, setDetail] = useState<SplitBillDetail | null>(null)
  const [showPay, setShowPay] = useState(false)
  const [payForm, setPayForm] = useState({ amount: "", wallet_id: "", payment_date: "", payment_time: "", notes: "" })
  const [payFile, setPayFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const errorOf = async (res: Response, fallback: string) => {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof body?.detail === "string" ? body.detail : fallback
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  const loadSplits = useCallback(async () => {
    try {
      const res = await fetch("/api/split-bills", { headers: authHeaders(), cache: "no-store" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSplits(Array.isArray(data) ? data : [])
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  useEffect(() => {
    void loadSplits()
    void (async () => {
      try {
        const [w, t] = await Promise.all([
          fetch("/api/wallets", { headers: authHeaders(), cache: "no-store" }),
          fetch("/api/transactions?limit=300", { headers: authHeaders(), cache: "no-store" }),
        ])
        if (w.ok) setWallets(await w.json())
        if (t.ok) setTransactions(await t.json())
      } catch {
        // pickers are optional
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Totals ───────────────────────────────────────────────────────────────

  const open = useMemo(() => splits.filter((s) => s.status === "active" || s.status === "partial"), [splits])
  const pending = open.reduce((sum, s) => sum + Math.max(0, Number(s.balance_amount || 0)), 0)
  const received = splits.reduce((sum, s) => sum + Number(s.amount_received || 0), 0)
  const completedCount = splits.filter((s) => s.status === "completed").length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return splits.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false
      if (!q) return true
      return s.title.toLowerCase().includes(q) || (s.members || []).some((m) => m.name.toLowerCase().includes(q))
    })
  }, [splits, filter, search])

  // ── Form state ───────────────────────────────────────────────────────────

  // Expenses that do not already have an open split.
  const linkedIds = useMemo(
    () => new Set(splits.filter((s) => s.transaction_id && (s.status === "active" || s.status === "partial") && s.id !== editing?.id).map((s) => s.transaction_id as number)),
    [splits, editing]
  )
  const txnOptions = useMemo(
    () => transactions.filter((t) => t.type === "expense" && !linkedIds.has(t.id)),
    [transactions, linkedIds]
  )
  const selectedTxn = transactions.find((t) => String(t.id) === form.transaction_id)
  const total = selectedTxn ? selectedTxn.amount : editing ? editing.total_amount ?? null : form.total ? parseFloat(form.total) || null : null
  const people = Math.max(1, Math.min(100, parseInt(form.people_count || "2", 10) || 2))
  const equalCollect = total != null ? (form.am_i_included ? (people > 1 ? round2((total * (people - 1)) / people) : 0) : total) : 0
  const equalShare = total != null ? (form.am_i_included ? round2(total / people) : 0) : 0
  const manualRows = form.members.map((m) => ({ name: m.name.trim(), amount: parseFloat(m.amount) || 0 }))
  const manualSum = round2(manualRows.reduce((s, r) => s + r.amount, 0))
  const manualRest = total != null ? round2(total - manualSum) : 0

  const formProblem = (() => {
    if (!form.title.trim()) return tr("Tajuk diperlukan.", "A title is required.")
    if (total == null || total <= 0) return tr("Masukkan jumlah resit atau pilih transaksi.", "Enter the receipt total or pick a transaction.")
    if (form.mode === "manual") {
      if (manualRows.some((r) => !r.name)) return tr("Isi nama setiap orang.", "Fill in every person's name.")
      if (manualRows.some((r) => r.amount <= 0)) return tr("Setiap orang mesti ada amaun.", "Every person needs an amount.")
      if (form.am_i_included && manualRest < -0.01) return tr("Amaun melebihi jumlah resit.", "Amounts exceed the receipt total.")
      if (!form.am_i_included && Math.abs(manualRest) > 0.01) return tr(`Baki RM ${money(manualRest)} belum diagihkan.`, `RM ${money(manualRest)} is not shared out yet.`)
    } else if (people < 2 && !form.am_i_included) {
      return tr("Sekurang-kurangnya seorang lagi.", "At least one other person.")
    }
    if (editing && editing.amount_received > 0) {
      const collect = form.mode === "manual" ? (form.am_i_included ? manualSum : total) : equalCollect
      if (collect != null && collect + 0.01 < editing.amount_received)
        return tr(`Jumlah kutipan kurang daripada RM ${money(editing.amount_received)} yang sudah diterima.`, `The amount to collect is below the RM ${money(editing.amount_received)} already received.`)
    }
    return null
  })()

  const openCreate = useCallback(() => {
    setEditing(null)
    setForm({ transaction_id: "", total: "", title: "", people_count: "2", am_i_included: true, notes: "", mode: "equal", members: newMembers() })
    setShowForm(true)
  }, [])

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      openCreate()
      const txn = searchParams.get("txn")
      if (txn) setForm((prev) => ({ ...prev, transaction_id: txn }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Picking a transaction fills the title when it is still empty.
  useEffect(() => {
    if (editing || !selectedTxn || form.title.trim()) return
    const name = (selectedTxn.vendor_or_source || "").trim()
    if (name) setForm((prev) => ({ ...prev, title: name }))
  }, [selectedTxn, editing, form.title])

  const openEdit = useCallback((split: SplitBillDetail) => {
    setEditing(split)
    setForm({
      transaction_id: split.transaction_id ? String(split.transaction_id) : "",
      total: split.total_amount != null ? String(split.total_amount) : "",
      title: split.title,
      people_count: String(split.people_count),
      am_i_included: split.am_i_included,
      notes: split.notes || "",
      mode: split.members && split.members.length ? "manual" : "equal",
      members: split.members && split.members.length ? split.members.map((m, i) => ({ id: i + 1, name: m.name || "", amount: String(m.amount ?? "") })) : newMembers(),
    })
    setDetail(null)
    setShowForm(true)
  }, [])

  const saveForm = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (formProblem || saving) {
      if (formProblem) showAlert(tr("Maklumat tak lengkap", "Incomplete info"), formProblem, "error")
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        people_count: form.mode === "manual" ? manualRows.length + (form.am_i_included ? 1 : 0) : people,
        am_i_included: form.am_i_included,
        notes: form.notes.trim() || null,
      }
      if (!editing) {
        body.transaction_id = form.transaction_id ? Number(form.transaction_id) : null
        if (!form.transaction_id) body.total_amount = total
      }
      if (form.mode === "manual") body.members = manualRows
      else if (editing && editing.members?.length) body.members = null
      const res = await fetch(editing ? `/api/split-bills/${editing.id}` : "/api/split-bills", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan split bill.", "Failed to save the split bill.")))
      setShowForm(false)
      setEditing(null)
      await loadSplits()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  // ── Detail, payments ─────────────────────────────────────────────────────

  const openDetail = useCallback(
    async (split: SplitBill) => {
      try {
        const res = await fetch(`/api/split-bills/${split.id}`, { headers: authHeaders(), cache: "no-store" })
        if (!res.ok) throw new Error()
        setDetail((await res.json()) as SplitBillDetail)
      } catch {
        showAlertRef.current(tr("Ralat", "Error"), tr("Gagal membuka split bill.", "Could not open the split bill."), "error")
      }
    },
    [authHeaders, tr]
  )

  const applyUpdated = (updated: SplitBillDetail) => {
    setDetail(updated)
    setSplits((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  const openPay = () => {
    if (!detail) return
    setPayForm({ amount: detail.balance_amount > 0 ? String(detail.balance_amount) : "", wallet_id: wallets[0] ? String(wallets[0].id) : "", payment_date: "", payment_time: "", notes: "" })
    setPayFile(null)
    setShowPay(true)
  }

  const payAmount = parseFloat(payForm.amount) || 0
  const payProblem = !detail
    ? null
    : payAmount <= 0
      ? tr("Amaun mesti lebih daripada sifar.", "The amount must be above zero.")
      : payAmount > detail.balance_amount + 0.01
        ? tr(`Melebihi baki RM ${money(detail.balance_amount)}.`, `More than the RM ${money(detail.balance_amount)} still owed.`)
        : !detail.transaction_id && !payForm.wallet_id
          ? tr("Pilih dompet penerima.", "Choose the receiving wallet.")
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
      const res = await fetch(`/api/split-bills/${detail.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          amount: payAmount,
          wallet_id: payForm.wallet_id ? Number(payForm.wallet_id) : null,
          payment_date: payForm.payment_date || null,
          payment_time: payForm.payment_time || null,
          notes: payForm.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal rekod bayaran.", "Failed to record the payment.")))
      let updated = (await res.json()) as SplitBillDetail
      const newest = [...updated.payments].sort((a, b) => b.id - a.id)[0]
      let mediaFailed = false
      if (payFile && newest) {
        const fd = new FormData()
        fd.append("file", payFile)
        const up = await fetch(`/api/split-bills/${updated.id}/payments/${newest.id}/media`, { method: "POST", headers: authHeaders(), body: fd })
        if (up.ok) updated = (await up.json()) as SplitBillDetail
        else mediaFailed = true
      }
      applyUpdated(updated)
      setShowPay(false)
      if (mediaFailed) showAlert(tr("Bayaran disimpan", "Payment saved"), tr("Tetapi bukti tidak dapat dimuat naik.", "But the proof could not be uploaded."), "warning")
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const removePayment = (payment: SplitBillPayment) => {
    if (!detail) return
    showConfirm(
      tr("Padam bayaran?", "Delete payment?"),
      tr(`Padam bayaran RM ${money(payment.amount)}? Pendapatan yang direkodkan juga dibuang dan baki dompet dikembalikan.`, `Delete the RM ${money(payment.amount)} payment? The income it recorded is removed too and the wallet balance goes back.`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/split-bills/${detail.id}/payments/${payment.id}`, { method: "DELETE", headers: authHeaders() })
          if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam bayaran.", "Failed to delete the payment.")))
          applyUpdated((await res.json()) as SplitBillDetail)
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
        } finally {
          setSaving(false)
        }
      },
      "warning"
    )
  }

  const complete = () => {
    if (!detail) return
    showConfirm(tr("Tandakan selesai?", "Mark completed?"), tr(`Tandakan ${detail.title} sebagai selesai?`, `Mark ${detail.title} as completed?`), async () => {
      setSaving(true)
      try {
        const res = await fetch(`/api/split-bills/${detail.id}/complete`, { method: "POST", headers: authHeaders() })
        if (!res.ok) throw new Error(await errorOf(res, tr("Gagal menyelesaikan.", "Failed to complete.")))
        applyUpdated((await res.json()) as SplitBillDetail)
      } catch (err) {
        showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "", "error")
      } finally {
        setSaving(false)
      }
    }, "success")
  }

  const removeSplit = () => {
    if (!detail) return
    const paid = detail.payments.length
    showConfirm(
      tr("Padam split bill?", "Delete split bill?"),
      paid
        ? tr(`Padam “${detail.title}”? ${paid} bayaran yang sudah direkod kekal sebagai pendapatan dalam transaksi anda; padam bayaran dahulu jika mahu membuangnya.`, `Delete “${detail.title}”? The ${paid} payment(s) already recorded stay as income in your transactions; delete the payments first to remove them.`)
        : tr(`Padam “${detail.title}”?`, `Delete “${detail.title}”?`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/split-bills/${detail.id}`, { method: "DELETE", headers: authHeaders() })
          if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam split bill.", "Failed to delete the split bill.")))
          setDetail(null)
          await loadSplits()
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
        } finally {
          setSaving(false)
        }
      },
      "warning"
    )
  }

  // ── Pieces ───────────────────────────────────────────────────────────────

  const statusChip = (status: string) => {
    const label = STATUS_LABEL[status] || [status, status]
    const tone = status === "completed" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : status === "partial" ? "text-amber-600 dark:text-amber-400 border-amber-500/30" : "text-[var(--muted)] border-[var(--border)]"
    return <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tone)}>{isBm ? label[0] : label[1]}</span>
  }

  const filters: Array<[typeof filter, string, number]> = [
    ["all", tr("Semua", "All"), splits.length],
    ["active", tr("Menunggu", "Waiting"), splits.filter((s) => s.status === "active").length],
    ["partial", tr("Separa", "Partial"), splits.filter((s) => s.status === "partial").length],
    ["completed", tr("Selesai", "Completed"), completedCount],
  ]

  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader
          title="Split Bill"
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreate} label={tr("Buat split bill", "New split bill")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden lg:block"
        title="Split Bill"
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={openCreate}>
            <Plus strokeWidth={2.5} />
            {tr("Buat split bill", "New split bill")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <HandCoins size={16} />
              {tr("Belum diterima", "Still to collect")}
            </>
          }
          currency="RM"
          amount={showSkeleton ? "—" : money(pending)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "received", tone: "in", icon: <Check size={15} strokeWidth={2.4} />, label: tr("Sudah diterima", "Received"), value: `RM ${money(received)}` },
            { key: "open", tone: "neutral", icon: <Users size={15} strokeWidth={2.2} />, label: tr("Masih terbuka", "Still open"), value: String(open.length) },
          ]}
        />

        {loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-base font-bold text-[var(--text)]">{tr("Split bill tidak dapat dimuatkan", "Split bills could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void loadSplits() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
              {tr("Cuba lagi", "Try again")}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div role="tablist" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filters.map(([key, text, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    onClick={() => setFilter(key)}
                    className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", filter === key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")}
                  >
                    {text}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", filter === key ? "bg-white/20" : "bg-[var(--surface-tint-strong)]")}>{count}</span>
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-4 top-3.5 text-[var(--muted)]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Cari tajuk atau nama…", "Search title or name…")} aria-label={tr("Cari", "Search")} className="h-11 w-full rounded-full border border-[var(--border)] bg-transparent pl-11 pr-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)] md:text-sm" />
              </div>
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
                  <Users size={24} />
                </span>
                <p className="mt-4 text-base font-bold text-[var(--text)]">{splits.length ? tr("Tiada padanan", "No matches") : tr("Belum ada split bill", "No split bills yet")}</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{splits.length ? tr("Cuba tapisan atau carian lain.", "Try another filter or search.") : tr("Bahagi bil dengan kawan dan jejak siapa yang sudah bayar.", "Split a bill with friends and track who has paid.")}</p>
                {!splits.length && (
                  <button type="button" onClick={openCreate} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                    <Plus size={15} />
                    {tr("Buat split bill", "New split bill")}
                  </button>
                )}
              </div>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {visible.map((s) => {
                  const collect = Number(s.collect_amount || 0)
                  const pct = collect > 0 ? Math.min(100, (Number(s.amount_received) / collect) * 100) : 0
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => void openDetail(s)} className="w-full rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:bg-[var(--surface-tint)] active:scale-[0.99]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-[var(--text)]">{s.title}</p>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {s.people_count} {tr("orang", "people")} · {formatDateShort(s.original_txn_date || s.created_at.slice(0, 10), isBm ? "ms-MY" : "en-MY")}
                            </p>
                          </div>
                          {statusChip(s.status)}
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                          <div className="h-full rounded-full bg-[var(--income)] transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-[var(--muted)]">
                            {tr("Diterima", "Received")} <span className="font-semibold tabular-nums text-[var(--text)]">RM {money(s.amount_received)}</span>
                          </span>
                          <span className="font-bold tabular-nums text-[var(--text)]">
                            {s.balance_amount > 0.005 ? `${tr("Baki", "Left")} RM ${money(s.balance_amount)}` : tr("Tiada baki", "Nothing left")}
                          </span>
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

      {/* ── Detail ── */}
      <AppSheet
        open={!!detail}
        onClose={() => setDetail(null)}
        id="split-detail-sheet"
        title={detail?.title || ""}
        subtitle={detail ? `${detail.people_count} ${tr("orang", "people")}` : undefined}
        size="lg"
        footer={
          detail ? (
            <div className="space-y-2">
              {detail.status !== "completed" && detail.balance_amount > 0.005 && (
                <button type="button" onClick={openPay} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] active:scale-[0.98]">
                  <Plus size={16} />
                  {tr("Rekod bayaran diterima", "Record a payment received")}
                </button>
              )}
              {detail.status !== "completed" && detail.balance_amount <= 0.005 && detail.collect_amount && detail.collect_amount > 0 ? (
                <button type="button" onClick={complete} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-50">
                  <CheckCircle2 size={16} />
                  {tr("Tandakan selesai", "Mark completed")}
                </button>
              ) : null}
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(detail)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--text)]">
                  <Pencil size={14} />
                  {tr("Ubah", "Edit")}
                </button>
                <button type="button" onClick={removeSplit} disabled={saving} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-rose-500/30 text-sm font-semibold text-rose-500 disabled:opacity-50">
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
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--muted)]">{tr("Perlu dikutip", "To collect")}</span>
                {statusChip(detail.status)}
              </div>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[var(--text)]">
                <span className="mr-1.5 text-lg font-semibold text-[var(--muted)]">RM</span>
                {money(detail.balance_amount)}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                <div className="h-full rounded-full bg-[var(--income)]" style={{ width: `${detail.collect_amount ? Math.min(100, (detail.amount_received / detail.collect_amount) * 100) : 0}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                {[
                  [tr("Jumlah resit", "Receipt"), detail.total_amount],
                  [tr("Bahagian saya", "My share"), detail.share_amount],
                  [tr("Dikutip", "To collect"), detail.collect_amount],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="text-xs text-[var(--muted)]">{k as string}</dt>
                    <dd className="font-semibold tabular-nums text-[var(--text)]">{v == null ? "—" : `RM ${money(v as number)}`}</dd>
                  </div>
                ))}
              </dl>
              {detail.notes ? <p className="mt-3 text-sm text-[var(--muted)]">{detail.notes}</p> : null}
            </div>

            {detail.members && detail.members.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--text)]">{tr("Siapa berhutang", "Who owes")}</h3>
                <ul className="divide-y divide-[var(--border)] rounded-[1.5rem] border border-[var(--border)]">
                  {detail.members.map((m, i) => (
                    <li key={`${m.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="truncate font-semibold text-[var(--text)]">{m.name}</span>
                      <span className="tabular-nums text-[var(--text)]">RM {money(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-bold text-[var(--text)]">{tr("Bayaran diterima", "Payments received")}</h3>
              {detail.payments.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">{tr("Belum ada bayaran.", "No payments yet.")}</p>
              ) : (
                <ul className="divide-y divide-[var(--border)] rounded-[1.5rem] border border-[var(--border)]">
                  {detail.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+RM {money(p.amount)}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {formatDateShort(p.payment_date, isBm ? "ms-MY" : "en-MY")}
                          {p.payment_time ? ` · ${p.payment_time}` : ""}
                          {p.notes ? ` · ${p.notes}` : ""}
                        </p>
                      </div>
                      {p.has_media && p.media_url ? (
                        <a href={p.media_url} target="_blank" rel="noreferrer" aria-label={tr("Lihat bukti", "View proof")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]">
                          <ReceiptIcon size={15} />
                        </a>
                      ) : null}
                      <button type="button" onClick={() => removePayment(p)} disabled={saving} aria-label={tr("Padam bayaran", "Delete payment")} className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 hover:bg-rose-500/10 disabled:opacity-50">
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
        id="split-create-sheet"
        title={editing ? tr("Ubah split bill", "Edit split bill") : tr("Split bill baharu", "New split bill")}
        size="lg"
        footer={
          <button type="button" onClick={() => void saveForm()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {editing ? tr("Simpan perubahan", "Save changes") : tr("Cipta split bill", "Create split bill")}
          </button>
        }
      >
        <form onSubmit={saveForm} className="space-y-4">
          {!editing && (
            <div>
              <label htmlFor="sb-txn" className={label}>{tr("Transaksi (pilihan)", "Transaction (optional)")}</label>
              <select id="sb-txn" value={form.transaction_id} onChange={(e) => setForm({ ...form, transaction_id: e.target.value })} className={field}>
                <option value="">{tr("Tiada, taip jumlah sendiri", "None, type the total")}</option>
                {txnOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {(t.vendor_or_source || tr("Belanja", "Expense")).slice(0, 36)} · RM {money(t.amount)}{t.txn_date ? ` · ${t.txn_date}` : ""}
                  </option>
                ))}
              </select>
              {form.transaction_id ? <p className="mt-1.5 text-xs text-[var(--muted)]">{tr("Bayaran diterima akan masuk ke dompet transaksi ini.", "Payments received go into this transaction's wallet.")}</p> : null}
            </div>
          )}

          {!selectedTxn && !editing && (
            <div>
              <label htmlFor="sb-total" className={label}>{tr("Jumlah resit (RM)", "Receipt total (RM)")}</label>
              <input id="sb-total" inputMode="decimal" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} placeholder="0.00" className={field} />
            </div>
          )}
          {(selectedTxn || editing) && total != null && (
            <p className="rounded-[1.25rem] border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
              {tr("Jumlah resit", "Receipt total")}: <strong className="text-[var(--text)]">RM {money(total)}</strong>
            </p>
          )}

          <div>
            <label htmlFor="sb-title" className={label}>{tr("Tajuk", "Title")}</label>
            <input id="sb-title" value={form.title} maxLength={190} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr("cth. Makan malam", "e.g. Dinner")} className={field} />
          </div>

          <div className="flex gap-1.5">
            {(["equal", "manual"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setForm({ ...form, mode: m })} className={cn("h-10 flex-1 rounded-full border text-sm font-semibold transition", form.mode === m ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                {m === "equal" ? tr("Sama rata", "Split equally") : tr("Ikut amaun", "By amount")}
              </button>
            ))}
          </div>

          <button type="button" role="switch" aria-checked={form.am_i_included} onClick={() => setForm({ ...form, am_i_included: !form.am_i_included })} className="flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--border)] px-4 py-3 text-left">
            <span>
              <span className="block text-sm font-semibold text-[var(--text)]">{tr("Saya turut berkongsi", "I share the bill too")}</span>
              <span className="block text-xs text-[var(--muted)]">{tr("Matikan jika orang lain menanggung semuanya", "Turn off if others cover all of it")}</span>
            </span>
            <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", form.am_i_included ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--surface-tint-strong)]")}>
              <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition-all", form.am_i_included ? "left-5" : "left-1")} />
            </span>
          </button>

          {form.mode === "equal" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--text)]">{tr("Bilangan orang (termasuk saya jika berkongsi)", "People (including me if sharing)")}</span>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="-" onClick={() => setForm({ ...form, people_count: String(Math.max(1, people - 1)) })} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]">
                    <Minus size={15} />
                  </button>
                  <span className="w-8 text-center text-lg font-bold tabular-nums">{people}</span>
                  <button type="button" aria-label="+" onClick={() => setForm({ ...form, people_count: String(Math.min(100, people + 1)) })} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]">
                    <Plus size={15} />
                  </button>
                </div>
              </div>
              {total != null && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-[1.25rem] border border-[var(--border)] p-3">
                    <p className="text-xs text-[var(--muted)]">{tr("Bahagian saya", "My share")}</p>
                    <p className="font-bold tabular-nums">RM {money(equalShare)}</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-[var(--border)] p-3">
                    <p className="text-xs text-[var(--muted)]">{tr("Perlu dikutip", "To collect")}</p>
                    <p className="font-bold tabular-nums">RM {money(equalCollect)}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {form.members.map((m, i) => (
                <div key={m.id} className="flex gap-2">
                  <input value={m.name} maxLength={120} onChange={(e) => setForm({ ...form, members: form.members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)) })} placeholder={`${tr("Nama", "Name")} ${i + 1}`} aria-label={`${tr("Nama", "Name")} ${i + 1}`} className={cn(field, "min-w-0 flex-1")} />
                  <input inputMode="decimal" value={m.amount} onChange={(e) => setForm({ ...form, members: form.members.map((x) => (x.id === m.id ? { ...x, amount: e.target.value } : x)) })} placeholder="0.00" aria-label={tr("Amaun", "Amount")} className={cn(field, "w-28 shrink-0")} />
                  {form.members.length > 1 && (
                    <button type="button" aria-label={tr("Buang orang", "Remove person")} onClick={() => setForm({ ...form, members: form.members.filter((x) => x.id !== m.id) })} className="flex h-12 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:text-rose-500">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setForm({ ...form, members: [...form.members, { id: Math.max(...form.members.map((x) => x.id)) + 1, name: "", amount: "" }] })} className="flex h-10 items-center gap-1.5 rounded-full border border-dashed border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--muted)]">
                <Plus size={14} />
                {tr("Tambah orang", "Add person")}
              </button>
              {total != null && (
                <p className={cn("text-sm font-semibold", manualRest < -0.01 || (!form.am_i_included && Math.abs(manualRest) > 0.01) ? "text-amber-600 dark:text-amber-400" : "text-[var(--muted)]")}>
                  {form.am_i_included ? tr("Bahagian saya", "My share") : tr("Belum diagihkan", "Left to share out")}: RM {money(manualRest)}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="sb-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <textarea id="sb-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]" />
          </div>
          {formProblem && form.title.trim() ? <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formProblem}</p> : null}
        </form>
      </AppSheet>

      {/* ── Payment ── */}
      <AppSheet
        open={showPay}
        onClose={() => setShowPay(false)}
        id="split-payment-sheet"
        title={tr("Bayaran diterima", "Payment received")}
        subtitle={detail?.title}
        size="md"
        footer={
          <button type="button" onClick={() => void savePayment()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {tr("Simpan bayaran", "Save payment")}
          </button>
        }
      >
        <form onSubmit={savePayment} className="space-y-4">
          <div>
            <label htmlFor="pay-amount" className={label}>{tr("Amaun (RM)", "Amount (RM)")}</label>
            <input id="pay-amount" inputMode="decimal" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className={field} />
            {detail ? <p className="mt-1.5 text-xs text-[var(--muted)]">{tr("Baki", "Still owed")}: RM {money(detail.balance_amount)}</p> : null}
          </div>
          {detail && !detail.transaction_id && (
            <div>
              <label htmlFor="pay-wallet" className={label}>{tr("Masuk ke dompet", "Into wallet")}</label>
              <select id="pay-wallet" value={payForm.wallet_id} onChange={(e) => setPayForm({ ...payForm, wallet_id: e.target.value })} className={field}>
                <option value="">{tr("Pilih dompet…", "Choose a wallet…")}</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>{w.label || w.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="pay-date" className={label}>{tr("Tarikh", "Date")}</label>
              <input id="pay-date" type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="pay-time" className={label}>{tr("Masa", "Time")}</label>
              <input id="pay-time" type="time" value={payForm.payment_time} onChange={(e) => setPayForm({ ...payForm, payment_time: e.target.value })} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="pay-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <input id="pay-notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder={tr("cth. Ali bayar tunai", "e.g. Ali paid cash")} className={field} />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                e.target.value = ""
                if (f && f.size > 10 * 1024 * 1024) {
                  showAlert(tr("Fail terlalu besar", "File too large"), tr("Had 10 MB.", "The limit is 10 MB."), "warning")
                  return
                }
                setPayFile(f)
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] text-sm font-semibold text-[var(--muted)]">
              <Upload size={15} />
              {payFile ? payFile.name : tr("Lampirkan bukti (pilihan)", "Attach proof (optional)")}
            </button>
            {payFile ? (
              <button type="button" onClick={() => setPayFile(null)} className="mt-1.5 text-xs font-semibold text-[var(--muted)] underline underline-offset-4">
                {tr("Buang lampiran", "Remove attachment")}
              </button>
            ) : null}
          </div>
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
