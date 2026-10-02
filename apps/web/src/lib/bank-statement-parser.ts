/**
 * Bank Statement Parser
 * Handles CSV, TSV, and unstructured copy-pasted text from Malaysian bank statements
 * (Maybank, CIMB, Bank Islam, RHB, Public Bank, Hong Leong, TNG eWallet, etc.)
 */

export type BankTransactionRow = {
  id: string
  date: string // YYYY-MM-DD
  rawDate: string
  description: string
  amount: number // positive float
  type: "expense" | "income"
  balance?: number
  reference?: string
  selected?: boolean
}

export type ParseStatementResult = {
  transactions: BankTransactionRow[]
  /** Rows that looked like transactions but had no readable date or amount. */
  skipped?: number
  totalDebit: number
  totalCredit: number
  netChange: number
  statementStartDate?: string
  statementEndDate?: string
  error?: string
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7,
  aug: 8, ogo: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
}

function isoDate(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  // Reject 31 Feb, month 13 and the like instead of letting Date roll them over.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return ""
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * Normalize a date into YYYY-MM-DD, or "" when it is not a real date.
 * Malaysian statements write day first (14/08/2026, 14-08-26, 14 Aug 2026, 14 OGOS 26).
 * An unreadable date used to become today's date, which put the row on the wrong day
 * and matched it against the wrong transactions.
 */
export function normalizeDate(dateStr: string): string {
  const text = String(dateStr || "").trim()
  if (!text) return ""

  let m = text.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:\D.*)?$/)
  if (m) return isoDate(+m[1], +m[2], +m[3])

  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\D.*)?$/)
  if (m) return isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])

  m = text.match(/^(\d{1,2})[\s/.-]+([A-Za-z]{3,9})\.?[\s/.-]+(\d{2}|\d{4})(?:\D.*)?$/)
  if (m) {
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
    if (!month) return ""
    return isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], month, +m[1])
  }
  return ""
}

/**
 * Clean and parse monetary amounts e.g. "RM 1,234.50", "(50.00)", "-10.00", "120.00 CR"
 */
export function parseAmount(val: string | number): { amount: number; isNegative: boolean } {
  if (typeof val === "number") {
    return { amount: Math.abs(val), isNegative: val < 0 }
  }

  const str = String(val || "").trim()
  const isParenNegative = /^\(.*\)$/.test(str)
  const isMinusNegative = /^[^\d]*-\s*[\d.,]|[\d.,]\s*-\s*(?:dr)?\s*$/i.test(str)
  const isDR = /\b(dr|debit|keluar)\b/i.test(str)
  const isCR = /\b(cr|credit|masuk)\b/i.test(str)

  const cleanNumStr = str.replace(/[^\d.]/g, "")
  const num = parseFloat(cleanNumStr) || 0

  const isNegative = isParenNegative || isMinusNegative || (isDR && !isCR)
  return { amount: num, isNegative }
}

/**
 * Parses simple CSV / TSV text taking into account quoted fields
 */
function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  const result: string[][] = []

  for (const line of lines) {
    if (!line.trim()) continue

    // Check if TSV (tab separated)
    if (line.includes("\t") && !line.includes(",")) {
      result.push(line.split("\t").map((c) => c.trim().replace(/^"|"$/g, "")))
      continue
    }

    const row: string[] = []
    let insideQuote = false
    let currentCell = ""

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        insideQuote = !insideQuote
      } else if (char === "," && !insideQuote) {
        row.push(currentCell.trim().replace(/^"|"$/g, ""))
        currentCell = ""
      } else {
        currentCell += char
      }
    }
    row.push(currentCell.trim().replace(/^"|"$/g, ""))
    result.push(row)
  }

  return result
}

/**
 * Auto-detect columns from CSV headers
 */
