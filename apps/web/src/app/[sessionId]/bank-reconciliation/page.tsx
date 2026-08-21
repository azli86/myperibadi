"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Plus,
  RefreshCw,
  Sparkles,
  Search,
  Filter,
  Check,
  ChevronRight,
  Layers,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  ClipboardPaste,
  ShieldCheck,
  CheckCheck,
  Building2,
  Calendar,
  DollarSign,
  HelpCircle,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  FileCheck2,
} from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import {
  BankTransactionRow,
  parseCsvStatement,
  parseTextStatement,
} from "@/lib/bank-statement-parser"
import { extractTextFromPdf } from "@/lib/pdf-statement-extractor"
import {
  AppTransaction,
  reconcileStatements,
  ReconciliationResult,
  MatchedPair,
} from "@/lib/reconciliation-matcher"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"

type WalletItem = {
  id: number
  name: string
  label?: string
  currency?: string
  balance?: number
  type?: string
  image_url?: string | null
}

type CategoryItem = {
  id: number
  name: string
  type: "expense" | "income"
  color?: string
  icon?: string
}

const SAMPLE_MAYBANK_TEXT = `01/08/2026 DUITNOW TRSF TO ALI BAKI RM 50.00 DR
03/08/2026 SALARY CREDIT JULY 2026 RM 4,500.00 CR
05/08/2026 MCDONALDS MIDVALLEY RM 28.50 DR
08/08/2026 TNB BILL PAYMENT RM 120.00 DR
12/08/2026 PETRONAS GASOLINE RM 70.00 DR
15/08/2026 TOUCH N GO RELOAD RM 100.00 DR
18/08/2026 SHOPEE PAY PURCHASE RM 64.90 DR
20/08/2026 DUITNOW IN FROM AHMAD RM 150.00 CR`

