"use client"

import React, { useMemo } from "react"
import { detectTxnFx } from "@/components/chat/TxnFxOverlay"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  TrendingDown,
  Wallet,
  Table2,
  Sparkles,
  Camera,
  ImageIcon,
  ListOrdered,
  PieChart,
  HelpCircle,
  MessageSquarePlus,
  ArrowRightLeft,
  Languages,
  Bot,
  CreditCard,
  CalendarClock,
  HandCoins,
  Target,
  PlusCircle,
  Banknote,
  MapPin,
} from "lucide-react"

export type ChatAction =
  | { type: "send"; text: string }
  | { type: "attach"; mode: "camera" | "gallery"; txnRef?: string }
  | { type: "open_commands" }

type Props = {
  text: string
  isUser?: boolean
  isLight?: boolean
  lang?: string
  disabled?: boolean
  className?: string
  onAction?: (action: ChatAction) => void
}

type KvRow = { label: string; value: string; tip?: string }
type TableRow = { cells: string[]; amountTone?: "pos" | "neg" | "neutral" }

type ActionIconName =
  | "camera"
  | "gallery"
  | "summary"
  | "list"
  | "wallet"
  | "help"
  | "expense"
  | "transfer"
  | "lang"
  | "budget"
  | "loan"
  | "sub"
  | "debt"
  | "place"
  | "add"
  | "pay"

type ActionBtn = {
  id: string
  label: string
  hint?: string
  variant?: "primary" | "secondary" | "accent"
  icon?: ActionIconName
  action: ChatAction
}

type ActionGroup = {
  id: string
  title: string
  actions: ActionBtn[]
}

type GuideSection = {
  heading?: string
  body: string[]
  codes: string[]
}

type ParsedBlock =
  | { type: "welcome"; title: string; subtitle: string; body?: string; groups: ActionGroup[] }
  | { type: "summary"; title: string; rows: KvRow[]; actions?: ActionBtn[] }
  | { type: "success"; title: string; badge?: string; rows: KvRow[]; actions: ActionBtn[]; kind?: "income" | "expense" }
  | { type: "table"; title?: string; headers?: string[]; rows: TableRow[]; actions?: ActionBtn[] }
  | { type: "wallet"; title: string; rows: KvRow[]; total?: string; actions?: ActionBtn[] }
  | { type: "card"; title?: string; rows: KvRow[]; actions?: ActionBtn[]; tone?: "budget" | "loan" | "sub" | "debt" | "place" | "generic" }
  | { type: "guide"; title: string; intro?: string; sections: GuideSection[]; actions?: ActionBtn[] }
  | { type: "choice"; title: string; body?: string; options: { num: string; label: string }[]; actions: ActionBtn[] }
  | { type: "text"; text: string; actions?: ActionBtn[] }

function stripAsterisks(value: string): string {
  return value.replace(/\*+/g, "").trim()
}

function cleanBullet(line: string): string {
  return line
    .replace(/^[\s]*(?:[•\-\*]|\u2022|├─|└─|│)\s*/u, "")
    .replace(/^[\s]*[│|]\s*/u, "")
    .trim()
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*[^*\n]+\*|`[^`\n]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <strong key={`b-${key++}`} className="font-semibold text-[var(--text)]">
          {token.slice(1, -1)}
        </strong>
      )
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`c-${key++}`}
          className="rounded-md bg-[color:var(--surface-tint)] px-1.5 py-0.5 text-[0.8125rem] font-medium text-[var(--text)]"
        >
          {token.slice(1, -1)}
        </code>
      )
    } else {
      nodes.push(token)
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : [text]
}

function splitKv(line: string): KvRow | null {
  const cleaned = cleanBullet(line)
  if (!cleaned) return null

  // Money lifespan tip ends with "Money status: Critical Mode" — don't put the essay in the label.
  const moneyStatus = cleaned.match(
    /^(.*?)(?:Money status|Status duit)\s*[:：]\s*(Critical Mode|Nazak|Comfortable|Sempoi|Be Careful|Kena jaga|Tight Budget|Ketat)\.?\s*$/i
  )
  if (moneyStatus) {
    const tip = stripAsterisks(moneyStatus[1] || "").trim()
    const status = stripAsterisks(moneyStatus[2] || "").trim()
    const isBmTip = /baki|belanja|pendapatan|hari|duit/i.test(tip)
    return {
      label: isBmTip ? "Status duit" : "Money status",
      value: status,
      tip: tip || undefined,
    }
  }

  const colon = cleaned.match(/^(.+?)\s*[:：]\s*(.+)$/)
  if (colon) {
    const label = stripAsterisks(colon[1])
    const value = stripAsterisks(colon[2])
    // If label is a long paragraph, treat whole thing as tip + short value
    if (label.length > 48) {
      const statusInValue = value.match(
        /^(Critical Mode|Nazak|Comfortable|Sempoi|Be Careful|Kena jaga|Tight Budget|Ketat)\.?$/i
      )
      if (statusInValue) {
        return {
          label: /status duit|baki|belanja/i.test(label) ? "Status duit" : "Money status",
          value: statusInValue[1],
          tip: label,
        }
      }
      return { label: "Tip", value: value.length <= 32 ? value : "—", tip: label }
    }
    return { label, value }
  }
  return null
}

