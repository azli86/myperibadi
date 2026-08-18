"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Pencil,
  X,
  Check,
  FolderTree,
  Loader2,
  Tag,
  Hash,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  GripVertical,
  MoveUp,
  MoveDown,
  Upload,
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
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
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
  system_code?: string | null
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
  const { resolvedTheme } = useTheme()
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

  // Group-name modal
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState("")

  // UI-only drag reorder + custom-named groups (persisted to backend)
  type Group = { id: string; name: string; members: number[] }
  const [groups, setGroups] = useState<Group[]>([])
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set())
  const toggleGroupCollapsed = (id: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [order, setOrder] = useState<number[] | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

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

  // Build ordered flat list honoring UI-only drag reorder + parent nesting.
  const activeTabIds = useMemo(
    () => new Set(tabCategories.map((c) => c.id)),
    [tabCategories],
  )
  const renderIds = useMemo(() => {
    if (order) {
      const kept = order.filter((id) => activeTabIds.has(id))
      const rest = tabCategories.map((c) => c.id).filter((id) => !kept.includes(id))
      return [...kept, ...rest]
    }
    return tabCategories.map((c) => c.id)
  }, [order, tabCategories, activeTabIds])

  const catById = useMemo(() => {
    const m = new Map<number, Category>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  // Members of any group (for this tab only)
  const memberIds = useMemo(() => {
    const s = new Set<number>()
    for (const g of groups) for (const m of g.members) if (activeTabIds.has(m)) s.add(m)
    return s
  }, [groups, activeTabIds])

  // Standalone (top-level) categories, ordered
  const standaloneIds = renderIds.filter((id) => !memberIds.has(id))

  // Groups visible in this tab (contain at least one member in this tab or any)
  const visibleGroups = useMemo(
    () => groups.filter((g) => g.members.some((m) => activeTabIds.has(m)) || g.members.length === 0),
    [groups, activeTabIds],
  )
  const orderedGroups = visibleGroups

  // member list for a group, ordered by renderIds
  const orderedMembers = (g: Group): number[] =>
    g.members
      .filter((m) => activeTabIds.has(m))
      .sort((a, b) => renderIds.indexOf(a) - renderIds.indexOf(b))

  // All categories not in any group get standalone cards (plus groups as blocks).
  const standaloneEntries: { id: number; c: Category }[] = standaloneIds
    .map((id) => ({ id, c: catById.get(id) }))
    .filter((e): e is { id: number; c: Category } => !!e.c)

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

  // Load UI-only arrangement (order + parent nesting) from backend.
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const token = getAccessToken()
        const headers: HeadersInit =
          token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch("/api/categories/layout", {
          credentials: "include",
          headers,
          cache: "no-store",
        })
        if (res.ok) {
          const json = await res.json()
          const data = (json && typeof json.data === "string" && JSON.parse(json.data)) || {}
          if (!cancelled) {
            if (Array.isArray(data.order) && data.order.length) setOrder(data.order)
            if (Array.isArray(data.groups)) setGroups(data.groups)
          }
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Persist arrangement to backend (debounced).
  useEffect(() => {
    if (!sessionId || (order === null && groups.length === 0)) return
    const t = setTimeout(() => {
      const token = getAccessToken()
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}),
      }
      void fetch("/api/categories/layout", {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ data: JSON.stringify({ order, groups }) }),
      })
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, groups, sessionId])

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
  const { requestClose: requestGroupClose } = useOverlayBackClose({
    id: "group-name-sheet",
    isOpen: groupModalOpen,
    onClose: () => setGroupModalOpen(false),
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

  async function uploadCategoryIcon(file: File, onChange: (url: string) => void) {
    if (file.size > 256 * 1024) {
      showAlert(lang === "EN" ? "File too large" : "Fail terlalu besar", lang === "EN" ? "Maximum icon size is 256 KB." : "Saiz maksimum ikon ialah 256 KB.", "error")
      return
    }
    const form = new FormData()
    form.append("file", file)
    const token = getAccessToken()
    const res = await fetch("/api/categories/icon-upload", { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showAlert(lang === "EN" ? "Upload failed" : "Upload gagal", data.detail || "Upload failed.", "error")
      return
    }
    onChange(data.url)
  }

  const IconUpload = ({ onChange }: { onChange: (url: string) => void }) => (
    <label className="mt-3 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-tint)] text-xs font-bold text-[var(--muted)]">
      <Upload size={14} /> {lang === "EN" ? "Upload icon (max 256 KB)" : "Upload ikon (maks 256 KB)"}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadCategoryIcon(file, onChange); e.target.value = "" }} />
    </label>
  )

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

  const kindTabs = (
    <>
      {/* Mobile: minimal toggle */}
      <div className="flex w-full gap-1 rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)] p-1 md:hidden">
        {(["expense", "income"] as const).map((kind) => {
          const active = activeKindTab === kind
          const count = kind === "expense" ? stats.expenseCount : stats.incomeCount
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveKindTab(kind)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition active:scale-[0.98]",
                active
                  ? kind === "expense"
                    ? "bg-rose-500/15 text-rose-500"
                    : "bg-emerald-500/15 text-emerald-500"
                  : "text-[var(--muted)]"
              )}
            >
              {kind === "expense" ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
              {kind === "expense" ? t.expense : t.income}
              <span className="text-[0.625rem] font-medium opacity-60">{count}</span>
            </button>
          )
        })}
      </div>
      {/* Desktop: summary cards */}
      <div
        role="tablist"
        aria-label={lang === "EN" ? "Category type" : "Jenis kategori"}
        className="hidden w-full gap-2 md:flex"
      >
      {(["expense", "income"] as const).map((kind) => {
        const active = activeKindTab === kind
        const count = kind === "expense" ? stats.expenseCount : stats.incomeCount
        const amount = kind === "expense" ? stats.monthSpend : stats.monthIncome
        const Icon = kind === "expense" ? TrendingDown : TrendingUp
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveKindTab(kind)}
            className={cn(
              "flex-1 rounded-[var(--card-radius-lg)] border p-3 text-left transition active:scale-[0.98] md:p-4",
              active
                ? kind === "expense"
                  ? "border-rose-500/40 bg-rose-500/[0.08]"
                  : "border-emerald-500/40 bg-emerald-500/[0.08]"
                : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon
                size={14}
                className={cn(
                  kind === "expense" ? "text-rose-500" : "text-emerald-500",
                  !active && "opacity-60",
                )}
              />
              <span className={cn(
                "text-[0.625rem] font-black uppercase tracking-[0.14em]",
                active ? "text-[var(--text)]" : "text-[var(--muted)]",
              )}>
                {kind === "expense" ? t.expense : t.income}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              {showDataSkeleton ? (
                <AmountSkeleton className="h-6 w-8" />
              ) : (
                <span className="text-xl font-black tabular-nums leading-none text-[var(--text)] md:text-2xl">{count}</span>
              )}
              <span className="text-[0.625rem] font-bold text-[var(--muted)]">
                {lang === "EN" ? "categories" : "kategori"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[var(--muted)]">
              <span className="text-[0.625rem] font-semibold">{lang === "EN" ? "This month" : "Bulan ini"}</span>
              {showDataSkeleton ? (
                <AmountSkeleton className="h-3 w-12" />
              ) : (
                <MoneyAmount value={amount} digits={0} size="xs" className="text-[var(--muted)]" />
              )}
            </div>
          </button>
        )
      })}
      </div>
    </>
  )

  const searchField = (
    <div className="relative w-full">
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
      <input
        type="search"
        placeholder={t.searchCategory}
        aria-label={t.searchCategory}
        className="h-11 w-full rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)] pl-10 pr-9 text-sm font-semibold text-[var(--text)] outline-none transition placeholder:font-medium placeholder:text-[var(--muted)]/60 focus:border-[var(--border-strong)] md:h-10"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          aria-label={lang === "EN" ? "Clear search" : "Kosongkan carian"}
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-[var(--surface-tint)] text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )

  const summaryStrip = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
      <span className="inline-flex items-center gap-1.5">
        <FolderTree size={12} />
        {showDataSkeleton ? "—" : stats.total} {lang === "EN" ? "total" : "jumlah"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Hash size={12} />
        {showDataSkeleton ? "—" : stats.keywordTotal} {lang === "EN" ? "keywords" : "keyword"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Tag size={12} />
        {tabCategories.length} {lang === "EN" ? "shown" : "dipapar"}
      </span>
    </div>
  )

  const emptyState = (
    <div className="flex flex-col items-center justify-center rounded-[var(--card-radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--surface-tint)]">
        <FolderTree size={26} className="text-[var(--muted)]" />
      </div>
      <p className="mt-4 text-sm font-black text-[var(--text)]">
        {searchQuery ? (lang === "EN" ? "No matches" : "Tiada padanan") : t.noCategories}
      </p>
      <p className="mt-1.5 max-w-xs text-xs font-medium leading-relaxed text-[var(--muted)]">
        {searchQuery
          ? lang === "EN"
            ? "Try another search term."
            : "Cuba kata carian lain."
          : lang === "EN"
            ? `Create your first ${activeKindTab} category for auto-matching.`
            : `Cipta kategori ${activeKindTab === "expense" ? "belanja" : "pendapatan"} pertama untuk auto-padanan.`}
      </p>
      <button
        type="button"
        onClick={searchQuery ? () => setSearchQuery("") : openAddCategory}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--text)] px-4 py-2 text-[0.625rem] font-black uppercase tracking-[0.12em] text-[var(--bg)] transition active:scale-95"
      >
        {searchQuery ? (
          <>
            <X size={13} strokeWidth={3} />
            {lang === "EN" ? "Clear search" : "Kosongkan carian"}
          </>
        ) : (
          <>
            <Plus size={13} strokeWidth={3} />
            {t.addCategory}
          </>
        )}
      </button>
    </div>
  )

  const addCategoryTile = (
    <button
      type="button"
      onClick={openAddCategory}
      className="flex items-center justify-center gap-2 rounded-[var(--card-radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-4 py-3.5 text-[var(--muted)] transition active:scale-[0.98] hover:border-[var(--border-strong)] hover:text-[var(--text)] md:min-h-[5.25rem] md:py-4"
    >
      <Plus size={16} strokeWidth={2.5} />
      <span className="text-[0.625rem] font-black uppercase tracking-[0.14em]">{t.addCategory}</span>
    </button>
  )

  const moveItem = (id: number, dir: -1 | 1) => {
    setOrder((prev) => {
      const base = prev || renderIds
      const arr = [...base]
      const idx = arr.indexOf(id)
      if (idx < 0) return arr
      const target = idx + dir
      if (target < 0 || target >= arr.length) return arr
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return arr
    })
  }

  const addToGroup = (groupId: string, catId: number) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, members: g.members.includes(catId) ? g.members : [...g.members, catId] }
          : { ...g, members: g.members.filter((m) => m !== catId) },
      ),
    )
  }

  const removeFromGroup = (groupId: string, catId: number) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, members: g.members.filter((m) => m !== catId) } : g)),
    )
  }

  const moveMember = (groupId: string, catId: number, dir: -1 | 1) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        const arr = [...g.members]
        const i = arr.indexOf(catId)
        const t = i + dir
        if (i < 0 || t < 0 || t >= arr.length) return g
        ;[arr[i], arr[t]] = [arr[t], arr[i]]
        return { ...g, members: arr }
      }),
    )
  }

  const moveGroup = (groupId: string, dir: -1 | 1) => {
    setGroups((prev) => {
      const arr = [...prev]
      const i = arr.findIndex((g) => g.id === groupId)
      const t = i + dir
      if (i < 0 || t < 0 || t >= arr.length) return arr
      ;[arr[i], arr[t]] = [arr[t], arr[i]]
      return arr
    })
  }

  const openCreateGroup = () => {
    setEditingGroupId(null)
    setGroupName("")
    setGroupModalOpen(true)
  }

  const openRenameGroup = (g: Group) => {
    setEditingGroupId(g.id)
    setGroupName(g.name)
    setGroupModalOpen(true)
  }

  const saveGroup = () => {
    const name = groupName.trim()
    if (!name) return
    if (editingGroupId) {
      setGroups((prev) => prev.map((g) => (g.id === editingGroupId ? { ...g, name } : g)))
    } else {
      setGroups((prev) => [...prev, { id: `g${Date.now()}`, name, members: [] }])
    }
    setGroupModalOpen(false)
  }

  const renderStandaloneCard = (id: number, c: Category) => {
    const isDragging = dragId === id
    const isDropTarget = dropTargetId === String(id) && !isDragging
    return (
      <div
        key={`cat-${id}`}
        draggable
        onDragStart={(e) => {
          setDragId(id)
          e.dataTransfer.effectAllowed = "move"
          try {
            e.dataTransfer.setData("text/plain", String(id))
          } catch {
            /* ignore */
          }
        }}
        onDragEnd={() => {
          setDragId(null)
          setDropTargetId(null)
        }}
        onDragOver={(e) => {
          if (dragId === null || dragId === id) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          setDropTargetId(String(id))
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetId(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragId(null)
          setDropTargetId(null)
        }}
        className={cn(
          "flex items-stretch gap-2 rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)] transition",
          isDragging && "opacity-40",
          isDropTarget && "border-[var(--accent2)] ring-2 ring-[var(--accent2)]/30",
        )}
      >
        <span
          aria-hidden
          className="flex w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center text-[var(--muted)]/60 active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </span>
        <button
          type="button"
          onClick={() => openCategoryDetail(id)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left active:scale-[0.99]"
        >
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              c.kind === "expense" ? "bg-rose-500" : c.kind === "income" ? "bg-emerald-500" : "bg-[var(--muted)]",
            )}
          />
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] text-[var(--text)]">
            <CategoryIconGlyph iconName={c.icon_name} categoryName={c.name} kind={c.kind} size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight text-[var(--text)]">{c.name}</p>
          </div>
          <ChevronRight size={15} className="shrink-0 text-[var(--muted)] opacity-50" />
        </button>
        <span className="flex shrink-0 flex-col justify-center gap-0.5 pr-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              moveItem(id, -1)
            }}
            aria-label={lang === "EN" ? "Move up" : "Naik"}
            className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
          >
            <MoveUp size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              moveItem(id, 1)
            }}
            aria-label={lang === "EN" ? "Move down" : "Turun"}
            className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
          >
            <MoveDown size={13} />
          </button>
        </span>
      </div>
    )
  }

  const renderMemberCard = (g: Group, id: number, c: Category) => (
    <div key={`mem-${id}`} className="flex items-stretch gap-2 rounded-xl border border-[var(--border)]/60 bg-[var(--card)]">
      <button
        type="button"
        onClick={() => openCategoryDetail(id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2.5 pr-2 text-left active:scale-[0.99]"
      >
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            c.kind === "expense" ? "bg-rose-500" : c.kind === "income" ? "bg-emerald-500" : "bg-[var(--muted)]",
          )}
        />
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--text)]">
          <CategoryIconGlyph iconName={c.icon_name} categoryName={c.name} kind={c.kind} size={15} />
        </div>
        <p className="truncate text-sm font-medium leading-tight text-[var(--text)]">{c.name}</p>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeFromGroup(g.id, id)
        }}
        aria-label={lang === "EN" ? "Remove from group" : "Buang dari kumpulan"}
        title={lang === "EN" ? "Remove from group" : "Buang dari kumpulan"}
        className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-rose-500"
      >
        <X size={13} />
      </button>
    </div>
  )

  const renderGroupCard = (g: Group) => {
    const members = orderedMembers(g).map((m) => catById.get(m)).filter((cc): cc is Category => !!cc)
    const isDropTarget = dropTargetId === `g:${g.id}`
    const collapsed = !collapsedGroupIds.has(g.id)
    return (
      <div
        key={g.id}
        onDragOver={(e) => {
          if (dragId === null) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          setDropTargetId(`g:${g.id}`)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetId(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragId !== null) addToGroup(g.id, dragId)
          setDragId(null)
          setDropTargetId(null)
        }}
        className={cn(
          "rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-2 transition",
          isDropTarget && "border-[var(--accent2)] ring-2 ring-[var(--accent2)]/30",
        )}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleGroupCollapsed(g.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              toggleGroupCollapsed(g.id)
            }
          }}
          aria-expanded={!collapsed}
          className="flex cursor-pointer items-center gap-2 px-1 py-1"
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
            <FolderTree size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.72rem] font-black uppercase tracking-[0.08em] text-[var(--text)]">{g.name}</p>
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--muted)]">
              {members.length} {lang === "EN" ? "categories" : "kategori"}
            </p>
          </div>
          <ChevronRight
            size={16}
            className={cn(
              "shrink-0 text-[var(--muted)] transition-transform duration-200",
              collapsed ? "rotate-90" : "",
            )}
          />
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openRenameGroup(g) }}
              aria-label={lang === "EN" ? "Rename group" : "Tukar nama kumpulan"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); moveGroup(g.id, -1) }}
              aria-label={lang === "EN" ? "Move group up" : "Naik"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
            >
              <MoveUp size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); moveGroup(g.id, 1) }}
              aria-label={lang === "EN" ? "Move group down" : "Turun"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
            >
              <MoveDown size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(lang === "EN" ? `Delete group "${g.name}"?` : `Padam kumpulan "${g.name}"?`)) {
                  setGroups((prev) => prev.filter((x) => x.id !== g.id))
                }
              }}
              aria-label={lang === "EN" ? "Delete group" : "Padam kumpulan"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-rose-500"
            >
              <Trash2 size={13} />
            </button>
          </span>
        </div>
        {!collapsed && (members.length > 0 ? (
          <div className="mt-1 space-y-1.5">
            {members.map((c) => renderMemberCard(g, c.id, c))}
          </div>
        ) : (
          <p className="mt-1 rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-center text-[0.6rem] font-semibold text-[var(--muted)]">
            {lang === "EN" ? "Drag categories here" : "Seret kategori ke sini"}
          </p>
        ))}
      </div>
    )
  }

  const listBody = showDataSkeleton ? (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[4.75rem] animate-pulse rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)]" />
      ))}
    </div>
  ) : tabCategories.length === 0 ? (
    emptyState
  ) : (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[0.6rem] font-semibold text-[var(--muted)]">
        <GripVertical size={12} />
        {lang === "EN"
          ? "Create a group, then drag categories into its card to organize."
          : "Buat kumpulan, kemudian seret kategori masuk ke dalam kad untuk susun."}
      </p>
      <button
        type="button"
        onClick={openCreateGroup}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-4 py-2.5 text-[0.625rem] font-black uppercase tracking-[0.14em] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      >
        <Plus size={14} />
        {lang === "EN" ? "Create Group" : "Buat Group"}
      </button>
      <div className="space-y-2">
        {orderedGroups.map((g) => renderGroupCard(g))}
        {standaloneEntries.map((e, idx) => {
          const strip = dragId !== null && dragId !== e.id ? (
            <div
              key={`strip-${e.id}`}
              onDragOver={(e2) => {
                if (dragId === null) return
                e2.preventDefault()
                e2.dataTransfer.dropEffect = "move"
              }}
              onDrop={(e2) => {
                e2.preventDefault()
                if (dragId === null) return
                const from = dragId
                setOrder((prev) => {
                  const base = prev || renderIds
                  const arr = [...base]
                  const fromIdx = arr.indexOf(from)
                  if (fromIdx >= 0) arr.splice(fromIdx, 1)
                  arr.splice(idx, 0, from)
                  return arr
                })
                setDragId(null)
                setDropTargetId(null)
              }}
              className="h-1.5 rounded-full transition"
            />
          ) : null
          return (
            <div key={`wrap-${e.id}`}>
              {strip}
              {renderStandaloneCard(e.id, e.c)}
            </div>
          )
        })}
        {addCategoryTile}
      </div>
    </div>
  )

  if (!mounted) return null

  return (
    <>
      <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
        {/* ─── Mobile ─── */}
        <div className="space-y-4 md:hidden">
          <MobilePageHeader
            title={t.categories_title}
            fallbackHref={`/${sessionId}`}
            action={
              <MobileIconButton onClick={openAddCategory} label={t.addCategory}>
                <Plus strokeWidth={2.5} />
              </MobileIconButton>
            }
          />

          <div className="space-y-3 px-1">
            {kindTabs}
            {searchField}
            {summaryStrip}
          </div>

          <section className="px-1">{listBody}</section>
        </div>

        {/* ─── Desktop ─── */}
        <div className="hidden md:block">
          <DesktopPageHeader
            title={t.categories_title}
            homeHref={`/${sessionId}`}
            actions={
              <DesktopPageAction onClick={openAddCategory}>
                <Plus strokeWidth={2.5} />
                {t.addCategory}
              </DesktopPageAction>
            }
          />

          <DesktopPageBody className="space-y-4">
            <p className="text-sm font-medium text-[var(--muted)]">{subtitle}</p>

            <div className="max-w-3xl">{kindTabs}</div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {summaryStrip}
              <div className="min-w-[240px] max-w-xs flex-1">{searchField}</div>
            </div>

            {listBody}
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
                <AppSheetHeader
                  title={sheetTitle}
                  onClose={requestModalClose}
                />

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
                        <div className="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                          {(["expense", "income"] as const).map(kind => {
                            const active = editCatKind === kind
                            const isExp = kind === "expense"
                            return (
                              <button
                                key={kind}
                                type="button"
                                onClick={() => setEditCatKind(kind)}
                                className={cn(
                                  "flex items-center justify-center gap-2 rounded-[var(--radius)] py-2.5 text-sm font-bold transition-all active:scale-[0.98]",
                                  active
                                    ? isExp
                                      ? (resolvedTheme === "light" ? "bg-rose-500/10 text-rose-600" : "bg-rose-400/15 text-rose-400")
                                      : (resolvedTheme === "light" ? "bg-emerald-500/10 text-emerald-600" : "bg-emerald-400/15 text-emerald-400")
                                    : "text-[var(--muted)]"
                                )}
                              >
                                {isExp ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
                                {kind === "expense" ? t.expense : t.income}
                              </button>
                            )
                          })}
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                            {t.categoryIcon}
                          </label>
                          <CategoryIconPicker value={editCatIconName} kind={editCatKind} onChange={setEditCatIconName} compact />
                          <IconUpload onChange={setEditCatIconName} />
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
                                <button onClick={() => openEditKeyword(kw)} disabled={selectedCategory?.system_code === "monthly_salary"} className="rounded-lg p-1.5 text-[var(--muted)] transition-all hover:bg-[var(--surface-tint)] active:scale-90 disabled:cursor-not-allowed disabled:opacity-30">
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => openDeleteKeyword(kw)} disabled={selectedCategory?.system_code === "monthly_salary"} className="rounded-lg p-1.5 text-rose-400 transition-all hover:bg-rose-500/10 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30">
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
                          disabled={selectedCategory?.system_code === "monthly_salary"}
                          title={selectedCategory?.system_code === "monthly_salary" ? (lang === "EN" ? "Locked system category" : "Kategori sistem berkunci") : undefined}
                          className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 text-sm font-black text-rose-500 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
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
                      <div className="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                        {(["expense", "income"] as const).map(kind => {
                          const active = newCatKind === kind
                          const isExp = kind === "expense"
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setNewCatKind(kind)}
                              className={cn(
                                "flex items-center justify-center gap-2 rounded-[var(--radius)] py-2.5 text-sm font-bold transition-all active:scale-[0.98]",
                                active
                                  ? isExp
                                    ? (resolvedTheme === "light" ? "bg-rose-500/10 text-rose-600" : "bg-rose-400/15 text-rose-400")
                                    : (resolvedTheme === "light" ? "bg-emerald-500/10 text-emerald-600" : "bg-emerald-400/15 text-emerald-400")
                                  : "text-[var(--muted)]"
                              )}
                            >
                              {isExp ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
                              {kind === "expense" ? t.expense : t.income}
                            </button>
                          )
                        })}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                          {t.categoryIcon}
                        </label>
                        <CategoryIconPicker value={newCatIconName} kind={newCatKind} onChange={setNewCatIconName} compact />
                        <IconUpload onChange={setNewCatIconName} />
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

      {mounted && groupModalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center"
              onClick={() => setGroupModalOpen(false)}
              onTouchMove={(e) => e.preventDefault()}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ transform: "translateZ(0)" }}
                data-prevent-pull-refresh="true"
                className="app-sheet-panel app-sheet-panel--lg max-h-[90dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-w-md md:max-h-[85vh]"
              >
                <AppSheetHeader
                  title={
                    editingGroupId
                      ? lang === "EN"
                        ? "Rename Group"
                        : "Tukar Nama Kumpulan"
                      : lang === "EN"
                        ? "Create Group"
                        : "Buat Kumpulan"
                  }
                  onClose={requestGroupClose}
                />
                <div className="px-3 py-3 pb-4 md:px-6 md:py-6">
                  <label className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)] opacity-70">
                    {lang === "EN" ? "Group Name" : "Nama Kumpulan"}
                  </label>
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveGroup()
                    }}
                    autoFocus
                    placeholder={lang === "EN" ? "e.g. Bills & Utilities" : "cth. Bil & Utiliti"}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-base font-semibold text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)]"
                  />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setGroupModalOpen(false)}
                      className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
                    >
                      {lang === "EN" ? "Cancel" : "Batal"}
                    </button>
                    <button
                      onClick={saveGroup}
                      disabled={!groupName.trim()}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {lang === "EN" ? (editingGroupId ? "Save" : "Create") : editingGroupId ? "Simpan" : "Cipta"}
                    </button>
                  </div>
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
