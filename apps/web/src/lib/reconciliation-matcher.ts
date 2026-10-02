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
  /** The app records it as the opposite direction to the bank (e.g. income against a debit). */
  directionMismatch?: boolean
}

/** The key that names one bank row against one app record, for "this is not a match". */
export function pairKey(bankId: string, appId: string | number): string {
  return `${bankId}|${appId}`
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
function normalizeDate(value: string): string {
  return String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ""
}

function normalizeType(value: string): "expense" | "income" | "" {
  const type = String(value || "").toLowerCase()
  if (["expense", "debit", "out", "keluar"].includes(type)) return "expense"
  if (["income", "credit", "in", "masuk"].includes(type)) return "income"
  return ""
}

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
    /** Pairs the user said are not the same transaction; they are never matched again. */
    forbiddenPairs?: Set<string>
  } = {}
): ReconciliationResult {
  const maxDays = options.maxDateToleranceDays ?? 3
  const forbidden = options.forbiddenPairs ?? new Set<string>()
  const allowed = (bank: BankTransactionRow, app: AppTransaction) => !forbidden.has(pairKey(bank.id, app.id))
  const sameDirection = (bank: BankTransactionRow, app: AppTransaction) => normalizeType(String(app.type)) === bank.type

  // Maybank pre-authorisation is temporary: pair debit + refund first, then ignore both.
  const cancelledPreAuthIds = new Set<string>()
  bankTxns.forEach((debit) => {
    if (cancelledPreAuthIds.has(debit.id) || debit.type !== "expense" || !/pre[- ]?auth/i.test(debit.description)) return
    const refund = bankTxns.find((credit) =>
      !cancelledPreAuthIds.has(credit.id) &&
      credit.type === "income" &&
      /pre[- ]?auth refund/i.test(credit.description) &&
      Math.abs(credit.amount - debit.amount) < 0.01 &&
      getDaysDiff(credit.date, debit.date) <= 7
    )
    if (refund) {
      cancelledPreAuthIds.add(debit.id)
      cancelledPreAuthIds.add(refund.id)
    }
  })
  const effectiveBankTxns = bankTxns.filter((tx) => !cancelledPreAuthIds.has(tx.id))

  const matched: MatchedPair[] = []
  const usedAppTxnIds = new Set<string | number>()
  const usedBankTxnIds = new Set<string>()

  // A transfer to another wallet and a loan or debt payment are real money leaving or
  // entering this account, so they appear on the statement and must be matched against
  // it. Leaving them out made every such line look "missing in app", and importing it
  // would have recorded the same movement twice.
  const filteredAppTxns = appTxns

  // Scope the reverse check ("missing in bank") to the statement's date range.
  // App transactions outside the statement period are irrelevant, not missing.
  const bankDates = effectiveBankTxns.map((t) => new Date(t.date).getTime()).filter((t) => !isNaN(t))
  const rangeStart = bankDates.length ? Math.min(...bankDates) - maxDays * 86400000 : null
  const rangeEnd = bankDates.length ? Math.max(...bankDates) + maxDays * 86400000 : null
  const withinDays = (tx: AppTransaction, days: number) => {
    if (bankDates.length === 0) return false
    const t = new Date(tx.date).getTime()
    if (isNaN(t)) return false
    return t >= Math.min(...bankDates) - days * 86400000 && t <= Math.max(...bankDates) + days * 86400000
  }
  const inRangeAppTxns = rangeStart === null ? [] : filteredAppTxns.filter((tx) => withinDays(tx, maxDays))
  // A record just outside the statement can still be a late-cleared line's partner, so
  // matching looks a week further than the "missing in bank" report does.
  const matchPool = filteredAppTxns.filter((tx) => withinDays(tx, Math.max(maxDays, 7)))

  // 1. Primary identity: wallet (pre-filtered), absolute amount, exact date.
  // Bank direction remains authoritative for importing; it is not an identity field.
  effectiveBankTxns.forEach((bankTxn) => {
    if (usedBankTxnIds.has(bankTxn.id)) return

    let candidate: AppTransaction | undefined
    let candidateSimilarity = -1
    for (const appTxn of matchPool) {
      if (usedAppTxnIds.has(appTxn.id) || !allowed(bankTxn, appTxn) || !sameDirection(bankTxn, appTxn)) continue
      const amountMatch = Math.abs(Math.abs(Number(appTxn.amount)) - Math.abs(bankTxn.amount)) < 0.01
      const dateMatch = normalizeDate(appTxn.date) === normalizeDate(bankTxn.date)
      if (!amountMatch || !dateMatch) continue
      // Several records with the same amount on one day: the one that reads most like the bank line.
      const similarity = textSimilarity(bankTxn.description, `${appTxn.description || ""} ${appTxn.notes || ""}`)
      if (similarity > candidateSimilarity) {
        candidate = appTxn
        candidateSimilarity = similarity
      }
    }

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

  // 2. Exact amount within settlement-date tolerance. Text breaks equal candidates.
  effectiveBankTxns.forEach((bankTxn) => {
    if (usedBankTxnIds.has(bankTxn.id)) return

    let bestCandidate: AppTransaction | null = null
    let bestDaysDiff = 999
    let bestScore = -1

    matchPool.forEach((appTxn) => {
      if (usedAppTxnIds.has(appTxn.id) || !allowed(bankTxn, appTxn) || !sameDirection(bankTxn, appTxn)) return
      const amountMatch = Math.abs(Math.abs(Number(appTxn.amount)) - Math.abs(bankTxn.amount)) < 0.01
      if (!amountMatch) return

      const days = getDaysDiff(bankTxn.date, appTxn.date)
      const similarity = textSimilarity(bankTxn.description, `${appTxn.description || ""} ${appTxn.notes || ""}`)
      const score = days <= maxDays ? (maxDays - days + 1) * 10 + similarity : -1
      if (score > bestScore) {
        bestCandidate = appTxn
        bestDaysDiff = days
        bestScore = score
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

  // 3. Wider settlement window requires description evidence
  effectiveBankTxns.forEach((bankTxn) => {
    if (usedBankTxnIds.has(bankTxn.id)) return

    let bestCandidate: AppTransaction | null = null
    let bestScore = 0
    let bestDays = 999

    matchPool.forEach((appTxn) => {
      if (usedAppTxnIds.has(appTxn.id) || !allowed(bankTxn, appTxn) || !sameDirection(bankTxn, appTxn)) return
      const amountMatch = Math.abs(Math.abs(Number(appTxn.amount)) - Math.abs(bankTxn.amount)) < 0.01
      if (!amountMatch) return

      const days = getDaysDiff(bankTxn.date, appTxn.date)
      if (maxDays > 0 && days <= 7) {
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

  // 3b. One unmatched bank line and one unmatched record share an amount and a direction,
  // within a week: with no other candidate on either side, they are the same transaction
  // even when the bank cleared it late and the wording shares nothing.
  if (maxDays > 0) {
    const key = (type: string, amount: number) => `${type}|${Math.round(Math.abs(amount) * 100)}`
    const freeBank = effectiveBankTxns.filter((b) => !usedBankTxnIds.has(b.id))
    const freeApp = matchPool.filter((a) => !usedAppTxnIds.has(a.id))
    const bankByKey = new Map<string, BankTransactionRow[]>()
    const appByKey = new Map<string, AppTransaction[]>()
    freeBank.forEach((b) => bankByKey.set(key(b.type, b.amount), [...(bankByKey.get(key(b.type, b.amount)) || []), b]))
    freeApp.forEach((a) => appByKey.set(key(normalizeType(String(a.type)), Number(a.amount)), [...(appByKey.get(key(normalizeType(String(a.type)), Number(a.amount))) || []), a]))
    bankByKey.forEach((banks, k) => {
      const apps = appByKey.get(k) || []
      if (banks.length !== 1 || apps.length !== 1) return
      const bankTxn = banks[0]
      const appTxn = apps[0]
      const days = getDaysDiff(bankTxn.date, appTxn.date)
      if (days > 7 || !allowed(bankTxn, appTxn)) return
      usedBankTxnIds.add(bankTxn.id)
      usedAppTxnIds.add(appTxn.id)
      matched.push({
        id: `match-unique-${bankTxn.id}-${appTxn.id}`,
        bankTxn,
        appTxn,
        confidence: "partial",
        dateDiffDays: days,
      })
    })
  }

  // 4. Same amount and date but recorded the other way round (a debit saved as income, or
  // the reverse). It is the same transaction entered wrongly, so pair it and flag it, rather
  // than call it missing on both sides.
  effectiveBankTxns.forEach((bankTxn) => {
    if (usedBankTxnIds.has(bankTxn.id)) return
    let best: AppTransaction | null = null
    let bestDays = 999
    matchPool.forEach((appTxn) => {
      if (usedAppTxnIds.has(appTxn.id) || !allowed(bankTxn, appTxn) || sameDirection(bankTxn, appTxn)) return
      if (Math.abs(Math.abs(Number(appTxn.amount)) - Math.abs(bankTxn.amount)) >= 0.01) return
      const days = getDaysDiff(bankTxn.date, appTxn.date)
      if (days <= maxDays && days < bestDays) {
        best = appTxn
        bestDays = days
      }
    })
    if (best) {
      const cand = best as AppTransaction
      usedBankTxnIds.add(bankTxn.id)
      usedAppTxnIds.add(cand.id)
      matched.push({
        id: `match-direction-${bankTxn.id}-${cand.id}`,
        bankTxn,
        appTxn: cand,
        confidence: "partial",
        dateDiffDays: bestDays,
        directionMismatch: true,
      })
    }
  })

  // Unmatched bank transactions (Missing in App)
  const missingInApp = effectiveBankTxns.filter((b) => !usedBankTxnIds.has(b.id))

  // Unmatched app transactions (Missing in Statement) — statement period only
  const missingInBank = inRangeAppTxns.filter((a) => !usedAppTxnIds.has(a.id))

  // Calculate totals
  const bankDebitTotal = effectiveBankTxns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0)
  const bankCreditTotal = effectiveBankTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0)
  const appExpenseTotal = inRangeAppTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0)
  const appIncomeTotal = inRangeAppTxns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0)

  const bankNet = bankCreditTotal - bankDebitTotal
  const appNet = appIncomeTotal - appExpenseTotal
  const netVariance = bankNet - appNet

  const totalBankTxns = effectiveBankTxns.length
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
