"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useState, useEffect, useRef, useMemo } from "react"
import {
 Search,
 Banknote,
 Receipt,
 ArrowLeft,
 ChevronLeft,
 ChevronRight,
 ChevronDown,
 Check,
 SlidersHorizontal,
 Wallet,
 Download,
 ArrowDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Doughnut, Bar } from "react-chartjs-2"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useLang } from "@/lib/lang"
import { usePageAlert } from "@/hooks/usePageAlert"
import { useTheme } from "@/components/theme/ThemeProvider"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageChip,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { splitWalletTaggedDescription } from "@/lib/transaction-display"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import {
 Chart as ChartJS,
 CategoryScale,
 LinearScale,
 BarElement,
 ArcElement,
 Tooltip,
 Legend
} from 'chart.js'
import type { Chart, ChartEvent, ChartOptions } from "chart.js"

type TransactionRecord = TransactionToneTarget & {
 id: number | string
 txn_date?: string | null
 created_at?: string | null
 category_name?: string | null
 category_icon_name?: string | null
 wallet_name?: string | null
 attachment_count?: number | null
}

type DailyChart = Chart<"bar", number[], string> & {
 options: Chart<"bar", number[], string>["options"] & {
 plugins?: {
 customDataLabel?: {
 activeIndex?: number | null
 }
 }
 }
}

type DailyChartPlugins = NonNullable<ChartOptions<"bar">["plugins"]> & {
 customDataLabel: {
 activeIndex: number | null
 }
}

const customDataLabelPlugin = {
 id: 'customDataLabel',
 afterDatasetsDraw(chart: Chart) {
 const typedChart = chart as DailyChart
 const { ctx, data } = chart
 const activeIndex = typedChart.options.plugins?.customDataLabel?.activeIndex
 if (activeIndex === null || activeIndex === undefined) return

 const meta = chart.getDatasetMeta(0)
 const bar = meta?.data?.[activeIndex] as { x: number; y: number } | undefined
 const value = data?.datasets?.[0]?.data?.[activeIndex]
 if (!bar || value === undefined) return

 ctx.save()
 const label = `RM ${formatCurrencyAmount(Number(value))}`
  ctx.font = 'bold 10px "DM Sans", sans-serif'
 ctx.fillStyle = '#FBBC05'
 ctx.textAlign = 'center'
 ctx.textBaseline = 'middle'
 ctx.fillText(label, bar.x, bar.y - 16)
 ctx.restore()
 }
}

const monthlyBarValuePlugin = {
 id: 'monthlyBarValue',
 afterDatasetsDraw(chart: Chart) {
 const { ctx, data } = chart
 ctx.save()
 data.datasets.forEach((dataset, datasetIndex) => {
 const meta = chart.getDatasetMeta(datasetIndex)
 meta.data.forEach((bar, index) => {
 const value = Number(dataset.data[index] || 0)
 if (!Number.isFinite(value) || value <= 0) return
 const point = bar as { x: number; y: number }
  ctx.font = '700 9px "DM Sans", sans-serif'
 ctx.fillStyle = datasetIndex === 0 ? '#059669' : '#e11d48'
 ctx.textAlign = 'center'
 ctx.textBaseline = 'bottom'
 ctx.fillText(`RM ${formatCompactCurrency(value)}`, point.x, point.y - 7)
 })
 })
 ctx.restore()
 }
}

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const DAILY_CHART_TIMEZONE = "Asia/Kuala_Lumpur"
const MOBILE_DAILY_BAR_WIDTH = 44
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const formatCurrencyAmount = (value: number) =>
 Number(value || 0).toLocaleString("en-MY", {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 })

const formatCompactCurrency = (value: number) => {
 const amount = Number(value || 0)
 if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`
 if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}K`
 return amount.toFixed(0)
}

function toDateKey(date: Date) {
 const year = date.getFullYear()
 const month = String(date.getMonth() + 1).padStart(2, "0")
 const day = String(date.getDate()).padStart(2, "0")
 return `${year}-${month}-${day}`
}

function getTxnDateKey(rawDate: string | null | undefined) {
 if (!rawDate) return ""
 const text = String(rawDate).trim()
 if (!text) return ""
 const prefixMatch = text.match(/^(\d{4}-\d{2}-\d{2})/)
 if (prefixMatch?.[1]) return prefixMatch[1]

 const parsed = new Date(text)
 if (Number.isNaN(parsed.getTime())) return ""
 return toDateKey(parsed)
}

function parseDateKey(dateKey: string) {
 const [year, month, day] = dateKey.split("-").map(Number)
 if (!year || !month || !day) return null
 return new Date(year, month - 1, day)
}

