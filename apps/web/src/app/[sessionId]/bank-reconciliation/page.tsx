"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ClipboardPaste,
  Coins,
  CreditCard,
  EyeOff,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FolderPlus,
  KeyRound,
  Landmark,
  Link2Off,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Smartphone,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  Wallet,
} from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import { BankTransactionRow, parseCsvStatement, parseTextStatement } from "@/lib/bank-statement-parser"
import { AppTransaction, ReconciliationResult, pairKey, reconcileStatements } from "@/lib/reconciliation-matcher"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero, ModenHeroIconButton, heroPrimaryButtonStyle, heroQuietButtonStyle } from "@/components/ui/ModenHero"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

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
}

type Step = "wallet" | "upload" | "review"
type Tab = "missing_in_app" | "matched" | "missing_in_bank"

const MAX_FILE_BYTES = 25 * 1024 * 1024

/** TNG moves money between its own pockets by itself: the eWallet and GO+ ("GO+ Cash In",
 *  "via GO+ eWallet") and "eWallet Cash Out". These are internal transfers, not spending or
 *  income, and are not in the user's records. GO+ daily earnings are real income and are
 *  not matched here. */
const GO_PLUS_TRANSFER = /go\s*\+\s*cash\s*(in|out)|via\s+go\s*\+|go\s*\+\s*(wallet|ewallet)\s*(top[- ]?up|transfer)|e-?\s?wallet\s*cash\s*(in|out)/i

const SAMPLE_MAYBANK_TEXT = `01/08/2026 DUITNOW TRSF TO ALI BAKI RM 50.00 DR
03/08/2026 SALARY CREDIT JULY 2026 RM 4,500.00 CR
05/08/2026 MCDONALDS MIDVALLEY RM 28.50 DR
08/08/2026 TNB BILL PAYMENT RM 120.00 DR
12/08/2026 PETRONAS GASOLINE RM 70.00 DR
15/08/2026 TOUCH N GO RELOAD RM 100.00 DR
18/08/2026 SHOPEE PAY PURCHASE RM 64.90 DR
20/08/2026 DUITNOW IN FROM AHMAD RM 150.00 CR`

const SUPPORTED_BANKS = ["Maybank", "CIMB Bank", "Bank Islam", "RHB Bank", "Public Bank", "TNG eWallet", "GXBank / Digital"]

function walletTypeIcon(type?: string) {
  const t = String(type || "").toLowerCase()
  if (t === "saving" || t.includes("simpan") || t.includes("tabung")) return Coins
  if (t.includes("bank") || t.includes("digital")) return Landmark
  if (t === "ewallet" || t.includes("wallet") || t.includes("tng") || t.includes("touch")) return Smartphone
  if (t.includes("credit") || t.includes("kad")) return CreditCard
  return Wallet
}

function WalletBadge({ wallet, size = 40 }: { wallet?: WalletItem | null; size?: number }) {
  const Icon = walletTypeIcon(wallet?.type)
  if (wallet?.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={wallet.image_url}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-[var(--border)] object-cover"
      />
    )
  }
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
      <Icon size={Math.round(size * 0.46)} strokeWidth={2.1} />
    </span>
  )
}

const fmt = (n: number) => Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** YYYY-MM-DD shifted by a number of days, without time-zone drift. */
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

