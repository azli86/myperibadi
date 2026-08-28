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
  Smartphone,
  CreditCard,
  Coins,
  ShieldCheck,
  Filter,
  CheckCircle,
  Info,
  SlidersHorizontal,
  X,
  Layers,
  HelpCircle,
  Tag,
  FolderPlus,
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
  card_color?: string
}

type CategoryItem = {
  id: number
  name: string
  type: "expense" | "income"
  color?: string
  icon?: string
}

const CARD_ACCENTS = [
  { key: "indigo", label: "Indigo", color: "#4f46e5", dark: "#3730a3", from: "#6366f1", to: "#3730a3", soft: "#eef2ff" },
  { key: "pink", label: "Pink", color: "#db2777", dark: "#9d174d", from: "#ec4899", to: "#9d174d", soft: "#fdf2f8" },
  { key: "amber", label: "Amber", color: "#d97706", dark: "#92400e", from: "#f59e0b", to: "#92400e", soft: "#fffbeb" },
  { key: "emerald", label: "Emerald", color: "#059669", dark: "#065f46", from: "#10b981", to: "#065f46", soft: "#ecfdf5" },
  { key: "cyan", label: "Cyan", color: "#0891b2", dark: "#155e75", from: "#06b6d4", to: "#155e75", soft: "#ecfeff" },
  { key: "violet", label: "Violet", color: "#7c3aed", dark: "#5b21b6", from: "#8b5cf6", to: "#5b21b6", soft: "#f5f3ff" },
]

function getWalletAccent(wallet?: Pick<WalletItem, "id" | "card_color"> | null) {
  if (wallet?.card_color) {
    const selectedAccent = CARD_ACCENTS.find((accent) => accent.key === wallet.card_color)
    if (selectedAccent) return selectedAccent
  }
  const fallbackIndex = Math.abs(wallet?.id ?? 0) % CARD_ACCENTS.length
  return CARD_ACCENTS[fallbackIndex]
}

function walletTypeIcon(type?: string) {
  const t = String(type || "").toLowerCase()
  if (t === "saving" || t.includes("simpan") || t.includes("tabung")) return Coins
  if (t === "bank" || t === "bank_digital" || t.includes("bank") || t.includes("digital")) return Landmark
  if (t === "ewallet" || t.includes("wallet") || t.includes("tng") || t.includes("touch")) return Smartphone
  if (t === "credit_card" || t.includes("credit") || t.includes("kad")) return CreditCard
  return Wallet
}