function startOfMonth(date: Date) {
 return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number) {
 return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function getMonthBounds(monthKey: string) {
 const [yearText, monthText] = monthKey.split("-")
 const year = Number(yearText)
 const month = Number(monthText)
 if (!Number.isFinite(year) || !Number.isFinite(month)) return null
 const monthStart = new Date(year, month - 1, 1)
 const monthEnd = new Date(year, month, 0)
 return {
 start: toDateKey(monthStart),
 end: toDateKey(monthEnd),
 }
}

function getRecentMonthKeys(baseMonthKey: string, count = 24) {
 const [yearText, monthText] = baseMonthKey.split("-")
 const year = Number(yearText)
 const month = Number(monthText)
 if (!Number.isFinite(year) || !Number.isFinite(month)) return []

 return Array.from({ length: count }, (_, index) => {
 const date = new Date(year, month - 1 - index, 1)
 return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
 })
}

const TRANSFER_LIGHT_TEXT = "text-[#a16207]"
const TRANSFER_DARK_TEXT = "text-[#fbbf24]"

type TransactionToneTarget = {
 amount?: number | string | null
 reference_id?: string | null
 type?: string | null
 is_wallet_transfer?: boolean | null
 vendor_or_source?: string | null
 category_name?: string | null
 notes?: string | null
 source_channel?: string | null
}

function isOwnerSalaryBusinessWithdrawal(tx: TransactionToneTarget) {
 const haystack = [tx.vendor_or_source, tx.reference_id, tx.notes, tx.source_channel]
 .filter(Boolean)
 .join(" ")
 .toLowerCase()
 return (
 !tx.category_name &&
 (haystack.includes("owner salary") || haystack.includes("salary business") || haystack.includes("salary biness")) &&
 (haystack.includes("withdraw") || haystack.includes("widdraw") || haystack.includes("owner salary"))
 )
}

function getTransactionCategoryLabel(tx: TransactionToneTarget, fallback: string) {
 if (tx.category_name) return tx.category_name
 if (isOwnerSalaryBusinessWithdrawal(tx)) return "Salary Business"
 return fallback
}

function isTransferTransaction(tx: TransactionToneTarget) {
 return Boolean(tx?.is_wallet_transfer)
}

function getTransactionAmountPrefix(tx: TransactionToneTarget) {
 if (isTransferTransaction(tx)) {
 const referenceId = (tx?.reference_id || "").trim().toUpperCase()
 const vendor = (tx?.vendor_or_source || "").trim().toLowerCase()

 if (referenceId.endsWith("-I") || vendor.startsWith("transfer from ")) {
 return "+"
 }

 if (referenceId.endsWith("-O") || vendor.startsWith("transfer to ")) {
 return "−"
 }
 }

 return tx?.type === "income" ? "+" : "−"
}

function getTransactionAmountLabel(tx: TransactionToneTarget) {
 const prefix = getTransactionAmountPrefix(tx)
 return `${prefix}RM ${formatCurrencyAmount(Number(tx?.amount || 0))}`
}

function getTransferSummaryLabel(amount: number) {
 return `↔ RM ${formatCurrencyAmount(amount)}`
}

export default function TransactionsPage() {
 const params = useParams()
 const router = useRouter()
 const searchParams = useSearchParams()
 const { lang, timezone, timeFormat, t: langT } = useLang()
 const { showAlert, alertModal } = usePageAlert(lang)
 const { resolvedTheme } = useTheme()
 const isLight = resolvedTheme === "light"
 const sessionId = params.sessionId as string || ""
 const [transactions, setTransactions] = useState<TransactionRecord[]>([])
 const [statsSnapshot, setStatsSnapshot] = useState({
 balance: 0,
 income_month: 0,
 expense_month: 0,
 })
 const [apiCategories, setApiCategories] = useState<{ id: number; name: string; kind?: "expense" | "income" }[]>([])
 const [apiWallets, setApiWallets] = useState<{ id: number; name: string; label?: string | null }[]>([])
 const [loading, setLoading] = useState(true)
 const showDataSkeleton = useDelayedSkeleton(loading)
 const [searchQuery, setSearchQuery] = useState("")
 const [selectedMonth, setSelectedMonth] = useState("")
 const [selectedType, setSelectedType] = useState<"all" | "expense" | "income" | "transfer">("all")
 const [selectedCategory, setSelectedCategory] = useState("all")
 const [selectedWallet, setSelectedWallet] = useState("all")
 const [startDate, setStartDate] = useState("")
 const [endDate, setEndDate] = useState("")
 const [showDateFilterPopup, setShowDateFilterPopup] = useState(false)
 const [draftStartDate, setDraftStartDate] = useState("")
 const [draftEndDate, setDraftEndDate] = useState("")
 const [calendarViewMonth, setCalendarViewMonth] = useState(() => startOfMonth(new Date()))
 const [activeTab] = useState<"transactions" | "breakdown">("transactions")

 const [error, setError] = useState<string | null>(null)
 const [activeDailyBarIndex, setActiveDailyBarIndex] = useState<number | null>(null)
 const [isMobileViewport, setIsMobileViewport] = useState(false)
 const dailyChartScrollRef = useRef<HTMLDivElement | null>(null)
 const didInitMonthRef = useRef(false)
 const didShowDeletedAlertRef = useRef(false)
 useEffect(() => {
 if (searchParams.get("deleted") !== "success" || didShowDeletedAlertRef.current) return

 didShowDeletedAlertRef.current = true
 router.replace(`/${sessionId}/transactions`, { scroll: false })
 showAlert(
 lang === "EN" ? "Deleted" : "Berjaya Dipadam",
 lang === "EN" ? "Transaction deleted successfully." : "Transaksi berjaya dipadam.",
 "success"
 )
 }, [searchParams, lang, router, sessionId])

 const currentMonthInKualaLumpur = new Intl.DateTimeFormat("en-CA", {
 year: "numeric",
 month: "2-digit",
 timeZone: DAILY_CHART_TIMEZONE,
 }).format(new Date())

 useEffect(() => {
 const fetchDropdownData = async () => {
 const token = getAccessToken()
 try {
 const [catsRes, walsRes] = await Promise.all([
 fetch("/api/categories", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined }),
 fetch("/api/wallets", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined })
 ])
 if (catsRes.ok) {
 const catsData = await catsRes.json()
 setApiCategories(catsData)
 }
 if (walsRes.ok) {
 const walsData = await walsRes.json()
 setApiWallets(walsData)
 }
 } catch (err) {
 console.error("Failed to load dropdown data:", err)
 }
 }
 fetchDropdownData()
 }, [])

 useEffect(() => {
 if (didInitMonthRef.current) return
 didInitMonthRef.current = true
 setSelectedMonth(currentMonthInKualaLumpur)
 }, [currentMonthInKualaLumpur])

 useEffect(() => {
 if (!selectedMonth) return

 const fetchTxns = async () => {
 try {
 setLoading(true)
 setError(null)
 const token = getAccessToken()
 const monthBounds = getMonthBounds(selectedMonth)
 const hasFilterNeedingGraphWindow = !startDate && !endDate && (
 searchQuery.trim().length > 0 ||
 selectedType !== "all" ||
 selectedCategory !== "all" ||
 selectedWallet !== "all"
 )
 const [selectedYearText, selectedMonthText] = selectedMonth.split("-")
 const selectedYear = Number(selectedYearText)
 const selectedMonthNumber = Number(selectedMonthText)
 const graphWindowStart = Number.isFinite(selectedYear) && Number.isFinite(selectedMonthNumber)
 ? toDateKey(new Date(selectedYear, selectedMonthNumber - 6, 1))
 : monthBounds?.start || ""
 const effectiveStartDate = startDate || (hasFilterNeedingGraphWindow ? graphWindowStart : monthBounds?.start || "")
 const effectiveEndDate = endDate || monthBounds?.end || ""
  const transactionParams = new URLSearchParams({ limit: "1000" })
 if (effectiveStartDate) transactionParams.set("start_date", effectiveStartDate)
 if (effectiveEndDate) transactionParams.set("end_date", effectiveEndDate)

 const [txRes, statsRes] = await Promise.all([
 fetch(`/api/transactions?${transactionParams.toString()}`, {
 credentials: "include",
 headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
 }),
 fetch("/api/stats", {
 credentials: "include",
 headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
 }),
 ])

 if (!txRes.ok) throw new Error(String(txRes.status))

 const data = (await txRes.json()) as TransactionRecord[]
 setTransactions(data)

 if (statsRes.ok) {
 const stats = await statsRes.json()
 setStatsSnapshot({
 balance: Number(stats?.balance || 0),
 income_month: Number(stats?.income_month || 0),
 expense_month: Number(stats?.expense_month || 0),
 })
 }
 } catch (err: unknown) {
 console.error("Fetch txns error:", err)
 setError(err instanceof Error ? err.message : "Failed to load transactions.")
 } finally {
 setLoading(false)
 }
 }
 fetchTxns()
 }, [endDate, searchQuery, selectedCategory, selectedMonth, selectedType, selectedWallet, startDate])

 const monthOptions = useMemo(
 () =>
 Array.from(
 new Set([
 currentMonthInKualaLumpur,
 selectedMonth,
 ...getRecentMonthKeys(currentMonthInKualaLumpur, 24),
 ...transactions
 .map((tx) => getTxnDateKey(tx.txn_date).slice(0, 7))
 .filter(Boolean),
 ]),
 )
 .filter(Boolean)
 .sort()
 .reverse(),
 [currentMonthInKualaLumpur, selectedMonth, transactions],
 )

 const categoryOptions = useMemo(
 () => {
 const byNameFromApi = new Map(apiCategories.map((c) => [(c.name || "").trim(), c.kind]))
 const names = Array.from(new Set([
 ...apiCategories.map((c) => (c.name || "").trim()).filter(Boolean),
 ...transactions.map((tx) => (tx.category_name || "").trim()).filter(Boolean),
 ]))
 const expense = names
 .filter((name) => byNameFromApi.get(name) === "expense")
 .sort((a, b) => a.localeCompare(b))
 const income = names
 .filter((name) => byNameFromApi.get(name) === "income")
 .sort((a, b) => a.localeCompare(b))
 const unknown = names
 .filter((name) => !byNameFromApi.get(name))
 .sort((a, b) => a.localeCompare(b))
 return { expense, income, unknown, all: [...expense, ...income, ...unknown] }
 },
 [apiCategories, transactions],
 )

 const walletOptions = useMemo(
 () => {
 return apiWallets
 .map((w) => ({ value: (w.name || "").trim(), label: (w.label || w.name || "").trim() }))
 .filter((w) => w.value && w.label)
 .sort((a, b) => a.label.localeCompare(b.label))
 },
 [apiWallets],
 )

 const shouldIgnoreMonthForFilterGraph = !startDate && !endDate && (
 searchQuery.trim().length > 0 ||
 selectedType !== "all" ||
 selectedCategory !== "all" ||
 selectedWallet !== "all"
 )

 const filteredTxns = transactions.filter(t => {
 const txnDateKey = getTxnDateKey(t.txn_date)
 const monthBounds = selectedMonth ? getMonthBounds(selectedMonth) : null
 const effectiveStartDate = startDate || (shouldIgnoreMonthForFilterGraph ? "" : monthBounds?.start || "")
 const effectiveEndDate = endDate || (shouldIgnoreMonthForFilterGraph ? "" : monthBounds?.end || "")
 let matchesDate = true
 if (effectiveStartDate && effectiveEndDate) {
 matchesDate = txnDateKey >= effectiveStartDate && txnDateKey <= effectiveEndDate
 } else if (effectiveStartDate) {
 matchesDate = txnDateKey >= effectiveStartDate
 } else if (effectiveEndDate) {
 matchesDate = txnDateKey <= effectiveEndDate
 }

 const matchesType = selectedType === "all"
 ? true
 : selectedType === "transfer"
 ? isTransferTransaction(t)
 : (t.type === selectedType && !isTransferTransaction(t))
 const matchesCategory = selectedCategory === "all"
 ? true
 : (t.category_name || "").trim() === selectedCategory
 const selectedWalletOption = walletOptions.find((wallet) => wallet.value === selectedWallet)
 const selectedWalletAliases = new Set([selectedWallet, selectedWalletOption?.label].filter(Boolean))
 const matchesWallet = selectedWallet === "all"
 ? true
 : selectedWalletAliases.has((t.wallet_name || "").trim())
 const matchesSearch = searchQuery ? (
 t.vendor_or_source?.toLowerCase().includes(searchQuery.toLowerCase()) ||
 getTransactionCategoryLabel(t, "").toLowerCase().includes(searchQuery.toLowerCase())
 ) : true
 return matchesDate && matchesType && matchesCategory && matchesWallet && matchesSearch
 })
 const analyticalFilteredTxns = filteredTxns.filter((t) => !t.is_wallet_transfer)
 const analyticalTransactions = transactions.filter((t) => !t.is_wallet_transfer)
 const hasActiveSearch = searchQuery.trim().length > 0
 const searchMatchedCount = hasActiveSearch ? filteredTxns.length : 0
 const hasDateRangeFilter = Boolean(startDate || endDate)
 const searchMatchedTotal = useMemo(() => {
 if (!hasActiveSearch) return 0
 return filteredTxns.reduce((acc, tx) => {
 const amount = Number(tx.amount || 0)
 const isPositive = getTransactionAmountPrefix(tx) === "+"
 return acc + (isPositive ? amount : -amount)
 }, 0)
 }, [filteredTxns, hasActiveSearch])

 const openDateFilterPopup = () => {
 setDraftStartDate(startDate)
 setDraftEndDate(endDate)
 const baseDateKey = startDate || endDate || `${selectedMonth || ""}-01`
 const baseDate = baseDateKey ? parseDateKey(baseDateKey) : null
 setCalendarViewMonth(startOfMonth(baseDate || new Date()))
 setShowDateFilterPopup(true)
 }

 const applyDateFilter = () => {
 let nextStart = draftStartDate
 let nextEnd = draftEndDate
 if (nextStart && nextEnd && nextStart > nextEnd) {
 const swappedStart = nextEnd
 nextEnd = nextStart
 nextStart = swappedStart
 }
 setStartDate(nextStart)
 setEndDate(nextEnd)
 setShowDateFilterPopup(false)
 }

 const clearDateFilter = () => {
 setDraftStartDate("")
 setDraftEndDate("")
 setStartDate("")
 setEndDate("")
 setShowDateFilterPopup(false)
 }

 const handleCalendarDaySelect = (dateKey: string) => {
 if (!draftStartDate || (draftStartDate && draftEndDate)) {
 setDraftStartDate(dateKey)
 setDraftEndDate("")
 return
 }

 if (dateKey < draftStartDate) {
 setDraftEndDate(draftStartDate)
 setDraftStartDate(dateKey)
 return
 }

 setDraftEndDate(dateKey)
 }

 const [currentPage, setCurrentPage] = useState(1)
 const [mobileVisibleCount, setMobileVisibleCount] = useState(20)
 const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null)
 const itemsPerPage = 20

 useEffect(() => {
 setCurrentPage(1)
 setMobileVisibleCount(20)
 }, [searchQuery, selectedMonth, selectedType, selectedCategory, selectedWallet, startDate, endDate])

 useEffect(() => {
 if (selectedCategory !== "all" && !categoryOptions.all.includes(selectedCategory)) {
 setSelectedCategory("all")
 }
 }, [categoryOptions, selectedCategory])

 useEffect(() => {
 if (selectedWallet !== "all" && !walletOptions.some((wallet) => wallet.value === selectedWallet)) {
 setSelectedWallet("all")
 }
 }, [selectedWallet, walletOptions])

 const totalPages = Math.ceil(filteredTxns.length / itemsPerPage)
 const paginatedTxns = filteredTxns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
 const mobileVisibleTxns = filteredTxns.slice(0, mobileVisibleCount)

 const mobileDateRangeLabel = useMemo(() => {
 const locale = lang === "EN" ? "en-MY" : "ms-MY"
 const monthBounds = selectedMonth ? getMonthBounds(selectedMonth) : null
 const effectiveStartDate = startDate || monthBounds?.start || ""
 const effectiveEndDate = endDate || monthBounds?.end || ""
 if (!effectiveStartDate && !effectiveEndDate) return langT.allTransactions
 const startDateObj = effectiveStartDate ? parseDateKey(effectiveStartDate) : null
 const endDateObj = effectiveEndDate ? parseDateKey(effectiveEndDate) : null
 if (!startDateObj || !endDateObj) return selectedMonth || langT.allTransactions
 const startLabel = startDateObj.toLocaleDateString(locale, { day: "numeric", month: "short" })
 const endLabel = endDateObj.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
 return `${startLabel} - ${endLabel}`
 }, [endDate, lang, langT.allTransactions, selectedMonth, startDate])

 const calendarMonthLabel = useMemo(
 () =>
 calendarViewMonth.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", {
 month: "long",
 year: "numeric",
 }),
 [calendarViewMonth, lang],
 )

 const calendarCells = useMemo(() => {
 const monthStart = startOfMonth(calendarViewMonth)
 const year = monthStart.getFullYear()
 const month = monthStart.getMonth()
 const firstWeekday = monthStart.getDay()
 const daysInMonth = new Date(year, month + 1, 0).getDate()

 const cells: Array<{ key: string; dateKey: string | null; dayLabel: string }> = []
 for (let i = 0; i < firstWeekday; i += 1) {
 cells.push({ key: `empty-${i}`, dateKey: null, dayLabel: "" })
 }
 for (let day = 1; day <= daysInMonth; day += 1) {
 const dateKey = toDateKey(new Date(year, month, day))
 cells.push({ key: dateKey, dateKey, dayLabel: String(day) })
 }
 const trailingCells = (7 - (cells.length % 7)) % 7
 for (let i = 0; i < trailingCells; i += 1) {
 cells.push({ key: `trail-empty-${i}`, dateKey: null, dayLabel: "" })
 }
 return cells
 }, [calendarViewMonth])

 const totalIncome = analyticalFilteredTxns.filter(t => t.type === 'income').reduce((acc, t) => acc + (t.amount as number), 0)
 const totalExpense = analyticalFilteredTxns.filter(t => t.type === 'expense').reduce((acc, t) => acc + (t.amount as number), 0)

 const sixMonthGraphData = useMemo(() => {
 const [yearText, monthText] = (selectedMonth || currentMonthInKualaLumpur).split("-")
 const baseYear = Number(yearText)
 const baseMonth = Number(monthText)
 if (!Number.isFinite(baseYear) || !Number.isFinite(baseMonth)) return null

 const monthBuckets = Array.from({ length: 6 }, (_, index) => {
 const date = new Date(baseYear, baseMonth - 1 - (5 - index), 1)
 const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
 return {
 key,
 label: date.toLocaleString(lang === "EN" ? "en-MY" : "ms-MY", { month: "short" }),
 income: 0,
 expense: 0,
 }
 })

 const bucketIndex = new Map(monthBuckets.map((item, idx) => [item.key, idx]))
 filteredTxns.forEach((tx) => {
 const dateKey = getTxnDateKey(tx.txn_date)
 if (!dateKey) return
 const monthKey = dateKey.slice(0, 7)
 const idx = bucketIndex.get(monthKey)
 if (idx === undefined) return
 const amount = Number(tx.amount || 0)
 if (isTransferTransaction(tx)) return
 if (tx.type === "income") monthBuckets[idx].income += amount
 if (tx.type === "expense") monthBuckets[idx].expense += amount
 })

 return {
 labels: monthBuckets.map((m) => m.label),
 datasets: [
 {
 label: lang === "EN" ? "Income" : "Pendapatan",
 data: monthBuckets.map((m) => m.income),
 backgroundColor: "#10b981",
 hoverBackgroundColor: "#059669",
 borderRadius: 14,
 borderSkipped: false,
 maxBarThickness: 18,
 categoryPercentage: 0.58,
 barPercentage: 0.72,
 },
 {
 label: lang === "EN" ? "Expenses" : "Perbelanjaan",
 data: monthBuckets.map((m) => m.expense),
 backgroundColor: "#fb7185",
 hoverBackgroundColor: "#e11d48",
 borderRadius: 14,
 borderSkipped: false,
 maxBarThickness: 18,
 categoryPercentage: 0.58,
 barPercentage: 0.72,
 },
 ],
 }
 }, [filteredTxns, selectedMonth, currentMonthInKualaLumpur, lang])

 const showGraphMode = hasActiveSearch || hasDateRangeFilter || selectedType !== "all" || selectedCategory !== "all" || selectedWallet !== "all"
 const filteredNetFlow = filteredTxns.reduce((acc, tx) => {
 const amount = Number(tx.amount || 0)
 const isPositive = getTransactionAmountPrefix(tx) === "+"
 return acc + (isPositive ? amount : -amount)
 }, 0)
 const shouldUseStatsMonthlySummary =
 !hasActiveSearch &&
 !hasDateRangeFilter &&
 selectedType === "all" &&
 selectedCategory === "all" &&
 selectedWallet === "all" &&
 selectedMonth === currentMonthInKualaLumpur
 const displayIncome = shouldUseStatsMonthlySummary ? statsSnapshot.income_month : totalIncome
 const displayExpense = shouldUseStatsMonthlySummary ? statsSnapshot.expense_month : totalExpense

 useEffect(() => {
 const onResize = () => {
 setIsMobileViewport(window.innerWidth < 768)
 }
 onResize()
 window.addEventListener("resize", onResize)
 return () => window.removeEventListener("resize", onResize)
 }, [])

 const currentDayInKualaLumpur = Math.max(
 1,
 Number(
 new Intl.DateTimeFormat("en-US", {
 day: "numeric",
 timeZone: DAILY_CHART_TIMEZONE,
 }).format(new Date())
 )
 )

 // Daily view follows the active month fetched from the API.
 const dailyMonthKey = selectedMonth || currentMonthInKualaLumpur
 const [dailyYear, dailyMonth] = dailyMonthKey.split("-").map(Number)
 const daysInDailyMonth = Number.isFinite(dailyYear) && Number.isFinite(dailyMonth)
 ? new Date(dailyYear, dailyMonth, 0).getDate()
 : 31

 // Keep daily chart stable like Dashboard:
 // always based on current KL month from full transactions (not list filters).
 const dailySeries = Array.from({ length: daysInDailyMonth }, (_, index) => {
 const dayNumber = index + 1
 const dayKey = `${dailyMonthKey}-${String(dayNumber).padStart(2, "0")}`
 const expenseTotal = analyticalTransactions
 .filter((tx) => getTxnDateKey(tx.txn_date) === dayKey && tx.type === "expense")
 .reduce((acc, tx) => acc + (tx.amount as number), 0)

 const stableDate = new Date(Date.UTC(dailyYear || 2000, (dailyMonth || 1) - 1, dayNumber, 12))
 return {
 key: dayKey,
 dayNumber,
 axisLabel: stableDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", {
 day: "numeric",
 timeZone: "UTC",
 }),
 label: stableDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", {
 day: "numeric",
 month: "short",
 timeZone: "UTC",
 }),
 total: expenseTotal,
 }
 })

 const defaultDailyBarIndex = Math.max(
 0,
 Math.min(
 daysInDailyMonth - 1,
 dailyMonthKey === currentMonthInKualaLumpur ? currentDayInKualaLumpur - 1 : daysInDailyMonth - 1,
 )
 )

 const resolvedDailyBarIndex = activeDailyBarIndex === null
 ? defaultDailyBarIndex
 : Math.max(0, Math.min(dailySeries.length - 1, activeDailyBarIndex))
 const mobileDailyChartWidth = Math.max(dailySeries.length * MOBILE_DAILY_BAR_WIDTH, 920)
 const dailyExpenseData = {
 labels: dailySeries.map((item) => item.axisLabel),
 datasets: [
 {
 data: dailySeries.map((item) => item.total),
 backgroundColor: dailySeries.map((_, index) => (
 index === resolvedDailyBarIndex ? "#fbbf24" : "#404040"
 )),
 borderRadius: 8,
 borderSkipped: false,
 maxBarThickness: 22,
 },
 ],
 }

 useEffect(() => {
 if (!dailySeries.length) return
 setActiveDailyBarIndex(defaultDailyBarIndex)
 }, [dailyMonthKey, dailySeries.length, defaultDailyBarIndex])

 useEffect(() => {
 if (!isMobileViewport || activeTab !== "breakdown" || !dailySeries.length) return
 const container = dailyChartScrollRef.current
 if (!container) return
 const slotWidth = mobileDailyChartWidth / dailySeries.length
 const nextScrollLeft = Math.max(
 0,
 defaultDailyBarIndex * slotWidth - container.clientWidth / 2 + slotWidth / 2
 )
 let frameB: number | null = null
 const frameA = window.requestAnimationFrame(() => {
 container.scrollLeft = nextScrollLeft
 frameB = window.requestAnimationFrame(() => {
 container.scrollLeft = nextScrollLeft
 })
 })
 return () => {
 window.cancelAnimationFrame(frameA)
 if (frameB !== null) window.cancelAnimationFrame(frameB)
 }
 }, [activeTab, isMobileViewport, mobileDailyChartWidth, dailySeries.length, defaultDailyBarIndex])

 const handleDailyChartScroll = () => {
 if (!isMobileViewport) return
 const container = dailyChartScrollRef.current
 if (!container || !dailySeries.length) return
 const slotWidth = mobileDailyChartWidth / dailySeries.length
 const centerX = container.scrollLeft + container.clientWidth / 2
 const nextIndex = Math.max(
 0,
 Math.min(dailySeries.length - 1, Math.round(centerX / slotWidth - 0.5))
 )
 setActiveDailyBarIndex((prev) => (prev === nextIndex ? prev : nextIndex))
 }

 const handleMonthChange = (direction: number) => {
 if (!selectedMonth) return
 const [y, m] = selectedMonth.split('-').map(Number)
 const date = new Date(y, m - 1 + direction, 1)
 
 // Check if future
 const now = new Date()
 const currentBudgetMonth = new Date(now.getFullYear(), now.getMonth(), 1)
 if (date > currentBudgetMonth) return
 
 const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
 setSelectedMonth(monthStr)
 }


 function handleExport() {
 if (filteredTxns.length === 0) {
 alert(langT.exportNoRecords)
 return
 }

 const escapeHtml = (value: unknown) => String(value ?? "")
 .replace(/&/g, "&amp;")
 .replace(/</g, "&lt;")
 .replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;")

 const rows = filteredTxns.map(tx => {
 const d = tx.txn_date ? new Date(tx.txn_date) : new Date()
 const formattedDate = new Intl.DateTimeFormat('en-MY', {
 day: '2-digit',
 month: '2-digit',
 year: 'numeric',
 }).format(d)
 return `
 <tr>
 <td>${escapeHtml(tx.reference_id || "")}</td>
 <td>${escapeHtml(formattedDate)}</td>
 <td>${escapeHtml(tx.vendor_or_source || "")}</td>
 <td>${escapeHtml(getTransactionCategoryLabel(tx, langT.other))}</td>
 <td>${escapeHtml(tx.wallet_name || "")}</td>
 <td>${escapeHtml(tx.type || "")}</td>
 <td style="mso-number-format:'0.00';">${Number(tx.amount || 0).toFixed(2)}</td>
 </tr>`
 }).join("")

 const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
 table { border-collapse: collapse; width: 100%; }
 th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; text-align: left; }
 th { background: #111827; color: #ffffff; font-weight: 700; }
 tr:nth-child(even) td { background: #f8fafc; }
</style>
</head>
<body>
 <table>
 <thead>
 <tr>
 <th>Reference ID</th>
 <th>${escapeHtml(langT.csvDate)}</th>
 <th>${escapeHtml(langT.csvDescription)}</th>
 <th>${escapeHtml(langT.csvCategory)}</th>
 <th>${escapeHtml(langT.walletLabel || 'Wallet')}</th>
 <th>${escapeHtml(langT.csvType)}</th>
 <th>${escapeHtml(langT.csvAmount)}</th>
 </tr>
 </thead>
 <tbody>${rows}</tbody>
 </table>
</body>
</html>`

 const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
  a.download = 'budget-by-MyPeribadi-export.xls'
 a.click()
 URL.revokeObjectURL(url)
 }

 const categoryColors = [
 '#f87171', '#fb923c', '#fbbf24', '#34d399', '#818cf8',
 '#a78bfa', '#f472b6', '#38bdf8', '#6b7194', '#e879f9',
 ]

 const getDoughnutData = () => {
 const categories: Record<string, number> = {}
 analyticalFilteredTxns.filter(t => t.type === 'expense').forEach(t => {
 const cat = getTransactionCategoryLabel(t, "Lain-lain")
 categories[cat] = (categories[cat] || 0) + (t.amount as number)
 })

 const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1])
 const labels = sorted.map(s => s[0])
 const data = sorted.map(s => s[1])

 return {
 labels,
 datasets: [{
 data,
 backgroundColor: categoryColors.slice(0, labels.length),
 borderWidth: 0,
 hoverOffset: 6,
 }]
 }
 }

 const doughnutData = getDoughnutData()
 const buildGroupedTransactions = (sourceTxns: TransactionRecord[]) =>
 (Object.entries(
 sourceTxns.reduce((groups, tx) => {
 const date = tx.txn_date
 ? getTxnDateKey(tx.txn_date)
 : langT.noDate
 if (!groups[date]) groups[date] = []
 groups[date].push(tx)
 return groups
 }, {} as Record<string, TransactionRecord[]>)
 ) as [string, TransactionRecord[]][])
 .sort(([a], [b]) => b.localeCompare(a))
 .map(([date, groupTxns]) => {
 const expenseTotal = groupTxns.reduce((total, tx) => {
 if (tx.type !== "expense" || tx.is_wallet_transfer) return total
 return total + Number(tx.amount || 0)
 }, 0)
 const incomeTotal = groupTxns.reduce((total, tx) => {
 if (tx.type !== "income" || tx.is_wallet_transfer) return total
 return total + Number(tx.amount || 0)
 }, 0)
 const transferTotal = groupTxns.reduce((total, tx) => {
 if (!tx.is_wallet_transfer || tx.type !== "income") return total
 return total + Number(tx.amount || 0)
 }, 0)

 return { date, groupTxns, expenseTotal, incomeTotal, transferTotal }
 })

 const groupedPaginatedTxns = useMemo(
 () => buildGroupedTransactions(paginatedTxns),
 [langT.noDate, paginatedTxns],
 )
 const groupedFilteredTxns = useMemo(
 () => buildGroupedTransactions(mobileVisibleTxns),
 [langT.noDate, mobileVisibleTxns],
 )
 useEffect(() => {
 if (typeof window === "undefined") return
 const target = mobileLoadMoreRef.current
 if (!target) return
 if (mobileVisibleCount >= filteredTxns.length) return

 const observer = new IntersectionObserver(
 (entries) => {
 const entry = entries[0]
 if (!entry?.isIntersecting) return
 setMobileVisibleCount((prev) => Math.min(prev + 20, filteredTxns.length))
 },
 { root: null, rootMargin: "160px 0px", threshold: 0.01 }
 )

 observer.observe(target)
 return () => observer.disconnect()
 }, [filteredTxns.length, mobileVisibleCount])

 return (
 // overflow-x-hidden on desktop breaks position:sticky for the top bar
 <div className="max-w-full space-y-4 overflow-x-hidden pb-8 md:space-y-0 md:overflow-x-visible md:pb-0">
 {/* Mobile header */}
 <div className="border-b border-[color:var(--border)] pb-4 md:hidden">
 <MobilePageHeader
 title={lang === "EN" ? "Transactions" : "Transaksi"}
 fallbackHref={`/${sessionId}`}
 action={
 <MobileIconButton
 onClick={handleExport}
 disabled={filteredTxns.length === 0 || loading}
 label={langT.download}
 >
 <Download strokeWidth={2.5} />
 </MobileIconButton>
 }
 />
 </div>

 {/* Desktop top bar — must stay outside overflow containers to sticky against main */}
 <DesktopPageHeader
   className="hidden md:block"
 title={lang === "EN" ? "Transactions" : "Transaksi"}
 actions={
 <>
 <DesktopPageChip>
 {filteredTxns.length} {lang === "EN" ? "records" : "rekod"}
 </DesktopPageChip>
 <DesktopPageAction onClick={handleExport} disabled={filteredTxns.length === 0 || loading}>
 <Download strokeWidth={2.5} />
 {langT.download}
 </DesktopPageAction>
 </>
 }
 />

 <DesktopPageBody className="flex flex-col gap-4 md:gap-6">
 {/* Search + filters (mobile keeps full width via portal-page-body only on md+) */}
 <div className="flex flex-col gap-4 border-b border-[color:var(--border)] pb-5 md:border-b-0 md:pb-0">
 {/* Search Bar */}
 <div className="w-full">
 <div className="mx-auto flex w-full max-w-2xl items-center gap-2 md:max-w-none">
 <div className="relative flex-1">
 <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
 <input
 type="text"
 placeholder={langT.searchTransactions}
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-11 pr-4 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] transition-all focus:ring-1 focus:ring-[var(--text)]/20 md:h-9 md:text-xs"
 />
 </div>
 <button
 type="button"
 aria-label={lang === "EN" ? "Date filters" : "Penapis tarikh"}
 className={cn(
 "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-[var(--card)] text-[var(--muted)] transition-all",
 showDateFilterPopup || hasDateRangeFilter
 ? "border-[var(--text)]/25 text-[var(--text)]"
 : "border-[var(--border)]"
 )}
 onClick={openDateFilterPopup}
 >
 <SlidersHorizontal size={16} />
 </button>
 </div>
 <div className="mx-auto w-full max-w-2xl md:max-w-none">
 {hasActiveSearch && (
 <div className="mt-2 flex items-center justify-between rounded-xl border border-[var(--text)]/15 bg-[var(--surface-tint-strong)] px-3 py-2 text-xs shadow-md shadow-black/10">
 <span className="font-semibold text-[var(--muted)]">
 {lang === "EN" ? `${searchMatchedCount} match(es)` : `${searchMatchedCount} padanan`}
 </span>
 <span
   className={cn(
 "font-black tabular-nums",
 searchMatchedTotal >= 0
 ? (isLight ? "text-emerald-600" : "text-emerald-300")
 : (isLight ? "text-rose-600" : "text-rose-300")
 )}
 >
 {lang === "EN" ? "Search Total: " : "Jumlah Carian: "}
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-28" /> : <>{searchMatchedTotal >= 0 ? "+" : "−"}RM {formatCurrencyAmount(Math.abs(searchMatchedTotal))}</>}
 </span>
 </div>
 )}
 </div>
 </div>

 {/* Keep existing month navigation logic but hide this legacy visual block */}
 <div className="hidden flex-col items-center gap-1">
 <div className="flex items-center gap-6">
 <button 
 onClick={() => handleMonthChange(-1)}
 className="p-2 hover:bg-[var(--text)]/5 rounded-full transition-colors text-[var(--text)] active:scale-90"
 title={langT.previousMonth}
 >
 <ChevronLeft size={24} strokeWidth={3} />
 </button>
 
 <h1 className="text-4xl md:text-5xl font-extrabold text-[var(--text)] uppercase tracking-tight min-w-[200px] text-center">
 {selectedMonth ? new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]) - 1).toLocaleString(lang === 'EN' ? 'en-MY' : 'ms-MY', { month: 'long' }) : langT.all}
 </h1>

 <button 
 onClick={() => handleMonthChange(1)}
 disabled={(() => {
 if (!selectedMonth) return true
 const [y, m] = selectedMonth.split('-').map(Number)
 const date = new Date(y, m - 1 + 1, 1)
 const now = new Date()
 return date > new Date(now.getFullYear(), now.getMonth(), 1)
 })()}
 className="p-2 hover:bg-[var(--text)]/5 rounded-full transition-colors text-[var(--text)] active:scale-90 disabled:opacity-0 disabled:pointer-events-none"
 title={langT.nextMonth}
 >
 <ChevronRight size={24} strokeWidth={3} />
 </button>
 </div>
 
 <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.3em]">
 {selectedMonth ? selectedMonth.split('-')[0] : langT.allTransactions}
 </p>
 </div>

 <div id="transactions-filter-row" className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4 md:max-w-[1280px] md:grid-cols-4">
 <FilterSelect
 value={selectedMonth}
 onChange={setSelectedMonth}
 ariaLabel={lang === "EN" ? "Filter by month" : "Tapis ikut bulan"}
 isMobile={isMobileViewport}
 options={[
 ...monthOptions.map((monthKey) => ({
 value: monthKey,
 label: new Date(
 Number(monthKey.split("-")[0]),
 Number(monthKey.split("-")[1]) - 1,
 1,
 ).toLocaleString(lang === "EN" ? "en-MY" : "ms-MY", {
 month: "long",
 year: "numeric",
 }),
 })),
 ]}
 />

 <FilterSelect
 value={selectedType}
 onChange={(value) => setSelectedType(value as "all" | "expense" | "income" | "transfer")}
 ariaLabel={lang === "EN" ? "Filter by type" : "Tapis ikut jenis"}
 isMobile={isMobileViewport}
 options={[
 { value: "all", label: lang === "EN" ? "Type" : "Jenis" },
 { value: "expense", label: langT.expense },
 { value: "income", label: langT.income },
 { value: "transfer", label: lang === "EN" ? "Transfer" : "Pindahan" },
 ]}
 />

 <FilterSelect
 value={selectedCategory}
 onChange={setSelectedCategory}
 ariaLabel={lang === "EN" ? "Filter by category" : "Tapis ikut kategori"}
 isMobile={isMobileViewport}
 alignMenu="right"
 options={[
 { value: "all", label: lang === "EN" ? "Category" : "Kategori" },
 ...(categoryOptions.expense.length ? [{ value: "__group_expense", label: lang === "EN" ? "Expenses" : "Belanja", disabled: true }] : []),
 ...categoryOptions.expense.map((category) => ({ value: category, label: category })),
 ...(categoryOptions.income.length ? [{ value: "__group_income", label: lang === "EN" ? "Income" : "Pendapatan", disabled: true }] : []),
 ...categoryOptions.income.map((category) => ({ value: category, label: category })),
 ...(categoryOptions.unknown.length ? [{ value: "__group_other", label: lang === "EN" ? "Other" : "Lain-lain", disabled: true }] : []),
 ...categoryOptions.unknown.map((category) => ({ value: category, label: category })),
 ]}
 />

 <FilterSelect
 value={selectedWallet}
 onChange={setSelectedWallet}
 ariaLabel={lang === "EN" ? "Filter by wallet" : "Tapis ikut dompet"}
 isMobile={isMobileViewport}
 alignMenu="right"
 options={[
 { value: "all", label: lang === "EN" ? "Wallet" : "Dompet" },
 ...walletOptions,
 ]}
 />
 </div>

 </div>

 
 {showDateFilterPopup && (
 <div
   className="fixed inset-0 z-50 bg-transparent"
 onClick={() => setShowDateFilterPopup(false)}
 >
 <div
   className="mx-auto mt-[calc(env(safe-area-inset-top,0px)+5.9rem)] w-[min(94vw,380px)] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between gap-2">
 <p className="text-sm font-bold text-[var(--text)]">
 {lang === "EN" ? "Calendar Filter" : "Penapis Kalendar"}
 </p>
 <div className="flex items-center gap-1">
 <button
 type="button"
 aria-label={lang === "EN" ? "Previous month" : "Bulan lepas"}
 onClick={() => setCalendarViewMonth((prev) => addMonths(prev, -1))}
 className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition hover:text-[var(--text)]"
 >
 <ChevronLeft size={14} />
 </button>
 <button
 type="button"
 aria-label={lang === "EN" ? "Next month" : "Bulan depan"}
 onClick={() => setCalendarViewMonth((prev) => addMonths(prev, 1))}
 className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition hover:text-[var(--text)]"
 >
 <ChevronRight size={14} />
 </button>
 </div>
 </div>

 <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-2">
 <p className="px-1 text-center text-xs font-semibold text-[var(--muted)]">
 {calendarMonthLabel}
 </p>
 <div className="mt-2 grid grid-cols-7 gap-1">
 {WEEKDAY_LABELS.map((weekday) => (
 <div
 key={weekday}
 className="flex h-7 items-center justify-center text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--muted)]"
 >
 {weekday}
 </div>
 ))}
 {calendarCells.map((cell) => {
 if (!cell.dateKey) {
 return <div key={cell.key} className="h-9 rounded-lg" />
 }

 const isStart = Boolean(draftStartDate) && cell.dateKey === draftStartDate
 const isEnd = Boolean(draftEndDate) && cell.dateKey === draftEndDate
 const isInRange =
 Boolean(draftStartDate && draftEndDate) &&
 cell.dateKey > draftStartDate &&
 cell.dateKey < draftEndDate

 return (
 <button
 key={cell.key}
 type="button"
 onClick={() => handleCalendarDaySelect(cell.dateKey as string)}
 className={cn(
 "h-9 rounded-lg text-[0.75rem] font-semibold transition",
 isStart || isEnd
 ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
 : isInRange
 ? "bg-[var(--text)]/12 text-[var(--text)]"
 : "text-[var(--text)] hover:bg-[var(--text)]/8"
 )}
 >
 {cell.dayLabel}
 </button>
 )
 })}
 </div>
 </div>

 <p className="mt-3 text-[0.6875rem] font-medium text-[var(--muted)]">
 {draftStartDate || draftEndDate
 ? `${draftStartDate || "—"} ${lang === "EN" ? "to" : "hingga"} ${draftEndDate || "—"}`
 : lang === "EN"
 ? "Tap start date, then end date."
 : "Tekan tarikh mula, kemudian tarikh akhir."}
 </p>

 <div className="mt-4 grid grid-cols-2 gap-2">
 <button
 type="button"
 onClick={clearDateFilter}
 className="h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs font-semibold text-[var(--muted)]"
 >
 {lang === "EN" ? "Clear" : "Kosongkan"}
 </button>
 <button
 type="button"
 onClick={applyDateFilter}
 className="h-10 rounded-xl bg-[var(--text)] text-xs font-bold text-[var(--bg)]"
 >
 {lang === "EN" ? "Apply" : "Guna"}
 </button>
 </div>
 </div>
 </div>
 )}
 

  {/* Desktop Summary — unified strip (matches mobile, uses global card radius) */}
  {!showGraphMode && (
  <div className="mx-auto hidden w-full max-w-[1280px] px-4 md:block">
  <div className="modern-card overflow-hidden !shadow-[var(--shadow-soft)]">
  <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
  <div className="px-5 py-4">
  <div className="flex items-center gap-1.5">
  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
  <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--muted)]">{langT.income}</p>
  </div>
  <p className={cn("mt-2 text-xl font-black tracking-tight tabular-nums", isLight ? "text-emerald-600" : "text-emerald-400")}>
  {showDataSkeleton ? <AmountSkeleton className="h-6 w-32" /> : <>RM {formatCurrencyAmount(displayIncome)}</>}
  </p>
  </div>
  <div className="px-5 py-4">
  <div className="flex items-center gap-1.5">
  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
  <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--muted)]">{langT.expense}</p>
  </div>
  <p className={cn("mt-2 text-xl font-black tracking-tight tabular-nums", isLight ? "text-rose-600" : "text-rose-400")}>
  {showDataSkeleton ? <AmountSkeleton className="h-6 w-32" /> : <>RM {formatCurrencyAmount(displayExpense)}</>}
  </p>
  </div>
  <div className="px-5 py-4">
  <div className="flex items-center gap-1.5">
  <span className="h-1.5 w-1.5 rounded-full bg-[var(--btn-primary-bg)]" />
  <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--muted)]">
  {lang === "EN" ? "Current Balance" : "Baki Semasa"}
  </p>
  </div>
  <p className="mt-2 text-xl font-black tracking-tight tabular-nums text-[var(--text)]">
  {showDataSkeleton ? <AmountSkeleton className="h-6 w-32" /> : <>RM {formatCurrencyAmount(statsSnapshot.balance)}</>}
  </p>
  <p className={cn(
  "mt-1.5 text-[0.68rem] font-bold tabular-nums",
  filteredNetFlow >= 0
  ? (isLight ? "text-emerald-600" : "text-emerald-400")
  : (isLight ? "text-rose-600" : "text-rose-400")
  )}>
  {lang === "EN" ? "Net " : "Bersih "}
  {showDataSkeleton ? (
  <AmountSkeleton className="inline-block h-3 w-20" />
  ) : (
  <>{filteredNetFlow >= 0 ? "+" : "−"}RM {formatCurrencyAmount(Math.abs(filteredNetFlow))}</>
  )}
  </p>
  </div>
  </div>
  </div>
  </div>
  )}

  {/* Mobile Summary — compact 3-up strip (radius via global --card-radius-lg) */}
  {!showGraphMode && (
  <div className="md:hidden">
  <div className="modern-card overflow-hidden !shadow-[var(--shadow-soft)]">
  <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
  <div className="px-2.5 py-3 text-center">
  <p className="text-[0.55rem] font-bold uppercase tracking-wider text-emerald-400/90">
  {langT.income}
  </p>
  <p className={cn("mt-1.5 text-[0.8rem] font-black tabular-nums leading-none", isLight ? "text-emerald-600" : "text-emerald-400")}>
  {showDataSkeleton ? <AmountSkeleton className="mx-auto h-3.5 w-14" /> : <>{formatCurrencyAmount(displayIncome)}</>}
  </p>
  </div>
  <div className="px-2.5 py-3 text-center">
  <p className="text-[0.55rem] font-bold uppercase tracking-wider text-rose-400/90">
  {langT.expense}
  </p>
  <p className={cn("mt-1.5 text-[0.8rem] font-black tabular-nums leading-none", isLight ? "text-rose-600" : "text-rose-400")}>
  {showDataSkeleton ? <AmountSkeleton className="mx-auto h-3.5 w-14" /> : <>{formatCurrencyAmount(displayExpense)}</>}
  </p>
  </div>
  <div className="px-2.5 py-3 text-center">
  <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
  {lang === "EN" ? "Balance" : "Baki"}
  </p>
  <p className="mt-1.5 text-[0.8rem] font-black tabular-nums leading-none text-[var(--text)]">
  {showDataSkeleton ? <AmountSkeleton className="mx-auto h-3.5 w-14" /> : <>{formatCurrencyAmount(statsSnapshot.balance)}</>}
  </p>
  </div>
  </div>
  <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2">
  <span className="text-[0.6rem] font-semibold text-[var(--muted)]">
  {lang === "EN" ? "Filtered net" : "Bersih tapisan"}
  </span>
  <span className={cn(
  "text-[0.7rem] font-bold tabular-nums",
  filteredNetFlow >= 0
  ? (isLight ? "text-emerald-600" : "text-emerald-400")
  : (isLight ? "text-rose-600" : "text-rose-400")
  )}>
  {showDataSkeleton ? (
  <AmountSkeleton className="h-3 w-16" />
  ) : (
  <>{filteredNetFlow >= 0 ? "+" : "−"}RM {formatCurrencyAmount(Math.abs(filteredNetFlow))}</>
  )}
  </span>
  </div>
  </div>
  </div>
  )}

 <div className="space-y-6">
 {activeTab === 'breakdown' ? (
 /* Pecahan Perbelanjaan Tab */
 <section className="space-y-4">
 <div className="bg-[var(--card)] rounded-xl md:rounded-2xl p-5 md:p-6">
 <div
 ref={dailyChartScrollRef}
 onScroll={handleDailyChartScroll}
 className={cn("h-64 md:h-72 w-full overflow-y-hidden", isMobileViewport ? "overflow-x-auto" : "overflow-x-hidden")}
 >
 <div style={{ width: isMobileViewport ? `${mobileDailyChartWidth}px` : "100%", height: "100%" }}>
 <Bar
 key={`daily-${dailyMonthKey}-${dailySeries.length}-${transactions.length}`}
 redraw
 data={dailyExpenseData}
 plugins={[customDataLabelPlugin]}
 options={{
 maintainAspectRatio: false,
 responsive: true,
 animation: { duration: 500 },
 layout: {
 padding: {
 top: 35,
 left: 10,
 right: 10,
 bottom: 0,
 }
 },
 plugins: {
 legend: { display: false },
 tooltip: {
 enabled: false,
 },
 customDataLabel: {
 activeIndex: resolvedDailyBarIndex
 }
 } as DailyChartPlugins,
 onClick: (event: ChartEvent, _elements, chart) => {
 if (!event.native) return
 const points = chart.getElementsAtEventForMode(
 event.native,
 'index',
 { intersect: false, axis: 'x' },
 true
 )
 if (!points.length) return
 setActiveDailyBarIndex(points[0].index)
 },
 interaction: {
 intersect: false,
 mode: 'index',
 axis: 'x',
 },
 scales: {
 x: {
 grid: { display: false },
 ticks: {
 color: "#6b7194",
 font: { size: 11, weight: "bold" as const },
 autoSkip: false,
 maxRotation: 0,
 minRotation: 0,
 },
 border: { display: false },
 },
 y: {
 beginAtZero: true,
 grid: { display: false },
 border: { display: false },
 ticks: { display: false },
 },
 },
 }}
 />
 </div>
 </div>
 </div>

 <div className="bg-[var(--card)] rounded-xl md:rounded-2xl p-5 md:p-6">
 {doughnutData.labels.length > 0 ? (
 <div className="flex flex-col gap-5">
 <div className="relative mx-auto flex h-[220px] w-full max-w-[320px] items-center justify-center md:h-[250px]">
 <Doughnut
 data={{
 ...doughnutData,
 datasets: doughnutData.datasets.map((dataset) => ({
 ...dataset,
 borderWidth: 8,
 borderRadius: 16,
 spacing: 6,
 borderColor: isLight ? "#ffffff" : "var(--card)",
 hoverOffset: 2,
 })),
 }}
 options={{
 maintainAspectRatio: false,
 responsive: true,
 cutout: '62%',
 rotation: -90,
 plugins: { 
 legend: { display: false }, 
 tooltip: { 
 backgroundColor: isLight ? '#ffffff' : 'var(--card3)',
 titleColor: isLight ? '#0f172a' : '#f0f2fa',
 bodyColor: isLight ? '#475467' : '#d7dcfb',
 borderColor: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)',
 borderWidth: 1,
 padding: 10,
 cornerRadius: 8,
 titleFont: { size: 12, weight: 'bold' },
 bodyFont: { size: 12 }
 } 
 },
 animation: { animateRotate: true, duration: 1000 }
 }}
 />
 <div className="pointer-events-none absolute flex flex-col items-center text-center">
 <span className="text-sm font-medium text-[#8b92a6]">{langT.expense}</span>
 <span className="mt-1 text-3xl font-black tracking-tight text-[var(--text)] md:text-4xl">
 {showDataSkeleton ? <AmountSkeleton className="h-8 w-32" /> : <>RM {formatCurrencyAmount(totalExpense)}</>}
 </span>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[color:var(--border)] pt-5">
 {doughnutData.labels.map((label, i) => {
 const value = Number(doughnutData.datasets[0].data[i] || 0)
 const pct = totalExpense > 0 ? (value / totalExpense) * 100 : 0
 const color = (doughnutData.datasets[0].backgroundColor as string[])[i]
 return (
 <div key={label} className="flex items-center justify-between gap-3">
 <div className="flex min-w-0 items-center">
 <div className="mr-2 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
 <span className="truncate text-sm font-semibold text-[var(--text-soft)]">{label}</span>
 </div>
 <span className="text-xs font-bold text-[#8b92a6] tabular-nums">{pct.toFixed(0)}%</span>
 </div>
 )
 })}
 </div>
 </div>
 ) : (
 <div className="py-20 flex flex-col items-center justify-center opacity-40 text-center">
 <Wallet size={32} className="mb-3 text-[var(--muted)]" />
 <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
 {langT.noArchivedData}
 </p>
 </div>
 )}
 </div>
 </section>
 ) : (
 <>
 {showGraphMode && (
 <section className="mx-auto w-full max-w-[1280px] space-y-4">
 <div className="rounded-xl bg-[var(--card)] p-5 md:rounded-2xl md:p-6">
 <div className="h-[240px] w-full md:h-[260px]">
 {sixMonthGraphData ? (
 <Bar
 data={sixMonthGraphData}
 plugins={[monthlyBarValuePlugin]}
 options={{
 maintainAspectRatio: false,
 responsive: true,
 animation: { duration: 500 },
 layout: { padding: { top: 24, right: 4, bottom: 0, left: 4 } },
 plugins: {
 legend: {
 display: true,
 position: "bottom",
 labels: {
 color: isLight ? "#475467" : "#d7dcfb",
 boxWidth: 8,
 boxHeight: 8,
 usePointStyle: true,
 pointStyle: "circle",
 padding: 14,
 font: { size: 10, weight: "bold" as const },
 },
 },
 tooltip: {
 backgroundColor: isLight ? "#ffffff" : "#181a24",
 titleColor: isLight ? "#0f172a" : "#f8fafc",
 bodyColor: isLight ? "#475467" : "#d7dcfb",
 borderColor: isLight ? "rgba(15, 23, 42, 0.08)" : "rgba(255,255,255,0.08)",
 borderWidth: 1,
 displayColors: false,
 callbacks: {
 label: (context) => `${context.dataset.label}: RM ${formatCurrencyAmount(Number(context.raw || 0))}`,
 },
 },
 },
 scales: {
 x: {
 grid: { display: false },
 ticks: { color: isLight ? "#667085" : "#8b92a6", font: { size: 10, weight: "bold" as const } },
 border: { display: false },
 },
 y: {
 beginAtZero: true,
 grid: {
 display: true,
 color: isLight ? "rgba(15, 23, 42, 0.055)" : "rgba(255,255,255,0.055)",
 drawTicks: false,
 },
 border: { display: false },
 ticks: { display: false },
 },
 },
 }}
 />
 ) : (
 <div className="flex h-full items-center justify-center text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
 {lang === "EN" ? "No graph data" : "Tiada data graf"}
 </div>
 )}
 </div>
 </div>
 </section>
 )}
 <section className="max-w-full overflow-x-hidden space-y-4">
 <div className="max-w-full overflow-x-hidden space-y-2">
 {error && (
 <div className="py-4 px-6 bg-red-400/5 border border-red-400/10 rounded-xl text-red-400 text-[0.6875rem] font-bold text-center">
 {langT.errorLabel}: {error}
 </div>
 )}

 {filteredTxns.length === 0 && !loading ? (
 <div className="py-12 text-center text-[var(--muted)] text-[0.6875rem] font-bold bg-[var(--card)] rounded-xl border-dashed">
 {transactions.length > 0 
 ? `${langT.noMatchingRecords} (${langT.totalRecords}: ${transactions.length})`
 : langT.noTransactions + "."
 }
 <button 
 onClick={() => {
 setSearchQuery("");
 setSelectedMonth("");
 setSelectedType("all");
 setSelectedCategory("all");
 setSelectedWallet("all");
 setStartDate("");
 setEndDate("");
 }} 
 className="block mx-auto mt-2 text-[var(--text)] hover:underline"
 >
 {langT.clearFilters}
 </button>
 </div>
 ) : (
 <>
  <div className="hidden overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--card)] md:block">
  <div className="grid grid-cols-[2.1fr_1fr_1.45fr_1.05fr] border-b border-[color:var(--border)] bg-[var(--surface-tint)] px-5 py-3 text-[0.625rem] font-semibold text-[var(--muted)] uppercase tracking-wider">
 <div>{lang === "EN" ? "Description" : "Keterangan"}</div>
 <div>{lang === "EN" ? "Transaction ID" : "ID Transaksi"}</div>
 <div>{lang === "EN" ? "Categories" : "Kategori"}</div>
 <div className="flex items-center justify-end gap-1">
 {lang === "EN" ? "Amount" : "Jumlah"}
 <ArrowDown size={12} />
 </div>
 </div>

 {groupedPaginatedTxns.map(({ date, groupTxns, expenseTotal, incomeTotal, transferTotal }) => {
 const hasRealDate = date !== langT.noDate
 const showIncomeRow = incomeTotal > 0
 const showTransferRow = transferTotal > 0
 const dateObj = hasRealDate ? new Date(`${date}T12:00:00`) : null
 const dayNumber = dateObj
 ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { day: "numeric" })
 : "--"
 const weekdayLabel = dateObj
 ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { weekday: "long" })
 : date
 const monthYearLabel = dateObj
 ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", {
 month: "long",
 year: "numeric",
 })
 : ""

 return (
 <React.Fragment key={date}>
  <div className="grid grid-cols-2 items-center border-b border-[color:var(--border)] px-5 py-2.5 bg-[var(--surface-tint)]">
  <div className="flex items-center gap-3">
  <span className="text-lg font-bold leading-none text-[var(--text)] tabular-nums">
  {dayNumber}
  </span>
  <div>
  <p className="text-[10px] font-bold text-[var(--text)] uppercase tracking-tight">{weekdayLabel}</p>
  <p className="text-[8px] font-bold text-[var(--muted)] uppercase tracking-widest">{monthYearLabel}</p>
  </div>
  </div>

 <div className="flex items-center justify-end gap-4 text-xs font-bold tabular-nums text-right">
  <span className={expenseTotal > 0 ? (isLight ? "text-rose-600" : "text-rose-300") : "text-[var(--muted)]"}>
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : <>-RM {formatCurrencyAmount(expenseTotal)}</>}
 </span>
 {showIncomeRow && (
 <span className={isLight ? "text-emerald-600" : "text-emerald-300"}>
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : <>+RM {formatCurrencyAmount(incomeTotal)}</>}
 </span>
 )}
 {showTransferRow && (
 <span className={isLight ? TRANSFER_LIGHT_TEXT : TRANSFER_DARK_TEXT}>
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : <>{getTransferSummaryLabel(transferTotal)}</>}
 </span>
 )}
 </div>
 </div>

 {groupTxns.map((tx) => {
 const rowTone = isTransferTransaction(tx)
 ? (isLight ? TRANSFER_LIGHT_TEXT : TRANSFER_DARK_TEXT)
 : tx.type === "income"
 ? (isLight ? "text-emerald-600" : "text-emerald-300")
 : (isLight ? "text-rose-600" : "text-rose-300")
 const categoryPillClass = isTransferTransaction(tx)
 ? isLight ? "bg-amber-100 text-amber-700" : "bg-amber-400/15 text-amber-200"
 : tx.type === "income"
 ? isLight ? "bg-emerald-100 text-emerald-700" : "bg-emerald-400/15 text-emerald-200"
 : isLight ? "bg-rose-100 text-rose-700" : "bg-rose-400/15 text-rose-200"
 const formattedDateTime = (() => {
 try {
 const rawDate = tx.created_at || tx.txn_date
 if (!rawDate) return ""
 const dateStr = rawDate.includes("Z") || rawDate.includes("+") ? rawDate : (rawDate.includes("T") || rawDate.includes(" ") ? `${rawDate.replace(" ", "T")}Z` : `${rawDate}T00:00:00Z`)
 const dateObj = new Date(dateStr)
 return dateObj.toLocaleString(lang === "EN" ? "en-MY" : "ms-MY", {
 day: "2-digit",
 month: "short",
 hour: "2-digit",
 minute: "2-digit",
 hour12: timeFormat === "12h",
 timeZone: timezone,
 })
 } catch {
 return ""
 }
 })()

 return (
 <button
 key={`${date}-${tx.id}`}
 type="button"
 onClick={() => router.push(`/${sessionId}/transactions/${tx.reference_id || tx.id}`)}
 className="grid w-full grid-cols-[2.1fr_1fr_1.45fr_1.05fr] items-center border-b border-[color:var(--border)] px-5 py-4 text-left transition hover:bg-[var(--surface-tint)] active:opacity-80 last:border-b-0"
 >
 <div className="flex min-w-0 items-center gap-2.5">
 <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center", rowTone)}>
 {tx.category_name || tx.category_icon_name ? (
 <CategoryIconGlyph
 iconName={tx.category_icon_name}
 categoryName={tx.category_name}
 kind={tx.type}
 size={18}
 brandScale={1}
 brandFramed={false}
 brandFill
 />
 ) : tx.type === "income" ? (
 <Banknote size={16} />
 ) : (
 <Receipt size={16} />
 )}
 </div>
 <div className="min-w-0">
 <p className="truncate text-xs font-semibold text-[var(--text)]">
 {splitWalletTaggedDescription(tx.vendor_or_source || "", tx.wallet_name).title || tx.vendor_or_source || langT.noDescription}
 </p>
 <p className="mt-0.5 truncate text-[0.625rem] text-[var(--muted)]">{formattedDateTime}</p>
 </div>
 </div>

 <div className="truncate text-xs font-medium text-[var(--text)]">
 {tx.reference_id ? `#${tx.reference_id}` : `#${tx.id}`}
 </div>

 <div className="flex min-w-0 items-center gap-2">
 <span className={cn("max-w-full truncate rounded-md px-2 py-0.5 text-[0.625rem] font-semibold", categoryPillClass)}>
 {getTransactionCategoryLabel(tx, langT.uncategorized)}
 </span>
 </div>

 <div className={cn("text-right text-xs font-bold tabular-nums", rowTone)}>
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : getTransactionAmountLabel(tx)}
 <p className="mt-0.5 truncate text-[0.625rem] font-medium text-[var(--muted)]">
 {tx.wallet_name || "Wallet"}
 </p>
 </div>
 </button>
 )
 })}
 </React.Fragment>
 )
 })}
 </div>

 <div className="max-w-full overflow-x-hidden space-y-5 md:hidden">
 {groupedFilteredTxns.map(({ date, groupTxns, expenseTotal, incomeTotal, transferTotal }) => {
 const hasRealDate = date !== langT.noDate
 const showIncomeRow = incomeTotal > 0
 const showTransferRow = transferTotal > 0
 const dateObj = hasRealDate ? new Date(`${date}T12:00:00`) : null
 const dayNumber = dateObj
 ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { day: "numeric" })
 : "--"
 const weekdayLabel = dateObj
 ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", { weekday: "long" })
 : date
 const monthYearLabel = dateObj
 ? dateObj.toLocaleDateString(lang === "EN" ? "en-MY" : "ms-MY", {
 month: "long",
 year: "numeric",
 })
 : ""

 return (
 <div key={date} className="space-y-3">
 <div
   className="w-full max-w-full overflow-hidden rounded-2xl border md:rounded-[16px]"
 style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
 >
  <div
  className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 backdrop-blur-md"
  style={{
  borderBottom: "1px solid var(--border)",
  backgroundColor: "var(--surface-tint)"
  }}
  >
  <div className="flex min-w-0 flex-1 items-center gap-3">
  <div className="text-[1.8rem] font-black leading-none text-[var(--text)] tabular-nums">
  {dayNumber}
  </div>
  <div className="min-w-0">
  <p className="truncate text-[0.82rem] font-bold text-[var(--text)] uppercase tracking-tight">
  {weekdayLabel}
  </p>
  <p className="mt-0.5 text-[0.7rem] font-bold text-[var(--muted)] uppercase tracking-widest">{monthYearLabel}</p>
  </div>
  </div>

 <div className="grid shrink-0 grid-cols-1 gap-0.5 pl-2 text-right">
 <div
   className={cn(
 "text-[0.82rem] font-medium tabular-nums",
  expenseTotal > 0 ? (isLight ? "text-rose-500" : "text-rose-400/80") : "text-[var(--muted)]",
 )}
 >
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : <>-RM {formatCurrencyAmount(expenseTotal)}</>}
 </div>
 {showIncomeRow && (
 <div className={cn(
 "text-[0.82rem] font-medium tabular-nums",
 isLight ? "text-emerald-500" : "text-emerald-400/80"
 )}>
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : <>+RM {formatCurrencyAmount(incomeTotal)}</>}
 </div>
 )}
 {showTransferRow && (
 <div className={cn(
 "text-[0.82rem] font-medium tabular-nums",
 isLight ? TRANSFER_LIGHT_TEXT : TRANSFER_DARK_TEXT,
 )}>
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : <>{getTransferSummaryLabel(transferTotal)}</>}
 </div>
 )}
 </div>
 </div>

 <div className="divide-y divide-[var(--border)]">
 {groupTxns.map((tx) => (
 <button
 key={tx.id}
 type="button"
 onClick={() => router.push(`/${sessionId}/transactions/${tx.reference_id || tx.id}`)}
 className="flex w-full items-start gap-2.5 px-4 py-4 text-left transition active:opacity-80"
 >
 <div
   className={cn(
 "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center transition-transform active:scale-95",
 isTransferTransaction(tx)
 ? (isLight ? TRANSFER_LIGHT_TEXT : TRANSFER_DARK_TEXT)
 : tx.type === "income"
 ? (isLight ? "text-emerald-500" : "text-emerald-400/80")
 : (isLight ? "text-rose-500" : "text-rose-400/80"),
 )}
 >
 {tx.category_name || tx.category_icon_name ? (
 <CategoryIconGlyph
 iconName={tx.category_icon_name}
 categoryName={tx.category_name}
 kind={tx.type}
 size={22}
 brandScale={1}
 brandFramed={false}
 brandFill
 />
 ) : tx.type === "income" ? (
 <Banknote size={19} />
 ) : (
 <Receipt size={19} />
 )}
 </div>

 <div className="min-w-0 flex-1">
 <p className="truncate text-[0.86rem] font-bold text-[var(--text)]">
 {getTransactionCategoryLabel(tx, langT.uncategorized)}
 </p>
 <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
 {splitWalletTaggedDescription(tx.vendor_or_source || "", tx.wallet_name).title || tx.vendor_or_source || langT.noDescription}
 </p>
 <div className="mt-1">
 <span className={cn("text-[0.5625rem] font-medium", isLight ? "text-slate-500" : "text-[var(--muted)]/60")}>
 {(() => {
 try {
 const rawDate = tx.created_at || tx.txn_date;
 if (!rawDate) return ""
 const dateStr = rawDate.includes('Z') || rawDate.includes('+') ? rawDate : (rawDate.includes('T') || rawDate.includes(' ') ? `${rawDate.replace(' ', 'T')}Z` : `${rawDate}T00:00:00Z`);
 const dateObj = new Date(dateStr);
 return dateObj.toLocaleTimeString(lang === 'EN' ? 'en-MY' : 'ms-MY', {
 hour: '2-digit',
 minute: '2-digit',
 hour12: timeFormat === '12h',
 timeZone: timezone
 });
 } catch { return "" }
 })()}
 </span>
 </div>
 </div>

 <div
   className={cn(
 "shrink-0 text-right text-[0.86rem] font-medium tabular-nums",
 isTransferTransaction(tx)
 ? (isLight ? TRANSFER_LIGHT_TEXT : TRANSFER_DARK_TEXT)
 : tx.type === "income"
 ? (isLight ? "text-emerald-500" : "text-emerald-400/80")
 : (isLight ? "text-rose-500" : "text-rose-400/80"),
 )}
 >
 {showDataSkeleton ? <AmountSkeleton className="h-3 w-20" /> : getTransactionAmountLabel(tx)}
 </div>
 </button>
 ))}
 </div>
 </div>
 </div>
 )
 })}
 </div>

 <div className="flex flex-col items-center gap-2 py-2 md:hidden">
 {mobileVisibleCount < filteredTxns.length ? (
 <>
 <div ref={mobileLoadMoreRef} className="h-4 w-full" />
 <p className="text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
 {lang === "EN" ? "Loading more" : "Memuat lagi"}
 </p>
 </>
 ) : filteredTxns.length > 0 ? (
 <p className="text-[0.625rem] font-semibold uppercase tracking-[0.26em] text-[var(--muted)]">END</p>
 ) : null}
 </div>

 {/* Pagination Controls */}
 {totalPages > 1 && (
 <div className="hidden items-center justify-between pt-4 md:flex">
 <button 
 disabled={currentPage === 1} 
 onClick={() => setCurrentPage(p => p - 1)}
 className="px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[0.6875rem] font-semibold text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-tint)] transition"
 >
 {langT.previous}
 </button>
 <span className="text-[0.625rem] font-semibold text-[var(--muted)] tabular-nums">
 {currentPage} / {totalPages}
 </span>
 <button 
 disabled={currentPage === totalPages} 
 onClick={() => setCurrentPage(p => p + 1)}
 className="px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[0.6875rem] font-semibold text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-tint)] transition"
 >
 {langT.next}
 </button>
 </div>
 )}

 {/* Download Section — At the bottom of transactions */}
 <div className="hidden pt-8 border-t border-[color:var(--border)] md:block">
 <div className="portal-download-card rounded-2xl border p-6 text-center">
 <div className="portal-download-card__icon mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
 <Download size={24} />
 </div>
 <h4 className="portal-download-card__title mb-2 text-lg">{langT.download}</h4>
 <p className="portal-download-card__desc mx-auto mb-6 max-w-xs text-sm font-medium leading-relaxed">
 {langT.downloadDesc}
 </p>
 <button 
 onClick={handleExport}
 disabled={filteredTxns.length === 0 || loading}
 className="portal-download-card__button w-full rounded-xl px-5 py-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-12"
 >
 {langT.download} .XLS ({filteredTxns.length})
 </button>
 </div>
 </div>
 </>
 )}
 </div>
 </section>
 </>
 )}
 </div>
 </DesktopPageBody>
 {alertModal}
 </div>
 )
}

