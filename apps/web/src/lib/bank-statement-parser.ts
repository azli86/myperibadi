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
  totalDebit: number
  totalCredit: number
  netChange: number
  statementStartDate?: string
  statementEndDate?: string
  error?: string
}

/**
 * Normalize date strings into YYYY-MM-DD
 */
export function normalizeDate(dateStr: string): string {
  const clean = dateStr.trim().replace(/[/.-]/g, "-")

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)) {
    const [y, m, d] = clean.split("-")
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }

  // Match DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split("-")
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }

  // Match DD-MMM-YYYY (e.g. 14-Aug-2026 or 14-OGOS-2026)
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", mac: "03", apr: "04", may: "05", mei: "05",
    jun: "06", jul: "07", aug: "08", ogos: "08", sep: "09", oct: "10", okt: "10",
    nov: "11", dec: "12", dis: "12",
  }

  const alphaMatch = dateStr.trim().match(/^(\d{1,2})[\s/-]+([A-Za-z]{3,4})[\s/-]+(\d{2,4})$/)
  if (alphaMatch) {
    const day = alphaMatch[1].padStart(2, "0")
    const monthKey = alphaMatch[2].toLowerCase().substring(0, 3)
    const month = monthMap[monthKey] || "01"
    let year = alphaMatch[3]
    if (year.length === 2) year = `20${year}`
    return `${year}-${month}-${day}`
  }

  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
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
  const isMinusNegative = str.includes("-")
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
      result.push(line.split("\t").map((c) => c.trim().replace(/^["']|["']$/g, "")))
      continue
    }

    const row: string[] = []
    let insideQuote = false
    let currentCell = ""

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote
      } else if (char === "," && !insideQuote) {
        row.push(currentCell.trim().replace(/^["']|["']$/g, ""))
        currentCell = ""
      } else {
        currentCell += char
      }
    }
    row.push(currentCell.trim().replace(/^["']|["']$/g, ""))
    result.push(row)
  }

  return result
}

/**
 * Auto-detect columns from CSV headers
 */
function detectColumns(headers: string[]) {
  const lower = headers.map((h) => h.toLowerCase())

  let dateIdx = lower.findIndex((h) => h.includes("date") || h.includes("tarikh") || h.includes("posting"))
  let descIdx = lower.findIndex((h) => h.includes("desc") || h.includes("perihal") || h.includes("details") || h.includes("keterangan") || h.includes("transaction") || h.includes("merchant") || h.includes("payee"))
  let debitIdx = lower.findIndex((h) => h.includes("debit") || h.includes("keluar") || h.includes("withdrawal") || h.includes("out") || h.includes("dr"))
  let creditIdx = lower.findIndex((h) => h.includes("credit") || h.includes("masuk") || h.includes("deposit") || h.includes("in") || h.includes("cr"))
  let amountIdx = lower.findIndex((h) => h.includes("amount") || h.includes("jumlah") || h.includes("amaun"))
  let balanceIdx = lower.findIndex((h) => h.includes("balance") || h.includes("baki"))
  let typeIdx = lower.findIndex((h) => h === "type" || h === "jenis" || h === "cr/dr")

  // Fallbacks if not found
  if (dateIdx === -1) dateIdx = 0
  if (descIdx === -1) descIdx = 1

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

  dataRows.forEach((row, idx) => {
    if (row.length < 2) return

    const rawDate = row[col.dateIdx] || ""
    if (!rawDate || !/\d/.test(rawDate)) return // skip summary/empty rows

    const date = normalizeDate(rawDate)
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
        type = amountParsed.isNegative ? "expense" : "expense" // default
      }
    }

    if (amount <= 0) return

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

  // Regex patterns for Malaysian Bank Statements
  // Date formats: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY
  const dateRegex = /(\b\d{1,2}[\s/-](?:Jan|Feb|Mar|Mac|Apr|May|Mei|Jun|Jul|Aug|Ogos|Sep|Oct|Okt|Nov|Dec|\d{1,2})[\s/-]\d{2,4}\b)/i
  const amountRegex = /(?:RM\s*)?([+-]?\d{1,3}(?:,\d{3})*\.\d{2})(?:\s*(DR|CR|Debit|Credit))?/i

  lines.forEach((line, idx) => {
    const dateMatch = line.match(dateRegex)
    if (!dateMatch) return

    const rawDate = dateMatch[1]
    const date = normalizeDate(rawDate)

    // Remove the date from the line to find description and amount
    let lineRest = line.replace(rawDate, "").trim()

    const amountMatches = Array.from(lineRest.matchAll(/(?:RM\s*)?([+-]?\d{1,3}(?:,\d{3})*\.\d{2})(?:\s*(DR|CR|Debit|Credit))?/gi))
    if (amountMatches.length === 0) return

    // Usually the transaction amount is the first or second amount in line
    const match = amountMatches[0]
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
    totalDebit,
    totalCredit,
    netChange: totalCredit - totalDebit,
    statementStartDate: transactions[0]?.date,
    statementEndDate: transactions[transactions.length - 1]?.date,
  }
}
