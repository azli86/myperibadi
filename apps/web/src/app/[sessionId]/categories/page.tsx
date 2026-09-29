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
  ChevronDown,
  MoveUp,
  MoveDown,
  Upload,
  Sparkles,
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
import { MoneyAmount } from "@/components/ui/MoneyAmount"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
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

type ModalType =
  | "categoryDetail"
  | "addCategory"
  | "editCategory"
  | "addKeyword"
  | "editKeyword"
  | "deleteKeyword"
  | "archiveCategory"
  | null

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

function CategoryIconPicker({ value, kind, onChange, compact = false }: CategoryIconPickerProps) {
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const [showFullPicker, setShowFullPicker] = useState(false)
  const isDark = resolvedTheme === "dark"
  const pickerHeight = compact ? "clamp(320px, 50dvh, 420px)" : "clamp(360px, 54dvh, 480px)"
  const compactPickerHeight = "clamp(240px, 36dvh, 320px)"
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
    "--epr-emoji-size": compact ? "clamp(22px, 6.5vw, 28px)" : "28px",
    "--epr-emoji-padding": compact ? "4px" : "6px",
    "--epr-category-navigation-button-size": compact ? "28px" : "32px",
  } as React.CSSProperties

  const copy =
    lang === "EN"
      ? { selected: "Selected Icon", brand: "Brand", quick: "Quick", more: "Emoji Picker", compact: "Close Picker", emoji: "Emoji" }
      : { selected: "Ikon Dipilih", brand: "Jenama", quick: "Pantas", more: "Pilih Emoji", compact: "Tutup Emoji", emoji: "Emoji" }
  const quickIcons = CATEGORY_QUICK_ICONS[kind]
  const getQuickLabel = (item: QuickCategoryIcon) => (lang === "EN" ? item.labelEn || item.label : item.label)
  const selectedIcon = [
    ...BRAND_QUICK_ICONS,
    ...CATEGORY_QUICK_ICONS.expense,
    ...CATEGORY_QUICK_ICONS.income,
  ].find((item) => item.value === value)
  const selectedLabel = selectedIcon ? getQuickLabel(selectedIcon) : copy.emoji

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xs">
      {/* Selected Header */}
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--card)] text-[var(--text)] shadow-xs ring-1 ring-[var(--border)]">
          <CategoryIconGlyph iconName={value} categoryName={selectedLabel} kind={kind} size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">{copy.selected}</p>
          <p className="truncate text-sm font-bold text-[var(--text)]">{selectedLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowFullPicker((prev) => !prev)}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] transition-all active:scale-95 shadow-2xs"
        >
          {showFullPicker ? copy.compact : copy.more}
        </button>
      </div>

      {/* Brand Quick Icons */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{copy.brand}</span>
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
                  "flex h-11 items-center justify-center rounded-2xl border transition-all active:scale-95",
                  isSelected
                    ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] ring-2 ring-[var(--text)]/20 shadow-xs"
                    : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
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

      {/* Quick Category Icons */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{copy.quick}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {quickIcons.map((item) => {
            const isSelected = value === item.value
            const label = getQuickLabel(item)
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange(item.value)}
                className={cn(
                  "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 transition-all active:scale-95",
                  isSelected
                    ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)] shadow-xs"
                    : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
                )}
                title={label}
                aria-label={label}
              >
                <CategoryIconGlyph iconName={item.value} categoryName={label} kind={kind} size={20} />
                <span className="max-w-full truncate text-[9px] font-semibold leading-none">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Emoji Picker Full Panel */}
      {showFullPicker && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-md [&>aside]:border-none">
          <EmojiPicker
            className="category-emoji-picker"
            theme={isDark ? Theme.DARK : Theme.LIGHT}
            onEmojiClick={(emojiData) => {
              onChange(emojiData.emoji)
              setShowFullPicker(false)
            }}
            width="100%"
            height={compact ? compactPickerHeight : pickerHeight}
            style={pickerStyle}
            lazyLoadEmojis={false}
            searchDisabled={false}
            skinTonesDisabled={true}
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  )
}

