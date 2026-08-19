"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ChevronDown,
  CreditCard,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  Wallet,
  X,
  CalendarClock,
  History,
  Pencil,
  BadgeCheck,
  Copy,
  Check,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
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
  category_id?: number | null
  payment_count: number
  last_payment_at?: string | null
}

type LoanPaymentItem = {
  id: number
  loan_id: number
  wallet_id?: number | null
  wallet_name?: string | null
  transaction_id?: number | null
  transaction_reference_id?: string | null
  amount: number
  payment_date: string
  notes?: string | null
  source_channel?: string | null
  created_at: string
}

type WalletOption = {
  id: number
  name: string
  label?: string | null
  balance?: number | null
}

type PaymentForm = {
  amount: string
  wallet_id: string
  payment_date: string
  notes: string
}

async function readApiErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown; message?: unknown } | null
  const detail = payload?.detail ?? payload?.message
  if (typeof detail === "string" && detail.trim()) return detail
  return fallback
}

function formatDateLabel(value?: string | null) {
  if (!value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

export default function LoanDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const loanId = String(params.loanId || "")
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const isBM = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBM ? bm : en), [isBM])
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)
  const showAlertRef = useRef(showAlert)

  const [loan, setLoan] = useState<LoanItem | null>(null)
  const [payments, setPayments] = useState<LoanPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoadedData, setHasLoadedData] = useState(false)
  const [deletingLoan, setDeletingLoan] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showEditLoanSheet, setShowEditLoanSheet] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [savingLoan, setSavingLoan] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(() => ({
    amount: "",
    wallet_id: "",
    payment_date: new Date().toISOString().slice(0, 10),
    notes: "",
  }))
  const [editLoanForm, setEditLoanForm] = useState({ name: "", opening_amount: "", monthly_payment: "", category_id: "", notes: "" })
  const [mounted, setMounted] = useState(false)

  const [categories, setCategories] = useState<{ id: number; name: string; icon_name?: string | null; kind: string }[]>([])
  const [catOpen, setCatOpen] = useState(false)

  useEffect(() => {
    showAlertRef.current = showAlert
  }, [showAlert])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [mobileMenuOpen])

  const formatCurrency = useCallback((value: number) => {
    return `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }, [])

  const getLoanMonths = useCallback((target: LoanItem | null) => {
    if (!target) return null
    if (typeof target.remaining_months === "number") return target.remaining_months
    const outstanding = Number(target.outstanding_amount || 0)
    const monthly = Number(target.monthly_payment || 0)
    if (monthly <= 0) return null
    return Math.ceil(outstanding / monthly)
  }, [])

  const loadData = useCallback(
    async (options: { forceSkeleton?: boolean } = {}) => {
      if (!loanId) return
      if (options.forceSkeleton || !hasLoadedData) setLoading(true)

      try {
        const token = getAccessToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined

        const [loanRes, paymentRes, walletRes] = await Promise.all([
          fetch(`/api/loans/${loanId}`, { credentials: "include", headers }),
          fetch(`/api/loans/${loanId}/payments`, { credentials: "include", headers }),
          fetch("/api/wallets", { credentials: "include", headers }),
        ])

        if (!loanRes.ok) {
          throw new Error(await readApiErrorMessage(loanRes, tr("Gagal muat detail loan.", "Failed to load loan details.")))
        }
        if (!paymentRes.ok) {
          throw new Error(await readApiErrorMessage(paymentRes, tr("Gagal muat transaksi loan.", "Failed to load loan transactions.")))
        }

        const loanData = await loanRes.json()
        const paymentData = await paymentRes.json()
        const walletData = walletRes.ok ? await walletRes.json().catch(() => []) : []
        const nextWallets = Array.isArray(walletData) ? walletData : []
        setLoan(loanData || null)
        setPayments(Array.isArray(paymentData) ? paymentData : [])
        setWallets(nextWallets)
        setPaymentForm((current) =>
          current.wallet_id || !nextWallets[0]?.id ? current : { ...current, wallet_id: String(nextWallets[0].id) },
        )
        setHasLoadedData(true)
      } catch (err) {
        showAlertRef.current(
          tr("Ralat loan", "Loan error"),
          err instanceof Error ? err.message : tr("Gagal muat detail loan.", "Failed to load loan details."),
          "error",
        )
      } finally {
        setLoading(false)
      }
    },
    [hasLoadedData, loanId, tr],
  )

  useEffect(() => {
    loadData({ forceSkeleton: !hasLoadedData })
  }, [hasLoadedData, loadData])

  useEffect(() => {
    const token = getAccessToken()
    void fetch("/api/categories", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setCategories(list.filter((c) => c.kind === "expense"))
      })
      .catch(() => {
        /* ignore */
      })
  }, [])

  useEffect(() => {
    const hidden = showPaymentForm || showEditLoanSheet
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showPaymentForm, showEditLoanSheet])

  const openEditLoanSheet = useCallback(() => {
    if (!loan) return
    setEditLoanForm({
      name: loan.name || "",
      opening_amount: String(Number(loan.opening_amount || 0)),
      monthly_payment: loan.monthly_payment ? String(Number(loan.monthly_payment || 0)) : "",
      category_id: loan.category_id ? String(loan.category_id) : "",
      notes: loan.notes || "",
    })
    setShowEditLoanSheet(true)
  }, [loan])

  const summary = useMemo(() => {
    const opening = Number(loan?.opening_amount || 0)
    const outstanding = Number(loan?.outstanding_amount || 0)
    const paid = Number(loan?.paid_amount || Math.max(0, opening - outstanding))
    const months = getLoanMonths(loan)
    const progress = opening > 0 ? Math.max(0, Math.min(100, (paid / opening) * 100)) : 0
    return { opening, outstanding, paid, months, progress }
  }, [getLoanMonths, loan])

  const loanxCommand = useMemo(() => {
    const name = loan?.name || (isBM ? "KERETA" : "CAR")
    const amount = Number(loan?.monthly_payment || loan?.outstanding_amount || 0)
    const amountText = amount > 0 ? amount.toFixed(amount % 1 === 0 ? 0 : 2) : "0"
    return `LOANX PAY ${name} ${amountText}`
  }, [isBM, loan])

  const groupedPayments = useMemo(() => {
    const noDateLabel = isBM ? "Tiada tarikh" : "No date"
    return Object.entries(
      payments.reduce(
        (groups, item) => {
          const dateKey = String(item.payment_date || "").trim() || noDateLabel
          if (!groups[dateKey]) groups[dateKey] = []
          groups[dateKey].push(item)
          return groups
        },
        {} as Record<string, LoanPaymentItem[]>,
      ),
    )
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => {
        const hasRealDate = date !== noDateLabel
        const dateObj = hasRealDate ? new Date(`${date}T12:00:00`) : null
        const dayNumber = dateObj
          ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { day: "numeric" })
          : "--"
        const weekdayLabel = dateObj
          ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { weekday: "long" })
          : date
        const monthYearLabel = dateObj
          ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { month: "long", year: "numeric" })
          : ""
        const total = items.reduce((acc, item) => acc + Number(item.amount || 0), 0)
        return { date, items, dayNumber, weekdayLabel, monthYearLabel, total }
      })
  }, [isBM, lang, payments])

  const showDataSkeleton = useDelayedSkeleton(loading && !hasLoadedData)
  const surfaceCardClass = isLight ? "border-[color:var(--border)] bg-[var(--card)]" : "border-white/10 bg-[var(--card)]"
  const mutedClass = isLight ? "text-slate-500" : "text-white/55"
  const softClass = isLight ? "text-slate-400" : "text-white/35"

  const closePaymentSheet = useCallback(() => setShowPaymentForm(false), [])
  const closeEditSheet = useCallback(() => setShowEditLoanSheet(false), [])

  const { requestClose: requestPaymentSheetClose } = useOverlayBackClose({
    id: "loan-payment-sheet",
    isOpen: showPaymentForm,
    onClose: closePaymentSheet,
  })
  const { requestClose: requestEditSheetClose } = useOverlayBackClose({
    id: "loan-edit-sheet",
    isOpen: showEditLoanSheet,
    onClose: closeEditSheet,
  })
  const paymentSheetSwipe = useSwipeDownToClose(requestPaymentSheetClose)
  const editLoanSheetSwipe = useSwipeDownToClose(requestEditSheetClose)

  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(loanxCommand)
      setCopiedCmd(true)
      setTimeout(() => setCopiedCmd(false), 1600)
    } catch {
      showAlert(tr("Gagal salin", "Copy failed"), tr("Tidak dapat salin arahan.", "Could not copy command."), "error")
    }
  }, [loanxCommand, showAlert, tr])

  const handleSavePayment = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!loan) return
      const amount = Number(paymentForm.amount)
      const walletId = Number(paymentForm.wallet_id)
      if (!amount || amount <= 0 || !walletId) {
        showAlert(
          tr("Maklumat tak lengkap", "Incomplete info"),
          tr("Masukkan jumlah bayaran dan pilih wallet.", "Enter payment amount and select a wallet."),
          "error",
        )
        return
      }
      if (amount - Number(loan.outstanding_amount || 0) > 0.004) {
        showAlert(
          tr("Jumlah melebihi baki", "Amount exceeds balance"),
          tr("Bayaran tidak boleh melebihi baki loan.", "Payment cannot exceed the loan outstanding balance."),
          "error",
        )
        return
      }
      setSavingPayment(true)
      try {
        const token = getAccessToken()
        const res = await fetch(`/api/loans/${loan.id}/payments`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            amount,
            wallet_id: walletId,
            payment_date: paymentForm.payment_date || null,
            notes: paymentForm.notes.trim() || null,
          }),
        })
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res, tr("Gagal simpan bayaran loan.", "Failed to save loan payment.")))
        }
        setShowPaymentForm(false)
        setPaymentForm((current) => ({
          ...current,
          amount: "",
          notes: "",
          payment_date: new Date().toISOString().slice(0, 10),
        }))
        await loadData({ forceSkeleton: false })
        showAlert(
          tr("Bayaran direkod", "Payment recorded"),
          tr("Transaksi dan history loan telah disimpan.", "Transaction and loan history were saved."),
          "success",
        )
      } catch (error) {
        showAlert(
          tr("Gagal simpan", "Save failed"),
          error instanceof Error ? error.message : tr("Gagal simpan bayaran loan.", "Failed to save loan payment."),
          "error",
        )
      } finally {
        setSavingPayment(false)
      }
    },
    [loadData, loan, paymentForm, showAlert, tr],
  )

  const handleSaveLoan = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!loan) return
      const openingAmount = Number(editLoanForm.opening_amount)
      const monthlyPayment = Number(editLoanForm.monthly_payment || 0)
      if (!editLoanForm.name.trim() || openingAmount <= 0) {
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
      setSavingLoan(true)
      try {
        const token = getAccessToken()
        const res = await fetch(`/api/loans/${loan.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            name: editLoanForm.name.trim(),
            opening_amount: openingAmount,
            monthly_payment: monthlyPayment > 0 ? monthlyPayment : null,
            category_id: editLoanForm.category_id ? Number(editLoanForm.category_id) : null,
            notes: editLoanForm.notes.trim() || null,
          }),
        })
        if (!res.ok) throw new Error(await readApiErrorMessage(res, tr("Gagal kemaskini loan.", "Failed to update loan.")))
        setShowEditLoanSheet(false)
        await loadData({ forceSkeleton: false })
        showAlert(
          tr("Loan dikemaskini", "Loan updated"),
          tr("Butiran loan berjaya dikemaskini.", "Loan details updated successfully."),
          "success",
        )
      } catch (err) {
        showAlert(
          tr("Gagal simpan", "Save failed"),
          err instanceof Error ? err.message : tr("Gagal kemaskini loan.", "Failed to update loan."),
          "error",
        )
      } finally {
        setSavingLoan(false)
      }
    },
    [editLoanForm, loan, loadData, showAlert, tr],
  )

  const handleDeleteLoan = useCallback(() => {
    if (!loan) return
    showConfirm(
      tr("Padam loan?", "Delete loan?"),
      tr(`Padam ${loan.name}? Semua rekod bayaran loan juga akan dipadam.`, `Delete ${loan.name}? All related loan payment records will be deleted.`),
      async () => {
        setDeletingLoan(true)
        try {
          const token = getAccessToken()
          const res = await fetch(`/api/loans/${loan.id}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!res.ok) {
            throw new Error(await readApiErrorMessage(res, tr("Gagal padam loan.", "Failed to delete loan.")))
          }
          router.push(`/${sessionId}/loan`)
        } catch (err) {
          showAlert(
            tr("Gagal padam", "Delete failed"),
            err instanceof Error ? err.message : tr("Gagal padam loan.", "Failed to delete loan."),
            "error",
          )
        } finally {
          setDeletingLoan(false)
        }
      },
      "warning",
    )
  }, [loan, router, sessionId, showAlert, showConfirm, tr])

  const title = loan?.name || tr("Detail Loan", "Loan Detail")
  const isSettled = loan?.status === "settled" || Number(loan?.outstanding_amount || 0) <= 0.004
  const canPay = !loading && !!loan && !isSettled
  const loanListHref = `/${sessionId}/loan`

  if (loading && !hasLoadedData) {
    // Initial load: keep the header (with its actions) and show a skeleton body
    // so no raw text flashes before data arrives.
    const loadTitle = tr("Detail Loan", "Loan Detail")
    return (
      <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
        <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
          <MobilePageHeader title={loadTitle} fallbackHref={loanListHref} backPreferHistory />
        </div>
        <DesktopPageHeader
          title={loadTitle}
          breadcrumbs={[{ label: tr("Loan", "Loan"), href: loanListHref }]}
          homeHref={`/${sessionId}`}
          showBack={false}
          className="hidden md:block"
          actions={
            <>
              <DesktopPageAction
                onClick={() => setShowPaymentForm(true)}
                disabled
                aria-label={tr("Bayar loan", "Pay loan")}
                className="min-w-0 flex-1 justify-center px-2 sm:flex-none sm:px-3"
              >
                <Plus size={16} />
                {tr("Bayar", "Pay")}
              </DesktopPageAction>
              <DesktopPageAction
                onClick={openEditLoanSheet}
                disabled
                variant="solid"
                aria-label={tr("Edit loan", "Edit loan")}
                className="min-w-0 flex-1 justify-center px-2 sm:flex-none sm:px-3"
              >
                <Pencil size={16} />
                {tr("Edit", "Edit")}
              </DesktopPageAction>
              <button
                type="button"
                disabled
                className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"
                aria-label={tr("Padam loan", "Delete loan")}
              >
                <Trash2 size={16} />
                {tr("Padam", "Delete")}
              </button>
            </>
          }
        />
        <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">
          <div className="animate-pulse space-y-4">
            <div className="h-44 rounded-2xl bg-[var(--surface-tint)]" />
            <div className="h-64 rounded-2xl bg-[var(--surface-tint)]" />
            <div className="h-40 rounded-2xl bg-[var(--surface-tint)]" />
          </div>
        </DesktopPageBody>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      <div className="sticky top-0 z-50 bg-[var(--page-bg)] pb-2 pt-1 md:hidden">
        <MobilePageHeader
          title={title}
          fallbackHref={loanListHref}
          backPreferHistory
          action={
            <div ref={mobileMenuRef} className="relative">
              <MobileIconButton
                onClick={() => setMobileMenuOpen((v) => !v)}
                label={tr("Menu", "Menu")}
              >
                <MoreVertical size={16} />
              </MobileIconButton>
              {mobileMenuOpen ? (
                <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg shadow-black/10">
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowPaymentForm(true) }}
                    disabled={!canPay}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-40"
                  >
                    <Plus size={16} className="text-[var(--accent2)]" />
                    {tr("Bayar", "Pay")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); openEditLoanSheet() }}
                    disabled={loading || !loan}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-40"
                  >
                    <Pencil size={16} className="text-amber-500" />
                    {tr("Edit", "Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleDeleteLoan() }}
                    disabled={deletingLoan || loading || !loan}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-rose-500 transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {deletingLoan ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {tr("Padam", "Delete")}
                  </button>
                </div>
              ) : null}
            </div>
          }
        />
      </div>
      <DesktopPageHeader
        title={title}
        breadcrumbs={[{ label: tr("Loan", "Loan"), href: loanListHref }]}
        homeHref={`/${sessionId}`}
        showBack={false}
        className="hidden md:block"
        actions={
          <>
            <DesktopPageAction
              onClick={() => setShowPaymentForm(true)}
              disabled={!canPay}
              aria-label={tr("Bayar loan", "Pay loan")}
              className="min-w-0 flex-1 justify-center px-2 sm:flex-none sm:px-3"
            >
              <Plus size={16} />
              {tr("Bayar", "Pay")}
            </DesktopPageAction>
            <DesktopPageAction
              onClick={openEditLoanSheet}
              disabled={loading || !loan}
              variant="solid"
              aria-label={tr("Edit loan", "Edit loan")}
              className="min-w-0 flex-1 justify-center px-2 sm:flex-none sm:px-3"
            >
              <Pencil size={16} />
              {tr("Edit", "Edit")}
            </DesktopPageAction>
            <button
              type="button"
              onClick={handleDeleteLoan}
              disabled={deletingLoan || loading || !loan}
              className="inline-flex h-8 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 text-xs font-bold leading-none text-rose-500 transition active:scale-[0.98] disabled:opacity-40 sm:flex-none sm:px-3 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"
              aria-label={tr("Padam loan", "Delete loan")}
            >
              {deletingLoan ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {tr("Padam", "Delete")}
            </button>
          </>
        }
      />

      <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16 lg:max-w-7xl">

      {/* Hero */}
      <div className="mt-4 px-1">
        <div className="loan-detail-hero relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[#1a1a1a] p-5 text-white md:p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
          <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
          <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.04] blur-2xl" />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-slate-300">
                    {tr("Bayaran Bulanan", "Monthly Payment")}
                  </p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]",
                      isSettled ? "bg-[var(--btn-primary-bg)]/20 text-emerald-200" : "bg-sky-500/20 text-sky-200",
                    )}
                  >
                    {isSettled ? tr("Selesai", "Settled") : tr("Aktif", "Active")}
                  </span>
                </div>
                <p className="loan-detail-amount mt-2 leading-none text-white">
                  {showDataSkeleton ? (
                    <AmountSkeleton className="h-7 w-32 bg-white/10" />
                  ) : Number(loan?.monthly_payment || 0) > 0 ? (
                    <MoneyAmount
                      value={Number(loan?.monthly_payment || 0)}
                      size="hero"
                      className="text-white md:text-3xl"
                      currencyClassName="text-white opacity-55"
                    />
                  ) : (
                    "–"
                  )}
                </p>
                <p className="mt-1.5 text-[0.625rem] font-semibold text-slate-400">
                  {summary.months ?? "–"} {tr("bulan lagi", "months left")}
                  {loan?.last_payment_at ? ` · ${tr("akhir", "last")} ${formatDateLabel(loan.last_payment_at)}` : ""}
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#e5e5e5]">
                <CalendarClock size={20} />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                <div className="flex items-center gap-1.5">
                  <Wallet size={12} className="text-orange-300" />
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-300/90">{tr("Baki", "Due")}</p>
                </div>
                <p className="mt-2 text-orange-200">
                  {showDataSkeleton ? (
                    <AmountSkeleton className="h-4 w-12 bg-white/10" />
                  ) : (
                    <MoneyAmount value={Number(loan?.outstanding_amount || 0)} digits={0} size="xs" className="text-orange-200" currencyClassName="text-orange-200 opacity-55" />
                  )}
                </p>
              </div>
              <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                <div className="flex items-center gap-1.5">
                  <BadgeCheck size={12} className="text-emerald-300" />
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-300/90">{tr("Dibayar", "Paid")}</p>
                </div>
                <p className="mt-2 text-emerald-200">
                  {showDataSkeleton ? (
                    <AmountSkeleton className="h-4 w-12 bg-white/10" />
                  ) : (
                    <MoneyAmount value={summary.paid} digits={0} size="xs" className="text-emerald-200" currencyClassName="text-emerald-200 opacity-55" />
                  )}
                </p>
              </div>
              <div className="rounded-[1.15rem] bg-white/[0.06] p-3">
                <div className="flex items-center gap-1.5">
                  <CreditCard size={12} className="text-[#e5e5e5]" />
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-slate-300/90">{tr("Jumlah", "Total")}</p>
                </div>
                <p className="mt-2 text-sky-200">
                  {showDataSkeleton ? (
                    <AmountSkeleton className="h-4 w-12 bg-white/10" />
                  ) : (
                    <MoneyAmount value={summary.opening} digits={0} size="xs" className="text-sky-200" currencyClassName="text-sky-200 opacity-55" />
                  )}
                </p>
              </div>
            </div>

            <div className="mt-3.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-slate-300/80">
                <span>{tr("Progress", "Progress")}</span>
                <span className="tabular-nums text-emerald-300">{summary.progress.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
                  style={{ width: `${summary.progress}%` }}
                />
              </div>
            </div>

            {canPay && (
              <button
                type="button"
                onClick={() => setShowPaymentForm(true)}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] text-sm font-black text-white transition active:scale-[0.98] md:max-w-xs"
              >
                <Plus size={16} strokeWidth={2.5} />
                {tr("Rekod Bayaran", "Record Payment")}
              </button>
            )}

            <div className="mt-4 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={openEditLoanSheet}
                disabled={loading || !loan}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#d4d4d4] underline-offset-4 transition hover:text-white hover:underline disabled:opacity-40"
              >
                <Pencil size={15} />
                {tr("Edit", "Edit")}
              </button>
              <span className="h-3.5 w-px bg-white/15" aria-hidden />
              <button
                type="button"
                onClick={handleDeleteLoan}
                disabled={deletingLoan || loading || !loan}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-400 underline-offset-4 transition hover:text-rose-300 hover:underline disabled:opacity-40"
              >
                {deletingLoan ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {tr("Padam", "Delete")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* loanx command */}
      <div className="mt-3.5 px-1">
        <div className="relative overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">loanx PAY</p>
            <button
              type="button"
              onClick={handleCopyCommand}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)] transition hover:text-[var(--text)] active:scale-95"
            >
              {copiedCmd ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              {copiedCmd ? tr("Disalin", "Copied") : tr("Salin", "Copy")}
            </button>
          </div>
          <div className="select-all rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 font-mono text-[11px] text-[var(--text)]">
            {loanxCommand}
          </div>
          <p className="mt-2 text-[0.58rem] font-medium text-[var(--muted)]">
            {tr("Format: LOANX PAY [nama] [jumlah]", "Format: LOANX PAY [name] [amount]")}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3.5 px-1">
        <div className={cn("overflow-hidden rounded-[1.35rem] border", surfaceCardClass)}>
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--surface-tint)]/10"
          >
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">{tr("Butiran", "Details")}</h2>
              <p className={cn("mt-0.5 text-[0.7rem] font-semibold", mutedClass)}>
                {tr("Maklumat penuh loan", "Full loan information")}
              </p>
            </div>
            <ChevronDown size={16} className={cn("transition-transform duration-200", detailsOpen ? "rotate-180" : "", softClass)} />
          </button>

          {detailsOpen && (
            <div className="border-t border-[var(--border)] px-4 py-4">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: tr("Jumlah Loan", "Total Loan"), value: summary.opening, kind: "money" as const, color: "sky" },
                  { label: tr("Baki Semasa", "Outstanding"), value: summary.outstanding, kind: "money" as const, color: "orange" },
                  { label: tr("Telah Dibayar", "Total Paid"), value: summary.paid, kind: "money" as const, color: "emerald" },
                  { label: tr("Transaksi", "Transactions"), value: payments.length, kind: "count" as const, color: "indigo" },
                  { label: tr("Mula", "Start"), value: formatDateLabel(loan?.start_date), kind: "text" as const, color: "slate" },
                  {
                    label: tr("Bulan baki", "Months left"),
                    value: summary.months ?? "–",
                    kind: "text" as const,
                    color: "slate",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "rounded-xl border p-3.5",
                      item.color === "sky" && "border-sky-500/20 bg-sky-500/5",
                      item.color === "orange" && "border-orange-500/20 bg-orange-500/5",
                      item.color === "emerald" && "border-emerald-500/20 bg-[var(--btn-primary-bg)]/5",
                      item.color === "indigo" && "border-indigo-500/20 bg-indigo-500/5",
                      item.color === "slate" && "border-[var(--border)] bg-[var(--surface-tint)]/30",
                    )}
                  >
                    <p className="text-[0.5rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{item.label}</p>
                    <p className="mt-2 text-sm leading-none text-[var(--text)]">
                      {showDataSkeleton ? (
                        <AmountSkeleton className="h-4 w-16" />
                      ) : item.kind === "money" ? (
                        <MoneyAmount value={Number(item.value || 0)} digits={0} size="sm" className="text-[var(--text)]" />
                      ) : item.kind === "count" ? (
                        <span className="font-semibold tabular-nums tracking-tight">{Number(item.value).toLocaleString("en-MY")}</span>
                      ) : (
                        <span className="font-semibold">{String(item.value)}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              {loan?.notes ? (
                <div className="mt-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3.5">
                  <p className="text-[0.5rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{tr("Nota", "Notes")}</p>
                  <p className="mt-1.5 text-sm font-medium text-[var(--text)]">{loan.notes}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Payment timeline */}
      <div className="mt-3.5 px-1">
        <div className={cn("overflow-hidden rounded-[1.35rem] border", surfaceCardClass)}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-tint)]/10 px-4 py-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              {tr("Transaksi Loan", "Loan Transactions")}
            </h2>
            <span className={cn("rounded-full bg-[var(--surface-tint-strong)] px-2.5 py-0.5 text-[10px] font-extrabold", mutedClass)}>
              {payments.length} {tr("rekod", "records")}
            </span>
          </div>

          <div>
            {showDataSkeleton ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="border-b border-[var(--border)] px-4 py-4 last:border-b-0">
                  <AmountSkeleton className="h-4 w-32" />
                  <AmountSkeleton className="mt-2 h-3 w-52" />
                </div>
              ))
            ) : groupedPayments.length === 0 ? (
              <div className={cn("px-4 py-12 text-center text-xs font-semibold", mutedClass)}>
                <History className="mx-auto mb-2.5 text-[var(--muted)]/30" size={24} />
                {tr("Belum ada transaksi bayaran loan.", "No loan payment transactions yet.")}
                {canPay && (
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-wider text-[var(--bg)]"
                  >
                    <Plus size={12} />
                    {tr("Bayar sekarang", "Pay now")}
                  </button>
                )}
              </div>
            ) : (
              groupedPayments.map(({ date, items, dayNumber, weekdayLabel, monthYearLabel, total }) => (
                <div key={date} className="border-b border-[var(--border)] last:border-none">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)]/40 bg-[var(--surface-tint)]/15 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="text-lg font-black tabular-nums leading-none text-[var(--text)]">{dayNumber}</div>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-black uppercase tracking-wider leading-none text-[var(--text)]">
                          {weekdayLabel}
                        </p>
                        {monthYearLabel ? (
                          <p className={cn("mt-0.5 text-[9px] font-semibold", mutedClass)}>{monthYearLabel}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right leading-none text-emerald-500">
                      <MoneyAmount value={total} digits={0} size="xs" className="text-emerald-500" currencyClassName="text-emerald-500 opacity-55" />
                    </div>
                  </div>

                  <div className="divide-y divide-[var(--border)]/30">
                    {items.map((item) => {
                      const txnLinkId = item.transaction_reference_id || (item.transaction_id ? String(item.transaction_id) : "")
                      const rowClassName = cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition",
                        txnLinkId ? "hover:bg-[var(--surface-tint)]/15 active:opacity-85" : "cursor-default",
                      )
                      const content = (
                        <>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-[var(--btn-primary-bg)]/10 text-emerald-500">
                              <Wallet size={13} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold leading-tight text-[var(--text)]">
                                {item.transaction_reference_id
                                  ? `#${item.transaction_reference_id}`
                                  : `${tr("Bayaran", "Payment")} #${item.id}`}
                              </p>
                              <p className={cn("mt-1 truncate text-[9px] font-semibold leading-none", mutedClass)}>
                                {item.wallet_name || "–"}
                                {item.notes ? ` · ${item.notes}` : ""}
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 text-emerald-500">
                            <MoneyAmount value={item.amount} digits={0} size="xs" className="text-emerald-500" currencyClassName="text-emerald-500 opacity-55" />
                          </p>
                        </>
                      )

                      if (txnLinkId) {
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => router.push(`/${sessionId}/transactions/${txnLinkId}`)}
                            className={rowClassName}
                          >
                            {content}
                          </button>
                        )
                      }

                      return (
                        <div key={item.id} className={rowClassName}>
                          {content}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      </DesktopPageBody>

      {/* Payment sheet */}
      {mounted && showPaymentForm && loan
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-transparent p-0 md:items-center"
              onClick={requestPaymentSheetClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...paymentSheetSwipe}
                data-swipe-sheet
                className="app-sheet-panel app-sheet-panel--lg max-h-[86dvh] w-full overflow-y-auto border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:max-w-md"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={tr("Bayar Loan", "Pay Loan")}
                  onClose={requestPaymentSheetClose}
                />
                <form onSubmit={handleSavePayment} className="space-y-4 px-4 py-4 md:px-6 md:py-6">
                  <div className="rounded-2xl border border-emerald-500/20 bg-[var(--btn-primary-bg)]/5 p-3">
                    <p className="text-[0.55rem] font-bold uppercase tracking-widest text-emerald-600/80 dark:text-emerald-300/80">
                      {tr("Baki semasa", "Current outstanding")}
                    </p>
                    <p className="mt-1 text-emerald-600 dark:text-emerald-300">
                      <MoneyAmount
                        value={Number(loan.outstanding_amount || 0)}
                        digits={0}
                        size="md"
                        className="text-emerald-600 dark:text-emerald-300"
                        currencyClassName="text-emerald-600 opacity-55 dark:text-emerald-300"
                      />
                    </p>
                  </div>
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Jumlah", "Amount")}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={paymentForm.amount}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          amount: event.target.value
                            .replace(/,/g, ".")
                            .replace(/[^0-9.]/g, "")
                            .replace(/(\..*)\./, "$1"),
                        }))
                      }
                      placeholder={String(Number(loan.monthly_payment || loan.outstanding_amount || 0).toFixed(2))}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-semibold text-[var(--text)] outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>Wallet</span>
                    <select
                      value={paymentForm.wallet_id}
                      onChange={(event) => setPaymentForm((current) => ({ ...current, wallet_id: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-semibold text-[var(--text)] outline-none"
                    >
                      <option value="">{tr("Pilih wallet", "Select wallet")}</option>
                      {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.label || wallet.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Tarikh", "Date")}
                    </span>
                    <input
                      type="date"
                      value={paymentForm.payment_date}
                      onChange={(event) => setPaymentForm((current) => ({ ...current, payment_date: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-semibold text-[var(--text)] outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Kategori", "Category")}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setCatOpen((o) => !o)}
                          className="flex w-full items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2.5 text-left"
                        >
                          {editLoanForm.category_id ? (
                            <CategoryIconGlyph
                              iconName={categories.find((c) => String(c.id) === editLoanForm.category_id)?.icon_name}
                              categoryName={(() => {
                                const c = categories.find((x) => String(x.id) === editLoanForm.category_id)
                                return c ? c.name : tr("Kategori lain", "Other")
                              })()}
                              kind="expense"
                              size={16}
                            />
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                              <CreditCard size={13} />
                            </span>
                          )}
                          <span className={cn("truncate text-sm", editLoanForm.category_id ? "font-bold text-[var(--text)]" : "text-[var(--muted)]")}>
                            {(() => {
                              const c = categories.find((x) => String(x.id) === editLoanForm.category_id)
                              return editLoanForm.category_id ? (c ? c.name : tr("Kategori lain", "Other")) : tr("Pilih kategori", "Select category")
                            })()}
                          </span>
                          <ChevronDown size={16} className="ml-auto shrink-0 text-[var(--muted)]" />
                        </button>
                        {catOpen && (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl shadow-black/20">
                            <button
                              type="button"
                              onClick={() => {
                                setEditLoanForm((prev) => ({ ...prev, category_id: "" }))
                                setCatOpen(false)
                              }}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-tint)]"
                            >
                              {tr("Tiada kategori", "No category")}
                            </button>
                            {categories.map((c) => {
                              const selected = editLoanForm.category_id === String(c.id)
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setEditLoanForm((prev) => ({ ...prev, category_id: String(c.id) }))
                                    setCatOpen(false)
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                                    selected ? "bg-[var(--surface-tint)]" : "hover:bg-[var(--surface-tint)]",
                                  )}
                                >
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                    <CategoryIconGlyph iconName={c.icon_name} categoryName={c.name} kind="expense" size={16} />
                                  </span>
                                  <span className="truncate text-sm font-semibold text-[var(--text)]">{c.name}</span>
                                  {selected ? <span className="ml-auto text-[var(--accent2)]">✓</span> : null}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <a
                        href={`/${sessionId}/categories`}
                        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--accent2)] transition hover:bg-[var(--surface-tint-strong)]"
                        aria-label={tr("Tambah kategori", "Add category")}
                      >
                        <Plus size={18} />
                      </a>
                    </div>
                  </label>
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Nota", "Notes")}
                    </span>
                    <input
                      value={paymentForm.notes}
                      onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder={tr("Opsyenal", "Optional")}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-semibold text-[var(--text)] outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={savingPayment}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {savingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet size={16} />}
                    {tr("Simpan Bayaran Loan", "Save Loan Payment")}
                  </button>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Edit sheet */}
      {mounted && showEditLoanSheet && loan
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-transparent p-0 md:items-center"
              onClick={requestEditSheetClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                {...editLoanSheetSwipe}
                data-swipe-sheet
                className="app-sheet-panel app-sheet-panel--lg max-h-[86dvh] w-full overflow-y-auto border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:max-w-md"
                onClick={(event) => event.stopPropagation()}
              >
                <AppSheetHeader
                  title={tr("Edit Loan", "Edit Loan")}
                  onClose={requestEditSheetClose}
                  action={
                    <button
                      type="submit"
                      form="loan-edit-form"
                      disabled={savingLoan}
                      className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {savingLoan
                        ? (lang === "BM" ? "Menyimpan…" : "Saving…")
                        : tr("Update", "Update")}
                    </button>
                  }
                />
                <form id="loan-edit-form" onSubmit={handleSaveLoan} className="space-y-4 px-4 py-4 md:px-6 md:py-6">
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Nama Loan", "Loan Name")}
                    </span>
                    <input
                      value={editLoanForm.name}
                      onChange={(e) => setEditLoanForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                        {tr("Jumlah Loan", "Total Loan")}
                      </span>
                      <input
                        inputMode="decimal"
                        value={editLoanForm.opening_amount}
                        onChange={(e) =>
                          setEditLoanForm((prev) => ({
                            ...prev,
                            opening_amount: e.target.value
                              .replace(/,/g, ".")
                              .replace(/[^0-9.]/g, "")
                              .replace(/(\..*)\./, "$1"),
                          }))
                        }
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                        {tr("Bayaran Bulanan", "Monthly Payment")}
                      </span>
                      <input
                        inputMode="decimal"
                        value={editLoanForm.monthly_payment}
                        onChange={(e) =>
                          setEditLoanForm((prev) => ({
                            ...prev,
                            monthly_payment: e.target.value
                              .replace(/,/g, ".")
                              .replace(/[^0-9.]/g, "")
                              .replace(/(\..*)\./, "$1"),
                          }))
                        }
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className={cn("mb-2 block text-[0.625rem] font-bold uppercase tracking-widest", mutedClass)}>
                      {tr("Nota", "Notes")}
                    </span>
                    <textarea
                      rows={3}
                      value={editLoanForm.notes}
                      onChange={(e) => setEditLoanForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm text-[var(--text)] outline-none"
                    />
                  </label>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {alertModal}
    </div>
  )
}
