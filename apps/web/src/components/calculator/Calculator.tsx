"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { cn, getTodayDateInTimeZone } from "@/lib/utils"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { X, Delete, Send } from "lucide-react"

type CalcHistoryEntry = {
  expression: string
  result: string
  timestamp: number
}

type WalletOption = {
  id: number
  name?: string | null
  label?: string | null
  balance?: number | null
}

type CategoryOption = {
  id: number
  name: string
  kind?: "expense" | "income"
}

type CategoryKeywordOption = {
  id: number
  keyword: string
}

const HISTORY_STORAGE_KEY = "bdp-calculator-history"
const MAX_HISTORY_ITEMS = 50

function loadHistory(): CalcHistoryEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_HISTORY_ITEMS)
  } catch {
    return []
  }
}

function saveHistory(history: CalcHistoryEntry[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)))
  } catch {
  }
}

export default function Calculator({
  show: desktopShow,
  onClose,
  embedded = false,
  hideFab = false,
}: {
  show?: boolean
  onClose?: () => void
  embedded?: boolean
  hideFab?: boolean
} = {}) {
  const { lang } = useLang()
  const tr = (bm: string, en: string) => (lang === "BM" ? bm : en)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [display, setDisplay] = useState("0")
  const [expression, setExpression] = useState("")
  const [history, setHistory] = useState<CalcHistoryEntry[]>([])
  const [shouldResetDisplay, setShouldResetDisplay] = useState(false)
  const [lastOperator, setLastOperator] = useState("")
  const [isDesktop, setIsDesktop] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [transactionTitle, setTransactionTitle] = useState("")
  const [sendError, setSendError] = useState("")
  const [sending, setSending] = useState(false)
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [walletId, setWalletId] = useState("")
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false)
  const [categoryId, setCategoryId] = useState("auto")
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [txnType, setTxnType] = useState<"expense" | "income">("expense")
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [categoryKeywords, setCategoryKeywords] = useState<Record<number, CategoryKeywordOption[]>>({})
  const [successInfo, setSuccessInfo] = useState<{ title: string; amount: number; wallet: string; balance?: number | null; category: string } | null>(null)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const open = embedded ? true : (desktopShow ?? false) || mobileOpen
  const setOpen = (value: boolean) => {
    if (embedded) return
    if (isDesktop) {
      if (!value && onClose) onClose()
      return
    }
    if (!value && onClose) onClose()
    setMobileOpen(value)
  }

  useEffect(() => {
    setIsDesktop(window.matchMedia("(min-width: 1024px)").matches)
    const mq = window.matchMedia("(min-width: 1024px)")
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    mq.addEventListener("change", handleChange)
    return () => mq.removeEventListener("change", handleChange)
  }, [])

  useEffect(() => {
    if (open) setHistory(loadHistory())
  }, [open])

  useEffect(() => {
    if (!sendOpen) return
    let cancelled = false
    async function loadWallets() {
      try {
        const token = getAccessToken()
        const res = await fetch("/api/wallets", {
          cache: "no-store",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data)) return
        setWallets(data)
        setWalletId((current) => current || (data[0]?.id ? String(data[0].id) : ""))
      } catch {
      }
    }
    async function loadCategories() {
      try {
        const token = getAccessToken()
        const res = await fetch("/api/categories", {
          cache: "no-store",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data)) return
        setCategories(data)
        const entries = await Promise.all(data.map(async (category) => {
          const kwRes = await fetch(`/api/categories/${category.id}/keywords`, {
            cache: "no-store",
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!kwRes.ok) return [category.id, []] as const
          const keywords = await kwRes.json()
          return [category.id, Array.isArray(keywords) ? keywords : []] as const
        }))
        if (cancelled) return
        setCategoryKeywords(Object.fromEntries(entries))
      } catch {
      }
    }
    void loadWallets()
    void loadCategories()
    return () => {
      cancelled = true
    }
  }, [sendOpen])

  useEffect(() => {
    if (!embedded && !open) return

    const handlePointerDown = (event: MouseEvent) => {
      const panel = document.getElementById("calc-panel")
      const desktopTrigger = document.getElementById("calc-dt-btn")
      if (
        panel &&
        !panel.contains(event.target as Node) &&
        desktopTrigger &&
        !desktopTrigger.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const timer = setTimeout(() => document.addEventListener("mousedown", handlePointerDown), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [embedded, open])

  const addToHistory = useCallback((expr: string, result: string) => {
    setHistory((prev) => {
      const updated = [{ expression: expr, result, timestamp: Date.now() }, ...prev].slice(0, MAX_HISTORY_ITEMS)
      saveHistory(updated)
      return updated
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    saveHistory([])
  }, [])

  const clearDisplay = useCallback(() => {
    setDisplay("0")
    setExpression("")
    setShouldResetDisplay(false)
    setLastOperator("")
  }, [])

  const handleNumber = (num: string) => {
    if (shouldResetDisplay) {
      setDisplay(num)
      setShouldResetDisplay(false)
      return
    }
    setDisplay((prev) => (prev === "0" && num !== "." ? num : prev + num))
  }

  const handleDecimal = () => {
    if (shouldResetDisplay) {
      setDisplay("0.")
      setShouldResetDisplay(false)
      return
    }
    if (display.includes(".")) return
    setDisplay((prev) => prev + ".")
  }

  const calc = (a: number, op: string, b: number): number => {
    switch (op) {
      case "+":
        return a + b
      case "-":
        return a - b
      case "×":
        return a * b
      case "÷":
        return b !== 0 ? a / b : NaN
      default:
        return b
    }
  }

  const fmtNum = (num: number): string => {
    if (!isFinite(num)) return "Error"
    let output = num.toFixed(10).replace(/\.?0+$/, "")
    if (output === "") output = "0"
    if (output.includes(".") && output.split(".")[1].length > 10) {
      output = num.toFixed(6).replace(/\.?0+$/, "")
    }
    return output
  }

  const handleOperator = (op: string) => {
    const currentValue = parseFloat(display)
    if (isNaN(currentValue)) return

    if (expression && lastOperator) {
      const parts = expression.trim().split(" ")
      if (parts.length >= 2) {
        const mid = calc(parseFloat(parts[0]), lastOperator, currentValue)
        setExpression(`${fmtNum(mid)} ${op}`)
        setDisplay(fmtNum(mid))
        setLastOperator(op)
        setShouldResetDisplay(true)
        return
      }
    }

    setExpression(`${display} ${op}`)
    setLastOperator(op)
    setShouldResetDisplay(true)
  }

  const handleEquals = () => {
    const currentValue = parseFloat(display)
    if (isNaN(currentValue)) return

    const fullExpr = expression ? `${expression} ${display}` : display
    let result: number

    if (expression && lastOperator) {
      const parts = expression.trim().split(" ")
      result = parts.length >= 2 ? calc(parseFloat(parts[0]), lastOperator, currentValue) : currentValue
    } else {
      result = currentValue
    }

    const formatted = fmtNum(result)
    addToHistory(fullExpr, formatted)
    setDisplay(formatted)
    setExpression("")
    setShouldResetDisplay(true)
    setLastOperator("")
  }

  const handleBackspace = () => {
    if (shouldResetDisplay) return
    setDisplay((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)))
  }

  const handlePercentage = () => {
    const currentValue = parseFloat(display)
    if (isNaN(currentValue)) return
    setDisplay(fmtNum(currentValue / 100))
    setShouldResetDisplay(true)
  }

  const getTransactionAmount = () => {
    const currentValue = parseFloat(display)
    if (isNaN(currentValue)) return NaN
    if (expression && lastOperator) {
      const parts = expression.trim().split(" ")
      return parts.length >= 2 ? calc(parseFloat(parts[0]), lastOperator, currentValue) : currentValue
    }
    return currentValue
  }

  const roundUpToTenSen = (amount: number) => Math.ceil(amount * 10) / 10

  const detectCategory = (title: string) => {
    const normalizedTitle = title.trim().toLowerCase()
    let best: { category: CategoryOption; score: number } | null = null
    for (const category of categories) {
      if (category.kind && category.kind !== txnType) continue
      const keywords = categoryKeywords[category.id] || []
      for (const keywordRow of keywords) {
        const keyword = (keywordRow.keyword || "").trim().toLowerCase()
        if (!keyword || !normalizedTitle.includes(keyword)) continue
        const score = keyword.length
        if (!best || score > best.score) best = { category, score }
      }
    }
    return best?.category || null
  }

  const openSendTransaction = () => {
    const amount = getTransactionAmount()
    if (!isFinite(amount) || amount <= 0) {
      setSendError(tr("Jumlah tidak sah", "Invalid amount"))
      setSendOpen(true)
      return
    }
    setSendError("")
    setTransactionTitle("")
    setCategoryId("auto")
    setCategoryDropdownOpen(false)
    setSendOpen(true)
  }

  const submitTransaction = async (event: React.FormEvent) => {
    event.preventDefault()
    const title = transactionTitle.trim()
    const amount = roundUpToTenSen(getTransactionAmount())
    if (!title) {
      setSendError(tr("Taip title transaksi", "Enter transaction title"))
      return
    }
    if (!isFinite(amount) || amount <= 0) {
      setSendError(tr("Jumlah tidak sah", "Invalid amount"))
      return
    }
    setSending(true)
    setSendError("")
    try {
      const token = getAccessToken()
      const matchedCategory = detectCategory(title)
      const chosenCategoryId = categoryId === "auto" ? (matchedCategory?.id ?? null) : (categoryId ? Number(categoryId) : null)
      const chosenCategoryName = categoryId === "auto" ? (matchedCategory?.name ?? null) : (categories.find((category) => category.id === chosenCategoryId)?.name ?? null)
      const walletBeforeSave = wallets.find((wallet) => String(wallet.id) === walletId)
      const walletLabel = walletBeforeSave?.label || walletBeforeSave?.name || "Wallet"
      const res = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: txnType,
          amount: Number(amount.toFixed(2)),
          vendor_or_source: title,
          txn_date: getTodayDateInTimeZone(),
          notes: title,
          category_id: chosenCategoryId,
          wallet_id: walletId ? Number(walletId) : null,
        }),
      })
      let savedPayload: { category_name?: string | null; wallet_name?: string | null; detail?: unknown } | null = null
      try {
        savedPayload = await res.json()
      } catch {
      }
      if (!res.ok) {
        let message = tr("Gagal simpan transaksi", "Failed to save transaction")
        if (typeof savedPayload?.detail === "string") message = savedPayload.detail
        throw new Error(message)
      }
      const latestWalletsRes = await fetch("/api/wallets", {
        cache: "no-store",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      let latestWallet = walletBeforeSave
      if (latestWalletsRes.ok) {
        const latestWallets = await latestWalletsRes.json()
        if (Array.isArray(latestWallets)) {
          setWallets(latestWallets)
          latestWallet = latestWallets.find((wallet) => String(wallet.id) === walletId) || walletBeforeSave
        }
      }
      setSuccessInfo({
        title,
        amount,
        wallet: savedPayload?.wallet_name || walletLabel,
        balance: latestWallet?.balance,
        category: savedPayload?.category_name || chosenCategoryName || tr("Tanpa kategori", "Uncategorized"),
      })
      setDisplay(fmtNum(amount))
      setExpression("")
      setLastOperator("")
      setShouldResetDisplay(true)
      setTransactionTitle("")
      setWalletDropdownOpen(false)
      setCategoryId("auto")
      setCategoryDropdownOpen(false)
      setSendOpen(false)
      window.dispatchEvent(new Event("refreshData"))
    } catch (error) {
      setSendError(error instanceof Error ? error.message : tr("Gagal simpan transaksi", "Failed to save transaction"))
    } finally {
      setSending(false)
    }
  }

  const useHistoryEntry = (entry: CalcHistoryEntry) => {
    setDisplay(entry.result)
    setExpression("")
    setShouldResetDisplay(true)
    setLastOperator("")
  }

  useEffect(() => {
    if (!embedded && !open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === "Escape") setOpen(false)
      else if (event.key >= "0" && event.key <= "9") handleNumber(event.key)
      else if (event.key === ".") handleDecimal()
      else if (event.key === "+") handleOperator("+")
      else if (event.key === "-") handleOperator("-")
      else if (event.key === "*") handleOperator("×")
      else if (event.key === "/") {
        event.preventDefault()
        handleOperator("÷")
      } else if (event.key === "Enter" || event.key === "=") handleEquals()
      else if (event.key === "Backspace") handleBackspace()
      else if (event.key === "%") handlePercentage()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [embedded, open, display, expression, shouldResetDisplay, lastOperator])

  const sharedBtn = "select-none rounded-xl text-base font-semibold transition-all active:scale-95 flex items-center justify-center"
  const numCls = "h-10 w-full bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
  const opCls = "h-10 w-full bg-[var(--surface-tint-strong)] text-[var(--text)] text-2xl font-bold hover:bg-[var(--border-strong)]"
  const selectedWallet = wallets.find((wallet) => String(wallet.id) === walletId)
  const selectedWalletLabel = selectedWallet?.label || selectedWallet?.name || tr("Pilih wallet", "Select wallet")
  const selectedCategory = categories.find((category) => String(category.id) === categoryId)
  const selectedCategoryLabel = categoryId === "auto" ? tr("Auto kategori", "Auto category") : (selectedCategory?.name || tr("Tanpa kategori", "Uncategorized"))

  const sendDialog = sendOpen ? (
        <>
 <div className="fixed inset-0 z-[220] bg-transparent" onClick={() => !sending && setSendOpen(false)} />
 <div className="fixed inset-0 z-[221] flex items-center justify-center px-4">
            <form onSubmit={submitTransaction} className="w-full max-w-sm rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{tr("Transaksi", "Transaction")}</p>
                  <p className="mt-1 text-2xl font-black text-[var(--text)]">RM {fmtNum(getTransactionAmount())}</p>
                </div>
                <button type="button" onClick={() => setSendOpen(false)} disabled={sending} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--muted)] disabled:opacity-50">
                  <X size={16} />
                </button>
              </div>
              <input value={transactionTitle} onChange={(event) => setTransactionTitle(event.target.value)} autoFocus placeholder={tr("Title transaksi", "Transaction title")} className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-indigo-500" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setTxnType("expense"); setCategoryId("auto") }} className={cn("rounded-2xl border px-4 py-2.5 text-sm font-bold transition", txnType === "expense" ? "border-transparent bg-rose-500/15 text-rose-500" : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]")}>{tr("Perbelanjaan", "Expense")}</button>
                <button type="button" onClick={() => { setTxnType("income"); setCategoryId("auto") }} className={cn("rounded-2xl border px-4 py-2.5 text-sm font-bold transition", txnType === "income" ? "border-transparent bg-emerald-500/15 text-emerald-500" : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]")}>{tr("Pendapatan", "Income")}</button>
              </div>
              <div className="relative mt-3">
                <button type="button" onClick={() => setWalletDropdownOpen((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-left text-sm font-bold text-[var(--text)] transition hover:border-indigo-500/60">
                  <span className="truncate">{selectedWalletLabel}</span>
                  <span className={cn("ml-3 text-xs text-[var(--muted)] transition", walletDropdownOpen && "rotate-180")}>⌄</span>
                </button>
                {walletDropdownOpen && wallets.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 max-h-48 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-2xl">
                      {wallets.map((wallet) => {
                        const label = wallet.label || wallet.name || `Wallet ${wallet.id}`
                        const active = String(wallet.id) === walletId
                        return (
                          <button key={wallet.id} type="button" onClick={() => { setWalletId(String(wallet.id)); setWalletDropdownOpen(false) }} className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition", active ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--text)] hover:bg-[var(--surface-tint)]")}>
                            <span className="truncate">{label}</span>
                            {active && <span className="ml-2 text-xs">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
              </div>
              <div className="relative mt-3">
                <button type="button" onClick={() => setCategoryDropdownOpen((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-left text-sm font-bold text-[var(--text)] transition hover:border-indigo-500/60">
                  <span className="truncate">{selectedCategoryLabel}</span>
                  <span className={cn("ml-3 text-xs text-[var(--muted)] transition", categoryDropdownOpen && "rotate-180")}>⌄</span>
                </button>
                {categoryDropdownOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 max-h-48 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-2xl">
                      <button type="button" onClick={() => { setCategoryId("auto"); setCategoryDropdownOpen(false) }} className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition", categoryId === "auto" ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--text)] hover:bg-[var(--surface-tint)]")}>
                        <span className="truncate">{tr("Auto kategori", "Auto category")}</span>
                        {categoryId === "auto" && <span className="ml-2 text-xs">✓</span>}
                      </button>
                      {categories.filter((category) => category.kind === txnType).map((category) => {
                        const active = String(category.id) === categoryId
                        return (
                          <button key={category.id} type="button" onClick={() => { setCategoryId(String(category.id)); setCategoryDropdownOpen(false) }} className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition", active ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--text)] hover:bg-[var(--surface-tint)]")}>
                            <span className="truncate">{category.name}</span>
                            {active && <span className="ml-2 text-xs">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
              </div>
              {sendError && <p className="mt-3 text-sm font-semibold text-rose-500">{sendError}</p>}
              <button type="submit" disabled={sending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-violet-600 disabled:opacity-60">
                <Send size={16} />
                {sending ? tr("Menyimpan...", "Saving...") : tr("Simpan transaksi", "Save transaction")}
              </button>
            </form>
          </div>
        </>
      ) : null

  const successDialog = successInfo ? (
        <>
 <div className="fixed inset-0 z-[220] bg-transparent" onClick={() => setSuccessInfo(null)} />
 <div className="fixed inset-0 z-[221] flex items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">{tr("Selesai", "Done")}</p>
              <h3 className="mt-1 text-xl font-black text-[var(--text)]">{tr("Transaksi disimpan", "Transaction saved")}</h3>
              <div className="mt-4 space-y-2 rounded-2xl bg-[var(--surface-tint)] p-4 text-sm">
                <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">{tr("Title", "Title")}</span><span className="text-right font-bold text-[var(--text)]">{successInfo.title}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">{tr("Jumlah", "Amount")}</span><span className="font-bold text-[var(--text)]">RM {successInfo.amount.toFixed(2)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">{tr("Wallet", "Wallet")}</span><span className="text-right font-bold text-[var(--text)]">{successInfo.wallet}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">{tr("Baki wallet", "Wallet balance")}</span><span className="font-bold text-[var(--text)]">{typeof successInfo.balance === "number" ? `RM ${successInfo.balance.toFixed(2)}` : "-"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">{tr("Kategori", "Category")}</span><span className="text-right font-bold text-[var(--text)]">{successInfo.category}</span></div>
              </div>
              <button type="button" onClick={() => setSuccessInfo(null)} className="mt-4 w-full rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-violet-600">OK</button>
            </div>
          </div>
        </>
      ) : null

  const keypad = (
    <div className={embedded ? "px-2 pb-2 pt-0" : "p-2"}>
      <div className={cn("grid grid-cols-4", embedded ? "gap-1" : "gap-1.5")}>
        <button onClick={clearDisplay} className={cn(sharedBtn, embedded ? "h-10" : "h-11", "bg-rose-500/10 text-xs font-bold text-rose-500 hover:bg-rose-500/20")}>C</button>
        <button onClick={handlePercentage} className={cn(sharedBtn, numCls, embedded ? "h-10" : "h-11", "text-xs")}>%</button>
        <button onClick={handleBackspace} className={cn(sharedBtn, numCls, embedded ? "h-10" : "h-11")}><Delete size={15} /></button>
        <button onClick={() => handleOperator("÷")} className={cn(sharedBtn, opCls, embedded ? "h-10" : "h-11")}>÷</button>
        {["7", "8", "9"].map((num) => <button key={num} onClick={() => handleNumber(num)} className={cn(sharedBtn, numCls, embedded ? "h-10" : "h-11")}>{num}</button>)}
        <button onClick={() => handleOperator("×")} className={cn(sharedBtn, opCls, embedded ? "h-10" : "h-11")}>×</button>
        {["4", "5", "6"].map((num) => <button key={num} onClick={() => handleNumber(num)} className={cn(sharedBtn, numCls, embedded ? "h-10" : "h-11")}>{num}</button>)}
        <button onClick={() => handleOperator("-")} className={cn(sharedBtn, opCls, embedded ? "h-10" : "h-11")}>−</button>
        {["1", "2", "3"].map((num) => <button key={num} onClick={() => handleNumber(num)} className={cn(sharedBtn, numCls, embedded ? "h-10" : "h-11")}>{num}</button>)}
        <button onClick={() => handleOperator("+")} className={cn(sharedBtn, opCls, embedded ? "h-10" : "h-11")}>+</button>
        <button onClick={() => handleNumber("0")} className={cn(sharedBtn, numCls, embedded ? "h-10" : "h-11")}>0</button>
        <button onClick={handleDecimal} className={cn(sharedBtn, numCls, embedded ? "h-10" : "h-11")}>.</button>
        <button onClick={handleEquals} className={cn(sharedBtn, "col-span-2 bg-[var(--btn-primary-bg)] font-bold text-[var(--btn-primary-text)] hover:opacity-90", embedded ? "h-10" : "h-11")}>=</button>
      </div>
    </div>
  )

  const calcCard = (
    <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{tr("Kalkulator", "Calculator")}</span>
        {embedded ? (
          history.length > 0 ? (
            <button onClick={clearHistory} className="rounded-full px-2.5 py-1 text-[0.65rem] font-semibold text-rose-500 transition-colors hover:bg-rose-500/10">
              {tr("Kosongkan", "Clear")}
            </button>
          ) : (
            <span className="h-6 w-6" aria-hidden="true" />
          )
        ) : (
          <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]">
            <X size={15} />
          </button>
        )}
      </div>
      <div className="px-4 pt-3 pb-2">
        <div className="min-h-[1rem] truncate text-right text-[0.625rem] text-[var(--muted)]">{expression || "\u00a0"}</div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={openSendTransaction} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] transition active:scale-95 hover:bg-violet-600" aria-label="Send transaction">
            <Send size={17} />
          </button>
          <div className="min-w-0 flex-1 truncate text-right text-3xl font-bold tracking-tight text-[var(--text)]">{display}</div>
        </div>
      </div>
      {history.length > 0 && (
        <div className="mx-4 mb-2 max-h-[72px] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/70">
          {history.slice(0, 3).map((entry, index) => (
            <button key={`${entry.timestamp}-${index}`} onClick={() => useHistoryEntry(entry)} className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[var(--surface-tint-strong)]">
              <span className="max-w-[180px] truncate text-[0.625rem] text-[var(--muted)]">{entry.expression}</span>
              <span className="text-xs font-bold text-[var(--text)]">{entry.result}</span>
            </button>
          ))}
        </div>
      )}
      {keypad}
    </div>
  )

  if (embedded) {
    return (
      <>
        {/* Compact stack: display + divider + keypad */}
        <div className="flex flex-col">
          <div className="shrink-0 px-3 pb-2.5 pt-2">
            <div className="min-h-[0.85rem] truncate text-right text-[0.58rem] font-medium leading-none text-[var(--muted)]">
              {expression || "\u00a0"}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={openSendTransaction}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] transition hover:opacity-90 active:scale-95"
                aria-label="Send transaction"
              >
                <Send size={14} />
              </button>
              <div className="min-w-0 flex-1 truncate text-right text-[1.35rem] font-black leading-none tracking-tight text-[var(--text)] tabular-nums">
                {display}
              </div>
            </div>
          </div>
          <div className="mx-3 border-t border-[var(--border)]" aria-hidden />
          <div className="pt-1.5">
            {keypad}
          </div>
        </div>
        {sendDialog}
        {successDialog}
      </>
    )
  }

  return (
    <>
      {sendDialog}
      {successDialog}
      {isDesktop && (
        <>
          <button
            id="calc-dt-btn"
            ref={buttonRef}
            type="button"
            onClick={() => setOpen(!open)}
            className="hidden"
            aria-label="Calculator"
          />

          
            {open && (
              <>
                <div
                  className="fixed inset-0 z-[59] bg-transparent"
                  onClick={() => setOpen(false)}
                />
                <div
                  id="calc-panel"
                  ref={panelRef}
                  className="fixed bottom-24 left-1/2 z-[62] w-[300px] -translate-x-1/2"
                >
                  {calcCard}
                </div>
              </>
            )}
          
        </>
      )}

      {!isDesktop && !hideFab && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "fixed bottom-[72px] left-3 z-50 lg:hidden",
            "flex h-12 w-12 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] transition-all active:scale-95",
            open && "pointer-events-none opacity-0",
          )}
          aria-label={open ? "Close Calculator" : "Open Calculator"}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="4" y="2" width="16" height="20" rx="3" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="16" y2="10" />
            <line x1="8" y1="14" x2="14" y2="14" />
          </svg>
        </button>
      )}

      {!isDesktop && open && (
        <>
          <div
            className="fixed inset-0 z-[160] bg-transparent"
            onClick={() => setOpen(false)}
          />
 <div className="fixed inset-0 z-[160] flex items-end justify-center px-3 pb-3 overscroll-none">
            <div
              id="calc-panel"
              ref={panelRef}
              className="w-full max-w-md overscroll-contain"
            >
              {calcCard}
            </div>
          </div>
        </>
      )}
    </>
  )
}