export default function BankReconciliationPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  // Accounts and categories
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [walletSearch, setWalletSearch] = useState("")
  const [targetWalletId, setTargetWalletId] = useState<number | "">("")
  const [step, setStep] = useState<Step>("wallet")

  // The statement
  const [inputMode, setInputMode] = useState<"file" | "paste">("file")
  const [rawText, setRawText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [bankTxns, setBankTxns] = useState<BankTransactionRow[]>([])
  const [skippedRows, setSkippedRows] = useState(0)
  const [isSample, setIsSample] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanStep, setScanStep] = useState(0)

  // Password-protected PDF
  const [pendingPdf, setPendingPdf] = useState<File | null>(null)
  const [pdfPassword, setPdfPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)

  // What the app has for the statement's period
  const [appTransactions, setAppTransactions] = useState<AppTransaction[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)
  const [txnsError, setTxnsError] = useState(false)

  // Review
  const [tab, setTab] = useState<Tab>("missing_in_app")
  const [smartDateMatch, setSmartDateMatch] = useState(true)
  const [ignoreGoPlus, setIgnoreGoPlus] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income">("all")
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set())
  const [forbiddenPairs, setForbiddenPairs] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionReady, setSelectionReady] = useState(false)
  const [inlineCategories, setInlineCategories] = useState<Record<string, number>>({})
  const [batchCategoryId, setBatchCategoryId] = useState<number | "">("")
  const [importing, setImporting] = useState(false)

  // Add one transaction
  const [quickAdd, setQuickAdd] = useState<BankTransactionRow | null>(null)
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<number | "">("")
  const [quickAddSaving, setQuickAddSaving] = useState(false)

  useEffect(() => {
    if (!isProcessing) return
    setScanStep(0)
    const timer = setInterval(() => setScanStep((prev) => (prev < 3 ? prev + 1 : prev)), 900)
    return () => clearInterval(timer)
  }, [isProcessing])

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken()
    return token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  // ── Loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const headers = authHeaders()
        const [walletsRes, catsRes] = await Promise.allSettled([
          fetch("/api/wallets", { credentials: "include", headers, cache: "no-store" }),
          fetch("/api/categories", { credentials: "include", headers, cache: "no-store" }),
        ])
        if (cancelled) return
        if (walletsRes.status === "fulfilled" && walletsRes.value.ok) {
          const data = await walletsRes.value.json()
          const list: WalletItem[] = Array.isArray(data) ? data : data.wallets || []
          setWallets(list)
          setTargetWalletId((current) => current || list[0]?.id || "")
        }
        if (catsRes.status === "fulfilled" && catsRes.value.ok) {
          const data = await catsRes.value.json()
          setCategories(Array.isArray(data) ? data : data.categories || [])
        }
      } catch (err) {
        console.error("Failed to load wallets and categories", err)
      } finally {
        if (!cancelled) setLoadingInitial(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [authHeaders])

  /** The app's own records for the statement's period. Asking only for that window keeps
   *  an old statement from being compared against a capped list of recent transactions. */
  const loadAppTransactions = useCallback(
    async (rows: BankTransactionRow[]) => {
      if (rows.length === 0) return
      const dates = rows.map((r) => r.date).sort()
      const start = shiftDate(dates[0], -10)
      const end = shiftDate(dates[dates.length - 1], 10)
      setLoadingTxns(true)
      setTxnsError(false)
      try {
        const res = await fetch(`/api/transactions?start_date=${start}&end_date=${end}&limit=5000`, {
          credentials: "include",
          headers: authHeaders(),
          cache: "no-store",
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        const list = Array.isArray(data) ? data : data.transactions || []
        setAppTransactions(
          list.map((t: any) => ({
            id: t.id,
            amount: Number(t.amount || 0),
            type: t.type,
            date: String(t.date || t.txn_date || "").slice(0, 10),
            description: t.vendor_or_source || t.description || "",
            notes: t.notes || "",
            category_name: t.category_name,
            category_id: t.category_id,
            wallet_id: t.wallet_id,
            wallet_name: t.wallet_name,
            is_wallet_transfer: Boolean(t.is_wallet_transfer),
            is_debt_movement: Boolean(t.is_debt_movement),
          }))
        )
      } catch {
        // Matching against nothing would call every bank line "missing in app", so say so instead.
        setTxnsError(true)
        setAppTransactions([])
      } finally {
        setLoadingTxns(false)
      }
    },
    [authHeaders]
  )

  // ── Reading the statement ───────────────────────────────────────────────

  const readError = (detail?: string) => detail || tr("Gagal membaca penyata.", "Failed to read the statement.")

  const parseWithAi = async (text: string): Promise<{ rows: BankTransactionRow[]; skipped: number }> => {
    const response = await fetch("/api/bank-reconciliation/parse", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ text, page_images: [] }),
    })
    if (!response.ok) {
      const fallback = parseTextStatement(text)
      if (fallback.transactions.length) return { rows: fallback.transactions, skipped: fallback.skipped || 0 }
      throw new Error(readError((await response.json().catch(() => null))?.detail))
    }
    const data = await response.json()
    return { rows: Array.isArray(data.transactions) ? (data.transactions as BankTransactionRow[]) : [], skipped: 0 }
  }

  const parsePdf = async (file: File, password?: string): Promise<BankTransactionRow[]> => {
    const form = new FormData()
    form.append("file", file)
    if (password) form.append("password", password)
    const response = await fetch("/api/bank-reconciliation/parse", {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    })
    if (response.status === 401 && (await response.clone().json().catch(() => null))?.detail === "PDF_PASSWORD_REQUIRED") {
      throw new Error("PDF_PASSWORD_REQUIRED")
    }
    if (!response.ok) throw new Error(readError((await response.json().catch(() => null))?.detail))
    const data = await response.json()
    return Array.isArray(data.transactions) ? (data.transactions as BankTransactionRow[]) : []
  }

  /** A statement was read: show it against what the app has. */
  const openStatement = async (rows: BankTransactionRow[], name: string, opts: { sample?: boolean; skipped?: number } = {}) => {
    if (rows.length === 0) {
      showAlert(
        tr("Tiada transaksi dijumpai", "No transactions found"),
        tr("Tiada baris transaksi yang boleh dibaca dalam penyata ini.", "No readable transaction rows were found in this statement."),
        "warning"
      )
      return
    }
    setBankTxns(rows)
    setFileName(name)
    setIsSample(Boolean(opts.sample))
    setSkippedRows(opts.skipped || 0)
    setIgnoredIds(new Set())
    setForbiddenPairs(new Set())
    setSelectedIds(new Set())
    setSelectionReady(false)
    setInlineCategories({})
    setTab("missing_in_app")
    setSearch("")
    setTypeFilter("all")
    setStep("review")
    await loadAppTransactions(rows)
  }

  const requireWallet = () => {
    if (targetWalletId) return true
    showAlert(tr("Pilih akaun", "Select an account"), tr("Pilih akaun bank sebelum memuat naik penyata.", "Select the bank account before uploading a statement."), "warning")
    return false
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    // Clear the input so the same file can be chosen again after "New statement".
    input.value = ""
    if (!file || !requireWallet()) return
    if (file.size > MAX_FILE_BYTES) {
      showAlert(tr("Fail terlalu besar", "File too large"), tr("Had fail ialah 25 MB.", "The file limit is 25 MB."), "warning")
      return
    }
    const lowered = file.name.toLowerCase()
    if (!/\.(pdf|csv|tsv|txt)$/.test(lowered)) {
      showAlert(tr("Jenis fail tidak disokong", "Unsupported file type"), tr("Gunakan PDF, CSV, TSV atau TXT.", "Use a PDF, CSV, TSV or TXT file."), "warning")
      return
    }

    setIsProcessing(true)
    try {
      if (lowered.endsWith(".pdf")) {
        try {
          await openStatement(await parsePdf(file), file.name)
        } catch (err: any) {
          if (err.message === "PDF_PASSWORD_REQUIRED") {
            setPendingPdf(file)
            setPdfPassword("")
            setPasswordError(null)
          } else {
            showAlert(tr("Ralat membaca penyata", "Statement reading error"), err.message, "error")
          }
        }
        return
      }
      const content = await file.text()
      if (/\.(csv|tsv)$/.test(lowered)) {
        // A table is read by rules, not sent to an AI: it is exact, free and private.
        const local = parseCsvStatement(content)
        if (local.transactions.length > 0) {
          await openStatement(local.transactions, file.name, { skipped: local.skipped })
          return
        }
      }
      const ai = await parseWithAi(content)
      await openStatement(ai.rows, file.name, { skipped: ai.skipped })
    } catch (err: any) {
      showAlert(tr("Ralat membaca penyata", "Statement reading error"), err.message, "error")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUnlock = async () => {
    if (!pendingPdf) return
    if (!pdfPassword.trim()) {
      setPasswordError(tr("Masukkan kata laluan PDF.", "Enter the PDF password."))
      return
    }
    setUnlocking(true)
    setPasswordError(null)
    try {
      const rows = await parsePdf(pendingPdf, pdfPassword.trim())
      const name = pendingPdf.name
      setPendingPdf(null)
      setPdfPassword("")
      setIsProcessing(true)
      await openStatement(rows, name)
    } catch (err: any) {
      setPasswordError(
        err.message === "PDF_PASSWORD_REQUIRED"
          ? tr("Kata laluan salah. Semak No. IC 12 digit atau 6 digit tarikh lahir anda.", "Incorrect password. Check your 12-digit IC or 6-digit birth date.")
          : err.message || tr("Ralat semasa membuka PDF.", "Error opening the PDF.")
      )
    } finally {
      setUnlocking(false)
      setIsProcessing(false)
    }
  }

  const handlePaste = async () => {
    if (!requireWallet()) return
    if (!rawText.trim()) {
      showAlert(tr("Perhatian", "Notice"), tr("Tampal teks penyata bank dahulu.", "Paste the bank statement text first."), "warning")
      return
    }
    setIsProcessing(true)
    try {
      const ai = await parseWithAi(rawText)
      await openStatement(ai.rows, tr("Teks penyata bank", "Pasted statement"), { skipped: ai.skipped })
    } catch (err: any) {
      showAlert(tr("Ralat membaca penyata", "Statement reading error"), err.message, "error")
    } finally {
      setIsProcessing(false)
    }
  }

  const loadSample = () => {
    if (!requireWallet()) return
    const result = parseTextStatement(SAMPLE_MAYBANK_TEXT)
    void openStatement(result.transactions, tr("Contoh penyata Maybank", "Maybank sample statement"), { sample: true })
  }

  // ── Matching ────────────────────────────────────────────────────────────

  const selectedWallet = useMemo(() => wallets.find((w) => Number(w.id) === Number(targetWalletId)), [wallets, targetWalletId])

  // A statement belongs to one account.
  const walletTransactions = useMemo(
    () => (targetWalletId ? appTransactions.filter((tx) => Number(tx.wallet_id) === Number(targetWalletId)) : []),
    [appTransactions, targetWalletId]
  )
  const goPlusCount = useMemo(() => bankTxns.filter((t) => GO_PLUS_TRANSFER.test(t.description)).length, [bankTxns])
  const activeBankTxns = useMemo(
    () => bankTxns.filter((t) => !ignoredIds.has(t.id) && !(ignoreGoPlus && GO_PLUS_TRANSFER.test(t.description))),
    [bankTxns, ignoredIds, ignoreGoPlus]
  )

  const recon: ReconciliationResult = useMemo(
    () => reconcileStatements(activeBankTxns, walletTransactions, { maxDateToleranceDays: smartDateMatch ? 2 : 0, forbiddenPairs }),
    [activeBankTxns, walletTransactions, smartDateMatch, forbiddenPairs]
  )

  // Once the app's records are in, every line that is missing starts ticked.
  useEffect(() => {
    if (step !== "review" || loadingTxns || txnsError || selectionReady) return
    setSelectedIds(new Set(recon.missingInApp.map((t) => t.id)))
    setSelectionReady(true)
  }, [step, loadingTxns, txnsError, selectionReady, recon.missingInApp])

  const matchesQuery = (...parts: Array<string | number | undefined | null>) => {
    const q = search.trim().toLowerCase()
    return !q || parts.some((p) => String(p ?? "").toLowerCase().includes(q))
  }

  const missingInApp = useMemo(
    () => recon.missingInApp.filter((t) => (typeFilter === "all" || t.type === typeFilter) && matchesQuery(t.description, t.amount, t.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recon.missingInApp, typeFilter, search]
  )
  const matched = useMemo(
    () =>
      recon.matched.filter(
        (p) => (typeFilter === "all" || p.bankTxn.type === typeFilter) && matchesQuery(p.bankTxn.description, p.appTxn.description, p.appTxn.notes, p.bankTxn.amount, p.bankTxn.date)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recon.matched, typeFilter, search]
  )
  const missingInBank = useMemo(
    () => recon.missingInBank.filter((t) => (typeFilter === "all" || t.type === typeFilter) && matchesQuery(t.description, t.notes, t.amount, t.date, t.category_name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recon.missingInBank, typeFilter, search]
  )

  // Why a bank line found no partner: the record is there, but somewhere the match
  // does not look. Naming it is what lets the user fix the record instead of importing
  // a second copy.
  const matchedAppIds = useMemo(() => new Set(recon.matched.map((p) => String(p.appTxn.id))), [recon.matched])
  const walletNames = useMemo(() => new Map(wallets.map((w) => [Number(w.id), w.label || w.name])), [wallets])

  type Hint = { kind: "other_wallet" | "taken" | "near_amount" | "far_date"; txn: AppTransaction }
  const hintsFor = (bank: BankTransactionRow): Hint[] => {
    const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
    const found: Hint[] = []
    for (const t of appTransactions) {
      const sameWallet = Number(t.wallet_id) === Number(targetWalletId)
      const diff = Math.abs(Math.abs(Number(t.amount)) - bank.amount)
      const apart = days(t.date, bank.date)
      if (Number.isNaN(apart)) continue
      const sameDirection = String(t.type) === bank.type
      if (!sameWallet && diff < 0.01 && apart <= 3) found.push({ kind: "other_wallet", txn: t })
      else if (sameWallet && diff < 0.01 && matchedAppIds.has(String(t.id)) && apart <= 3) found.push({ kind: "taken", txn: t })
      else if (sameWallet && sameDirection && diff >= 0.01 && diff <= Math.max(1, bank.amount * 0.02) && apart <= 3 && !matchedAppIds.has(String(t.id))) found.push({ kind: "near_amount", txn: t })
      else if (sameWallet && sameDirection && diff < 0.01 && apart > 3 && apart <= 14 && !matchedAppIds.has(String(t.id))) found.push({ kind: "far_date", txn: t })
    }
    const order = { other_wallet: 0, near_amount: 1, far_date: 2, taken: 3 } as const
    return found.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 2)
  }

  const hintText = (h: Hint, bank: BankTransactionRow) => {
    const amount = `RM ${fmt(Math.abs(Number(h.txn.amount)))}`
    const when = h.txn.date
    switch (h.kind) {
      case "other_wallet":
        return tr(
          `Ada rekod ${amount} pada ${when} di dompet ${h.txn.wallet_name || walletNames.get(Number(h.txn.wallet_id)) || "lain"}, bukan akaun ini. Betulkan dompetnya, atau pilih akaun yang betul.`,
          `A ${amount} record on ${when} is in ${h.txn.wallet_name || walletNames.get(Number(h.txn.wallet_id)) || "another wallet"}, not this account. Fix its wallet, or choose the right account.`
        )
      case "near_amount":
        return tr(
          `Rekod hampir sama: ${amount} pada ${when} (beza RM ${fmt(Math.abs(Math.abs(Number(h.txn.amount)) - bank.amount))}, mungkin yuran). Betulkan jumlahnya supaya sepadan.`,
          `A close record: ${amount} on ${when} (RM ${fmt(Math.abs(Math.abs(Number(h.txn.amount)) - bank.amount))} apart, maybe a fee). Fix its amount to match.`
        )
      case "far_date":
        return tr(
          `Ada rekod ${amount} pada ${when}, lebih 3 hari daripada tarikh bank. Betulkan tarikhnya.`,
          `A ${amount} record on ${when} is more than 3 days from the bank date. Fix its date.`
        )
      default:
        return tr(
          `Rekod ${amount} pada ${when} sudah dipadankan dengan baris bank lain. Jika ini transaksi kedua, tambahkan.`,
          `The ${amount} record on ${when} is already matched to another bank line. If this is a second transaction, add it.`
        )
    }
  }

  // Only what is still missing counts as selected: the set also holds lines that have
  // since matched or been ignored, which inflated the count and the total.
  const selectedMissing = useMemo(() => recon.missingInApp.filter((t) => selectedIds.has(t.id)), [recon.missingInApp, selectedIds])
  const selectedTotal = selectedMissing.reduce((sum, t) => sum + t.amount, 0)
  const visibleSelected = missingInApp.filter((t) => selectedIds.has(t.id)).length
  const allVisibleSelected = missingInApp.length > 0 && visibleSelected === missingInApp.length

  const statementRange = useMemo(() => {
    const dates = bankTxns.map((t) => t.date).sort()
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null
  }, [bankTxns])

  // ── Actions ─────────────────────────────────────────────────────────────

  const toggleSelected = (id: string, on: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const ignoreLine = (id: string) => {
    setIgnoredIds((prev) => new Set(prev).add(id))
    toggleSelected(id, false)
  }

  const unmatch = (bankId: string, appId: string | number) =>
    setForbiddenPairs((prev) => new Set(prev).add(pairKey(bankId, appId)))

  const buildPayload = (txn: BankTransactionRow, categoryId: number | null, note: string) => ({
    type: txn.type,
    amount: txn.amount,
    vendor_or_source: txn.description,
    notes: `${note}: ${txn.description}`,
    txn_date: txn.date,
    category_id: categoryId,
    wallet_id: Number(targetWalletId),
  })

  const postTransaction = async (payload: ReturnType<typeof buildPayload>) => {
    const res = await fetch("/api/transactions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const detail = (await res.json().catch(() => null))?.detail
      throw new Error(typeof detail === "string" ? detail : tr("Gagal menambah transaksi", "Could not add the transaction"))
    }
    return res.json()
  }

  const rememberCreated = (created: any, txn: BankTransactionRow, payload: ReturnType<typeof buildPayload>) =>
    setAppTransactions((prev) => [
      {
        id: created?.id ?? `imported-${txn.id}-${Date.now()}`,
        amount: txn.amount,
        type: txn.type,
        date: txn.date,
        description: txn.description,
        notes: payload.notes,
        category_id: payload.category_id,
        wallet_id: payload.wallet_id,
      },
      ...prev,
    ])

  const saveQuickAdd = async () => {
    if (!quickAdd || quickAddSaving) return
    setQuickAddSaving(true)
    try {
      const payload = buildPayload(quickAdd, quickAddCategoryId ? Number(quickAddCategoryId) : null, "Rekonsiliasi Bank")
      rememberCreated(await postTransaction(payload), quickAdd, payload)
      toggleSelected(quickAdd.id, false)
      setQuickAdd(null)
      setQuickAddCategoryId("")
    } catch (err: any) {
      showAlert(tr("Ralat", "Error"), err.message, "error")
    } finally {
      setQuickAddSaving(false)
    }
  }

  const importSelected = () => {
    if (importing || isSample) return
    if (selectedMissing.length === 0) {
      showAlert(tr("Perhatian", "Notice"), tr("Tiada transaksi dipilih untuk diimport.", "No transactions are selected to import."), "warning")
      return
    }
    const batch = [...selectedMissing]
    const label = selectedWallet?.label || selectedWallet?.name || tr("akaun terpilih", "the selected account")
    showConfirm(
      tr("Sahkan import", "Confirm import"),
      tr(
        `Import ${batch.length} transaksi (jumlah RM ${fmt(batch.reduce((s, t) => s + t.amount, 0))}) ke ${label}?`,
        `Import ${batch.length} transactions (total RM ${fmt(batch.reduce((s, t) => s + t.amount, 0))}) into ${label}?`
      ),
      async () => {
        setImporting(true)
        const failed: string[] = []
        for (const item of batch) {
          try {
            const categoryId = inlineCategories[item.id] || (batchCategoryId ? Number(batchCategoryId) : null)
            const payload = buildPayload(item, categoryId, "Import Penyata")
            rememberCreated(await postTransaction(payload), item, payload)
            toggleSelected(item.id, false)
          } catch {
            failed.push(item.id)
          }
        }
        setImporting(false)
        const done = batch.length - failed.length
        showAlert(
          failed.length ? tr("Import separa", "Partly imported") : tr("Import selesai", "Import complete"),
          failed.length
            ? tr(`${done} daripada ${batch.length} berjaya. ${failed.length} gagal dan masih ditanda supaya boleh dicuba lagi.`, `${done} of ${batch.length} imported. ${failed.length} failed and stay ticked so you can try again.`)
            : tr(`${done} transaksi berjaya diimport.`, `${done} transactions imported.`),
          failed.length ? "warning" : "success"
        )
      },
      "info"
    )
  }

  const resetAll = () => {
    setBankTxns([])
    setFileName(null)
    setRawText("")
    setAppTransactions([])
    setTxnsError(false)
    setIgnoredIds(new Set())
    setForbiddenPairs(new Set())
    setSelectedIds(new Set())
    setSelectionReady(false)
    setIsSample(false)
    setSkippedRows(0)
    setStep("upload")
  }

  const scanSteps = [
    tr("Mengesahkan fail penyata…", "Checking the statement file…"),
    tr("Mengekstrak baris transaksi…", "Extracting transaction lines…"),
    tr("Menganalisis debit dan kredit…", "Analysing debits and credits…"),
    tr("Memadankan dengan rekod anda…", "Matching with your records…"),
  ]

  const filteredWallets = useMemo(() => {
    const q = walletSearch.trim().toLowerCase()
    if (!q) return wallets
    return wallets.filter((w) => w.name.toLowerCase().includes(q) || (w.label || "").toLowerCase().includes(q) || (w.type || "").toLowerCase().includes(q))
  }, [wallets, walletSearch])

  const rate = recon.summary.matchRatePercent
  const inReview = step === "review"

  const steps: Array<{ key: Step; label: string; enabled: boolean }> = [
    { key: "wallet", label: tr("Akaun", "Account"), enabled: true },
    { key: "upload", label: tr("Muat naik", "Upload"), enabled: Boolean(targetWalletId) },
    { key: "review", label: tr("Semakan", "Review"), enabled: bankTxns.length > 0 },
  ]

  const categoryOptions = (type?: "expense" | "income") => categories.filter((c) => !type || c.type === type)

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader title={tr("Rekonsiliasi Bank", "Bank Reconciliation")} fallbackHref={`/${sessionId}/wallet-settings`} />
      </div>
      <DesktopPageHeader className="hidden lg:block" title={tr("Rekonsiliasi Bank", "Bank Reconciliation")} homeHref={`/${sessionId}`} />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <ScanLine size={16} />
              {inReview ? tr("Semakan penyata", "Statement review") : tr("Rekonsiliasi bank", "Bank reconciliation")}
            </>
          }
          actions={
            inReview ? (
              <ModenHeroIconButton onClick={resetAll} aria-label={tr("Penyata baru", "New statement")}>
                <RefreshCw size={17} />
              </ModenHeroIconButton>
            ) : null
          }
          currency={inReview ? null : "RM"}
          amount={
            inReview
              ? loadingTxns
                ? <Loader2 className="animate-spin" size={28} />
                : `${rate}%`
              : selectedWallet
                ? fmt(selectedWallet.balance || 0)
                : "0.00"
          }
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={
            inReview && !loadingTxns && !txnsError
              ? [
                  { key: "app", tone: "out", icon: <ArrowDownRight size={15} strokeWidth={2.3} />, label: tr("Belum direkod", "Not recorded"), value: String(recon.summary.missingInAppCount) },
                  { key: "bank", tone: "neutral", icon: <FileCheck2 size={15} strokeWidth={2.2} />, label: tr("Tiada di bank", "Not on statement"), value: String(recon.summary.missingInBankCount) },
                ]
              : undefined
          }
        >
          {inReview ? (
            <>
              <p className="text-[0.8125rem] font-medium leading-snug" style={{ color: "var(--hero-muted)" }}>
                {loadingTxns
                  ? tr("Memadankan dengan rekod anda…", "Matching with your records…")
                  : txnsError
                    ? tr("Rekod anda tidak dapat dimuatkan, jadi pemadanan dihentikan.", "Your records could not be loaded, so matching is paused.")
                    : tr(`${recon.summary.matchedCount} daripada ${recon.summary.totalBankTxns} transaksi bank sepadan.`, `${recon.summary.matchedCount} of ${recon.summary.totalBankTxns} bank transactions matched.`)}
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--hero-chip)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, rate)}%`, background: "var(--btn-primary-bg)" }} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold" style={{ color: "var(--hero-muted)" }}>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={heroQuietButtonStyle}>
                  <WalletBadge wallet={selectedWallet} size={18} />
                  {selectedWallet?.label || selectedWallet?.name}
                </span>
                <span className="inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full px-3 py-1.5" style={heroQuietButtonStyle}>
                  <FileCheck2 size={13} />
                  <span className="truncate">{fileName}</span>
                </span>
                {statementRange && (
                  <span className="rounded-full px-3 py-1.5" style={heroQuietButtonStyle}>
                    {statementRange.from} → {statementRange.to}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-[0.8125rem] font-medium leading-snug" style={{ color: "var(--hero-muted)" }}>
              {selectedWallet
                ? tr(`Baki ${selectedWallet.label || selectedWallet.name} dalam app.`, `${selectedWallet.label || selectedWallet.name} balance in the app.`)
                : tr("Pilih akaun yang mahu dipadankan dengan penyata bank.", "Choose the account to match against your bank statement.")}
            </p>
          )}

          <div role="tablist" aria-label={tr("Langkah", "Steps")} className="flex gap-1.5">
            {steps.map((s, i) => {
              const active = step === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={!s.enabled}
                  onClick={() => setStep(s.key)}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[0.8125rem] font-semibold transition active:scale-[0.98] disabled:opacity-40"
                  style={active ? heroPrimaryButtonStyle : heroQuietButtonStyle}
                >
                  <span className="text-xs opacity-80">{i + 1}</span>
                  {s.label}
                </button>
              )
            })}
          </div>
        </ModenHero>

        {/* ── Step 1: the account ── */}
        {step === "wallet" && (
          <section className="space-y-4 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--text)]">{tr("Pilih akaun", "Choose an account")}</h2>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{tr("Akaun yang penyata anda kepunyai.", "The account your statement belongs to.")}</p>
              </div>
              {wallets.length > 6 && (
                <div className="relative w-full sm:w-64">
                  <Search size={15} className="absolute left-4 top-3.5 text-[var(--muted)]" />
                  <input
                    value={walletSearch}
                    onChange={(e) => setWalletSearch(e.target.value)}
                    placeholder={tr("Cari akaun…", "Search accounts…")}
                    className="h-11 w-full rounded-full border border-[var(--border)] bg-transparent pl-11 pr-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)] md:text-sm"
                  />
                </div>
              )}
            </div>

            {loadingInitial ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
                ))}
              </div>
            ) : wallets.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] p-8 text-center">
                <Landmark size={30} className="mx-auto text-[var(--muted)]" />
                <p className="mt-3 text-sm font-semibold text-[var(--text)]">{tr("Tiada akaun atau dompet dijumpai.", "No accounts or wallets found.")}</p>
                <Link href={`/${sessionId}/wallet-settings`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)]">
                  <Plus size={15} />
                  {tr("Cipta akaun", "Create an account")}
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={tr("Akaun", "Account")}>
                {filteredWallets.map((wallet) => {
                  const selected = Number(targetWalletId) === Number(wallet.id)
                  return (
                    <button
                      key={wallet.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTargetWalletId(wallet.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-[1.5rem] border p-4 text-left transition active:scale-[0.99]",
                        selected ? "border-[var(--btn-primary-bg)] bg-[var(--surface-tint)]" : "border-[var(--border)] hover:bg-[var(--surface-tint)]"
                      )}
                    >
                      <WalletBadge wallet={wallet} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--text)]">{wallet.label || wallet.name}</span>
                        <span className="block text-xs text-[var(--muted)]">
                          {(wallet.type || "bank").toString()} · RM {fmt(wallet.balance || 0)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                          selected ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border-strong)] text-transparent"
                        )}
                      >
                        <Check size={13} strokeWidth={3} />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep("upload")}
                disabled={!targetWalletId}
                className="flex h-12 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40"
              >
                {tr("Teruskan", "Continue")}
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* ── Step 2: the statement ── */}
        {step === "upload" && (
          <section className="space-y-4 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <WalletBadge wallet={selectedWallet} size={44} />
                <div>
                  <p className="text-xs font-semibold text-[var(--muted)]">{tr("Akaun dipilih", "Selected account")}</p>
                  <p className="text-sm font-bold text-[var(--text)]">{selectedWallet?.label || selectedWallet?.name || "—"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep("wallet")}
                className="flex h-10 w-fit items-center gap-1.5 rounded-full border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
              >
                <ArrowLeft size={14} />
                {tr("Tukar akaun", "Change account")}
              </button>
            </div>

            <div role="tablist" className="flex gap-1.5">
              {(
                [
                  ["file", tr("Muat naik fail", "Upload a file"), UploadCloud],
                  ["paste", tr("Tampal teks", "Paste text"), ClipboardPaste],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={inputMode === mode}
                  onClick={() => setInputMode(mode)}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition",
                    inputMode === mode ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {inputMode === "file" ? (
              <div className="space-y-4">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border-strong)] p-8 text-center transition hover:bg-[var(--surface-tint)] md:p-12">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]">
                    <UploadCloud size={26} />
                  </span>
                  <span className="mt-4 text-base font-bold text-[var(--text)]">{tr("Ketik atau heret penyata bank ke sini", "Tap or drag your bank statement here")}</span>
                  <span className="mt-1 max-w-md text-sm text-[var(--muted)]">
                    {tr("PDF rasmi (termasuk yang berkata laluan), CSV, TSV atau TXT. Had 25 MB.", "Official PDF (including password-protected), CSV, TSV or TXT. Up to 25 MB.")}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
                    <Lock size={12} className="text-emerald-500" />
                    {tr("CSV dibaca terus tanpa dihantar ke AI", "CSV is read directly, never sent to an AI")}
                  </span>
                  <input type="file" accept=".pdf,.csv,.tsv,.txt" onChange={handleFile} className="hidden" />
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold text-[var(--muted)]">{tr("Format disokong:", "Supported:")}</span>
                  {SUPPORTED_BANKS.map((b) => (
                    <span key={b} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-[var(--muted)]" htmlFor="statement-text">
                  {tr("Tampal teks penyata atau salinan transaksi", "Paste the statement or copied transactions")}
                </label>
                <textarea
                  id="statement-text"
                  rows={7}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={"01/08/2026 DUITNOW TRSF TO ALI RM 50.00 DR\n03/08/2026 SALARY CREDIT JULY 2026 RM 4,500.00 CR"}
                  className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 font-mono text-sm leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50 focus:border-[var(--btn-primary-bg)]"
                />
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  disabled={isProcessing || !rawText.trim()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {tr("Proses dan padankan", "Process and match")}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-[var(--muted)]">{tr("Mahu cuba tanpa fail? Contoh ini tidak boleh diimport.", "Want to try it without a file? The sample cannot be imported.")}</span>
              <button
                type="button"
                onClick={loadSample}
                className="flex h-10 w-fit items-center gap-1.5 rounded-full border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
              >
                <FileSpreadsheet size={14} />
                {tr("Cuba contoh penyata", "Try a sample statement")}
              </button>
            </div>
          </section>
        )}

        {/* ── Step 3: the review ── */}
        {step === "review" && (
          <>
            {isSample && (
              <p className="flex items-start gap-2 rounded-[1.25rem] border border-amber-500/40 px-4 py-3 text-sm text-[var(--text)]">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                {tr("Ini penyata contoh. Anda boleh melihat cara pemadanan, tetapi ia tidak boleh diimport ke rekod anda.", "This is a sample statement. You can see how matching works, but it cannot be imported into your records.")}
              </p>
            )}
            {txnsError && (
              <div className="flex flex-col gap-3 rounded-[1.25rem] border border-rose-500/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-sm text-[var(--text)]">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-rose-500" />
                  {tr("Rekod anda tidak dapat dimuatkan. Tanpanya, setiap baris bank akan nampak seperti belum direkod.", "Your records could not be loaded. Without them, every bank line would look unrecorded.")}
                </p>
                <button type="button" onClick={() => void loadAppTransactions(bankTxns)} className="h-10 w-fit shrink-0 rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)]">
                  {tr("Cuba lagi", "Try again")}
                </button>
              </div>
            )}
            {skippedRows > 0 && (
              <p className="flex items-start gap-2 rounded-[1.25rem] border border-amber-500/40 px-4 py-3 text-sm text-[var(--text)]">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                {tr(`${skippedRows} baris tidak dapat dibaca (tarikh atau amaun tidak sah) dan dilangkau. Semak penyata anda untuk baris itu.`, `${skippedRows} rows could not be read (invalid date or amount) and were skipped. Check your statement for them.`)}
              </p>
            )}

            {/* Totals */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[
                [tr("Debit bank", "Bank debits"), recon.summary.bankDebitTotal, "text-rose-500"],
                [tr("Kredit bank", "Bank credits"), recon.summary.bankCreditTotal, "text-emerald-600 dark:text-emerald-400"],
                [tr("Belanja dalam app", "App expenses"), recon.summary.appExpenseTotal, "text-[var(--text)]"],
                [tr("Pendapatan dalam app", "App income"), recon.summary.appIncomeTotal, "text-[var(--text)]"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)] p-3.5">
                  <p className="text-xs font-semibold text-[var(--muted)]">{label as string}</p>
                  <p className={cn("mt-0.5 text-base font-bold tabular-nums", color as string)}>RM {fmt(value as number)}</p>
                </div>
              ))}
            </div>
            <p className="px-1 text-xs text-[var(--muted)]">
              {tr("Beza bersih bank dan app", "Net difference, bank versus app")}:{" "}
              <strong className={cn("tabular-nums", Math.abs(recon.summary.netVariance) < 0.005 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                RM {fmt(recon.summary.netVariance)}
              </strong>
              {Math.abs(recon.summary.netVariance) < 0.005 ? ` · ${tr("seimbang", "balanced")}` : ""}
            </p>

            {/* Controls */}
            <div className="space-y-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-4 top-3.5 text-[var(--muted)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tr("Cari keterangan atau amaun…", "Search description or amount…")}
                    className="h-11 w-full rounded-full border border-[var(--border)] bg-transparent pl-11 pr-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)] md:text-sm"
                  />
                </div>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["all", tr("Semua", "All")],
                      ["expense", tr("Debit", "Debit")],
                      ["income", tr("Kredit", "Credit")],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTypeFilter(key)}
                      aria-pressed={typeFilter === key}
                      className={cn(
                        "h-10 rounded-full border px-4 text-sm font-semibold transition",
                        typeFilter === key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={smartDateMatch}
                onClick={() => setSmartDateMatch((v) => !v)}
                className="flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--border)] px-4 py-3 text-left transition hover:bg-[var(--surface-tint)]"
              >
                <span>
                  <span className="block text-sm font-semibold text-[var(--text)]">{tr("Padanan tarikh pintar (±2 hari)", "Smart date match (±2 days)")}</span>
                  <span className="block text-xs text-[var(--muted)]">{tr("Padankan walaupun bank memproses pada hari lain", "Match even when the bank clears it on another day")}</span>
                </span>
                <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", smartDateMatch ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--surface-tint-strong)]")}>
                  <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition-all", smartDateMatch ? "left-5" : "left-1")} />
                </span>
              </button>
              {goPlusCount > 0 && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={ignoreGoPlus}
                  onClick={() => {
                    setIgnoreGoPlus((v) => !v)
                    setSelectionReady(false)
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--border)] px-4 py-3 text-left transition hover:bg-[var(--surface-tint)]"
                >
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text)]">
                      {tr("Abaikan pindahan dalaman TNG", "Ignore TNG internal transfers")} ({goPlusCount})
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      {tr("“GO+ Cash In”, “via GO+ eWallet” dan “eWallet Cash Out” ialah pindahan dalam sistem TNG, bukan belanja atau pendapatan", "“GO+ Cash In”, “via GO+ eWallet” and “eWallet Cash Out” are TNG's own transfers, not spending or income")}
                    </span>
                  </span>
                  <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", ignoreGoPlus ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--surface-tint-strong)]")}>
                    <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition-all", ignoreGoPlus ? "left-5" : "left-1")} />
                  </span>
                </button>
              )}
            </div>

            {/* Tabs */}
            <div role="tablist" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ["missing_in_app", tr("Belum direkod", "Not recorded"), recon.summary.missingInAppCount],
                  ["matched", tr("Sepadan", "Matched"), recon.summary.matchedCount],
                  ["missing_in_bank", tr("Tiada di bank", "Not on statement"), recon.summary.missingInBankCount],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                    tab === key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  {label}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", tab === key ? "bg-white/20" : "bg-[var(--surface-tint-strong)]")}>{count}</span>
                </button>
              ))}
            </div>

            {loadingTxns ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
                ))}
              </div>
            ) : txnsError ? null : (
              <>
                {tab === "missing_in_app" &&
                  (recon.missingInApp.length === 0 ? (
                    <EmptyState icon={<CheckCheck size={26} />} tone="ok" title={tr("Semua transaksi bank sudah direkod", "Every bank transaction is recorded")} text={tr("Tiada baris penyata yang tercicir daripada rekod anda.", "No statement line is missing from your records.")} />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 lg:flex-row lg:items-center lg:justify-between">
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={(e) =>
                              setSelectedIds((prev) => {
                                const next = new Set(prev)
                                missingInApp.forEach((t) => (e.target.checked ? next.add(t.id) : next.delete(t.id)))
                                return next
                              })
                            }
                            className="h-5 w-5 rounded-md accent-[var(--btn-primary-bg)]"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-[var(--text)]">
                              {tr("Pilih semua", "Select all")} ({missingInApp.length})
                            </span>
                            <span className="block text-xs text-[var(--muted)]">
                              {selectedMissing.length} {tr("dipilih · jumlah", "selected · total")} <strong className="text-[var(--text)]">RM {fmt(selectedTotal)}</strong>
                            </span>
                          </span>
                        </label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <select
                            value={batchCategoryId}
                            onChange={(e) => setBatchCategoryId(e.target.value ? Number(e.target.value) : "")}
                            aria-label={tr("Kategori untuk semua", "Category for all")}
                            className="h-11 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none md:text-sm lg:w-auto"
                          >
                            <option value="">{tr("Kategori untuk semua…", "Category for all…")}</option>
                            {categoryOptions().map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name} ({cat.type === "expense" ? tr("Belanja", "Expense") : tr("Pendapatan", "Income")})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={importSelected}
                            disabled={importing || selectedMissing.length === 0 || isSample}
                            className="hidden h-11 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40 lg:flex"
                          >
                            {importing ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />}
                            {importing ? tr("Mengimport…", "Importing…") : tr(`Import (${selectedMissing.length})`, `Import (${selectedMissing.length})`)}
                          </button>
                        </div>
                      </div>

                      <ul className="space-y-2.5">
                        {missingInApp.map((txn) => {
                          const out = txn.type === "expense"
                          return (
                            <li key={txn.id} className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(txn.id)}
                                  onChange={(e) => toggleSelected(txn.id, e.target.checked)}
                                  aria-label={txn.description}
                                  className="mt-0.5 h-5 w-5 shrink-0 rounded-md accent-[var(--btn-primary-bg)]"
                                />
                                <div className="hidden lg:block">
                                  <DirectionDot out={out} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug text-[var(--text)]">{txn.description}</p>
                                    <span className={cn("shrink-0 whitespace-nowrap text-base font-bold tabular-nums", out ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                                      {out ? "−" : "+"}RM {fmt(txn.amount)}
                                    </span>
                                  </div>
                                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                                    <span>{txn.date}</span>
                                    <span aria-hidden>·</span>
                                    <span className={cn("font-semibold", out ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>{out ? tr("Debit", "Debit") : tr("Kredit", "Credit")}</span>
                                  </p>
                                  {hintsFor(txn).map((hint) => {
                                    const hintId = Number(hint.txn.id)
                                    return (
                                      <p key={`${hint.kind}-${hint.txn.id}`} className="mt-2 rounded-[1rem] border border-amber-500/30 px-3 py-2 text-xs leading-relaxed text-[var(--text)]">
                                        {hintText(hint, txn)}
                                        {Number.isFinite(hintId) && (
                                          <>
                                            {" "}
                                            <Link href={`/${sessionId}/transactions/${hintId}`} className="font-semibold underline underline-offset-4">
                                              {tr("Buka rekod", "Open record")}
                                            </Link>
                                          </>
                                        )}
                                      </p>
                                    )
                                  })}
                                  <div className="mt-3 flex items-center gap-2">
                                    <select
                                      value={inlineCategories[txn.id] || ""}
                                      onChange={(e) =>
                                        setInlineCategories((prev) => {
                                          const next = { ...prev }
                                          if (e.target.value) next[txn.id] = Number(e.target.value)
                                          else delete next[txn.id]
                                          return next
                                        })
                                      }
                                      aria-label={tr("Kategori", "Category")}
                                      className="h-10 min-w-0 flex-1 truncate rounded-full border border-[var(--border)] bg-transparent px-3.5 text-base text-[var(--text)] outline-none md:text-sm lg:max-w-[14rem] lg:flex-none"
                                    >
                                      <option value="">{tr("Kategori…", "Category…")}</option>
                                      {categoryOptions(txn.type).map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                          {cat.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickAdd(txn)
                                        setQuickAddCategoryId(inlineCategories[txn.id] || "")
                                      }}
                                      disabled={isSample}
                                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-4 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-95 disabled:opacity-40"
                                    >
                                      <Plus size={14} />
                                      {tr("Tambah", "Add")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => ignoreLine(txn.id)}
                                      aria-label={tr("Abaikan baris ini", "Ignore this line")}
                                      title={tr("Abaikan baris ini", "Ignore this line")}
                                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]"
                                    >
                                      <EyeOff size={15} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>

                      {/* Phones: the import button stays in reach while the list scrolls. */}
                      <div className="sticky bottom-24 z-10 flex items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-5 pr-2 lg:hidden">
                        <span className="min-w-0 text-sm">
                          <span className="font-bold text-[var(--text)]">{selectedMissing.length}</span>{" "}
                          <span className="text-[var(--muted)]">{tr("dipilih", "selected")}</span>
                          <span className="block truncate text-xs font-semibold tabular-nums text-[var(--text)]">RM {fmt(selectedTotal)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={importSelected}
                          disabled={importing || selectedMissing.length === 0 || isSample}
                          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40"
                        >
                          {importing ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />}
                          {importing ? tr("Mengimport…", "Importing…") : tr("Import", "Import")}
                        </button>
                      </div>
                    </div>
                  ))}

                {tab === "matched" &&
                  (matched.length === 0 ? (
                    <EmptyState icon={<Link2Off size={24} />} title={tr("Tiada padanan", "No matches")} text={tr("Tiada transaksi sepadan dengan carian ini.", "No matched transactions for this search.")} />
                  ) : (
                    <ul className="space-y-2.5">
                      {matched.map((pair) => {
                        const out = pair.bankTxn.type === "expense"
                        const appId = Number(pair.appTxn.id)
                        const label =
                          pair.directionMismatch ? tr("Arah berbeza", "Different direction")
                          : pair.confidence === "exact" ? tr("Tepat", "Exact")
                          : pair.confidence === "high" ? tr("Hampir tepat", "Close")
                          : tr("Mungkin", "Possible")
                        return (
                          <li key={pair.id} className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
                                  pair.directionMismatch ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : pair.confidence === "partial" ? "border-[var(--border)] text-[var(--muted)]" : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                )}
                              >
                                {pair.directionMismatch ? <TriangleAlert size={12} /> : <Check size={12} />}
                                {label}
                                {pair.dateDiffDays > 0 ? ` · ${pair.dateDiffDays} ${tr("hari", pair.dateDiffDays === 1 ? "day" : "days")}` : ""}
                              </span>
                              <span className={cn("text-base font-bold tabular-nums", out ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                                {out ? "−" : "+"}RM {fmt(pair.bankTxn.amount)}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--muted)]">{tr("Penyata bank", "Bank statement")}</p>
                                <p className="truncate text-sm font-semibold text-[var(--text)]">{pair.bankTxn.description}</p>
                                <p className="text-xs text-[var(--muted)]">{pair.bankTxn.date}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--muted)]">{tr("Rekod anda", "Your record")}</p>
                                <p className="truncate text-sm font-semibold text-[var(--text)]">{pair.appTxn.description || pair.appTxn.notes || pair.appTxn.category_name || "—"}</p>
                                <p className="text-xs text-[var(--muted)]">
                                  {pair.appTxn.date}
                                  {pair.appTxn.category_name ? ` · ${pair.appTxn.category_name}` : ""}
                                </p>
                              </div>
                            </div>
                            {pair.directionMismatch && (
                              <p className="mt-3 rounded-[1rem] border border-amber-500/30 px-3 py-2 text-xs text-[var(--text)]">
                                {tr(
                                  `Bank menunjukkan ${out ? "debit" : "kredit"}, tetapi dalam app ia direkod sebagai ${pair.appTxn.type === "expense" ? "belanja" : "pendapatan"}. Betulkan jenisnya.`,
                                  `The bank shows a ${out ? "debit" : "credit"}, but the app has it as ${pair.appTxn.type === "expense" ? "an expense" : "income"}. Fix its type.`
                                )}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                              {Number.isFinite(appId) && (
                                <Link href={`/${sessionId}/transactions/${appId}`} className="flex h-9 items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)]">
                                  {tr("Buka rekod", "Open record")}
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => unmatch(pair.bankTxn.id, pair.appTxn.id)}
                                className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-4 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)]"
                              >
                                <Link2Off size={14} />
                                {tr("Bukan padanan", "Not a match")}
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ))}

                {tab === "missing_in_bank" &&
                  (missingInBank.length === 0 ? (
                    <EmptyState icon={<CheckCheck size={26} />} tone="ok" title={tr("Semua rekod anda ada pada penyata", "Every record of yours is on the statement")} text={tr("Hanya rekod dalam tempoh penyata ini dibandingkan.", "Only records inside this statement's period are compared.")} />
                  ) : (
                    <div className="space-y-2.5">
                      <p className="px-1 text-sm text-[var(--muted)]">
                        {tr("Rekod ini ada dalam app tetapi tiada pada penyata. Mungkin bank belum memprosesnya, atau jumlah atau akaunnya salah.", "These are in the app but not on the statement. The bank may not have cleared them yet, or the amount or account is wrong.")}
                      </p>
                      <ul className="space-y-2.5">
                        {missingInBank.map((txn) => {
                          const out = txn.type === "expense"
                          const id = Number(txn.id)
                          return (
                            <li key={String(txn.id)} className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                              <div className="flex items-start gap-3">
                                <div className="hidden lg:block">
                                  <DirectionDot out={out} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug text-[var(--text)]">{txn.description || txn.notes || txn.category_name || "—"}</p>
                                    <span className={cn("shrink-0 whitespace-nowrap text-base font-bold tabular-nums", out ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                                      {out ? "−" : "+"}RM {fmt(Number(txn.amount))}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-3">
                                    <p className="min-w-0 truncate text-xs text-[var(--muted)]">
                                      {txn.date}
                                      {txn.category_name ? ` · ${txn.category_name}` : ""}
                                    </p>
                                    {Number.isFinite(id) && (
                                      <Link href={`/${sessionId}/transactions/${id}`} className="flex h-9 shrink-0 items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)]">
                                        {tr("Buka", "Open")}
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}

                {ignoredIds.size > 0 && (
                  <p className="flex flex-wrap items-center gap-2 px-1 text-sm text-[var(--muted)]">
                    <Eye size={14} />
                    {tr(`${ignoredIds.size} baris diabaikan.`, `${ignoredIds.size} lines ignored.`)}
                    <button
                      type="button"
                      onClick={() => {
                        setIgnoredIds(new Set())
                        setSelectionReady(false)
                      }}
                      className="font-semibold text-[var(--text)] underline underline-offset-4"
                    >
                      {tr("Pulihkan semua", "Restore all")}
                    </button>
                  </p>
                )}
              </>
            )}
          </>
        )}
      </DesktopPageBody>

      {/* Password-protected PDF */}
      <AppSheet
        open={Boolean(pendingPdf)}
        onClose={() => {
          if (!unlocking) setPendingPdf(null)
        }}
        id="bank-pdf-password"
        title={tr("PDF berkata laluan", "Password-protected PDF")}
        subtitle={pendingPdf?.name}
        icon={<Lock size={18} />}
        size="sm"
        footer={
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={unlocking || !pdfPassword.trim()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-50"
          >
            {unlocking ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {tr("Buka dan baca", "Unlock and read")}
          </button>
        }
      >
        <div className="space-y-2">
          <label htmlFor="pdf-doc-code" className="text-xs font-semibold text-[var(--muted)]">
            {tr("Kata laluan penyata", "Statement password")}
          </label>
          <div className="relative">
            <input
              id="pdf-doc-code"
              name="pdf-doc-code"
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              autoFocus
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !unlocking) {
                  e.preventDefault()
                  void handleUnlock()
                }
              }}
              placeholder={tr("No. IC 12 digit atau 6 digit tarikh lahir", "12-digit IC or 6-digit birth date")}
              className="h-12 w-full rounded-full border border-[var(--border)] bg-transparent pl-4 pr-12 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? tr("Sembunyi", "Hide") : tr("Tunjuk", "Show")} className="absolute right-3 top-3 text-[var(--muted)]">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {passwordError && <p className="text-sm font-semibold text-rose-500">{passwordError}</p>}
        </div>
      </AppSheet>

      {/* Add one transaction */}
      <AppSheet
        open={Boolean(quickAdd)}
        onClose={() => setQuickAdd(null)}
        id="bank-quick-add"
        title={tr("Tambah ke rekod", "Add to your records")}
        size="sm"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setQuickAdd(null)} className="h-12 flex-1 rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--text)]">
              {tr("Batal", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => void saveQuickAdd()}
              disabled={quickAddSaving}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-50"
            >
              {quickAddSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {tr("Simpan", "Save")}
            </button>
          </div>
        }
      >
        {quickAdd && (
          <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-[var(--border)] p-3.5">
              <p className="text-sm font-semibold text-[var(--text)]">{quickAdd.description}</p>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">{quickAdd.date}</span>
                <span className={cn("font-bold tabular-nums", quickAdd.type === "expense" ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                  {quickAdd.type === "expense" ? "−" : "+"}RM {fmt(quickAdd.amount)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-[var(--muted)]">
              <WalletBadge wallet={selectedWallet} size={28} />
              {tr("Disimpan ke", "Saved to")} <strong className="text-[var(--text)]">{selectedWallet?.label || selectedWallet?.name}</strong>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="quick-category" className="text-xs font-semibold text-[var(--muted)]">
                {tr("Kategori", "Category")}
              </label>
              <select
                id="quick-category"
                value={quickAddCategoryId}
                onChange={(e) => setQuickAddCategoryId(e.target.value ? Number(e.target.value) : "")}
                className="h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none"
              >
                <option value="">{tr("Tanpa kategori", "No category")}</option>
                {categoryOptions(quickAdd.type).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </AppSheet>

      {/* Reading the statement */}
      {isProcessing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]">
              <ScanLine size={26} className="animate-pulse" />
            </span>
            <p className="mt-4 text-base font-bold text-[var(--text)]">{tr("Membaca penyata bank…", "Reading the bank statement…")}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{scanSteps[scanStep]}</p>
            <div className="mx-auto mt-4 flex w-fit gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("h-2 w-2 rounded-full transition-all duration-300", i <= scanStep ? "scale-110 bg-[var(--btn-primary-bg)]" : "bg-[var(--surface-tint-strong)]")} />
              ))}
            </div>
          </div>
        </div>
      )}

      {alertModal}
    </div>
  )
}

function DirectionDot({ out }: { out: boolean }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", out ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
      {out ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
    </span>
  )
}

function EmptyState({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone?: "ok" }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
      <span className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full", tone === "ok" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-[var(--surface-tint-strong)] text-[var(--muted)]")}>{icon}</span>
      <p className="mt-3 text-sm font-semibold text-[var(--text)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{text}</p>
    </div>
  )
}
