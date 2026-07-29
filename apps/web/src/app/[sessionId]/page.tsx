"use client"

import { getAccessToken } from "@/lib/auth-session"
import { createPortal } from "react-dom"
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import {
  TrendingDown,
  TrendingUp,
  X,
  Check,
  Loader2,
  BarChart2,
  Wallet,
  CreditCard,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeClosed,
  Plus,
  PieChart,
  LayoutGrid,
  MapPinned,
  MessageCircle,
  Receipt,
  Award,
  MinusCircle,
  HeartHandshake
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { cn, getTodayDateInTimeZone } from "@/lib/utils"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { getPwaThemeColor } from "@/lib/theme"
import { usePageAlert } from "@/hooks/usePageAlert"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { splitWalletTaggedDescription } from "@/lib/transaction-display"
import { fetchApiJson, readApiCache } from "@/lib/api-cache"
import { categoryCycleMonthBounds, cycleMonthBounds } from "@/lib/cycle"
import BadgeOverviewModal from "@/components/badges/BadgeOverviewModal"
import { APP_BADGES, deriveEarnedBadgeKeys, type BadgeBudgetItemLike, type BadgeTransactionLike } from "@/lib/badges"
import { formatCurrencyLabel } from "@/components/ui/MoneyAmount"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { MonthlyChecklistSection } from "@/components/dashboard/MonthlyChecklistSection"
import { VehicleOverdueWidget } from "@/components/dashboard/VehicleOverdueWidget"
import { DashboardVehicleHeroRow } from "@/components/dashboard/DashboardVehicleHeroRow"
import { CatPlayground } from "@/components/dashboard/CatPlayground"
import { WeatherClockMini } from "@/components/layout/SidebarWeatherClock"
import { ChartContainer } from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title, 
  Tooltip, 
  Legend, 
  ArcElement,
  type ActiveElement,
  type ChartEvent,
  type ChartOptions
} from 'chart.js'
import { Doughnut, Bar, Line } from 'react-chartjs-2'