export default function BankReconciliationPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  // Remote data state
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [appTransactions, setAppTransactions] = useState<AppTransaction[]>([])
  const [loadingInitial, setLoadingInitial] = useState(true)

  // Reconciliation checks every app transaction. Wallet is chosen only when importing.

  // Input Mode (file vs paste)
  const [inputMode, setInputMode] = useState<"file" | "paste">("file")
  const [rawTextContent, setRawTextContent] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Password-Protected PDF State
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [pdfPassword, setPdfPassword] = useState("")
  const [showPasswordText, setShowPasswordText] = useState(false)
  const [pendingPdfBuffer, setPendingPdfBuffer] = useState<ArrayBuffer | null>(null)
  const [pendingPdfName, setPendingPdfName] = useState<string>("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlockingPdf, setUnlockingPdf] = useState(false)

  // Parsed Statement Data
  const [bankTxns, setBankTxns] = useState<BankTransactionRow[]>([])

  // Active View Tab
  const [activeTab, setActiveTab] = useState<"all" | "missing_in_app" | "matched" | "missing_in_bank">("missing_in_app")
  const [searchQuery, setSearchQuery] = useState("")

  // Quick Add State
  const [quickAddTxn, setQuickAddTxn] = useState<BankTransactionRow | null>(null)
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<number | "">("")
  const [quickAddWalletId, setQuickAddWalletId] = useState<number | "">("")
  const [quickAddSaving, setQuickAddSaving] = useState(false)

  // Batch Selection
  const [selectedMissingIds, setSelectedMissingIds] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchWalletId, setBatchWalletId] = useState<number | "">("")

  const getAuthHeaders = (): Record<string, string> => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) {
      return { Authorization: `Bearer ${token}` }
    }
    return {}
  }

  const parseStatementWithAi = async (text: string) => {
    const response = await fetch("/api/bank-reconciliation/parse", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      const fallback = parseTextStatement(text)
      if (fallback.transactions.length) return fallback
      throw new Error((await response.json().catch(() => null))?.detail || tr("AI gagal membaca penyata.", "AI failed to read the statement."))
    }
    const data = await response.json()
    return { transactions: Array.isArray(data.transactions) ? data.transactions as BankTransactionRow[] : [] }
  }

  // Load Wallets, Categories, Transactions
  const loadData = async () => {
    setLoadingInitial(true)
    try {
      const headers = getAuthHeaders()

      const [walletsRes, catsRes, txnsRes] = await Promise.allSettled([
        fetch("/api/wallets", { credentials: "include", headers }),
        fetch("/api/categories", { credentials: "include", headers }),
        fetch(`/api/transactions?limit=500`, { credentials: "include", headers }),
      ])

      if (walletsRes.status === "fulfilled" && walletsRes.value.ok) {
        const wData = await walletsRes.value.json()
        setWallets(Array.isArray(wData) ? wData : wData.wallets || [])
      }

      if (catsRes.status === "fulfilled" && catsRes.value.ok) {
        const cData = await catsRes.value.json()
        setCategories(Array.isArray(cData) ? cData : cData.categories || [])
      }

      if (txnsRes.status === "fulfilled" && txnsRes.value.ok) {
        const tData = await txnsRes.value.json()
        const list = Array.isArray(tData) ? tData : tData.transactions || []
        setAppTransactions(
          list.map((t: any) => ({
            id: t.id,
            amount: Number(t.amount || 0),
            type: t.type,
            date: t.date || t.txn_date || "",
            description: t.vendor_or_source || t.description || t.notes || "",
            notes: t.notes || "",
            category_name: t.category_name,
            category_id: t.category_id,
            wallet_id: t.wallet_id,
            wallet_name: t.wallet_name,
            is_wallet_transfer: Boolean(t.is_wallet_transfer),
            is_debt_movement: Boolean(t.is_debt_movement),
          }))
        )
      }
    } catch (err) {
      console.error("Failed to load initial data", err)
    } finally {
      setLoadingInitial(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredAppTransactions = appTransactions

  // Process File Upload (CSV, TSV, TXT, PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isPdf = file.name.toLowerCase().endsWith(".pdf")
    setFileName(file.name)
    setIsProcessing(true)

    if (isPdf) {
      const buffer = await file.arrayBuffer()
      const pdfRes = await extractTextFromPdf(buffer)

      if (pdfRes.needsPassword) {
        setPendingPdfBuffer(buffer)
        setPendingPdfName(file.name)
        setPasswordError(null)
        setPdfPassword("")
        setShowPasswordModal(true)
        setIsProcessing(false)
        return
      }

      if (pdfRes.text) {
        try {
          const result = await parseStatementWithAi(pdfRes.text)
          setBankTxns(result.transactions)
          setSelectedMissingIds(new Set(result.transactions.map((t) => t.id)))
        } catch (err: any) {
          showAlert(tr("Ralat Membaca Penyata", "Statement Reading Error"), err.message, "error")
        } finally {
          setIsProcessing(false)
        }
      } else {
        setIsProcessing(false)
        showAlert(
          tr("Ralat Membaca PDF", "Error Reading PDF"),
          pdfRes.error || tr("Gagal mengekstrak teks dari penyata PDF.", "Failed to extract text from PDF statement."),
          "error"
        )
      }
      return
    }

    const reader = new FileReader()
    reader.onload = async (event) => {
      const content = (event.target?.result as string) || ""
      try {
        const result = await parseStatementWithAi(content)
        setBankTxns(result.transactions)
        setSelectedMissingIds(new Set(result.transactions.map((t) => t.id)))
      } catch (err: any) {
        showAlert(tr("Ralat Membaca Penyata", "Statement Reading Error"), err.message, "error")
      } finally {
        setIsProcessing(false)
      }
    }
    reader.readAsText(file)
  }

  // Handle Unlocking PDF with Password
  const handleUnlockPdf = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pendingPdfBuffer) return
    if (!pdfPassword.trim()) {
      setPasswordError(tr("Sila masukkan kata laluan PDF.", "Please enter the PDF password."))
      return
    }

    setUnlockingPdf(true)
    setPasswordError(null)

    try {
      const pdfRes = await extractTextFromPdf(pendingPdfBuffer, pdfPassword.trim())

      if (pdfRes.invalidPassword || pdfRes.needsPassword) {
        setPasswordError(tr("Kata laluan salah. Sila semak No. IC / Tarikh Lahir anda.", "Incorrect password. Please check your IC / Birthdate."))
        setUnlockingPdf(false)
        return
      }

      if (pdfRes.text) {
        const result = await parseStatementWithAi(pdfRes.text)
        setBankTxns(result.transactions)
        setSelectedMissingIds(new Set(result.transactions.map((t) => t.id)))
        setShowPasswordModal(false)
        setPendingPdfBuffer(null)
        setPdfPassword("")
      } else {
        setPasswordError(pdfRes.error || tr("Gagal membaca teks penyata selepas dibuka.", "Failed to read statement text after unlock."))
      }
    } catch (err: any) {
      setPasswordError(err.message || tr("Ralat semasa membuka PDF.", "Error unlocking PDF."))
    } finally {
      setUnlockingPdf(false)
    }
  }

  // Process Pasted Text
  const handleProcessText = async () => {
    if (!rawTextContent.trim()) {
      showAlert(tr("Perhatian", "Notice"), tr("Sila tampal teks penyata bank terlebih dahulu.", "Please paste bank statement text first."), "warning")
      return
    }
    setIsProcessing(true)
    try {
      const result = await parseStatementWithAi(rawTextContent)
      setBankTxns(result.transactions)
      setSelectedMissingIds(new Set(result.transactions.map((t) => t.id)))
      setFileName("Teks Penyata Bank")
    } catch (err: any) {
      showAlert(tr("Ralat Membaca Penyata", "Statement Reading Error"), err.message, "error")
    } finally {
      setIsProcessing(false)
    }
  }

  // Load Sample
  const loadSample = () => {
    setRawTextContent(SAMPLE_MAYBANK_TEXT)
    setInputMode("paste")
    const result = parseTextStatement(SAMPLE_MAYBANK_TEXT)
    setBankTxns(result.transactions)
    setSelectedMissingIds(new Set(result.transactions.map((t) => t.id)))
    setFileName("Contoh Penyata Maybank")
  }

  // Compute Reconciliation
  const reconResult: ReconciliationResult = useMemo(() => {
    return reconcileStatements(bankTxns, filteredAppTransactions, { maxDateToleranceDays: 3 })
  }, [bankTxns, filteredAppTransactions])

  // Single Add to App
  const handleQuickAdd = async () => {
    if (!quickAddTxn) return
    if (!quickAddWalletId) {
      showAlert(tr("Pilih Bank", "Select Bank"), tr("Pilih dompet atau akaun bank sebelum menyimpan.", "Select a wallet or bank account before saving."), "warning")
      return
    }
    setQuickAddSaving(true)

    try {
      const headers = getAuthHeaders()
      const payload = {
        type: quickAddTxn.type,
        amount: quickAddTxn.amount,
        vendor_or_source: quickAddTxn.description,
        notes: `Rekonsiliasi Bank: ${quickAddTxn.description}`,
        txn_date: quickAddTxn.date,
        category_id: quickAddCategoryId ? Number(quickAddCategoryId) : null,
        wallet_id: Number(quickAddWalletId),
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error("Gagal menambah transaksi")
      }

      const created = await res.json()

      // Optimistically add to appTransactions
      setAppTransactions((prev) => [
        {
          id: created.id || created.txn_id || Date.now(),
          amount: quickAddTxn.amount,
          type: quickAddTxn.type,
          date: quickAddTxn.date,
          description: quickAddTxn.description,
          notes: payload.notes,
          category_id: payload.category_id,
          wallet_id: payload.wallet_id,
        },
        ...prev,
      ])

      showAlert(tr("Berjaya", "Success"), tr("Transaksi berjaya ditambah ke dalam bajet!", "Transaction successfully added to budget!"), "success")
      setQuickAddTxn(null)
      setQuickAddCategoryId("")
    } catch (err: any) {
      showAlert(tr("Ralat", "Error"), err.message || tr("Ralat semasa menyimpan transaksi", "Error saving transaction"), "error")
    } finally {
      setQuickAddSaving(false)
    }
  }

  // Batch Import Selected Missing Transactions
  const handleBatchImport = () => {
    const toImport = reconResult.missingInApp.filter((t) => selectedMissingIds.has(t.id))
    if (!batchWalletId) {
      showAlert(tr("Pilih Bank", "Select Bank"), tr("Pilih dompet atau akaun bank untuk transaksi yang akan diimport.", "Select the wallet or bank account for imported transactions."), "warning")
      return
    }
    if (toImport.length === 0) {
      showAlert(tr("Perhatian", "Notice"), tr("Tiada transaksi yang dipilih untuk diimport.", "No transactions selected for import."), "warning")
      return
    }

    showConfirm(
      tr("Sahkan Import", "Confirm Import"),
      tr(
        `Adakah anda pasti ingin mengimport ${toImport.length} transaksi ini ke dalam bajet?`,
        `Are you sure you want to import ${toImport.length} transactions into your budget?`
      ),
      async () => {
        setBatchImporting(true)
        const headers = getAuthHeaders()
        let successCount = 0
        const newAdded: AppTransaction[] = []

        for (const item of toImport) {
          try {
            const payload = {
              type: item.type,
              amount: item.amount,
              vendor_or_source: item.description,
              notes: `Import Penyata: ${item.description}`,
              txn_date: item.date,
              category_id: null,
              wallet_id: Number(batchWalletId),
            }

            const res = await fetch("/api/transactions", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                ...headers,
              },
              body: JSON.stringify(payload),
            })

            if (res.ok) {
              successCount++
              newAdded.push({
                id: `imported-${item.id}-${Date.now()}`,
                amount: item.amount,
                type: item.type,
                date: item.date,
                description: item.description,
                notes: payload.notes,
                wallet_id: payload.wallet_id,
              })
            }
          } catch (e) {
            console.error("Batch import item error", e)
          }
        }

        setAppTransactions((prev) => [...newAdded, ...prev])
        setBatchImporting(false)
        showAlert(
          tr("Selesai", "Completed"),
          tr(`${successCount} daripada ${toImport.length} transaksi berjaya diimport!`, `${successCount} of ${toImport.length} transactions imported successfully!`),
          "success"
        )
      },
      "info"
    )
  }

  return (
    <div className="space-y-6 pb-24 md:pb-12">
      {/* ─── Headers ─── */}
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Rekonsiliasi Bank", "Bank Reconciliation")}
          fallbackHref={`/${sessionId}/wallet-settings`}
          action={
            bankTxns.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setBankTxns([])
                  setFileName(null)
                  setRawTextContent("")
                }}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-xs font-bold text-[var(--muted)]"
              >
                <RefreshCw size={14} />
              </button>
            ) : null
          }
        />
      </div>

      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Rekonsiliasi Penyata Bank", "Bank Statement Reconciliation")}
          homeHref={`/${sessionId}`}
          actions={
            bankTxns.length > 0 ? (
              <DesktopPageAction
                onClick={() => {
                  setBankTxns([])
                  setFileName(null)
                  setRawTextContent("")
                }}
              >
                <RefreshCw size={14} />
                {tr("Penyata Baharu", "New Statement")}
              </DesktopPageAction>
            ) : null
          }
        />
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 md:px-0">
        {/* ─── Statement Uploader / Input Panel ─── */}
        {bankTxns.length === 0 ? (
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
                <FileSpreadsheet size={28} />
              </div>
              <h2 className="mt-3 text-lg font-black text-[var(--text)]">
                {tr("Muat Naik / Tampal Penyata Bank", "Upload or Paste Bank Statement")}
              </h2>
              <p className="mx-auto mt-1 max-w-md text-xs font-semibold text-[var(--muted)]">
                {tr(
                  "Sokongan untuk fail PDF Penyata Bank (termasuk yang berkunci kata laluan), fail CSV, Excel atau salin-tampal teks transaksi terus.",
                  "Supports bank statement PDFs (including password-protected ones), CSV files, or copy-pasted statement text."
                )}
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="mt-6 flex justify-center">
              <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-1">
                <button
                  type="button"
                  onClick={() => setInputMode("file")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition",
                    inputMode === "file" ? "bg-[var(--card)] text-[var(--text)] shadow-xs" : "text-[var(--muted)]"
                  )}
                >
                  <UploadCloud size={14} />
                  <span>{tr("Fail PDF / CSV / Excel", "PDF / CSV / Excel File")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("paste")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition",
                    inputMode === "paste" ? "bg-[var(--card)] text-[var(--text)] shadow-xs" : "text-[var(--muted)]"
                  )}
                >
                  <ClipboardPaste size={14} />
                  <span>{tr("Salin & Tampal Teks", "Copy & Paste Text")}</span>
                </button>
              </div>
            </div>

            {/* File Upload Dropzone */}
            {inputMode === "file" ? (
              <div className="mt-6">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 p-8 transition hover:border-indigo-400 hover:bg-indigo-500/5">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <UploadCloud size={32} />
                  </div>
                  <p className="mt-2 text-sm font-bold text-[var(--text)]">
                    {tr("Ketik atau heret fail PDF / CSV / TSV ke sini", "Click or drag PDF / CSV / TSV file here")}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                    {tr("Menyokong fail PDF (termasuk dengan kata laluan) & fail CSV", "Supports PDF files (including password-protected) & CSV files")}
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              /* Paste Statement Textarea */
              <div className="mt-6 space-y-3">
                <textarea
                  rows={6}
                  value={rawTextContent}
                  onChange={(e) => setRawTextContent(e.target.value)}
                  placeholder={tr(
                    "Contoh:\n01/08/2026 DUITNOW TO ALI RM 50.00 DR\n03/08/2026 SALARY CREDIT RM 4,500.00 CR\n05/08/2026 MCDONALDS RM 28.50 DR",
                    "Example:\n01/08/2026 DUITNOW TO ALI RM 50.00 DR\n03/08/2026 SALARY CREDIT RM 4,500.00 CR"
                  )}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                />
                <button
                  type="button"
                  onClick={handleProcessText}
                  disabled={isProcessing}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] text-xs font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-98"
                >
                  <Sparkles size={15} />
                  <span>{tr("Proses Penyata Sekarang", "Process Statement Now")}</span>
                </button>
              </div>
            )}

            {/* Preset Samples */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-[var(--border)]/60 pt-4">
              <span className="text-xs font-bold text-[var(--muted)]">{tr("Cuba contoh data:", "Try sample data:")}</span>
              <button
                type="button"
                onClick={loadSample}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--border)]"
              >
                {tr("Contoh Penyata Maybank", "Sample Maybank Statement")}
              </button>
            </div>
          </div>
        ) : (
          /* ─── Reconciliation Results Dashboard ─── */
          <div className="space-y-6">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Match Rate */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
                <p className="text-[0.625rem] font-black uppercase tracking-wider text-[var(--muted)]">
                  {tr("Kadar Padanan", "Match Rate")}
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-emerald-500">
                    {reconResult.summary.matchRatePercent}%
                  </span>
                  <span className="text-[0.65rem] font-bold text-[var(--muted)]">
                    ({reconResult.summary.matchedCount}/{reconResult.summary.totalBankTxns})
                  </span>
                </div>
              </div>

              {/* Missing in App */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-xs">
                <p className="text-[0.625rem] font-black uppercase tracking-wider text-amber-500">
                  {tr("Tertinggal Dlm Bajet", "Missing in App")}
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-amber-500">
                    {reconResult.summary.missingInAppCount}
                  </span>
                  <span className="text-[0.65rem] font-bold text-amber-500/70">
                    {tr("perlu import", "to import")}
                  </span>
                </div>
              </div>

              {/* Total Bank Outflow */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
                <p className="text-[0.625rem] font-black uppercase tracking-wider text-[var(--muted)]">
                  {tr("Jumlah Bank Keluar", "Bank Debit Total")}
                </p>
                <p className="mt-1 text-lg font-black text-[var(--text)]">
                  RM {reconResult.summary.bankDebitTotal.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Net Variance */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
                <p className="text-[0.625rem] font-black uppercase tracking-wider text-[var(--muted)]">
                  {tr("Perbezaan Bersih", "Net Variance")}
                </p>
                <p className={cn("mt-1 text-lg font-black", Math.abs(reconResult.summary.netVariance) < 0.01 ? "text-emerald-500" : "text-amber-400")}>
                  RM {Math.abs(reconResult.summary.netVariance).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Tab Filter Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("missing_in_app")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                    activeTab === "missing_in_app"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <AlertCircle size={14} />
                  <span>{tr("Tertinggal Dlm Bajet", "Missing in App")}</span>
                  <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[0.65rem] font-bold">
                    {reconResult.summary.missingInAppCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("matched")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                    activeTab === "matched"
                      ? "bg-emerald-500 text-white shadow-xs"
                      : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <CheckCheck size={14} />
                  <span>{tr("Telah Dipadankan", "Matched")}</span>
                  <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[0.65rem] font-bold">
                    {reconResult.summary.matchedCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("missing_in_bank")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                    activeTab === "missing_in_bank"
                      ? "bg-rose-500 text-white shadow-xs"
                      : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <Clock size={14} />
                  <span>{tr("Tiada Dlm Penyata", "Missing in Bank")}</span>
                  <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[0.65rem] font-bold">
                    {reconResult.summary.missingInBankCount}
                  </span>
                </button>
              </div>

              {/* Batch Import Button */}
              {activeTab === "missing_in_app" && reconResult.summary.missingInAppCount > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={batchWalletId}
                    onChange={(e) => setBatchWalletId(e.target.value ? Number(e.target.value) : "")}
                    className="h-9 max-w-44 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)] outline-none"
                  >
                    <option value="">{tr("Pilih bank...", "Select bank...")}</option>
                    {wallets.map((w) => <option key={w.id} value={w.id}>{w.label || w.name}</option>)}
                  </select>
                <button
                  type="button"
                  onClick={handleBatchImport}
                  disabled={batchImporting || selectedMissingIds.size === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white shadow-xs transition hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  <span>{batchImporting ? tr("Mengimport...", "Importing...") : tr(`Import ${selectedMissingIds.size} Yang Dipilih`, `Import ${selectedMissingIds.size} Selected`)}</span>
                </button>
                </div>
              )}
            </div>

            {/* ─── TAB 1: Missing In App (Bank Txns Not in Budget) ─── */}
            {activeTab === "missing_in_app" && (
              <div className="space-y-3">
                {reconResult.missingInApp.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
                    <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                    <p className="mt-2 text-sm font-bold text-emerald-500">
                      {tr("Semua transaksi bank telah wujud dalam bajet anda!", "All bank transactions are accounted for in your budget!")}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1 text-xs font-bold text-[var(--muted)]">
                      <span>{tr("Pilih transaksi untuk dimasukkan ke bajet:", "Select transactions to add to budget:")}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedMissingIds.size === reconResult.missingInApp.length) {
                            setSelectedMissingIds(new Set())
                          } else {
                            setSelectedMissingIds(new Set(reconResult.missingInApp.map((t) => t.id)))
                          }
                        }}
                        className="text-indigo-400 hover:underline"
                      >
                        {selectedMissingIds.size === reconResult.missingInApp.length ? tr("Nyahpilih Semua", "Deselect All") : tr("Pilih Semua", "Select All")}
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {reconResult.missingInApp.map((txn) => {
                        const isSelected = selectedMissingIds.has(txn.id)
                        const isExp = txn.type === "expense"

                        return (
                          <div
                            key={txn.id}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-2xl border p-4 transition",
                              isSelected ? "border-amber-500/40 bg-amber-500/5" : "border-[var(--border)] bg-[var(--card)]"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = new Set(selectedMissingIds)
                                  if (e.target.checked) next.add(txn.id)
                                  else next.delete(txn.id)
                                  setSelectedMissingIds(next)
                                }}
                                className="h-4 w-4 rounded accent-amber-500"
                              />

                              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold", isExp ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500")}>
                                {isExp ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[var(--text)]">{txn.description}</p>
                                <p className="text-[0.6875rem] font-semibold text-[var(--muted)]">
                                  {txn.date} · {isExp ? tr("Perbelanjaan (Debit)", "Expense (Debit)") : tr("Pendapatan (Kredit)", "Income (Credit)")}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className={cn("text-sm font-black tabular-nums", isExp ? "text-rose-500" : "text-emerald-500")}>
                                {isExp ? "-" : "+"}RM {txn.amount.toFixed(2)}
                              </span>

                              <button
                                type="button"
                                onClick={() => setQuickAddTxn(txn)}
                                className="flex items-center gap-1 rounded-xl bg-[var(--surface-tint)] px-3 py-1.5 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--border)] active:scale-95"
                              >
                                <Plus size={13} strokeWidth={2.5} />
                                <span className="hidden sm:inline">{tr("Tambah", "Add")}</span>
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── TAB 2: Matched Pairs ─── */}
            {activeTab === "matched" && (
              <div className="space-y-3">
                {reconResult.matched.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-xs font-bold text-[var(--muted)]">
                    {tr("Tiada padanan ditemui lagi.", "No matched transactions found yet.")}
                  </div>
                ) : (
                  reconResult.matched.map((pair) => (
                    <div
                      key={pair.id}
                      className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
                    >
                      <div className="flex items-center justify-between border-b border-emerald-500/15 pb-2.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={15} className="text-emerald-500" />
                          <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            {pair.confidence === "exact" ? tr("Padan Tepat (100%)", "Exact Match (100%)") : tr("Padan Tinggi", "High Match")}
                          </span>
                          {pair.dateDiffDays > 0 && (
                            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[0.625rem] font-bold text-emerald-600 dark:text-emerald-400">
                              Beza {pair.dateDiffDays} hari
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                          RM {pair.bankTxn.amount.toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* Bank Record */}
                        <div className="rounded-xl bg-[var(--card)] p-3 text-xs border border-[var(--border)]/70">
                          <p className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                            {tr("Penyata Bank", "Bank Statement")}
                          </p>
                          <p className="mt-1 font-bold text-[var(--text)]">{pair.bankTxn.description}</p>
                          <p className="mt-0.5 font-semibold text-[var(--muted)]">{pair.bankTxn.date}</p>
                        </div>

                        {/* App Record */}
                        <div className="rounded-xl bg-[var(--card)] p-3 text-xs border border-[var(--border)]/70">
                          <p className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                            {tr("Rekod Bajet", "App Record")}
                          </p>
                          <p className="mt-1 font-bold text-[var(--text)]">{pair.appTxn.description || "Transaksi"}</p>
                          <p className="mt-0.5 font-semibold text-[var(--muted)]">
                            {pair.appTxn.date} · {pair.appTxn.category_name || "Kategori"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ─── TAB 3: Missing In Bank ─── */}
            {activeTab === "missing_in_bank" && (
              <div className="space-y-3">
                {reconResult.missingInBank.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-8 text-center text-xs font-bold text-emerald-500">
                    {tr("Tiada rekod tergantung dalam sistem bajet anda.", "No pending records in your budget app.")}
                  </div>
                ) : (
                  reconResult.missingInBank.map((txn) => {
                    const isExp = txn.type === "expense"
                    return (
                      <div
                        key={`app-missing-${txn.id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold", isExp ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500")}>
                            {isExp ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--text)]">{txn.description || "Transaksi"}</p>
                            <p className="text-[0.6875rem] font-semibold text-[var(--muted)]">
                              {txn.date} · {txn.category_name || "Tanpa Kategori"}
                            </p>
                          </div>
                        </div>

                        <span className={cn("text-sm font-black tabular-nums shrink-0", isExp ? "text-rose-500" : "text-emerald-500")}>
                          {isExp ? "-" : "+"}RM {Number(txn.amount || 0).toFixed(2)}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── PDF Password Prompt Modal ─── */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => {
            if (!unlockingPdf) {
              setShowPasswordModal(false)
              setPendingPdfBuffer(null)
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                <Lock size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">
                  {tr("Penyata PDF Berkunci", "Password-Protected PDF")}
                </h3>
                <p className="text-xs font-semibold text-[var(--muted)] truncate max-w-[260px]">
                  {pendingPdfName}
                </p>
              </div>
            </div>

            <form onSubmit={handleUnlockPdf} className="space-y-4">
              {/* Hidden username input for browser accessibility compliance */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value="bank-statement-user"
                className="hidden"
                readOnly
                tabIndex={-1}
                aria-hidden="true"
              />

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                  {tr("Kata Laluan Penyata Bank", "Bank Statement Password")}
                </label>
                <div className="relative mt-1.5">
                  <KeyRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type={showPasswordText ? "text" : "password"}
                    name="pdf-password"
                    autoComplete="current-password"
                    autoFocus
                    value={pdfPassword}
                    onChange={(e) => {
                      setPdfPassword(e.target.value)
                      setPasswordError(null)
                    }}
                    placeholder={tr("cth: No. IC (901231015555) / Tarikh Lahir", "e.g. IC No. / Birth Date")}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-10 pr-10 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    {showPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {passwordError && (
                  <p className="mt-1.5 text-xs font-bold text-rose-500 flex items-center gap-1">
                    <AlertCircle size={13} />
                    {passwordError}
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-[var(--surface-tint)]/30 p-3 text-[0.6875rem] font-medium text-[var(--muted)] space-y-1 border border-[var(--border)]/50">
                <p className="font-bold text-[var(--text)]">💡 {tr("Petua Kata Laluan Bank:", "Bank Password Tips:")}</p>
                <ul className="list-disc list-inside space-y-0.5 opacity-85">
                  <li><strong>Maybank</strong>: No. IC 12-digit (tanpa -)</li>
                  <li><strong>CIMB</strong>: 6 digit tarikh lahir (DDMMYY) / No. IC</li>
                  <li><strong>Bank Islam / RHB</strong>: No. IC atau 6 digit tarikh lahir</li>
                </ul>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={unlockingPdf}
                  onClick={() => {
                    setShowPasswordModal(false)
                    setPendingPdfBuffer(null)
                  }}
                  className="h-11 flex-1 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--muted)] transition hover:bg-[var(--surface-tint)]"
                >
                  {tr("Batal", "Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={unlockingPdf || !pdfPassword.trim()}
                  className="h-11 flex-1 rounded-xl bg-[var(--text)] text-xs font-black text-[var(--bg)] transition active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {unlockingPdf ? (
                    <span>{tr("Membuka PDF...", "Unlocking PDF...")}</span>
                  ) : (
                    <>
                      <FileCheck2 size={15} />
                      <span>{tr("Buka & Proses", "Unlock & Process")}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Quick Add Transaction Modal ─── */}
      {quickAddTxn && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
          onClick={() => setQuickAddTxn(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[var(--text)]">
                {tr("Tambah Transaksi Ke Bajet", "Add Transaction to Budget")}
              </h3>
              <button
                type="button"
                onClick={() => setQuickAddTxn(null)}
                className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)]"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-[var(--surface-tint)]/30 p-3.5 text-xs space-y-1">
              <p className="font-bold text-[var(--text)]">{quickAddTxn.description}</p>
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>{quickAddTxn.date}</span>
                <span className="font-black text-sm text-[var(--text)]">RM {quickAddTxn.amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Category Dropdown */}
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                {tr("Pilih Kategori", "Select Category")}
              </label>
              <select
                value={quickAddCategoryId}
                onChange={(e) => setQuickAddCategoryId(e.target.value ? Number(e.target.value) : "")}
                className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold text-[var(--text)] outline-none"
              >
                <option value="">{tr("Pilih Kategori...", "Choose Category...")}</option>
                {categories
                  .filter((c) => c.type === quickAddTxn.type)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Wallet Dropdown */}
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                {tr("Dompet / Akaun", "Wallet / Account")}
              </label>
              <select
                value={quickAddWalletId}
                onChange={(e) => setQuickAddWalletId(e.target.value ? Number(e.target.value) : "")}
                className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold text-[var(--text)] outline-none"
              >
                <option value="">{tr("Pilih Bank / Dompet...", "Select Bank / Wallet...")}</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label || w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickAddTxn(null)}
                className="h-11 flex-1 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--muted)] transition hover:bg-[var(--surface-tint)]"
              >
                {tr("Batal", "Cancel")}
              </button>
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={quickAddSaving || !quickAddWalletId}
                className="h-11 flex-1 rounded-xl bg-[var(--text)] text-xs font-black text-[var(--bg)] transition active:scale-98 disabled:opacity-50"
              >
                {quickAddSaving ? tr("Menyimpan...", "Saving...") : tr("Simpan Transaksi", "Save Transaction")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--card)] p-7 text-center shadow-2xl">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-500/20 border-t-indigo-500" />
            <p className="mt-5 text-base font-black text-[var(--text)]">{tr("AI sedang membaca transaksi...", "AI is reading transactions...")}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{tr("Mengenal pasti tarikh, amaun debit dan kredit", "Identifying dates, debit and credit amounts")}</p>
            <div className="mx-auto mt-4 flex w-fit gap-1.5">
              {[0, 1, 2].map((step) => <span key={step} className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" style={{ animationDelay: `${step * 180}ms` }} />)}
            </div>
          </div>
        </div>
      )}

      {alertModal}
    </div>
  )
}