export default function CategoriesPage() {
  const { t, lang } = useLang()
  const { resolvedTheme } = useTheme()
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""

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

  // UI-only drag reorder + custom-named groups
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
  const [mainGroupCategory, setMainGroupCategory] = useState<Category | null>(null)
  const [newGroupNameForCat, setNewGroupNameForCat] = useState("")

  const [kwPhrase, setKwPhrase] = useState("")
  const [kwMatchType, setKwMatchType] = useState("contains")
  const [kwPhraseError, setKwPhraseError] = useState("")

  const selectedCategory = categories.find((c) => c.id === selectedId) || null
  const selectedKeywords = selectedId != null ? keywords[selectedId] || [] : []
  const filteredCategories = categories.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) && c.status !== "archived"
  )
  const sortedFilteredCategories = [...filteredCategories].sort((a, b) => {
    const kindOrder = a.kind === b.kind ? 0 : a.kind === "expense" ? -1 : 1
    if (kindOrder !== 0) return kindOrder
    return a.name.localeCompare(b.name, lang === "EN" ? "en" : "ms", { sensitivity: "base" })
  })
  const tabCategories = sortedFilteredCategories.filter((c) => c.kind === activeKindTab)

  const activeTabIds = useMemo(() => new Set(tabCategories.map((c) => c.id)), [tabCategories])
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

  const memberIds = useMemo(() => {
    const s = new Set<number>()
    for (const g of groups) for (const m of g.members) if (activeTabIds.has(m)) s.add(m)
    return s
  }, [groups, activeTabIds])

  const standaloneIds = renderIds.filter((id) => !memberIds.has(id))

  const visibleGroups = useMemo(
    () => groups.filter((g) => g.members.some((m) => activeTabIds.has(m)) || g.members.length === 0),
    [groups, activeTabIds]
  )
  const orderedGroups = visibleGroups

  const orderedMembers = (g: Group): number[] =>
    g.members.filter((m) => activeTabIds.has(m)).sort((a, b) => renderIds.indexOf(a) - renderIds.indexOf(b))

  const standaloneEntries: { id: number; c: Category }[] = standaloneIds
    .map((id) => ({ id, c: catById.get(id) }))
    .filter((e): e is { id: number; c: Category } => !!e.c)

  const stats = useMemo(() => {
    const active = categories.filter((c) => c.status !== "archived")
    const expense = active.filter((c) => c.kind === "expense")
    const income = active.filter((c) => c.kind === "income")
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

  const subtitle =
    lang === "EN"
      ? "Organize expense and income labels with auto-matching keywords"
      : "Urus label belanja dan pendapatan dengan keyword auto-padanan"

  const getMatchTypeLabel = (matchType: string) => {
    if (matchType === "contains") return t.matchContains
    if (matchType === "exact") return t.matchExact
    if (matchType === "startsWith") return t.matchStartsWith
    return matchType
  }

  const keywordNoSpaceAlert =
    lang === "EN"
      ? "Category keyword cannot contain spaces. Use one word only, for example: grab or gaji."
      : "Keyword kategori tak boleh ada ruang (space). Guna satu perkataan sahaja, contoh: grab atau gaji."

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
      showAlert(lang === "EN" ? "Invalid Keyword" : "Keyword Tidak Sah", keywordNoSpaceAlert, "warning")
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        setKeywords((prev) => ({ ...prev, [catId]: data }))
      }
    } catch (err) {
      console.error("Fetch keywords error:", err)
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const token = getAccessToken()
        const headers: HeadersInit = token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}
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
  }, [sessionId])

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
  const { requestClose: requestMainGroupClose } = useOverlayBackClose({
    id: "category-main-group-sheet",
    isOpen: Boolean(mainGroupCategory),
    onClose: () => {
      setMainGroupCategory(null)
      setNewGroupNameForCat("")
    },
  })
  const sheetSwipe = useSwipeDownToClose(requestModalClose)

  useEffect(() => {
    const hidden = Boolean(modal) || groupModalOpen || Boolean(mainGroupCategory)
    if (hidden) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", {
        detail: { hidden },
      })
    )

    return () => {
      document.body.style.overflow = ""
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", {
          detail: { hidden: false },
        })
      )
    }
  }, [modal, groupModalOpen, mainGroupCategory])

  async function uploadCategoryIcon(file: File, onChange: (url: string) => void) {
    if (file.size > 256 * 1024) {
      showAlert(
        lang === "EN" ? "File too large" : "Fail terlalu besar",
        lang === "EN" ? "Maximum icon size is 256 KB." : "Saiz maksimum ikon ialah 256 KB.",
        "error"
      )
      return
    }
    const form = new FormData()
    form.append("file", file)
    const token = getAccessToken()
    const res = await fetch("/api/categories/icon-upload", {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showAlert(lang === "EN" ? "Upload failed" : "Upload gagal", data.detail || "Upload failed.", "error")
      return
    }
    onChange(data.url)
  }

  const IconUpload = ({ onChange }: { onChange: (url: string) => void }) => (
    <label className="mt-2.5 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] transition active:scale-98">
      <Upload size={14} /> {lang === "EN" ? "Upload custom icon (max 256 KB)" : "Muat naik ikon (maks 256 KB)"}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void uploadCategoryIcon(file, onChange)
          e.target.value = ""
        }}
      />
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: newCatName.trim(), kind: newCatKind, icon_name: newCatIconName }),
      })
      if (res.ok) {
        const data = await res.json()
        setCategories((prev) => [...prev, data])
        setSelectedId(data.id)
        setNewCatName("")
        setNewCatKind("expense")
        setNewCatIconName("🏷️")
        setKwPhrase("")
        setKwPhraseError("")
        setKwMatchType("contains")
        setModal("addKeyword")
        showAlert(
          lang === "EN" ? "Category Created" : "Kategori Dibuat",
          lang === "EN"
            ? "Category created. Continue by adding matching keywords."
            : "Kategori berjaya dibuat. Teruskan dengan tambah keyword padanan.",
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
        err instanceof Error ? err.message : lang === "EN" ? "Failed to create category." : "Gagal buat kategori.",
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: editCatName.trim(), kind: editCatKind, icon_name: editCatIconName }),
      })
      if (res.ok) {
        const data = await res.json()
        setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, ...data } : c)))
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
        err instanceof Error ? err.message : lang === "EN" ? "Failed to update category." : "Gagal kemaskini kategori.",
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
    const cat = categories.find((c) => c.id === categoryId)
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        setCategories((prev) => prev.filter((c) => c.id !== selectedCategory.id))
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
        err instanceof Error ? err.message : lang === "EN" ? "Failed to delete category." : "Gagal padam kategori.",
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ keyword, match_type: kwMatchType }),
      })
      if (res.ok) {
        const data = await res.json()
        setKeywords((prev) => ({ ...prev, [selectedId]: [...(prev[selectedId] || []), data] }))
        setCategories((prev) => prev.map((c) => (c.id === selectedId ? { ...c, keywordCount: c.keywordCount + 1 } : c)))
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
        err instanceof Error ? err.message : lang === "EN" ? "Failed to add keyword." : "Gagal tambah keyword.",
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ keyword, match_type: kwMatchType }),
      })
      if (res.ok) {
        setKeywords((prev) => ({
          ...prev,
          [selectedId]: prev[selectedId].map((k) =>
            k.id === editingKeyword.id ? { ...k, keyword, match_type: kwMatchType } : k
          ),
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
        err instanceof Error ? err.message : lang === "EN" ? "Failed to update keyword." : "Gagal kemas kini keyword.",
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        setKeywords((prev) => ({
          ...prev,
          [selectedId]: prev[selectedId].filter((k) => k.id !== deletingKeyword.id),
        }))
        setCategories((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, keywordCount: Math.max(0, c.keywordCount - 1) } : c))
        )
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
        err instanceof Error ? err.message : lang === "EN" ? "Failed to delete keyword." : "Gagal padam keyword.",
        "error"
      )
    }
    setSaving(false)
  }

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
          : { ...g, members: g.members.filter((m) => m !== catId) }
      )
    )
  }

  const removeFromGroup = (groupId: string, catId: number) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, members: g.members.filter((m) => m !== catId) } : g))
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

  const sheetTitle = (() => {
    if (modal === "categoryDetail") return lang === "EN" ? "Edit Category" : "Ubah Kategori"
    if (modal === "addCategory") return t.addCategory
    if (modal === "archiveCategory") return t.archiveCategory
    if (modal === "addKeyword") return t.addKeyword
    if (modal === "editKeyword") return lang === "EN" ? "Edit Keyword" : "Ubah Keyword"
    if (modal === "deleteKeyword") return t.deleteKeyword
    return ""
  })()

  // ─── Category row ───
  // One line of a list: tinted icon, name, this month's amount and keyword
  // count, and a thin bar for its share of the month. Group and order controls
  // sit on the right as quiet round buttons.
  const kindMonthTotal = activeKindTab === "expense" ? stats.monthSpend : stats.monthIncome

  function CategoryRow({
    category,
    onClick,
    onOpenMainGroup,
    onMoveUp,
    onMoveDown,
    onRemoveFromGroup,
    isMember = false,
  }: {
    category: Category
    onClick: () => void
    onOpenMainGroup: () => void
    onMoveUp?: () => void
    onMoveDown?: () => void
    onRemoveFromGroup?: () => void
    isMember?: boolean
  }) {
    const isExp = category.kind === "expense"
    const amount = category.amountMonth || 0
    const share = kindMonthTotal > 0 ? Math.min(100, (amount / kindMonthTotal) * 100) : 0

    return (
      <div className="flex items-center gap-2 px-3.5 py-3 transition-colors hover:bg-[var(--surface-tint)]/40">
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem]",
              isExp ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            )}
          >
            <CategoryIconGlyph iconName={category.icon_name} categoryName={category.name} kind={category.kind} size={21} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[0.9375rem] font-bold tracking-tight text-[var(--text)]">{category.name}</span>
              {category.system_code === "monthly_salary" && (
                <span className="shrink-0 rounded-full bg-[var(--surface-tint-strong)] px-1.5 py-px text-[0.5625rem] font-black uppercase tracking-wide text-[var(--muted)]">
                  System
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
              {amount > 0 ? (
                <>
                  <MoneyAmount value={amount} digits={0} size="xs" className="!text-xs font-bold text-[var(--text-soft)]" currencyClassName="!text-[0.65rem]" />
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="inline-flex items-center gap-0.5">
                <Hash size={11} />
                {category.keywordCount} keyword
              </span>
            </span>
            {share > 0 ? (
              <span className="mt-1.5 block h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                <span
                  className={cn("block h-full rounded-full", isExp ? "bg-rose-500/70" : "bg-emerald-500/70")}
                  style={{ width: `${Math.max(share, 3)}%` }}
                />
              </span>
            ) : null}
          </span>
        </button>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenMainGroup()
            }}
            title={lang === "EN" ? "Assign Group" : "Pilih Kumpulan"}
            aria-label={lang === "EN" ? "Assign Group" : "Pilih Kumpulan"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)] active:scale-90"
          >
            <FolderTree size={15} />
          </button>

          {isMember && onRemoveFromGroup ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveFromGroup()
              }}
              title={lang === "EN" ? "Remove from group" : "Buang dari kumpulan"}
              aria-label={lang === "EN" ? "Remove from group" : "Buang dari kumpulan"}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-90"
            >
              <X size={15} />
            </button>
          ) : (
            <>
              {onMoveUp && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveUp()
                  }}
                  title={lang === "EN" ? "Move up" : "Naik"}
                  aria-label={lang === "EN" ? "Move up" : "Naik"}
                  className="flex h-8 w-7 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)] active:scale-90"
                >
                  <MoveUp size={14} />
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveDown()
                  }}
                  title={lang === "EN" ? "Move down" : "Turun"}
                  aria-label={lang === "EN" ? "Move down" : "Turun"}
                  className="flex h-8 w-7 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)] active:scale-90"
                >
                  <MoveDown size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  const listCardClass =
    "overflow-hidden rounded-[1.25rem] bg-[var(--card)] shadow-[var(--shadow-card)] divide-y divide-[color-mix(in_srgb,var(--divider)_55%,transparent)]"

  // ─── Group (folder) ───
  const renderGroupCard = (g: Group) => {
    const members = orderedMembers(g)
      .map((m) => catById.get(m))
      .filter((cc): cc is Category => !!cc)
    const collapsed = !collapsedGroupIds.has(g.id)
    const groupTotal = members.reduce((sum, c) => sum + (c.amountMonth || 0), 0)
    const groupAction =
      "flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)] active:scale-90"

    return (
      <section key={g.id} className={listCardClass}>
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
          className="flex cursor-pointer items-center gap-2 px-3.5 py-3"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <FolderTree size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-black tracking-tight text-[var(--text)]">{g.name}</p>
            <div className="mt-0.5 flex items-center gap-2">
              {members.length > 0 ? (
                <div className="flex items-center -space-x-1.5">
                  {members.slice(0, 4).map((c, idx) => (
                    <span
                      key={c.id}
                      title={c.name}
                      style={{ zIndex: 10 - idx }}
                      className={cn(
                        "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ring-[var(--card)]",
                        c.kind === "expense"
                          ? "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                          : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                      )}
                    >
                      <CategoryIconGlyph iconName={c.icon_name} categoryName={c.name} kind={c.kind} size={10} />
                    </span>
                  ))}
                  {members.length > 4 && (
                    <span
                      style={{ zIndex: 4 }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--text)] text-[0.5rem] font-black text-[var(--bg)] ring-2 ring-[var(--card)]"
                    >
                      +{members.length - 4}
                    </span>
                  )}
                </div>
              ) : null}
              <span className="truncate text-xs font-medium text-[var(--muted)]">
                {members.length} {lang === "EN" ? "categories" : "kategori"}
                {groupTotal > 0 ? (
                  <>
                    {" · "}
                    <MoneyAmount value={groupTotal} digits={0} size="xs" className="!text-xs font-bold text-[var(--text-soft)]" currencyClassName="!text-[0.65rem]" />
                  </>
                ) : null}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openRenameGroup(g)
              }}
              title={lang === "EN" ? "Rename group" : "Tukar nama"}
              aria-label={lang === "EN" ? "Rename group" : "Tukar nama"}
              className={groupAction}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                moveGroup(g.id, -1)
              }}
              title={lang === "EN" ? "Move group up" : "Naik"}
              aria-label={lang === "EN" ? "Move group up" : "Naik"}
              className={cn(groupAction, "hidden w-7 sm:flex")}
            >
              <MoveUp size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                moveGroup(g.id, 1)
              }}
              title={lang === "EN" ? "Move group down" : "Turun"}
              aria-label={lang === "EN" ? "Move group down" : "Turun"}
              className={cn(groupAction, "hidden w-7 sm:flex")}
            >
              <MoveDown size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(lang === "EN" ? `Delete group "${g.name}"?` : `Padam kumpulan "${g.name}"?`)) {
                  setGroups((prev) => prev.filter((x) => x.id !== g.id))
                }
              }}
              title={lang === "EN" ? "Delete group" : "Padam kumpulan"}
              aria-label={lang === "EN" ? "Delete group" : "Padam kumpulan"}
              className={cn(groupAction, "hover:bg-rose-500/10 hover:text-rose-500")}
            >
              <Trash2 size={14} />
            </button>
            <ChevronDown
              size={17}
              className={cn("ml-0.5 text-[var(--muted)] transition-transform duration-200", collapsed && "-rotate-90")}
            />
          </div>
        </div>

        {!collapsed &&
          (members.length > 0 ? (
            members.map((c) => (
              <div key={`mem-${c.id}`} className="bg-[var(--surface-tint)]/30 pl-3">
                <CategoryRow
                  category={c}
                  isMember={true}
                  onClick={() => openCategoryDetail(c.id)}
                  onOpenMainGroup={() => setMainGroupCategory(c)}
                  onRemoveFromGroup={() => removeFromGroup(g.id, c.id)}
                />
              </div>
            ))
          ) : (
            <p className="px-4 py-3.5 text-center text-xs font-medium text-[var(--muted)]">
              {lang === "EN"
                ? "No categories in this group. Tap the folder icon on any category to assign."
                : "Tiada kategori dalam kumpulan ini. Tekan ikon folder pada mana-mana kategori untuk masukkan."}
            </p>
          ))}
      </section>
    )
  }

  // ─── Belanja / Pendapatan switch ───
  const kindTabs = (
    <div role="tablist" className="flex w-full rounded-full bg-[var(--surface-tint-strong)] p-1">
      {(["expense", "income"] as const).map((kind) => {
        const active = activeKindTab === kind
        const count = kind === "expense" ? stats.expenseCount : stats.incomeCount
        const isExp = kind === "expense"

        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveKindTab(kind)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-black transition-all active:scale-[0.98]",
              active ? "bg-[var(--card)] text-[var(--text)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]" : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isExp ? "bg-rose-500" : "bg-emerald-500", !active && "opacity-50")} />
            <span>{isExp ? t.expense : t.income}</span>
            <span className="tabular-nums text-[var(--muted)]">{count}</span>
          </button>
        )
      })}
    </div>
  )

  // ─── Search ───
  const searchField = (
    <div className="relative w-full">
      <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
      <input
        type="search"
        placeholder={t.searchCategory}
        aria-label={t.searchCategory}
        className="h-11 w-full rounded-full border-0 bg-[var(--card)] pl-10 pr-10 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-card)] outline-none transition placeholder:font-medium placeholder:text-[var(--muted)]/70 focus:ring-2 focus:ring-orange-500/30"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          aria-label={lang === "EN" ? "Clear search" : "Kosongkan carian"}
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )

  // ─── This month, for the tab on show ───
  const monthSummary = (
    <section className="px-2">
      <p className="text-sm font-semibold text-[var(--muted)]">
        {activeKindTab === "expense"
          ? lang === "EN" ? "Spent this month" : "Belanja bulan ini"
          : lang === "EN" ? "Received this month" : "Pendapatan bulan ini"}
      </p>
      <div className="mt-1 text-[var(--text)]">
        {showDataSkeleton ? (
          <div className="h-9 w-40 animate-pulse rounded-lg bg-[var(--surface-tint-strong)]" />
        ) : (
          <MoneyAmount value={kindMonthTotal} digits={2} size="hero" className="!text-[2.25rem] font-black" />
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium text-[var(--muted)]">
        {showDataSkeleton ? "—" : `${activeKindTab === "expense" ? stats.expenseCount : stats.incomeCount} ${lang === "EN" ? "categories" : "kategori"} · ${stats.keywordTotal} keyword ${lang === "EN" ? "in total" : "keseluruhan"}`}
      </p>
    </section>
  )

  // ─── List toolbar: count + new group ───
  const listToolbar = (
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="text-xs font-bold text-[var(--muted)]">
        {tabCategories.length} {lang === "EN" ? "shown" : "dipapar"}
      </p>
      <button
        type="button"
        onClick={openCreateGroup}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] px-3.5 py-1.5 text-xs font-bold text-[var(--text)] shadow-[var(--shadow-card)] transition hover:bg-[var(--surface-tint)] active:scale-95"
      >
        <FolderTree size={13} />
        <span>{lang === "EN" ? "New Group" : "Kumpulan Baru"}</span>
      </button>
    </div>
  )

  // ─── Empty State ───
  const emptyState = (
    <div className="flex flex-col items-center justify-center rounded-[1.25rem] bg-[var(--card)] px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <div className="grid h-14 w-14 place-items-center rounded-[1.1rem] bg-orange-500/10 text-orange-600 dark:text-orange-400">
        {searchQuery ? <Search size={24} /> : <Tag size={24} />}
      </div>
      <p className="mt-4 text-base font-black text-[var(--text)]">
        {searchQuery ? (lang === "EN" ? "No matches found" : "Tiada padanan") : t.noCategories}
      </p>
      <p className="mt-1.5 max-w-xs text-xs font-medium leading-relaxed text-[var(--muted)]">
        {searchQuery
          ? lang === "EN"
            ? "Try searching for another keyword or category name."
            : "Cuba kata carian lain atau semak ejaan."
          : lang === "EN"
            ? `Create your first ${activeKindTab} category for automatic transaction matching.`
            : `Cipta kategori ${activeKindTab === "expense" ? "belanja" : "pendapatan"} pertama anda untuk auto-padanan.`}
      </p>
      <button
        type="button"
        onClick={searchQuery ? () => setSearchQuery("") : openAddCategory}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--text)] px-5 py-2.5 text-xs font-black text-[var(--bg)] transition active:scale-95"
      >
        {searchQuery ? (
          <>
            <X size={14} strokeWidth={3} />
            {lang === "EN" ? "Clear search" : "Kosongkan carian"}
          </>
        ) : (
          <>
            <Plus size={14} strokeWidth={3} />
            {t.addCategory}
          </>
        )}
      </button>
    </div>
  )

  // ─── Categories list ───
  const listBody = showDataSkeleton ? (
    <div className={listCardClass}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-[0.95rem] bg-[var(--surface-tint-strong)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-[var(--surface-tint-strong)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-tint-strong)]" />
          </div>
        </div>
      ))}
    </div>
  ) : tabCategories.length === 0 ? (
    emptyState
  ) : (
    <div className="space-y-3">
      {listToolbar}

      {orderedGroups.map((g) => renderGroupCard(g))}

      {standaloneEntries.length > 0 && (
        <div className={listCardClass}>
          {standaloneEntries.map((e) => (
            <CategoryRow
              key={`cat-${e.id}`}
              category={e.c}
              onClick={() => openCategoryDetail(e.id)}
              onOpenMainGroup={() => setMainGroupCategory(e.c)}
              onMoveUp={() => moveItem(e.id, -1)}
              onMoveDown={() => moveItem(e.id, 1)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={openAddCategory}
        className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-[var(--divider)] p-3.5 text-sm font-bold text-[var(--muted)] transition hover:border-[var(--text-soft)] hover:text-[var(--text)] active:scale-[0.99]"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>{t.addCategory}</span>
      </button>
    </div>
  )

  // ─── Desktop side panel: both kinds at a glance ───
  const kindTile = (kind: "expense" | "income") => {
    const isExp = kind === "expense"
    const active = activeKindTab === kind
    return (
      <button
        type="button"
        onClick={() => setActiveKindTab(kind)}
        className={cn(
          "flex w-full flex-col rounded-[1.25rem] bg-[var(--card)] p-4 text-left shadow-[var(--shadow-card)] ring-2 transition active:scale-[0.99]",
          active ? (isExp ? "ring-rose-500/40" : "ring-emerald-500/40") : "ring-transparent hover:ring-[var(--divider)]"
        )}
      >
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-[0.7rem]",
                isExp ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              )}
            >
              {isExp ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
            </span>
            {isExp ? t.expense : t.income}
          </span>
          <span className="text-xs font-bold tabular-nums text-[var(--muted)]">
            {isExp ? stats.expenseCount : stats.incomeCount} {lang === "EN" ? "categories" : "kategori"}
          </span>
        </span>
        <span className="mt-3 text-xs font-semibold text-[var(--muted)]">{lang === "EN" ? "This month" : "Bulan ini"}</span>
        <MoneyAmount value={isExp ? stats.monthSpend : stats.monthIncome} digits={2} size="md" className="font-black text-[var(--text)]" />
      </button>
    )
  }

  if (!mounted) return null

  return (
    <>
      <div className="pb-20 md:pb-8">
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

          {monthSummary}

          <div className="space-y-3 px-1">
            {kindTabs}
            {searchField}
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

          <DesktopPageBody>
            <p className="mb-5 text-sm font-medium text-[var(--muted)]">{subtitle}</p>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <aside className="grid content-start gap-3 md:grid-cols-3 lg:order-2 lg:sticky lg:top-20 lg:grid-cols-1">
                {kindTile("expense")}
                {kindTile("income")}
                <div className="flex flex-col rounded-[1.25rem] bg-[var(--card)] p-4 shadow-[var(--shadow-card)]">
                  <span className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[0.7rem] bg-orange-500/10 text-orange-600 dark:text-orange-400">
                      <Sparkles size={16} />
                    </span>
                    Auto-Matching
                  </span>
                  <span className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-xl font-black tabular-nums text-[var(--text)]">{stats.keywordTotal}</span>
                    <span className="text-xs font-semibold text-[var(--muted)]">{lang === "EN" ? "keywords active" : "keyword aktif"}</span>
                  </span>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-[var(--muted)]">
                    {lang === "EN" ? "Instant classification for bot & receipts" : "Klasifikasi automatik dari bot WhatsApp & resit"}
                  </p>
                </div>
              </aside>

              <div className="min-w-0 space-y-4 lg:order-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-full max-w-[18rem]">{kindTabs}</div>
                  <div className="min-w-[16rem] flex-1">{searchField}</div>
                </div>
                {listBody}
              </div>
            </div>
          </DesktopPageBody>
        </div>
      </div>

      {/* ─── Sheets & Modals ─── */}

      {/* 1. Category Detail / Edit Sheet */}
      {mounted && modal
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-black/50 backdrop-blur-xs p-0 md:items-center"
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
                  "app-sheet-panel app-sheet-panel--lg max-h-[92dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[36px] md:rounded-3xl border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-h-[85vh]",
                  modal === "categoryDetail" ? "md:max-w-lg" : "md:max-w-md"
                )}
              >
                <AppSheetHeader title={sheetTitle} onClose={requestModalClose} />

                <div className="space-y-4 px-4 py-3 text-[var(--text)] md:px-6 md:py-4">
                  {modal === "categoryDetail" && selectedCategory && (
                    <>
                      {/* Name Input */}
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.categoryName}
                        </label>
                        <input
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-base font-bold text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)] focus:border-[var(--border-strong)]"
                          placeholder={t.categoryName}
                        />
                      </div>

                      {/* Kind Switcher (Expense / Income) */}
                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-1.5">
                        {(["expense", "income"] as const).map((kind) => {
                          const active = editCatKind === kind
                          const isExp = kind === "expense"
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setEditCatKind(kind)}
                              className={cn(
                                "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition-all active:scale-[0.98]",
                                active
                                  ? isExp
                                    ? "bg-rose-500 text-white shadow-2xs"
                                    : "bg-emerald-500 text-white shadow-2xs"
                                  : "text-[var(--muted)] hover:text-[var(--text)]"
                              )}
                            >
                              {isExp ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                              <span>{isExp ? t.expense : t.income}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Icon Picker */}
                      <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.categoryIcon}
                        </label>
                        <CategoryIconPicker value={editCatIconName} kind={editCatKind} onChange={setEditCatIconName} compact />
                        <IconUpload onChange={setEditCatIconName} />
                      </div>

                      {/* Keyword Management Container */}
                      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Keywords Padanan</p>
                          <span className="rounded-full bg-[var(--surface-tint-strong)] px-2.5 py-0.5 text-[10px] font-black tabular-nums text-[var(--text)]">
                            {selectedKeywords.length}
                          </span>
                        </div>

                        {/* Keyword Input & Match Type */}
                        <div className="space-y-2">
                          <input
                            value={kwPhrase}
                            onChange={(e) => handleKeywordPhraseChange(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                            placeholder={t.keywordPlaceholder}
                            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--border-strong)]"
                          />
                          <div className="flex gap-2">
                            <select
                              value={kwMatchType}
                              onChange={(e) => setKwMatchType(e.target.value)}
                              className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-xs font-bold text-[var(--text)] focus:outline-none"
                            >
                              <option value="contains">{t.matchContains}</option>
                              <option value="exact">{t.matchExact}</option>
                              <option value="startsWith">{t.matchStartsWith}</option>
                            </select>
                            <button
                              type="button"
                              onClick={addKeyword}
                              disabled={saving || !kwPhrase.trim() || Boolean(kwPhraseError)}
                              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--text)] px-4 py-2.5 text-xs font-black text-[var(--bg)] shadow-xs transition-all active:scale-95 disabled:opacity-40"
                            >
                              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                              <span>{t.add}</span>
                            </button>
                          </div>
                        </div>

                        {kwPhraseError && <p className="text-xs font-bold text-rose-400">{kwPhraseError}</p>}

                        {/* Existing Keywords List */}
                        <div className="max-h-[160px] space-y-1.5 overflow-y-auto scrollbar-thin">
                          {selectedKeywords.length > 0 ? (
                            selectedKeywords.map((kw) => (
                              <div
                                key={kw.id}
                                className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-2xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-bold text-[var(--text)]">{kw.keyword}</p>
                                  <p className="text-[9px] font-semibold text-[var(--muted)]">
                                    {getMatchTypeLabel(kw.match_type)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <button
                                    onClick={() => openEditKeyword(kw)}
                                    disabled={selectedCategory?.system_code === "monthly_salary"}
                                    className="rounded-xl p-1.5 text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)] transition active:scale-90 disabled:opacity-30"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => openDeleteKeyword(kw)}
                                    disabled={selectedCategory?.system_code === "monthly_salary"}
                                    className="rounded-xl p-1.5 text-rose-400 hover:bg-rose-500/10 transition active:scale-90 disabled:opacity-30"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="py-4 text-center text-xs font-semibold text-[var(--muted)]">
                              {t.noKeywords}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bottom Action Row */}
                      <div className="-mx-4 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-3.5 md:-mx-6 md:px-6">
                        <button
                          onClick={updateCategory}
                          disabled={saving || !editCatName.trim()}
                          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-40 shadow-sm"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          <span>{t.saveChanges}</span>
                        </button>
                        <button
                          onClick={() => setModal("archiveCategory")}
                          disabled={selectedCategory?.system_code === "monthly_salary"}
                          title={
                            selectedCategory?.system_code === "monthly_salary"
                              ? lang === "EN"
                                ? "Locked system category"
                                : "Kategori sistem berkunci"
                              : undefined
                          }
                          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-500 transition active:scale-[0.98] disabled:opacity-30"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}

                  {/* 2. Add Category Sheet */}
                  {modal === "addCategory" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.categoryName}
                        </label>
                        <input
                          type="text"
                          placeholder={t.exampleCategoryName}
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)] focus:border-[var(--border-strong)]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-1.5">
                        {(["expense", "income"] as const).map((kind) => {
                          const active = newCatKind === kind
                          const isExp = kind === "expense"
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setNewCatKind(kind)}
                              className={cn(
                                "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition-all active:scale-[0.98]",
                                active
                                  ? isExp
                                    ? "bg-rose-500 text-white shadow-2xs"
                                    : "bg-emerald-500 text-white shadow-2xs"
                                  : "text-[var(--muted)] hover:text-[var(--text)]"
                              )}
                            >
                              {isExp ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                              <span>{isExp ? t.expense : t.income}</span>
                            </button>
                          )
                        })}
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.categoryIcon}
                        </label>
                        <CategoryIconPicker value={newCatIconName} kind={newCatKind} onChange={setNewCatIconName} compact />
                        <IconUpload onChange={setNewCatIconName} />
                      </div>

                      <div className="-mx-4 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-3.5 md:-mx-6 md:px-6">
                        <button
                          onClick={addCategory}
                          disabled={!newCatName.trim() || saving}
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-40 shadow-sm"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          <span>{lang === "EN" ? "Create Category" : "Cipta Kategori"}</span>
                        </button>
                      </div>
                    </>
                  )}

                  {/* 3. Archive / Delete Confirm Sheet */}
                  {modal === "archiveCategory" && (
                    <>
                      <p className="text-sm leading-relaxed text-[var(--muted)]">{t.archiveDesc}</p>
                      <div className="grid grid-cols-2 gap-3 pt-2">
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

                  {/* 4. Add Keyword Prompt Sheet */}
                  {modal === "addKeyword" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.phrase}
                        </label>
                        <input
                          type="text"
                          value={kwPhrase}
                          onChange={(e) => handleKeywordPhraseChange(e.target.value)}
                          placeholder="cth: grab"
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)]"
                        />
                        {kwPhraseError && <p className="text-xs font-bold text-rose-400">{kwPhraseError}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.type}
                        </label>
                        <select
                          value={kwMatchType}
                          onChange={(e) => setKwMatchType(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none"
                        >
                          <option value="contains">{t.matchContains}</option>
                          <option value="exact">{t.matchExact}</option>
                          <option value="startsWith">{t.matchStartsWith}</option>
                        </select>
                      </div>
                      <div className="-mx-4 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-3.5 md:-mx-6 md:px-6">
                        <button
                          onClick={addKeyword}
                          disabled={!kwPhrase.trim() || saving || Boolean(kwPhraseError)}
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-40 shadow-sm"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          <span>{lang === "EN" ? "Save Keyword" : "Simpan Keyword"}</span>
                        </button>
                      </div>
                    </>
                  )}

                  {/* 5. Edit Keyword Sheet */}
                  {modal === "editKeyword" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.phrase}
                        </label>
                        <input
                          type="text"
                          value={kwPhrase}
                          onChange={(e) => handleKeywordPhraseChange(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)]"
                        />
                        {kwPhraseError && <p className="text-xs font-bold text-rose-400">{kwPhraseError}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                          {t.type}
                        </label>
                        <select
                          value={kwMatchType}
                          onChange={(e) => setKwMatchType(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none"
                        >
                          <option value="contains">{t.matchContains}</option>
                          <option value="exact">{t.matchExact}</option>
                          <option value="startsWith">{t.matchStartsWith}</option>
                        </select>
                      </div>
                      <div className="-mx-4 border-t border-[var(--border)] bg-[var(--sheet-bg)] px-4 pt-3.5 md:-mx-6 md:px-6">
                        <button
                          onClick={saveEditKeyword}
                          disabled={!kwPhrase.trim() || saving || Boolean(kwPhraseError)}
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-40 shadow-sm"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          <span>{t.saveChanges}</span>
                        </button>
                      </div>
                    </>
                  )}

                  {/* 6. Delete Keyword Sheet */}
                  {modal === "deleteKeyword" && (
                    <>
                      <p className="text-sm leading-relaxed text-[var(--muted)]">{t.deleteKeywordDesc}</p>
                      <div className="grid grid-cols-2 gap-3 pt-2">
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

      {/* 2. Group Name Create / Rename Sheet */}
      {mounted && groupModalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-black/50 backdrop-blur-xs p-0 md:items-center"
              onClick={() => setGroupModalOpen(false)}
              onTouchMove={(e) => e.preventDefault()}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ transform: "translateZ(0)" }}
                data-prevent-pull-refresh="true"
                className="app-sheet-panel app-sheet-panel--lg max-h-[90dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[36px] md:rounded-3xl border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-w-md md:max-h-[85vh]"
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
                <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
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
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-base font-bold text-[var(--text)] focus:outline-none focus:bg-[var(--surface-tint-strong)] focus:border-[var(--border-strong)]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => setGroupModalOpen(false)}
                      className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] text-sm font-bold text-[var(--text)] transition active:scale-[0.98]"
                    >
                      {lang === "EN" ? "Cancel" : "Batal"}
                    </button>
                    <button
                      onClick={saveGroup}
                      disabled={!groupName.trim()}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text)] text-sm font-black text-[var(--bg)] transition active:scale-[0.98] disabled:opacity-40 shadow-sm"
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

      {/* 3. Main Group Assignment Sheet */}
      {mounted && mainGroupCategory
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-black/50 backdrop-blur-xs p-0 md:items-center"
              onClick={requestMainGroupClose}
              onTouchMove={(e) => e.preventDefault()}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ transform: "translateZ(0)" }}
                data-prevent-pull-refresh="true"
                className="app-sheet-panel app-sheet-panel--lg max-h-[90dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[36px] md:rounded-3xl border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] will-change-transform md:max-w-md md:max-h-[85vh]"
              >
                <AppSheetHeader title={lang === "EN" ? "Main Group" : "Kumpulan Utama"} onClose={requestMainGroupClose} />
                <div className="space-y-4 px-4 py-4 text-[var(--text)] md:px-6 md:py-5">
                  {/* Category Preview Card */}
                  <div className="flex items-center gap-3.5 rounded-3xl border border-[var(--border)] bg-[var(--surface-tint)]/40 p-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-xs">
                      <CategoryIconGlyph
                        iconName={mainGroupCategory.icon_name}
                        categoryName={mainGroupCategory.name}
                        kind={mainGroupCategory.kind}
                        size={24}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full",
                            mainGroupCategory.kind === "expense" ? "bg-rose-500" : "bg-emerald-500"
                          )}
                        />
                        <p className="truncate text-sm font-black text-[var(--text)]">{mainGroupCategory.name}</p>
                      </div>
                      <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted)]">
                        {(() => {
                          const cur = groups.find((g) => g.members.includes(mainGroupCategory.id))
                          if (cur) return lang === "EN" ? `Current: ${cur.name}` : `Semasa: ${cur.name}`
                          return lang === "EN" ? "Standalone (No group)" : "Kategori Bebas (Tiada Kumpulan)"
                        })()}
                      </p>
                    </div>
                  </div>

                  {/* Groups Picker */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                      {lang === "EN" ? "Assign to Group" : "Pilih Kumpulan"}
                    </label>

                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5 scrollbar-thin">
                      {/* Standalone Option */}
                      {(() => {
                        const currentGroup = groups.find((g) => g.members.includes(mainGroupCategory.id))
                        const isStandalone = !currentGroup
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (currentGroup) {
                                removeFromGroup(currentGroup.id, mainGroupCategory.id)
                              }
                              setMainGroupCategory(null)
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99]",
                              isStandalone
                                ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold shadow-xs"
                                : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface-tint)]"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]">
                                <Tag size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold">
                                  {lang === "EN" ? "None (Standalone)" : "Tiada Kumpulan (Bebas)"}
                                </p>
                                <p className="text-[10px] font-semibold text-[var(--muted)]">
                                  {lang === "EN" ? "Show directly in category list" : "Papar terus dalam senarai"}
                                </p>
                              </div>
                            </div>
                            {isStandalone && (
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)]">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        )
                      })()}

                      {/* Existing Groups Options */}
                      {groups.map((g) => {
                        const isAssigned = g.members.includes(mainGroupCategory.id)
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              addToGroup(g.id, mainGroupCategory.id)
                              setMainGroupCategory(null)
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99]",
                              isAssigned
                                ? "border-[var(--text)] bg-[var(--surface-tint-strong)] text-[var(--text)] font-bold shadow-xs"
                                : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface-tint)]"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]">
                                <FolderTree size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold">{g.name}</p>
                                <p className="text-[10px] font-semibold text-[var(--muted)]">
                                  {g.members.length} {lang === "EN" ? "categories" : "kategori"}
                                </p>
                              </div>
                            </div>
                            {isAssigned && (
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)]">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Create New Group Card */}
                  <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3.5 space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] opacity-80">
                      {lang === "EN" ? "+ Create & Assign to New Group" : "+ Cipta & Masukkan ke Kumpulan Baru"}
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={newGroupNameForCat}
                        onChange={(e) => setNewGroupNameForCat(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newGroupNameForCat.trim()) {
                            const trimmed = newGroupNameForCat.trim()
                            const newId = `g${Date.now()}`
                            setGroups((prev) => [
                              ...prev.map((g) => ({
                                ...g,
                                members: g.members.filter((m) => m !== mainGroupCategory.id),
                              })),
                              { id: newId, name: trimmed, members: [mainGroupCategory.id] },
                            ])
                            setNewGroupNameForCat("")
                            setMainGroupCategory(null)
                          }
                        }}
                        placeholder={lang === "EN" ? "e.g. Bills & Utilities" : "cth. Bil & Utiliti"}
                        className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--border-strong)]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newGroupNameForCat.trim()
                          if (!trimmed) return
                          const newId = `g${Date.now()}`
                          setGroups((prev) => [
                            ...prev.map((g) => ({
                              ...g,
                              members: g.members.filter((m) => m !== mainGroupCategory.id),
                            })),
                            { id: newId, name: trimmed, members: [mainGroupCategory.id] },
                          ])
                          setNewGroupNameForCat("")
                          setMainGroupCategory(null)
                        }}
                        disabled={!newGroupNameForCat.trim()}
                        className="flex shrink-0 items-center gap-1 rounded-2xl bg-[var(--text)] px-4 py-2.5 text-xs font-black text-[var(--bg)] shadow-xs transition-all active:scale-95 disabled:opacity-40"
                      >
                        <Plus size={14} />
                        <span>{lang === "EN" ? "Create" : "Cipta"}</span>
                      </button>
                    </div>
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
