"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  FolderTree,
  Loader2,
  Tag,
  Hash,
  TrendingDown,
  TrendingUp,
  ArrowLeft,
  ChevronRight,
} from "lucide-react"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import EmojiPicker, { Theme } from "emoji-picker-react"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { usePageAlert } from "@/hooks/usePageAlert"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"

type Category = {
  id: number
  name: string
  icon_name?: string | null
  kind: "expense" | "income"
  keywordCount: number
  amountMonth?: number
  transactionCountMonth?: number
  status: string
}
type Keyword = { id: number; keyword: string; match_type: string; status: string }
type KeywordsMap = { [categoryId: number]: Keyword[] }

type ModalType = "categoryDetail" | "addCategory" | "editCategory" | "addKeyword" | "editKeyword" | "deleteKeyword" | "archiveCategory" | null

type CategoryIconPickerProps = {
  value: string
  kind: "expense" | "income"
  onChange: (iconName: string) => void
  compact?: boolean
}

type QuickCategoryIcon = { value: string; label: string; labelEn?: string }

const BRAND_QUICK_ICONS: QuickCategoryIcon[] = [
  { value: "brand-shopee", label: "Shopee" },
  { value: "brand-grab", label: "Grab" },
  { value: "brand-tiktok", label: "TikTok" },
  { value: "brand-misi", label: "Misi" },
]

const CATEGORY_QUICK_ICONS: Record<"expense" | "income", QuickCategoryIcon[]> = {
  expense: [
    { value: "utensils-crossed", label: "Makan", labelEn: "Food" },
    { value: "coffee", label: "Cafe", labelEn: "Cafe" },
    { value: "shopping-bag", label: "Beli", labelEn: "Shop" },
    { value: "car-front", label: "Kereta", labelEn: "Car" },
    { value: "bus", label: "Transit", labelEn: "Transit" },
    { value: "house", label: "Rumah", labelEn: "Home" },
    { value: "smartphone", label: "Telco", labelEn: "Telco" },
    { value: "receipt", label: "Bil", labelEn: "Bills" },
    { value: "heart-pulse", label: "Sihat", labelEn: "Health" },
    { value: "graduation-cap", label: "Belajar", labelEn: "Edu" },
    { value: "shirt", label: "Pakaian", labelEn: "Wear" },
    { value: "film", label: "Hiburan", labelEn: "Fun" },
    { value: "plane", label: "Travel", labelEn: "Travel" },
    { value: "wallet", label: "Wallet", labelEn: "Wallet" },
    { value: "tag", label: "Umum", labelEn: "General" },
  ],
  income: [
    { value: "banknote", label: "Gaji", labelEn: "Salary" },
    { value: "briefcase", label: "Kerja", labelEn: "Work" },
    { value: "landmark", label: "Bank", labelEn: "Bank" },
    { value: "coins", label: "Simpan", labelEn: "Saving" },
    { value: "wallet", label: "Wallet", labelEn: "Wallet" },
    { value: "gift", label: "Hadiah", labelEn: "Gift" },
    { value: "receipt", label: "Resit", labelEn: "Receipt" },
    { value: "tag", label: "Umum", labelEn: "General" },
  ],
}

/** Soft red/green only on the emoji/icon box (not card stripes). */
function categoryKindIconShellClass(kind?: Category["kind"]) {
  return kind === "expense"
    ? "border-rose-500/20 bg-rose-500/12 text-rose-500"
    : kind === "income"
      ? "border-emerald-500/20 bg-emerald-500/12 text-emerald-500"
      : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]"
}

