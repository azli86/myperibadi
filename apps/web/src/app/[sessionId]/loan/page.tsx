"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, CreditCard, Loader2, Plus, Wallet, CalendarClock, X, Pencil, Trash2, BadgeCheck } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"

type LoanItem = {
  id: number
  name: string
  key: string
  opening_amount: number
  outstanding_amount: number
  monthly_payment?: number | null
  paid_amount?: number
  remaining_months?: number | null
  start_date: string
  notes?: string | null
  status: string
  payment_count: number
  last_payment_at?: string | null
}

type LoanFormState = {
  name: string
  opening_amount: string
  monthly_payment: string
  notes: string
}

const defaultForm = (): LoanFormState => ({
  name: "",
  opening_amount: "",
  monthly_payment: "",
  notes: "",
})

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function LoanPage() {
  const params = useParams()
  const router = useRouter()
  const { lang } = useLang()
  const [detailId, setDetailId] = useState<string | number | null>(null)
  const openDetail = (id: string | number) => {
    window.history.pushState({ detailSlide: true }, "")
    setDetailId(id)
  }
  useEffect(() => {
    const closeDetailOnBack = () => setDetailId(null)
    window.addEventListener("popstate", closeDetailOnBack)
    return () => window.removeEventListener("popstate", closeDetailOnBack)
  }, [])
  const closeDetail = () => {
    if (window.history.state?.detailSlide) window.history.back()
    else setDetailId(null)
  }
  const [mounted, setMounted] = useState(false)
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [loans, setLoans] = useState<LoanItem[]>([])
  const [includeSettled, setIncludeSettled] = useState(false)
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [editingLoan, setEditingLoan] = useState<LoanItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoadedLoans, setHasLoadedLoans] = useState(false)
  const [saving, setSaving] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoadedLoans)
  const [form, setForm] = useState<LoanFormState>(defaultForm)

  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  const formatCurrency = useCallback((value: number) => {
    return `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }, [])

  const formatCurrencyPrecise = useCallback((value: number) => {
    return `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }, [])

  const getLoanMonths = useCallback((loan: LoanItem) => {
    if (typeof loan.remaining_months === "number") return loan.remaining_months
    const outstanding = Number(loan.outstanding_amount || 0)
    const monthly = Number(loan.monthly_payment || 0)
    if (monthly <= 0) return null
    return Math.ceil(outstanding / monthly)
  }, [])

  const loadLoans = useCallback(
    async (options: { forceSkeleton?: boolean } = {}) => {
      if (options.forceSkeleton || !hasLoadedLoans) setLoading(true)
      try {
        const token = getAccessToken()
        const res = await fetch(`/api/loans?include_settled=${includeSettled ? "true" : "false"}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) throw new Error(tr("Gagal muat data loan.", "Failed to load loans."))
        const data = await res.json()
        setLoans(Array.isArray(data) ? data : [])
        setHasLoadedLoans(true)
      } catch (err) {
        showAlertRef.current(
          tr("Ralat loan", "Loan error"),
          err instanceof Error ? err.message : tr("Gagal muat data loan.", "Failed to load loans."),
          "error",
        )
      } finally {
        setLoading(false)
      }
    },
    [hasLoadedLoans, includeSettled, tr],
  )

  useEffect(() => {
    loadLoans({ forceSkeleton: !hasLoadedLoans })
  }, [loadLoans])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: showCreateSheet } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showCreateSheet])

  useEffect(() => {
    setMounted(true)
  }, [])

  const summary = useMemo(() => {
    return loans.reduce(
      (acc, loan) => {
        const opening = Number(loan.opening_amount || 0)
        const outstanding = Number(loan.outstanding_amount || 0)
        const monthly = Number(loan.monthly_payment || 0)
        const paid = Number(loan.paid_amount || Math.max(0, opening - outstanding))
        acc.totalLoan += opening
        acc.totalOutstanding += outstanding
        acc.totalPaid += paid
        if (monthly > 0) acc.totalMonthly += monthly
        if (outstanding > 0.004) acc.activeCount += 1
        return acc
      },
      { totalLoan: 0, totalOutstanding: 0, totalPaid: 0, totalMonthly: 0, activeCount: 0 },
    )
  }, [loans])

  const sortedLoans = useMemo(() => {
    return [...loans].sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0))
  }, [loans])

  const resetForm = useCallback(() => setForm(defaultForm()), [])

  const openCreateSheet = useCallback(() => {
    setEditingLoan(null)
    resetForm()
    setShowCreateSheet(true)
  }, [resetForm])

  const openEditSheet = useCallback((loan: LoanItem) => {
    setEditingLoan(loan)
    setForm({
      name: loan.name || "",
      opening_amount: String(Number(loan.opening_amount || 0)),
      monthly_payment: loan.monthly_payment ? String(Number(loan.monthly_payment || 0)) : "",
      notes: loan.notes || "",
    })
    setShowCreateSheet(true)
  }, [])

  const closeCreateSheet = useCallback(() => {
    setShowCreateSheet(false)
    setEditingLoan(null)
    resetForm()
  }, [resetForm])

  const { requestClose: requestCreateSheetClose } = useOverlayBackClose({
    id: "loan-create-sheet",
    isOpen: showCreateSheet,
    onClose: closeCreateSheet,
  })
  const showCreateSheetSwipe = useSwipeDownToClose(requestCreateSheetClose)

  async function handleSaveLoan(e: React.FormEvent) {
    e.preventDefault()
    const openingAmount = Number(form.opening_amount)
    const monthlyPayment = Number(form.monthly_payment || 0)
    if (!form.name.trim() || openingAmount <= 0) {
      showAlert(
        tr("Maklumat tak lengkap", "Incomplete info"),
        tr("Nama loan dan jumlah perlu diisi.", "Loan name and amount are required."),
        "error",
      )
      return
    }
    if (monthlyPayment < 0 || monthlyPayment > openingAmount) {
      showAlert(
        tr("Bulanan tak sah", "Invalid monthly amount"),
        tr("Bayaran bulanan mesti lebih kecil atau sama dengan jumlah loan.", "Monthly payment must be less than or equal to total loan."),
        "error",
      )
      return
    }
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(editingLoan ? `/api/loans/${editingLoan.id}` : "/api/loans", {
        method: editingLoan ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: form.name.trim(),
          opening_amount: openingAmount,
          monthly_payment: monthlyPayment > 0 ? monthlyPayment : null,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || tr("Gagal simpan loan.", "Failed to save loan."))
      }
      closeCreateSheet()
      await loadLoans()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : tr("Gagal simpan loan.", "Failed to save loan."), "error")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLoan = useCallback(
    (loan: LoanItem) => {
      showConfirm(
        tr("Padam loan?", "Delete loan?"),
        tr(
          `Padam ${loan.name}? Bayaran loan berkaitan akan dibuang daripada rekod loan.`,
          `Delete ${loan.name}? Related loan payment records will be removed from loan records.`,
        ),
        async () => {
          setSaving(true)
          try {
            const token = getAccessToken()
            const res = await fetch(`/api/loans/${loan.id}`, {
              method: "DELETE",
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            })
            if (!res.ok) {
              const payload = (await res.json().catch(() => null)) as { detail?: string } | null
              throw new Error(payload?.detail || tr("Gagal padam loan.", "Failed to delete loan."))
            }
            closeCreateSheet()
            await loadLoans()
          } catch (err) {
            showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : tr("Gagal padam loan.", "Failed to delete loan."), "error")
          } finally {
            setSaving(false)
          }
        },
        "warning",
      )
    },
    [closeCreateSheet, tr, loadLoans, showAlert, showConfirm],
  )

  const paidPercent = summary.totalLoan > 0 ? clamp((summary.totalPaid / summary.totalLoan) * 100, 0, 100) : 0

  const renderLoanCard = (loan: LoanItem, compact = false) => {
    const remainingMonths = getLoanMonths(loan)
    const paidAmount = Number(loan.paid_amount || Math.max(0, Number(loan.opening_amount || 0) - Number(loan.outstanding_amount || 0)))
    const progress = Number(loan.opening_amount || 0) > 0 ? clamp((paidAmount / Number(loan.opening_amount || 0)) * 100, 0, 100) : 0
    const isSettled = loan.status === "settled"

    return (
      <div
        key={loan.id}
        className={cn(
          "group w-full overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 transition",
          compact
            ? "hover:border-[color-mix(in_srgb,var(--accent2)_30%,var(--border))] md:px-4 md:py-3.5"
            : "active:scale-[0.985]",
        )}
      >
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => openDetail(loan.id)}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-black",
              isSettled
                ? "border-emerald-500/20 bg-[var(--btn-primary-bg)]/10 text-emerald-500"
                : "border-sky-500/20 bg-[var(--surface-tint)] text-[var(--text)]",
            )}
            aria-label={loan.name}
          >
            {(loan.name?.[0] || "L").toUpperCase()}
          </button>

          <button
            type="button"
            onClick={() => openDetail(loan.id)}
            className="min-w-0 flex-1 text-left md:w-[12rem] md:flex-none md:shrink-0"
          >
            <p className="truncate text-sm font-black leading-tight text-[var(--text)]">{loan.name}</p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">
              {loan.monthly_payment ? (
                <>
                  <MoneyAmount value={Number(loan.monthly_payment || 0)} size="xs" className="text-[var(--muted)]" currencyClassName="text-[var(--muted)] opacity-55" />
                  <span> / {tr("bulan", "mo")}</span>
                </>
              ) : (
                tr("Tiada bulanan", "No monthly")
              )}
              {remainingMonths != null ? ` · ${remainingMonths} ${tr("bulan", "mo")}` : ""}
            </p>
            <div className="mt-1.5 md:hidden">
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold">
                <span className="text-[var(--muted)]">
                  <MoneyAmount value={Number(loan.outstanding_amount || 0)} digits={0} size="xs" className="text-[var(--text)]" />
                </span>
                <span className="tabular-nums text-[var(--text)]">{progress.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isSettled
                      ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                      : "bg-gradient-to-r from-[#404040] to-[#171717]",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openDetail(loan.id)}
            className="hidden min-w-0 flex-1 items-center gap-4 text-left md:flex"
          >
            <div className="min-w-[7.5rem] shrink-0">
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Baki", "Outstanding")}
              </p>
              <p className="mt-0.5 truncate leading-none text-[var(--text)]">
                <MoneyAmount value={Number(loan.outstanding_amount || 0)} digits={0} size="sm" className="text-[var(--text)]" />
              </p>
            </div>
            <div className="min-w-[6.5rem] shrink-0">
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                {tr("Bulanan", "Monthly")}
              </p>
              <p className="mt-0.5 truncate leading-none text-[var(--text)]">
                {loan.monthly_payment ? (
                  <MoneyAmount value={Number(loan.monthly_payment || 0)} digits={0} size="sm" className="text-[var(--text)]" />
                ) : (
                  "–"
                )}
              </p>
            </div>
            <div className="min-w-0 max-w-xs flex-1">
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold">
                <span className="text-[var(--muted)]">{tr("Progress", "Progress")}</span>
                <span className="tabular-nums text-[var(--text)]">{progress.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isSettled
                      ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                      : "bg-gradient-to-r from-[#404040] to-[#171717]",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <span className="mr-0.5 hidden rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)] sm:inline">
              {isSettled ? tr("Selesai", "Settled") : tr("Aktif", "Active")}
            </span>

          </div>
        </div>
      </div>
    )
  }

  const filterToggle = (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/40 p-0.5">
      <button
        type="button"
        onClick={() => setIncludeSettled(false)}
        className={cn(
          "rounded-full px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.12em] transition",
          !includeSettled ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
        )}
      >
        {tr("Aktif", "Active")}
      </button>
      <button
        type="button"
        onClick={() => setIncludeSettled(true)}
        className={cn(
          "rounded-full px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.12em] transition",
          includeSettled ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
        )}
      >
        {tr("Semua", "All")}
      </button>
    </div>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title="Loan"
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreateSheet} label={tr("Tambah Loan", "Add Loan")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        <section className="px-1">
          <div className="loan-detail-hero relative overflow-hidden rounded-[2rem] bg-[#1a1a1a] p-5 text-center text-white">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
            <div className="relative flex min-h-24 flex-col items-center justify-center">
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[#a3a3a3]">{tr("Jumlah Bayaran Bulanan", "Total Monthly Payment")}</p>
              <div className="mt-2 text-[#ffffff]">
                {showDataSkeleton ? <AmountSkeleton className="h-7 w-32 bg-white/10" /> : <MoneyAmount value={Number(summary.totalMonthly || 0)} size="hero" className="text-[#ffffff]" currencyClassName="text-[#ffffff] opacity-55" />}
              </div>
            </div>
          </div>
        </section>

        <section className="px-1">
          <div className="space-y-3">
            {showDataSkeleton ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
                  <AmountSkeleton className="h-4 w-32" />
                  <AmountSkeleton className="mt-3 h-6 w-24" />
                  <AmountSkeleton className="mt-2 h-3 w-40" />
                </div>
              ))
            ) : sortedLoans.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 p-8 text-center">
                <CreditCard size={32} className="mx-auto text-[var(--muted)]/40" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Belum ada loan.", "No loans yet.")}</p>
                <button
                  type="button"
                  onClick={openCreateSheet}
                  className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-95"
                >
                  <Plus size={14} className="mr-1 inline" />
                  {tr("Tambah Loan", "Add Loan")}
                </button>
              </div>
            ) : (
              sortedLoans.map((loan) => renderLoanCard(loan, false))
            )}
          </div>
        </section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Papan Loan", "Loan Board")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={openCreateSheet}>
              <Plus strokeWidth={2.5} />
              {tr("Tambah Loan", "Add Loan")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="space-y-5">
        <div className="loan-detail-hero relative overflow-hidden rounded-[1.75rem] bg-[#1a1a1a] p-6 text-center text-[#ffffff]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
          <div className="relative flex min-h-28 flex-col items-center justify-center">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[#a3a3a3]">{tr("Jumlah Bayaran Bulanan", "Total Monthly Payment")}</p>
            <div className="mt-2 text-[#ffffff]">
              {showDataSkeleton ? <AmountSkeleton className="h-10 w-40 bg-white/10" /> : <MoneyAmount value={Number(summary.totalMonthly || 0)} size="heroLg" className="text-[#ffffff]" currencyClassName="text-[#ffffff] opacity-55" />}
            </div>
          </div>
        </div>

        <div>
          <div className="space-y-3">
            {showDataSkeleton ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]" />
              ))
            ) : sortedLoans.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--card)]/70 px-6 py-14 text-center">
                <CreditCard size={40} className="text-[var(--muted)]/30" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">{tr("Belum ada loan.", "No loans yet.")}</p>
                <button
                  type="button"
                  onClick={openCreateSheet}
                  className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--bg)]"
                >
                  <Plus size={14} className="mr-1.5 inline" />
                  {tr("Tambah Loan", "Add Loan")}
                </button>
              </div>
            ) : (
              sortedLoans.map((loan) => renderLoanCard(loan, true))
            )}
          </div>
        </div>
        </DesktopPageBody>
      </div>

      {/* ─── Add/Edit Sheet ─── */}
      {mounted && showCreateSheet
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center"
              onClick={requestCreateSheetClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...showCreateSheetSwipe}
                data-swipe-sheet
                data-prevent-pull-refresh="true"
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel app-sheet-panel--lg max-h-[88dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh] md:max-w-md"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-sheet-panel-header sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--sheet-bg)] px-3 pb-2 pt-2 md:px-6 md:py-4">
                  <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--surface-tint-strong)] md:hidden" />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black text-[var(--text)]">
                        {editingLoan ? tr("Edit Loan", "Edit Loan") : tr("Tambah Loan", "Add Loan")}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {editingLoan
                          ? tr("Kemaskini jumlah, bulanan dan nota loan.", "Update total, monthly amount and loan notes.")
                          : tr("Masuk jumlah dan bulanan untuk kiraan baki bulan.", "Enter total and monthly payment for month calculation.")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={requestCreateSheetClose}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2 text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <form className="space-y-4 px-3 py-3 pb-4 text-[var(--text)] md:px-6 md:py-6" onSubmit={handleSaveLoan}>
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Nama Loan", "Loan Name")}
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder={tr("Contoh: Kereta", "Example: Car")}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Jumlah Loan", "Total Loan")}
                      </label>
                      <input
                        inputMode="decimal"
                        value={form.opening_amount}
                        onChange={(e) => setForm((prev) => ({ ...prev, opening_amount: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                        placeholder="12000"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {tr("Bayaran Bulanan", "Monthly Payment")}
                      </label>
                      <input
                        inputMode="decimal"
                        value={form.monthly_payment}
                        onChange={(e) => setForm((prev) => ({ ...prev, monthly_payment: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                        placeholder="500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {tr("Nota", "Notes")}
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      placeholder={tr("Opsyenal", "Optional")}
                    />
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-4">
                    <p className="mb-3 text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">loanx PAY</p>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                      LOANX PAY {form.name || tr("KERETA", "CAR")} {form.monthly_payment || "500"}
                    </div>
                    <p className="mt-2 text-[0.58rem] text-[var(--muted)]">
                      {tr("Format: LOANX PAY [nama] [jumlah]", "Format: LOANX PAY [name] [amount]")}
                    </p>
                  </div>

                  <div className="mt-6 -mx-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-3 pb-2 pt-5 md:-mx-6 md:px-6">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={20} className="animate-spin" /> : editingLoan ? <Pencil size={16} /> : <Plus size={16} />}
                      {editingLoan ? tr("Update Loan", "Update Loan") : tr("Simpan Loan", "Save Loan")}
                    </button>
                    {editingLoan && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDeleteLoan(editingLoan)}
                        className="flex h-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 text-sm font-black text-rose-500 transition active:scale-[0.98] disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {detailId !== null && (
        <div className="fixed inset-0 z-[500]">
          <button type="button" aria-label={tr("Tutup butiran", "Close details")} onClick={closeDetail} className="absolute inset-0 bg-black/45" />
          <section className="absolute bottom-0 right-0 top-0 h-[100dvh] w-full overflow-hidden animate-in slide-in-from-right duration-300 bg-[var(--page-bg)] md:w-[min(760px,72vw)] md:border-l md:border-[var(--border)] md:shadow-2xl">
            <iframe title={tr("Butiran loan", "Loan details")} src={`/${sessionId}/loan/${detailId}`} className="block h-[100dvh] w-full border-0" />
            <button type="button" aria-label={tr("Kembali", "Back")} onClick={closeDetail} className="absolute left-0 top-0 z-[600] h-16 w-16 bg-transparent md:hidden" />
          </section>
        </div>
      )}

      {alertModal}
    </div>
  )
}
