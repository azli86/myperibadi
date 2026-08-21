"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Plus,
  RefreshCw,
  Search,
  Check,
  ChevronRight,
  Wallet,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  ClipboardPaste,
  CheckCheck,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  FileCheck2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Sparkles,
  UploadCloud,
  FileText,
  ScanLine,
  Landmark,
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
import {
  AppTransaction,
  reconcileStatements,
  ReconciliationResult,
} from "@/lib/reconciliation-matcher"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
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

  // Input Mode (file vs paste)
  const [inputMode, setInputMode] = useState<"file" | "paste">("file")
  const [rawTextContent, setRawTextContent] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanStep, setScanStep] = useState<number>(0)

  // Password-Protected PDF State
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [pdfPassword, setPdfPassword] = useState("")
  const [showPasswordText, setShowPasswordText] = useState(false)
  const [pendingPdfBuffer, setPendingPdfBuffer] = useState<File | null>(null)
  const [pendingPdfName, setPendingPdfName] = useState<string>("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlockingPdf, setUnlockingPdf] = useState(false)

  // Parsed Statement Data
  const [bankTxns, setBankTxns] = useState<BankTransactionRow[]>([])

  // Active View Tab
  const [activeTab, setActiveTab] = useState<"missing_in_app" | "matched" | "missing_in_bank">("missing_in_app")
  const [smartDateMatch, setSmartDateMatch] = useState(true)

  // Quick Add State
  const [quickAddTxn, setQuickAddTxn] = useState<BankTransactionRow | null>(null)
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<number | "">("")
  const [quickAddWalletId, setQuickAddWalletId] = useState<number | "">("")
  const [quickAddSaving, setQuickAddSaving] = useState(false)

  // Batch Selection
  const [selectedMissingIds, setSelectedMissingIds] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchWalletId, setBatchWalletId] = useState<number | "">("")
  // Wallet chosen before upload; pre-fills import targets and scopes the check
  const [targetWalletId, setTargetWalletId] = useState<number | "">("")
  // Wizard flow: "wallet" -> "upload" -> results (results shown when bankTxns loaded)
  const [wizardStep, setWizardStep] = useState<"wallet" | "upload">("wallet")

  // Scanning animation steps timer
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isProcessing) {
      setScanStep(0)
      interval = setInterval(() => {
        setScanStep((prev) => (prev < 3 ? prev + 1 : prev))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isProcessing])

  const getAuthHeaders = (): Record<string, string> => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) {
      return { Authorization: `Bearer ${token}` }
    }
    return {}
  }

  const parseStatementWithAi = async (text: string, pageImages: string[] = []) => {
    const response = await fetch("/api/bank-reconciliation/parse", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ text, page_images: pageImages }),
    })
    if (!response.ok) {
      const fallback = parseTextStatement(text)
      if (fallback.transactions.length) return fallback
      throw new Error((await response.json().catch(() => null))?.detail || tr("Gagal membaca penyata.", "Failed to read the statement."))
    }
    const data = await response.json()
    return { transactions: Array.isArray(data.transactions) ? (data.transactions as BankTransactionRow[]) : [] }
  }

  const parsePdfWithServer = async (file: File, password?: string): Promise<BankTransactionRow[]> => {
    const formData = new FormData()
    formData.append("file", file)
    if (password) formData.append("password", password)
    const response = await fetch("/api/bank-reconciliation/parse", {
      method: "POST",
      credentials: "include",
      headers: { ...getAuthHeaders() },
      body: formData,
    })
    if (response.status === 401) {
      const detail = (await response.json().catch(() => null))?.detail
      if (detail === "PDF_PASSWORD_REQUIRED") {
        throw new Error("PDF_PASSWORD_REQUIRED")
      }
    }
    if (!response.ok) {
      throw new Error((await response.json().catch(() => null))?.detail || tr("Gagal membaca penyata.", "Failed to read the statement."))
    }
    const data = await response.json()
    return Array.isArray(data.transactions) ? (data.transactions as BankTransactionRow[]) : []
  }


  // Load Wallets, Categories, Transactions
  const loadData = async () => {
    setLoadingInitial(true)
    try {
      const headers = getAuthHeaders()

      const [walletsRes, catsRes, txnsRes] = await Promise.allSettled([
        fetch("/api/wallets", { credentials: "include", headers }),
        fetch("/api/categories", { credentials: "include", headers }),
        fetch(`/api/transactions?limit=5000`, { credentials: "include", headers }),
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

  // A statement belongs to the selected wallet. Never compare another bank's rows.
  const filteredAppTransactions = useMemo(
    () => targetWalletId
      ? appTransactions.filter((tx) => Number(tx.wallet_id) === Number(targetWalletId))
      : [],
    [appTransactions, targetWalletId]
  )

  // Process File Upload (CSV, TSV, TXT, PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!targetWalletId) {
      showAlert(tr("Pilih Bank", "Select Bank"), tr("Pilih akaun bank sebelum memuat naik penyata.", "Select the bank account before uploading a statement."), "warning")
      e.target.value = ""
      return
    }

    const isPdf = file.name.toLowerCase().endsWith(".pdf")
    setFileName(file.name)
    setBatchWalletId(targetWalletId)
    setQuickAddWalletId(targetWalletId)
    setIsProcessing(true)

    if (isPdf) {
      try {
        const transactions = await parsePdfWithServer(file)
        setBankTxns(transactions)
        setSelectedMissingIds(new Set(transactions.map((t) => t.id)))
      } catch (err: any) {
        if (err.message === "PDF_PASSWORD_REQUIRED") {
          setPendingPdfBuffer(file)
          setPendingPdfName(file.name)
          setPasswordError(null)
          setPdfPassword("")
          setShowPasswordModal(true)
        } else {
          showAlert(tr("Ralat Membaca Penyata", "Statement Reading Error"), err.message, "error")
        }
      } finally {
        setIsProcessing(false)
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
    setIsProcessing(true)
    try {
      const transactions = await parsePdfWithServer(pendingPdfBuffer, pdfPassword.trim())
      setBankTxns(transactions)
      setSelectedMissingIds(new Set(transactions.map((t) => t.id)))
      setShowPasswordModal(false)
      setPendingPdfBuffer(null)
      setPdfPassword("")
    } catch (err: any) {
      if (err.message === "PDF_PASSWORD_REQUIRED") {
        setPasswordError(tr("Kata laluan salah. Sila semak No. IC / Tarikh Lahir anda.", "Incorrect password. Please check your IC / Birthdate."))
      } else {
        setPasswordError(err.message || tr("Ralat semasa membuka PDF.", "Error unlocking PDF."))
      }
    } finally {
      setUnlockingPdf(false)
      setIsProcessing(false)
    }
  }

  // Process Pasted Text
  const handleProcessText = async () => {
    if (!targetWalletId) {
      showAlert(tr("Pilih Bank", "Select Bank"), tr("Pilih akaun bank sebelum memproses penyata.", "Select the bank account before processing a statement."), "warning")
      return
    }
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
      setBatchWalletId(targetWalletId)
      setQuickAddWalletId(targetWalletId)
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
    return reconcileStatements(bankTxns, filteredAppTransactions, { maxDateToleranceDays: smartDateMatch ? 2 : 0 })
  }, [bankTxns, filteredAppTransactions, smartDateMatch])

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

      showAlert(tr("Berjaya", "Success"), tr("Transaksi berjaya ditambah ke dalam rekod MyPeribadi!", "Transaction successfully added to MyPeribadi records!"), "success")
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
        `Adakah anda pasti ingin mengimport ${toImport.length} transaksi ini ke dalam akaun bank terpilih?`,
        `Are you sure you want to import ${toImport.length} transactions into the selected bank account?`
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

  const scanSteps = [
    tr("Mengesahkan fail penyata...", "Verifying statement file..."),
    tr("Mengekstrak transaksi PDF...", "Extracting PDF transactions..."),
    tr("Menganalisis debit & kredit...", "Analyzing debits & credits..."),
    tr("Memadankan rekod MyPeribadi...", "Matching MyPeribadi records..."),
  ]

  // Standard Hero Block
  const renderHero = (isDesktop = false) => (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)]",
        isDesktop ? "p-6" : "p-5"
      )}
    >

      <div className="relative">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)]">
            <ScanLine size={20} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={cn("font-black tracking-tight text-[var(--text)]", isDesktop ? "text-xl" : "text-lg")}>
              {tr("Rekonsiliasi Bank", "Bank Reconciliation")}
            </h1>
            <p className="mt-0.5 text-[0.8125rem] font-medium leading-snug text-[var(--muted)]">
              {tr(
                "Padankan penyata bank dengan rekod MyPeribadi anda.",
                "Match your bank statement with your MyPeribadi records."
              )}
            </p>
          </div>
        </div>

        {bankTxns.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--surface-tint)] px-3 py-1.5">
              <FileCheck2 size={13} className="text-[var(--muted)]" />
              <span className="max-w-[140px] truncate text-xs font-bold text-[var(--muted)]">{fileName}</span>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
              {reconResult.summary.totalBankTxns} {tr("transaksi", "transactions")}
            </span>
            <button
              type="button"
              onClick={() => {
                setBankTxns([])
                setFileName(null)
                setRawTextContent("")
                setWizardStep("wallet")
              }}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-black text-[var(--text)] transition hover:bg-[var(--surface-tint)] active:scale-95"
            >
              <RefreshCw size={13} />
              <span>{tr("Penyata Baru", "New Statement")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const contentBody = (
    <div className="space-y-5">
      {/* ─── Uploader Section (When no statement loaded) ─── */}
      {bankTxns.length === 0 ? (
        <div className="space-y-4">
          {/* ─── STEP 1: Wallet Selection ─── */}
          {wizardStep === "wallet" && (
            <div className="animate-wizard-in-right rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-center sm:p-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--text)] text-[var(--bg)]">
                <Landmark size={26} strokeWidth={2.2} />
              </div>
              <h2 className="mt-4 text-lg font-black tracking-tight text-[var(--text)]">
                {tr("Pilih Akaun Bank / Wallet", "Choose Bank Account / Wallet")}
              </h2>
              <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                {tr("Pilih wallet dahulu untuk mula memuat naik penyata.", "Pick a wallet first to start uploading your statement.")}
              </p>

              <select
                value={targetWalletId}
                onChange={(e) => setTargetWalletId(e.target.value ? Number(e.target.value) : "")}
                disabled={isProcessing}
                className="mt-6 h-13 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--text)]/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{tr("Pilih akaun bank dahulu...", "Select a bank account first...")}</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label || w.name} ({w.type?.toUpperCase() || "BANK"})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setWizardStep("upload")}
                disabled={!targetWalletId}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-98 disabled:opacity-40"
              >
                <span>{tr("Teruskan ke Upload", "Continue to Upload")}</span>
                <ArrowRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          )}

          {/* ─── STEP 2: Upload Statement ─── */}
          {wizardStep === "upload" && (
            <div className="animate-wizard-in-left rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setWizardStep("wallet")}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-tint)] active:scale-95"
                    aria-label={tr("Kembali", "Back")}
                  >
                    <ArrowLeft size={16} strokeWidth={2.5} />
                  </button>
                  <div>
                    <h2 className="text-sm font-black text-[var(--text)]">
                      {tr("Muat Naik Penyata", "Upload Statement")}
                    </h2>
                    <p className="text-[0.68rem] font-semibold text-[var(--muted)]">
                      {wallets.find((w) => Number(w.id) === Number(targetWalletId))?.label || wallets.find((w) => Number(w.id) === Number(targetWalletId))?.name}
                    </p>
                  </div>
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/40 p-1">
                  <button
                    type="button"
                    onClick={() => setInputMode("file")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
                      inputMode === "file" ? "bg-[var(--card)] text-[var(--text)] shadow-xs" : "text-[var(--muted)]"
                    )}
                  >
                    <UploadCloud size={14} />
                    <span className="hidden xs:inline">{tr("Fail", "File")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("paste")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
                      inputMode === "paste" ? "bg-[var(--card)] text-[var(--text)] shadow-xs" : "text-[var(--muted)]"
                    )}
                  >
                    <ClipboardPaste size={14} />
                    <span className="hidden xs:inline">{tr("Tampal", "Paste")}</span>
                  </button>
                </div>
              </div>

              {inputMode === "file" ? (
                <label className="mt-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-tint)]/15 p-8 text-center transition cursor-pointer hover:border-[var(--text)]/40 hover:bg-[var(--surface-tint)]/30 active:scale-[0.99] sm:p-10">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--text)] text-[var(--bg)]">
                    <UploadCloud size={28} strokeWidth={2.2} />
                  </div>
                  <p className="mt-4 text-base font-black text-[var(--text)]">
                    {tr("Ketik untuk pilih penyata", "Tap to choose statement")}
                  </p>
                  <p className="mt-1.5 text-xs font-medium text-[var(--muted)]">
                    {tr("PDF (termasuk berkunci) · CSV · Teks", "PDF (incl. locked) · CSV · Text")}
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="mt-5 space-y-3">
                  <textarea
                    rows={6}
                    value={rawTextContent}
                    onChange={(e) => setRawTextContent(e.target.value)}
                    placeholder={tr(
                      "Contoh:\n01/08/2026 DUITNOW TO ALI RM 50.00 DR\n03/08/2026 SALARY CREDIT RM 4,500.00 CR\n05/08/2026 MCDONALDS RM 28.50 DR",
                      "Example:\n01/08/2026 DUITNOW TO ALI RM 50.00 DR\n03/08/2026 SALARY CREDIT RM 4,500.00 CR"
                    )}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50"
                  />
                  <button
                    type="button"
                    onClick={handleProcessText}
                    disabled={isProcessing}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] text-sm font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-98"
                  >
                    <Sparkles size={15} />
                    <span>{tr("Proses Penyata Sekarang", "Process Statement Now")}</span>
                  </button>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs">
                <span className="font-semibold text-[var(--muted)]">{tr("Format:", "Formats:")} Maybank, CIMB, Bank Islam, RHB, TNG</span>
                <button
                  type="button"
                  onClick={loadSample}
                  className="font-bold text-[var(--text)] underline-offset-4 hover:underline"
                >
                  {tr("Cuba Contoh", "Try Sample")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ─── Reconciliation Results Section ─── */
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)]">
                <Landmark size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <label className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">{tr("Rekod Bank", "Bank Record")}</label>
                <select
                  value={targetWalletId}
                  onChange={(e) => {
                    const walletId = e.target.value ? Number(e.target.value) : ""
                    setBankTxns([])
                    setFileName(null)
                    setRawTextContent("")
                    setWizardStep("wallet")
                    setTargetWalletId(walletId)
                    setBatchWalletId(walletId)
                    setQuickAddWalletId(walletId)
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-bold text-[var(--text)] outline-none"
                >
                  <option value="">{tr("Pilih wallet...", "Select wallet...")}</option>
                  {wallets.map((w) => <option key={w.id} value={w.id}>{w.label || w.name}</option>)}
                </select>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">{tr("Fail", "File")}</p>
                <p className="mt-1 max-w-[120px] truncate text-xs font-bold text-[var(--text)]">{fileName || "—"}</p>
              </div>
            </div>
          </div>

          {/* ─── Overview Bank Card ─── */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-800 p-5 text-white shadow-lg sm:p-6">
            {/* decorative glows */}
            <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-emerald-400/20 blur-3xl" />

            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark size={15} strokeWidth={2.4} />
                  <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-white/80">
                    {tr("Rekonsiliasi Bank", "Bank Reconciliation")}
                  </span>
                </div>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.65rem] font-black text-white/90">
                  {reconResult.summary.matchedCount}/{reconResult.summary.totalBankTxns}
                </span>
              </div>

              {/* big match rate */}
              <div className="mt-4 flex items-end gap-2">
                <span className="text-5xl font-black tabular-nums leading-none tracking-tight">
                  {reconResult.summary.matchRatePercent}%
                </span>
                <span className="mb-1 text-sm font-bold text-white/70">{tr("padanan", "match rate")}</span>
              </div>

              {/* progress bar */}
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{ width: `${Math.min(100, reconResult.summary.matchRatePercent)}%` }}
                />
              </div>

              {/* stat chips */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-[0.6rem] font-bold uppercase tracking-wider text-white/70">{tr("Tertinggal", "Missing")}</p>
                  <p className="mt-0.5 text-xl font-black tabular-nums">{reconResult.summary.missingInAppCount}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-[0.6rem] font-bold uppercase tracking-wider text-white/70">{tr("Jumlah Keluar", "Debit")}</p>
                  <p className="mt-0.5 truncate text-lg font-black tabular-nums"><MoneyAmount value={reconResult.summary.bankDebitTotal} size="md" /></p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-[0.6rem] font-bold uppercase tracking-wider text-white/70">{tr("Beza Bersih", "Variance")}</p>
                  <p className="mt-0.5 truncate text-lg font-black tabular-nums"><MoneyAmount value={Math.abs(reconResult.summary.netVariance)} size="md" /></p>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Smart Date Toggle ─── */}
          <button
            type="button"
            role="switch"
            aria-checked={smartDateMatch}
            onClick={() => setSmartDateMatch((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 text-left transition sm:p-4"
          >
            <div className="min-w-0">
              <p className="text-xs font-black text-[var(--text)]">{tr("Padanan Tarikh Pintar", "Smart Date Matching")}</p>
              <p className="text-[0.68rem] font-semibold text-[var(--muted)]">{tr("Amaun sama, tarikh ±2 hari", "Same amount, date within ±2 days")}</p>
            </div>
            <span
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                smartDateMatch ? "bg-emerald-500" : "bg-[var(--muted)]/30"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                  smartDateMatch ? "left-[1.375rem]" : "left-0.5"
                )}
              />
            </span>
          </button>

          {/* ─── Tab Segments ─── */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("missing_in_app")}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-[0.6875rem] font-black uppercase tracking-[0.04em] transition",
                  activeTab === "missing_in_app"
                    ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                    : "text-[var(--muted)]"
                )}
              >
                {tr("Tertinggal", "Missing")} {reconResult.summary.missingInAppCount}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("matched")}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-[0.6875rem] font-black uppercase tracking-[0.04em] transition",
                  activeTab === "matched"
                    ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                    : "text-[var(--muted)]"
                )}
              >
                {tr("Padan", "Matched")} {reconResult.summary.matchedCount}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("missing_in_bank")}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-[0.6875rem] font-black uppercase tracking-[0.04em] transition",
                  activeTab === "missing_in_bank"
                    ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                    : "text-[var(--muted)]"
                )}
              >
                {tr("Dalam Penyata", "In Bank")} {reconResult.summary.missingInBankCount}
              </button>
            </div>
          </div>

          {/* Batch Import Bar */}
            {activeTab === "missing_in_app" && reconResult.summary.missingInAppCount > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
                <span className="min-w-0 truncate px-1 text-xs font-bold text-[var(--muted)]">{wallets.find((w) => Number(w.id) === Number(targetWalletId))?.label || wallets.find((w) => Number(w.id) === Number(targetWalletId))?.name}</span>
                <button
                  type="button"
                  onClick={handleBatchImport}
                  disabled={batchImporting || selectedMissingIds.size === 0 || !batchWalletId}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--text)] px-3 text-xs font-black text-[var(--bg)] transition active:scale-95 disabled:opacity-50"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>
                    {batchImporting
                      ? tr("Mengimport...", "Importing...")
                      : tr(`Import (${selectedMissingIds.size})`, `Import (${selectedMissingIds.size})`)}
                  </span>
                </button>
              </div>
            )}

          {/* ─── TAB 1: Missing In App (Bank Txns Not in Budget) ─── */}
          {activeTab === "missing_in_app" && (
            <div className="space-y-3">
              {reconResult.missingInApp.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-12 text-center">
                  <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                  <p className="mt-3 text-sm font-bold text-[var(--text)]">
                    {tr("Semua transaksi bank telah wujud dalam rekod MyPeribadi anda!", "All bank transactions are accounted for in your MyPeribadi records!")}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-1 text-xs font-semibold text-[var(--muted)]">
                    <span>{tr("Pilih transaksi untuk dimasukkan:", "Select transactions to import:")}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedMissingIds.size === reconResult.missingInApp.length) {
                          setSelectedMissingIds(new Set())
                        } else {
                          setSelectedMissingIds(new Set(reconResult.missingInApp.map((t) => t.id)))
                        }
                      }}
                      className="font-bold text-[var(--text)] underline-offset-4 hover:underline"
                    >
                      {selectedMissingIds.size === reconResult.missingInApp.length
                        ? tr("Nyahpilih Semua", "Deselect All")
                        : tr("Pilih Semua", "Select All")}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {reconResult.missingInApp.map((txn) => {
                      const isSelected = selectedMissingIds.has(txn.id)
                      const isExp = txn.type === "expense"

                      return (
                        <div
                          key={txn.id}
                          className={cn(
                            "rounded-xl border p-3.5 transition",
                            isSelected ? "border-[var(--border-strong)] bg-[var(--card)]" : "border-[var(--border)] bg-[var(--card)]/70"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedMissingIds)
                                if (e.target.checked) next.add(txn.id)
                                else next.delete(txn.id)
                                setSelectedMissingIds(next)
                              }}
                              className="h-5 w-5 shrink-0 cursor-pointer rounded-md accent-[var(--text)]"
                            />

                            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold", isExp ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500")}>
                              {isExp ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-[0.8125rem] font-bold leading-tight text-[var(--text)]">{txn.description}</p>
                              <p className="mt-0.5 text-[0.6875rem] font-semibold text-[var(--muted)]">
                                {txn.date} · {isExp ? tr("Debit", "Debit") : tr("Kredit", "Credit")}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
                            <span className={cn("text-base font-black tabular-nums", isExp ? "text-rose-500" : "text-emerald-500")}>
                              {isExp ? "-" : "+"}RM {txn.amount.toFixed(2)}
                            </span>

                            <button
                              type="button"
                              onClick={() => setQuickAddTxn(txn)}
                              className="flex h-8 items-center gap-1 rounded-lg bg-[var(--text)] px-3 text-xs font-black text-[var(--bg)] transition active:scale-95"
                            >
                              <Plus size={13} strokeWidth={2.5} />
                              <span>{tr("Tambah", "Add")}</span>
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
            <div className="space-y-2.5">
              {reconResult.matched.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-12 text-center text-xs font-bold text-[var(--muted)]">
                  {tr("Tiada padanan ditemui lagi.", "No matched transactions found yet.")}
                </div>
              ) : (
                reconResult.matched.map((pair) => (
                  <div
                    key={pair.id}
                    className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={15} className="text-emerald-500" />
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-500">
                          {pair.confidence === "exact" ? tr("Padan Tepat", "Exact Match") : tr("Padan Tinggi", "High Match")}
                        </span>
                        {pair.dateDiffDays > 0 && (
                          <span className="rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 text-[0.625rem] font-bold text-[var(--muted)]">
                            Beza {pair.dateDiffDays} hari
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-black text-[var(--text)]">
                        RM {pair.bankTxn.amount.toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
                      <div className="rounded-xl bg-[var(--surface-tint)]/25 p-3 text-xs">
                        <p className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                          {tr("Penyata Bank", "Bank Statement")}
                        </p>
                        <p className="mt-1 font-bold text-[var(--text)]">{pair.bankTxn.description}</p>
                        <p className="mt-0.5 font-semibold text-[var(--muted)]">{pair.bankTxn.date}</p>
                      </div>

                      <div className="rounded-xl bg-[var(--surface-tint)]/25 p-3 text-xs">
                        <p className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                          {tr("Rekod MyPeribadi", "MyPeribadi Record")}
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
            <div className="space-y-2.5">
              {reconResult.missingInBank.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-12 text-center text-xs font-bold text-[var(--muted)]">
                  {tr("Tiada rekod tergantung dalam sistem MyPeribadi anda.", "No pending records in your MyPeribadi app.")}
                </div>
              ) : (
                reconResult.missingInBank.map((txn) => {
                  const isExp = txn.type === "expense"
                  return (
                    <div
                      key={`app-missing-${txn.id}`}
                      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold", isExp ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500")}>
                          {isExp ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[0.8125rem] font-bold leading-tight text-[var(--text)]">{txn.description || "Transaksi"}</p>
                          <p className="mt-0.5 text-[0.6875rem] font-semibold text-[var(--muted)]">
                            {txn.date} · {txn.category_name || tr("Tanpa Kategori", "No Category")}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-end border-t border-[var(--border)] pt-2.5">
                        <span className={cn("text-base font-black tabular-nums", isExp ? "text-rose-500" : "text-emerald-500")}>
                          {isExp ? "-" : "+"}RM {Number(txn.amount || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4 pb-24 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Rekonsiliasi Bank", "Bank Reconciliation")}
          fallbackHref={`/${sessionId}/wallet-settings`}
        />

        <section className="px-1">{renderHero(false)}</section>

        <section className="px-1">{contentBody}</section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Rekonsiliasi Penyata Bank", "Bank Statement Reconciliation")}
          homeHref={`/${sessionId}`}
        />

        <DesktopPageBody className="space-y-5">
          {renderHero(true)}

          <div>{contentBody}</div>
        </DesktopPageBody>
      </div>

      {/* ─── PDF Password Prompt Modal ─── */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => {
            if (!unlockingPdf) {
              setShowPasswordModal(false)
              setPendingPdfBuffer(null)
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
                <Lock size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-[var(--text)]">
                  {tr("Penyata PDF Berkunci", "Password-Protected PDF")}
                </h3>
                <p className="text-xs font-semibold text-[var(--muted)] truncate">
                  {pendingPdfName}
                </p>
              </div>
            </div>

            <div
              className="space-y-4"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !unlockingPdf && pdfPassword.trim()) {
                  e.preventDefault()
                  handleUnlockPdf()
                }
              }}
            >
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                  {tr("Kata Laluan Penyata Bank", "Bank Statement Password")}
                </label>
                <div className="relative mt-1.5">
                  <KeyRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="text"
                    inputMode="text"
                    name="pdf-doc-code"
                    id="pdf-doc-code"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-form-type="other"
                    autoFocus
                    value={pdfPassword}
                    onChange={(e) => {
                      setPdfPassword(e.target.value)
                      setPasswordError(null)
                    }}
                    placeholder={tr("cth: No. IC / 6-digit Tarikh Lahir", "e.g. IC No. / Birth Date")}
                    style={
                      {
                        WebkitTextSecurity: showPasswordText ? "none" : "disc",
                      } as React.CSSProperties
                    }
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-10 pr-10 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50 focus:border-[var(--border-strong)]"
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

              <div className="rounded-xl bg-[var(--surface-tint)]/30 p-3 text-[0.6875rem] font-medium text-[var(--muted)] space-y-1 border border-[var(--border)]">
                <p className="font-bold text-[var(--text)]">💡 {tr("Petua kata laluan bank:", "Bank password tips:")}</p>
                <p>Maybank / RHB / Bank Islam (No. IC 12-digit) · CIMB (6-digit Tarikh Lahir)</p>
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
                  type="button"
                  onClick={() => handleUnlockPdf()}
                  disabled={unlockingPdf || !pdfPassword.trim()}
                  className="h-11 flex-1 rounded-xl bg-[var(--text)] text-xs font-black text-[var(--bg)] transition active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {unlockingPdf ? tr("Membuka...", "Unlocking...") : tr("Buka & Imbas", "Unlock & Scan")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Statement Scanner Loading Overlay (Clean & Native) ─── */}
      {isProcessing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 px-4 backdrop-blur-xs" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-2xl">
            {/* Animated Document Scan Box */}
            <div className="relative mx-auto flex h-28 w-24 flex-col justify-between overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-inner">
              <div className="space-y-1.5">
                <div className="h-2 w-8 rounded bg-[var(--muted)]/40" />
                <div className="h-1.5 w-full rounded bg-[var(--muted)]/20" />
                <div className="h-1.5 w-3/4 rounded bg-[var(--muted)]/20" />
                <div className="h-1.5 w-full rounded bg-[var(--muted)]/20" />
              </div>
              <div className="h-1.5 w-1/2 rounded bg-emerald-500/40" />
              <div className="pointer-events-none absolute inset-x-0 h-1 bg-[var(--text)] opacity-80 shadow-md animate-[scan_1.8s_ease-in-out_infinite]" />
            </div>

            <p className="mt-4 text-base font-black text-[var(--text)]">
              {tr("Mengimbas Penyata Bank...", "Scanning Bank Statement...")}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {scanSteps[scanStep]}
            </p>

            <div className="mx-auto mt-4 flex w-fit gap-1.5">
              {[0, 1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "h-2 w-2 rounded-full transition-all duration-300",
                    step <= scanStep ? "bg-[var(--text)] scale-110" : "bg-[var(--muted)]/30"
                  )}
                />
              ))}
            </div>
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
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[var(--text)]">
                {tr("Tambah Transaksi Ke MyPeribadi", "Add Transaction to MyPeribadi")}
              </h3>
              <button
                type="button"
                onClick={() => setQuickAddTxn(null)}
                className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)]"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-[var(--surface-tint)]/30 p-3.5 text-xs space-y-1">
              <p className="font-bold text-[var(--text)]">{quickAddTxn.description}</p>
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>{quickAddTxn.date}</span>
                <span className="font-black text-sm text-[var(--text)]">RM {quickAddTxn.amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Wallet Dropdown */}
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                {tr("Dompet / Akaun Bank", "Wallet / Bank Account")} <span className="text-rose-500">*</span>
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

      {alertModal}
    </div>
  )
}