/** Long money-lifespan tips: keep status badge on one row, tip below. */
function normalizeSuccessRows(rows: KvRow[]): KvRow[] {
  return rows.map((row) => {
    if (row.tip) return row
    const label = row.label.trim()
    const value = row.value.trim()

    if (label.length > 48) {
      const statusInValue = value.match(
        /^(Critical Mode|Nazak|Comfortable|Sempoi|Be Careful|Kena jaga|Tight Budget|Ketat)\.?$/i
      )
      if (statusInValue) {
        return {
          label: /status duit|baki|belanja/i.test(label) ? "Status duit" : "Money status",
          value: statusInValue[1],
          tip: label,
        }
      }
      return { label: "Tip", value: value.length <= 32 ? value : "—", tip: `${label}${value ? ` ${value}` : ""}`.trim() }
    }

    return row
  })
}

function isAmountish(value: string): boolean {
  return /(?:RM\s*)?[+\-]?\d[\d,]*(?:\.\d+)?/i.test(value) || /private/i.test(value)
}

function amountTone(value: string): "pos" | "neg" | "neutral" {
  const v = value.trim()
  if (v.startsWith("+")) return "pos"
  if (v.startsWith("-")) return "neg"
  return "neutral"
}

function detectTableRow(line: string): TableRow | null {
  const cleaned = cleanBullet(line)
  if (!cleaned || !cleaned.includes("|")) return null
  const cells = cleaned.split("|").map((c) => stripAsterisks(c.trim())).filter(Boolean)
  if (cells.length < 2) return null
  const last = cells[cells.length - 1] || ""
  return { cells, amountTone: amountTone(last) }
}

function looksLikeTreeList(lines: string[]): boolean {
  return lines.some((l) => /^(?:├─|└─)/.test(l.trim()))
}

/** Free-form help / assistant essays (not real KV records). */
function isFreeformGuide(lines: string[]): boolean {
  if (lines.length < 4) return false
  let realKv = 0
  let longProse = 0
  let emptyValueRows = 0
  for (const line of lines) {
    const plain = stripAsterisks(cleanBullet(line))
    if (!plain) continue
    if (plain.length > 55) longProse += 1
    const kv = splitKv(line)
    if (kv && kv.label.length <= 28 && kv.value.length > 0 && kv.value.length < 60 && !kv.tip) {
      realKv += 1
    } else if (kv && (kv.label.length > 40 || !!kv.tip)) {
      longProse += 1
    } else if (!kv) {
      emptyValueRows += 1
    }
  }
  const helpCue = lines.some((l) =>
    /help you out|here's what you can|what you can do instead|don't have a dedicated|tidak ada|boleh buat|contoh|example|for tracking|for recording|need to see|type ['"`]|use subscription|use debt/i.test(
      stripAsterisks(l)
    )
  )
  return helpCue || (longProse >= 2 && realKv <= 2) || (emptyValueRows >= 4 && realKv <= 2)
}

function extractInlineCodes(text: string): { text: string; codes: string[] } {
  const codes: string[] = []
  const cleaned = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code.trim())
    return " "
  }).replace(/\s+/g, " ").trim()
  return { text: cleaned, codes }
}

function isGuideHeading(line: string, next?: string): boolean {
  const plain = stripAsterisks(cleanBullet(line)).trim()
  if (!plain || plain.length > 72) return false
  if (/[.!?]$/.test(plain) && plain.length > 40) return false
  if (/^(For |Use |Need |Type |Just |Example|Untuk |Guna |Contoh|Cara )/i.test(plain)) return true
  if (plain.length <= 42 && next && stripAsterisks(cleanBullet(next)).length > plain.length + 10) {
    if (!/^(Note|Wallet|Category|Amount|Date|Current Balance|Money status|Status duit)\b/i.test(plain)) {
      return !/^\d+[.)]/.test(plain)
    }
  }
  return false
}