function formatCurrencyCompact(value: number) {
  if (!Number.isFinite(value)) return "RM0"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `RM${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `RM${(value / 1_000).toFixed(1)}k`
  return `RM${value.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`
}

function CategoryIconPicker({ value, kind, onChange, compact = false }: CategoryIconPickerProps) {
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const [showFullPicker, setShowFullPicker] = useState(false)
  const isDark = resolvedTheme === "dark"
  const pickerHeight = compact ? "clamp(340px, 54dvh, 460px)" : "clamp(380px, 56dvh, 500px)"
  const compactPickerHeight = "clamp(250px, 38dvh, 340px)"
  const pickerStyle = {
    "--epr-bg-color": "var(--card)",
    "--epr-picker-border-color": "var(--border)",
    "--epr-text-color": "var(--text)",
    "--epr-hover-bg-color": "var(--surface-tint)",
    "--epr-focus-bg-color": "var(--surface-tint-strong)",
    "--epr-highlight-color": "var(--text)",
    "--epr-category-label-bg-color": "var(--card)",
    "--epr-search-input-bg-color": "var(--surface-tint)",
    "--epr-search-input-text-color": "var(--text)",
    "--epr-search-border-color": "var(--border)",
    "--epr-emoji-size": compact ? "clamp(24px, 6.8vw, 32px)" : "30px",
    "--epr-emoji-padding": compact ? "5px" : "6px",
    "--epr-category-navigation-button-size": compact ? "30px" : "34px",
  } as React.CSSProperties
  const copy = lang === "EN"
    ? { selected: "Selected", brand: "Brand", quick: "Quick", more: "More", compact: "Compact", emoji: "Emoji" }
    : { selected: "Dipilih", brand: "Jenama", quick: "Pantas", more: "Lagi", compact: "Ringkas", emoji: "Emoji" }
  const quickIcons = CATEGORY_QUICK_ICONS[kind]
  const getQuickLabel = (item: QuickCategoryIcon) => lang === "EN" ? item.labelEn || item.label : item.label
  const selectedIcon = [
    ...BRAND_QUICK_ICONS,
    ...CATEGORY_QUICK_ICONS.expense,
    ...CATEGORY_QUICK_ICONS.income,
  ].find(item => item.value === value)
  const selectedLabel = selectedIcon ? getQuickLabel(selectedIcon) : copy.emoji

  if (compact) {
    return (
      <div className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-sm">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/35 p-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--card)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]">
            <CategoryIconGlyph iconName={value} categoryName={selectedLabel} kind={kind} size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.5rem] font-bold uppercase tracking-widest text-[var(--muted)]">{copy.selected}</p>
            <p className="truncate text-xs font-medium text-[var(--text)]">{selectedLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowFullPicker(prev => !prev)}
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-[0.5rem] font-bold uppercase tracking-wider text-[var(--muted)] transition-all active:scale-95"
          >
            {showFullPicker ? copy.compact : copy.more}
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[0.5rem] font-bold uppercase tracking-widest text-[var(--muted)]">{copy.brand}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BRAND_QUICK_ICONS.map((item) => {
              const isSelected = value === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onChange(item.value)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-xl border transition-all active:scale-95",
                    isSelected
                      ? "border-[var(--border-strong)] bg-[var(--surface-tint-strong)] text-[var(--text)] shadow-sm"
                      : "border-[var(--border)] bg-[var(--surface-tint)]/35 text-[var(--text-soft)]"
                  )}
                  title={item.label}
                  aria-label={item.label}
                >
                  <CategoryIconGlyph iconName={item.value} categoryName={item.label} kind={kind} size={20} />
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[0.5rem] font-bold uppercase tracking-widest text-[var(--muted)]">{copy.quick}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {quickIcons.map((item) => {
              const isSelected = value === item.value
              const label = getQuickLabel(item)
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onChange(item.value)}
                  className={cn(
                    "flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 transition-all active:scale-95",
                    isSelected
                      ? "border-[var(--border-strong)] bg-[var(--text)] text-[var(--bg)] shadow-sm"
                      : "border-[var(--border)] bg-[var(--surface-tint)]/25 text-[var(--text)]"
                  )}
                  title={label}
                  aria-label={label}
                >
                  <CategoryIconGlyph iconName={item.value} categoryName={label} kind={kind} size={20} />
                  <span className="max-w-full truncate text-[0.4375rem] font-medium leading-none">{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {showFullPicker && (
          <div className="overflow-hidden rounded-xl border border-[var(--border)] [&>aside]:border-none">
            <EmojiPicker
              className="category-emoji-picker"
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              onEmojiClick={(emojiData) => {
                onChange(emojiData.emoji)
                setShowFullPicker(false)
              }}
              width="100%"
              height={compactPickerHeight}
              style={pickerStyle}
              lazyLoadEmojis={false}
              searchDisabled={true}
              skinTonesDisabled={true}
              previewConfig={{ showPreview: false }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl [&>aside]:border-none">
      <div className="border-b border-[var(--border)] bg-[var(--surface-tint)]/25 px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {BRAND_QUICK_ICONS.map((item) => {
            const isSelected = value === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange(item.value)}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-all",
                  isSelected
                    ? "border-[var(--border-strong)] bg-[var(--surface-tint-strong)] text-[var(--text)] shadow-sm"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:bg-[var(--surface-tint)]"
                )}
                title={item.label}
                aria-label={item.label}
              >
                <CategoryIconGlyph iconName={item.value} categoryName={item.label} kind={kind} size={18} />
              </button>
            )
          })}
        </div>
      </div>
      <EmojiPicker
        className="category-emoji-picker"
        theme={isDark ? Theme.DARK : Theme.LIGHT}
        onEmojiClick={(emojiData) => onChange(emojiData.emoji)}
        width="100%"
        height={pickerHeight}
        style={pickerStyle}
        lazyLoadEmojis={false}
        searchDisabled={true}
        skinTonesDisabled={true}
        previewConfig={{ showPreview: false }}
      />
    </div>
  )
}

export default function CategoriesPage() {
  const { t, lang } = useLang()
  const params = useParams()
  const sessionId = params.sessionId as string || ""

  const [categories, setCategories] = useState<Category[]>([])
  const [keywords, setKeywords] = useState<KeywordsMap>({})
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [modal, setModal] = useState<ModalType>(null)
  const [editingKeyword, setEditingKeyword] = useState<Keyword | null>(null)
  const [deletingKeyword, setDeletingKeyword] = useState<Keyword | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const showDataSkeleton = useDelayedSkeleton(loading)
  const { showAlert, alertModal } = usePageAlert(lang)

  const [newCatName, setNewCatName] = useState("")
  const [newCatKind, setNewCatKind] = useState<"expense" | "income">("expense")
  const [newCatIconName, setNewCatIconName] = useState<string>("🏷️")

  const [editCatName, setEditCatName] = useState("")
  const [editCatKind, setEditCatKind] = useState<"expense" | "income">("expense")
  const [editCatIconName, setEditCatIconName] = useState<string>("🏷️")
  const [activeKindTab, setActiveKindTab] = useState<"expense" | "income">("expense")

  const [kwPhrase, setKwPhrase] = useState("")
  const [kwMatchType, setKwMatchType] = useState("contains")
  const [kwPhraseError, setKwPhraseError] = useState("")

  const selectedCategory = categories.find(c => c.id === selectedId) || null
  const selectedKeywords = selectedId != null ? (keywords[selectedId] || []) : []
  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) && c.status !== "archived"
  )
  const sortedFilteredCategories = [...filteredCategories].sort((a, b) => {
    const kindOrder = a.kind === b.kind ? 0 : a.kind === "expense" ? -1 : 1
    if (kindOrder !== 0) return kindOrder
    return a.name.localeCompare(b.name, lang === "EN" ? "en" : "ms", { sensitivity: "base" })
  })
  const tabCategories = sortedFilteredCategories.filter(c => c.kind === activeKindTab)

  const stats = useMemo(() => {
    const active = categories.filter(c => c.status !== "archived")
    const expense = active.filter(c => c.kind === "expense")
    const income = active.filter(c => c.kind === "income")
    const keywordTotal = active.reduce((sum, c) => sum + (c.keywordCount || 0), 0)
    const monthSpend = expense.reduce((sum, c) => sum + (c.amountMonth || 0), 0)
    const monthIncome = income.reduce((sum, c) => sum + (c.amountMonth || 0), 0)
    return {
      total: active.length,
      expenseCount: expense.length,
      incomeCount: income.length,
      keywordTotal,
      monthSpend,
      monthIncome,
    }
  }, [categories])

  const subtitle = lang === "EN"
    ? "Organize expense and income labels for auto-matching"
    : "Urus label belanja dan pendapatan untuk auto-padanan"

  const getMatchTypeLabel = (matchType: string) => {
    if (matchType === "contains") return t.matchContains
    if (matchType === "exact") return t.matchExact
    if (matchType === "startsWith") return t.matchStartsWith
    return matchType
  }

  const keywordNoSpaceAlert = lang === "EN"
    ? "Category keyword cannot contain spaces. Use one word only, for example: grab or pendapatan."
    : "Keyword kategori tak boleh ada ruang (space). Guna satu perkataan sahaja, contoh: grab atau pendapatan."

  function handleKeywordPhraseChange(value: string) {
    setKwPhrase(value)
    if (/\s/.test(value)) {
      setKwPhraseError(keywordNoSpaceAlert)
      return
    }
    setKwPhraseError("")
  }

  function validateKeywordPhraseForSave(): string | null {
    const keyword = kwPhrase.trim()
    if (!keyword) return null
    if (/\s/.test(kwPhrase)) {
      setKwPhraseError(keywordNoSpaceAlert)
      showAlert(
        lang === "EN" ? "Invalid Keyword" : "Keyword Tidak Sah",
        keywordNoSpaceAlert,
        "warning"
      )
      return null
    }
    setKwPhraseError("")
    return keyword
  }

  const fetchCategories = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch("/api/categories", {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      }
    } catch (err) {
      console.error("Fetch categories error:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchKeywords = async (catId: number) => {
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/categories/${catId}/keywords`, {
        credentials: "include",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const data = await res.json()
        setKeywords(prev => ({ ...prev, [catId]: data }))
      }
    } catch (err) {
      console.error("Fetch keywords error:", err)
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    if (selectedId !== null) {
      fetchKeywords(selectedId)
    }
  }, [selectedId])

  function closeModal() {
    setModal(null)
    setEditingKeyword(null)
    setDeletingKeyword(null)
    setKwPhrase("")
    setKwPhraseError("")
    setKwMatchType("contains")
    setNewCatName("")
    setNewCatKind("expense")
    setNewCatIconName("🏷️")
    setEditCatName("")
    setEditCatKind("expense")
    setEditCatIconName("🏷️")
  }

  const { requestClose: requestModalClose } = useOverlayBackClose({
    id: "categories-sheet",
    isOpen: Boolean(modal),
    onClose: closeModal,
  })
  const sheetSwipe = useSwipeDownToClose(requestModalClose)

  useEffect(() => {
    const hidden = Boolean(modal)

    if (hidden) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", {
        detail: { hidden }
      })
    )

    return () => {
      document.body.style.overflow = ""
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", {
          detail: { hidden: false }
        })
      )
    }
  }, [modal])

  async function addCategory() {
    if (!newCatName.trim()) return
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/categories", {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: newCatName.trim(), kind: newCatKind, icon_name: newCatIconName })
      })
      if (res.ok) {
        const data = await res.json()
        setCategories(prev => [...prev, data])
        setSelectedId(data.id)
        setNewCatName("")
        setNewCatKind("expense")
        setNewCatIconName("🏷️")
        setKwPhrase("")
        setKwPhraseError("")
        setKwMatchType("contains")
        setModal("addKeyword")
        showAlert(
          lang === "EN" ? "Continue" : "Teruskan",
          lang === "EN" ? "Category created. Continue by adding keyword." : "Kategori berjaya dibuat. Teruskan dengan tambah keyword.",
          "success"
        )
      } else {
        const errorData = await res.json().catch(() => ({}))
        showAlert(
          lang === "EN" ? "Save Failed" : "Simpan Gagal",
          errorData?.detail || (lang === "EN" ? "Failed to create category." : "Gagal buat kategori."),
          "error"
        )
      }
    } catch (err) {
      console.error(err)
      showAlert(
        lang === "EN" ? "Save Failed" : "Simpan Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to create category." : "Gagal buat kategori."),
        "error"
      )
    }
    setSaving(false)
  }

  async function updateCategory() {
    if (!editCatName.trim() || !selectedCategory) return
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/categories/${selectedCategory.id}`, {
        credentials: "include",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: editCatName.trim(), kind: editCatKind, icon_name: editCatIconName })
      })
      if (res.ok) {
        const data = await res.json()
        setCategories(prev => prev.map(c => c.id === selectedCategory.id ? { ...c, ...data } : c))
        setModal("categoryDetail")
        showAlert(
          lang === "EN" ? "Updated" : "Berjaya Dikemaskini",
          lang === "EN" ? "Category updated successfully." : "Kategori berjaya dikemaskini.",
          "success"
        )
      } else {
        const errorData = await res.json().catch(() => ({}))
        showAlert(
          lang === "EN" ? "Update Failed" : "Kemaskini Gagal",
          errorData?.detail || (lang === "EN" ? "Failed to update category." : "Gagal kemaskini kategori."),
          "error"
        )
      }
    } catch (err) {
      console.error(err)
      showAlert(
        lang === "EN" ? "Update Failed" : "Kemaskini Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to update category." : "Gagal kemaskini kategori."),
        "error"
      )
    }
    setSaving(false)
  }

  function openAddCategory() {
    setNewCatName("")
    setNewCatIconName("🏷️")
    setNewCatKind(activeKindTab)
    setModal("addCategory")
  }

  function openCategoryDetail(categoryId: number) {
    const cat = categories.find(c => c.id === categoryId)
    if (cat) {
      setSelectedId(categoryId)
      setEditCatName(cat.name)
      setEditCatKind(cat.kind)
      setEditCatIconName(cat.icon_name || "🏷️")
      setKwPhrase("")
      setKwPhraseError("")
      setKwMatchType("contains")
      setModal("categoryDetail")
    }
  }

  async function archiveCategory() {
    if (!selectedCategory) return
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/categories/${selectedCategory.id}`, {
        credentials: "include",
        method: "DELETE",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        setCategories(prev => prev.filter(c => c.id !== selectedCategory.id))
        setSelectedId(null)
        setModal(null)
        showAlert(
          lang === "EN" ? "Deleted" : "Berjaya Dipadam",
          lang === "EN" ? "Category deleted successfully." : "Kategori berjaya dipadam.",
          "success"
        )
      } else {
        const errorData = await res.json().catch(() => ({}))
        showAlert(
          lang === "EN" ? "Delete Failed" : "Padam Gagal",
          errorData?.detail || (lang === "EN" ? "Failed to delete category." : "Gagal padam kategori."),
          "error"
        )
      }
    } catch (err) {
      console.error(err)
      showAlert(
        lang === "EN" ? "Delete Failed" : "Padam Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to delete category." : "Gagal padam kategori."),
        "error"
      )
    }
    setSaving(false)
  }

  async function addKeyword() {
    const keyword = validateKeywordPhraseForSave()
    if (!keyword || selectedId == null) return
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/categories/${selectedId}/keywords`, {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ keyword, match_type: kwMatchType })
      })
      if (res.ok) {
        const data = await res.json()
        setKeywords(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] || []), data] }))
        setCategories(prev => prev.map(c => c.id === selectedId ? { ...c, keywordCount: c.keywordCount + 1 } : c))
        setKwPhrase("")
        setKwPhraseError("")
        if (modal === "addKeyword") {
          setModal(null)
        }
        showAlert(
          lang === "EN" ? "Saved" : "Berjaya Disimpan",
          lang === "EN" ? "Keyword added successfully." : "Keyword berjaya ditambah.",
          "success"
        )
      } else {
        const errorData = await res.json().catch(() => ({}))
        showAlert(
          lang === "EN" ? "Save Failed" : "Simpan Gagal",
          errorData.detail || (lang === "EN" ? "Failed to add keyword." : "Gagal tambah keyword."),
          "error"
        )
      }
    } catch (err) {
      console.error(err)
      showAlert(
        lang === "EN" ? "Save Failed" : "Simpan Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to add keyword." : "Gagal tambah keyword."),
        "error"
      )
    }
    setSaving(false)
  }

  function openEditKeyword(kw: Keyword) {
    setEditingKeyword(kw)
    setKwPhrase(kw.keyword)
    setKwPhraseError(/\s/.test(kw.keyword) ? keywordNoSpaceAlert : "")
    setKwMatchType(kw.match_type)
    setModal("editKeyword")
  }

  async function saveEditKeyword() {
    const keyword = validateKeywordPhraseForSave()
    if (!editingKeyword || !keyword || selectedId == null) return
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/keywords/${editingKeyword.id}`, {
        credentials: "include",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ keyword, match_type: kwMatchType })
      })
      if (res.ok) {
        setKeywords(prev => ({
          ...prev,
          [selectedId]: prev[selectedId].map(k => k.id === editingKeyword.id ? { ...k, keyword, match_type: kwMatchType } : k)
        }))
        setEditingKeyword(null)
        setKwPhrase("")
        setKwPhraseError("")
        setModal("categoryDetail")
        showAlert(
          lang === "EN" ? "Updated" : "Berjaya Dikemaskini",
          lang === "EN" ? "Keyword updated successfully." : "Keyword berjaya dikemaskini.",
          "success"
        )
      } else {
        const errorData = await res.json().catch(() => ({}))
        showAlert(
          lang === "EN" ? "Update Failed" : "Kemaskini Gagal",
          errorData.detail || (lang === "EN" ? "Failed to update keyword." : "Gagal kemas kini keyword."),
          "error"
        )
      }
    } catch (err) {
      console.error(err)
      showAlert(
        lang === "EN" ? "Update Failed" : "Kemaskini Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to update keyword." : "Gagal kemas kini keyword."),
        "error"
      )
    }
    setSaving(false)
  }

  function openDeleteKeyword(kw: Keyword) {
    setDeletingKeyword(kw)
    setModal("deleteKeyword")
  }

  async function confirmDeleteKeyword() {
    if (!deletingKeyword || selectedId == null) return
    setSaving(true)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/keywords/${deletingKeyword.id}`, {
        credentials: "include",
        method: "DELETE",
        headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        setKeywords(prev => ({ ...prev, [selectedId]: prev[selectedId].filter(k => k.id !== deletingKeyword.id) }))
        setCategories(prev => prev.map(c => c.id === selectedId ? { ...c, keywordCount: Math.max(0, c.keywordCount - 1) } : c))
        setDeletingKeyword(null)
        setModal("categoryDetail")
        showAlert(
          lang === "EN" ? "Deleted" : "Berjaya Dipadam",
          lang === "EN" ? "Keyword deleted successfully." : "Keyword berjaya dipadam.",
          "success"
        )
      } else {
        const errorData = await res.json().catch(() => ({}))
        showAlert(
          lang === "EN" ? "Delete Failed" : "Padam Gagal",
          errorData?.detail || (lang === "EN" ? "Failed to delete keyword." : "Gagal padam keyword."),
          "error"
        )
      }
    } catch (err) {
      console.error(err)
      showAlert(
        lang === "EN" ? "Delete Failed" : "Padam Gagal",
        err instanceof Error ? err.message : (lang === "EN" ? "Failed to delete keyword." : "Gagal padam keyword."),
        "error"
      )
    }
    setSaving(false)
  }

  const sheetTitle = (() => {
    if (modal === "categoryDetail") return lang === "EN" ? "Edit Category" : "Ubah Kategori"
    if (modal === "addCategory") return t.addCategory
    if (modal === "archiveCategory") return t.archiveCategory
    if (modal === "addKeyword") return t.addKeyword
    if (modal === "editKeyword") return lang === "EN" ? "Edit Keyword" : "Ubah Keyword"
    if (modal === "deleteKeyword") return t.deleteKeyword
    return ""
  })()

  const sheetEyebrow = (() => {
    if (modal === "categoryDetail" || modal === "addCategory") return lang === "EN" ? "Category" : "Kategori"
    if (modal === "archiveCategory" || modal === "deleteKeyword") return lang === "EN" ? "Confirm" : "Sahkan"
    return lang === "EN" ? "Keyword" : "Keyword"
  })()

  const kindFilter = (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/40 p-0.5">
      {(["expense", "income"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => setActiveKindTab(kind)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.12em] transition",
            activeKindTab === kind ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)]",
          )}
        >
          {kind === "expense" ? t.expense : t.income}
          <span className="ml-1 opacity-70">
            ({kind === "expense" ? stats.expenseCount : stats.incomeCount})
          </span>
        </button>
      ))}
    </div>
  )

  const heroBlock = (desktop = false) => (
    <div
      className={cn(
        "categories-hero relative overflow-hidden border border-[var(--border)] bg-[#1a1a1a] text-[#f5f5f5]",
        desktop ? "rounded-[1.75rem] p-6" : "rounded-[2rem] p-5",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.03] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.04] blur-2xl" />

      <div className={cn("relative", desktop && "flex items-center gap-5")}>
        <div className={cn(desktop && "min-w-[9rem] shrink-0")}>
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[#cbd5e1]">
            {lang === "EN" ? "All Categories" : "Semua Kategori"}
          </p>
          <p className="categories-hero-amount mt-2 font-semibold tabular-nums tracking-tight leading-none text-[#ffffff]">
            {showDataSkeleton ? (
              <AmountSkeleton className="h-7 w-16 bg-[rgba(255,255,255,0.12)]" />
            ) : (
              <span className={cn(desktop ? "text-4xl" : "text-[1.85rem]")}>{stats.total}</span>
            )}
          </p>
        </div>

        <div className={cn(
          "grid grid-cols-2 gap-2.5 sm:grid-cols-4",
          desktop ? "min-w-0 flex-1" : "mt-5",
        )}>
          <div className="rounded-[1.15rem] bg-[rgba(255,255,255,0.08)] p-3">
            <div className="flex items-center gap-1.5">
              <TrendingDown size={12} className="text-[#fda4af]" />
              <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#cbd5e1]">{t.expense}</p>
            </div>
            <p className="mt-2 text-sm font-black tabular-nums text-[#fecdd3] md:text-base">
              {showDataSkeleton ? <AmountSkeleton className="h-4 w-8 bg-[rgba(255,255,255,0.12)]" /> : stats.expenseCount}
            </p>
          </div>
          <div className="rounded-[1.15rem] bg-[rgba(255,255,255,0.08)] p-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-[#6ee7b7]" />
              <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#cbd5e1]">{t.income}</p>
            </div>
            <p className="mt-2 text-sm font-black tabular-nums text-[#a7f3d0] md:text-base">
              {showDataSkeleton ? <AmountSkeleton className="h-4 w-8 bg-[rgba(255,255,255,0.12)]" /> : stats.incomeCount}
            </p>
          </div>
          <div className="rounded-[1.15rem] bg-[rgba(255,255,255,0.08)] p-3">
            <div className="flex items-center gap-1.5">
              <Hash size={12} className="text-[#7dd3fc]" />
              <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#cbd5e1]">
                {lang === "EN" ? "Keywords" : "Keyword"}
              </p>
            </div>
            <p className="mt-2 text-sm font-black tabular-nums text-[#bae6fd] md:text-base">
              {showDataSkeleton ? <AmountSkeleton className="h-4 w-8 bg-[rgba(255,255,255,0.12)]" /> : stats.keywordTotal}
            </p>
          </div>
          <div className="rounded-[1.15rem] bg-[rgba(255,255,255,0.08)] p-3">
            <div className="flex items-center gap-1.5">
              <Tag size={12} className={activeKindTab === "expense" ? "text-[#fda4af]" : "text-[#6ee7b7]"} />
              <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-[#cbd5e1]">
                {lang === "EN" ? "This month" : "Bulan ini"}
              </p>
            </div>
            <p
              className={cn(
                "mt-2 truncate",
                activeKindTab === "expense" ? "text-[#fecdd3]" : "text-[#a7f3d0]",
              )}
            >
              {showDataSkeleton ? (
                <AmountSkeleton className="h-4 w-12 bg-[rgba(255,255,255,0.12)]" />
              ) : (
                <MoneyAmount
                  value={activeKindTab === "expense" ? stats.monthSpend : stats.monthIncome}
                  digits={0}
                  size="xs"
                  className={activeKindTab === "expense" ? "text-[#fecdd3]" : "text-[#a7f3d0]"}
                  currencyClassName={activeKindTab === "expense" ? "text-[#fecdd3] opacity-55" : "text-[#a7f3d0] opacity-55"}
                />
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderCategoryCard = (c: Category) => {
    const isExpense = c.kind === "expense"
    const monthAmt = Number(c.amountMonth || 0)
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => openCategoryDetail(c.id)}
        className="group w-full overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] p-3.5 text-left transition active:scale-[0.985] hover:border-[color-mix(in_srgb,var(--accent2)_30%,var(--border))]"
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
              categoryKindIconShellClass(c.kind),
            )}
          >
            <CategoryIconGlyph iconName={c.icon_name} categoryName={c.name} kind={c.kind} size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black leading-tight text-[var(--text)]">{c.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                  {c.keywordCount} {lang === "EN" ? "keyword" : "keyword"}
                  {typeof c.transactionCountMonth === "number" && c.transactionCountMonth > 0
                    ? ` · ${c.transactionCountMonth} ${lang === "EN" ? "txns" : "rekod"}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">
                  {isExpense ? t.expense : t.income}
                </span>
                <ChevronRight size={14} className="text-[var(--muted)] opacity-70" />
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                <Hash size={10} />
                {c.keywordCount}
              </span>
              {monthAmt > 0 && (
                <span className="inline-flex items-center rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[var(--text)]">
                  <MoneyAmount value={monthAmt} digits={0} size="xs" className="text-[var(--text)]" />
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <>
      <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
        {/* ─── Mobile ─── */}
        <div className="space-y-5 md:hidden">
          <MobilePageHeader
            title={t.categories_title}
            fallbackHref={`/${sessionId}`}
            action={
              <MobileIconButton onClick={openAddCategory} label={t.addCategory}>
                <Plus strokeWidth={2.5} />
              </MobileIconButton>
            }
          />

          <section className="px-1">{heroBlock(false)}</section>

          <div className="flex items-center justify-between gap-2 px-1">
            {kindFilter}
          </div>

          <div className="px-1">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                placeholder={t.searchCategory}
                className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <section className="px-1">
            {showDataSkeleton ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)]" />
                ))}
              </div>
            ) : tabCategories.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-12 text-center">
                <FolderTree size={32} className="mx-auto text-[var(--muted)]/40" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                  {searchQuery
                    ? lang === "EN"
                      ? "No matches"
                      : "Tiada padanan"
                    : t.noCategories}
                </p>
                <p className="mt-1 text-[11px] font-medium text-[var(--muted)]/80">
                  {searchQuery
                    ? lang === "EN"
                      ? "Try another search term."
                      : "Cuba kata carian lain."
                    : lang === "EN"
                      ? `Create your first ${activeKindTab} category for auto-matching.`
                      : `Cipta kategori ${activeKindTab === "expense" ? "belanja" : "pendapatan"} pertama untuk auto-padanan.`}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={openAddCategory}
                    className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-95"
                  >
                    <Plus size={14} className="mr-1 inline" />
                    {t.addCategory}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {tabCategories.map(renderCategoryCard)}
                <button
                  type="button"
                  onClick={openAddCategory}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-[1.35rem] border-2 border-dashed border-[var(--border)] bg-[var(--surface-tint)]/20 px-4 py-6 text-[var(--muted)] transition active:scale-[0.98] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-tint)]">
                    <Plus size={20} strokeWidth={2} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider">{t.addCategory}</span>
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ─── Desktop ─── */}
        <div className="hidden md:block">
          <DesktopPageHeader
            title={lang === "EN" ? "Category Board" : "Papan Kategori"}
            actions={
              <DesktopPageAction onClick={openAddCategory}>
                <Plus strokeWidth={2.5} />
                {t.addCategory}
              </DesktopPageAction>
            }
          />

          <DesktopPageBody className="space-y-5">
          {heroBlock(true)}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {kindFilter}
            <div className="relative min-w-[240px] max-w-xs flex-1">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                placeholder={t.searchCategory}
                className="h-10 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div>
            {showDataSkeleton ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]" />
                ))}
              </div>
            ) : tabCategories.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--card)]/70 px-6 text-center">
                <FolderTree size={36} className="text-[var(--muted)]/30" />
                <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                  {searchQuery ? (lang === "EN" ? "No matches" : "Tiada padanan") : t.noCategories}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={openAddCategory}
                    className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--bg)]"
                  >
                    <Plus size={14} className="mr-1.5 inline" />
                    {t.addCategory}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tabCategories.map(renderCategoryCard)}
                <button
                  type="button"
                  onClick={openAddCategory}
                  className="flex min-h-[108px] flex-col items-center justify-center gap-2 rounded-[1.35rem] border-2 border-dashed border-[var(--border)] bg-[var(--surface-tint)]/20 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)] active:scale-[0.98]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-tint)]">
                    <Plus size={20} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider">{t.addCategory}</span>
                </button>
              </div>
            )}
          </div>
          </DesktopPageBody>
        </div>
      </div>

      {mounted && modal
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center"
              onClick={requestModalClose}
              onTouchMove={(e) => e.preventDefault()}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                data-swipe-sheet
                {...sheetSwipe}
                style={{ transform: "translateZ(0)" }}
                data-prevent-pull-refresh="true"
                className={cn(
                  "app-sheet-panel app-sheet-panel--lg max-h-[90dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh]",
                  modal === "categoryDetail" ? "md:max-w-lg" : "md:max-w-md"
                )}
              >
                <div className="app-sheet-panel-header sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-2 pb-3 md:px-6 md:py-4">
                  <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--surface-tint-strong)] md:hidden" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {(modal === "categoryDetail" || modal === "addCategory") && (
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)]",
                          modal === "categoryDetail"
                            ? categoryKindIconShellClass(editCatKind)
                            : categoryKindIconShellClass(newCatKind)
                        )}>
                          <CategoryIconGlyph
                            iconName={modal === "categoryDetail" ? editCatIconName : newCatIconName}
                            categoryName={modal === "categoryDetail" ? editCatName : newCatName}
                            kind={modal === "categoryDetail" ? editCatKind : newCatKind}
                            size={20}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {sheetEyebrow}
                        </p>
                        <h3 className="mt-0.5 truncate text-xl font-black text-[var(--text)]">
                          {sheetTitle}
                        </h3>
                      </div>
                    </div>
                    <button
                      onClick={requestModalClose}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2 text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4 text-[var(--text)] md:px-6 md:py-5">
                  {modal === "categoryDetail" && selectedCategory && (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                            {t.categoryName}
                          </label>
                          <input
                            value={editCatName}
                            onChange={e => setEditCatName(e.target.value)}
                            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-base font-semibold text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)]"
                            placeholder={t.categoryName}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          {(["expense", "income"] as const).map(kind => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setEditCatKind(kind)}
                              className={cn(
                                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95",
                                editCatKind === kind
                                  ? "bg-[var(--text)] text-[var(--bg)]"
                                  : "bg-[var(--surface-tint)] text-[var(--muted)]"
                              )}
                            >
                              {kind === "expense" ? t.expense : t.income}
                            </button>
                          ))}
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                            {t.categoryIcon}
                          </label>
                          <CategoryIconPicker value={editCatIconName} kind={editCatKind} onChange={setEditCatIconName} compact />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">Keyword</p>
                          <span className="rounded-md bg-[var(--surface-tint)] px-2 py-0.5 text-[0.625rem] font-bold tabular-nums text-[var(--muted)]">
                            {selectedKeywords.length}
                          </span>
                        </div>
                        <div className="mb-3 space-y-2">
                          <input
                            value={kwPhrase}
                            onChange={e => handleKeywordPhraseChange(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addKeyword()}
                            placeholder={t.keywordPlaceholder}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium text-[var(--text)] focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <select
                              value={kwMatchType}
                              onChange={e => setKwMatchType(e.target.value)}
                              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-2.5 text-xs font-medium text-[var(--text)] focus:outline-none"
                            >
                              <option value="contains">{t.matchContains}</option>
                              <option value="exact">{t.matchExact}</option>
                              <option value="startsWith">{t.matchStartsWith}</option>
                            </select>
                            <button
                              onClick={addKeyword}
                              disabled={saving || !kwPhrase.trim() || Boolean(kwPhraseError)}
                              className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--text)] px-4 py-2.5 text-xs font-bold text-[var(--bg)] shadow-sm transition-all active:scale-95 disabled:opacity-50"
                            >
                              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                              <span>{t.add}</span>
                            </button>
                          </div>
                        </div>
                        {kwPhraseError && <p className="mb-2 text-xs font-medium text-rose-400">{kwPhraseError}</p>}
                        <div className="max-h-[140px] space-y-1.5 overflow-y-auto scrollbar-hide">
                          {selectedKeywords.length > 0 ? selectedKeywords.map(kw => (
                            <div key={kw.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-[var(--card)] p-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-[var(--text)]">{kw.keyword}</p>
                                <p className="text-[0.5rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-60">
                                  {getMatchTypeLabel(kw.match_type)}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button onClick={() => openEditKeyword(kw)} className="rounded-lg p-1.5 text-[var(--muted)] transition-all hover:bg-[var(--surface-tint)] active:scale-90">
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => openDeleteKeyword(kw)} className="rounded-lg p-1.5 text-rose-400 transition-all hover:bg-rose-500/10 active:scale-90">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          )) : (
                            <p className="py-6 text-center text-xs text-[var(--muted)] opacity-50">{t.noKeywords}</p>
                          )}
                        </div>
                      </div>

                      <div className="-mx-4 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-4 md:-mx-6 md:px-6">
                        <button
                          onClick={updateCategory}
                          disabled={saving || !editCatName.trim()}
                          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          {t.saveChanges}
                        </button>
                        <button
                          onClick={() => setModal("archiveCategory")}
                          className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 text-sm font-black text-rose-500 transition active:scale-[0.98]"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}

                  {modal === "addCategory" && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                          {t.categoryName}
                        </label>
                        <input
                          type="text"
                          placeholder={t.exampleCategoryName}
                          value={newCatName}
                          onChange={e => setNewCatName(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-medium text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {(["expense", "income"] as const).map(kind => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setNewCatKind(kind)}
                            className={cn(
                              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95",
                              newCatKind === kind
                                ? "bg-[var(--text)] text-[var(--bg)]"
                                : "bg-[var(--surface-tint)] text-[var(--muted)]"
                            )}
                          >
                            {kind === "expense" ? t.expense : t.income}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                          {t.categoryIcon}
                        </label>
                        <CategoryIconPicker value={newCatIconName} kind={newCatKind} onChange={setNewCatIconName} compact />
                      </div>
                      <div className="-mx-4 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-4 md:-mx-6 md:px-6">
                        <button
                          onClick={addCategory}
                          disabled={!newCatName.trim() || saving}
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          {lang === "EN" ? "Create" : "Cipta"}
                        </button>
                      </div>
                    </>
                  )}

                  {modal === "archiveCategory" && (
                    <>
                      <p className="text-sm leading-relaxed text-[var(--muted)]">{t.archiveDesc}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setModal("categoryDetail")}
                          className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
                        >
                          {t.cancel}
                        </button>
                        <button
                          onClick={archiveCategory}
                          disabled={saving}
                          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-500 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : t.delete}
                        </button>
                      </div>
                    </>
                  )}

                  {modal === "addKeyword" && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                          {t.phrase}
                        </label>
                        <input
                          type="text"
                          value={kwPhrase}
                          onChange={e => handleKeywordPhraseChange(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-medium text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)]"
                        />
                        {kwPhraseError && <p className="mt-2 text-xs font-medium text-rose-400">{kwPhraseError}</p>}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                          {t.type}
                        </label>
                        <select
                          value={kwMatchType}
                          onChange={e => setKwMatchType(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-medium text-[var(--text)] focus:outline-none"
                        >
                          <option value="contains">{t.matchContains}</option>
                          <option value="exact">{t.matchExact}</option>
                          <option value="startsWith">{t.matchStartsWith}</option>
                        </select>
                      </div>
                      <div className="-mx-4 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-4 md:-mx-6 md:px-6">
                        <button
                          onClick={addKeyword}
                          disabled={!kwPhrase.trim() || saving || Boolean(kwPhraseError)}
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          {lang === "EN" ? "Save" : "Simpan"}
                        </button>
                      </div>
                    </>
                  )}

                  {modal === "editKeyword" && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                          {t.phrase}
                        </label>
                        <input
                          type="text"
                          value={kwPhrase}
                          onChange={e => handleKeywordPhraseChange(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-medium text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)]"
                        />
                        {kwPhraseError && <p className="mt-2 text-xs font-medium text-rose-400">{kwPhraseError}</p>}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                          {t.type}
                        </label>
                        <select
                          value={kwMatchType}
                          onChange={e => setKwMatchType(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-medium text-[var(--text)] focus:outline-none"
                        >
                          <option value="contains">{t.matchContains}</option>
                          <option value="exact">{t.matchExact}</option>
                          <option value="startsWith">{t.matchStartsWith}</option>
                        </select>
                      </div>
                      <div className="-mx-4 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-4 md:-mx-6 md:px-6">
                        <button
                          onClick={saveEditKeyword}
                          disabled={!kwPhrase.trim() || saving || Boolean(kwPhraseError)}
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          {t.saveChanges}
                        </button>
                      </div>
                    </>
                  )}

                  {modal === "deleteKeyword" && (
                    <>
                      <p className="text-sm leading-relaxed text-[var(--muted)]">{t.deleteKeywordDesc}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setModal("categoryDetail")}
                          className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
                        >
                          {t.cancel}
                        </button>
                        <button
                          onClick={confirmDeleteKeyword}
                          disabled={saving}
                          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-500 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : t.delete}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {alertModal}
    </>
  )
}
