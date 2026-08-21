import { BankTransactionRow } from "./bank-statement-parser"

export type AppTransaction = {
  id: string | number
  amount: number
  type: "expense" | "income" | string
  date: string // YYYY-MM-DD
  description?: string
  notes?: string
  category_name?: string
  category_id?: number | null
  wallet_id?: number | null
  wallet_name?: string | null
  is_wallet_transfer?: boolean
  is_debt_movement?: boolean
}

export type MatchedPair = {
  id: string
  bankTxn: BankTransactionRow
  appTxn: AppTransaction
  confidence: "exact" | "high" | "partial"
  dateDiffDays: number
}

export type ReconciliationResult = {
  matched: MatchedPair[]
  missingInApp: BankTransactionRow[]
  missingInBank: AppTransaction[]
  summary: {
    totalBankTxns: number
    totalAppTxns: number
    matchedCount: number
    missingInAppCount: number
    missingInBankCount: number
    matchRatePercent: number
    bankDebitTotal: number
    bankCreditTotal: number
    appExpenseTotal: number
    appIncomeTotal: number
    bankNet: number
    appNet: number
    netVariance: number
  }
}

/**
 * Calculates date difference in days (|dateA - dateB|)
 */
function getDaysDiff(dateStrA: string, dateStrB: string): number {
  const tA = new Date(dateStrA).getTime()
  const tB = new Date(dateStrB).getTime()
  if (isNaN(tA) || isNaN(tB)) return 999
  const diffMs = Math.abs(tA - tB)
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Basic word overlap string similarity (0.0 to 1.0)
 */
function textSimilarity(strA: string, strB: string): number {
  const cleanA = (strA || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/)
  const cleanB = (strB || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/)
  if (!cleanA.length || !cleanB.length) return 0

  let matches = 0
  cleanA.forEach((w) => {
    if (w.length > 2 && cleanB.includes(w)) matches++
  })

  return matches / Math.max(cleanA.length, cleanB.length)
}

/**
 * Main Reconciliation Matching Engine
 */
export function reconcileStatements(
  bankTxns: BankTransactionRow[],
  appTxns: AppTransaction[],
  options: {
    maxDateToleranceDays?: number
  } = {}
): ReconciliationResult {
  const maxDays = options.maxDateToleranceDays ?? 3

  const matched: MatchedPair[] = []
  const usedAppTxnIds = new Set<string | number>()
  const usedBankTxnIds = new Set<string>()

  // Filter out internal transfers from app txns if desired
  const filteredAppTxns = appTxns.filter((tx) => !tx.is_wallet_transfer && !tx.is_debt_movement)

  // Scope the reverse check ("missing in bank") to the statement's date range.
  // App transactions outside the statement period are irrelevant, not missing.
  const bankDates = bankTxns.map((t) => new Date(t.date).getTime()).filter((t) => !isNaN(t))
  const rangeStart = bankDates.length ? Math.min(...bankDates) - maxDays * 86400000 : null
  const rangeEnd = bankDates.length ? Math.max(...bankDates) + maxDays * 86400000 : null
  const inRangeAppTxns = rangeStart === null ? [] : filteredAppTxns.filter((tx) => {
    const t = new Date(tx.date).getTime()
    if (isNaN(t)) return false
    return rangeStart !== null && rangeEnd !== null && t >= rangeStart && t <= rangeEnd
  })

  // 1. Pass 1: Exact amount, same type, same date (0 days)
  bankTxns.forEach((bankTxn) => {
    if (usedBankTxnIds.has(bankTxn.id)) return

    const candidate = inRangeAppTxns.find((appTxn) => {
      if (usedAppTxnIds.has(appTxn.id)) return false
      const amountMatch = Math.abs(Number(appTxn.amount) - bankTxn.amount) < 0.01
      const typeMatch = appTxn.type === bankTxn.type
      const dateMatch = appTxn.date === bankTxn.date
      return amountMatch && typeMatch && dateMatch
    })

    if (candidate) {
      usedBankTxnIds.add(bankTxn.id)
      usedAppTxnIds.add(candidate.id)
      matched.push({
        id: `match-exact-${bankTxn.id}-${candidate.id}`,
        bankTxn,
        appTxn: candidate,
        confidence: "exact",
        dateDiffDays: 0,
      })
    }
  })

  // 2. Pass 2: Exact amount, same type, date within maxDays tolerance (1 to maxDays)
  bankTxns.forEach((bankTxn) => {
    if (usedBankTxnIds.has(bankTxn.id)) return

    let bestCandidate: AppTransaction | null = null
    let bestDaysDiff = 999

    filteredAppTxns.forEach((appTxn) => {
      if (usedAppTxnIds.has(appTxn.id)) return
      const amountMatch = Math.abs(Number(appTxn.amount) - bankTxn.amount) < 0.01
      const typeMatch = appTxn.type === bankTxn.type
      if (!amountMatch || !typeMatch) return

      const days = getDaysDiff(bankTxn.date, appTxn.date)
      if (days <= maxDays && days < bestDaysDiff) {
        bestCandidate = appTxn
        bestDaysDiff = days
      }
    })
    if (bestCandidate) {
      const cand = bestCandidate as AppTransaction
      usedBankTxnIds.add(bankTxn.id)
      usedAppTxnIds.add(cand.id)
      matched.push({
        id: `match-high-${bankTxn.id}-${cand.id}`,
        bankTxn,
        appTxn: cand,
        confidence: "high",
        dateDiffDays: bestDaysDiff,
      })
    }
  })

  // 3. Pass 3: Exact amount, wider date tolerance up to 7 days if text has similarity
  bankTxns.forEach((bankTxn) => {
    if (usedBankTxnIds.has(bankTxn.id)) return

    let bestCandidate: AppTransaction | null = null
    let bestScore = 0
    let bestDays = 999

    filteredAppTxns.forEach((appTxn) => {
      if (usedAppTxnIds.has(appTxn.id)) return
      const amountMatch = Math.abs(Number(appTxn.amount) - bankTxn.amount) < 0.01
      const typeMatch = appTxn.type === bankTxn.type
      if (!amountMatch || !typeMatch) return

      const days = getDaysDiff(bankTxn.date, appTxn.date)
      if (days <= 7) {
        const textSim = textSimilarity(bankTxn.description, `${appTxn.description || ""} ${appTxn.notes || ""}`)
        if (textSim > 0.15 || days <= 4) {
          const score = (10 - days) + textSim * 5
          if (score > bestScore) {
            bestScore = score
            bestCandidate = appTxn
            bestDays = days
          }
        }
      }
    })

    if (bestCandidate) {
      const cand = bestCandidate as AppTransaction
      usedBankTxnIds.add(bankTxn.id)
      usedAppTxnIds.add(cand.id)
      matched.push({
        id: `match-partial-${bankTxn.id}-${cand.id}`,
        bankTxn,
        appTxn: cand,
        confidence: "partial",
        dateDiffDays: bestDays,
      })
    }
  })

  // Unmatched bank transactions (Missing in App)
  const missingInApp = bankTxns.filter((b) => !usedBankTxnIds.has(b.id))

  // Unmatched app transactions (Missing in Statement) — statement period only
  const missingInBank = inRangeAppTxns.filter((a) => !usedAppTxnIds.has(a.id))

  // Calculate totals
  const bankDebitTotal = bankTxns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0)
  const bankCreditTotal = bankTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0)
  const appExpenseTotal = inRangeAppTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0)
  const appIncomeTotal = inRangeAppTxns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0)

  const bankNet = bankCreditTotal - bankDebitTotal
  const appNet = appIncomeTotal - appExpenseTotal
  const netVariance = bankNet - appNet

  const totalBankTxns = bankTxns.length
  const totalAppTxns = inRangeAppTxns.length
  const matchedCount = matched.length
  const matchRatePercent = totalBankTxns > 0 ? Math.round((matchedCount / totalBankTxns) * 100) : 0

  return {
    matched,
    missingInApp,
    missingInBank,
    summary: {
      totalBankTxns,
      totalAppTxns,
      matchedCount,
      missingInAppCount: missingInApp.length,
      missingInBankCount: missingInBank.length,
      matchRatePercent,
      bankDebitTotal,
      bankCreditTotal,
      appExpenseTotal,
      appIncomeTotal,
      bankNet,
      appNet,
      netVariance,
    },
  }
}