const customDataLabelPlugin = {
  id: 'customDataLabel',
  afterDatasetsDraw(chart: ChartJS) {
    const { ctx, data } = chart
    const activeIndex = (
      chart.options.plugins as (ChartOptions["plugins"] & {
        customDataLabel?: { activeIndex?: number | null }
      }) | undefined
    )?.customDataLabel?.activeIndex
    
    if (activeIndex !== null && activeIndex !== undefined) {
      const meta = chart.getDatasetMeta(0)
      const bar = meta.data[activeIndex]
      const value = data.datasets[0].data[activeIndex]
      const numericValue = typeof value === "number" ? value : Number(value)
      
      if (bar && Number.isFinite(numericValue)) {
        ctx.save()
        
        const label = `RM ${numericValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        ctx.font = 'bold 10px "DM Sans", sans-serif'
        const textWidth = ctx.measureText(label).width
        const padding = 6
        const boxWidth = textWidth + padding * 2
        const boxHeight = 22
        
        const rootStyles = typeof document !== "undefined"
          ? getComputedStyle(document.documentElement)
          : null
        const labelTextColor = rootStyles?.getPropertyValue("--text").trim() || "#f5f7fb"
        const labelBgColor = rootStyles?.getPropertyValue("--card").trim() || "#242424"
        const labelBorderColor = rootStyles?.getPropertyValue("--border").trim() || "#383838"

        const x = bar.x - boxWidth / 2
        const y = bar.y - boxHeight - 8

        ctx.beginPath()
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, boxWidth, boxHeight, 999)
        } else {
          // Fallback for runtimes without CanvasRenderingContext2D.roundRect
          const radius = Math.min(boxHeight / 2, boxWidth / 2)
          ctx.moveTo(x + radius, y)
          ctx.lineTo(x + boxWidth - radius, y)
          ctx.arcTo(x + boxWidth, y, x + boxWidth, y + radius, radius)
          ctx.lineTo(x + boxWidth, y + boxHeight - radius)
          ctx.arcTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight, radius)
          ctx.lineTo(x + radius, y + boxHeight)
          ctx.arcTo(x, y + boxHeight, x, y + boxHeight - radius, radius)
          ctx.lineTo(x, y + radius)
          ctx.arcTo(x, y, x + radius, y, radius)
          ctx.closePath()
        }
        ctx.fillStyle = labelBgColor
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = labelBorderColor
        ctx.stroke()

        ctx.fillStyle = labelTextColor
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, bar.x, y + boxHeight / 2)
        ctx.restore()
      }
    }
  }
}

type CustomDataLabelPluginOptions = (
  NonNullable<ChartOptions<"bar">["plugins"]> &
  NonNullable<ChartOptions<"line">["plugins"]>
) & {
  customDataLabel: { activeIndex: number | null }
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  customDataLabelPlugin
)

type DashboardTransaction = {
  id: number
  reference_id?: string | null
  type: "income" | "expense"
  amount: number
  txn_date: string
  created_at?: string | null
  vendor_or_source: string
  wallet_name?: string | null
  category_name?: string | null
  category_icon_name?: string | null
  is_wallet_transfer?: boolean
  is_debt_movement?: boolean
  other?: string | null
  source_channel?: string | null
  attachment_count?: number | null
}

type DashboardCategory = {
  id: number
  name: string
  kind: "income" | "expense"
}

type DashboardWallet = {
  id: number
  name: string
  label?: string | null
  card_color?: string | null
  image_url?: string | null
  balance: number
  currency: string
  type?: "cash" | "bank" | "bank_digital" | "ewallet" | "credit_card" | "shared" | "personal" | string | null
  is_bot_default?: boolean | null
}

type DashboardStats = {
  balance: number
  income_month: number
  expense_month: number
  safe_balance: number
}

type DashboardUserProfile = {
  name?: string | null
  email?: string | null
  show_hero_amounts?: boolean | null
  cycle_start_day?: number | null
  cycle_mode?: "day" | "category" | string | null
}

type DashboardCycleInfo = {
  mode?: "day" | "category" | string | null
  month_key?: string | null
  salary_dates?: string[] | null
}

type DashboardBudgetItem = {
  id: number | null
  category_id: number
  category_name: string
  category_icon_name?: string | null
  month_key: string
  budget_amount: number
  used_amount: number
  remaining_amount: number
  progress_percent: number
  status: "normal" | "warning" | "over_budget" | string
}

type AddItemState = {
  name: string
  quantity: string
  unit_price: string
}

function createDefaultAddItems(): AddItemState[] {
  return [{ name: "", quantity: "1", unit_price: "0" }]
}

const MONTHLY_EXPENSE_MONTHS = 7
const DASHBOARD_DAILY_TIMEZONE = "Asia/Kuala_Lumpur"
const MOBILE_MONTHLY_BAR_WIDTH = 56
const MOBILE_DAILY_BAR_WIDTH = 44
const DESKTOP_DAILY_BAR_WIDTH = 42
const DAILY_EDGE_SPACER_DAYS = 4
const WALLET_CARD_ACCENTS = [
  { key: "indigo", color: "#4f46e5", from: "#6366f1", to: "#3730a3", text: "#f8fafc" },
  { key: "pink", color: "#db2777", from: "#ec4899", to: "#9d174d", text: "#fdf2f8" },
  { key: "amber", color: "#d97706", from: "#f59e0b", to: "#92400e", text: "#fff7ed" },
  { key: "emerald", color: "#059669", from: "#10b981", to: "#065f46", text: "#ecfdf5" },
  { key: "cyan", color: "#0891b2", from: "#06b6d4", to: "#155e75", text: "#ecfeff" },
  { key: "violet", color: "#7c3aed", from: "#8b5cf6", to: "#5b21b6", text: "#f5f3ff" },
]

function getDashboardWalletAccent(wallet: Pick<DashboardWallet, "id" | "card_color"> | null) {
  if (wallet?.card_color) {
    const selectedAccent = WALLET_CARD_ACCENTS.find((accent) => accent.key === wallet.card_color)
    if (selectedAccent) return selectedAccent
  }
  const fallbackIndex = Math.abs(wallet?.id ?? 0) % WALLET_CARD_ACCENTS.length
  return WALLET_CARD_ACCENTS[fallbackIndex]
}


type DashboardBadge = {
  key: string
  title: string
  titleEN: string
  desc: string
  descEN: string
  status: "unlocked" | "locked"
  tone: "blue" | "violet" | "amber" | "emerald" | "rose" | "cyan"
  icon: "verified" | "active" | "streak" | "budget" | "receipt" | "bot"
}

const DASHBOARD_BADGES: DashboardBadge[] = APP_BADGES.map((badge) => ({
  key: badge.key,
  title: badge.titleBM,
  titleEN: badge.titleEN,
  desc: badge.descBM,
  descEN: badge.descEN,
  status: badge.status,
  tone: badge.tone === "gold" ? "amber" : badge.tone,
  icon: badge.icon,
}))

const BADGE_TONE_STYLES: Record<DashboardBadge["tone"], { chip: string, panel: string, text: string }> = {
  blue: {
    chip: "bg-white/10 text-[#e5e5e5] border-white/15",
    panel: "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(13,13,13,0.96))]",
    text: "text-[#f5f5f5]",
  },
  violet: {
    chip: "bg-white/10 text-[#e5e5e5] border-white/15",
    panel: "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(13,13,13,0.96))]",
    text: "text-[#f5f5f5]",
  },
  amber: {
    chip: "bg-white/10 text-[#e5e5e5] border-white/15",
    panel: "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(13,13,13,0.96))]",
    text: "text-[#f5f5f5]",
  },
  emerald: {
    chip: "bg-white/10 text-[#e5e5e5] border-white/15",
    panel: "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(13,13,13,0.96))]",
    text: "text-[#f5f5f5]",
  },
  rose: {
    chip: "bg-white/10 text-[#e5e5e5] border-white/15",
    panel: "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(13,13,13,0.96))]",
    text: "text-[#f5f5f5]",
  },
  cyan: {
    chip: "bg-white/10 text-[#e5e5e5] border-white/15",
    panel: "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(13,13,13,0.96))]",
    text: "text-[#f5f5f5]",
  },
}

function renderMiniGemGlyph(icon: "verified" | "active" | "streak" | "budget" | "receipt" | "bot") {
  switch (icon) {
    case "verified":
      return <path d="M31 41 l6 6 l13 -15" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    case "active":
      return <path d="M40 24 l4.7 9.5 l10.5 1.5 l-7.6 7.3 l1.8 10.3 l-9.4 -5 l-9.4 5 l1.8 -10.3 l-7.6 -7.3 l10.5 -1.5 z" fill="white" />
    case "streak":
      return <path d="M42 24 C50 31 49 39 43 43 C49 43 53 50 48 57 C39 54 32 45 32 37 C32 31 36 27 42 24 Z" fill="white" />
    case "budget":
      return <path d="M25 31 h30 a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h-30 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4 Z M46 41 h8" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    case "receipt":
      return <path d="M31 24 h18 l6 6 v26 l-4 -2 l-4 2 l-4 -2 l-4 2 l-4 -2 l-4 2 Z M35 36 h14 M35 44 h10" fill="none" stroke="white" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    case "bot":
      return <path d="M32 34 a8 8 0 0 1 8 -8 h0 a8 8 0 0 1 8 8 v11 h-16 Z M36 45 h8 M35 30 l-3 -4 M45 30 l3 -4 M36 38 h.01 M44 38 h.01" fill="none" stroke="white" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
  }
}

function MiniVerifiedGemBadge({ outlined = false, icon = "verified" }: { outlined?: boolean, icon?: DashboardBadge["icon"] }) {
  return (
    <span className="relative inline-grid h-8 w-8 place-items-center overflow-visible">
      <style jsx>{`
        @keyframes miniGemFloat { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.05); } }
        @keyframes miniGemSpark { 0%, 100% { transform: scale(.72) rotate(0deg); opacity: .25; } 45% { transform: scale(1.18) rotate(16deg); opacity: 1; } }
        @keyframes miniGemShine { 0% { transform: translateX(-16px) translateY(5px) rotate(-24deg); opacity: 0; } 35% { opacity: .58; } 70%, 100% { transform: translateX(18px) translateY(-5px) rotate(-24deg); opacity: 0; } }
        .mini-gem-main { animation: miniGemFloat 2.7s ease-in-out infinite; transform-origin: center; }
        .mini-gem-spark-a { animation: miniGemSpark 1.8s ease-in-out infinite; transform-origin: center; }
        .mini-gem-spark-b { animation: miniGemSpark 2.1s ease-in-out infinite .25s; transform-origin: center; }
        .mini-gem-shine { animation: miniGemShine 2.8s ease-in-out infinite; transform-origin: center; }
      `}</style>
      <svg viewBox="0 0 80 80" className={cn("h-8 w-8", outlined ? "drop-shadow-[0_6px_10px_rgba(148,163,184,0.24)]" : "drop-shadow-[0_8px_12px_rgba(37,99,235,0.32)]")} aria-hidden="true">
        <defs><clipPath id="miniVerifiedGemClip"><path d="M40 8 L58 26 L52 55 L40 72 L28 55 L22 26 Z" /></clipPath></defs>
        {!outlined && <path className="mini-gem-spark-a" d="M14 25 l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fde68a" />}
        {!outlined && <path className="mini-gem-spark-b" d="M65 51 l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#67e8f9" />}
        <g className="mini-gem-main">
          {outlined ? (
            <>
              <path d="M40 8 L58 26 L52 55 L40 72 L28 55 L22 26 Z" fill="rgba(148,163,184,0.08)" stroke="rgba(191,219,254,0.9)" strokeWidth="4" />
              <path d="M40 8 L58 26 L40 35 L22 26 Z" fill="rgba(191,219,254,0.12)" />
              <path d="M22 26 L40 35 L28 55 Z" fill="rgba(125,211,252,0.12)" />
              <path d="M58 26 L40 35 L52 55 Z" fill="rgba(96,165,250,0.14)" />
              <path d="M28 55 L40 35 L52 55 L40 72 Z" fill="rgba(59,130,246,0.12)" />
            </>
          ) : (
            <>
              <path d="M40 8 L58 26 L52 55 L40 72 L28 55 L22 26 Z" fill="#091b3a" />
              <path d="M40 8 L58 26 L40 35 L22 26 Z" fill="#bfdbfe" />
              <path d="M22 26 L40 35 L28 55 Z" fill="#60a5fa" />
              <path d="M58 26 L40 35 L52 55 Z" fill="#2563eb" />
              <path d="M28 55 L40 35 L52 55 L40 72 Z" fill="#0f2a55" />
              <g clipPath="url(#miniVerifiedGemClip)"><rect className="mini-gem-shine" x="13" y="12" width="8" height="58" rx="4" fill="white" opacity="0.5" /></g>
              {renderMiniGemGlyph(icon)}
            </>
          )}
        </g>
      </svg>
    </span>
  )
}

export default function Dashboard() {
  const params = useParams()
  const { lang, timezone, timeFormat, t } = useLang()
  const { resolvedTheme } = useTheme()
  const sessionId = params.sessionId as string || ""
  const isLight = resolvedTheme === "light"

  const [showAddModal, setShowAddModal] = useState(false)
  const [showBadgeModal, setShowBadgeModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const showDataSkeleton = useDelayedSkeleton(loading)
  const [stats, setStats] = useState({ balance: 0, income_month: 0, expense_month: 0, safe_balance: 0 })
  const [cycleStartDay, setCycleStartDay] = useState(1)
  const [cycleMode, setCycleMode] = useState<"day" | "category">("day")
  const [salaryDates, setSalaryDates] = useState<string[]>([])
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([])
  const [categories, setCategories] = useState<DashboardCategory[]>([])
  const [wallets, setWallets] = useState<DashboardWallet[]>([])
  const [budgetItems, setBudgetItems] = useState<DashboardBudgetItem[]>([])
  const [userName, setUserName] = useState("User")
  const [supportOpen, setSupportOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    description: "", 
    amount: "", 
    category_id: "", 
    type: "expense", 
    date: getTodayDateInTimeZone(timezone)
  })
  const [addItems, setAddItems] = useState<AddItemState[]>(() => createDefaultAddItems())
  const [saving, setSaving] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)
  const [chartView, setChartView] = useState<"monthly" | "daily">("monthly")
  const [showChartModal, setShowChartModal] = useState(false)
  const [activeMonthlyBarIndex, setActiveMonthlyBarIndex] = useState<number | null>(null)
  const [activeDailyBarIndex, setActiveDailyBarIndex] = useState<number | null>(null)
  const [activeWalletIndex, setActiveWalletIndex] = useState(0)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [showHeroAmounts, setShowHeroAmounts] = useState(true)
  const [showMobileWalletDeck, setShowMobileWalletDeck] = useState(false)
  const [showAnalyticsMonthDropdown, setShowAnalyticsMonthDropdown] = useState(false)
  const [walletHovered, setWalletHovered] = useState(false)
  const walletAutoScrollRef = useRef<HTMLDivElement | null>(null)
  const walletScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { showAlert, alertModal } = usePageAlert(lang)
  const dashboardAddSheetSwipe = useSwipeDownToClose(() => setShowAddModal(false))
  const walletSheetSwipe = useSwipeDownToClose(() => setShowMobileWalletDeck(false))
  const walletDragStateRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    dragging: false,
  })
  const dailyChartScrollRef = useRef<HTMLDivElement | null>(null)
  const dailyScrollInitializedRef = useRef(false)
  const analyticalTransactions = transactions.filter((tx) => !tx.is_wallet_transfer && !tx.is_debt_movement)
  const currentYearInTimezone = Math.max(
    1970,
    Number(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        timeZone: timezone,
      }).format(new Date())
    )
  )
  const dashboardCurrentMonthKey = getTodayDateInTimeZone(timezone).slice(0, 7)
  const dashboardMonthOptions = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(currentYearInTimezone, index, 1)
    const key = `${currentYearInTimezone}-${String(index + 1).padStart(2, "0")}`
    return {
      key,
      label: monthDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", { month: "long" }),
      shortLabel: monthDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", { month: "short" }),
    }
  })
  const getPreviousDashboardMonthKey = (monthKey: string) => {
    const [yearText, monthText] = monthKey.split("-")
    const year = Number(yearText)
    const month = Number(monthText)
    if (!Number.isFinite(year) || !Number.isFinite(month)) return dashboardCurrentMonthKey
    const date = new Date(year, month - 2, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
  }
  const [selectedDashboardMonthKey, setSelectedDashboardMonthKey] = useState(dashboardCurrentMonthKey)
  const previousDashboardMonthKey = getPreviousDashboardMonthKey(selectedDashboardMonthKey)
  const txInCycleMonth = (tx: DashboardTransaction, monthKey: string) => {
    const dateKey = String(tx.txn_date).slice(0, 10)
    const bounds = cycleMode === "category"
      ? categoryCycleMonthBounds(salaryDates, monthKey)
      : cycleMonthBounds(monthKey, cycleStartDay)
    if (!bounds) return dateKey.startsWith(monthKey)
    const start = bounds.start instanceof Date ? bounds.start.toISOString().slice(0, 10) : bounds.start
    const end = bounds.end instanceof Date ? bounds.end.toISOString().slice(0, 10) : bounds.end
    return dateKey >= start && dateKey <= end
  }
  const currentMonthTransactions = transactions.filter((tx) => txInCycleMonth(tx, selectedDashboardMonthKey))
  const previousMonthTransactions = transactions.filter((tx) => txInCycleMonth(tx, previousDashboardMonthKey))
  const analyticalCurrentMonthTransactions = currentMonthTransactions.filter((tx) => !tx.is_wallet_transfer && !tx.is_debt_movement && tx.type === "expense")
  const analyticalPreviousMonthTransactions = previousMonthTransactions.filter((tx) => !tx.is_wallet_transfer && !tx.is_debt_movement && tx.type === "expense")
  const selectedDashboardMonthOption = dashboardMonthOptions.find((option) => option.key === selectedDashboardMonthKey) ?? dashboardMonthOptions[0]
  const previousDashboardMonthOption = dashboardMonthOptions.find((option) => option.key === previousDashboardMonthKey) ?? dashboardMonthOptions[0]
  const filteredIncomeMonth = currentMonthTransactions.filter((tx) => tx.type === "income" && !tx.is_wallet_transfer && !tx.is_debt_movement).reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
  const filteredExpenseMonth = currentMonthTransactions.filter((tx) => tx.type === "expense" && !tx.is_wallet_transfer && !tx.is_debt_movement).reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

  const persistHeroAmountPreference = async (nextValue: boolean) => {
    try {
      const token = getAccessToken()
      await fetch("/api/users/me", {
        credentials: "include",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ show_hero_amounts: nextValue }),
      })
    } catch (err) {
      console.error("Failed to persist show_hero_amounts:", err)
    }
  }

  const handleToggleHeroAmounts = () => {
    setShowHeroAmounts((prev) => {
      const nextValue = !prev
      void persistHeroAmountPreference(nextValue)
      return nextValue
    })
  }

  const fetchData = async () => {
    const applyUserProfile = (me: DashboardUserProfile | null) => {
      if (!me) return
      setUserName(me?.name || me?.email?.split("@")?.[0] || "User")
      if (typeof me?.show_hero_amounts === "boolean") {
        setShowHeroAmounts(me.show_hero_amounts)
      }
      if (typeof me?.cycle_start_day === "number") setCycleStartDay(Math.min(28, Math.max(1, me.cycle_start_day)))
      if (me?.cycle_mode === "category" || me?.cycle_mode === "day") setCycleMode(me.cycle_mode)
    }

    try {
      const token = getAccessToken()

      const currentMonthKey = getTodayDateInTimeZone(timezone).slice(0, 7)

      const urls = {
        stats: "/api/stats",
        transactions: "/api/transactions",
        categories: "/api/categories",
        user: "/api/users/me",
        cycle: "/api/cycles/me",
        wallets: "/api/wallets",
        budgets: `/api/budgets?month=${encodeURIComponent(currentMonthKey)}`,
      }

      let hydratedFromCache = false
      const cachedStats = readApiCache<DashboardStats>(urls.stats, token)
      const cachedTransactions = readApiCache<DashboardTransaction[]>(urls.transactions, token)
      const cachedCategories = readApiCache<DashboardCategory[]>(urls.categories, token)
      const cachedUser = readApiCache<DashboardUserProfile>(urls.user, token)
      const cachedWallets = readApiCache<DashboardWallet[]>(urls.wallets, token)
      const cachedBudgets = readApiCache<DashboardBudgetItem[]>(urls.budgets, token)

      if (cachedStats) { setStats(cachedStats); hydratedFromCache = true }
      if (cachedTransactions) { setTransactions(cachedTransactions); hydratedFromCache = true }
      if (cachedCategories) { setCategories(cachedCategories); hydratedFromCache = true }
      if (cachedUser) { applyUserProfile(cachedUser); hydratedFromCache = true }
      if (cachedWallets) { setWallets(cachedWallets); hydratedFromCache = true }
      if (cachedBudgets) { setBudgetItems(Array.isArray(cachedBudgets) ? cachedBudgets : []); hydratedFromCache = true }
      if (hydratedFromCache) setLoading(false)

      const [statsResult, txnsResult, catsResult, meResult, cycleResult, walletsResult, budgetsResult] = await Promise.allSettled([
        fetchApiJson<DashboardStats>(urls.stats, token),
        fetchApiJson<DashboardTransaction[]>(urls.transactions, token),
        fetchApiJson<DashboardCategory[]>(urls.categories, token),
        fetchApiJson<DashboardUserProfile>(urls.user, token),
        fetchApiJson<DashboardCycleInfo>(urls.cycle, token),
        fetchApiJson<DashboardWallet[]>(urls.wallets, token),
        fetchApiJson<DashboardBudgetItem[]>(urls.budgets, token),
      ])

      if (statsResult.status === "fulfilled") setStats(statsResult.value)
      if (txnsResult.status === "fulfilled") setTransactions(Array.isArray(txnsResult.value) ? txnsResult.value : [])
      if (catsResult.status === "fulfilled") setCategories(Array.isArray(catsResult.value) ? catsResult.value : [])
      if (walletsResult.status === "fulfilled") setWallets(Array.isArray(walletsResult.value) ? walletsResult.value : [])
      if (budgetsResult.status === "fulfilled") setBudgetItems(Array.isArray(budgetsResult.value) ? budgetsResult.value : [])
      if (meResult.status === "fulfilled") applyUserProfile(meResult.value)
      if (cycleResult.status === "fulfilled") {
        setCycleMode(cycleResult.value?.mode === "category" ? "category" : "day")
        setSalaryDates(Array.isArray(cycleResult.value?.salary_dates) ? cycleResult.value.salary_dates : [])
        if (cycleResult.value?.mode === "category" && cycleResult.value?.month_key) {
          setSelectedDashboardMonthKey(cycleResult.value.month_key)
        }
      }
    } catch (err) {
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useEffect(() => {
    const fetchMonthBudgets = async () => {
      try {
        const token = getAccessToken()
        const url = `/api/budgets?month=${encodeURIComponent(selectedDashboardMonthKey)}`
        const cachedBudgets = readApiCache<DashboardBudgetItem[]>(url, token)
        if (cachedBudgets) setBudgetItems(Array.isArray(cachedBudgets) ? cachedBudgets : [])
        const nextBudgets = await fetchApiJson<DashboardBudgetItem[]>(url, token)
        setBudgetItems(Array.isArray(nextBudgets) ? nextBudgets : [])
      } catch (err) {
        console.error("Failed to fetch month budgets:", err)
      }
    }
    void fetchMonthBudgets()
  }, [selectedDashboardMonthKey])


  useEffect(() => {
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (!metaTheme) return

    const previousThemeColor = metaTheme.getAttribute("content")
    const mobileQuery = window.matchMedia("(max-width: 767px)")

    const applyThemeColor = () => {
      metaTheme.setAttribute("content", getPwaThemeColor(resolvedTheme))
    }

    applyThemeColor()

    const handleThemeColorChange = () => {
      applyThemeColor()
    }

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", handleThemeColorChange)
    } else {
      mobileQuery.addListener(handleThemeColorChange)
    }

    return () => {
      if (typeof mobileQuery.removeEventListener === "function") {
        mobileQuery.removeEventListener("change", handleThemeColorChange)
      } else {
        mobileQuery.removeListener(handleThemeColorChange)
      }

      if (previousThemeColor) {
        metaTheme.setAttribute("content", previousThemeColor)
      }
    }
  }, [resolvedTheme])

  useEffect(() => {
    const hidden = showAddModal || showMobileWalletDeck
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", {
        detail: { hidden }
      })
    )

    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", {
          detail: { hidden: false }
        })
      )
    }
  }, [showAddModal, showMobileWalletDeck])

  useEffect(() => {
    if (!showChartModal || typeof document === "undefined") return
    const body = document.body
    const previousOverflow = body.style.overflow
    const previousOverscroll = body.style.overscrollBehavior
    body.style.overflow = "hidden"
    body.style.overscrollBehavior = "none"
    return () => {
      body.style.overflow = previousOverflow
      body.style.overscrollBehavior = previousOverscroll
    }
  }, [showChartModal])

  useEffect(() => {
    const syncViewport = () => {
      setIsMobileViewport(window.innerWidth < 768)
    }
    syncViewport()
    window.addEventListener("resize", syncViewport)
    return () => window.removeEventListener("resize", syncViewport)
  }, [])

  useEffect(() => {
    setActiveWalletIndex((prev) => (wallets.length ? Math.min(prev, wallets.length - 1) : 0))
  }, [wallets.length])

  const addItemsTotal = addItems.reduce((sum, item) => {
    const quantity = Number.parseFloat(item.quantity || "0") || 0
    const unitPrice = Number.parseFloat(item.unit_price || "0") || 0
    return sum + Math.max(0, quantity) * Math.max(0, unitPrice)
  }, 0)

  const activeAddItems = addItems.filter(item => item.name.trim())

  const updateAddItem = (index: number, field: keyof AddItemState, value: string) => {
    setAddItems(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  }

  const addAddItem = () => {
    setAddItems(items => [...items, { name: "", quantity: "1", unit_price: "0" }])
  }

  const removeAddItem = (index: number) => {
    setAddItems(items => items.length <= 1 ? createDefaultAddItems() : items.filter((_, itemIndex) => itemIndex !== index))
  }

  async function handleAddRecord(e: React.FormEvent) {
    e.preventDefault()
    const useItems = addForm.type === "expense"
    if (useItems && !activeAddItems.length) return
    if (!useItems && (!addForm.description || !addForm.amount)) return

    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/transactions", {
        credentials: "include",
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: addForm.type,
          amount: useItems ? addItemsTotal : parseFloat(addForm.amount),
          vendor_or_source: useItems ? activeAddItems.map(item => item.name.trim()).join(", ").slice(0, 50) : addForm.description,
          txn_date: addForm.date,
          notes: useItems ? activeAddItems.map(item => `${item.name.trim()} ${item.quantity || "1"}x${item.unit_price || "0"}`).join("\n") : addForm.description,
          category_id: addForm.category_id ? parseInt(addForm.category_id) : null,
          items: useItems
            ? activeAddItems.map((item) => {
                const quantity = Math.max(0, Number.parseFloat(item.quantity || "0"))
                const unitPrice = Math.max(0, Number.parseFloat(item.unit_price || "0"))
                return {
                  name: item.name.trim(),
                  quantity,
                  unit_price: unitPrice,
                  subtotal: Number((quantity * unitPrice).toFixed(2)),
                }
              })
            : undefined
        }),
      })

      if (res.ok) {
        setAddSuccess(true)
        showAlert(
          lang === "EN" ? "Saved" : "Berjaya Disimpan",
          lang === "EN" ? "Record saved successfully." : "Rekod berjaya disimpan.",
          "success"
        )
        setTimeout(() => {
          setShowAddModal(false)
          setAddSuccess(false)
          setAddForm({ 
            description: "", 
            amount: "", 
            category_id: "", 
            type: "expense", 
            date: getTodayDateInTimeZone(timezone)
          })
          setAddItems(createDefaultAddItems())
          fetchData()
        }, 1500)
      } else {
        const errorData = await res.json().catch(() => ({}))
        showAlert(
          lang === "EN" ? "Save Failed" : "Simpan Gagal",
          errorData?.detail || (lang === "EN" ? "Failed to save record." : "Gagal simpan rekod."),
          "error"
        )
      }
    } catch (err) {
      console.error("Add error:", err)
      showAlert(
        lang === "EN" ? "Save Failed" : "Simpan Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to save record." : "Gagal simpan rekod."),
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const getDoughnutData = (sourceTransactions: typeof analyticalTransactions) => {
    const cats: Record<string, number> = {}
    sourceTransactions.forEach(t => {
      const cat = t.category_name || t.other || "Lain"
      cats[cat] = (cats[cat] || 0) + (t.amount as number)
    })

    const sortedEntries = Object.entries(cats).sort(([, a], [, b]) => b - a)
    const labels = sortedEntries.map(([name]) => name)
    const data = sortedEntries.map(([, total]) => total)
    
    const palette = [
      'rgba(99, 102, 241, 0.85)',   // Indigo
      'rgba(16, 185, 129, 0.85)',   // Emerald
      'rgba(245, 158, 11, 0.85)',   // Amber
      'rgba(239, 68, 68, 0.85)',    // Red
      'rgba(139, 92, 246, 0.85)',   // Violet
      'rgba(14, 165, 233, 0.85)',   // Sky
      'rgba(236, 72, 153, 0.85)',   // Pink
      'rgba(20, 184, 166, 0.85)',   // Teal
      'rgba(168, 85, 247, 0.85)',   // Purple
      'rgba(249, 115, 22, 0.85)',   // Orange
    ]

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: palette.slice(0, labels.length).concat(
          labels.length > palette.length 
            ? Array(labels.length - palette.length).fill('rgba(107, 113, 148, 0.5)') 
            : []
        ),
        borderWidth: 0,
      }]
    }
  }

  const selectedDoughnutData = getDoughnutData(analyticalPreviousMonthTransactions)
  const latestDoughnutData = getDoughnutData(analyticalCurrentMonthTransactions)
  const selectedCategoriesTotal = selectedDoughnutData.datasets[0]?.data.reduce((sum, value) => sum + value, 0) || 0
  const latestCategoriesTotal = latestDoughnutData.datasets[0]?.data.reduce((sum, value) => sum + value, 0) || 0
  const selectedDoughnutColorMap = Object.fromEntries(
    selectedDoughnutData.labels.map((label, index) => [label, String((selectedDoughnutData.datasets[0]?.backgroundColor as string[] | undefined)?.[index] || "rgba(148, 163, 184, 0.85)")])
  ) as Record<string, string>
  const latestDoughnutColorMap = Object.fromEntries(
    latestDoughnutData.labels.map((label, index) => [label, String((latestDoughnutData.datasets[0]?.backgroundColor as string[] | undefined)?.[index] || "rgba(59, 130, 246, 0.85)")])
  ) as Record<string, string>
  const categoryComparisonRows = (() => {
    const rows = new Map<string, { label: string; previous: number; current: number; count: number }>()
    analyticalPreviousMonthTransactions.forEach((tx) => {
      const label = tx.category_name || tx.other || "Lain"
      const row = rows.get(label) || { label, previous: 0, current: 0, count: 0 }
      row.previous += Number(tx.amount || 0)
      rows.set(label, row)
    })
    analyticalCurrentMonthTransactions.forEach((tx) => {
      const label = tx.category_name || tx.other || "Lain"
      const row = rows.get(label) || { label, previous: 0, current: 0, count: 0 }
      row.current += Number(tx.amount || 0)
      row.count += 1
      rows.set(label, row)
    })
    return Array.from(rows.values())
      .sort((a, b) => b.current - a.current || b.previous - a.previous)
  })()
  const categoryComparisonMax = Math.max(...categoryComparisonRows.map((row) => Math.max(row.current, row.previous)), 1)

  // ── Category comparison (before vs now) — monochrome only ──
  const categoryCompareItems = categoryComparisonRows
    .filter((row) => row.current > 0 || row.previous > 0)
    .slice(0, 6)
    .map((row) => {
      const delta = row.current - row.previous
      const pctChange = row.previous > 0 ? (delta / row.previous) * 100 : (row.current > 0 ? 100 : 0)
      return { ...row, delta, pctChange }
    })
  const compareOverallDelta = latestCategoriesTotal - selectedCategoriesTotal
  const compareOverallPct = selectedCategoriesTotal > 0
    ? (compareOverallDelta / selectedCategoriesTotal) * 100
    : (latestCategoriesTotal > 0 ? 100 : 0)

  const categoryAnalyticsCard = (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-[var(--shadow-soft)]">
      {/* Header — title only */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-bg)] text-[var(--accent2)]">
          <PieChart size={14} strokeWidth={2.3} />
        </span>
        <h3 className="truncate text-sm font-bold text-[var(--text)]">
          {lang === "EN" ? "Category comparison" : "Perbandingan kategori"}
        </h3>
      </div>

      {/* Totals side by side */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[var(--surface-tint)] px-3 py-2 text-center">
          <p className="text-[0.58rem] font-bold uppercase tracking-wider text-[var(--muted)]">
            {previousDashboardMonthOption?.shortLabel}
          </p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-[var(--muted)]">
            RM {selectedCategoriesTotal.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--accent-bg)] px-3 py-2 text-center">
          <p className="text-[0.58rem] font-bold uppercase tracking-wider text-[var(--accent2)]">
            {selectedDashboardMonthOption?.shortLabel}
          </p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-[var(--text)]">
            RM {latestCategoriesTotal.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Category rows — side by side bars */}
      {categoryCompareItems.length > 0 ? (
        <div className="mt-3 space-y-2.5">
          {categoryCompareItems.map((item) => {
            const beforePct = Math.max(3, (item.previous / categoryComparisonMax) * 100)
            const nowPct = Math.max(3, (item.current / categoryComparisonMax) * 100)

            return (
              <div key={`cmp-${item.label}`}>
                <div className="mb-1 flex items-center justify-center">
                  <p className="truncate text-center text-xs font-semibold text-[var(--text)]">{item.label}</p>
                </div>

                {/* Mirror dual bars: previous grows from right, current from left */}
                <div className="grid grid-cols-2 gap-px">
                  <div className="relative h-6 overflow-hidden rounded-l-md bg-[var(--surface-tint)]">
                    <div
                      className="absolute inset-y-0 right-0 rounded-l-md bg-[var(--muted)]/40 transition-all duration-300"
                      style={{ width: `${Math.min(100, beforePct)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center px-1.5 text-[10px] font-bold tabular-nums text-[var(--text)]">
                      {item.previous > 0
                        ? `RM ${item.previous.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : "—"}
                    </span>
                  </div>
                  <div className="relative h-6 overflow-hidden rounded-r-md bg-[var(--surface-tint)]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-r-md bg-[var(--text)] transition-all duration-300"
                      style={{ width: `${Math.min(100, nowPct)}%` }}
                    />
                    <span className={cn(
                      "absolute inset-0 flex items-center justify-center px-1.5 text-[10px] font-bold tabular-nums",
                      nowPct >= 42 ? "text-[var(--bg)]" : "text-[var(--text)]"
                    )}>
                      {item.current > 0
                        ? `RM ${item.current.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-2 py-6 opacity-40">
          <BarChart2 size={24} className="text-[var(--muted)]" />
          <p className="text-xs font-medium text-[var(--muted)]">{t.noAnalytics}</p>
        </div>
      )}
    </div>
  )

  const currentMonthIndex = MONTHLY_EXPENSE_MONTHS - 1

  const currentYearInKualaLumpur = Math.max(
    1970,
    Number(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        timeZone: DASHBOARD_DAILY_TIMEZONE,
      }).format(new Date())
    )
  )

  const currentMonthIndexInKualaLumpur = Math.max(
    0,
    Number(
      new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        timeZone: DASHBOARD_DAILY_TIMEZONE,
      }).format(new Date())
    ) - 1
  )

  const currentDayInKualaLumpur = Math.max(
    1,
    Number(
      new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        timeZone: DASHBOARD_DAILY_TIMEZONE,
      }).format(new Date())
    )
  )

  const monthlySeries = Array.from({ length: MONTHLY_EXPENSE_MONTHS }, (_, index) => {
    const monthDate = new Date(currentYearInTimezone, currentMonthIndexInKualaLumpur - (MONTHLY_EXPENSE_MONTHS - 1 - index), 1)

    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`
    const totals = analyticalTransactions
      .filter((tx) => String(tx.txn_date).startsWith(monthKey))
      .reduce((acc, tx) => {
        if (tx.type === "expense") acc.expense += (tx.amount as number)
        else if (tx.type === "income") acc.income += (tx.amount as number)
        return acc
      }, { income: 0, expense: 0 })

    return {
      label: monthDate.toLocaleString(
        lang === "BM" ? "ms-MY" : "en-MY",
        { month: "short" }
      ),
      total: totals.expense,
      income: totals.income,
      expense: totals.expense,
    }
  })

  const resolvedMonthlyBarIndex = activeMonthlyBarIndex ?? currentMonthIndex
  const selectedDailyMonthDate = new Date(currentYearInKualaLumpur, currentMonthIndexInKualaLumpur, 1)
  const selectedDailyMonthKey = `${selectedDailyMonthDate.getFullYear()}-${String(selectedDailyMonthDate.getMonth() + 1).padStart(2, "0")}`
  const daysInSelectedMonth = new Date(
    selectedDailyMonthDate.getFullYear(),
    selectedDailyMonthDate.getMonth() + 1,
    0
  ).getDate()

  const dailySeries = Array.from({ length: 7 }, (_, index) => {
    const dayDate = new Date(selectedDailyMonthDate)
    dayDate.setDate(currentDayInKualaLumpur - (6 - index))
    const dayNumber = dayDate.getDate()
    const dayKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`

    const totals = analyticalTransactions
      .filter((tx) => String(tx.txn_date).slice(0, 10) === dayKey)
      .reduce((acc, tx) => {
        if (tx.type === "expense") acc.expense += (tx.amount as number)
        else if (tx.type === "income") acc.income += (tx.amount as number)
        return acc
      }, { income: 0, expense: 0 })

    const stableDate = new Date(Date.UTC(
      dayDate.getFullYear(),
      dayDate.getMonth(),
      dayNumber,
      12
    ))

    return {
      key: dayKey,
      axisLabel: stableDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", {
        day: "numeric",
        timeZone: "UTC",
      }),
      label: stableDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      total: totals.expense,
      income: totals.income,
      expense: totals.expense,
    }
  })
  const paddedDailySeries = [
    ...Array.from({ length: DAILY_EDGE_SPACER_DAYS }, (_, index) => ({
      key: `daily-spacer-start-${index}`,
      axisLabel: "",
      label: "",
      total: 0,
      income: 0,
      expense: 0,
      isSpacer: true,
    })),
    ...dailySeries.map((item) => ({ ...item, isSpacer: false })),
    ...Array.from({ length: DAILY_EDGE_SPACER_DAYS }, (_, index) => ({
      key: `daily-spacer-end-${index}`,
      axisLabel: "",
      label: "",
      total: 0,
      income: 0,
      expense: 0,
      isSpacer: true,
    })),
  ]

  const currentMonthExpense = monthlySeries[currentMonthIndex]?.total ?? 0
  const previousMonthExpense = monthlySeries[Math.max(0, currentMonthIndex - 1)]?.total ?? 0
  const hasMonthlyExpenseData = monthlySeries.some((item) => item.total > 0)
  const hasDailyExpenseData = dailySeries.some((item) => item.total > 0)
  const monthlyExpenseDelta = previousMonthExpense > 0
    ? ((currentMonthExpense - previousMonthExpense) / previousMonthExpense) * 100
    : null

  const preferredTodayIndex = Math.max(
    0,
    Math.min(daysInSelectedMonth - 1, currentDayInKualaLumpur - 1)
  )
  const latestDailyExpenseIndex = (() => {
    if (!dailySeries.length) return 0

    for (let index = dailySeries.length - 1; index >= 0; index -= 1) {
      if ((dailySeries[index]?.total ?? 0) > 0) return index
    }

    for (let index = preferredTodayIndex; index >= 0; index -= 1) {
      if ((dailySeries[index]?.total ?? 0) > 0) return index
    }

    for (let index = preferredTodayIndex + 1; index < dailySeries.length; index += 1) {
      if ((dailySeries[index]?.total ?? 0) > 0) return index
    }

    return preferredTodayIndex
  })()
  const defaultDailyBarIndex = latestDailyExpenseIndex
  const resolvedDailyBarIndex = activeDailyBarIndex === null
    ? defaultDailyBarIndex
    : Math.max(0, Math.min(dailySeries.length - 1, activeDailyBarIndex))
  const paddedResolvedDailyBarIndex = resolvedDailyBarIndex + DAILY_EDGE_SPACER_DAYS

  const trendPoint = chartView === "daily"
    ? dailySeries[resolvedDailyBarIndex]
    : monthlySeries[resolvedMonthlyBarIndex]
  const currentDailyTrendPoint = dailySeries[resolvedDailyBarIndex]

  const monthlyAreaChartData = monthlySeries.map((item) => ({ label: item.label, expense: item.total }))
  const dailyAreaChartData = dailySeries.map((item) => ({ label: item.axisLabel, expense: item.total }))

  const displayedStats = {
    income: trendPoint?.income ?? 0,
    expense: trendPoint?.expense ?? 0,
    label: trendPoint?.label ?? "-",
  }

  const monthlyExpenseData = {
    labels: monthlySeries.map((item) => item.label),
    datasets: [
      {
        data: monthlySeries.map((item) => item.total),
        backgroundColor: monthlySeries.map((_, index) => {
          if (index === currentMonthIndex) return "#dbeafe"
          if (index < currentMonthIndex) return "#60a5fa"
          return "#3b82f6"
        }),
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 32,
      },
    ],
  }

  const fullMonthlySeries = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(currentYearInTimezone, index, 1)
    const monthKey = `${currentYearInTimezone}-${String(index + 1).padStart(2, "0")}`
    const totals = analyticalTransactions
      .filter((tx) => String(tx.txn_date).startsWith(monthKey))
      .reduce((acc, tx) => {
        if (tx.type === "expense") acc.expense += (tx.amount as number)
        else if (tx.type === "income") acc.income += (tx.amount as number)
        return acc
      }, { income: 0, expense: 0 })
    return {
      label: monthDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", { month: "short" }),
      total: totals.expense,
    }
  })

  const fullDailySeries = Array.from({ length: daysInSelectedMonth }, (_, index) => {
    const dayNumber = index + 1
    const dayKey = `${selectedDailyMonthKey}-${String(dayNumber).padStart(2, "0")}`
    const totals = analyticalTransactions
      .filter((tx) => String(tx.txn_date).slice(0, 10) === dayKey)
      .reduce((acc, tx) => {
        if (tx.type === "expense") acc.expense += (tx.amount as number)
        else if (tx.type === "income") acc.income += (tx.amount as number)
        return acc
      }, { income: 0, expense: 0 })
    return {
      key: dayKey,
      axisLabel: String(dayNumber),
      total: totals.expense,
    }
  })

  const fullPaddedDailySeries = [
    ...Array.from({ length: DAILY_EDGE_SPACER_DAYS }, (_, index) => ({ key: `full-daily-spacer-start-${index}`, axisLabel: "", total: 0, isSpacer: true })),
    ...fullDailySeries.map((item) => ({ ...item, isSpacer: false })),
    ...Array.from({ length: DAILY_EDGE_SPACER_DAYS }, (_, index) => ({ key: `full-daily-spacer-end-${index}`, axisLabel: "", total: 0, isSpacer: true })),
  ]

  const fullMonthlyExpenseData = {
    labels: fullMonthlySeries.map((item) => item.label),
    datasets: [
      {
        data: fullMonthlySeries.map((item) => item.total),
        backgroundColor: fullMonthlySeries.map((_, index) => index === fullMonthlySeries.length - 1 ? "#dbeafe" : "#60a5fa"),
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 30,
      },
    ],
  }

  const fullDailyExpenseData = {
    labels: fullDailySeries.map((item) => item.axisLabel),
    datasets: [
      {
        data: fullDailySeries.map((item) => item.total),
        backgroundColor: fullDailySeries.map((item, index) => {
          if (index + 1 === currentDayInKualaLumpur) return "#f6a07d"
          return item.total > 0 ? "#f8b195" : "#303544"
        }),
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 10,
      },
    ],
  }

  const hasFullMonthlyExpenseData = fullMonthlySeries.some((item) => item.total > 0)
  const hasFullDailyExpenseData = fullDailySeries.some((item) => item.total > 0)
  const fullDailyChartWidth = Math.max(fullDailySeries.length * (isMobileViewport ? 28 : 26), isMobileViewport ? 920 : 980)
  const hasModalChartData = chartView === "daily" ? hasFullDailyExpenseData : hasFullMonthlyExpenseData
  const modalChartWidth = chartView === "daily"
    ? Math.max(fullPaddedDailySeries.length * (isMobileViewport ? MOBILE_DAILY_BAR_WIDTH : DESKTOP_DAILY_BAR_WIDTH), isMobileViewport ? 1120 : 1180)
    : Math.max(fullMonthlySeries.length * 58, isMobileViewport ? 760 : 980)

  const dailyLineData = {
    labels: paddedDailySeries.map((item) => item.axisLabel),
    datasets: [
      {
        data: paddedDailySeries.map((item) => item.isSpacer ? null : item.total),
        borderColor: "#f6a07d",
        backgroundColor: "rgba(246, 160, 125, 0.18)",
        fill: true,
        tension: 0.38,
        borderWidth: 3,
        spanGaps: false,
        pointRadius: paddedDailySeries.map((item, index) => {
          if (item.isSpacer) return 0
          if (index === paddedResolvedDailyBarIndex) return 5
          return item.total > 0 ? 3 : 2
        }),
        pointHoverRadius: 6,
        pointBackgroundColor: paddedDailySeries.map((item, index) => {
          if (item.isSpacer) return "rgba(0,0,0,0)"
          if (index === paddedResolvedDailyBarIndex) return "#ffffff"
          return "#242424"
        }),
        pointBorderColor: paddedDailySeries.map((item, index) => {
          if (item.isSpacer) return "rgba(0,0,0,0)"
          if (index === paddedResolvedDailyBarIndex) return "#ffffff"
          return "#f6a07d"
        }),
        pointBorderWidth: paddedDailySeries.map((item, index) => (
          !item.isSpacer && index === paddedResolvedDailyBarIndex ? 3 : 2
        )),
      },
    ],
  }

  const hasChartData = chartView === "daily" ? hasDailyExpenseData : hasMonthlyExpenseData
  const chartEmptyLabel = chartView === "daily" ? t.expenseTrendDailyEmpty : t.expenseTrendEmpty
  const chartDataLabelActiveIndex = chartView === "daily"
    ? paddedResolvedDailyBarIndex
    : resolvedMonthlyBarIndex
  const mobileChartWidth = Math.max(paddedDailySeries.length * MOBILE_DAILY_BAR_WIDTH, 920)
  const desktopDailyChartWidth = Math.max(paddedDailySeries.length * DESKTOP_DAILY_BAR_WIDTH, 700)

  const handleBarChartClick = (_event: ChartEvent, elements: ActiveElement[]) => {
    if (!elements.length) return
    const clickedIndex = elements[0]?.index
    if (!Number.isFinite(clickedIndex)) return

    if (chartView === "daily") {
      const dailyPoint = paddedDailySeries[clickedIndex]
      if (!dailyPoint || dailyPoint.isSpacer) return
      const nextDailyIndex = Math.max(
        0,
        Math.min(dailySeries.length - 1, clickedIndex - DAILY_EDGE_SPACER_DAYS)
      )
      setActiveDailyBarIndex(nextDailyIndex)
      return
    }

    setActiveMonthlyBarIndex(clickedIndex)
  }

  const activateLatestDailyPoint = React.useCallback(() => {
    setActiveDailyBarIndex(latestDailyExpenseIndex)
    dailyScrollInitializedRef.current = false
  }, [latestDailyExpenseIndex])

  const handleSwitchToDailyChart = React.useCallback(() => {
    setChartView("daily")
    activateLatestDailyPoint()
  }, [activateLatestDailyPoint])

  const openChartModal = React.useCallback((view: "monthly" | "daily") => {
    if (view === "daily") {
      setChartView("daily")
      activateLatestDailyPoint()
    } else {
      setChartView("monthly")
    }
    setShowChartModal(true)
  }, [activateLatestDailyPoint])

  const scrollDailyChartBy = React.useCallback((direction: "prev" | "next") => {
    const container = dailyChartScrollRef.current
    if (!container) return

    const delta = Math.max(180, Math.round(container.clientWidth * 0.42))
    container.scrollBy({
      left: direction === "next" ? delta : -delta,
      behavior: "smooth",
    })
  }, [])

  useEffect(() => {
    if (!dailySeries.length) return
    setActiveDailyBarIndex(defaultDailyBarIndex)
    dailyScrollInitializedRef.current = false
  }, [selectedDailyMonthKey, dailySeries.length, defaultDailyBarIndex])

  useEffect(() => {
    if (chartView !== "daily") {
      dailyScrollInitializedRef.current = false
      return
    }
    const container = dailyChartScrollRef.current
    if (!container || !paddedDailySeries.length || dailyScrollInitializedRef.current) return
    
    const currentChartWidth = isMobileViewport ? mobileChartWidth : desktopDailyChartWidth
    const slotWidth = currentChartWidth / paddedDailySeries.length
    const indexToFocus = paddedResolvedDailyBarIndex
    const nextScrollLeft = Math.max(
      0,
      indexToFocus * slotWidth - container.clientWidth / 2 + slotWidth / 2
    )
    container.scrollLeft = nextScrollLeft
    dailyScrollInitializedRef.current = true
  }, [isMobileViewport, chartView, mobileChartWidth, desktopDailyChartWidth, paddedDailySeries.length, paddedResolvedDailyBarIndex])

  const handleDailyChartScroll = () => {
    if (chartView !== "daily") return
    const container = dailyChartScrollRef.current
    if (!container || !paddedDailySeries.length || !dailySeries.length) return
    
    const currentChartWidth = isMobileViewport ? mobileChartWidth : desktopDailyChartWidth
    const slotWidth = currentChartWidth / paddedDailySeries.length
    const centerX = container.scrollLeft + container.clientWidth / 2
    const nextPaddedIndex = Math.max(
      0,
      Math.min(paddedDailySeries.length - 1, Math.round(centerX / slotWidth - 0.5))
    )
    const nextIndex = Math.max(
      0,
      Math.min(dailySeries.length - 1, nextPaddedIndex - DAILY_EDGE_SPACER_DAYS)
    )
    setActiveDailyBarIndex((prev) => (prev === nextIndex ? prev : nextIndex))
  }

  const getClosestWalletSlideIndex = (container: HTMLElement) => {
    const slides = Array.from(container.children) as HTMLElement[]
    if (!slides.length) return 0

    const centerX = container.scrollLeft + container.clientWidth / 2
    return slides.reduce((closest, slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2
      const closestSlide = slides[closest]
      const closestCenter = closestSlide.offsetLeft + closestSlide.offsetWidth / 2
      return Math.abs(slideCenter - centerX) < Math.abs(closestCenter - centerX) ? index : closest
    }, 0)
  }

  const handleWalletCarouselScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    if (walletScrollTimerRef.current) clearTimeout(walletScrollTimerRef.current)
    walletScrollTimerRef.current = setTimeout(() => {
      const closestIndex = getClosestWalletSlideIndex(container)
      const slide = container.children[closestIndex] as HTMLElement | undefined
      if (slide) {
        const target = slide.offsetLeft - (container.clientWidth - slide.offsetWidth) / 2
        const start = container.scrollLeft
        const distance = target - start
        if (Math.abs(distance) < 2) {
          setActiveWalletIndex((prev) => (prev === closestIndex ? prev : closestIndex))
          return
        }
        const duration = 300
        const startTime = performance.now()
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
        const animate = (now: number) => {
          const elapsed = now - startTime
          const progress = Math.min(elapsed / duration, 1)
          container.scrollLeft = start + distance * easeOutCubic(progress)
          if (progress < 1) requestAnimationFrame(animate)
          else setActiveWalletIndex((prev) => (prev === closestIndex ? prev : closestIndex))
        }
        requestAnimationFrame(animate)
      }
    }, 120)
  }

  const smoothScrollWallet = (container: HTMLElement, target: number) => {
    const start = container.scrollLeft
    const distance = target - start
    const duration = 350
    const startTime = performance.now()
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      container.scrollLeft = start + distance * easeOutCubic(progress)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }

  const scrollToWallet = (index: number, trigger: HTMLElement) => {
    const section = trigger.closest("[data-wallet-section]")
    const container = section?.querySelector<HTMLElement>("[data-wallet-carousel]")
    const slide = container?.children[index] as HTMLElement | undefined
    if (!slide || !container) return
    const target = slide.offsetLeft - (container.clientWidth - slide.offsetWidth) / 2
    smoothScrollWallet(container, target)
    setActiveWalletIndex(index)
  }


  const earnedBadgeKeys = useMemo(() => deriveEarnedBadgeKeys(transactions as BadgeTransactionLike[], budgetItems as BadgeBudgetItemLike[]), [transactions, budgetItems])

  const liveBadges = useMemo(() => DASHBOARD_BADGES.map((badge) => ({
    ...badge,
    status: earnedBadgeKeys.has(badge.key) ? "unlocked" as const : "locked" as const,
  })), [earnedBadgeKeys])
  const unlockedBadges = liveBadges.filter((badge) => badge.status === "unlocked")
  const lockedBadges = liveBadges.filter((badge) => badge.status === "locked")
  const primaryBadge = unlockedBadges[0] ?? liveBadges[0]
  const extraBadgeCount = Math.max(unlockedBadges.length - 1, 0)

  const displayName = userName.trim() || "User"
  const formatHeroAmount = (value: number, options?: Intl.NumberFormatOptions) =>
    showHeroAmounts
      ? `RM ${Number(value || 0).toLocaleString("en-MY", options)}`
      : "RM ••••••"
  const formatHeroNumber = (value: number, options?: Intl.NumberFormatOptions) =>
    Number(value || 0).toLocaleString("en-MY", options)

  const heroBalanceDisplay = formatHeroNumber(stats.balance, { minimumFractionDigits: 2 })
  const dashboardAmountSkeleton = (className = "h-5 w-28") => (
    <span aria-hidden="true" className={cn("skeleton-surface inline-block rounded-full align-middle", className)} />
  )

  const heroWallets = useMemo(() => {
    if (!wallets.length) {
      return [
        {
          id: 0,
          balance: Number(stats.balance || 0),
          currency: "RM",
          label: "Wallet",
          name: "Wallet",
        } as DashboardWallet,
      ]
    }

    return [...wallets]
      .map((wallet) => ({
        ...wallet,
        balance: Number(wallet.balance || 0),
      }))
      .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
  }, [wallets])

  const walletTypeLabel = useCallback(
    (type?: string | null) => {
      const normalized = (type || "").trim().toLowerCase()
      if (!normalized) return lang === "BM" ? "Dompet" : "Wallet"
      const labels: Record<string, { bm: string; en: string }> = {
        cash: { bm: "Tunai", en: "Cash" },
        bank: { bm: "Bank", en: "Bank" },
        bank_digital: { bm: "Bank digital", en: "Digital bank" },
        ewallet: { bm: "E-wallet", en: "E-wallet" },
        credit_card: { bm: "Kad kredit", en: "Credit card" },
        personal: { bm: "Peribadi", en: "Personal" },
        shared: { bm: "Kongsi", en: "Shared" },
      }
      const label = labels[normalized]
      if (label) return lang === "BM" ? label.bm : label.en
      return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    },
    [lang],
  )

  const walletCardSkeleton = (key: string | number, className = "") => (
    <div
      key={key}
      aria-hidden="true"
      className={cn(
        "skeleton-panel shrink-0 overflow-hidden rounded-3xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="skeleton-surface h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2 text-right">
          <div className="ml-auto skeleton-surface h-3 w-24 rounded-full" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="skeleton-surface h-2.5 w-14 rounded-full" />
        <div className="skeleton-surface h-7 w-32 rounded-full" />
      </div>
      <div className="mt-5 border-t border-[color:var(--skeleton-border)] pt-3">
        <div className="skeleton-surface h-2.5 w-28 rounded-full" />
      </div>
    </div>
  )

  const walletRowSkeleton = (key: string | number) => (
    <div
      key={key}
      aria-hidden="true"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="skeleton-surface h-8 w-8 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="skeleton-surface h-2.5 w-24 rounded-full" />
        </div>
      </div>
      <div className="skeleton-surface h-3 w-20 rounded-full" />
    </div>
  )

  const chartMiniSkeleton = (key: string) => (
    <div
      key={key}
      aria-hidden="true"
      className="rounded-[16px] border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="skeleton-surface h-2.5 w-16 rounded-full" />
        <div className="skeleton-surface h-3 w-3 rounded-full" />
      </div>
      <div className="mt-3 skeleton-surface h-5 w-24 rounded-full" />
      <div className="mt-2 skeleton-surface h-2.5 w-14 rounded-full" />
      <div className="mt-3 flex h-10 items-end gap-1">
        {[40, 70, 45, 85, 55, 65].map((h, i) => (
          <div key={i} className="skeleton-surface flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )

  const walletSummarySection = (
    <div data-wallet-section>
      {showDataSkeleton ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-busy="true"
          aria-label={lang === "BM" ? "Memuatkan dompet" : "Loading wallets"}
        >
          {[0, 1, 2, 3].map((i) => walletCardSkeleton(i, "h-[196px] w-full"))}
        </div>
      ) : wallets.length > 0 ? (
        <>
          <div
            ref={walletAutoScrollRef}
            data-wallet-carousel
            onScroll={handleWalletCarouselScroll}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {heroWallets.map((wallet, index) => {
              const accent = getDashboardWalletAccent(wallet)
              const walletName = wallet.label || wallet.name || (lang === "BM" ? "Dompet" : "Wallet")
              const walletType = walletTypeLabel(wallet.type)

              return (
                <div key={`${wallet.id || index}-desktop-wallet-card`} className="min-w-0 w-full">
                  <div
                    className="relative flex h-[196px] w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] p-5 pb-6 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md"
                    style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent.from} 16%, var(--card)) 0%, color-mix(in srgb, ${accent.to} 8%, var(--card)) 100%)` }}
                  >
                    {wallet.image_url && <><img src={wallet.image_url} alt="" className="absolute -right-5 -top-8 h-[135%] w-[62%] rotate-[9deg] object-cover opacity-55 [mask-image:linear-gradient(to_right,transparent_0%,transparent_8%,black_55%)]" /><div className="absolute inset-0 bg-gradient-to-r from-[var(--card)] from-30% via-[var(--card)] via-52% to-transparent to-90%" /><div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/5" /></>}
                    <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-10 blur-2xl" style={{ backgroundColor: accent.color }} />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="relative shrink-0">
                        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)] shadow-sm">
                          {wallet.image_url ? <img src={wallet.image_url} alt="" className="h-full w-full object-cover" /> : <Wallet size={19} />}
                        </div>
                        {wallet.is_bot_default ? (
                          <span
                            className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[0.5rem] font-black leading-none text-white shadow-sm ring-2 ring-[var(--card)]"
                            title="Bot"
                            aria-label="Bot"
                          >
                            B
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-black tracking-tight text-[var(--text)]">{walletName}</p>
                        <p className="mt-1 truncate text-[0.58rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                          {walletType}
                        </p>
                      </div>
                    </div>
                    <div className="relative mt-5">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                        {lang === "BM" ? "Baki" : "Balance"}
                      </p>
                      <p className="mt-1 truncate text-3xl font-semibold tabular-nums tracking-tight text-[var(--text)]">
                        {showDataSkeleton
                          ? dashboardAmountSkeleton("h-6 w-24")
                          : showHeroAmounts
                            ? <>{formatCurrencyLabel(wallet.currency)} {wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                            : `${formatCurrencyLabel(wallet.currency)} ••••••`}
                      </p>
                    </div>
                    <div className="relative mt-auto border-t border-[var(--border)] pt-3">
                      <span className="truncate text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Prefix: {wallet.name}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl py-10 opacity-70 border border-dashed border-[var(--border)]">
          <Wallet size={24} className="mb-2 text-[var(--muted)]" />
          <p className="text-xs font-medium text-[var(--muted)]">
            {lang === "BM" ? "Tiada dompet" : "No wallets"}
          </p>
        </div>
      )}
    </div>
  )

  const budgetAlertItems = budgetItems
    .filter((item) => item.budget_amount > 0 && item.progress_percent >= 80)
    .sort((a, b) => b.progress_percent - a.progress_percent)
  const hasOverBudgetAlert = budgetAlertItems.some((item) => item.status === "over_budget")

  const budgetAlertSection = (
    <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            hasOverBudgetAlert
              ? "bg-[var(--expense-bg)] text-[var(--expense)]"
              : budgetAlertItems.length > 0
                ? "bg-amber-500/10 text-amber-500"
                : "bg-[var(--surface-tint)] text-[var(--muted)]"
          )}>
            <AlertTriangle size={14} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-[var(--text)]">
              {lang === "BM" ? "Amaran bajet" : "Budget alerts"}
            </h3>
            <p className="truncate text-[0.65rem] font-medium text-[var(--muted)]">
              {budgetAlertItems.length > 0
                ? `${budgetAlertItems.length} ${lang === "BM" ? "perlu perhatian" : "need attention"}`
                : (lang === "BM" ? "Semua dalam kawalan" : "All under control")}
            </p>
          </div>
        </div>
        <Link
          href={`/${sessionId}/budget`}
          className="shrink-0 text-[0.7rem] font-semibold text-[var(--accent2)] transition hover:underline"
        >
          {lang === "BM" ? "Buka" : "Open"}
        </Link>
      </div>

      <div className="space-y-1.5 p-2.5">
        {showDataSkeleton ? (
          <div className="space-y-1.5" aria-busy="true" aria-label={lang === "BM" ? "Memuatkan amaran" : "Loading alerts"}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-[color:var(--skeleton-border)] bg-[var(--skeleton-panel)] px-2.5 py-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="skeleton-surface h-2.5 w-24 rounded-full" />
                  <div className="skeleton-surface h-4 w-10 rounded-full" />
                </div>
                <div className="skeleton-surface h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : budgetAlertItems.length > 0 ? (
          budgetAlertItems.slice(0, 4).map((item) => {
            const over = item.status === "over_budget"
            return (
              <div
                key={item.category_id}
                className={cn(
                  "rounded-xl border px-2.5 py-2",
                  over
                    ? "border-[color-mix(in_srgb,var(--expense)_22%,var(--border))] bg-[var(--expense-bg)]"
                    : "border-[var(--border)] bg-[var(--surface-tint)]/50"
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[0.78rem] font-bold text-[var(--text)]">{item.category_name}</p>
                  <span className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold tabular-nums",
                    over ? "bg-[var(--expense)]/15 text-[var(--expense)]" : "bg-amber-500/15 text-amber-500"
                  )}>
                    {Math.round(item.progress_percent)}%
                  </span>
                </div>
                <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--card)]">
                  <div
                    className={cn("h-full rounded-full transition-all", over ? "bg-[var(--expense)]" : "bg-amber-500")}
                    style={{ width: `${Math.min(100, item.progress_percent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[0.62rem] font-semibold tabular-nums">
                  <span className={over ? "text-[var(--expense)]" : "text-amber-500"}>
                    RM {item.used_amount.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[var(--muted)]">
                    / {item.budget_amount.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )
          })
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-4">
            <Wallet size={14} className="shrink-0 text-[var(--muted)]" />
            <p className="text-[0.72rem] font-medium text-[var(--muted)]">
              {lang === "BM" ? "Tiada alert budget" : "No budget alerts"}
            </p>
          </div>
        )}
      </div>
    </div>
  )

  const categoryAnalyticsCardMobile = (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-[var(--shadow-soft)]">
      {/* Header — title only */}
      <h3 className="truncate text-sm font-bold text-[var(--text)]">
        {lang === "EN" ? "Category compare" : "Banding kategori"}
      </h3>

      {/* Totals side by side */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <div className="rounded-xl bg-[var(--surface-tint)] px-2.5 py-2 text-center">
          <div className="flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]/60" />
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {previousDashboardMonthOption?.shortLabel}
            </p>
          </div>
          <p className="mt-0.5 text-[0.85rem] font-black tabular-nums text-[var(--muted)]">
            RM {selectedCategoriesTotal.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--accent-bg)] px-2.5 py-2 text-center">
          <div className="flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--btn-primary-bg)]" />
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--accent2)]">
              {selectedDashboardMonthOption?.shortLabel}
            </p>
          </div>
          <p className="mt-0.5 text-[0.85rem] font-black tabular-nums text-[var(--text)]">
            RM {latestCategoriesTotal.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Compact side-by-side rows */}
      {categoryCompareItems.length > 0 ? (
        <div className="mt-2.5 space-y-2">
          {categoryCompareItems.slice(0, 6).map((item) => {
            const beforePct = Math.max(4, (item.previous / categoryComparisonMax) * 100)
            const nowPct = Math.max(4, (item.current / categoryComparisonMax) * 100)

            return (
              <div key={`m-cmp-${item.label}`}>
                <div className="mb-1 flex items-center justify-center">
                  <p className="truncate text-center text-[0.72rem] font-semibold text-[var(--text)]">{item.label}</p>
                </div>
                <div className="grid grid-cols-2 gap-px">
                  <div className="min-w-0">
                    <div className="relative h-5 overflow-hidden rounded-l-md bg-[var(--surface-tint)]">
                      <div
                        className="absolute inset-y-0 right-0 rounded-l-md bg-[var(--muted)]/35"
                        style={{ width: `${Math.min(100, beforePct)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center px-1 text-[9px] font-bold tabular-nums text-[var(--muted)]">
                        {item.previous > 0
                          ? `RM ${item.previous.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="relative h-5 overflow-hidden rounded-r-md bg-[var(--surface-tint)]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-r-md bg-[var(--btn-primary-bg)]"
                        style={{ width: `${Math.min(100, nowPct)}%` }}
                      />
                      <span className={cn(
                        "absolute inset-0 flex items-center justify-center px-1 text-[9px] font-bold tabular-nums",
                        nowPct >= 40 ? "text-[var(--bg)]" : "text-[var(--text)]"
                      )}>
                        {item.current > 0
                          ? `RM ${item.current.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-1.5 py-6 opacity-40">
          <BarChart2 size={22} className="text-[var(--muted)]" />
          <p className="text-[0.7rem] font-medium text-[var(--muted)]">{t.noAnalytics}</p>
        </div>
      )}
    </div>
  )

  const topCategoriesSection = (
    <section className="space-y-3">
      {categoryComparisonRows.length > 0 ? (
        <div className="mt-1">
          {categoryAnalyticsCardMobile}
        </div>
      ) : (
        <div className="flex h-36 flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-float)] opacity-40">
          <BarChart2 size={22} className="mb-1.5 text-[var(--muted)]" />
          <p className="text-xs font-semibold text-[var(--muted)]">{t.noAnalytics}</p>
        </div>
      )}
    </section>
  )

  const heroBalanceDigitCount = heroBalanceDisplay.replace(/\D/g, "").length
  const mobileHeroBalanceSizeClass =
    heroBalanceDigitCount >= 14
      ? "text-[1.45rem]"
      : heroBalanceDigitCount >= 11
        ? "text-[1.7rem]"
        : "text-[2.1rem]"
  const desktopHeroBalanceSizeClass =
    heroBalanceDigitCount >= 14
      ? "text-[1.95rem] lg:text-[2.2rem]"
      : heroBalanceDigitCount >= 11
        ? "text-[2.2rem] lg:text-[2.45rem]"
        : "text-[2.55rem] lg:text-[2.8rem]"

  const moneyLifespanCycleBounds = (() => {
    const bounds = cycleMode === "category"
      ? categoryCycleMonthBounds(salaryDates, selectedDashboardMonthKey)
      : cycleMonthBounds(selectedDashboardMonthKey, cycleStartDay)
    if (!bounds) return null
    const startKey = bounds.start instanceof Date ? bounds.start.toISOString().slice(0, 10) : bounds.start
    let endKey = bounds.end instanceof Date ? bounds.end.toISOString().slice(0, 10) : bounds.end
    if (cycleMode === "category" && endKey === getTodayDateInTimeZone(timezone)) {
      const start = new Date(`${startKey}T00:00:00`)
      const expectedNext = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate())
      expectedNext.setDate(expectedNext.getDate() - 1)
      endKey = `${expectedNext.getFullYear()}-${String(expectedNext.getMonth() + 1).padStart(2, "0")}-${String(expectedNext.getDate()).padStart(2, "0")}`
    }
    return { startKey, endKey }
  })()
  const todayKeyForRunway = getTodayDateInTimeZone(timezone)
  const moneyLifespanDaysLeft = (() => {
    if (!moneyLifespanCycleBounds) return Math.max(daysInSelectedMonth - currentDayInKualaLumpur + 1, 1)
    const today = new Date(`${todayKeyForRunway}T00:00:00`)
    const end = new Date(`${moneyLifespanCycleBounds.endKey}T00:00:00`)
    return Math.max(Math.floor((end.getTime() - today.getTime()) / 86400000) + 1, 1)
  })()
  const moneyLifespanCurrentBalance = Math.max(Number(stats.balance || 0), 0)
  const moneyLifespanSavingsAmount = moneyLifespanCurrentBalance * 0.2
  const moneyLifespanSpendableAmount = Math.max(moneyLifespanCurrentBalance - moneyLifespanSavingsAmount, 0)
  const moneyLifespanDailyAmount = moneyLifespanSpendableAmount / moneyLifespanDaysLeft
  const moneyLifespanStatus = moneyLifespanDailyAmount >= 50
    ? lang === "EN" ? "Comfortable" : "Sempoi"
    : moneyLifespanDailyAmount >= 30
      ? lang === "EN" ? "Be Careful" : "Kena jaga"
      : moneyLifespanDailyAmount >= 20
        ? lang === "EN" ? "Tight Budget" : "Ketat"
        : lang === "EN" ? "Critical Mode" : "Nazak"
  const moneyLifespanStatusClass = moneyLifespanDailyAmount >= 50
    ? "bg-[var(--btn-primary-bg)]/10 text-emerald-500"
    : moneyLifespanDailyAmount >= 30
      ? "bg-amber-500/10 text-amber-500"
      : moneyLifespanDailyAmount >= 20
        ? "bg-orange-500/10 text-orange-400"
        : "bg-rose-500/10 text-rose-500"
  const moneyLifespanDailyDisplay = formatHeroAmount(moneyLifespanDailyAmount, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const moneyLifespanDailyNum = formatHeroNumber(moneyLifespanDailyAmount, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const moneyLifespanSavingsDailyAmount = moneyLifespanSavingsAmount / moneyLifespanDaysLeft
  const moneyLifespanEmergencyDailyDisplay = formatHeroAmount(moneyLifespanSavingsDailyAmount, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const moneyLifespanEmergencyDailyNum = formatHeroNumber(moneyLifespanSavingsDailyAmount, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const moneyLifespanEmergencyMonthDisplay = formatHeroAmount(moneyLifespanSavingsAmount, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const moneyLifespanEmergencyMonthNum = formatHeroNumber(moneyLifespanSavingsAmount, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const moneyLifespanSummaryText = showHeroAmounts
    ? lang === "EN"
      ? `Can last ${moneyLifespanDaysLeft} more days.`
      : `Boleh tahan ${moneyLifespanDaysLeft} hari lagi.`
    : lang === "EN"
      ? "Amounts are hidden."
      : "Nilai disembunyikan."
  const moneyLifespanStatusDisplay = showHeroAmounts ? moneyLifespanStatus : "Private"
  const moneyLifespanStatusDisplayClass = showHeroAmounts
    ? moneyLifespanStatusClass
    : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"

  const moneyLifespanMonthProgress = (() => {
    if (!moneyLifespanCycleBounds) return Math.min(100, Math.max(0, (currentDayInKualaLumpur / Math.max(daysInSelectedMonth, 1)) * 100))
    const start = new Date(`${moneyLifespanCycleBounds.startKey}T00:00:00`)
    const end = new Date(`${moneyLifespanCycleBounds.endKey}T00:00:00`)
    const today = new Date(`${todayKeyForRunway}T00:00:00`)
    const total = Math.max(Math.floor((end.getTime() - start.getTime()) / 86400000) + 1, 1)
    const elapsed = Math.max(Math.floor((today.getTime() - start.getTime()) / 86400000) + 1, 0)
    return Math.min(100, Math.max(0, (elapsed / total) * 100))
  })()
  const moneyLifespanFocusText = showHeroAmounts
    ? lang === "EN"
      ? `Spend around ${moneyLifespanDailyDisplay} daily after setting aside 20% of current balance.`
      : `Bajet belanja ${moneyLifespanDailyDisplay} sehari selepas asingkan 20% baki semasa.`
    : lang === "EN"
      ? "Turn on amounts to see your daily budget."
      : "Aktifkan paparan nilai untuk lihat bajet sehari."

  const moneyLifespanMobileSection = (
    <div className="space-y-3">
      {/* Daily budget card */}
      <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--muted)]">
              {lang === "EN" ? "Daily Budget" : "Bajet Sehari"}
            </p>
            <p className="mt-2 text-xl font-black leading-none tracking-tight text-[var(--text)] tabular-nums">
              {showDataSkeleton ? dashboardAmountSkeleton("h-7 w-28") : showHeroAmounts ? <><span className="text-[0.5em] font-medium mr-1 text-[var(--muted)]">RM</span>{moneyLifespanDailyNum}</> : "RM ••••••"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-[var(--muted)]">
              {lang === "EN" ? "Days Left" : "Hari Lagi"}
            </p>
            <p className="mt-1 text-lg font-black leading-none text-[var(--text)] tabular-nums">
              {showDataSkeleton ? dashboardAmountSkeleton("h-5 w-8") : moneyLifespanDaysLeft}
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-tint)]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              moneyLifespanDailyAmount >= 50 ? "bg-[var(--btn-primary-bg)]" :
              moneyLifespanDailyAmount >= 30 ? "bg-amber-500" :
              moneyLifespanDailyAmount >= 20 ? "bg-orange-500" : "bg-rose-500"
            )}
            style={{ width: `${moneyLifespanMonthProgress}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-[var(--muted)]">
            {moneyLifespanSummaryText}
          </p>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide", moneyLifespanStatusDisplayClass)}>
            {moneyLifespanStatusDisplay}
          </span>
        </div>
      </div>

      {/* Emergency + Savings */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-semibold text-[var(--muted)]">
            {lang === "EN" ? "Emergency / Day" : "Simpan / Hari"}
          </p>
          <p className="mt-2 text-base font-black leading-none text-[var(--text)] tabular-nums">
            {showDataSkeleton ? dashboardAmountSkeleton("h-5 w-20") : showHeroAmounts ? <><span className="text-[0.6em] font-medium mr-0.5 text-[var(--muted)]">RM</span>{moneyLifespanEmergencyDailyNum}</> : "RM ••••••"}
          </p>
        </div>
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-semibold text-[var(--muted)]">
            {lang === "EN" ? "Savings Pot" : "Simpanan Semasa"}
          </p>
          <p className="mt-2 text-base font-black leading-none text-[var(--text)] tabular-nums">
            {showDataSkeleton ? dashboardAmountSkeleton("h-5 w-24") : showHeroAmounts ? <><span className="text-[0.6em] font-medium mr-0.5 text-[var(--muted)]">RM</span>{moneyLifespanEmergencyMonthNum}</> : "RM ••••••"}
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* ─── Support Modal ─── */}
      {supportOpen ? (
 <div className="fixed inset-0 z-[999999] flex items-end justify-center bg-transparent p-0 sm:items-center sm:p-4">
          <div className="flex min-h-screen w-full flex-col bg-[var(--page-bg)] sm:min-h-0 sm:max-h-[min(88vh,680px)] sm:w-full sm:max-w-md sm:overflow-hidden sm:rounded-[24px] sm:border sm:border-purple-500/20 sm:bg-[var(--card)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400">
                  <span className="text-xl">❤️</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">Support</p>
                  <h3 className="text-lg font-bold tracking-tight text-[var(--text)]">
                    {lang === "EN" ? "Support This App" : "Sokong App Ini"}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupportOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-1 flex-col justify-start overflow-y-auto px-5 pb-6 pt-6">
              <p className="text-center text-sm leading-relaxed text-[var(--text)]/85">
                {lang === "EN"
                  ? "If this app helps your daily work, consider giving a small kind support so I can keep this app alive and improving. Thank you so much ❤️"
                  : "Kalau app ini membantu kerja harian anda, anda boleh beri sedikit sokongan ikhlas untuk bantu saya terus hidupkan dan tambah baik app ini. Terima kasih banyak ❤️"}
              </p>
              <div className="mx-auto mt-6 w-full rounded-2xl bg-purple-500/5 p-4 border border-purple-500/10 sm:max-w-[280px]">
                <p className="text-center text-[10px] font-black uppercase tracking-[0.14em] text-purple-400">
                  {lang === "EN" ? "TNG QR" : "QR TNG"}
                </p>
                <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-md">
                  <img
                    src="/assets/images/donate/tng-qr.jpg"
                    alt={lang === "EN" ? "TNG support QR" : "QR sokongan TNG"}
                    className="block h-auto w-full object-contain"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── MOBILE VIEW (md:hidden) ─── */}
      <div className="md:hidden space-y-5 pb-16 text-[0.8125rem]">
        <div className="-mt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
          <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
            {/* Header: weather replaces avatar, name stays */}
            <div className="mb-5 flex items-center justify-between gap-3">
              <WeatherClockMini
                lang={lang}
                title={
                  <h2 className="mt-0.5 min-w-0 truncate text-lg font-bold leading-tight text-[var(--text)]">
                    {displayName}
                  </h2>
                }
              />
              <div className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowBadgeModal(true)}
                  aria-label="Badges"
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all active:scale-90 hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                >
                  <Award size={16} strokeWidth={2} />
                  {unlockedBadges.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] px-1 text-[8px] font-bold text-white">
                      {unlockedBadges.length}
                    </span>
                  )}
                </button>
                <Link
                  href={`/${sessionId}/donate`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#262626] to-[#171717] text-white shadow-lg shadow-purple-500/20 active:scale-90 transition hover:shadow-purple-500/30"
                  aria-label="Donate"
                >
                  <HeartHandshake size={16} strokeWidth={2.4} />
                </Link>
              </div>
            </div>
          </div>

          {/* Balance Hero Card — Modern Fintech Style */}
          <div className="relative px-1">
          <div
            className="balance-hero relative overflow-hidden rounded-[28px] p-6 pb-7"
          >
            {/* Abstract curved layers — deeper navy orbs (mobile-friendly) */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
              <div
                className="absolute -right-16 -top-20 h-64 w-64 rounded-full"
                style={{ background: "linear-gradient(135deg, rgba(21,101,255,0.22), rgba(8,18,44,0.35))", filter: "blur(2px)" }}
              />
              <div
                className="absolute -left-20 top-8 h-56 w-56 rounded-full"
                style={{ background: "linear-gradient(225deg, rgba(13,27,61,0.55), transparent 70%)" }}
              />
              <div
                className="absolute -bottom-24 right-4 h-52 w-72 rounded-[50%] rotate-[-15deg]"
                style={{ background: "linear-gradient(45deg, rgba(10,61,158,0.28), rgba(6,14,32,0.4))" }}
              />
              <div
                className="absolute right-8 top-32 h-20 w-20 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(21,101,255,0.2), transparent 70%)" }}
              />
              <div className="absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/[0.06]" />
              <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-[28px] bg-gradient-to-b from-white/[0.05] to-transparent" />
 <div className="absolute inset-0 rounded-[28px] bg-transparent" />
            </div>

            <div className="relative z-10 flex flex-col text-white">
              {/* Header row — logo top-left, label centered, eye top-right */}
              <div className="relative flex items-center justify-center">
                <img
                  src="/icon-512-v3.png"
                  alt=""
                  aria-hidden="true"
                  className="absolute left-0 h-8 w-8 shrink-0 rounded-full object-cover"
                />
                <p className="text-[0.78rem] font-semibold tracking-wide" style={{ color: "#B8C8D8" }}>
                  {lang === "BM" ? "Jumlah Baki" : "Total Balance"}
                </p>
                <button
                  type="button"
                  onClick={handleToggleHeroAmounts}
                  className="absolute right-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 hover:bg-white/10"
                  style={{ color: "#B8C8D8" }}
                >
                  {showHeroAmounts ? <Eye size={15} strokeWidth={2} /> : <EyeClosed size={15} strokeWidth={2} />}
                </button>
              </div>

              {/* Balance — centered, large, with 3D shadow depth */}
              <div className="pt-1.5 pb-4 text-center">
                <p
                  className={cn("font-bold tracking-tight text-white tabular-nums", mobileHeroBalanceSizeClass)}
                >
                  {showDataSkeleton
                    ? dashboardAmountSkeleton("h-[0.85em] w-[8.5rem] mx-auto")
                    : showHeroAmounts
                      ? <>RM {heroBalanceDisplay}</>
                      : "RM ••••••"}
                </p>
              </div>

              {/* Income & Expense — rounded glass pills with subtle depth */}
              <div className="grid w-full grid-cols-2 gap-2.5">
                <div
                  className="relative overflow-hidden rounded-2xl px-4 py-3 backdrop-blur-md ring-1 ring-white/[0.08]"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 to-transparent" />
                  <div className="relative flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                      <ArrowDownRight size={12} strokeWidth={2.5} className="text-emerald-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.5rem] font-semibold uppercase tracking-wider leading-none mb-1" style={{ color: "#B8C8D8" }}>{t.income}</p>
                      <p className="text-[0.8rem] font-bold tabular-nums text-white leading-none">
                        {showDataSkeleton
                          ? dashboardAmountSkeleton("h-3 w-16")
                          : showHeroAmounts
                            ? <><span className="text-[0.6em] font-medium mr-0.5" style={{ color: "#B8C8D8" }}>RM</span>{formatHeroNumber(filteredIncomeMonth, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</>
                            : "••••••"}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className="relative overflow-hidden rounded-2xl px-4 py-3 backdrop-blur-md ring-1 ring-white/[0.08]"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-400/10 to-transparent" />
                  <div className="relative flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                      <ArrowUpRight size={12} strokeWidth={2.5} className="text-rose-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.5rem] font-semibold uppercase tracking-wider leading-none mb-1" style={{ color: "#B8C8D8" }}>{t.expense}</p>
                      <p className="text-[0.8rem] font-bold tabular-nums text-white leading-none">
                        {showDataSkeleton
                          ? dashboardAmountSkeleton("h-3 w-16")
                          : showHeroAmounts
                            ? <><span className="text-[0.6em] font-medium mr-0.5" style={{ color: "#B8C8D8" }}>RM</span>{formatHeroNumber(filteredExpenseMonth, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</>
                            : "••••••"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

          {/* Wallet deck — primary row + popup sheet for all wallets */}
          {showDataSkeleton ? (
            <div
              className="space-y-1.5 px-1"
              aria-busy="true"
              aria-label={lang === "BM" ? "Memuatkan dompet" : "Loading wallets"}
            >
              {[0, 1].map((i) => walletRowSkeleton(i))}
            </div>
          ) : heroWallets.length > 0 ? (
            <div className="px-1">
              {(() => {
                const primary = heroWallets[0]
                const accent = getDashboardWalletAccent(primary)
                const walletLabel =
                  primary.label || primary.name || (lang === "BM" ? "Dompet" : "Wallet")
                return (
                  <button
                    type="button"
                    onClick={() =>
                      heroWallets.length > 1
                        ? setShowMobileWalletDeck(true)
                        : undefined
                    }
                    className={cn(
                      "relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 text-left shadow-sm transition active:scale-[0.99]",
                      heroWallets.length > 1 && "cursor-pointer",
                    )}
                    style={{
                      background: `linear-gradient(135deg, color-mix(in srgb, ${accent.from} 14%, var(--card)) 0%, color-mix(in srgb, ${accent.to} 7%, var(--card)) 100%)`,
                    }}
                  >
                    
                    <div className="relative flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                        {primary.image_url ? <img src={primary.image_url} alt="" className="h-full w-full object-cover" /> : <Wallet size={16} strokeWidth={2.4} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black tracking-tight text-[var(--text)]">
                          {walletLabel}
                        </p>
                        {heroWallets.length > 1 ? (
                          <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                            {lang === "BM"
                              ? `${heroWallets.length} dompet`
                              : `${heroWallets.length} wallets`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="max-w-[10rem] truncate text-right text-sm font-semibold tabular-nums tracking-tight text-[var(--text)]">
                      {showHeroAmounts ? (
                        <>
                          {formatCurrencyLabel(primary.currency)}{" "}
                          {formatHeroNumber(primary.balance, { minimumFractionDigits: 2 })}
                        </>
                      ) : (
                        "RM ••••••"
                      )}
                    </p>
                  </button>
                )
              })()}

              {heroWallets.length > 1 && (
                <div className="mt-1 flex justify-center">
                  <button
                    type="button"
                    aria-label={lang === "BM" ? "Lihat semua wallet" : "View all wallets"}
                    aria-expanded={showMobileWalletDeck}
                    onClick={() => setShowMobileWalletDeck(true)}
                    className="inline-flex h-8 w-12 items-center justify-center bg-transparent p-0 text-[var(--muted)] shadow-none transition-colors active:text-[var(--text)]"
                  >
                    <span
                      aria-hidden="true"
                      className="relative flex h-7 w-8 flex-col items-center justify-center"
                    >
                      {[0, 1].map((i) => (
                        <span
                          key={i}
                          className="absolute left-1/2 -translate-x-1/2"
                          style={{ top: `${i * 8}px` }}
                        >
                          <svg viewBox="0 0 24 10" className="h-2.5 w-6" fill="none">
                            <path
                              d="M2 2L12 8L22 2"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      ))}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* Vehicle details — below wallets, outside hero */}
          <div className="px-1">
            <DashboardVehicleHeroRow variant="card" className="mt-0" />
          </div>

          {/* Cat playground — slim chip; full arena opens in sheet */}
          <div className="-mt-1 px-1">
            <CatPlayground lang={lang === "BM" ? "BM" : "EN"} userKey={sessionId} compact presentation="chip" />
          </div>

          {/* Charts — monthly + daily side by side */}
          <div className="px-1">
            {showDataSkeleton ? (
              <div className="grid w-full grid-cols-2 gap-3" aria-busy="true">
                {chartMiniSkeleton("m-month")}
                {chartMiniSkeleton("m-day")}
              </div>
            ) : (
            <div className="grid w-full grid-cols-2 gap-3">
              <button type="button" onClick={() => openChartModal("monthly")} className="modern-card modern-card-interactive p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[var(--text)]">{t.monthlyTab}</p>
                  <BarChart2 size={13} className="text-[var(--muted)]" />
                </div>
                <p className="mt-2 text-base font-black tabular-nums text-[var(--text)]">RM {currentMonthExpense.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">7 {lang === "EN" ? "months" : "bulan"}</p>
                <ChartContainer config={{ expense: { label: t.expense, color: "var(--text)" } }} className="mt-3 h-10 w-full">
                  <AreaChart accessibilityLayer data={monthlyAreaChartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <Area dataKey="expense" type="natural" fill="var(--color-expense)" fillOpacity={0.16} stroke="var(--color-expense)" strokeWidth={2.5} dot={false} activeDot={false} />
                  </AreaChart>
                </ChartContainer>
              </button>
              <button type="button" onClick={() => openChartModal("daily")} className="modern-card modern-card-interactive p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[var(--text)]">{t.dailyTab}</p>
                  <BarChart2 size={13} className="text-[var(--muted)]" />
                </div>
                <p className="mt-2 text-base font-black tabular-nums text-[var(--text)]">RM {(currentDailyTrendPoint?.expense ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">7 {lang === "EN" ? "days" : "hari"}</p>
                <ChartContainer config={{ expense: { label: t.expense, color: "var(--muted)" } }} className="mt-3 h-10 w-full">
                  <AreaChart accessibilityLayer data={dailyAreaChartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <Area dataKey="expense" type="natural" fill="var(--color-expense)" fillOpacity={0.16} stroke="var(--color-expense)" strokeWidth={2.5} dot={false} activeDot={false} />
                  </AreaChart>
                </ChartContainer>
              </button>
            </div>
            )}
          </div>

          {/* Features Grid */}
          <div className="px-1">
            <section className="space-y-2">
              <h3 className="px-2 text-sm font-bold text-[var(--text)]">{lang === "EN" ? "Features" : "Ciri"}</h3>
              <div className="grid grid-cols-4 justify-items-center gap-x-2 gap-y-3">
                {(() => {
                  // Keep grey tile background like before; glyph content is full color
                  const tile = isLight ? "#E5E5E5" : "#2A2A2A"
                  return [
                  {
                    href: `/${sessionId}/budget`,
                    label: lang === "BM" ? "Bajet" : "Budget",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <rect x="12" y="14" width="40" height="36" rx="10" fill="#4F46E5" />
                        <rect x="18" y="35" width="5" height="9" rx="2.5" fill={tile} />
                        <rect x="27" y="28" width="5" height="16" rx="2.5" fill="#A5B4FC" />
                        <rect x="36" y="21" width="5" height="23" rx="2.5" fill="#818CF8" />
                        <path d="M17 28.5 26 22l8 4 12-10" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <circle cx="46" cy="16" r="3" fill="#FBBF24" />
                      </svg>
                    ),
                  },
                  {
                    href: `/${sessionId}/categories`,
                    label: lang === "BM" ? "Kategori" : "Categories",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <rect x="12" y="13" width="18" height="18" rx="6" fill="#A78BFA" />
                        <rect x="34" y="13" width="18" height="18" rx="6" fill="#8B5CF6" />
                        <rect x="12" y="35" width="18" height="18" rx="6" fill="#7C3AED" />
                        <rect x="34" y="35" width="18" height="18" rx="6" fill="#6D28D9" />
                        <path d="M39 44h8M43 40v8" stroke="#FBBF24" strokeWidth="2.6" strokeLinecap="round" />
                      </svg>
                    ),
                  },
                  {
                    href: `/${sessionId}/map`,
                    label: "Maps",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <path d="M14 17 25 12v35l-11 5V17Z" fill="#34D399" />
                        <path d="M25 12 39 18v35l-14-6V12Z" fill="#10B981" />
                        <path d="M39 18 50 13v35l-11 5V18Z" fill="#059669" />
                        <path d="M22 31c0-6 4.5-10 10-10s10 4 10 10c0 7-10 16-10 16S22 38 22 31Z" fill="#EF4444" />
                        <circle cx="32" cy="31" r="3.6" fill="#FFFFFF" />
                      </svg>
                    ),
                  },
                  {
                    href: `/${sessionId}/wallet-settings`,
                    label: "Wallet",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <rect x="11" y="18" width="42" height="30" rx="9" fill="#F97316" />
                        <path d="M12 27h40" stroke="#FDBA74" strokeWidth="4" />
                        <rect x="35" y="31" width="18" height="13" rx="5" fill={tile} />
                        <circle cx="43" cy="37.5" r="3" fill="#EA580C" />
                        <path d="M19 15h20c3 0 5 2 5 5H17c0-3 1-5 2-5Z" fill="#FB923C" />
                      </svg>
                    ),
                  },
                  {
                    href: `/${sessionId}/map-analysis`,
                    label: lang === "BM" ? "Maps Analisis" : "Maps Analysis",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <rect x="12" y="13" width="40" height="38" rx="10" fill="#2563EB" />
                        <path d="M18 41 26 32l7 5 12-16" stroke="#93C5FD" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <circle cx="26" cy="32" r="3" fill="#FBBF24" />
                        <circle cx="33" cy="37" r="3" fill="#FBBF24" />
                        <circle cx="45" cy="21" r="3" fill="#FFFFFF" />
                        <path d="M20 20h10" stroke="#BFDBFE" strokeWidth="3" strokeLinecap="round" />
                        <path d="M20 26h6" stroke="#BFDBFE" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    ),
                  },
                  {
                    href: `/${sessionId}/whatsapp`,
                    label: "WhatsApp",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <path d="M16 49.5 18.5 41A18 18 0 1 1 25 47.5L16 49.5Z" fill="#22C55E" />
                        <path d="M32 17.5A14.5 14.5 0 0 0 21.3 41.8l.4.5-1.2 4 4.2-1.1.6.3A14.5 14.5 0 1 0 32 17.5Z" fill="#16A34A" />
                        <path d="M40 36c-.4-.2-2.3-1.1-2.7-1.3-.4-.1-.7-.2-1 .2-.3.4-1 1.3-1.3 1.5-.2.3-.5.3-.9.1-2.4-1.2-3.9-2.2-5.4-4.7-.4-.6.4-.6 1-1.8.1-.3.1-.5 0-.8-.1-.2-.9-2.2-1.3-3.1-.3-.8-.7-.7-1-.8h-.8c-.3 0-.8.1-1.2.5-.4.4-1.5 1.5-1.5 3.7s1.6 4.2 1.8 4.5c.2.3 3.1 4.8 7.7 6.7 2.8 1.1 4.6.8 5.3.1.7-.7.9-2.1.7-2.5-.2-.3-.4-.5-.8-.7Z" fill="#FFFFFF" />
                      </svg>
                    ),
                  },
                  {
                    href: `/${sessionId}/telegram`,
                    label: "Telegram",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <path d="M50 17 43.5 48c-.4 2-1.6 2.5-3.2 1.5l-9-6.6-4.4 4.2c-.5.5-.9.9-1.9.9l.7-9.4 17.2-15.5c.7-.7-.2-1-1.1-.4L20.5 36.1l-9-2.8c-2-.6-2-2 .5-2.9l35.5-13.7c1.7-.6 3.1.4 2.5 2.3Z" fill="#2AABEE" />
                      </svg>
                    ),
                  },
                  {
                    href: `/${sessionId}/debt`,
                    label: lang === "BM" ? "Hutang" : "Debt",
                    icon: (
                      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                        <rect width="64" height="64" rx="18" fill={tile} />
                        <rect x="16" y="9" width="32" height="46" rx="8" fill="#F43F5E" />
                        <rect x="22" y="18" width="20" height="3" rx="1.5" fill="#FECDD3" opacity=".9" />
                        <rect x="22" y="26" width="15" height="3" rx="1.5" fill="#FECDD3" opacity=".75" />
                        <rect x="22" y="34" width="20" height="3" rx="1.5" fill="#FECDD3" opacity=".75" />
                        <circle cx="32" cy="46" r="8" fill={tile} />
                        <path d="M28.5 46 31 48.5 36 43" stroke="#F43F5E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    ),
                  },
                ]
                })().map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex h-[5.8rem] w-full min-w-0 flex-col items-center justify-start gap-2 rounded-[16px] px-0.5 py-1 text-[var(--text)] transition active:scale-[0.95]"
                  >
                    <span className="flex h-[3.6rem] w-[3.6rem] items-center justify-center overflow-hidden rounded-2xl transition group-hover:scale-105 duration-200">
                      {item.icon}
                    </span>
                    <span className="line-clamp-1 max-w-full text-center text-xs font-bold leading-tight text-[var(--text)]">
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          {/* Daily Budget */}
          <div className="px-1">
            {moneyLifespanMobileSection}
          </div>


        {/* Category Comparison */}
        <div className="px-1">
          {topCategoriesSection}
        </div>

        {/* Sidebar stack — same order as desktop: commitments → budget alerts */}
        <div className="space-y-3 px-1">
          <VehicleOverdueWidget />
          <MonthlyChecklistSection />
          {budgetAlertSection}
        </div>
      </div>

      {/* ─── DESKTOP VIEW (hidden md:block) ─── */}
      <div className="hidden md:block space-y-5 pb-12">
        {/* Unified header → summary → runway (side by side, compact) */}
        <section className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
          {/* Header strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
            <WeatherClockMini
              lang={lang}
              title={
                <h1 className="mt-0.5 min-w-0 truncate text-lg font-black tracking-tight text-[var(--text)]">
                  {displayName}
                </h1>
              }
            />

            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAnalyticsMonthDropdown((prev) => !prev)}
                  className="inline-flex h-9 min-w-[148px] items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)]"
                >
                  <span className="truncate">{(dashboardMonthOptions.find((option) => option.key === selectedDashboardMonthKey) ?? dashboardMonthOptions[0])?.label}</span>
                  <ArrowDown size={13} className={cn("text-[var(--muted)] transition-transform", showAnalyticsMonthDropdown ? "rotate-180" : "rotate-0")} />
                </button>
                {showAnalyticsMonthDropdown && (
                  <div className="absolute right-0 top-[calc(100%+0.4rem)] z-20 w-52 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
                    {dashboardMonthOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setSelectedDashboardMonthKey(option.key)
                          setShowAnalyticsMonthDropdown(false)
                        }}
                        className={cn(
                          "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-semibold transition",
                          selectedDashboardMonthKey === option.key
                            ? "bg-[var(--surface-tint-strong)] text-[var(--text)]"
                            : "text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                        )}
                      >
                        <span>{option.label}</span>
                        {selectedDashboardMonthKey === option.key ? <Check size={14} /> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleHeroAmounts}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] transition hover:text-[var(--text)]"
                aria-label={showHeroAmounts ? (lang === "EN" ? "Hide amounts" : "Sembunyi amaun") : (lang === "EN" ? "Show amounts" : "Papar amaun")}
              >
                {showHeroAmounts ? <Eye size={16} /> : <EyeClosed size={16} />}
              </button>

              <button
                type="button"
                onClick={() => setShowBadgeModal(true)}
                aria-label="Badges"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                <Award size={16} strokeWidth={2} />
                {unlockedBadges.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[8px] font-bold text-white">
                    {unlockedBadges.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="accent-solid-btn inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--btn-primary-bg)] px-3 text-xs font-bold transition hover:opacity-90 active:scale-95"
              >
                <HeartHandshake size={13} strokeWidth={2.4} />
                <span>{lang === "EN" ? "Support" : "Sokong"}</span>
              </button>
            </div>
          </div>

          {/* Summary + Runway — same mobile fintech gradient background */}
          <div
            className="balance-hero relative overflow-hidden"
            style={{
              background: "var(--brand-gradient)",
            }}
          >
            {/* Abstract curved layers — same as mobile */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute -right-16 -top-20 h-64 w-64 rounded-full"
                style={{ background: "linear-gradient(135deg, rgba(1,211,225,0.35), rgba(9,99,255,0.15))", filter: "blur(2px)" }}
              />
              <div
                className="absolute -left-20 top-8 h-56 w-56 rounded-full"
                style={{ background: "linear-gradient(225deg, rgba(9,99,255,0.28), transparent 70%)" }}
              />
              <div
                className="absolute -bottom-24 right-4 h-52 w-72 rounded-[50%] rotate-[-15deg]"
                style={{ background: "linear-gradient(45deg, rgba(1,211,225,0.22), rgba(0,26,83,0.12))" }}
              />
              <div
                className="absolute right-8 top-32 h-20 w-20 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(1,211,225,0.35), transparent 70%)" }}
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
              <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.08] to-transparent" />
            </div>

            <div className="relative z-10 grid grid-cols-12 text-white lg:divide-x lg:divide-white/10">
              {/* Left: balance + metrics */}
              <div className="col-span-12 space-y-4 p-5 lg:col-span-7 lg:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-[10px] ring-1 ring-white/15 backdrop-blur-sm"
                        style={{ background: "rgba(255,255,255,0.12)" }}
                      >
                        <Wallet size={12} strokeWidth={2.5} className="text-white" />
                      </div>
                      <p className="balance-hero-label text-[0.65rem] font-semibold tracking-wide text-[#c5d0e0]">
                        {lang === "EN" ? "Total Balance" : "Jumlah Baki"}
                      </p>
                    </div>
                    <p className={cn("mt-3 font-bold tracking-tight text-white tabular-nums leading-none", desktopHeroBalanceSizeClass)}>
                      {showDataSkeleton
                        ? dashboardAmountSkeleton("h-8 w-44 bg-white/15")
                        : showHeroAmounts
                          ? <><span className="balance-hero-label mr-1.5 text-[0.4em] font-medium align-top text-[#c5d0e0]">RM</span>{heroBalanceDisplay}</>
                          : "RM ••••••"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-bold text-white ring-1 ring-white/15"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      {(filteredIncomeMonth - filteredExpenseMonth) >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {showHeroAmounts
                        ? `${(filteredIncomeMonth - filteredExpenseMonth) >= 0 ? "+" : "−"}RM ${Math.abs(filteredIncomeMonth - filteredExpenseMonth).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : "••••"}
                      <span className="balance-hero-label opacity-80">{lang === "EN" ? "net" : "bersih"}</span>
                    </span>
                    <span
                      className="rounded-full px-2.5 py-1 text-[0.65rem] font-semibold text-white ring-1 ring-white/15"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      {wallets.length} {lang === "EN" ? "wallets" : "dompet"}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-1 text-[0.65rem] font-semibold text-white ring-1 ring-white/15"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      {currentMonthTransactions.length} {lang === "EN" ? "txns" : "trx"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div
                    className="relative overflow-hidden rounded-2xl px-3 py-3 backdrop-blur-md ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 to-transparent" />
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                          <ArrowDownRight size={12} strokeWidth={2.5} className="text-emerald-300" />
                        </div>
                        <p className="balance-hero-label text-[0.5rem] font-semibold uppercase tracking-wider text-[#c5d0e0]">{t.income}</p>
                      </div>
                      <p className="mt-2 truncate text-base font-bold tabular-nums leading-none text-white xl:text-lg">
                        {showDataSkeleton
                          ? dashboardAmountSkeleton("h-5 w-20 bg-white/15")
                          : showHeroAmounts
                            ? <><span className="balance-hero-label mr-0.5 text-[0.55em] font-medium text-[#c5d0e0]">RM</span>{formatHeroNumber(filteredIncomeMonth, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</>
                            : "••••"}
                      </p>
                    </div>
                  </div>
                  <div
                    className="relative overflow-hidden rounded-2xl px-3 py-3 backdrop-blur-md ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-400/10 to-transparent" />
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                          <ArrowUpRight size={12} strokeWidth={2.5} className="text-rose-300" />
                        </div>
                        <p className="balance-hero-label text-[0.5rem] font-semibold uppercase tracking-wider text-[#c5d0e0]">{t.expense}</p>
                      </div>
                      <p className="mt-2 truncate text-base font-bold tabular-nums leading-none text-white xl:text-lg">
                        {showDataSkeleton
                          ? dashboardAmountSkeleton("h-5 w-20 bg-white/15")
                          : showHeroAmounts
                            ? <><span className="balance-hero-label mr-0.5 text-[0.55em] font-medium text-[#c5d0e0]">RM</span>{formatHeroNumber(filteredExpenseMonth, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</>
                            : "••••"}
                      </p>
                    </div>
                  </div>
                  <div
                    className="relative overflow-hidden rounded-2xl px-3 py-3 backdrop-blur-md ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 to-transparent" />
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                          <Wallet size={12} strokeWidth={2.5} className="text-cyan-200" />
                        </div>
                        <p className="balance-hero-label text-[0.5rem] font-semibold uppercase tracking-wider text-[#c5d0e0]">
                          {lang === "EN" ? "Safe" : "Selamat"}
                        </p>
                      </div>
                      <p className="mt-2 truncate text-base font-bold tabular-nums leading-none text-white xl:text-lg">
                        {showDataSkeleton
                          ? dashboardAmountSkeleton("h-5 w-20 bg-white/15")
                          : showHeroAmounts
                            ? <><span className="balance-hero-label mr-0.5 text-[0.55em] font-medium text-[#c5d0e0]">RM</span>{formatHeroNumber(stats.safe_balance, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</>
                            : "••••"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: runway health */}
              <div className="col-span-12 space-y-3 border-t border-white/15 p-5 lg:col-span-5 lg:border-t-0 lg:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="balance-hero-label text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#c5d0e0]">
                      {lang === "EN" ? "Runway health" : "Status lifespan"}
                    </p>
                    <p className="balance-hero-label mt-0.5 text-xs font-medium text-[#c5d0e0]/90">
                      {lang === "EN" ? "Until next reset" : "Sampai reset seterusnya"}
                    </p>
                  </div>
                  <span
                    className="rounded-md px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white ring-1 ring-white/20"
                    style={{ background: "rgba(255,255,255,0.14)" }}
                  >
                    {moneyLifespanStatusDisplay}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div
                    className="rounded-2xl px-3 py-2.5 ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <p className="balance-hero-label text-[0.6rem] font-bold uppercase tracking-wider text-[#c5d0e0]">
                      {lang === "EN" ? "Daily budget" : "Bajet sehari"}
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums leading-none text-white">
                      {showDataSkeleton
                        ? dashboardAmountSkeleton("h-5 w-20 bg-white/15")
                        : showHeroAmounts
                          ? <><span className="balance-hero-label mr-0.5 text-[0.55em] font-medium text-[#c5d0e0]">RM</span>{moneyLifespanDailyNum}</>
                          : "••••"}
                      <span className="balance-hero-label ml-1 text-[0.65rem] font-bold text-[#c5d0e0]">/{lang === "EN" ? "day" : "hari"}</span>
                    </p>
                  </div>
                  <div
                    className="rounded-2xl px-3 py-2.5 ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <p className="balance-hero-label text-[0.6rem] font-bold uppercase tracking-wider text-[#c5d0e0]">
                      {lang === "EN" ? "Days left" : "Hari lagi"}
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums leading-none text-white">
                      {showDataSkeleton ? dashboardAmountSkeleton("h-5 w-10 bg-white/15") : moneyLifespanDaysLeft}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.65rem] font-semibold">
                    <span className="balance-hero-label truncate text-[#c5d0e0]">{moneyLifespanSummaryText}</span>
                    <span className="tabular-nums text-white">{Math.round(moneyLifespanMonthProgress)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        moneyLifespanDailyAmount >= 50 ? "bg-cyan-300" :
                        moneyLifespanDailyAmount >= 30 ? "bg-amber-300" :
                        moneyLifespanDailyAmount >= 20 ? "bg-orange-300" : "bg-rose-300"
                      )}
                      style={{ width: `${moneyLifespanMonthProgress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div
                    className="rounded-2xl px-3 py-2 ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <p className="balance-hero-label text-[0.58rem] font-bold uppercase tracking-wider text-[#c5d0e0]">
                      {lang === "EN" ? "Save / day" : "Simpan / hari"}
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-white">
                      {showDataSkeleton
                        ? dashboardAmountSkeleton("h-4 w-16 bg-white/15")
                        : showHeroAmounts
                          ? <><span className="balance-hero-label mr-0.5 text-[0.6em] font-medium text-[#c5d0e0]">RM</span>{moneyLifespanEmergencyDailyNum}</>
                          : "••••"}
                    </p>
                  </div>
                  <div
                    className="rounded-2xl px-3 py-2 ring-1 ring-white/15"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <p className="balance-hero-label text-[0.58rem] font-bold uppercase tracking-wider text-[#c5d0e0]">
                      {lang === "EN" ? "Savings pot" : "Simpanan"}
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-white">
                      {showDataSkeleton
                        ? dashboardAmountSkeleton("h-4 w-16 bg-white/15")
                        : showHeroAmounts
                          ? <><span className="balance-hero-label mr-0.5 text-[0.6em] font-medium text-[#c5d0e0]">RM</span>{moneyLifespanEmergencyMonthNum}</>
                          : "••••"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Main content — full width */}
        <div className="space-y-5">
            {/* Wallet carousel — full width */}
            {walletSummarySection}

            {/* Vehicle details — large desktop showcase */}
            <DashboardVehicleHeroRow variant="card" layout="desktop" className="mt-0" />

            {/* Charts — monthly + daily — full width */}
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">{lang === "EN" ? "Expense Trends" : "Trend Perbelanjaan"}</h3>
                  <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">{lang === "EN" ? "Tap card for full graph" : "Tekan kad untuk graf penuh"}</p>
                </div>
                {!showDataSkeleton && chartView === "monthly" && monthlyExpenseDelta !== null && (
                  <span className={cn("flex items-center gap-1 text-xs font-semibold", monthlyExpenseDelta <= 0 ? (isLight ? "text-emerald-600" : "text-emerald-400") : (isLight ? "text-rose-600" : "text-rose-400"))}>
                    {monthlyExpenseDelta <= 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                    {Math.abs(monthlyExpenseDelta).toFixed(0)}% {monthlyExpenseDelta <= 0 ? t.lessThanLastMonth : t.moreThanLastMonth}
                  </span>
                )}
              </div>
              {showDataSkeleton ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                  {chartMiniSkeleton("d-month")}
                  {chartMiniSkeleton("d-day")}
                  {chartMiniSkeleton("d-net")}
                </div>
              ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <button type="button" onClick={() => openChartModal("monthly")} className="relative overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4 text-left text-[var(--text)] transition active:scale-[0.99] hover:bg-[var(--surface-tint)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[var(--text)]">{t.monthlyTab}</p>
                    <BarChart2 size={14} className="text-[var(--muted)]" />
                  </div>
                  <p className="mt-2 text-xl font-black tabular-nums text-[var(--text)]">RM {currentMonthExpense.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">7 {lang === "EN" ? "months" : "bulan"}</p>
                  <ChartContainer config={{ expense: { label: t.expense, color: "var(--text)" } }} className="mt-3 h-14 w-full">
                    <AreaChart accessibilityLayer data={monthlyAreaChartData} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} hide />
                      <Area dataKey="expense" type="natural" fill="var(--color-expense)" fillOpacity={0.16} stroke="var(--color-expense)" strokeWidth={2.5} dot={false} activeDot={false} />
                    </AreaChart>
                  </ChartContainer>
                </button>
                <button type="button" onClick={() => openChartModal("daily")} className="relative overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4 text-left text-[var(--text)] transition active:scale-[0.99] hover:bg-[var(--surface-tint)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[var(--text)]">{t.dailyTab}</p>
                    <BarChart2 size={14} className="text-[var(--muted)]" />
                  </div>
                  <p className="mt-2 text-xl font-black tabular-nums text-[var(--text)]">RM {(currentDailyTrendPoint?.expense ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">7 {lang === "EN" ? "days" : "hari"}</p>
                  <ChartContainer config={{ expense: { label: t.expense, color: "var(--muted)" } }} className="mt-3 h-14 w-full">
                    <AreaChart accessibilityLayer data={dailyAreaChartData} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} hide />
                      <Area dataKey="expense" type="natural" fill="var(--color-expense)" fillOpacity={0.16} stroke="var(--color-expense)" strokeWidth={2.5} dot={false} activeDot={false} />
                    </AreaChart>
                  </ChartContainer>
                </button>
                <button type="button" onClick={() => openChartModal("monthly")} className="relative overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4 text-left text-[var(--text)] transition active:scale-[0.99] hover:bg-[var(--surface-tint)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[var(--text)]">{lang === "EN" ? "Net" : "Bersih"}</p>
                    <BarChart2 size={14} className="text-[var(--muted)]" />
                  </div>
                  <p className="mt-2 text-xl font-black tabular-nums text-[var(--text)]">
                    {(filteredIncomeMonth - filteredExpenseMonth) >= 0 ? "+" : "−"}RM {Math.abs(filteredIncomeMonth - filteredExpenseMonth).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                    {lang === "EN" ? "Income − expense this month" : "Pendapatan − belanja bulan ini"}
                  </p>
                  <ChartContainer config={{ expense: { label: t.expense, color: "var(--text)" } }} className="mt-3 h-14 w-full">
                    <AreaChart accessibilityLayer data={monthlyAreaChartData} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} hide />
                      <Area dataKey="expense" type="natural" fill="var(--color-expense)" fillOpacity={0.16} stroke="var(--color-expense)" strokeWidth={2.5} dot={false} activeDot={false} />
                    </AreaChart>
                  </ChartContainer>
                </button>
              </div>
              )}
            </div>

            {/* Desktop layout: category · widgets */}
            <div className="grid grid-cols-1 gap-6 items-start xl:grid-cols-3">
              <div className="min-w-0 space-y-6 xl:col-span-2">
                {categoryAnalyticsCard}
              </div>

              <aside className="min-w-0 space-y-3 xl:sticky xl:top-4 xl:self-start">
                <VehicleOverdueWidget />
                <MonthlyChecklistSection />
                {budgetAlertSection}
              </aside>
            </div>
          </div>
      </div>

      
        {showAddModal && (
          <div
            className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-transparent p-0 sm:items-center sm:p-4"
            onClick={() => setShowAddModal(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              data-swipe-sheet
              {...dashboardAddSheetSwipe}
              className="app-sheet-panel app-sheet-panel--lg max-h-[92vh] w-full touch-pan-y flex-col overflow-y-auto overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl sm:max-w-[32rem]"
            >
              <div className="sticky top-0 z-30 mb-3 flex items-center justify-between border-b border-[var(--border)] bg-[var(--sheet-bg)] px-5 py-4 shadow-sm sm:rounded-t-3xl sm:px-6">
                <h3 className="text-base font-black text-[var(--text)]">{t.addNewRecord}</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)] border border-[var(--border)]"
                >
                  <X size={16} />
                </button>
              </div>

              {addSuccess && (
                <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 bg-[var(--btn-primary-bg)]/10 p-3 text-sm font-medium text-emerald-400 sm:mx-6">
                  <Check size={16} /> {t.recordSaved}
                </div>
              )}

              <form onSubmit={handleAddRecord} className="space-y-4 px-5 pb-5 pt-1 sm:px-6 sm:pb-6">
                <div className="grid grid-cols-2 gap-2">
                  {(["expense", "income"] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAddForm(f => ({ ...f, type }))}
                      className={cn(
                        "rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-all sm:text-sm",
                        addForm.type === type
                          ? type === "expense"
                            ? "border border-[#f87171]/30 bg-[#f87171]/20 text-[#f87171]"
                            : "border border-[#34d399]/30 bg-[#34d399]/20 text-[#34d399]"
                          : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--border-strong)]"
                      )}
                    >
                      {type === "expense" ? t.expense : t.income}
                    </button>
                  ))}
                </div>

                {addForm.type === "expense" ? (
                  <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">{lang === "BM" ? "Item" : "Items"}</p>
                        <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">{activeAddItems.length} {lang === "BM" ? "item" : "items"} · RM {addItemsTotal.toFixed(2)}</p>
                      </div>
                      <button type="button" onClick={addAddItem} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text)] px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--bg)] active:scale-95 transition">
                        <Plus size={13} /> {lang === "BM" ? "Tambah" : "Add"}
                      </button>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_4.6rem_4.8rem_2rem] gap-1.5 px-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>{lang === "BM" ? "Nama" : "Item"}</span>
                      <span className="text-center">Qty</span>
                      <span className="text-right">RM</span>
                      <span className="text-right">Total</span>
                      <span />
                    </div>

                    <div className="space-y-1.5">
                      {addItems.map((item, index) => {
                        const quantity = Number.parseFloat(item.quantity || "0") || 0
                        const unitPrice = Number.parseFloat(item.unit_price || "0") || 0
                        const subtotal = Math.max(0, quantity) * Math.max(0, unitPrice)
                        return (
                          <div key={index} className="grid grid-cols-[minmax(0,1fr)_3.2rem_4.6rem_4.8rem_2rem] items-center gap-1.5 border-b border-[var(--border)] pb-1.5 last:border-b-0">
                            <input type="text" value={item.name} onChange={e => updateAddItem(index, "name", e.target.value)} placeholder={lang === "BM" ? "Nama item" : "Item"} className="min-w-0 rounded-xl border border-transparent bg-[var(--surface-tint)] px-2.5 py-2 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none" />
                            <input type="number" min="0" step="0.01" value={item.quantity} onChange={e => updateAddItem(index, "quantity", e.target.value)} placeholder="1" className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-2 py-2 text-center text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none" />
                            <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateAddItem(index, "unit_price", e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-2 py-2 text-right text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none" />
                            <div className="truncate text-right text-xs font-black text-[var(--text)]">{subtotal.toFixed(2)}</div>
                            <button type="button" onClick={() => removeAddItem(index)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-rose-500 active:scale-95" aria-label={lang === "BM" ? "Buang item" : "Remove item"}>
                              <MinusCircle size={16} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{t.description}</label>
                      <input
                        type="text"
                        placeholder={t.descPlaceholder}
                        value={addForm.description}
                        onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                        required={addForm.type === "income"}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{t.amount}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={addForm.amount}
                        onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                        required={addForm.type === "income"}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{t.date}</label>
                  <input
                    type="date"
                    value={addForm.date}
                    onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{t.category}</label>
                  <div className="relative">
                    <select
                      value={addForm.category_id}
                      onChange={(e) => setAddForm({ ...addForm, category_id: e.target.value })}
                      className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] focus:ring-1 focus:ring-[color:var(--text)]/20 sm:text-base focus:outline-none"
                    >
                      <option value="">{t.other}</option>
                      {categories.filter(c => c.kind === addForm.type).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] py-3.5 text-sm font-bold text-[var(--bg)] shadow-lg transition-all active:scale-95 disabled:opacity-60 sm:text-base"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> {t.saveRecord}</>}
                </button>
              </form>
            </div>
          </div>
        )}
      

      
        {showChartModal && (
          <div
            className="fixed inset-0 z-[85] flex touch-none items-end justify-center overflow-hidden bg-transparent px-0 pb-0 pt-0 overscroll-none md:items-center md:px-6 md:py-6"
            onClick={() => setShowChartModal(false)}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="app-sheet-panel app-sheet-panel--xl flex h-[88vh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--card)] shadow-2xl md:h-auto md:max-h-[92vh] md:max-w-5xl"
            >
              <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4 md:px-6">
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.24em] text-[var(--muted)]">{lang === "EN" ? "Full View" : "Paparan Penuh"}</p>
                  <h3 className="mt-1 text-base font-bold text-[var(--text)]">{lang === "EN" ? "Expense Charts" : "Graf Perbelanjaan"}</h3>
                </div>
                <button type="button" onClick={() => setShowChartModal(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]" aria-label="Close chart">
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5"
              onWheel={(event) => event.stopPropagation()}
              onTouchMove={(event) => event.stopPropagation()}>
                <div className="space-y-4">
                  <section className="rounded-2xl border border-[color:var(--border)] bg-[linear-gradient(180deg,var(--card),var(--surface-tint))] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">{t.monthlyTab}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--text)]">{currentYearInTimezone}</p>
                      </div>
                      <div className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-[0.6875rem] font-semibold text-[var(--muted)]">
                        RM {currentMonthExpense.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="h-[220px] md:h-[260px]">
                      {hasFullMonthlyExpenseData ? (
                        <Bar
                          key="modal-monthly-full"
                          data={fullMonthlyExpenseData}
                          options={{
                            maintainAspectRatio: false,
                            responsive: true,
                            interaction: { mode: "index", intersect: false },
                            layout: { padding: { top: 14, left: 0, right: 0, bottom: 0 } },
                            plugins: { legend: { display: false }, tooltip: { enabled: true } },
                            scales: {
                              x: {
                                grid: { display: false },
                                border: { display: false },
                                ticks: { autoSkip: false, color: isLight ? "#667085" : "#6b7194", font: { size: 10, weight: 700 }, maxRotation: 0, minRotation: 0 }
                              },
                              y: {
                                beginAtZero: true,
                                grid: { display: true, color: isLight ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.03)", lineWidth: 1 },
                                border: { display: false },
                                ticks: { display: false }
                              }
                            }
                          }}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center opacity-40">
                          <BarChart2 size={24} className="mb-2 text-[var(--muted)]" />
                          <p className="text-xs font-semibold text-[var(--muted)]">{t.expenseTrendEmpty}</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[color:var(--border)] bg-[linear-gradient(180deg,var(--card),var(--surface-tint))] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">{t.dailyTab}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--text)]">{selectedDailyMonthDate.toLocaleString(lang === "BM" ? "ms-MY" : "en-MY", { month: "long", year: "numeric" })}</p>
                      </div>
                      <div className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-[0.6875rem] font-semibold text-[var(--muted)]">
                        {daysInSelectedMonth} {lang === "EN" ? "days" : "hari"}
                      </div>
                    </div>
                    <div className="balance-trend-chart h-[240px] overflow-x-auto overflow-y-hidden custom-scrollbar md:h-[280px]">
                      {hasFullDailyExpenseData ? (
                        <div className="h-full" style={{ width: `${fullDailyChartWidth}px` }}>
                          <Bar
                            key="modal-daily-full"
                            data={fullDailyExpenseData}
                            options={{
                              maintainAspectRatio: false,
                              responsive: true,
                              interaction: { mode: "index", intersect: false },
                              layout: { padding: { top: 14, left: 0, right: 0, bottom: 0 } },
                              plugins: { legend: { display: false }, tooltip: { enabled: true } },
                              scales: {
                                x: {
                                  grid: { display: false },
                                  border: { display: false },
                                  ticks: { autoSkip: false, color: isLight ? "#667085" : "#9ea6c7", font: { size: 9, weight: 700 }, maxRotation: 0, minRotation: 0 }
                                },
                                y: {
                                  beginAtZero: true,
                                  grid: { display: true, color: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.05)", lineWidth: 1 },
                                  border: { display: false },
                                  ticks: { display: false }
                                }
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center opacity-40">
                          <BarChart2 size={24} className="mb-2 text-[var(--muted)]" />
                          <p className="text-xs font-semibold text-[var(--muted)]">{t.expenseTrendDailyEmpty}</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}
      

      {typeof document !== "undefined" && showMobileWalletDeck && heroWallets.length > 0
        ? createPortal(
                <div
                  key="wallet-sheet"
                  className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-transparent p-0 sm:items-center sm:p-4"
                  onClick={() => setShowMobileWalletDeck(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    data-swipe-sheet
                    {...walletSheetSwipe}
                    className="app-sheet-panel relative z-10 flex max-h-[82vh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl sm:max-w-md sm:rounded-[1.75rem]"
                  >
                    <div className="shrink-0 px-5 pt-3 pb-2">
                      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] sm:hidden" />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                            {lang === "BM" ? "Dompet" : "Wallets"}
                          </p>
                          <h3 className="mt-0.5 text-lg font-black tracking-tight text-[var(--text)]">
                            {lang === "BM" ? "Semua baki" : "All balances"}
                          </h3>
                          <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
                            {heroWallets.length}{" "}
                            {lang === "BM" ? "akaun" : "accounts"} ·{" "}
                            {showHeroAmounts
                              ? `${formatCurrencyLabel("MYR")} ${formatHeroNumber(
                                  heroWallets.reduce((s, w) => s + Number(w.balance || 0), 0),
                                  { minimumFractionDigits: 2 },
                                )}`
                              : "RM ••••••"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMobileWalletDeck(false)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                          aria-label={lang === "BM" ? "Tutup" : "Close"}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
                      {heroWallets.map((wallet, index) => {
                        const accent = getDashboardWalletAccent(wallet)
                        const walletLabel =
                          wallet.label || wallet.name || (lang === "BM" ? "Dompet" : "Wallet")
                        const walletType = walletTypeLabel(wallet.type)
                        return (
                          <div
                            key={`${wallet.id || index}-wallet-sheet-row`}
                            className="relative overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-4"
                            style={{
                              background: `linear-gradient(135deg, color-mix(in srgb, ${accent.from} 14%, var(--card)) 0%, color-mix(in srgb, ${accent.to} 6%, var(--card)) 100%)`,
                            }}
                          >
                            
                            <div className="absolute -right-6 -top-8 h-20 w-20 rounded-full opacity-15 blur-2xl" style={{ backgroundColor: accent.color }} />
                            <div className="relative flex items-center gap-3">
                              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--icon-bg)] text-[var(--icon-fg)]">
                                {wallet.image_url ? <img src={wallet.image_url} alt="" className="h-full w-full object-cover" /> : <Wallet size={17} strokeWidth={2.3} />}
                                {wallet.is_bot_default ? (
                                  <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[0.5rem] font-black leading-none text-white ring-2 ring-[var(--card)]">
                                    B
                                  </span>
                                ) : null}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black tracking-tight text-[var(--text)]">
                                  {walletLabel}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                                  {wallet.name} · {walletType}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                                  {lang === "BM" ? "Baki" : "Balance"}
                                </p>
                                <p className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-[var(--text)]">
                                  {showHeroAmounts ? (
                                    <>
                                      {formatCurrencyLabel(wallet.currency)}{" "}
                                      {formatHeroNumber(wallet.balance, {
                                        minimumFractionDigits: 2,
                                      })}
                                    </>
                                  ) : (
                                    "RM ••••••"
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      <Link
                        href={`/${sessionId}/wallet-settings`}
                        onClick={() => setShowMobileWalletDeck(false)}
                        className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--text)] transition active:scale-[0.99]"
                      >
                        <Wallet size={15} strokeWidth={2.4} />
                        {lang === "BM" ? "Urus dompet" : "Manage wallets"}
                      </Link>
                    </div>
                  </div>
                </div>
            ,
            document.body,
          )
        : null}

      {alertModal}
      <BadgeOverviewModal
        open={showBadgeModal}
        onClose={() => setShowBadgeModal(false)}
        sessionId={sessionId}
        lang={lang}
      />

    </>
  )
}