function WalletIconBadge({
  wallet,
  size = "md",
  className,
}: {
  wallet?: WalletItem | null
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const type = String(wallet?.type || "").toLowerCase()
  const IconComponent = walletTypeIcon(type)
  const sizeClasses = {
    sm: "h-7 w-7 rounded-lg text-xs",
    md: "h-10 w-10 rounded-xl text-sm",
    lg: "h-12 w-12 rounded-2xl text-base",
  }[size]
  const iconSizes = { sm: 14, md: 18, lg: 22 }[size]

  if (wallet?.image_url) {
    return (
      <div className={cn("relative shrink-0 overflow-hidden border border-[var(--border)] shadow-xs bg-[var(--card)]", sizeClasses, className)}>
        <img
          src={wallet.image_url}
          alt={wallet.label || wallet.name || ""}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div className={cn("flex shrink-0 items-center justify-center bg-[var(--surface-tint)] text-[var(--text)] shadow-xs", sizeClasses, className)}>
      <IconComponent size={iconSizes} strokeWidth={2.2} />
    </div>
  )
}

const SAMPLE_MAYBANK_TEXT = `01/08/2026 DUITNOW TRSF TO ALI BAKI RM 50.00 DR
03/08/2026 SALARY CREDIT JULY 2026 RM 4,500.00 CR
05/08/2026 MCDONALDS MIDVALLEY RM 28.50 DR
08/08/2026 TNB BILL PAYMENT RM 120.00 DR
12/08/2026 PETRONAS GASOLINE RM 70.00 DR
15/08/2026 TOUCH N GO RELOAD RM 100.00 DR
18/08/2026 SHOPEE PAY PURCHASE RM 64.90 DR
20/08/2026 DUITNOW IN FROM AHMAD RM 150.00 CR`

const SUPPORTED_BANKS = [
  { name: "Maybank", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { name: "CIMB Bank", color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  { name: "Bank Islam", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { name: "RHB Bank", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { name: "Public Bank", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  { name: "TNG eWallet", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" },
  { name: "GXBank / Digital", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
]

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

  // Active View Tab & Filters
  const [activeTab, setActiveTab] = useState<"missing_in_app" | "matched" | "missing_in_bank">("missing_in_app")
  const [smartDateMatch, setSmartDateMatch] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income">("all")
  const [walletSearchQuery, setWalletSearchQuery] = useState("")

  // Quick Add State
  const [quickAddTxn, setQuickAddTxn] = useState<BankTransactionRow | null>(null)
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<number | "">("")
  const [quickAddWalletId, setQuickAddWalletId] = useState<number | "">("")
  const [quickAddSaving, setQuickAddSaving] = useState(false)

  // Inline Category mapping for missing transactions (txn.id -> category_id)
  const [inlineCategories, setInlineCategories] = useState<Record<string, number>>({})

  // Batch Selection
  const [selectedMissingIds, setSelectedMissingIds] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchWalletId, setBatchWalletId] = useState<number | "">("")
  const [batchCategoryId, setBatchCategoryId] = useState<number | "">("")

  // Target wallet selection
  const [targetWalletId, setTargetWalletId] = useState<number | "">("")
  const [wizardStep, setWizardStep] = useState<"wallet" | "upload" | "review">("wallet")

  // Scanning animation steps timer
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isProcessing) {
      setScanStep(0)
      interval = setInterval(() => {
        setScanStep((prev) => (prev < 3 ? prev + 1 : prev))
      }, 900)
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
        const list = Array.isArray(wData) ? wData : wData.wallets || []
        setWallets(list)
        if (list.length > 0 && !targetWalletId) {
          setTargetWalletId(list[0].id)
        }
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

  // A statement belongs to the selected wallet.
  const filteredAppTransactions = useMemo(
    () =>
      targetWalletId
        ? appTransactions.filter((tx) => Number(tx.wallet_id) === Number(targetWalletId))
        : [],
    [appTransactions, targetWalletId]
  )

  const selectedWallet = useMemo(
    () => wallets.find((w) => Number(w.id) === Number(targetWalletId)),
    [wallets, targetWalletId]
  )

  // Filtered Wallets for Step 1 search
  const filteredWallets = useMemo(() => {
    if (!walletSearchQuery.trim()) return wallets
    const q = walletSearchQuery.toLowerCase()
    return wallets.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.label && w.label.toLowerCase().includes(q)) ||
        (w.type && w.type.toLowerCase().includes(q))
    )
  }, [wallets, walletSearchQuery])

  // Process File Upload (CSV, TSV, TXT, PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!targetWalletId) {
      showAlert(
        tr("Pilih Bank", "Select Bank"),
        tr("Pilih akaun bank sebelum memuat naik penyata.", "Select the bank account before uploading a statement."),
        "warning"
      )
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
        setWizardStep("review")
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
        setWizardStep("review")
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
      setWizardStep("review")
    } catch (err: any) {
      if (err.message === "PDF_PASSWORD_REQUIRED") {
        setPasswordError(
          tr(
            "Kata laluan salah. Sila semak No. IC 12-digit atau 6-digit Tarikh Lahir anda.",
            "Incorrect password. Please check your 12-digit IC or 6-digit Birthdate."
          )
        )
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
      showAlert(
        tr("Pilih Bank", "Select Bank"),
        tr("Pilih akaun bank sebelum memproses penyata.", "Select the bank account before processing a statement."),
        "warning"
      )
      return
    }
    if (!rawTextContent.trim()) {
      showAlert(
        tr("Perhatian", "Notice"),
        tr("Sila tampal teks penyata bank terlebih dahulu.", "Please paste bank statement text first."),
        "warning"
      )
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
      setWizardStep("review")
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
    if (targetWalletId) {
      setBatchWalletId(targetWalletId)
      setQuickAddWalletId(targetWalletId)
    }
    setWizardStep("review")
  }

  // Compute Reconciliation
  const reconResult: ReconciliationResult = useMemo(() => {
    return reconcileStatements(bankTxns, filteredAppTransactions, {
      maxDateToleranceDays: smartDateMatch ? 2 : 0,
    })
  }, [bankTxns, filteredAppTransactions, smartDateMatch])

  // Filtered Missing in App
  const filteredMissingInApp = useMemo(() => {
    return reconResult.missingInApp.filter((txn) => {
      if (typeFilter !== "all" && txn.type !== typeFilter) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        txn.description.toLowerCase().includes(q) ||
        txn.amount.toString().includes(q) ||
        txn.date.includes(q)
      )
    })
  }, [reconResult.missingInApp, typeFilter, searchQuery])

  // Filtered Matched
  const filteredMatched = useMemo(() => {
    return reconResult.matched.filter((pair) => {
      if (typeFilter !== "all" && pair.bankTxn.type !== typeFilter) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        pair.bankTxn.description.toLowerCase().includes(q) ||
        (pair.appTxn.description && pair.appTxn.description.toLowerCase().includes(q)) ||
        pair.bankTxn.amount.toString().includes(q) ||
        pair.bankTxn.date.includes(q)
      )
    })
  }, [reconResult.matched, typeFilter, searchQuery])

  // Filtered Missing in Bank
  const filteredMissingInBank = useMemo(() => {
    return reconResult.missingInBank.filter((txn) => {
      if (typeFilter !== "all" && txn.type !== typeFilter) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        (txn.description && txn.description.toLowerCase().includes(q)) ||
        txn.amount.toString().includes(q) ||
        txn.date.includes(q) ||
        (txn.category_name && txn.category_name.toLowerCase().includes(q))
      )
    })
  }, [reconResult.missingInBank, typeFilter, searchQuery])

  // Single Add to App
  const handleQuickAdd = async () => {
    if (!quickAddTxn) return
    if (!quickAddWalletId) {
      showAlert(
        tr("Pilih Bank", "Select Bank"),
        tr("Pilih dompet atau akaun bank sebelum menyimpan.", "Select a wallet or bank account before saving."),
        "warning"
      )
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

      showAlert(
        tr("Berjaya Ditambah", "Successfully Added"),
        tr("Transaksi berjaya direkod ke dalam MyPeribadi!", "Transaction successfully recorded into MyPeribadi!"),
        "success"
      )
      setQuickAddTxn(null)
      setQuickAddCategoryId("")
    } catch (err: any) {
      showAlert(
        tr("Ralat", "Error"),
        err.message || tr("Ralat semasa menyimpan transaksi", "Error saving transaction"),
        "error"
      )
    } finally {
      setQuickAddSaving(false)
    }
  }

  // Batch Import Selected Missing Transactions
  const handleBatchImport = () => {
    const toImport = reconResult.missingInApp.filter((t) => selectedMissingIds.has(t.id))
    if (!batchWalletId) {
      showAlert(
        tr("Pilih Bank", "Select Bank"),
        tr("Pilih dompet atau akaun bank untuk transaksi yang akan diimport.", "Select the wallet or bank account for imported transactions."),
        "warning"
      )
      return
    }
    if (toImport.length === 0) {
      showAlert(
        tr("Perhatian", "Notice"),
        tr("Tiada transaksi yang dipilih untuk diimport.", "No transactions selected for import."),
        "warning"
      )
      return
    }

    const totalAmount = toImport.reduce((sum, item) => sum + item.amount, 0)

    showConfirm(
      tr("Sahkan Import Berkelompok", "Confirm Batch Import"),
      tr(
        `Adakah anda pasti ingin mengimport ${toImport.length} transaksi (Jumlah: RM ${totalAmount.toFixed(2)}) ke dalam akaun ${selectedWallet?.label || selectedWallet?.name || "bank terpilih"}?`,
        `Are you sure you want to import ${toImport.length} transactions (Total: RM ${totalAmount.toFixed(2)}) into ${selectedWallet?.label || selectedWallet?.name || "selected bank"}?`
      ),
      async () => {
        setBatchImporting(true)
        const headers = getAuthHeaders()
        let successCount = 0
        const newAdded: AppTransaction[] = []

        for (const item of toImport) {
          try {
            const assignedCatId = inlineCategories[item.id] || (batchCategoryId ? Number(batchCategoryId) : null)
            const payload = {
              type: item.type,
              amount: item.amount,
              vendor_or_source: item.description,
              notes: `Import Penyata: ${item.description}`,
              txn_date: item.date,
              category_id: assignedCatId,
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
                category_id: payload.category_id,
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
          tr("Selesai Mengimport", "Import Completed"),
          tr(
            `${successCount} daripada ${toImport.length} transaksi berjaya diimport ke rekod anda!`,
            `${successCount} of ${toImport.length} transactions successfully imported!`
          ),
          "success"
        )
      },
      "info"
    )
  }

  const scanSteps = [
    tr("Mengesahkan fail penyata & format...", "Verifying statement file & format..."),
    tr("Mengekstrak baris urus niaga PDF / CSV...", "Extracting transaction lines..."),
    tr("Menganalisis amaun debit & kredit...", "Analyzing debit & credit amounts..."),
    tr("Memadankan rekod dengan data MyPeribadi...", "Cross-matching with MyPeribadi records..."),
  ]

  // Reset to Wizard Step 1
  const handleResetWizard = () => {
    setBankTxns([])
    setFileName(null)
    setRawTextContent("")
    setSelectedMissingIds(new Set())
    setWizardStep("wallet")
  }

  // Calculate selected total amount
  const selectedMissingTotal = useMemo(() => {
    return reconResult.missingInApp
      .filter((t) => selectedMissingIds.has(t.id))
      .reduce((sum, t) => sum + t.amount, 0)
  }, [reconResult.missingInApp, selectedMissingIds])

  // Stepper Header
  const renderStepper = () => (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)] shadow-sm">
            <ScanLine size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-[var(--text)] sm:text-xl">
              {tr("Rekonsiliasi Bank", "Bank Reconciliation")}
            </h1>
            <p className="text-xs font-medium text-[var(--muted)]">
              {tr("Padankan penyata rasmi bank dengan rekod perbelanjaan MyPeribadi anda.", "Match your official bank statements with MyPeribadi records.")}
            </p>
          </div>
        </div>

        {/* Steps pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => {
              if (wizardStep !== "wallet") setWizardStep("wallet")
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition",
              wizardStep === "wallet"
                ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                : targetWalletId
                ? "bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint)]/80"
                : "text-[var(--muted)] opacity-60"
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg)]/20 text-[10px]">1</span>
            <span>{tr("Pilih Bank", "Select Bank")}</span>
          </button>

          <ChevronRight size={14} className="text-[var(--muted)]" />

          {/* Step 2 */}
          <button
            type="button"
            onClick={() => {
              if (targetWalletId && wizardStep !== "upload") setWizardStep("upload")
            }}
            disabled={!targetWalletId}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition",
              wizardStep === "upload"
                ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                : bankTxns.length > 0
                ? "bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint)]/80"
                : "text-[var(--muted)] opacity-60"
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg)]/20 text-[10px]">2</span>
            <span>{tr("Muat Naik", "Upload")}</span>
          </button>

          <ChevronRight size={14} className="text-[var(--muted)]" />

          {/* Step 3 */}
          <button
            type="button"
            onClick={() => {
              if (bankTxns.length > 0) setWizardStep("review")
            }}
            disabled={bankTxns.length === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition",
              wizardStep === "review"
                ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                : "text-[var(--muted)] opacity-60"
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg)]/20 text-[10px]">3</span>
            <span>{tr("Semakan", "Review")}</span>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 pb-24 md:space-y-6 md:pb-8">
      {/* ─── Mobile Header ─── */}
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Rekonsiliasi Bank", "Bank Reconciliation")}
          fallbackHref={`/${sessionId}/wallet-settings`}
        />
        <section className="px-1">{renderStepper()}</section>
      </div>

      {/* ─── Desktop Header ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Rekonsiliasi Penyata Bank", "Bank Statement Reconciliation")}
          homeHref={`/${sessionId}`}
        />
        <DesktopPageBody className="space-y-6">
          {renderStepper()}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* ─── STEP 1: Interactive Wallet Selection Card Grid ─── */}
          {/* ═══════════════════════════════════════════════════════ */}
          {wizardStep === "wallet" && (
            <div className="animate-in fade-in-50 duration-300 space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-[var(--text)]">
                    {tr("1. Pilih Akaun Bank atau Dompet", "1. Choose Bank Account or Wallet")}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                    {tr(
                      "Pilih akaun yang ingin diselaraskan dengan penyata kewangan anda.",
                      "Choose which account you want to reconcile against your official statement."
                    )}
                  </p>
                </div>

                {/* Wallet search */}
                {wallets.length > 4 && (
                  <div className="relative w-full sm:w-64">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      type="text"
                      placeholder={tr("Cari akaun...", "Search account...")}
                      value={walletSearchQuery}
                      onChange={(e) => setWalletSearchQuery(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--text)]/40"
                    />
                  </div>
                )}
              </div>

              {/* Account Cards Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredWallets.map((wallet) => {
                  const isSelected = Number(targetWalletId) === Number(wallet.id)
                  const accent = getWalletAccent(wallet)

                  return (
                    <div
                      key={wallet.id}
                      onClick={() => {
                        setTargetWalletId(wallet.id)
                        setBatchWalletId(wallet.id)
                        setQuickAddWalletId(wallet.id)
                      }}
                      style={{
                        background: `linear-gradient(135deg, color-mix(in srgb, ${accent.from} 16%, var(--card)) 0%, color-mix(in srgb, ${accent.to} 8%, var(--card)) 100%)`,
                      }}
                      className={cn(
                        "group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-200 shadow-xs",
                        isSelected
                          ? "border-[var(--text)] shadow-md ring-2 ring-[var(--text)]/25"
                          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-sm"
                      )}
                    >
                      {/* Background watermark image if wallet has image_url */}
                      {wallet.image_url && (
                        <>
                          <img
                            src={wallet.image_url}
                            alt=""
                            className="pointer-events-none absolute -right-5 -top-8 h-[135%] w-[62%] rotate-[9deg] object-cover opacity-20 [mask-image:linear-gradient(to_right,transparent_0%,transparent_8%,black_55%)]"
                          />
                        </>
                      )}

                      <div className="relative flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {/* Wallet Avatar / Icon from wallet-settings */}
                          <WalletIconBadge wallet={wallet} size="lg" />

                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[var(--text)]">
                              {wallet.label || wallet.name}
                            </p>
                            <span className="mt-0.5 inline-block rounded-md bg-[var(--surface-tint)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                              {wallet.type?.toUpperCase() || "BANK"}
                            </span>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                            isSelected
                              ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                              : "border-[var(--border)] text-transparent"
                          )}
                        >
                          <Check size={13} strokeWidth={3} />
                        </div>
                      </div>

                      <div className="relative mt-4 flex items-baseline justify-between border-t border-[var(--border)]/70 pt-3">
                        <span className="text-[0.6875rem] font-bold text-[var(--muted)]">
                          {tr("Baki Semasa", "Current Balance")}
                        </span>
                        <div className="text-right">
                          <MoneyAmount value={wallet.balance || 0} size="sm" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {wallets.length === 0 && !loadingInitial && (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center">
                  <Landmark size={32} className="mx-auto text-[var(--muted)]" />
                  <p className="mt-3 text-sm font-bold text-[var(--text)]">
                    {tr("Tiada akaun bank atau dompet dijumpai.", "No bank accounts or wallets found.")}
                  </p>
                  <Link
                    href={`/${sessionId}/wallet-settings`}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-4 py-2 text-xs font-black text-[var(--bg)]"
                  >
                    <Plus size={14} />
                    <span>{tr("Cipta Akaun Sekarang", "Create Account Now")}</span>
                  </Link>
                </div>
              )}

              {/* Proceed CTA */}
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-5">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
                  {selectedWallet && (
                    <>
                      <WalletIconBadge wallet={selectedWallet} size="sm" />
                      <span>
                        {tr("Dipilih:", "Selected:")}{" "}
                        <strong className="font-bold text-[var(--text)]">
                          {selectedWallet.label || selectedWallet.name}
                        </strong>
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setWizardStep("upload")}
                  disabled={!targetWalletId}
                  className="flex h-11 items-center gap-2 rounded-xl bg-[var(--text)] px-6 text-sm font-black text-[var(--bg)] transition active:scale-98 disabled:opacity-40"
                >
                  <span>{tr("Teruskan ke Muat Naik", "Continue to Upload")}</span>
                  <ArrowRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* ─── STEP 2: Statement Upload & Drag-Drop Zone ─────── */}
          {/* ═══════════════════════════════════════════════════════ */}
          {wizardStep === "upload" && (
            <div className="animate-in fade-in-50 duration-300 space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8">
              {/* Top Bank Header Bar */}
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <WalletIconBadge wallet={selectedWallet} size="lg" />
                  <div>
                    <span className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">
                      {tr("Akaun Bank Dipilih", "Selected Bank Account")}
                    </span>
                    <p className="text-sm font-black text-[var(--text)]">
                      {selectedWallet?.label || selectedWallet?.name || tr("Akaun Bank", "Bank Account")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep("wallet")}
                    className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
                  >
                    <ArrowLeft size={13} strokeWidth={2.5} />
                    <span>{tr("Tukar Akaun", "Change Account")}</span>
                  </button>

                  {/* Mode Selector */}
                  <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setInputMode("file")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition",
                        inputMode === "file"
                          ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                          : "text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      <UploadCloud size={13} />
                      <span>{tr("Muat Naik Fail", "File Upload")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode("paste")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition",
                        inputMode === "paste"
                          ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                          : "text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      <ClipboardPaste size={13} />
                      <span>{tr("Tampal Teks", "Paste Text")}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Mode 1: File Dropzone */}
              {inputMode === "file" ? (
                <div className="space-y-4">
                  <label className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-tint)]/15 p-8 text-center transition-all cursor-pointer hover:border-[var(--text)]/50 hover:bg-[var(--surface-tint)]/30 active:scale-[0.99] sm:p-12">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--text)] text-[var(--bg)] shadow-md transition group-hover:scale-105">
                      <UploadCloud size={30} strokeWidth={2.2} />
                    </div>

                    <p className="mt-4 text-base font-black text-[var(--text)]">
                      {tr("Ketik atau heret penyata bank ke sini", "Tap or drag bank statement file here")}
                    </p>
                    <p className="mt-1 max-w-md text-xs font-medium text-[var(--muted)]">
                      {tr(
                        "Menyokong PDF Penyata Rasmi (termasuk PDF berkunci kata laluan IC/DOB), CSV, TSV atau TXT.",
                        "Supports Official Bank Statement PDFs (including password-encrypted), CSV, TSV or TXT."
                      )}
                    </p>

                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[0.6875rem] font-bold text-[var(--muted)]">
                      <Lock size={12} className="text-emerald-500" />
                      <span>{tr("Selamat & Diproses Secara Terus", "Secure & Directly Processed")}</span>
                    </div>

                    <input
                      type="file"
                      accept=".pdf,.csv,.tsv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Malaysian Banks Tags */}
                  <div className="space-y-2">
                    <p className="text-[0.6875rem] font-black uppercase tracking-wider text-[var(--muted)]">
                      {tr("Format Bank Disokong:", "Supported Bank Formats:")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUPPORTED_BANKS.map((b) => (
                        <span
                          key={b.name}
                          className={cn("rounded-lg border px-2.5 py-1 text-xs font-bold", b.color)}
                        >
                          {b.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Mode 2: Paste Statement Text */
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                      {tr("Tampal Teks Penyata Bank / Salinan Transaksi", "Paste Bank Statement / Transaction Text")}
                    </label>
                    <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)]">
                      <textarea
                        rows={7}
                        value={rawTextContent}
                        onChange={(e) => setRawTextContent(e.target.value)}
                        placeholder={tr(
                          "01/08/2026 DUITNOW TRSF TO ALI BAKI RM 50.00 DR\n03/08/2026 SALARY CREDIT JULY 2026 RM 4,500.00 CR\n05/08/2026 MCDONALDS MIDVALLEY RM 28.50 DR\n08/08/2026 TNB BILL PAYMENT RM 120.00 DR",
                          "01/08/2026 DUITNOW TRSF TO ALI BAKI RM 50.00 DR\n03/08/2026 SALARY CREDIT JULY 2026 RM 4,500.00 CR"
                        )}
                        className="w-full bg-transparent p-4 font-mono text-xs font-medium leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--muted)]/40"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleProcessText}
                    disabled={isProcessing || !rawTextContent.trim()}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-98 disabled:opacity-50"
                  >
                    <Sparkles size={16} />
                    <span>{tr("Proses & Padankan Sekarang", "Process & Match Statement Now")}</span>
                  </button>
                </div>
              )}

              {/* Sample statement button */}
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
                <span className="text-xs font-medium text-[var(--muted)]">
                  {tr("Ingin mencuba fungsi rekonsiliasi tanpa muat naik fail?", "Want to test reconciliation without uploading a file?")}
                </span>

                <button
                  type="button"
                  onClick={loadSample}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1.5 text-xs font-black text-[var(--text)] transition hover:bg-[var(--surface-tint)]/80"
                >
                  <FileSpreadsheet size={14} className="text-amber-500" />
                  <span>{tr("Cuba Contoh Penyata Maybank", "Try Maybank Sample Statement")}</span>
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* ─── STEP 3: Comprehensive Reconciliation Review UI ── */}
          {/* ═══════════════════════════════════════════════════════ */}
          {wizardStep === "review" && (
            <div className="animate-in fade-in-50 duration-300 space-y-6">
              {/* Statement Context Ribbon */}
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-tint)] px-3 py-1.5">
                    <WalletIconBadge wallet={selectedWallet} size="sm" />
                    <span className="text-xs font-black text-[var(--text)]">
                      {selectedWallet?.label || selectedWallet?.name || "Akaun Bank"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-xl bg-[var(--surface-tint)] px-3 py-1.5">
                    <FileCheck2 size={15} className="text-emerald-500" />
                    <span className="max-w-[180px] truncate text-xs font-bold text-[var(--text)]">
                      {fileName || "Penyata Bank"}
                    </span>
                  </div>

                  <span className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
                    {reconResult.summary.totalBankTxns} {tr("transaksi dikesan", "txns detected")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetWizard}
                    className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-black text-[var(--text)] transition hover:bg-[var(--surface-tint)] active:scale-95"
                  >
                    <RefreshCw size={13} />
                    <span>{tr("Penyata Baru", "New Statement")}</span>
                  </button>
                </div>
              </div>

              {/* ─── Hero KPI Analytics Cards ─── */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                {/* Match Rate Card */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-900 p-6 text-white shadow-lg lg:col-span-1">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-xl" />
                  <div className="pointer-events-none absolute -bottom-10 -left-6 h-40 w-40 rounded-full bg-cyan-400/20 blur-2xl" />

                  <div className="relative flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-white/80">
                          {tr("Kadar Padanan", "Match Rate")}
                        </span>
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[0.65rem] font-black text-white">
                          {reconResult.summary.matchedCount}/{reconResult.summary.totalBankTxns}
                        </span>
                      </div>

                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-4xl font-black tracking-tight">
                          {reconResult.summary.matchRatePercent}%
                        </span>
                        <span className="text-xs font-bold text-white/75">{tr("sepadan", "matched")}</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20">
                        <div
                          className="h-full rounded-full bg-white transition-all duration-700"
                          style={{ width: `${Math.min(100, reconResult.summary.matchRatePercent)}%` }}
                        />
                      </div>
                    </div>

                    <p className="mt-4 text-[0.7rem] font-medium text-white/80">
                      {reconResult.summary.matchRatePercent === 100
                        ? tr("Hebat! Semua transaksi bank telah sepadan.", "Great! All bank transactions matched.")
                        : tr(
                            `${reconResult.summary.missingInAppCount} transaksi perlu ditambah ke rekod.`,
                            `${reconResult.summary.missingInAppCount} transactions need to be added.`
                          )}
                    </p>
                  </div>
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
                  {/* Missing In App */}
                  <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                        {tr("Tertinggal Dalam App", "Missing in App")}
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <AlertCircle size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="text-2xl font-black tabular-nums text-[var(--text)]">
                        {reconResult.summary.missingInAppCount}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
                        {tr("Rekod belum dimasukkan", "Unrecorded transactions")}
                      </p>
                    </div>
                  </div>

                  {/* Total Bank Outflow (Debit) */}
                  <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                        {tr("Jumlah Debit (Keluar)", "Total Debit (Outflow)")}
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        <ArrowDownRight size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-rose-500">
                        <MoneyAmount value={reconResult.summary.bankDebitTotal} size="md" />
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
                        {tr("Berdasarkan penyata bank", "From bank statement")}
                      </p>
                    </div>
                  </div>

                  {/* Net Variance */}
                  <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                        {tr("Beza Bersih (Variance)", "Net Variance")}
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Layers size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-[var(--text)]">
                        <MoneyAmount value={Math.abs(reconResult.summary.netVariance)} size="md" />
                      </div>
                      <span
                        className={cn(
                          "mt-1 inline-block rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wider",
                          reconResult.summary.netVariance === 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {reconResult.summary.netVariance === 0
                          ? tr("Seimbang Sempurna", "Perfect Balance")
                          : tr("Terdapat Perbezaan", "Variance Exists")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── Control Bar (Search, Smart Date Match & Filters) ─── */}
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between">
                {/* Search & Type Filter */}
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      type="text"
                      placeholder={tr("Cari keterangan atau amaun...", "Search description or amount...")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--text)]/40"
                    />
                  </div>

                  <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setTypeFilter("all")}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-bold transition",
                        typeFilter === "all" ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]"
                      )}
                    >
                      {tr("Semua", "All")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter("expense")}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-bold transition",
                        typeFilter === "expense" ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]"
                      )}
                    >
                      {tr("Debit (Keluar)", "Debit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter("income")}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-bold transition",
                        typeFilter === "income" ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]"
                      )}
                    >
                      {tr("Kredit (Masuk)", "Credit")}
                    </button>
                  </div>
                </div>

                {/* Smart Date Match Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={smartDateMatch}
                  onClick={() => setSmartDateMatch((v) => !v)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2 text-left transition hover:bg-[var(--surface-tint)]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[var(--text)]">
                      {tr("Padanan Tarikh Pintar (±2 Hari)", "Smart Date Match (±2 Days)")}
                    </p>
                    <p className="text-[0.65rem] font-medium text-[var(--muted)]">
                      {tr("Padankan walaupun tarikh proses bank berbeza", "Match even if clearing date differs")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                      smartDateMatch ? "bg-emerald-500" : "bg-[var(--muted)]/30"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                        smartDateMatch ? "left-[1.125rem]" : "left-0.5"
                      )}
                    />
                  </span>
                </button>
              </div>

              {/* ─── Segmented Tabs ─── */}
              <div className="flex gap-2 border-b border-[var(--border)] pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("missing_in_app")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
                    activeTab === "missing_in_app"
                      ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                      : "text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                  )}
                >
                  <AlertCircle size={15} />
                  <span>{tr("Perlu Ditambah Ke App", "Missing in App")}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.65rem] font-black",
                      activeTab === "missing_in_app"
                        ? "bg-[var(--bg)] text-[var(--text)]"
                        : "bg-[var(--surface-tint)] text-[var(--text)]"
                    )}
                  >
                    {reconResult.summary.missingInAppCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("matched")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
                    activeTab === "matched"
                      ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                      : "text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                  )}
                >
                  <CheckCircle2 size={15} />
                  <span>{tr("Berjaya Dipadankan", "Matched Records")}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.65rem] font-black",
                      activeTab === "matched"
                        ? "bg-[var(--bg)] text-[var(--text)]"
                        : "bg-[var(--surface-tint)] text-[var(--text)]"
                    )}
                  >
                    {reconResult.summary.matchedCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("missing_in_bank")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
                    activeTab === "missing_in_bank"
                      ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                      : "text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                  )}
                >
                  <Clock size={15} />
                  <span>{tr("Hanya Dalam App", "Only in App")}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.65rem] font-black",
                      activeTab === "missing_in_bank"
                        ? "bg-[var(--bg)] text-[var(--text)]"
                        : "bg-[var(--surface-tint)] text-[var(--text)]"
                    )}
                  >
                    {reconResult.summary.missingInBankCount}
                  </span>
                </button>
              </div>

              {/* ═══════════════════════════════════════════════════════ */}
              {/* ─── TAB 1 CONTENT: Missing in App (Batch Import) ─── */}
              {/* ═══════════════════════════════════════════════════════ */}
              {activeTab === "missing_in_app" && (
                <div className="space-y-4">
                  {reconResult.missingInApp.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                        <CheckCheck size={28} />
                      </div>
                      <h3 className="mt-4 text-base font-black text-[var(--text)]">
                        {tr("Semua Transaksi Bank Telah Direkod!", "All Bank Transactions Are Reconciled!")}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                        {tr(
                          "Tiada transaksi bank yang tercicir dalam simpanan rekod MyPeribadi anda.",
                          "No missing bank transactions were found in your MyPeribadi records."
                        )}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Batch Action Toolbar */}
                      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={
                              selectedMissingIds.size === filteredMissingInApp.length &&
                              filteredMissingInApp.length > 0
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMissingIds(new Set(filteredMissingInApp.map((t) => t.id)))
                              } else {
                                setSelectedMissingIds(new Set())
                              }
                            }}
                            className="h-5 w-5 cursor-pointer rounded-md accent-[var(--text)]"
                          />
                          <div>
                            <p className="text-xs font-black text-[var(--text)]">
                              {tr("Pilih Semua Transaksi", "Select All Transactions")} ({filteredMissingInApp.length})
                            </p>
                            <p className="text-[0.6875rem] font-medium text-[var(--muted)]">
                              {selectedMissingIds.size}{" "}
                              {tr("dipilih · Jumlah:", "selected · Total:")}{" "}
                              <strong className="font-bold text-[var(--text)]">
                                RM {selectedMissingTotal.toFixed(2)}
                              </strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Batch category picker */}
                          <select
                            value={batchCategoryId}
                            onChange={(e) => setBatchCategoryId(e.target.value ? Number(e.target.value) : "")}
                            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-bold text-[var(--text)] outline-none"
                          >
                            <option value="">{tr("Set Kategori Keseluruhan...", "Set Overall Category...")}</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name} ({cat.type === "expense" ? "Belanja" : "Pendapatan"})
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={handleBatchImport}
                            disabled={batchImporting || selectedMissingIds.size === 0}
                            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--text)] px-4 text-xs font-black text-[var(--bg)] transition active:scale-95 disabled:opacity-40"
                          >
                            <FolderPlus size={15} />
                            <span>
                              {batchImporting
                                ? tr("Mengimport...", "Importing...")
                                : tr(`Import Terpilih (${selectedMissingIds.size})`, `Import Selected (${selectedMissingIds.size})`)}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Missing List Items */}
                      <div className="space-y-2.5">
                        {filteredMissingInApp.map((txn) => {
                          const isSelected = selectedMissingIds.has(txn.id)
                          const isExp = txn.type === "expense"
                          const currentCatId = inlineCategories[txn.id] || ""

                          return (
                            <div
                              key={txn.id}
                              className={cn(
                                "group flex flex-col gap-3 rounded-2xl border p-4 transition-all duration-150 sm:flex-row sm:items-center sm:justify-between",
                                isSelected
                                  ? "border-[var(--border-strong)] bg-[var(--card)] shadow-xs"
                                  : "border-[var(--border)] bg-[var(--card)]/70 hover:bg-[var(--card)]"
                              )}
                            >
                              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(selectedMissingIds)
                                    if (e.target.checked) next.add(txn.id)
                                    else next.delete(txn.id)
                                    setSelectedMissingIds(next)
                                  }}
                                  className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded-md accent-[var(--text)]"
                                />

                                <div
                                  className={cn(
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold",
                                    isExp
                                      ? "bg-rose-500/10 text-rose-500"
                                      : "bg-emerald-500/10 text-emerald-500"
                                  )}
                                >
                                  {isExp ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold leading-snug text-[var(--text)]">
                                    {txn.description}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.6875rem] font-semibold text-[var(--muted)]">
                                    <span>{txn.date}</span>
                                    <span>·</span>
                                    <span
                                      className={cn(
                                        "rounded-md px-1.5 py-0.5 text-[0.625rem] font-black uppercase",
                                        isExp ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      )}
                                    >
                                      {isExp ? tr("Debit (Keluar)", "Debit") : tr("Kredit (Masuk)", "Credit")}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Right side: Category Dropdown, Amount & Quick Add */}
                              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 sm:border-0 sm:pt-0">
                                {/* Inline category selector */}
                                <select
                                  value={currentCatId}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined
                                    setInlineCategories((prev) => {
                                      const next = { ...prev }
                                      if (val) next[txn.id] = val
                                      else delete next[txn.id]
                                      return next
                                    })
                                  }}
                                  className="h-9 max-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[0.6875rem] font-semibold text-[var(--text)] outline-none"
                                >
                                  <option value="">{tr("Pilih Kategori...", "Pick Category...")}</option>
                                  {categories
                                    .filter((c) => c.type === txn.type)
                                    .map((cat) => (
                                      <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                      </option>
                                    ))}
                                </select>

                                <span
                                  className={cn(
                                    "text-base font-black tabular-nums tracking-tight",
                                    isExp ? "text-rose-500" : "text-emerald-500"
                                  )}
                                >
                                  {isExp ? "-" : "+"}RM {txn.amount.toFixed(2)}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickAddTxn(txn)
                                    if (inlineCategories[txn.id]) {
                                      setQuickAddCategoryId(inlineCategories[txn.id])
                                    }
                                  }}
                                  className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--text)] px-3 text-xs font-black text-[var(--bg)] transition active:scale-95"
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

              {/* ═══════════════════════════════════════════════════════ */}
              {/* ─── TAB 2 CONTENT: Matched Transactions ──────────── */}
              {/* ═══════════════════════════════════════════════════════ */}
              {activeTab === "matched" && (
                <div className="space-y-3">
                  {filteredMatched.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
                      <HelpCircle size={32} className="mx-auto text-[var(--muted)]" />
                      <p className="mt-3 text-sm font-bold text-[var(--text)]">
                        {tr("Tiada transaksi sepadan dijumpai.", "No matched transactions found.")}
                      </p>
                    </div>
                  ) : (
                    filteredMatched.map((pair) => (
                      <div
                        key={pair.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs"
                      >
                        {/* Status bar */}
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-500" />
                            <span className="text-xs font-black uppercase tracking-wider text-emerald-500">
                              {pair.confidence === "exact"
                                ? tr("Padan Tepat", "Exact Match")
                                : tr("Padan Tarikh Pintar", "Smart Date Match")}
                            </span>
                            {pair.dateDiffDays > 0 && (
                              <span className="rounded-md bg-[var(--surface-tint)] px-2 py-0.5 text-[0.625rem] font-bold text-[var(--muted)]">
                                {tr(`Beza ${pair.dateDiffDays} hari`, `${pair.dateDiffDays} days diff`)}
                              </span>
                            )}
                          </div>

                          <span className="text-sm font-black tabular-nums text-[var(--text)]">
                            RM {pair.bankTxn.amount.toFixed(2)}
                          </span>
                        </div>

                        {/* Side by side comparison */}
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {/* Left: Statement */}
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/25 p-3">
                            <span className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">
                              {tr("Rekod Penyata Bank", "Bank Statement Record")}
                            </span>
                            <p className="mt-1 text-xs font-bold text-[var(--text)]">
                              {pair.bankTxn.description}
                            </p>
                            <p className="mt-0.5 text-[0.6875rem] font-medium text-[var(--muted)]">
                              {pair.bankTxn.date} · {pair.bankTxn.type === "expense" ? "Debit" : "Kredit"}
                            </p>
                          </div>

                          {/* Right: App record */}
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/25 p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--muted)]">
                                {tr("Rekod MyPeribadi", "MyPeribadi Record")}
                              </span>
                              <WalletIconBadge wallet={selectedWallet} size="sm" />
                            </div>
                            <p className="mt-1 text-xs font-bold text-[var(--text)]">
                              {pair.appTxn.description || "Transaksi"}
                            </p>
                            <p className="mt-0.5 text-[0.6875rem] font-medium text-[var(--muted)]">
                              {pair.appTxn.date} · {pair.appTxn.category_name || tr("Kategori", "Category")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════ */}
              {/* ─── TAB 3 CONTENT: Missing In Bank (Only In App) ─── */}
              {/* ═══════════════════════════════════════════════════════ */}
              {activeTab === "missing_in_bank" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs font-medium text-[var(--text)]">
                    <p className="font-bold text-blue-600 dark:text-blue-400">
                      ℹ️ {tr("Mengenai Rekod Ini:", "About These Records:")}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">
                      {tr(
                        "Transaksi ini direkodkan dalam MyPeribadi tetapi tidak dijumpai dalam penyata bank yang dimuat naik (mungkin belum diproses bank, dibayar dengan kaedah lain, atau tersalah akaun).",
                        "These transactions exist in MyPeribadi but were not found in this bank statement (could be uncleared cheques, alternate payment methods, or logged to the wrong account)."
                      )}
                    </p>
                  </div>

                  {filteredMissingInBank.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center text-xs font-bold text-[var(--muted)]">
                      {tr("Tiada rekod tergantung dalam sistem MyPeribadi anda.", "No pending records in your MyPeribadi app.")}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredMissingInBank.map((txn) => {
                        const isExp = txn.type === "expense"
                        return (
                          <div
                            key={`app-missing-${txn.id}`}
                            className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={cn(
                                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold",
                                  isExp ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                                )}
                              >
                                {isExp ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-[var(--text)]">
                                  {txn.description || "Transaksi"}
                                </p>
                                <p className="mt-0.5 text-[0.6875rem] font-semibold text-[var(--muted)]">
                                  {txn.date} · {txn.category_name || tr("Tanpa Kategori", "No Category")}
                                </p>
                              </div>
                            </div>

                            <span
                              className={cn(
                                "text-base font-black tabular-nums",
                                isExp ? "text-rose-500" : "text-emerald-500"
                              )}
                            >
                              {isExp ? "-" : "+"}RM {Number(txn.amount || 0).toFixed(2)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DesktopPageBody>
      </div>

      {/* ─── Mobile View Content Container ─── */}
      <div className="space-y-4 px-1 md:hidden">
        {/* Mobile Step 1 */}
        {wizardStep === "wallet" && (
          <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-base font-black text-[var(--text)]">
              {tr("Pilih Akaun Bank / Dompet", "Choose Bank Account / Wallet")}
            </h2>

            <div className="space-y-2">
              {wallets.map((wallet) => {
                const isSelected = Number(targetWalletId) === Number(wallet.id)
                const accent = getWalletAccent(wallet)
                return (
                  <div
                    key={wallet.id}
                    onClick={() => {
                      setTargetWalletId(wallet.id)
                      setBatchWalletId(wallet.id)
                      setQuickAddWalletId(wallet.id)
                    }}
                    style={{
                      background: `linear-gradient(135deg, color-mix(in srgb, ${accent.from} 14%, var(--card)) 0%, color-mix(in srgb, ${accent.to} 6%, var(--card)) 100%)`,
                    }}
                    className={cn(
                      "relative flex items-center justify-between overflow-hidden rounded-xl border p-3 transition",
                      isSelected
                        ? "border-[var(--text)] shadow-xs ring-2 ring-[var(--text)]/20"
                        : "border-[var(--border)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <WalletIconBadge wallet={wallet} size="md" />
                      <div>
                        <p className="text-xs font-black text-[var(--text)]">{wallet.label || wallet.name}</p>
                        <span className="text-[0.625rem] font-bold text-[var(--muted)]">
                          {wallet.type?.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <MoneyAmount value={wallet.balance || 0} size="xs" />
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setWizardStep("upload")}
              disabled={!targetWalletId}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] text-xs font-black text-[var(--bg)]"
            >
              <span>{tr("Teruskan ke Muat Naik", "Continue to Upload")}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* Mobile Step 2 */}
        {wizardStep === "upload" && (
          <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setWizardStep("wallet")}
                className="flex items-center gap-1 text-xs font-bold text-[var(--muted)]"
              >
                <ArrowLeft size={14} />
                <span>{tr("Kembali", "Back")}</span>
              </button>
              <div className="flex items-center gap-2">
                <WalletIconBadge wallet={selectedWallet} size="sm" />
                <span className="text-xs font-black text-[var(--text)]">{selectedWallet?.label || selectedWallet?.name}</span>
              </div>
            </div>

            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-tint)]/15 p-6 text-center">
              <UploadCloud size={32} className="text-[var(--text)]" />
              <p className="mt-3 text-sm font-black text-[var(--text)]">{tr("Pilih Penyata Bank", "Choose Statement")}</p>
              <p className="mt-1 text-[0.6875rem] text-[var(--muted)]">PDF (termasuk berkunci), CSV, TXT</p>
              <input type="file" accept=".pdf,.csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>

            <button
              type="button"
              onClick={loadSample}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] text-xs font-black text-[var(--text)]"
            >
              <FileSpreadsheet size={14} />
              <span>{tr("Cuba Contoh Penyata Maybank", "Try Maybank Sample")}</span>
            </button>
          </div>
        )}

        {/* Mobile Step 3: Review */}
        {wizardStep === "review" && (
          <div className="space-y-4">
            {/* Mobile Summary Card */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 p-5 text-white shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-white/80">
                  {tr("Kadar Padanan", "Match Rate")}
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-black">
                  {reconResult.summary.matchedCount}/{reconResult.summary.totalBankTxns}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-black">{reconResult.summary.matchRatePercent}%</span>
                <span className="text-xs font-bold text-white/70">{tr("padan", "matched")}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/20 pt-3">
                <div>
                  <span className="text-[0.625rem] text-white/70">{tr("Tertinggal", "Missing")}</span>
                  <p className="text-base font-black">{reconResult.summary.missingInAppCount}</p>
                </div>
                <div>
                  <span className="text-[0.625rem] text-white/70">{tr("Jumlah Debit", "Debit")}</span>
                  <p className="text-sm font-black truncate">RM {reconResult.summary.bankDebitTotal.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Mobile Tab Pills */}
            <div className="flex rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
              <button
                type="button"
                onClick={() => setActiveTab("missing_in_app")}
                className={cn(
                  "flex-1 rounded-lg py-2 text-center text-[0.6875rem] font-black uppercase",
                  activeTab === "missing_in_app" ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]"
                )}
              >
                {tr("Tertinggal", "Missing")} ({reconResult.summary.missingInAppCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("matched")}
                className={cn(
                  "flex-1 rounded-lg py-2 text-center text-[0.6875rem] font-black uppercase",
                  activeTab === "matched" ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]"
                )}
              >
                {tr("Padan", "Matched")} ({reconResult.summary.matchedCount})
              </button>
            </div>

            {/* Tab 1 Mobile List */}
            {activeTab === "missing_in_app" && (
              <div className="space-y-3">
                {selectedMissingIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchImport}
                    disabled={batchImporting}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] text-xs font-black text-[var(--bg)]"
                  >
                    <FolderPlus size={15} />
                    <span>{tr(`Import Semua Dipilih (${selectedMissingIds.size})`, `Import Selected (${selectedMissingIds.size})`)}</span>
                  </button>
                )}

                {reconResult.missingInApp.map((txn) => {
                  const isSelected = selectedMissingIds.has(txn.id)
                  const isExp = txn.type === "expense"
                  return (
                    <div
                      key={txn.id}
                      className={cn(
                        "rounded-xl border p-3.5",
                        isSelected ? "border-[var(--border-strong)] bg-[var(--card)]" : "border-[var(--border)] bg-[var(--card)]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(selectedMissingIds)
                            if (e.target.checked) next.add(txn.id)
                            else next.delete(txn.id)
                            setSelectedMissingIds(next)
                          }}
                          className="mt-0.5 h-5 w-5 rounded-md accent-[var(--text)]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-tight text-[var(--text)]">{txn.description}</p>
                          <p className="mt-0.5 text-[0.625rem] text-[var(--muted)]">{txn.date}</p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border)] pt-2">
                        <span className={cn("text-sm font-black", isExp ? "text-rose-500" : "text-emerald-500")}>
                          {isExp ? "-" : "+"}RM {txn.amount.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuickAddTxn(txn)}
                          className="flex h-8 items-center gap-1 rounded-lg bg-[var(--text)] px-3 text-xs font-black text-[var(--bg)]"
                        >
                          <Plus size={12} />
                          <span>{tr("Tambah", "Add")}</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Tab 2 Mobile Matched */}
            {activeTab === "matched" && (
              <div className="space-y-2.5">
                {reconResult.matched.map((pair) => (
                  <div key={pair.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-[0.6875rem] font-black uppercase text-emerald-500">
                        {pair.confidence === "exact" ? tr("Padan Tepat", "Exact") : tr("Padan Pintar", "Smart")}
                      </span>
                      <span className="text-xs font-black text-[var(--text)]">RM {pair.bankTxn.amount.toFixed(2)}</span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-[var(--text)]">{pair.bankTxn.description}</p>
                    <p className="mt-0.5 text-[0.625rem] text-[var(--muted)]">{pair.bankTxn.date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)] shadow-xs">
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
                    placeholder={tr("cth: No. IC 12-digit / Tarikh Lahir 6-digit", "e.g. 12-digit IC / 6-digit DOB")}
                    style={
                      {
                        WebkitTextSecurity: showPasswordText ? "none" : "disc",
                      } as React.CSSProperties
                    }
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-10 pr-10 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50 focus:border-[var(--text)]/40"
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

              <div className="rounded-xl bg-[var(--surface-tint)]/30 p-3.5 text-[0.6875rem] font-medium text-[var(--muted)] space-y-1 border border-[var(--border)]">
                <p className="font-bold text-[var(--text)]">💡 {tr("Petua kata laluan bank Malaysia:", "Malaysia bank password tips:")}</p>
                <p>• Maybank, RHB, Bank Islam, Hong Leong: <strong>No. IC 12-digit</strong> (cth: 901231015432)</p>
                <p>• CIMB Bank: <strong>Tarikh Lahir 6-digit DDMMYY</strong> (cth: 311290)</p>
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

      {/* ─── Statement Scanner Loading Overlay ─── */}
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
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
                  <Plus size={18} strokeWidth={2.5} />
                </div>
                <h3 className="text-base font-black text-[var(--text)]">
                  {tr("Tambah Transaksi Ke MyPeribadi", "Add Transaction to MyPeribadi")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickAddTxn(null)}
                className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)]"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-[var(--surface-tint)]/30 p-3.5 text-xs space-y-1 border border-[var(--border)]">
              <p className="font-bold text-[var(--text)]">{quickAddTxn.description}</p>
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>{quickAddTxn.date}</span>
                <span className="font-black text-sm text-[var(--text)]">
                  RM {quickAddTxn.amount.toFixed(2)}
                </span>
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

            <div className="flex gap-2.5 pt-2">
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