function parseGuideFromLines(lines: string[], actions?: ActionBtn[]): ParsedBlock {
  const title = stripAsterisks(lines[0] || "Help")
  const sections: GuideSection[] = []
  const introParts: string[] = []
  let current: GuideSection | null = null

  const pushCurrent = () => {
    if (!current) return
    if (current.heading || current.body.length || current.codes.length) sections.push(current)
    current = null
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    const plain = stripAsterisks(cleanBullet(raw)).trim()
    if (!plain) continue
    const next = lines[i + 1]

    if (isGuideHeading(plain, next)) {
      pushCurrent()
      current = { heading: plain, body: [], codes: [] }
      continue
    }

    const extracted = extractInlineCodes(plain)
    // Whole line is mostly a command example
    const quotedOnly = plain.match(/^['"`](.+?)['"`]$/)
    const looksLikeCmd =
      /^(?:subx|loanx|debt|lend|borrow|budget|list|summary|transfer|checkwallet|makan|beli)\b/i.test(plain) ||
      !!quotedOnly ||
      (/^[`']/.test(raw.trim()) && plain.length < 90)
    if (looksLikeCmd && plain.length < 100) {
      const code = (quotedOnly?.[1] || plain).replace(/^['"`]+|['"`]+$/g, "").trim()
      if (current) current.codes.push(code)
      else if (sections.length) sections[sections.length - 1].codes.push(code)
      else {
        current = { body: [], codes: [code] }
      }
      continue
    }

    if (current) {
      if (extracted.text) current.body.push(extracted.text)
      current.codes.push(...extracted.codes)
    } else if (sections.length === 0) {
      if (extracted.text) introParts.push(extracted.text)
      if (extracted.codes.length) {
        current = { body: [], codes: extracted.codes }
      }
    } else {
      const last = sections[sections.length - 1]
      if (extracted.text) last.body.push(extracted.text)
      last.codes.push(...extracted.codes)
    }
  }
  pushCurrent()

  return {
    type: "guide",
    title,
    intro: introParts.join(" ").trim() || undefined,
    sections,
    actions,
  }
}

function extractTxnRef(text: string): string | undefined {
  const m = text.match(/\b(TXN\d{2}-[A-Z0-9]{6})\b/i)
  return m ? m[1].toUpperCase() : undefined
}

function isBm(lang?: string) {
  return (lang || "BM").toUpperCase() !== "EN"
}

function sendBtn(
  id: string,
  label: string,
  text: string,
  opts?: { hint?: string; icon?: ActionIconName; variant?: ActionBtn["variant"] }
): ActionBtn {
  return {
    id,
    label,
    hint: opts?.hint,
    icon: opts?.icon,
    variant: opts?.variant || "secondary",
    action: { type: "send", text },
  }
}

function mainActions(lang?: string): ActionBtn[] {
  const bm = isBm(lang)
  return [
    sendBtn("ex1", bm ? "Contoh belanja" : "Example expense", bm ? "makan 12" : "lunch 12", {
      hint: bm ? "makan 12" : "lunch 12",
      icon: "expense",
      variant: "primary",
    }),
    sendBtn("summary", bm ? "Ringkasan" : "Summary", "summary", {
      hint: bm ? "Bulan ini" : "This month",
      icon: "summary",
    }),
    sendBtn("list", bm ? "Rekod terbaru" : "Recent records", "list", {
      hint: bm ? "5 terakhir" : "Last 5",
      icon: "list",
    }),
    sendBtn("wallet", bm ? "Semak dompet" : "Check wallets", "checkwallet", {
      hint: bm ? "Semua baki" : "All balances",
      icon: "wallet",
    }),
    sendBtn("transfer", bm ? "Transfer" : "Transfer", "transfer ", {
      hint: bm ? "Antara wallet" : "Between wallets",
      icon: "transfer",
    }),
    sendBtn("lang", bm ? "English" : "Bahasa Melayu", bm ? "lang en" : "lang bm", {
      hint: bm ? "Tukar bahasa" : "Switch language",
      icon: "lang",
    }),
  ]
}

function budgetActions(lang?: string): ActionBtn[] {
  const bm = isBm(lang)
  return [
    sendBtn("bsum", bm ? "Ringkasan bajet" : "Budget summary", "budget summary", {
      hint: bm ? "Overview bulanan" : "Monthly overview",
      icon: "budget",
      variant: "primary",
    }),
    sendBtn("blist", bm ? "Senarai bajet" : "Budget list", "budget list", {
      hint: bm ? "Bajet aktif" : "Active budgets",
      icon: "list",
    }),
    sendBtn("bset", bm ? "Set bajet" : "Set budget", "budget set ", {
      hint: bm ? "makanan 600" : "food 600",
      icon: "add",
    }),
    sendBtn("bbaki", bm ? "Baki bajet" : "Budget left", "budget baki ", {
      hint: bm ? "Ikut kategori" : "By category",
      icon: "wallet",
    }),
    sendBtn("bdel", bm ? "Padam bajet" : "Delete budget", "budget delete ", {
      hint: bm ? "Buang kategori" : "Remove category",
      icon: "help",
    }),
    sendBtn("bhelp", bm ? "Panduan bajet" : "Budget guide", "budget", {
      hint: bm ? "Cara guna" : "How to use",
      icon: "help",
    }),
  ]
}

function loanActions(lang?: string): ActionBtn[] {
  const bm = isBm(lang)
  return [
    sendBtn("lolist", bm ? "Senarai loan" : "Loan list", "loanx list", {
      hint: bm ? "Loan aktif" : "Active loans",
      icon: "loan",
      variant: "primary",
    }),
    sendBtn("loadd", bm ? "Tambah loan" : "Add loan", "loanx add ", {
      hint: bm ? "nama total bulanan" : "name total monthly",
      icon: "add",
    }),
    sendBtn("lopay", bm ? "Bayar ansuran" : "Pay installment", "loanx pay ", {
      hint: bm ? "Rekod bayaran" : "Record payment",
      icon: "pay",
    }),
    sendBtn("lohelp", bm ? "Panduan loan" : "Loan guide", "loanx", {
      hint: bm ? "Cara guna" : "How to use",
      icon: "help",
    }),
  ]
}

function subActions(lang?: string): ActionBtn[] {
  const bm = isBm(lang)
  return [
    sendBtn("subadd", bm ? "Tambah langganan" : "Add subscription", "subx ", {
      hint: bm ? "nama jumlah 15HB" : "name amount 15HB",
      icon: "sub",
      variant: "primary",
    }),
    sendBtn("subpay", bm ? "Bayar langganan" : "Pay subscription", "subx pay ", {
      hint: bm ? "Rekod bayaran" : "Record payment",
      icon: "pay",
    }),
    sendBtn("subex", bm ? "Contoh ASTRO" : "Example ASTRO", "SUBX ASTRO 89.90 15HB", {
      hint: bm ? "Simpan terus" : "Save now",
      icon: "add",
    }),
  ]
}

function debtActions(lang?: string): ActionBtn[] {
  const bm = isBm(lang)
  return [
    sendBtn("dlist", bm ? "Senarai hutang" : "Debt list", "debt list", {
      hint: bm ? "Semua baki" : "All balances",
      icon: "debt",
      variant: "primary",
    }),
    sendBtn("lend", bm ? "Pinjam orang" : "Lend out", "lend ", {
      hint: bm ? "Orang hutang kita" : "They owe you",
      icon: "add",
    }),
    sendBtn("borrow", bm ? "Hutang orang" : "Borrow", "borrow ", {
      hint: bm ? "Kita hutang orang" : "You owe them",
      icon: "pay",
    }),
    sendBtn("dcmd", bm ? "Panduan hutang" : "Debt guide", "debtcmd", {
      hint: bm ? "Cara guna" : "How to use",
      icon: "help",
    }),
  ]
}

function placeActions(lang?: string): ActionBtn[] {
  const bm = isBm(lang)
  return [
    sendBtn("pinx-help", bm ? "Panduan pinx" : "Pinx guide", "pinx", {
      hint: bm ? "Cara simpan tempat" : "How to save places",
      icon: "place",
      variant: "primary",
    }),
    sendBtn("pinx-ex", bm ? "Contoh simpan" : "Example save", "pinx house maksu family @here", {
      hint: bm ? "title + kategori + @here" : "title + category + @here",
      icon: "add",
    }),
    sendBtn("pinx-here", "@here", "@here", {
      hint: bm ? "Lampir lokasi" : "Attach location",
      icon: "place",
    }),
  ]
}

function welcomeGroups(lang?: string): ActionGroup[] {
  const bm = isBm(lang)
  return [
    { id: "main", title: bm ? "Asas" : "Basics", actions: mainActions(lang) },
    { id: "budget", title: bm ? "Bajet" : "Budget", actions: budgetActions(lang) },
    { id: "loan", title: bm ? "Loan" : "Loan", actions: loanActions(lang) },
    { id: "sub", title: bm ? "Langganan" : "Subscribe", actions: subActions(lang) },
    { id: "debt", title: bm ? "Hutang" : "Debt", actions: debtActions(lang) },
    { id: "place", title: bm ? "Tempat" : "Places", actions: placeActions(lang) },
  ]
}

function successActions(txnRef: string | undefined, lang?: string): ActionBtn[] {
  const bm = isBm(lang)
  return [
    {
      id: "cam",
      label: bm ? "Ambil resit" : "Take receipt",
      hint: bm ? "Buka kamera" : "Open camera",
      icon: "camera",
      variant: "primary",
      action: { type: "attach", mode: "camera", txnRef },
    },
    {
      id: "gal",
      label: bm ? "Lampir gambar" : "Attach photo",
      hint: bm ? "Pilih dari galeri" : "Choose from gallery",
      icon: "gallery",
      variant: "accent",
      action: { type: "attach", mode: "gallery", txnRef },
    },
  ]
}

function isWelcomeText(text: string): boolean {
  const t = text.toLowerCase()
  if (/budget by (digitalport|myperibadi)/.test(t) && /(command|command asas|basic commands|cara guna)/.test(t)) return true
  if (/\b(hai!|hi!)\b/.test(t) && /(summary|list|checkwallet|command)/.test(t)) return true
  if (/send expense text like|hantar teks belanja seperti/.test(t)) return true
  if (/(command asas|basic commands|command budget)/.test(t)) return true
  return false
}

function isBudgetReply(text: string): boolean {
  return /Budget Summary|Ringkasan Budget|Total Budget|Jumlah Budget|budget list|senarai budget|bajet|Amaran:|Alerts:|budget set|baki budget|budget padam/i.test(
    text
  )
}

function isLoanReply(text: string): boolean {
  return /loanx|loan list|loan aktif|active loan|ansuran|months? remaining|baki bulan|loan tracker|tracker loan/i.test(text)
}

function isSubReply(text: string): boolean {
  return /\bsubx\b|langganan|subscription|due day|\d{1,2}HB|subscribe/i.test(text)
}

function isDebtReply(text: string): boolean {
  return /debt list|debtcmd|senarai pinjam|lending list|hutang|debt balance|baki hutang|debtcol|debtpay|\blend\b|\bborrow\b/i.test(
    text
  )
}

function isPlaceReply(text: string): boolean {
  return (
    /\bpinx\b/i.test(text) ||
    /tempat disimpan|place saved|my places|tempat saya|simpan tempat|save place|location pin/i.test(text)
  )
}


function parsePendingChoicePrompt(text: string, lang?: string): ParsedBlock | null {
  const bm = isBm(lang)
  const isCategoryPending =
    /masih pending|still pending|masukkan kategori|choose a category|belum disimpan|has not been saved/i.test(text) &&
    /(Balas nombor|Reply with 1|Reply with the option number|1,\s*2,\s*atau 3|1,\s*2,\s*or 3)/i.test(text)
  const isWalletPending =
    /(Pilihan wallet|Wallet options|Senarai wallet|Wallet list)/i.test(text) &&
    /(Balas nombor|Reply with the option number|nama wallet|wallet name)/i.test(text)

  if (!isCategoryPending && !isWalletPending) return null

  const options: { num: string; label: string }[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    const m = line.match(/^(\d{1,2})[.)]\s+(.+)$/)
    if (!m) continue
    options.push({ num: m[1], label: stripAsterisks(m[2]) })
  }
  if (options.length === 0) return null

  const limited = isCategoryPending ? options.slice(0, 3) : options

  const actions: ActionBtn[] = limited.map((opt, i) =>
    sendBtn(`choice-${opt.num}`, `${opt.num}. ${opt.label}`, opt.num, {
      variant: i === 0 ? "primary" : "secondary",
      icon: "list",
      hint: bm ? "Tekan untuk pilih" : "Tap to choose",
    })
  )

  const firstLine = stripAsterisks((text.split("\n").map((l) => l.trim()).find(Boolean) || ""))
  const title = isCategoryPending
    ? bm
      ? "Transaksi masih pending"
      : "Transaction still pending"
    : bm
      ? "Pilih wallet"
      : "Choose wallet"

  const bodyLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\d{1,2}[.)]\s+/.test(l) && !/Balas nombor|Reply with 1|Reply with the option/i.test(l))
  const body = bodyLines.slice(0, 2).map(stripAsterisks).join(" ")

  return {
    type: "choice",
    title,
    body: body || firstLine,
    options: limited,
    actions,
  }
}

