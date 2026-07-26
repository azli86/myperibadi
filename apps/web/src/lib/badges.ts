export type AppBadgeStatus = "unlocked" | "locked"
export type AppBadgeTone = "cyan" | "gold" | "emerald" | "violet" | "rose" | "blue"
export type AppBadgeIcon = "verified" | "active" | "streak" | "budget" | "receipt" | "bot"

export type AppBadge = {
  key: string
  titleBM: string
  titleEN: string
  descBM: string
  descEN: string
  ruleBM: string
  ruleEN: string
  tone: AppBadgeTone
  icon: AppBadgeIcon
  status: AppBadgeStatus
}

export type BadgeTransactionLike = {
  txn_date: string
  is_wallet_transfer?: boolean | null
  source_channel?: string | null
  attachment_count?: number | null
}

export type BadgeBudgetItemLike = {
  budget_amount: number
  progress_percent: number
}

export const APP_BADGES: AppBadge[] = [
  {
    key: "verified",
    titleBM: "Verified",
    titleEN: "Verified",
    descBM: "Akaun dipercayai dengan profil, keselamatan dan connector aktif.",
    descEN: "Trusted account with profile, security and active connector.",
    ruleBM: "Set profil, guna 6PIN, dan sambung sekurang-kurangnya 1 connector.",
    ruleEN: "Complete profile, enable 6PIN, and connect at least 1 connector.",
    tone: "blue",
    icon: "verified",
    status: "locked",
  },
  {
    key: "most-active",
    titleBM: "Paling Aktif",
    titleEN: "Most Active",
    descBM: "Untuk user yang rajin rekod transaksi setiap minggu.",
    descEN: "For users who consistently record transactions every week.",
    ruleBM: "Minimum 25 transaksi dalam 30 hari terakhir.",
    ruleEN: "Minimum 25 transactions in the last 30 days.",
    tone: "gold",
    icon: "active",
    status: "locked",
  },
  {
    key: "streak",
    titleBM: "Daily Streak",
    titleEN: "Daily Streak",
    descBM: "Badge disiplin bila rekod tanpa putus setiap hari.",
    descEN: "Discipline badge for recording daily without breaks.",
    ruleBM: "Rekod transaksi sekurang-kurangnya 1 setiap hari selama 7 hari.",
    ruleEN: "Record at least 1 transaction daily for 7 days.",
    tone: "rose",
    icon: "streak",
    status: "locked",
  },
  {
    key: "budget-saver",
    titleBM: "Budget Saver",
    titleEN: "Budget Saver",
    descBM: "Untuk user yang berjaya kekal bawah budget bulanan.",
    descEN: "For users who stay below their monthly budget.",
    ruleBM: "Semua kategori utama bawah 90% budget hujung bulan.",
    ruleEN: "All main categories stay below 90% budget at month end.",
    tone: "emerald",
    icon: "budget",
    status: "locked",
  },
  {
    key: "receipt-pro",
    titleBM: "Receipt Pro",
    titleEN: "Receipt Pro",
    descBM: "User yang konsisten simpan lampiran dan resit.",
    descEN: "Users who consistently save attachments and receipts.",
    ruleBM: "Sekurang-kurangnya 15 transaksi ada lampiran dalam 30 hari.",
    ruleEN: "At least 15 transactions with attachments in 30 days.",
    tone: "violet",
    icon: "receipt",
    status: "locked",
  },
  {
    key: "bot-power",
    titleBM: "Bot Power User",
    titleEN: "Bot Power User",
    descBM: "User yang aktif guna WhatsApp atau Telegram command.",
    descEN: "Users who actively use WhatsApp or Telegram commands.",
    ruleBM: "Minimum 20 transaksi dari connector bot dalam 30 hari.",
    ruleEN: "Minimum 20 transactions from bot connectors in 30 days.",
    tone: "cyan",
    icon: "bot",
    status: "locked",
  },
]

export function deriveEarnedBadgeKeys(transactions: BadgeTransactionLike[], budgetItems: BadgeBudgetItemLike[]) {
  const earned = new Set<string>()
  const nonTransferTransactions = transactions.filter((tx) => !tx.is_wallet_transfer)
  const uniqueTxnDays = new Set(nonTransferTransactions.map((tx) => tx.txn_date.slice(0, 10)))
  const budgetedItems = budgetItems.filter((item) => Number(item.budget_amount || 0) > 0)

  if (nonTransferTransactions.length > 0) earned.add("verified")
  if (nonTransferTransactions.length >= 25) earned.add("most-active")
  if (uniqueTxnDays.size >= 7) earned.add("streak")
  if (budgetedItems.length > 0 && budgetedItems.every((item) => Number(item.progress_percent || 0) <= 90)) earned.add("budget-saver")
  if (nonTransferTransactions.filter((tx) => Number(tx.attachment_count || 0) > 0).length >= 15) earned.add("receipt-pro")
  if (nonTransferTransactions.filter((tx) => ["whatsapp", "whatsapp_group", "telegram"].includes((tx.source_channel || "").toLowerCase())).length >= 20) earned.add("bot-power")

  return earned
}

export function buildLiveBadges(transactions: BadgeTransactionLike[], budgetItems: BadgeBudgetItemLike[]) {
  const earned = deriveEarnedBadgeKeys(transactions, budgetItems)
  return APP_BADGES.map((badge) => ({
    ...badge,
    status: earned.has(badge.key) ? "unlocked" as const : "locked" as const,
  }))
}
