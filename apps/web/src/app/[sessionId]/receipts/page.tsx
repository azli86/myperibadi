"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Loader2,
  Search,
  X,
} from "lucide-react"
import { SmartImage } from "@/components/ui/SmartImage"
import { useParams } from "next/navigation"
import { useTheme } from "@/components/theme/ThemeProvider"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useLang } from "@/lib/lang"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { fetchApiJson, readApiCache } from "@/lib/api-cache"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type ReceiptTransaction = {
  id: number
  amount: number | null
  txn_date: string | null
  vendor_or_source: string | null
  category_id: number | null
  category_name: string | null
  notes: string | null
}

type ReceiptItem = {
  id: number
  transaction_id: number
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  proxy_url: string
  direct_url: string | null
  created_at: string
  transaction: ReceiptTransaction
}

type CategoryOption = {
  id: number
  name: string
  icon_name?: string | null
  kind?: string
}

const formatCurrency = (value: number) =>
  `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const normalizeAttachmentUrl = (rawUrl: string) => {
  if (!rawUrl) return rawUrl
  if (rawUrl.startsWith("/attachments/")) return `/api${rawUrl}`
  return rawUrl
}

export default function ReceiptsPage() {
  const params = useParams()
  const sessionId = params.sessionId as string || ""
  const { lang, t, timezone } = useLang()
  const { resolvedTheme } = useTheme()
  const isLightTheme = resolvedTheme === "light"
  const { showAlert } = usePageAlert(lang)

  const currentMonthKey = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        timeZone: timezone,
      }).format(new Date())
    } catch {
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
      }).format(new Date())
    }
  }, [timezone])

  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [query, setQuery] = useState("")
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [receipts, setReceipts] = useState<ReceiptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)
  const [activeReceipt, setActiveReceipt] = useState<ReceiptItem | null>(null)
  const [activeMediaUrl, setActiveMediaUrl] = useState("")
  const [activeMediaLoading, setActiveMediaLoading] = useState(false)
  const [activeMediaError, setActiveMediaError] = useState("")
  const [mobileFiltersHidden, setMobileFiltersHidden] = useState(false)
  const [mobileMonthOpen, setMobileMonthOpen] = useState(false)
  const galleryScrollTopRef = React.useRef(0)
  const showDataSkeleton = useDelayedSkeleton(loading)

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (
      typeof err === "object" &&
      err &&
      "message" in err &&
      typeof (err as { message?: unknown }).message === "string"
    ) {
      return (err as { message: string }).message
    }
    return fallback
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const token = getAccessToken()
    fetch(`/api/categories`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => (Array.isArray(data) ? setCategories(data) : setCategories([])))
      .catch(() => setCategories([]))
  }, [])

  const loadReceipts = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const token = getAccessToken()
      const paramsSearch = new URLSearchParams()
      paramsSearch.set("month_key", monthKey)
      paramsSearch.set("limit", "200")
      if (categoryId !== null) paramsSearch.set("category_id", String(categoryId))
      if (query.trim()) paramsSearch.set("q", query.trim())
      const url = `/api/receipts?${paramsSearch.toString()}`

      const cached = readApiCache<ReceiptItem[]>(url, token)
      if (cached) {
        setReceipts(Array.isArray(cached) ? cached : [])
        setLoading(false)
      }

      const result = await fetchApiJson<ReceiptItem[]>(url, token)
      setReceipts(Array.isArray(result) ? result : [])
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          lang === "EN" ? "Failed to load receipts." : "Gagal muat resit.",
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [lang, monthKey, categoryId, query])

  useEffect(() => {
    loadReceipts()
  }, [loadReceipts])

  useEffect(() => {
    const hidden = Boolean(activeReceipt)
    window.dispatchEvent(
      new CustomEvent("portal:mobile-bottom-nav-visibility", {
        detail: { hidden },
      }),
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("portal:mobile-bottom-nav-visibility", {
          detail: { hidden: false },
        }),
      )
    }
  }, [activeReceipt])

  useEffect(() => {
    if (!activeReceipt) {
      setActiveMediaUrl("")
      setActiveMediaError("")
      return
    }

    const controller = new AbortController()
    let objectUrl = ""
    let cancelled = false

    const loadMedia = async () => {
      setActiveMediaLoading(true)
      setActiveMediaError("")
      setActiveMediaUrl("")

      const waitForImage = (url: string) =>
        new Promise<void>((resolve, reject) => {
          const img = new window.Image()
          img.onload = () => resolve()
          img.onerror = () => reject(new Error("Image not ready"))
          img.src = url
        })

      // Prefer probing direct CDN URL first; fall back to proxy if still propagating after upload
      if (activeReceipt.mime_type?.startsWith("image/") && activeReceipt.direct_url) {
        let lastImageError: unknown = null
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (controller.signal.aborted || cancelled) return
          try {
            const probeUrl = attempt > 0
              ? `${activeReceipt.direct_url}${activeReceipt.direct_url.includes("?") ? "&" : "?"}_retry=${attempt}`
              : activeReceipt.direct_url
            await waitForImage(probeUrl)
            if (!cancelled) {
              setActiveMediaUrl(probeUrl)
              setActiveMediaLoading(false)
            }
            return
          } catch (err) {
            lastImageError = err
            await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)))
          }
        }
        // Continue to proxy fetch below if CDN still not ready
        if (lastImageError && controller.signal.aborted) return
      }

      const token = getAccessToken()
      const url = activeReceipt.mime_type === "application/pdf"
        ? `/api/attachments/${activeReceipt.id}/pdf-preview`
        : normalizeAttachmentUrl(activeReceipt.proxy_url)
      let lastError: unknown = null

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const retryUrl = attempt > 0
            ? `${url}${url.includes("?") ? "&" : "?"}_retry=${attempt}`
            : url
          const response = await fetch(retryUrl, {
            cache: "no-store",
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(`Media request failed (${response.status})`)
          const blob = await response.blob()
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setActiveMediaUrl(objectUrl)
          return
        } catch (err) {
          if (controller.signal.aborted) return
          lastError = err
          await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)))
        }
      }

      if (!cancelled) {
        setActiveMediaError(getErrorMessage(lastError, lang === "EN" ? "Unable to load this file." : "Fail ini tidak dapat dimuatkan."))
      }
    }

    void loadMedia().finally(() => {
      if (!cancelled) setActiveMediaLoading(false)
    })

    return () => {
      cancelled = true
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [activeReceipt, lang])

  const closeLightbox = React.useCallback(() => setActiveReceipt(null), [])
  const { requestClose: requestLightboxClose } = useOverlayBackClose({
    id: "receipts-lightbox",
    isOpen: Boolean(activeReceipt),
    onClose: closeLightbox,
  })

  // Lock background scroll while lightbox is open; always restore on close.
  React.useEffect(() => {
    if (!activeReceipt || typeof document === "undefined") return
    const scrollY = window.scrollY
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overscroll: document.body.style.overscrollBehavior,
      htmlOverscroll: document.documentElement.style.overscrollBehavior,
    }
    document.body.style.overflow = "hidden"
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = "100%"
    document.body.style.overscrollBehavior = "none"
    document.documentElement.style.overscrollBehavior = "none"
    return () => {
      document.body.style.overflow = prev.overflow
      document.body.style.position = prev.position
      document.body.style.top = prev.top
      document.body.style.width = prev.width
      document.body.style.overscrollBehavior = prev.overscroll
      document.documentElement.style.overscrollBehavior = prev.htmlOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [activeReceipt])

  const monthLabel = useMemo(() => {
    const [yearText, monthText] = monthKey.split("-")
    const year = Number(yearText)
    const month = Number(monthText)
    try {
      return new Intl.DateTimeFormat(lang === "EN" ? "en-MY" : "ms-MY", {
        month: "long",
        year: "numeric",
        timeZone: timezone,
      }).format(new Date(Date.UTC(year, month - 1, 1)))
    } catch {
      return monthKey
    }
  }, [lang, monthKey, timezone])

  const monthPickerLabel =
    monthKey === currentMonthKey
      ? lang === "EN"
        ? "This Month"
        : "Bulan Ini"
      : monthLabel

  const mobileMonthOptions = useMemo(() => {
    const selectedYear = Number(monthKey.split("-")[0]) || new Date().getFullYear()
    return Array.from({ length: 12 }, (_, index) => {
      const value = `${selectedYear}-${String(index + 1).padStart(2, "0")}`
      let label = new Intl.DateTimeFormat(lang === "EN" ? "en-MY" : "ms-MY", {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(selectedYear, index, 1)))
      label = label.replace(".", "")
      return { value, label }
    })
  }, [lang, monthKey])

  const mobileMonthLabel = mobileMonthOptions.find((month) => month.value === monthKey)?.label || monthKey.slice(5)

  const isImage = (receipt: ReceiptItem) =>
    (receipt.mime_type || "").startsWith("image/")
  const isPdf = (receipt: ReceiptItem) =>
    receipt.mime_type === "application/pdf"

  const openReceipt = (receipt: ReceiptItem) => {
    setActiveReceipt(receipt)
  }

  const monthInputRef = useRef<HTMLInputElement>(null)

  const openNativeMonthPicker = () => {
    const el = monthInputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === "function") {
        void el.showPicker()
        return
      }
    } catch {
      // showPicker may throw outside a trusted gesture / unsupported context
    }
    el.focus()
    el.click()
  }

  const activeCategory = activeReceipt?.transaction.category_id
    ? categories.find((c) => c.id === activeReceipt.transaction.category_id)
    : null

  const handleGalleryScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const currentTop = event.currentTarget.scrollTop
    const previousTop = galleryScrollTopRef.current
    const delta = currentTop - previousTop

    if (currentTop < 16) {
      setMobileFiltersHidden(false)
    } else if (delta > 7) {
      setMobileFiltersHidden(true)
    } else if (delta < -7) {
      setMobileFiltersHidden(false)
    }

    galleryScrollTopRef.current = currentTop
  }

  // Mobile gallery uses document scroll — keep filter auto-hide working.
  React.useEffect(() => {
    if (typeof window === "undefined") return
    let previousTop = window.scrollY || 0
    const onScroll = () => {
      const currentTop = window.scrollY || 0
      const delta = currentTop - previousTop
      if (currentTop < 16) {
        setMobileFiltersHidden(false)
      } else if (delta > 7) {
        setMobileFiltersHidden(true)
      } else if (delta < -7) {
        setMobileFiltersHidden(false)
      }
      previousTop = currentTop
      galleryScrollTopRef.current = currentTop
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="relative max-w-full text-[var(--text)] md:min-h-[calc(100vh-4rem)] md:overflow-x-hidden">
      {/* Mobile Layout — use page scroll (avoid nested scroll trap) */}
      <div className="flex flex-col md:hidden">
        <div className="mb-4 shrink-0">
          <MobilePageHeader
            title={t.receipts}
            fallbackHref={`/${sessionId}`}
            action={
              <div className="relative">
                <DesktopPageAction
                  type="button"
                  onClick={() => setMobileMonthOpen((open) => !open)}
                  aria-label={lang === "EN" ? "Select month" : "Pilih bulan"}
                >
                  {mobileMonthLabel}
                  <ChevronDown className={cn("transition-transform", mobileMonthOpen && "rotate-180")} strokeWidth={2.5} />
                </DesktopPageAction>
                {mobileMonthOpen && (
                  <>
                    <button
                      type="button"
                      aria-label={lang === "EN" ? "Close month menu" : "Tutup menu bulan"}
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setMobileMonthOpen(false)}
                    />
                    <div className="absolute right-0 top-10 z-40 w-56 rounded-3xl border border-[var(--border)] bg-[var(--sheet-bg)] p-2.5 shadow-2xl shadow-black/20">
                      <div className="mb-2 px-1 text-[0.625rem] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {monthKey.slice(0, 4)}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {mobileMonthOptions.map((month) => (
                          <button
                            key={month.value}
                            type="button"
                            onClick={() => {
                              setMonthKey(month.value)
                              setMobileMonthOpen(false)
                            }}
                            className={cn(
                              "h-9 rounded-xl text-xs font-bold transition active:scale-95",
                              month.value === monthKey
                                ? "bg-[var(--text)] text-[var(--bg)]"
                                : "bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)]",
                            )}
                          >
                            {month.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            }
          />
        </div>

        <div
          className={cn(
            "shrink-0 overflow-hidden transition-all duration-300 ease-out",
            mobileFiltersHidden
              ? "pointer-events-none max-h-0 -translate-y-3 opacity-0"
              : "max-h-28 translate-y-0 pb-4 opacity-100",
          )}
        >
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-tint)] px-3 ring-1 ring-inset ring-[var(--border)]/50">
            <Search size={16} className="shrink-0 text-[var(--muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === "EN" ? "Search vendor or notes" : "Cari vendor atau nota"}
              className="h-11 w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-[var(--muted)]">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="mt-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-2 pb-px">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3 text-[0.6875rem] font-bold transition-all",
                  categoryId === null
                    ? "bg-[var(--text)] text-[var(--bg)]"
                    : "bg-[var(--surface-tint)] text-[var(--muted)]",
                )}
              >
                {lang === "EN" ? "All" : "Semua"}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.6875rem] font-bold transition-all",
                    categoryId === cat.id
                      ? "bg-[var(--text)] text-[var(--bg)]"
                      : "bg-[var(--surface-tint)] text-[var(--muted)]",
                  )}
                >
                  <CategoryIconGlyph iconName={cat.icon_name} categoryName={cat.name} kind={cat.kind === "income" ? "income" : "expense"} size={14} />
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="pb-24"
        >
          {renderGallery(true)}
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden min-w-0 flex-col md:flex">
        <DesktopPageHeader
          title={t.receipts}
          homeHref={`/${sessionId}`}
          actions={
            <div className="relative z-[60]">
              <DesktopPageAction type="button" onClick={openNativeMonthPicker}>
                <Calendar strokeWidth={2.5} />
                {monthPickerLabel}
                <ChevronLeft className="rotate-90" strokeWidth={2.5} />
              </DesktopPageAction>
              <input
                ref={monthInputRef}
                type="month"
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                tabIndex={-1}
                aria-hidden
                className="pointer-events-none absolute left-0 top-full h-px w-px opacity-0"
              />
            </div>
          }
        />

        <DesktopPageBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 sm:flex-1">
              <Search size={16} className="shrink-0 text-[var(--muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lang === "EN" ? "Search vendor or notes" : "Cari vendor atau nota"}
                className="h-11 w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="text-[var(--muted)]">
                  <X size={16} />
                </button>
              )}
            </div>
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="h-11 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--text)] outline-none"
            >
              <option value="">{lang === "EN" ? "All categories" : "Semua kategori"}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {renderGallery(false)}
        </DesktopPageBody>
      </div>

      {/* Lightbox */}
      {mounted && activeReceipt
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center overflow-hidden overscroll-none bg-black/80 p-0 md:p-6"
              onClick={requestLightboxClose}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden bg-[var(--sheet-bg)] md:h-[90vh] md:rounded-3xl"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {activeCategory && (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)]">
                        <CategoryIconGlyph
                          iconName={activeCategory.icon_name}
                          categoryName={activeCategory.name}
                          kind={activeCategory.kind === "income" ? "income" : "expense"}
                          size={20}
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--text)]">
                        {activeReceipt.transaction.vendor_or_source ||
                          activeReceipt.file_name ||
                          (lang === "EN" ? "Receipt" : "Resit")}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {activeReceipt.transaction.category_name ||
                          (lang === "EN" ? "Uncategorized" : "Tiada kategori")}
                        {activeReceipt.transaction.txn_date
                          ? ` · ${activeReceipt.transaction.txn_date}`
                          : ""}
                        {activeReceipt.transaction.amount != null
                          ? ` · ${formatCurrency(activeReceipt.transaction.amount)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={requestLightboxClose}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-2 text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="relative min-h-0 flex-1 bg-black/40">
                  {activeMediaLoading ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-white/80">
                      <Loader2 size={28} className="animate-spin" />
                      <p className="text-xs font-semibold">{lang === "EN" ? "Loading media..." : "Memuatkan media..."}</p>
                    </div>
                  ) : activeMediaError ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
                      <AlertTriangle size={36} className="text-amber-400" />
                      <p className="max-w-sm text-sm font-semibold">{activeMediaError}</p>
                      <a
                        href={normalizeAttachmentUrl(activeReceipt.proxy_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-black"
                      >
                        {lang === "EN" ? "Open original file" : "Buka fail asal"}
                      </a>
                    </div>
                  ) : activeMediaUrl && isImage(activeReceipt) ? (
                    <SmartImage
                      src={activeMediaUrl}
                      alt={activeReceipt.file_name}
                      loading="eager"
                      imgClassName="h-full w-full object-contain"
                    />
                  ) : activeMediaUrl && isPdf(activeReceipt) ? (
                    <SmartImage
                      src={activeMediaUrl}
                      alt={`${activeReceipt.file_name} PDF preview`}
                      loading="eager"
                      imgClassName="h-full w-full bg-white object-contain"
                    />
                  ) : activeMediaUrl ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text)]">
                      <FileText size={48} className="opacity-40" />
                      <p className="text-sm font-semibold">{activeReceipt.file_name}</p>
                      <a
                        href={activeMediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-2xl bg-[var(--text)] px-4 py-2 text-sm font-bold text-[var(--bg)]"
                      >
                        {lang === "EN" ? "Open file" : "Buka fail"}
                      </a>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
                  <p className="min-w-0 truncate text-xs text-[var(--muted)]">
                    {activeReceipt.transaction.notes ||
                      activeReceipt.file_name}
                  </p>
                  {isPdf(activeReceipt) && activeMediaUrl && (
                    <a
                      href={activeReceipt.direct_url || normalizeAttachmentUrl(activeReceipt.proxy_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm font-bold text-[var(--text)]"
                    >
                      {lang === "EN" ? "Open PDF" : "Buka PDF"}
                    </a>
                  )}
                  <a
                    href={`/${sessionId}/transactions/${activeReceipt.transaction.id}`}
                    className="flex shrink-0 items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-sm font-bold text-[var(--text)] transition hover:text-[var(--text)]"
                  >
                    {lang === "EN" ? "View transaction" : "Lihat transaksi"}
                    <ChevronRight size={16} />
                  </a>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {error && receipts.length === 0 ? (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-500 md:bottom-8">
          {error}
        </div>
      ) : null}
    </div>
  )

  function renderGallery(mobile: boolean) {
    if (loading && showDataSkeleton) {
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-2xl bg-[var(--surface-tint-strong)]"
            />
          ))}
        </div>
      )
    }

    if (error && receipts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-[var(--card)] py-20 text-center">
          <AlertTriangle size={32} className="mb-4 text-rose-500/50" />
          <p className="text-sm font-medium text-[var(--text)]">
            {lang === "EN" ? "Something went wrong" : "Sesuatu tidak kena"}
          </p>
          <button
            type="button"
            onClick={() => loadReceipts()}
            className="mt-3 rounded-2xl bg-[var(--text)] px-4 py-2 text-sm font-bold text-[var(--bg)]"
          >
            {lang === "EN" ? "Retry" : "Cuba lagi"}
          </button>
        </div>
      )
    }

    if (receipts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-[var(--card)] py-20 text-center text-[var(--text)]">
          <ImageIcon size={32} className="mb-4 opacity-20" />
          <h4 className="text-lg font-medium">
            {lang === "EN" ? "No receipts yet" : "Tiada resit lagi"}
          </h4>
          <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-[var(--muted)]">
            {lang === "EN"
              ? "Upload a receipt to a transaction and it will appear here."
              : "Muat naik resit ke transaksi dan ia akan muncul di sini."}
          </p>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {receipts.map((receipt) => {
          const vendor = receipt.transaction.vendor_or_source || receipt.file_name
          const sub = receipt.transaction.txn_date || receipt.transaction.category_name || "-"
          return (
            <button
              key={receipt.id}
              type="button"
              onClick={() => openReceipt(receipt)}
              className={cn(
                "group text-left",
                !mobile && "transition-transform duration-300 hover:-translate-y-1",
              )}
            >
              <div className={cn(
                "relative aspect-[3/4] overflow-hidden border border-[var(--border)] bg-[var(--surface-tint)] shadow-sm shadow-black/[0.04]",
                !mobile && "transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/15",
              )}>
                {isImage(receipt) ? (
                  <SmartImage
                    src={receipt.direct_url || normalizeAttachmentUrl(receipt.proxy_url)}
                    fallbackSrc={normalizeAttachmentUrl(receipt.proxy_url)}
                    alt={receipt.file_name}
                    showMissingLabel
                    imgClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : isPdf(receipt) ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-rose-500/[0.08] text-rose-500">
                    <FileText size={30} />
                    <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[0.5625rem] font-bold uppercase tracking-wider">PDF</span>
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--muted)]">
                    <FileText size={30} />
                    <span className="px-2 text-center text-[0.625rem] font-semibold uppercase tracking-wider">
                      {lang === "EN" ? "File" : "Fail"}
                    </span>
                  </div>
                )}

                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
                  {receipt.transaction.category_name ? (
                    <span className="rounded-full bg-black/45 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                      {receipt.transaction.category_name}
                    </span>
                  ) : (
                    <span />
                  )}
                  {isPdf(receipt) && (
                    <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[0.5rem] font-black uppercase tracking-wider text-white">
                      PDF
                    </span>
                  )}
                </div>

                <div className="absolute inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[var(--text)]">
                  <p className="truncate text-xs font-bold leading-tight">
                    {vendor}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[0.625rem] font-medium text-[var(--muted)]">
                      {sub}
                    </span>
                    {receipt.transaction.amount != null && (
                      <span className="shrink-0 text-[0.625rem] font-bold">
                        {formatCurrency(receipt.transaction.amount)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }
}