function sanitizeBotDisplayText(raw: string): string {
  return (raw || "")
    .replace(/\r\n/g, "\n")
    .trim()
}

function isTransactionalReply(text: string): boolean {
  return /\b(TXN\d{2}-[A-Z0-9]{6})\b|✅|📎|Done|Berjaya|Record Saved|Rekod Disimpan|Transfer|Resit|Receipt/i.test(text)
}

function shouldUseRichChatMessage(text: string): boolean {
  // User requested: keep rich chat ONLY for transaction / done replies.
  // Everything else, including summaries, guides, wallet lists, and help, stays plain text.
  return isTransactionalReply(text)
}

function parseBotText(raw: string, lang?: string): ParsedBlock[] {
  const text = sanitizeBotDisplayText(raw)
  if (!text) return [{ type: "text", text: "" }]

  const lines = text.split("\n").map((l) => l.trimEnd())
  const nonEmpty = lines.filter((l) => l.trim().length > 0)
  const bm = isBm(lang)

  // Pending category/wallet: ONLY numbered choice buttons — no other actions
  const pendingChoice = parsePendingChoicePrompt(text, lang)
  if (pendingChoice) {
    return [pendingChoice]
  }

  // User asked to reduce over-rich chat bubbles. Keep rich cards only for transaction/data outputs.
  if (!shouldUseRichChatMessage(text)) {
    return [{ type: "text", text }]
  }

  if (isWelcomeText(text)) {
    return [
      {
        type: "welcome",
        title: bm ? "Hai! Saya MyPeribadi Assistant" : "Hi! I’m your MyPeribadi Assistant",
        subtitle: bm
          ? "Rekod belanja, bajet, loan, langganan & hutang — tekan butang atau taip command."
          : "Log expenses, budgets, loans, subscriptions & debt — tap a button or type a command.",
        body: bm
          ? "Contoh: makan 12 · budget summary · loanx list · subx ASTRO 89.90 15HB"
          : "Examples: lunch 12 · budget summary · loanx list · subx ASTRO 89.90 15HB",
        groups: welcomeGroups(lang),
      },
    ]
  }

  const firstNonEmpty = nonEmpty[0] || ""
  const secondNonEmpty = nonEmpty[1] || ""
  const txnRef = extractTxnRef(text)
  const hasDone =
    /Done|Berjaya|Record Saved|Rekod Disimpan|Transfer|Resit|Receipt|Hutang|Debt|Loan|Langganan|Subscription/i.test(
      stripAsterisks(secondNonEmpty || firstNonEmpty)
    ) ||
    firstNonEmpty.includes("✅") ||
    secondNonEmpty.includes("✅") ||
    firstNonEmpty.includes("📎")

  if (txnRef || (hasDone && (firstNonEmpty.includes("✅") || secondNonEmpty.includes("✅") || firstNonEmpty.includes("📎")))) {
    const badge = txnRef
    let title = ""
    const rows: KvRow[] = []
    for (const line of nonEmpty) {
      const plain = stripAsterisks(line)
      if (/\bTXN\d{2}-[A-Z0-9]{6}\b/i.test(plain) && plain.replace(/\bTXN\d{2}-[A-Z0-9]{6}\b/i, "").trim() === "") {
        continue
      }
      if (/✅|📎|Done|Record Saved|Rekod|Transfer|Resit|Receipt|Debt|Hutang|Loan|Langganan/i.test(plain) && !title) {
        title = plain.replace(/^[✅📎\s]+/, "").replace(/^\|\s*/, "").trim()
        continue
      }
      const kv = splitKv(line)
      if (kv) rows.push(kv)
    }
    if (!title) title = bm ? "Rekod Disimpan" : "Record Saved"

    // Only hide attach buttons on "Done | Receipt Uploaded" cards.
    // Keep Ambil resit / Lampir gambar on normal TXN Done (expense saved) cards.
    const isReceiptUploaded = /Resit Dimuat Naik|Receipt Uploaded|receipt uploaded/i.test(text)
    let actions: ActionBtn[] = []
    if (isReceiptUploaded) {
      actions = []
    } else if (txnRef) {
      actions = successActions(badge, lang)
    } else if (isLoanReply(text)) {
      actions = loanActions(lang)
    } else if (isSubReply(text)) {
      actions = subActions(lang)
    } else if (isDebtReply(text)) {
      actions = debtActions(lang)
    }

    const kind = detectTxnFx(text) || undefined
    return [{
      type: "success",
      title,
      badge,
      rows: normalizeSuccessRows(rows),
      actions,
      kind: kind === "income" || kind === "expense" ? kind : undefined,
    }]
  }

  const summaryLike =
    /\*(?:Ringkasan|Summary)\s+/i.test(text) ||
    (/Pendapatan|Income/i.test(text) && /Perbelanjaan|Expense/i.test(text) && /Baki|Balance/i.test(text))
  if (summaryLike && !/Budget Summary|Ringkasan Budget/i.test(text)) {
    const titleLine = nonEmpty.find((l) => /Ringkasan|Summary/i.test(stripAsterisks(l)))
    const title = titleLine ? stripAsterisks(titleLine) : "Summary"
    const rows: KvRow[] = []
    for (const line of nonEmpty) {
      const kv = splitKv(line)
      if (kv) rows.push(kv)
    }
    if (rows.length >= 2) {
      return [
        {
          type: "summary",
          title,
          rows,
          actions: [
            sendBtn("list", bm ? "Rekod terbaru" : "Recent records", "list", { icon: "list", variant: "primary" }),
            sendBtn("wallet", bm ? "Semak dompet" : "Check wallets", "checkwallet", { icon: "wallet" }),
            sendBtn("bsum", bm ? "Ringkasan bajet" : "Budget summary", "budget summary", { icon: "budget" }),
            sendBtn("lolist", bm ? "Senarai loan" : "Loan list", "loanx list", { icon: "loan" }),
          ],
        },
      ]
    }
  }

  if (
    /Senarai Dompet|Your Wallets|Jumlah Keseluruhan|Total Balance/i.test(text) ||
    (looksLikeTreeList(nonEmpty) && nonEmpty.some((l) => /RM\s*[\d,]+\.\d{2}/.test(l) && !l.includes("|")))
  ) {
    const title = stripAsterisks(nonEmpty[0] || (bm ? "Dompet" : "Wallets"))
    const rows: KvRow[] = []
    let total: string | undefined
    for (let i = 1; i < nonEmpty.length; i++) {
      const line = nonEmpty[i]
      const plain = stripAsterisks(cleanBullet(line))
      if (/Jumlah Keseluruhan|Total Balance/i.test(plain)) {
        const kv = splitKv(line)
        total = kv?.value || plain
        continue
      }
      const kv = splitKv(line)
      if (kv) rows.push(kv)
    }
    if (rows.length > 0) {
      return [
        {
          type: "wallet",
          title,
          rows,
          total,
          actions: [
            sendBtn("summary", bm ? "Ringkasan" : "Summary", "summary", { icon: "summary", variant: "primary" }),
            sendBtn("transfer", bm ? "Transfer" : "Transfer", "transfer ", { icon: "transfer" }),
            sendBtn("subpay", bm ? "Bayar langganan" : "Pay subscription", "subx pay ", { icon: "pay" }),
            sendBtn("lopay", bm ? "Bayar ansuran" : "Pay installment", "loanx pay ", { icon: "loan" }),
          ],
        },
      ]
    }
  }

  // Free-form help essays (AI / bot guides) — not KV rows
  if (isFreeformGuide(nonEmpty)) {
    let actions: ActionBtn[] | undefined
    if (isPlaceReply(text)) actions = placeActions(lang)
    else if (isSubReply(text)) actions = subActions(lang)
    else if (isDebtReply(text)) actions = debtActions(lang)
    else if (isLoanReply(text)) actions = loanActions(lang)
    else if (isBudgetReply(text)) actions = budgetActions(lang)
    else actions = [...subActions(lang).slice(0, 2), ...debtActions(lang).slice(0, 2)]
    return [parseGuideFromLines(nonEmpty, actions)]
  }

  // Budget / loan / sub / debt / place structured cards with tree or kv
  const treeOrKv = looksLikeTreeList(nonEmpty) || nonEmpty.some((l) => {
    const kv = splitKv(l)
    return !!kv && kv.label.length <= 28 && !!kv.value && !kv.tip
  })
  if (treeOrKv && (isBudgetReply(text) || isLoanReply(text) || isSubReply(text) || isDebtReply(text) || isPlaceReply(text))) {
    const title = stripAsterisks(nonEmpty[0])
    const rows: KvRow[] = []
    const tableRows: TableRow[] = []
    for (let i = 1; i < nonEmpty.length; i++) {
      const tr = detectTableRow(nonEmpty[i])
      if (tr) {
        tableRows.push(tr)
        continue
      }
      const kv = splitKv(nonEmpty[i])
      if (kv && kv.label.length <= 36 && kv.value && !kv.tip) rows.push(kv)
      else {
        const cleaned = stripAsterisks(cleanBullet(nonEmpty[i]))
        // Only short leftover lines as empty-value rows (not full sentences)
        if (cleaned && cleaned.length <= 48 && !/[.!?]$/.test(cleaned)) rows.push({ label: cleaned, value: "" })
      }
    }

    let actions: ActionBtn[] = []
    let tone: "budget" | "loan" | "sub" | "debt" | "place" | "generic" = "generic"
    if (isBudgetReply(text)) {
      actions = budgetActions(lang)
      tone = "budget"
    } else if (isLoanReply(text)) {
      actions = loanActions(lang)
      tone = "loan"
    } else if (isSubReply(text)) {
      actions = subActions(lang)
      tone = "sub"
    } else if (isDebtReply(text)) {
      actions = debtActions(lang)
      tone = "debt"
    } else if (isPlaceReply(text)) {
      actions = placeActions(lang)
      tone = "place"
    }

    // If we mostly got empty-value prose rows, fall back to guide layout
    const emptyHeavy = rows.filter((r) => !r.value).length >= Math.max(3, rows.length - 1)
    if (emptyHeavy && rows.length >= 3) {
      return [parseGuideFromLines(nonEmpty, actions)]
    }

    if (tableRows.length >= 2) {
      return [{ type: "table", title, rows: tableRows, actions }]
    }
    if (rows.length > 0 || actions.length > 0) {
      return [{ type: "card", title, rows, actions, tone }]
    }
  }

  if (/Budget Summary|Ringkasan Budget|Total Budget|Jumlah Budget/i.test(text) && looksLikeTreeList(nonEmpty)) {
    const title = stripAsterisks(nonEmpty[0])
    const rows: KvRow[] = []
    for (let i = 1; i < nonEmpty.length; i++) {
      const kv = splitKv(nonEmpty[i])
      if (kv) rows.push(kv)
      else {
        const cleaned = stripAsterisks(cleanBullet(nonEmpty[i]))
        if (cleaned) rows.push({ label: cleaned, value: "" })
      }
    }
    return [{ type: "card", title, rows, actions: budgetActions(lang), tone: "budget" }]
  }

  if (
    /Rekod Terakhir|Last \d+ Records|Records:/i.test(text) ||
    nonEmpty.filter((l) => l.includes("|") && /RM|Private|\d{2}\/\d{2}\/\d{4}/i.test(l)).length >= 2
  ) {
    const titleLine = nonEmpty.find((l) => /Rekod|Records/i.test(stripAsterisks(l)) && !l.includes("|"))
    const title = titleLine ? stripAsterisks(titleLine) : undefined
    const rows: TableRow[] = []
    for (const line of nonEmpty) {
      if (titleLine && line === titleLine) continue
      const row = detectTableRow(line)
      if (row) rows.push(row)
    }
    if (rows.length > 0) {
      return [
        {
          type: "table",
          title,
          headers: ["Item", "Date", "Amount"],
          rows,
          actions: [
            sendBtn("summary", bm ? "Ringkasan" : "Summary", "summary", { icon: "summary", variant: "primary" }),
            sendBtn("bsum", bm ? "Ringkasan bajet" : "Budget summary", "budget summary", { icon: "budget" }),
            sendBtn("dlist", bm ? "Senarai hutang" : "Debt list", "debt list", { icon: "debt" }),
          ],
        },
      ]
    }
  }

  if (looksLikeTreeList(nonEmpty)) {
    const title = stripAsterisks(nonEmpty[0])
    const rows: KvRow[] = []
    const tableRows: TableRow[] = []
    for (let i = 1; i < nonEmpty.length; i++) {
      const tr = detectTableRow(nonEmpty[i])
      if (tr) {
        tableRows.push(tr)
        continue
      }
      const kv = splitKv(nonEmpty[i])
      if (kv && kv.label.length <= 36 && kv.value && !kv.tip) rows.push(kv)
      else {
        const cleaned = stripAsterisks(cleanBullet(nonEmpty[i]))
        if (cleaned && cleaned.length <= 48 && !/[.!?]$/.test(cleaned)) rows.push({ label: cleaned, value: "" })
      }
    }
    if (tableRows.length >= 2) return [{ type: "table", title, rows: tableRows }]
    if (rows.length > 0 && rows.filter((r) => r.value).length >= 1) return [{ type: "card", title, rows }]
    if (rows.length >= 3) return [parseGuideFromLines(nonEmpty)]
  }

  // Plain help-ish text for budget/loan/sub/debt/place → still add buttons
  if (isBudgetReply(text)) {
    if (nonEmpty.length >= 4) return [parseGuideFromLines(nonEmpty, budgetActions(lang))]
    return [{ type: "text", text, actions: budgetActions(lang) }]
  }
  if (isLoanReply(text)) {
    if (nonEmpty.length >= 4) return [parseGuideFromLines(nonEmpty, loanActions(lang))]
    return [{ type: "text", text, actions: loanActions(lang) }]
  }
  if (isSubReply(text)) {
    if (nonEmpty.length >= 4) return [parseGuideFromLines(nonEmpty, subActions(lang))]
    return [{ type: "text", text, actions: subActions(lang) }]
  }
  if (isDebtReply(text)) {
    if (nonEmpty.length >= 4) return [parseGuideFromLines(nonEmpty, debtActions(lang))]
    return [{ type: "text", text, actions: debtActions(lang) }]
  }
  if (isPlaceReply(text)) {
    if (nonEmpty.length >= 3) return [parseGuideFromLines(nonEmpty, placeActions(lang))]
    return [{ type: "text", text, actions: placeActions(lang) }]
  }

  if (nonEmpty.length >= 5 && isFreeformGuide(nonEmpty)) {
    return [parseGuideFromLines(nonEmpty)]
  }

  return [{ type: "text", text }]
}