function detectColumns(headers: string[]) {
  const lower = headers.map((h) => h.toLowerCase().trim())
  const word = (re: RegExp) => lower.findIndex((h) => re.test(h))

  // Short tokens such as "in", "out", "dr" and "cr" must match as whole words: a plain
  // substring test took "Posting Date" for a credit column and "Description" for a debit one.
  let dateIdx = word(/\b(date|tarikh)\b|posting/)
  let descIdx = word(/\b(desc\w*|perihal|details?|keterangan|transaction|merchant|payee|particulars?)\b/)
  const debitIdx = word(/\b(debit|keluar|withdrawals?|dr)\b/)
  const creditIdx = word(/\b(credit|masuk|deposits?|cr)\b/)
  const amountIdx = word(/\b(amount|jumlah|amaun)\b/)
  const balanceIdx = word(/\b(balance|baki)\b/)
  const typeIdx = word(/^(type|jenis|cr\/dr|dr\/cr)$/)

  if (dateIdx === -1) dateIdx = 0
  if (descIdx === -1 || descIdx === dateIdx) descIdx = dateIdx === 1 ? 2 : 1

  return { dateIdx, descIdx, debitIdx, creditIdx, amountIdx, balanceIdx, typeIdx }
}

/**
 * Parse CSV / Tabular Statement
 */
export function parseCsvStatement(content: string): ParseStatementResult {
  const rows = parseCsvRows(content)
  if (rows.length === 0) {
    return { transactions: [], totalDebit: 0, totalCredit: 0, netChange: 0, error: "Fail kosong." }
  }

  // Find header row (usually contains words like date, desc, amount, debit, credit)
  let headerIndex = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const rowStr = rows[i].join(" ").toLowerCase()
    if (
      rowStr.includes("date") ||
      rowStr.includes("tarikh") ||
      rowStr.includes("amount") ||
      rowStr.includes("jumlah") ||
      rowStr.includes("debit") ||
      rowStr.includes("credit") ||
      rowStr.includes("description")
    ) {
      headerIndex = i
      break
    }
  }

  const headers = headerIndex >= 0 ? rows[headerIndex] : ["Date", "Description", "Amount"]
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows
  const col = detectColumns(headers)

  const transactions: BankTransactionRow[] = []
  let totalDebit = 0
  let totalCredit = 0
  let skipped = 0

  // A statement with one signed amount column marks debits with a minus. Without any minus
  // there is nothing to tell the direction from, so every row is read as money out.
  const usesSigns =
    col.debitIdx < 0 && col.amountIdx >= 0 && dataRows.some((r) => parseAmount(r[col.amountIdx] || "").isNegative)

  dataRows.forEach((row, idx) => {
    if (row.length < 2) return

    const rawDate = row[col.dateIdx] || ""
    if (!rawDate || !/\d/.test(rawDate)) return // skip summary/empty rows

    const date = normalizeDate(rawDate)
    if (!date) {
      skipped++
      return
    }
    const description = (row[col.descIdx] || "Transaksi").replace(/\s+/g, " ").trim()

    let amount = 0
    let type: "expense" | "income" = "expense"

    if (col.debitIdx >= 0 && col.creditIdx >= 0) {
      const debitStr = row[col.debitIdx] || ""
      const creditStr = row[col.creditIdx] || ""
      const debitParsed = parseAmount(debitStr)
      const creditParsed = parseAmount(creditStr)

      if (debitParsed.amount > 0) {
        amount = debitParsed.amount
        type = "expense"
      } else if (creditParsed.amount > 0) {
        amount = creditParsed.amount
        type = "income"
      }
    } else if (col.amountIdx >= 0) {
      const amountParsed = parseAmount(row[col.amountIdx] || "")
      amount = amountParsed.amount

      if (col.typeIdx >= 0) {
        const typeStr = (row[col.typeIdx] || "").toLowerCase()
        if (typeStr.includes("cr") || typeStr.includes("in") || typeStr.includes("credit") || typeStr.includes("masuk")) {
          type = "income"
        } else {
          type = "expense"
        }
      } else {
        if (usesSigns) type = amountParsed.isNegative ? "expense" : "income"
        else type = /transfer in|duitnow in|salary|gaji|refund|deposit|cash in|credit/i.test(description) ? "income" : "expense"
      }
    }

    if (amount <= 0) {
      skipped++
      return
    }

    let balance: number | undefined = undefined
    if (col.balanceIdx >= 0 && row[col.balanceIdx]) {
      const b = parseAmount(row[col.balanceIdx])
      balance = b.amount
    }

    if (type === "expense") {
      totalDebit += amount
    } else {
      totalCredit += amount
    }

    transactions.push({
      id: `bank-txn-${idx + 1}-${Date.now()}`,
      date,
      rawDate,
      description,
      amount,
      type,
      balance,
      selected: true,
    })
  })

  // Sort by date ascending
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const startDate = transactions.length > 0 ? transactions[0].date : undefined
  const endDate = transactions.length > 0 ? transactions[transactions.length - 1].date : undefined

  return {
    transactions,
    skipped,
    totalDebit,
    totalCredit,
    netChange: totalCredit - totalDebit,
    statementStartDate: startDate,
    statementEndDate: endDate,
  }
}