function FilterSelect({
 value,
 onChange,
 options,
 ariaLabel,
 isMobile,
 alignMenu = "left",
}: {
 value: string
 onChange: (value: string) => void
 options: Array<{ value: string; label: string; disabled?: boolean }>
 ariaLabel: string
 isMobile: boolean
 alignMenu?: "left" | "right"
}) {
 const [isOpen, setIsOpen] = useState(false)
 const menuRef = useRef<HTMLDivElement>(null)

 useEffect(() => {
 const handleOutsideClick = (e: MouseEvent) => {
 if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
 setIsOpen(false)
 }
 }
 if (isOpen) {
 document.addEventListener("mousedown", handleOutsideClick)
 return () => document.removeEventListener("mousedown", handleOutsideClick)
 }
 }, [isOpen])

 const selectedLabel = options.find(o => o.value === value)?.label || options[0]?.label || ""

 return (
 <div className="relative min-w-0" ref={menuRef}>
 <button
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 aria-label={ariaLabel}
 className={cn(
 "flex h-9 w-full items-center justify-between gap-2 appearance-none rounded-lg border border-[var(--border)] bg-[var(--card2)] pl-3 pr-2 font-semibold leading-none text-[var(--text-soft)] outline-none transition-colors hover:bg-[var(--surface-tint)]",
 isOpen && "border-[var(--text)]/20 text-[var(--text)]"
 )}
 style={{ fontSize: isMobile ? "12px" : "13px" }}
 >
 <span className="truncate">{selectedLabel}</span>
 <ChevronDown
 size={14}
 className={cn("shrink-0 text-[var(--muted)] transition-transform duration-200", isOpen && "rotate-180")}
 />
 </button>

 
 {isOpen && (
 <div
   className={cn(
 "absolute top-full z-[200] mt-1 max-h-[300px] w-auto min-w-[120px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl custom-scrollbar",
 alignMenu === "right" ? "right-0" : "left-0"
 )}
 style={{ fontSize: isMobile ? "12px" : "13px" }}
 data-prevent-pull-refresh="true"
 >
 {options.map((option) => {
 const isSelected = option.value === value
 if (option.disabled) {
 return (
 <div key={`${ariaLabel}-${option.value}`} className="px-3 pb-1 pt-2 text-[0.5625rem] font-black uppercase tracking-[0.18em] text-[var(--muted)] opacity-60">
 {option.label}
 </div>
 )
 }
 return (
 <button
 key={`${ariaLabel}-${option.value || "default"}`}
 type="button"
 onClick={() => {
 onChange(option.value)
 setIsOpen(false)
 }}
 className={cn(
 "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left font-medium transition-colors hover:bg-[var(--surface-tint)]",
 isSelected ? "bg-[var(--surface-tint)] text-[var(--text)]" : "text-[var(--text-soft)]"
 )}
 >
 <span className="truncate">{option.label}</span>
 {isSelected && <Check size={14} className="shrink-0 text-[var(--text)]" />}
 </button>
 )
 })}
 </div>
 )}
 
 </div>
 )
}