function ToneAmount({ value, tone }: { value: string; tone?: "pos" | "neg" | "neutral" }) {
  const t = tone || amountTone(value)
  return (
    <span
      className={cn(
        "font-semibold tabular-nums text-[0.75rem] break-all",
        t === "pos" && "text-emerald-500",
        t === "neg" && "text-rose-500",
        t === "neutral" && "text-[var(--text)]"
      )}
    >
      {value}
    </span>
  )
}

function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/)
  return (
    <div className={cn("space-y-1.5 text-[0.6875rem] leading-snug text-[var(--text)]", className)}>
      {paragraphs.map((para, i) => (
        <div key={i} className="space-y-0.5">
          {para.split("\n").map((line, j) => (
            <p key={j} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {parseInlineMarkdown(line)}
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}

function ActionIcon({ name }: { name?: ActionIconName }) {
  const size = 11
  switch (name) {
    case "camera":
      return <Camera size={size} />
    case "gallery":
      return <ImageIcon size={size} />
    case "summary":
      return <PieChart size={size} />
    case "list":
      return <ListOrdered size={size} />
    case "wallet":
      return <Wallet size={size} />
    case "help":
      return <HelpCircle size={size} />
    case "expense":
      return <MessageSquarePlus size={size} />
    case "transfer":
      return <ArrowRightLeft size={size} />
    case "lang":
      return <Languages size={size} />
    case "budget":
      return <Target size={size} />
    case "loan":
      return <CreditCard size={size} />
    case "sub":
      return <CalendarClock size={size} />
    case "debt":
      return <HandCoins size={size} />
    case "place":
      return <MapPin size={size} />
    case "add":
      return <PlusCircle size={size} />
    case "pay":
      return <Banknote size={size} />
    default:
      return <Sparkles size={size} />
  }
}

function ActionButtons({
  actions,
  disabled,
  isLight: _isLight,
  onAction,
}: {
  actions: ActionBtn[]
  disabled?: boolean
  isLight?: boolean
  onAction?: (action: ChatAction) => void
}) {
  if (!actions.length || !onAction) return null
  return (
    <div className="chat-action-list mt-2 flex flex-wrap gap-1.5">
      {actions.map((btn) => {
        const isPrimary = btn.variant === "primary"
        return (
          <button
            key={btn.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction(btn.action)}
            className={cn(
              "chat-action-btn inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.6875rem] font-semibold leading-none transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
              isPrimary
                ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                : btn.variant === "accent"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-[color:var(--border)] bg-[var(--surface-tint)] text-[var(--text)]"
            )}
          >
            <ActionIcon name={btn.icon} />
            <span className="break-words [overflow-wrap:anywhere]">{btn.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function GroupedActions({
  groups,
  disabled,
  isLight,
  onAction,
}: {
  groups: ActionGroup[]
  disabled?: boolean
  isLight?: boolean
  onAction?: (action: ChatAction) => void
}) {
  if (!groups.length || !onAction) return null
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1 px-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[var(--muted)]">
            {group.title}
          </p>
          <ActionButtons actions={group.actions} disabled={disabled} isLight={isLight} onAction={onAction} />
        </div>
      ))}
    </div>
  )
}

function toneHeaderIcon(tone?: "budget" | "loan" | "sub" | "debt" | "place" | "generic") {
  switch (tone) {
    case "budget":
      return <Target size={14} />
    case "loan":
      return <CreditCard size={14} />
    case "sub":
      return <CalendarClock size={14} />
    case "debt":
      return <HandCoins size={14} />
    case "place":
      return <MapPin size={14} />
    default:
      return <Sparkles size={14} />
  }
}


function BubbleHeader({
  icon,
  title,
  subtitle,
  badge,
  tone = "default",
  isLight = false,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  badge?: string
  tone?: "default" | "success" | "info" | "expense"
  isLight?: boolean
}) {
  const toneIcon =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : tone === "expense"
        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
      : tone === "info"
        ? "bg-[color-mix(in_srgb,var(--brand-blue)_12%,transparent)] text-[var(--brand-blue)]"
        : isLight
          ? "bg-[var(--card)] text-[var(--text)] ring-1 ring-[color:var(--border)]"
          : "bg-[var(--surface-tint-strong)] text-[var(--text)]"

  const badgeTone =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tone === "expense"
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : isLight
        ? "bg-[var(--surface-tint-strong)] text-[var(--text)]"
        : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"

  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", toneIcon)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 truncate text-[0.8125rem] font-bold leading-tight tracking-tight text-[var(--text)]">
            {title}
          </p>
          {badge ? (
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide", badgeTone)}>
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-[0.6875rem] leading-snug text-[var(--muted)] [overflow-wrap:anywhere]">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default function ChatRichMessage({
  text,
  isUser = false,
  isLight = false,
  lang = "BM",
  disabled = false,
  className,
  onAction,
}: Props) {
  const displayText = useMemo(() => sanitizeBotDisplayText(text), [text])
  const blocks = useMemo(() => parseBotText(displayText, lang), [displayText, lang])

  if (isUser || !shouldUseRichChatMessage(displayText)) {
    return (
      <div className={cn(isUser ? "text-[0.8125rem] leading-snug break-words [overflow-wrap:anywhere]" : "w-full min-w-0", className)}>
        <RichText text={displayText} />
      </div>
    )
  }

  const successBlock = blocks.find((block) => block.type === "success")
  if (!successBlock || successBlock.type !== "success") {
    return (
      <div className={cn("w-full min-w-0", className)}>
        <RichText text={displayText} />
      </div>
    )
  }

  return (
    <div className={cn("w-full max-w-full min-w-0", className)}>
      <BubbleHeader
        icon={
          successBlock.kind === "expense" ? (
            <TrendingDown size={15} />
          ) : (
            <CheckCircle2 size={15} />
          )
        }
        title={successBlock.title}
        badge={successBlock.badge}
        tone={successBlock.kind === "expense" ? "expense" : "success"}
        isLight={isLight}
      />
      {successBlock.rows.length > 0 && (
        <div className="flex flex-col divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
          {successBlock.rows.map((row) => {
            const isStatus = /money status|status duit|status/i.test(row.label)
            const isCritical = /critical|nazak/i.test(row.value)
            return (
              <div key={row.label + row.value} className="py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 shrink-0 text-[0.6875rem] text-[var(--muted)] whitespace-nowrap">
                    {row.label}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 max-w-[62%] text-right text-[0.75rem] font-semibold whitespace-nowrap truncate",
                      isStatus
                        ? isCritical
                          ? "rounded-full bg-rose-500/12 px-1.5 py-0.5 text-rose-500"
                          : "rounded-full bg-[color-mix(in_srgb,var(--brand-blue)_12%,transparent)] px-1.5 py-0.5 text-[var(--brand-blue)]"
                        : "text-[var(--text)]"
                    )}
                    title={row.value}
                  >
                    {/amount|jumlah|baki|balance|current balance/i.test(row.label) ? (
                      <ToneAmount value={row.value} />
                    ) : (
                      row.value
                    )}
                  </span>
                </div>
                {row.tip ? (
                  <p className="mt-1 text-[0.625rem] leading-relaxed text-[var(--muted)] break-words whitespace-normal [overflow-wrap:anywhere]">
                    {row.tip}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {successBlock.actions.length > 0 && (
        <ActionButtons actions={successBlock.actions} disabled={disabled} isLight={isLight} onAction={onAction} />
      )}
    </div>
  )
}
