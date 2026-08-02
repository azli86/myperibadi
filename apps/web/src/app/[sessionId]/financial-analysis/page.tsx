"use client"

import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { BarChart3, CalendarDays, Car, CreditCard, HandCoins, Landmark, CircleDollarSign, Receipt, Shield, TrendingDown, TrendingUp, Wallet, type LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { categoryCycleMonthBounds, cycleMonthBounds } from "@/lib/cycle"

type Row = Record<string, unknown>
type Transaction = Row & { id: number; type: "income" | "expense"; amount: number; txn_date: string; category_name?: string | null; vendor_or_source?: string | null; wallet_name?: string | null; is_wallet_transfer?: boolean; is_debt_movement?: boolean }
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"]
const amount = (row: Row, keys: string[]) => keys.reduce((value, key) => value || Number(row[key] || 0), 0)
const list = (value: unknown): Row[] => Array.isArray(value) ? value : []

export default function FinancialAnalysisPage() {
  const { lang } = useLang()
  const bm = lang === "BM"
  const [data, setData] = useState<Record<string, Row[]>>({})
  const [loading, setLoading] = useState(true)
  const [aiInsights, setAiInsights] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    const token = getAccessToken()
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    const endpoints = { transactions: "/api/transactions", wallets: "/api/wallets", budgets: `/api/budgets?month=${month}`, subscriptions: "/api/subscriptions?include_settled=true", loans: "/api/loans?include_settled=true", debts: "/api/debts?include_settled=true", vehicles: "/api/vehicles", warranties: "/api/warranties", cycle: "/api/cycles/me", user: "/api/users/me" }
    setLoading(true)
    Promise.all(Object.entries(endpoints).map(async ([key, url]) => {
      try { const response = await fetch(url, { credentials: "include", headers, cache: "no-store" }); const value = response.ok ? await response.json() : []; return [key, key === "cycle" || key === "user" ? [value] : list(value)] as const }
      catch { return [key, []] as const }
    })).then((entries) => {
      const nextData = Object.fromEntries(entries)
      setData(nextData)
      const activeCycleKey = String(nextData.cycle?.[0]?.month_key || "")
      if (activeCycleKey && !data.cycle?.length) setMonth(activeCycleKey)
    }).finally(() => setLoading(false))
  }, [month])

  const report = useMemo(() => {
    const transactions = (data.transactions || []) as Transaction[]
    const clean = transactions.filter((tx) => !tx.is_wallet_transfer && !tx.is_debt_movement)
    const [year, selectedMonth] = month.split("-").map(Number)
    const cycle = data.cycle?.[0] || {}, user = data.user?.[0] || {}, cycleMode = String(user.cycle_mode || cycle.mode || "day")
    const salaryDates = Array.isArray(cycle.salary_dates) ? cycle.salary_dates.map(String) : []
    const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
    const boundsFor = (key: string) => {
      const categoryBounds = cycleMode === "category" ? categoryCycleMonthBounds(salaryDates, key) : null
      const dayBounds = cycleMode !== "category" ? cycleMonthBounds(key, Number(user.cycle_start_day || 1)) : null
      return categoryBounds || (dayBounds ? { start: dateKey(dayBounds.start), end: dateKey(dayBounds.end) } : null)
    }
    const apiBounds = String(cycle.month_key || "") === month && cycle.start && cycle.end ? { start: String(cycle.start).slice(0, 10), end: String(cycle.end).slice(0, 10) } : null
    const selectedBounds = apiBounds || boundsFor(month)
    const inBounds = (tx: Transaction, bounds: { start: string; end: string } | null) => bounds ? String(tx.txn_date).slice(0, 10) >= bounds.start && String(tx.txn_date).slice(0, 10) <= bounds.end : String(tx.txn_date).startsWith(month)
    const filtered = clean.filter((tx) => inBounds(tx, selectedBounds))
    const income = filtered.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount), 0)
    const expense = filtered.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount), 0)
    const aggregate = (rows: Transaction[], key: (tx: Transaction) => string) => [...rows.reduce((map, tx) => { const name = key(tx); map.set(name, (map.get(name) || 0) + Number(tx.amount)); return map }, new Map<string, number>())].sort((a, b) => b[1] - a[1])
    const categories = aggregate(filtered.filter((tx) => tx.type === "expense"), (tx) => tx.category_name || (bm ? "Tanpa kategori" : "Uncategorised"))
    const vendors = aggregate(filtered.filter((tx) => tx.type === "expense"), (tx) => tx.vendor_or_source || "—").slice(0, 6)
    const trend = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(year, selectedMonth - 12 + index, 1), key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const rows = clean.filter((tx) => inBounds(tx, boundsFor(key)))
      return { label: date.toLocaleString(bm ? "ms-MY" : "en-MY", { month: "short" }), income: rows.filter((tx) => tx.type === "income").reduce((s, tx) => s + Number(tx.amount), 0), expense: rows.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amount), 0) }
    })
    const budgetLimit = (data.budgets || []).reduce((s, row) => s + amount(row, ["limit_amount", "amount", "budget_amount"]), 0)
    const previousDate = new Date(year, selectedMonth - 2, 1), previousKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`
    const previousRows = clean.filter((tx) => inBounds(tx, boundsFor(previousKey)))
    const previousExpense = previousRows.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amount), 0)
    const daily = aggregate(filtered.filter((tx) => tx.type === "expense"), (tx) => String(tx.txn_date).slice(0, 10))
    const weekly = aggregate(filtered.filter((tx) => tx.type === "expense"), (tx) => { const date = new Date(`${tx.txn_date}T00:00:00`), start = new Date(date); start.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return start.toLocaleDateString(bm ? "ms-MY" : "en-MY", { day: "numeric", month: "short" }) })
    const cycleStart = selectedBounds?.start || `${month}-01`
    const cycleEnd = selectedBounds?.end || `${month}-${new Date(year, selectedMonth, 0).getDate()}`
    const cycleRows = filtered
    const cycleIncome = cycleRows.filter((tx) => tx.type === "income").reduce((s, tx) => s + Number(tx.amount), 0), cycleExpense = cycleRows.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amount), 0)
    const walletChart = [...filtered.filter((tx) => tx.type === "expense").reduce((map, tx) => { const name = tx.wallet_name || "Wallet"; map.set(name, (map.get(name) || 0) + Number(tx.amount)); return map }, new Map<string, number>())].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    const moduleChart = (rows: Row[], nameKeys: string[], amountKeys: string[]) => rows.map((row, index) => ({ name: String(nameKeys.reduce<unknown>((value, key) => value || row[key], "") || `#${index + 1}`), value: amount(row, amountKeys) })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value)
    const subscriptionChart = moduleChart(data.subscriptions || [], ["name", "vendor", "vendor_or_source"], ["amount", "monthly_amount", "price"])
    const loanChart = moduleChart(data.loans || [], ["name", "title", "lender_name"], ["outstanding_amount", "outstanding_balance", "remaining_amount", "balance", "amount"])
    const debtChart = (data.debts || []).map((row, index) => ({ name: String(row.counterparty_name || row.name || row.debtor_name || row.person_name || `#${index + 1}`), value: Math.abs(amount(row, ["balance", "remaining_amount", "amount"])) })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value)
    return {
      income, expense, net: income - expense, count: filtered.length, categories, vendors, trend, budgetLimit, walletChart, subscriptionChart, loanChart, debtChart,
      savingsRate: income ? ((income - expense) / income) * 100 : 0, previousExpense, expenseChange: previousExpense ? ((expense - previousExpense) / previousExpense) * 100 : 0,
      highestDay: daily[0], highestWeek: weekly[0], cycleStart, cycleEnd, cycleIncome, cycleExpense,
      walletBalance: (data.wallets || []).reduce((s, row) => s + amount(row, ["balance", "current_balance"]), 0),
      subscription: (data.subscriptions || []).filter((row) => !row.is_settled && row.status !== "cancelled").reduce((s, row) => s + amount(row, ["amount", "monthly_amount", "price"]), 0),
      loan: (data.loans || []).reduce((s, row) => s + amount(row, ["outstanding_amount", "outstanding_balance", "remaining_amount", "balance", "amount"]), 0),
      debt: (data.debts || []).reduce((s, row) => s + Math.abs(amount(row, ["balance", "remaining_amount", "amount"])), 0),
    }
  }, [bm, data, month])

  const money = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatRangeDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(bm ? "ms-MY" : "en-MY", { day: "numeric", month: "short", year: "numeric" })
  const insights = useMemo(() => {
    const topCategory = report.categories[0]
    const topWallet = report.walletChart[0]
    const commitment = report.subscription + report.loan + report.debt
    const expenseShare = report.income ? report.expense / report.income * 100 : 0
    return bm ? [
      report.net >= 0 ? `Aliran tunai positif ${money(report.net)}. Anda membelanjakan ${expenseShare.toFixed(1)}% daripada pendapatan bulan ini.` : `Aliran tunai negatif ${money(Math.abs(report.net))}. Perbelanjaan melebihi pendapatan; kurangkan komitmen tidak penting.`,
      topCategory ? `${topCategory[0]} ialah kategori tertinggi pada ${money(topCategory[1])}, bersamaan ${report.expense ? (topCategory[1] / report.expense * 100).toFixed(1) : "0"}% daripada semua perbelanjaan.` : "Belum cukup transaksi untuk mengenal pasti kategori perbelanjaan utama.",
      topWallet ? `${topWallet.name} paling banyak digunakan untuk perbelanjaan, berjumlah ${money(topWallet.value)}.` : "Belum ada perbelanjaan wallet untuk tempoh dipilih.",
      report.expenseChange > 0 ? `Perbelanjaan meningkat ${report.expenseChange.toFixed(1)}% berbanding bulan lalu. Semak kategori dan vendor tertinggi.` : `Perbelanjaan menurun ${Math.abs(report.expenseChange).toFixed(1)}% berbanding bulan lalu; trend kawalan kos bertambah baik.`,
      report.highestDay ? `Puncak perbelanjaan berlaku pada ${report.highestDay[0]} sebanyak ${money(report.highestDay[1])}. Minggu bermula ${report.highestWeek?.[0] || "—"} ialah minggu paling tinggi.` : "Tiada puncak perbelanjaan dikesan.",
      `Jumlah komitmen direkodkan ${money(commitment)}. Kadar simpanan ${report.savingsRate.toFixed(1)}%${report.savingsRate >= 20 ? ", tahap yang sihat." : "; sasarkan sekurang-kurangnya 20% jika mampu."}`,
    ] : [
      report.net >= 0 ? `Positive cash flow of ${money(report.net)}. You spent ${expenseShare.toFixed(1)}% of this month's income.` : `Negative cash flow of ${money(Math.abs(report.net))}. Expenses exceeded income; reduce non-essential commitments.`,
      topCategory ? `${topCategory[0]} was the highest category at ${money(topCategory[1])}, representing ${report.expense ? (topCategory[1] / report.expense * 100).toFixed(1) : "0"}% of spending.` : "Not enough transactions to identify the top spending category.",
      topWallet ? `${topWallet.name} funded the most spending at ${money(topWallet.value)}.` : "No wallet spending for the selected period.",
      report.expenseChange > 0 ? `Spending increased ${report.expenseChange.toFixed(1)}% from last month. Review the top categories and merchants.` : `Spending decreased ${Math.abs(report.expenseChange).toFixed(1)}% from last month; cost control is improving.`,
      report.highestDay ? `Peak spending occurred on ${report.highestDay[0]} at ${money(report.highestDay[1])}. The week starting ${report.highestWeek?.[0] || "—"} was the highest.` : "No spending peak detected.",
      `Recorded commitments total ${money(commitment)}. Savings rate is ${report.savingsRate.toFixed(1)}%${report.savingsRate >= 20 ? ", a healthy level." : "; aim for at least 20% where practical."}`,
    ]
  }, [bm, report])
  const generateAiInsights = async () => {
    setAiLoading(true)
    try {
      const token = getAccessToken()
      const response = await fetch("/api/financial-analysis/insights", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ language: lang, metrics: { month, income: report.income, expense: report.expense, net: report.net, savings_rate: report.savingsRate, previous_month_expense_change_percent: report.expenseChange, top_category: report.categories[0]?.[0] || null, top_category_amount: report.categories[0]?.[1] || 0, top_wallet: report.walletChart[0]?.name || null, subscriptions: report.subscription, loans: report.loan, debts: report.debt, highest_day: report.highestDay?.[0] || null, highest_day_amount: report.highestDay?.[1] || 0, budget_limit: report.budgetLimit } }) })
      if (!response.ok) throw new Error()
      const result = await response.json()
      setAiInsights(String(result.insights || "").split("\n").map((line) => line.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean))
    } catch { setAiInsights([]) } finally { setAiLoading(false) }
  }
  const MetricCard = ({ title, value, icon: Icon, colour = "text-amber-400" }: { title: string; value: string; icon: typeof Wallet; colour?: string }) => <Card className="h-full gap-0 py-0"><CardHeader className="p-5 pb-0"><div className="flex min-h-8 items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-tint)]"><Icon size={16} className={colour} /></div><CardTitle className="text-xs leading-4 text-[var(--muted)]">{title}</CardTitle></div></CardHeader><CardContent className="p-5 pt-3"><p className="truncate text-xl font-black tabular-nums">{value}</p></CardContent></Card>
  const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => <Card className="h-full gap-0 py-0"><CardHeader className="border-b border-[var(--border)] p-5"><CardTitle className="text-sm font-bold">{title}</CardTitle></CardHeader><CardContent className="p-5">{children}</CardContent></Card>

  return <><div className="flex min-h-[70vh] items-center justify-center p-6 lg:hidden"><p className="text-sm font-semibold text-[var(--muted)]">{bm ? "Halaman ini tersedia pada desktop sahaja." : "Desktop only."}</p></div><main className="hidden mx-auto max-w-[1600px] space-y-6 p-6 lg:block">
    <header className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--muted)]">{bm ? "Pusat laporan" : "Reporting centre"}</p><h1 className="mt-1 text-2xl font-black text-[var(--text)]">{bm ? "Analisis Kewangan" : "Financial Analysis"}</h1><div className="mt-2 flex items-center gap-2 text-sm"><CalendarDays size={15} className="text-[var(--chart-1)]"/><span className="font-bold text-[var(--text)]">{bm ? "Tempoh kiraan:" : "Calculation period:"}</span><span className="text-[var(--muted)]">{formatRangeDate(report.cycleStart)} — {formatRangeDate(report.cycleEnd)}</span></div></div><label className="flex items-center gap-2 rounded-[var(--card-radius-sm)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"><CalendarDays size={15}/><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-transparent text-sm font-bold outline-none"/></label></header>
    {loading ? <div className="h-36 animate-pulse rounded-[var(--card-radius-xl)] bg-[var(--surface-tint)]"/> : <>
      <Panel title={bm ? "Rumusan Analisis AI" : "AI Analysis Summary"}><div className="mb-5 flex items-center justify-between"><p className="text-xs text-[var(--muted)]">{aiInsights.length ? (bm ? "Dijana AI daripada data agregat." : "AI-generated from aggregate data.") : (bm ? "Jana rumusan profesional menggunakan AI." : "Generate a professional AI summary.")}</p><button type="button" disabled={aiLoading} onClick={generateAiInsights} className="rounded-lg bg-[var(--btn-primary-bg)] px-3 py-2 text-xs font-bold text-[var(--btn-primary-text)] disabled:opacity-50">{aiLoading ? (bm ? "Menjana…" : "Generating…") : aiInsights.length ? (bm ? "Jana semula" : "Regenerate") : (bm ? "Jana AI" : "Generate AI")}</button></div><div className="grid grid-cols-2 gap-4">{(aiInsights.length ? aiInsights : insights).map((insight, index) => { const InsightIcon = [TrendingUp, BarChart3, Wallet, TrendingDown, CalendarDays, CircleDollarSign][index % 6]; return <div key={index} className="relative overflow-hidden rounded-[var(--card-radius-sm)] border border-[var(--border)] bg-[var(--surface-tint)] p-4"><div className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-[var(--chart-1)] opacity-[0.06]"/><div className="relative flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--chart-1)_14%,transparent)] text-[var(--chart-1)]"><InsightIcon size={17}/></div><div><p className="mb-1 text-[0.65rem] font-black uppercase tracking-wider text-[var(--muted)]">{bm ? `Insight ${index + 1}` : `Insight ${index + 1}`}</p><p className="text-sm leading-6 text-[var(--text)]">{insight}</p></div></div></div> })}</div><p className="mt-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">{bm ? "Rumusan dijana daripada data untuk tempoh dipilih. Ia panduan corak kewangan, bukan nasihat kewangan berlesen." : "Summary generated from the selected period. It describes financial patterns, not licensed financial advice."}</p></Panel>
      <section className="grid grid-cols-4 gap-4"><MetricCard title={bm ? "Pendapatan" : "Income"} value={money(report.income)} icon={TrendingUp} colour="text-emerald-500"/><MetricCard title={bm ? "Perbelanjaan" : "Expenses"} value={money(report.expense)} icon={TrendingDown} colour="text-rose-500"/><MetricCard title={bm ? "Aliran Bersih" : "Net Flow"} value={money(report.net)} icon={BarChart3} colour={report.net >= 0 ? "text-emerald-500" : "text-rose-500"}/><MetricCard title={bm ? "Transaksi" : "Transactions"} value={String(report.count)} icon={Receipt}/></section>
      <div className="grid grid-cols-3 gap-4"><Panel title={bm ? "Aliran Tunai 12 Bulan" : "12-Month Cash Flow"}><div className="h-72"><ChartContainer config={{ value: { label: bm ? "Jumlah" : "Total", color: "var(--chart-1)" }, income: { label: bm ? "Pendapatan" : "Income", color: "var(--chart-2)" }, expense: { label: bm ? "Perbelanjaan" : "Expenses", color: "var(--chart-3)" } }} className="h-full w-full"><AreaChart data={report.trend}><defs><linearGradient id="expense" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-expense)" stopOpacity={.35}/><stop offset="1" stopColor="var(--color-expense)" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label"/><YAxis hide/><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Area type="monotone" dataKey="income" stroke="var(--color-income)" fill="none" strokeWidth={2}/><Area type="monotone" dataKey="expense" stroke="var(--color-expense)" fill="url(#expense)" strokeWidth={2}/></AreaChart></ChartContainer></div></Panel><div className="col-span-2"><Panel title={bm ? "Kategori Perbelanjaan" : "Expense Categories"}><div className="h-72"><ChartContainer config={{ value: { label: bm ? "Jumlah" : "Total", color: "var(--chart-1)" }, income: { label: bm ? "Pendapatan" : "Income", color: "var(--chart-2)" }, expense: { label: bm ? "Perbelanjaan" : "Expenses", color: "var(--chart-3)" } }} className="h-full w-full"><BarChart data={report.categories.slice(0, 8).map(([name, value]) => ({ name, value }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={110}/><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={[0, 8, 8, 0]}/></BarChart></ChartContainer></div></Panel></div></div>
      <section className="grid grid-cols-4 gap-4"><MetricCard title={bm ? "Kadar Simpanan" : "Savings Rate"} value={`${report.savingsRate.toFixed(1)}%`} icon={CircleDollarSign} colour={report.savingsRate >= 0 ? "text-emerald-500" : "text-rose-500"}/><MetricCard title={bm ? "Banding Bulan Lepas" : "vs Previous Month"} value={`${report.expenseChange >= 0 ? "+" : ""}${report.expenseChange.toFixed(1)}%`} icon={TrendingDown} colour={report.expenseChange <= 0 ? "text-emerald-500" : "text-rose-500"}/><MetricCard title={bm ? "Hari Belanja Tertinggi" : "Highest Spending Day"} value={report.highestDay ? `${report.highestDay[0]} · ${money(report.highestDay[1])}` : "—"} icon={CalendarDays}/><MetricCard title={bm ? "Minggu Tertinggi" : "Highest Spending Week"} value={report.highestWeek ? `${report.highestWeek[0]} · ${money(report.highestWeek[1])}` : "—"} icon={BarChart3}/></section>
      <section className="grid grid-cols-4 gap-4"><MetricCard title={bm ? "Baki Wallet" : "Wallet Balance"} value={money(report.walletBalance)} icon={Wallet}/><MetricCard title={bm ? "Bajet Digunakan" : "Budget Used"} value={report.budgetLimit ? `${Math.round(report.expense / report.budgetLimit * 100)}%` : "—"} icon={CircleDollarSign}/><MetricCard title={bm ? "Perbelanjaan Tetap + Langganan" : "Fixed Spending + Subscriptions"} value={money(report.subscription)} icon={CreditCard}/><MetricCard title={bm ? "Komitmen Hutang/Loan" : "Debt/Loan Commitments"} value={money(report.loan + report.debt)} icon={HandCoins}/></section>
      <div className="grid grid-cols-2 gap-4"><Panel title={bm ? "Perbelanjaan Mengikut Wallet" : "Expenses by Wallet"}><div className="h-72"><ChartContainer config={{ value: { label: bm ? "Jumlah" : "Total", color: "var(--chart-1)" }, income: { label: bm ? "Pendapatan" : "Income", color: "var(--chart-2)" }, expense: { label: bm ? "Perbelanjaan" : "Expenses", color: "var(--chart-3)" } }} className="h-full w-full"><BarChart data={report.walletChart}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis hide/><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Bar dataKey="value" radius={[8,8,0,0]}>{report.walletChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}</Bar></BarChart></ChartContainer></div></Panel><Panel title={bm ? "Ringkasan Budget Cycle" : "Budget Cycle Summary"}><p className="text-xs font-bold text-[var(--muted)]">{report.cycleStart.slice(0,10)} — {report.cycleEnd.slice(0,10)}</p><div className="mt-4 grid grid-cols-3 gap-4"><MetricCard title={bm ? "Pendapatan" : "Income"} value={money(report.cycleIncome)} icon={TrendingUp} colour="text-emerald-500"/><MetricCard title={bm ? "Perbelanjaan" : "Expenses"} value={money(report.cycleExpense)} icon={TrendingDown} colour="text-rose-500"/><MetricCard title={bm ? "Baki Kitaran" : "Cycle Balance"} value={money(report.cycleIncome-report.cycleExpense)} icon={Wallet}/></div></Panel></div>
      <div className="grid grid-cols-3 gap-4">{([["Subscription", report.subscriptionChart, CreditCard], ["Loan", report.loanChart, Landmark], [bm ? "Hutang" : "Debt", report.debtChart, HandCoins]] satisfies [string, { name: string; value: number }[], LucideIcon][]).map(([title, rows, Icon], panelIndex) => { const chartRows = rows as { name: string; value: number }[]; return <Panel key={String(title)} title={String(title)}><div className="relative h-60"><ChartContainer config={{ value: { label: bm ? "Jumlah" : "Total", color: "var(--chart-1)" }, income: { label: bm ? "Pendapatan" : "Income", color: "var(--chart-2)" }, expense: { label: bm ? "Perbelanjaan" : "Expenses", color: "var(--chart-3)" } }} className="h-full w-full"><PieChart><Pie data={chartRows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{chartRows.map((_, index) => <Cell key={index} fill={COLORS[(index + panelIndex * 2) % COLORS.length]}/>)}</Pie><ChartTooltip cursor={false} content={<ChartTooltipContent />} /></PieChart></ChartContainer>{chartRows.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[var(--muted)]">{bm ? "Tiada data" : "No data"}</div>}</div><div className="mt-2 flex items-center justify-center gap-2 text-xs font-bold text-[var(--muted)]"><Icon size={14}/>{chartRows.length} {bm ? "rekod" : "records"}</div></Panel> })}</div>
      <div className="grid grid-cols-3 gap-4"><Panel title={bm ? "Pecahan Kategori" : "Category Mix"}><div className="h-60"><ChartContainer config={{ value: { label: bm ? "Jumlah" : "Total", color: "var(--chart-1)" }, income: { label: bm ? "Pendapatan" : "Income", color: "var(--chart-2)" }, expense: { label: bm ? "Perbelanjaan" : "Expenses", color: "var(--chart-3)" } }} className="h-full w-full"><PieChart><Pie data={report.categories.slice(0, 6).map(([name, value]) => ({ name, value }))} dataKey="value" innerRadius={55} outerRadius={85}>{report.categories.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i]}/>)}</Pie><ChartTooltip cursor={false} content={<ChartTooltipContent />} /></PieChart></ChartContainer></div></Panel><Panel title={bm ? "Vendor Teratas" : "Top Merchants"}><div className="divide-y divide-[var(--border)]">{report.vendors.map(([name, value], i) => <div key={name} className="flex min-h-11 items-center justify-between gap-4 py-3 text-sm"><span className="font-bold"><b className="mr-2 text-[var(--muted)]">{i + 1}</b>{name}</span><span className="font-black">{money(value)}</span></div>)}</div></Panel><Panel title={bm ? "Modul Kewangan" : "Financial Modules"}><div className="grid grid-cols-2 gap-4">{([["Wallet", data.wallets?.length || 0, Wallet],["Subscription", data.subscriptions?.length || 0, CreditCard],["Loan", data.loans?.length || 0, Landmark],[bm ? "Hutang" : "Debt", data.debts?.length || 0, HandCoins],[bm ? "Kenderaan" : "Vehicle", data.vehicles?.length || 0, Car],[bm ? "Waranti" : "Warranty", data.warranties?.length || 0, Shield]] satisfies [string, number, LucideIcon][]).map(([name, value, Icon]) => <div key={String(name)} className="rounded-[var(--card-radius-sm)] border border-[var(--border)] bg-[var(--surface-tint)] p-4"><Icon size={15} className="text-amber-400"/><p className="mt-2 text-xs font-bold text-[var(--muted)]">{String(name)}</p><p className="text-lg font-black">{Number(value)}</p></div>)}</div></Panel></div>
    </>}</main></>
}