/**
 * Parse Freeform Text Copy-Pasted from Online Banking (Maybank, CIMB, PDF text)
 */
export function parseTextStatement(text: string): ParseStatementResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const transactions: BankTransactionRow[] = []
  let totalDebit = 0
  let totalCredit = 0
  let skipped = 0

  // Regex patterns for Malaysian Bank Statements
  // Date formats: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY
  const dateRegex = /(\b\d{1,2}[\s/-](?:Jan|Feb|Mar|Mac|Apr|May|Mei|Jun|Jul|Aug|Ogos|Sep|Oct|Okt|Nov|Dec|\d{1,2})[\s/-]\d{2,4}\b)/i
  const amountRegex = /(?:RM\s*)?([+-]?\d{1,3}(?:,\d{3})*\.\d{2})(?:\s*(DR|CR|Debit|Credit))?/i

  lines.forEach((line, idx) => {
    const dateMatch = line.match(dateRegex)
    if (!dateMatch) return

    const rawDate = dateMatch[1]
    const date = normalizeDate(rawDate)
    if (!date) {
      skipped++
      return
    }

    // Remove the date from the line to find description and amount
    let lineRest = line.replace(rawDate, "").trim()

    const amountMatches = Array.from(lineRest.matchAll(/(?:RM\s*)?([+-]?\d{1,3}(?:,\d{3})*\.\d{2})(?:\s*(DR|CR|Debit|Credit))?/gi))
    if (amountMatches.length === 0) return

    // Bank PDF rows commonly end with `transaction amount · running balance`.
    // The balance can repeat across extracted rows; never treat it as the transaction.
    const markedMatch = amountMatches.find((m) => m[2])
    const match = markedMatch || (amountMatches.length > 1 ? amountMatches[amountMatches.length - 2] : amountMatches[0])
    const numStr = match[1]
    const indicator = (match[2] || "").toUpperCase()

    const parsed = parseAmount(numStr)
    let amount = parsed.amount
    if (amount <= 0) return

    let type: "expense" | "income" = "expense"
    if (indicator === "CR" || indicator === "CREDIT" || numStr.startsWith("+")) {
      type = "income"
    } else if (indicator === "DR" || indicator === "DEBIT" || numStr.startsWith("-")) {
      type = "expense"
    } else if (/transfer in|duitnow in|salary|gaji|refund|deposit|cash in/i.test(lineRest)) {
      type = "income"
    }

    // Clean description
    let description = lineRest
      .replace(match[0], "")
      .replace(/\b(RM|DR|CR)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()

    if (!description || description.length < 2) {
      description = `Transaksi ${type === "expense" ? "Perbelanjaan" : "Pendapatan"}`
    }

    if (type === "expense") totalDebit += amount
    else totalCredit += amount

    transactions.push({
      id: `text-txn-${idx + 1}-${Date.now()}`,
      date,
      rawDate,
      description,
      amount,
      type,
      selected: true,
    })
  })

  // Fallback to CSV if text parser didn't find lines with typical bank statement regex
  if (transactions.length === 0 && (text.includes(",") || text.includes("\t"))) {
    return parseCsvStatement(text)
  }

  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return {
    transactions,
    skipped,
    totalDebit,
    totalCredit,
    netChange: totalCredit - totalDebit,
    statementStartDate: transactions[0]?.date,
    statementEndDate: transactions[transactions.length - 1]?.date,
  }
}
