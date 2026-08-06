"use client"

import { getAccessToken } from "@/lib/auth-session"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Wallet,
  MessageCircle,
  Check,
  ArrowRightLeft,
  X,
  ChevronRight,
  Users,
  Star,
  Search,
  Upload,
  Landmark,
  Smartphone,
  CreditCard,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { usePageAlert } from "@/hooks/usePageAlert"
import { cn } from "@/lib/utils"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageHeader,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { MoneyAmount, formatCurrencyLabel, currencyFlag } from "@/components/ui/MoneyAmount"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"

type WalletKind = "cash" | "bank" | "bank_digital" | "ewallet" | "credit_card" | "shared"

type WalletItem = {
  id: number
  name: string
  label: string
  card_color: string
  image_url: string
  currency: string
  balance: number
  type: WalletKind
  is_bot_default: boolean
  transaction_count: number
}

type WalletApiResponse = Partial<WalletItem> & {
  id: number
}

type DraftWallet = {
  name: string
  label: string
  card_color: string
  image_url: string
  type: WalletKind
  currency: string
  is_bot_default: boolean
}

type FilterTab = "all" | WalletKind

const WALLET_TYPE_OPTIONS: { value: Exclude<WalletKind, "shared">; bm: string; en: string }[] = [
  { value: "cash", bm: "Tunai", en: "Cash" },
  { value: "bank", bm: "Bank", en: "Bank" },
  { value: "bank_digital", bm: "Bank Digital", en: "Digital Bank" },
  { value: "ewallet", bm: "E-Wallet", en: "E-Wallet" },
  { value: "credit_card", bm: "Kad Kredit", en: "Credit Card" },
]

function normalizeWalletType(raw?: string | null): WalletKind {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")
  if (value === "shared") return "shared"
  if (value === "cash" || value === "tunai") return "cash"
  if (value === "bank_digital" || value === "digital_bank" || value === "digital") return "bank_digital"
  if (value === "ewallet" || value === "e_wallet") return "ewallet"
  if (value === "credit_card" || value === "credit" || value === "credit_kad" || value === "kad_kredit") {
    return "credit_card"
  }
  // legacy personal → bank
  return "bank"
}

function walletTypeLabel(type: WalletKind, isBm: boolean) {
  if (type === "shared") return isBm ? "Bersama" : "Shared"
  const opt = WALLET_TYPE_OPTIONS.find((o) => o.value === type)
  return opt ? (isBm ? opt.bm : opt.en) : type
}

function walletTypeIcon(type: string) {
  if (type === "bank" || type === "bank_digital") return Landmark
  if (type === "ewallet") return Smartphone
  if (type === "credit_card") return CreditCard
  return Wallet
}

const DEFAULT_DRAFT: DraftWallet = {
  name: "",
  label: "",
  card_color: "indigo",
  image_url: "",
  type: "cash",
  currency: "RM",
  is_bot_default: false,
}

function toWalletPayload(wallet: DraftWallet | WalletItem) {
  return {
    name: wallet.name.trim(),
    label: wallet.label.trim(),
    card_color: wallet.card_color.trim(),
    image_url: wallet.image_url.trim(),
    type: wallet.type,
    currency: wallet.currency.trim().toUpperCase(),
    is_bot_default: wallet.is_bot_default,
  }
}

const CARD_ACCENTS = [
  { key: "indigo", label: "Indigo", color: "#4f46e5", dark: "#3730a3", from: "#6366f1", to: "#3730a3", soft: "#eef2ff" },
  { key: "pink", label: "Pink", color: "#db2777", dark: "#9d174d", from: "#ec4899", to: "#9d174d", soft: "#fdf2f8" },
  { key: "amber", label: "Amber", color: "#d97706", dark: "#92400e", from: "#f59e0b", to: "#92400e", soft: "#fffbeb" },
  { key: "emerald", label: "Emerald", color: "#059669", dark: "#065f46", from: "#10b981", to: "#065f46", soft: "#ecfdf5" },
  { key: "cyan", label: "Cyan", color: "#0891b2", dark: "#155e75", from: "#06b6d4", to: "#155e75", soft: "#ecfeff" },
  { key: "violet", label: "Violet", color: "#7c3aed", dark: "#5b21b6", from: "#8b5cf6", to: "#5b21b6", soft: "#f5f3ff" },
]

function getWalletAccent(wallet: Pick<WalletItem, "id" | "card_color"> | null) {
  if (wallet?.card_color) {
    const selectedAccent = CARD_ACCENTS.find((accent) => accent.key === wallet.card_color)
    if (selectedAccent) return selectedAccent
  }
  const fallbackIndex = Math.abs(wallet?.id ?? 0) % CARD_ACCENTS.length
  return CARD_ACCENTS[fallbackIndex]
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="text-right text-sm font-bold uppercase text-[var(--text)]">{value}</span>
    </div>
  )
}

/** Preview matches wallet list card (`renderWalletCard`) layout. */
function GlossyWalletPreview({
  accent,
  label,
  name,
  currency,
  balance,
  isBotDefault,
  txnCount,
  imageUrl,
  balanceLabel,
  recordsLabel,
}: {
  accent: (typeof CARD_ACCENTS)[number]
  label: string
  name: string
  type?: WalletKind
  currency: string
  balance: number | string
  isBotDefault?: boolean
  txnCount?: number
  imageUrl?: string
  balanceLabel: string
  sharedLabel?: string
  personalLabel?: string
  botLabel?: string
  recordsLabel: string
}) {
  return (
    <div
      className="relative flex h-[196px] w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 pb-6 shadow-sm"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent.from} 16%, var(--card)) 0%, color-mix(in srgb, ${accent.to} 8%, var(--card)) 100%)`,
      }}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="absolute -right-5 -top-8 h-[135%] w-[62%] rotate-[9deg] object-cover opacity-55 [mask-image:linear-gradient(to_right,transparent_0%,transparent_8%,black_55%)]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--card)] from-30% via-[var(--card)] via-52% to-transparent to-90%" />
          
        </>
      )}
      <div
        className="absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-10 blur-2xl"
        style={{ backgroundColor: accent.color }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="relative shrink-0">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)] shadow-sm">
            {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <Wallet size={19} />}
          </div>
          {isBotDefault ? (
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
          <p className="truncate text-sm font-black tracking-tight text-[var(--text)]">{label}</p>
        </div>
      </div>

      <div className="relative mt-5">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          {balanceLabel}
        </p>
        <p className="mt-1 truncate text-[var(--text)]">
          {typeof balance === "number" ? (
            <MoneyAmount value={balance} currency={currency} size="lg" className="text-[var(--text)]" />
          ) : (
            <span className="text-lg font-semibold tabular-nums tracking-tight text-[var(--text)]">
              <span className="mr-0.5 text-xs font-bold text-[var(--muted)]">
                {currencyFlag(currency)} {formatCurrencyLabel(currency)}
              </span>
              {balance}
            </span>
          )}
        </p>
      </div>

      <div className="relative mt-auto border-t border-[var(--border)] pt-3">
        <span className="truncate text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          Prefix: {name}
          {typeof txnCount === "number" && txnCount > 0
            ? ` · ${txnCount} ${recordsLabel}`
            : ""}
        </span>
      </div>
    </div>
  )
}

export default function WalletSettingsPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()

  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [draft, setDraft] = useState<DraftWallet>(DEFAULT_DRAFT)
  const [savingNew, setSavingNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const showDataSkeleton = useDelayedSkeleton(loading)
  const [busyWalletId, setBusyWalletId] = useState<number | null>(null)
  const [uploadingWalletId, setUploadingWalletId] = useState<number | null>(null)
  const [uploadingDraftImage, setUploadingDraftImage] = useState(false)
  const [activeWallet, setActiveWallet] = useState<WalletItem | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showCreateWalletModal, setShowCreateWalletModal] = useState(false)
  const [createWalletStep, setCreateWalletStep] = useState<1 | 2 | 3>(1)
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [query, setQuery] = useState("")

  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  function closeCreateWalletModal() {
    setShowCreateWalletModal(false)
    setCreateWalletStep(1)
    setDraft(DEFAULT_DRAFT)
  }

  const { requestClose: requestCreateWalletClose } = useOverlayBackClose({ id: "wallet-create", isOpen: showCreateWalletModal, onClose: closeCreateWalletModal })
  const { requestClose: requestWalletDetailClose } = useOverlayBackClose({ id: "wallet-detail", isOpen: Boolean(activeWallet), onClose: () => setActiveWallet(null) })
  const createWalletSheetSwipe = useSwipeDownToClose(requestCreateWalletClose)
  const walletDetailSheetSwipe = useSwipeDownToClose(requestWalletDetailClose)

  useEffect(() => {
    setMounted(true)
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const token = getAccessToken()
      const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch("/api/wallets", { headers })
      if (res.ok) {
        const data = await res.json()
        const normalized: WalletItem[] = Array.isArray(data)
          ? data.map((wallet: WalletApiResponse) => ({
              id: wallet.id,
              name: wallet.name || "",
              label: wallet.label || wallet.name || "",
              card_color: wallet.card_color || "",
              image_url: wallet.image_url || "",
              balance: wallet.balance || 0,
              type: normalizeWalletType(wallet.type),
              currency: (wallet.currency || "RM").toUpperCase(),
              is_bot_default: !!wallet.is_bot_default,
              transaction_count: wallet.transaction_count || 0,
            }))
          : []
        setWallets(normalized)
      }
    } catch (err) {
      console.error("Failed loading data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const hidden = showCreateWalletModal || Boolean(activeWallet)
    window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden } }))
    return () => {
      window.dispatchEvent(new CustomEvent("portal:mobile-bottom-nav-visibility", { detail: { hidden: false } }))
    }
  }, [showCreateWalletModal, activeWallet])

  async function createWallet() {
    if (!draft.name.trim() || !draft.label.trim()) return
    setSavingNew(true)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/wallets", {
        credentials: "include",
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toWalletPayload(draft)),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        showAlert(
          tr("Gagal Tambah Dompet", "Failed to Add Wallet"),
          data?.detail || tr("Dompet tidak dapat disimpan.", "The wallet could not be saved."),
          "error",
        )
        return
      }
      closeCreateWalletModal()
      await loadData()
    } catch (err) {
      console.error(err)
      showAlert(
        tr("Ralat", "Error"),
        tr("Ralat teknikal berlaku semasa menambah dompet.", "A technical error occurred while adding the wallet."),
        "error",
      )
    } finally {
      setSavingNew(false)
    }
  }

  function openWalletModal(wallet: WalletItem) {
    setActiveWallet({ ...wallet })
  }
  function openCreateWalletModal() {
    setDraft(DEFAULT_DRAFT)
    setCreateWalletStep(1)
    setShowCreateWalletModal(true)
  }
  function goToNextCreateWalletStep() {
    setCreateWalletStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev))
  }
  function goToPreviousCreateWalletStep() {
    setCreateWalletStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev))
  }
  function updateActiveWallet(patch: Partial<WalletItem>) {
    setActiveWallet((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  async function saveWallet(wallet: WalletItem) {
    if (!wallet.label.trim() || !wallet.name.trim()) {
      showAlert(
        tr("Maklumat Tak Lengkap", "Incomplete Details"),
        tr("Sila isi nama dompet dan prefix bot terlebih dahulu.", "Please fill in both the wallet name and bot prefix first."),
        "warning",
      )
      return false
    }
    setBusyWalletId(wallet.id)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/wallets/${wallet.id}`, {
        credentials: "include",
        method: "PATCH",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toWalletPayload(wallet)),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        showAlert(
          tr("Gagal Simpan", "Save Failed"),
          data?.detail || tr("Tetapan dompet tidak dapat disimpan.", "The wallet settings could not be saved."),
          "error",
        )
        return false
      }
      showAlert(
        tr("Dompet Disimpan", "Wallet Saved"),
        tr(
          `Tetapan untuk ${wallet.label || wallet.name} telah berjaya disimpan.`,
          `Settings for ${wallet.label || wallet.name} have been saved successfully.`,
        ),
        "success",
      )
      await loadData()
      return true
    } catch (err) {
      console.error(err)
      showAlert(
        tr("Ralat", "Error"),
        tr("Ralat teknikal berlaku semasa menyimpan dompet.", "A technical error occurred while saving the wallet."),
        "error",
      )
      return false
    } finally {
      setBusyWalletId(null)
    }
  }

  async function deleteWallet(walletId: number) {
    showConfirm(
      tr("Padam Dompet?", "Delete Wallet?"),
      tr("Tindakan ini tidak boleh diundur. Adakah anda pasti?", "This action cannot be undone. Are you sure?"),
      async () => {
        setBusyWalletId(walletId)
        try {
          const token = getAccessToken()
          const res = await fetch(`/api/wallets/${walletId}`, {
            credentials: "include",
            method: "DELETE",
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          })
          if (!res.ok) {
            const data = await res.json()
            showAlert(
              tr("Gagal Padam", "Delete Failed"),
              data.detail || tr("Ralat memadam dompet", "Error deleting wallet"),
              "error",
            )
            return
          }
          loadData()
          setActiveWallet((prev) => (prev?.id === walletId ? null : prev))
          showAlert(tr("Dipadam", "Deleted"), tr("Dompet telah berjaya dipadam.", "Wallet has been deleted successfully."), "success")
        } catch (err) {
          console.error(err)
          showAlert(tr("Ralat", "Error"), tr("Ralat teknikal berlaku", "A technical error occurred"), "error")
        } finally {
          setBusyWalletId(null)
        }
      },
    )
  }

  async function uploadWalletImage(file: File, wallet: WalletItem) {
    if (file.size > 512 * 1024) return showAlert(tr("Fail terlalu besar", "File too large"), tr("Maksimum 512 KB.", "Maximum 512 KB."), "error")
    const previewUrl = URL.createObjectURL(file)
    setActiveWallet((current) => current?.id === wallet.id ? { ...current, image_url: previewUrl } : current)
    setUploadingWalletId(wallet.id)
    try {
      const form = new FormData(); form.append("file", file)
      const token = getAccessToken()
      const res = await fetch("/api/wallets/image-upload", { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || "Upload failed")
      setActiveWallet((current) => current?.id === wallet.id ? { ...current, image_url: `${data.url}${data.url.includes("?") ? "&" : "?"}v=${Date.now()}` } : current)
    } catch (error) {
      setActiveWallet((current) => current?.id === wallet.id ? { ...current, image_url: wallet.image_url } : current)
      showAlert(tr("Upload gagal", "Upload failed"), error instanceof Error ? error.message : "Upload failed", "error")
    } finally {
      URL.revokeObjectURL(previewUrl)
      setUploadingWalletId(null)
    }
  }

  async function uploadDraftWalletImage(file: File) {
    if (file.size > 512 * 1024) return showAlert(tr("Fail terlalu besar", "File too large"), tr("Maksimum 512 KB.", "Maximum 512 KB."), "error")
    const previewUrl = URL.createObjectURL(file)
    setDraft((current) => ({ ...current, image_url: previewUrl }))
    setUploadingDraftImage(true)
    try {
      const form = new FormData(); form.append("file", file)
      const token = getAccessToken()
      const res = await fetch("/api/wallets/image-upload", { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || "Upload failed")
      setDraft((current) => ({ ...current, image_url: `${data.url}${data.url.includes("?") ? "&" : "?"}v=${Date.now()}` }))
    } catch (error) {
      setDraft((current) => ({ ...current, image_url: "" }))
      showAlert(tr("Upload gagal", "Upload failed"), error instanceof Error ? error.message : "Upload failed", "error")
    } finally {
      URL.revokeObjectURL(previewUrl)
      setUploadingDraftImage(false)
    }
  }

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0)
  const cashCount = wallets.filter((w) => w.type === "cash").length
  const bankCount = wallets.filter((w) => w.type === "bank").length
  const bankDigitalCount = wallets.filter((w) => w.type === "bank_digital").length
  const ewalletCount = wallets.filter((w) => w.type === "ewallet").length
  const creditCardCount = wallets.filter((w) => w.type === "credit_card").length
  const sharedCount = wallets.filter((w) => w.type === "shared").length
  const defaultWallet = wallets.find((wallet) => wallet.is_bot_default) ?? wallets[0] ?? null
  const defaultWalletLabel = defaultWallet
    ? defaultWallet.label || defaultWallet.name || walletTypeLabel(defaultWallet.type, isBm)
    : tr("Tiada", "None")

  const filteredWallets = useMemo(() => {
    let list = [...wallets]
    if (filterTab !== "all") list = list.filter((w) => w.type === filterTab)
    const needle = query.trim().toLowerCase()
    if (needle) {
      list = list.filter(
        (w) =>
          w.label.toLowerCase().includes(needle) ||
          w.name.toLowerCase().includes(needle),
      )
    }
    return list.sort((a, b) => {
      if (a.is_bot_default !== b.is_bot_default) return a.is_bot_default ? -1 : 1
      return Math.abs(b.balance) - Math.abs(a.balance)
    })
  }, [wallets, filterTab, query])

  const draftAccent = getWalletAccent({ id: wallets.length + 1, card_color: draft.card_color })
  const selectedDraftAccent = CARD_ACCENTS.find((accent) => accent.key === draft.card_color) || draftAccent
  const createWalletSteps = [
    { id: 1 as const, label: tr("Warna", "Color") },
    { id: 2 as const, label: tr("Butiran", "Details") },
    { id: 3 as const, label: tr("Semak", "Review") },
  ]
  const canContinueCreateWallet =
    createWalletStep !== 2 || (draft.label.trim().length > 0 && draft.name.trim().length > 0)

  const filterToggle = (
    <div className="flex max-w-full flex-wrap gap-1">
      {(
        [
          { key: "all" as const, label: tr("Semua", "All"), count: wallets.length },
          { key: "cash" as const, label: tr("Tunai", "Cash"), count: cashCount },
          { key: "bank" as const, label: tr("Bank", "Bank"), count: bankCount },
          { key: "bank_digital" as const, label: tr("Digital", "Digital"), count: bankDigitalCount },
          { key: "ewallet" as const, label: tr("E-Wallet", "E-Wallet"), count: ewalletCount },
          { key: "credit_card" as const, label: tr("Kredit", "Credit"), count: creditCardCount },
          ...(sharedCount > 0
            ? [{ key: "shared" as const, label: tr("Bersama", "Shared"), count: sharedCount }]
            : []),
        ] as const
      ).map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setFilterTab(chip.key)}
          className={cn(
            "pill-base px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.1em]",
            filterTab === chip.key ? "bg-[var(--accent2)] text-[var(--btn-primary-text)]" : "text-[var(--muted)]",
          )}
        >
          {chip.label}
          <span className="ml-1 opacity-70">({chip.count})</span>
        </button>
      ))}
    </div>
  )

  const heroBlock = (desktop = false) => (
    <div
      className={cn(
        "wallet-hero relative overflow-hidden border border-[var(--border)] bg-[#1a1a1a] text-[#f5f5f5]",
        desktop ? "rounded-[1.75rem] p-6" : "rounded-[2rem] p-5",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-white/[0.04] blur-2xl" />

      <div className="relative flex min-h-24 flex-col items-center justify-center text-center md:min-h-28">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[#cbd5e1]">
          {tr("Jumlah Baki", "Total Balance")}
        </p>
        <div className="wallet-hero-amount mt-2 leading-none text-[#ffffff]">
          {showDataSkeleton ? (
            <AmountSkeleton className="h-7 w-32 bg-[rgba(255,255,255,0.12)]" />
          ) : (
            <MoneyAmount value={totalBalance} size={desktop ? "heroLg" : "hero"} className="text-[#ffffff]" currencyClassName="text-[#ffffff] opacity-55" />
          )}
        </div>
      </div>
    </div>
  )

  /** Same shape/layout as desktop dashboard wallet cards */
  const renderWalletCard = (wallet: WalletItem) => {
    const accent = getWalletAccent(wallet)
    const walletName = wallet.label || wallet.name
    const walletType = walletTypeLabel(wallet.type, isBm)

    return (
      <button
        key={wallet.id}
        type="button"
        onClick={() => openWalletModal(wallet)}
        className="group relative flex h-[196px] w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] p-5 pb-6 text-left shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]/25"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent.from} 16%, var(--card)) 0%, color-mix(in srgb, ${accent.to} 8%, var(--card)) 100%)`,
        }}
      >
        {wallet.image_url && (
          <>
            <img src={wallet.image_url} alt="" className="absolute -right-5 -top-8 h-[135%] w-[62%] rotate-[9deg] object-cover opacity-55 [mask-image:linear-gradient(to_right,transparent_0%,transparent_8%,black_55%)]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--card)] from-30% via-[var(--card)] via-52% to-transparent to-90%" />
            
          </>
        )}
        <div
          className="absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-10 blur-2xl"
          style={{ backgroundColor: accent.color }}
        />

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
            {tr("Baki", "Balance")}
          </p>
          <p className="mt-1 truncate text-[var(--text)]">
            <MoneyAmount value={wallet.balance} currency={wallet.currency} size="lg" className="text-[var(--text)]" />
          </p>
        </div>

        <div className="relative mt-auto flex items-center justify-between border-t border-[var(--border)] pt-3">
          <span className="truncate text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            Prefix: {wallet.name}
            {wallet.transaction_count > 0 ? ` · ${wallet.transaction_count} ${tr("rekod", "txns")}` : ""}
          </span>
          <ChevronRight size={16} className="shrink-0 text-[var(--muted)] opacity-60 transition group-hover:opacity-100" />
        </div>
      </button>
    )
  }

  const emptyState = (
    <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface-tint)]/15 px-6 py-12 text-center">
      <Wallet size={36} className="mx-auto text-[var(--muted)]/40" />
      <p className="mt-3 text-sm font-bold text-[var(--muted)]">
        {query || filterTab !== "all"
          ? tr("Tiada dompet dalam penapis ini.", "No wallets in this filter.")
          : tr("Belum ada dompet.", "No wallets yet.")}
      </p>
      {!query && filterTab === "all" && (
        <button
          type="button"
          onClick={openCreateWalletModal}
          className="mt-4 rounded-full bg-[var(--text)] px-4 py-2 text-[0.6875rem] font-black uppercase tracking-wider text-[var(--bg)] transition active:scale-95"
        >
          <Plus size={14} className="mr-1 inline" />
          {tr("Tambah Dompet", "Add Wallet")}
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ─── Mobile ─── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Dompet", "Wallets")}
          fallbackHref={`/${sessionId}/settings`}
          action={
            <button
              type="button"
              onClick={openCreateWalletModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--bg)] transition active:scale-[0.98]"
              aria-label={tr("Tambah Dompet", "Add Wallet")}
            >
              <Plus size={15} strokeWidth={2.5} />
              {tr("Tambah", "Add")}
            </button>
          }
        />

        <section className="px-1">{heroBlock(false)}</section>

        <div className="flex items-center justify-center gap-2 px-1">{filterToggle}</div>

        <div className="px-1">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Cari dompet...", "Search wallet...")}
              className="h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50"
            />
          </div>
        </div>

        <section className="px-1">
          {showDataSkeleton ? (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[196px] animate-pulse rounded-3xl border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : filteredWallets.length === 0 ? (
            emptyState
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {filteredWallets.map(renderWalletCard)}
              <button
                type="button"
                onClick={openCreateWalletModal}
                className="flex h-[196px] w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-tint)]/20 text-[var(--muted)] transition active:scale-[0.98] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)]">
                  <Plus size={20} strokeWidth={2} />
                </div>
                <span className="text-xs font-black uppercase tracking-wider">{tr("Tambah Dompet", "Add Wallet")}</span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ─── Desktop ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Papan Dompet", "Wallet Board")}
          homeHref={`/${sessionId}`}
          actions={
            <DesktopPageAction onClick={openCreateWalletModal}>
              <Plus strokeWidth={2.5} />
              {tr("Tambah Dompet", "Add Wallet")}
            </DesktopPageAction>
          }
        />

        <DesktopPageBody className="space-y-5">
        {heroBlock(true)}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {filterToggle}
          <div className="relative min-w-[220px] max-w-xs flex-1">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Cari dompet...", "Search wallet...")}
              className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)]/50"
            />
          </div>
        </div>

        <div>
          {showDataSkeleton ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[196px] animate-pulse rounded-3xl border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : filteredWallets.length === 0 ? (
            emptyState
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredWallets.map(renderWalletCard)}
              <button
                type="button"
                onClick={openCreateWalletModal}
                className="flex h-[196px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-tint)]/20 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)] active:scale-[0.98]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)]">
                  <Plus size={20} />
                </div>
                <span className="text-xs font-black uppercase tracking-wider">{tr("Tambah Dompet", "Add Wallet")}</span>
              </button>
            </div>
          )}
        </div>
        </DesktopPageBody>
      </div>

      {/* ─── Create Wallet Sheet ─── */}
      {mounted && showCreateWalletModal
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center md:p-4"
              onClick={requestCreateWalletClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                data-prevent-pull-refresh="true"
                onClick={(event) => event.stopPropagation()}
                data-swipe-sheet
                {...createWalletSheetSwipe}
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl will-change-transform md:max-h-[86vh] md:max-w-md md:rounded-[1.75rem]"
              >
                <div className="shrink-0 bg-[var(--sheet-bg)] px-5 py-4 md:px-6">
                  <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-[var(--surface-tint-strong)] md:hidden" />
                  {/* Header: Cancel left, title center, Next/Add right */}
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={requestCreateWalletClose}
                      className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <h3 className="min-w-0 flex-1 truncate text-center text-2xl font-black text-[var(--text)]">
                      {createWalletStep === 1
                        ? tr("Pilih Warna", "Choose Color")
                        : createWalletStep === 2
                          ? tr("Isi Maklumat", "Fill Details")
                          : tr("Semak Dompet", "Review Wallet")}
                    </h3>
                    <button
                      type="submit"
                      form="wallet-create-form"
                      disabled={savingNew || !canContinueCreateWallet}
                      className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {savingNew
                        ? tr("Menyimpan…", "Saving…")
                        : createWalletStep === 3
                          ? tr("Tambah", "Add")
                          : tr("Seterusnya", "Next")}
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {createWalletSteps.map((step) => (
                        <div
                          key={`bar-${step.id}`}
                          className={cn(
                            "h-1 rounded-full transition-all",
                            createWalletStep >= step.id ? "bg-[var(--text)]" : "bg-[var(--surface-tint-strong)]",
                          )}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[0.62rem] font-semibold text-[var(--muted)]">
                      {createWalletSteps.map((step) => (
                        <span
                          key={step.id}
                          className={cn(
                            "truncate transition-colors",
                            createWalletStep === step.id && "text-[var(--text)]",
                          )}
                        >
                          {step.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <form
                  id="wallet-create-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (createWalletStep < 3) {
                      goToNextCreateWalletStep()
                      return
                    }
                    void createWallet()
                  }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 md:px-6">
                    <GlossyWalletPreview
                      accent={draftAccent}
                      label={draft.label || tr("Nama pada Dompet", "Name on Wallet")}
                      name={draft.name || "cash"}
                      type={draft.type}
                      currency={draft.currency || "RM"}
                      balance="0.00"
                      isBotDefault={draft.is_bot_default}
                      imageUrl={draft.image_url}
                      balanceLabel={tr("Baki", "Balance")}
                      sharedLabel={tr("Bersama", "Shared")}
                      personalLabel={tr("Personal", "Personal")}
                      botLabel="BOT"
                      recordsLabel={tr("rekod", "txns")}
                    />

                    {createWalletStep === 1 && (
                      <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                          {tr("Warna kad", "Card color")}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          {CARD_ACCENTS.map((accent) => {
                            const isSelected = draft.card_color === accent.key
                            return (
                              <button
                                key={accent.key}
                                type="button"
                                onClick={() => setDraft((prev) => ({ ...prev, card_color: accent.key }))}
                                className={cn(
                                  "flex h-7 w-7 items-center justify-center rounded-full transition-all",
                                  isSelected
                                    ? "scale-105 ring-2 ring-[var(--text)] ring-offset-1 ring-offset-[var(--card)]"
                                    : "opacity-80 hover:opacity-100",
                                )}
                                aria-label={accent.label}
                                title={accent.label}
                                style={{ backgroundColor: accent.color }}
                              >
                                {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                              </button>
                            )
                          })}
                        </div>
                        <p className="mt-3 text-center text-sm font-bold text-[var(--text)]">{selectedDraftAccent.label}</p>
                      </div>
                    )}

                    {createWalletStep === 2 && (
                      <>
                        {/* Jenis card */}
                        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                            {tr("Jenis", "Type")}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {WALLET_TYPE_OPTIONS.map((opt) => {
                              const selected =
                                (draft.type === "shared" ? "cash" : draft.type) === opt.value
                              const Icon = walletTypeIcon(opt.value)
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    setDraft((prev) => ({ ...prev, type: opt.value }))
                                  }
                                  className={cn(
                                    "flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium transition active:scale-[0.98]",
                                    selected
                                      ? "bg-[var(--text)] text-[var(--bg)]"
                                      : "border border-[var(--border)] text-[var(--text)]",
                                  )}
                                >
                                  <Icon size={14} />
                                  {isBm ? opt.bm : opt.en}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Mata wang card */}
                        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                            {tr("Mata wang", "Currency")}
                          </p>
                          <input
                            value={draft.currency}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                currency: e.target.value.toUpperCase().slice(0, 5),
                              }))
                            }
                            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium uppercase tracking-[0.12em] outline-none focus:border-[var(--border-strong)]"
                            placeholder="RM"
                          />
                        </div>

                        {/* Nama pada dompet card */}
                        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                            {tr("Nama pada dompet", "Name on wallet")}
                          </p>
                          <input
                            value={draft.label}
                            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium outline-none focus:border-[var(--border-strong)]"
                            placeholder={tr("Contoh: Maybank Utama", "Example: Main Maybank")}
                          />
                        </div>

                        {/* Prefix bot card */}
                        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                            {tr("Prefix bot", "Bot prefix")}
                          </p>
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value.toLowerCase() }))}
                            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium uppercase tracking-[0.12em] outline-none focus:border-[var(--border-strong)]"
                            placeholder={tr("Contoh: cash", "Example: cash")}
                          />
                        </div>
                      </>
                    )}

                    {createWalletStep === 3 && (
                      <div className="space-y-3">
                        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                            {tr("Imej Dompet", "Wallet Image")}
                          </p>
                          <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] bg-[var(--card)] text-xs font-semibold text-[var(--muted)]">
                            <Upload size={14} /> {uploadingDraftImage ? tr("Sedang upload…", "Uploading…") : tr("Upload imej (maks 512 KB)", "Upload image (max 512 KB)")}
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadDraftWalletImage(file); e.target.value = "" }} />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, is_bot_default: !prev.is_bot_default }))}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3.5 text-sm font-semibold transition",
                            draft.is_bot_default
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                              : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]",
                          )}
                        >
                          <span className="inline-flex items-center gap-2">
                            {draft.is_bot_default ? <Check size={14} strokeWidth={3} /> : <MessageCircle size={14} />}
                            {tr("Bot Default", "Bot Default")}
                          </span>
                          <span className="rounded-full bg-[var(--surface-tint)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em]">
                            {draft.is_bot_default ? tr("Aktif", "Active") : tr("Tidak", "Off")}
                          </span>
                        </button>
                        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                          <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                            {tr("Ringkasan Dompet", "Wallet Summary")}
                          </p>
                          <ReviewRow label={tr("Penampilan", "Appearance")} value={selectedDraftAccent.label} />
                          <ReviewRow label={tr("Jenis", "Type")} value={walletTypeLabel(draft.type, isBm)} />
                          <ReviewRow label={tr("Mata Wang", "Currency")} value={formatCurrencyLabel(draft.currency)} />
                          <ReviewRow label={tr("Nama Dompet", "Wallet Name")} value={draft.label || "-"} />
                          <ReviewRow label={tr("Prefix", "Prefix")} value={draft.name || "-"} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]"></div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ─── Edit Wallet Sheet ─── */}
      {mounted && activeWallet
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex h-[100dvh] w-screen touch-none items-end justify-center overflow-hidden bg-transparent p-0 md:items-center md:p-4"
              onClick={requestWalletDetailClose}
              onTouchMove={(event) => event.preventDefault()}
            >
              <div
                data-prevent-pull-refresh="true"
                onClick={(event) => event.stopPropagation()}
                data-swipe-sheet
                {...walletDetailSheetSwipe}
                style={{ transform: "translateZ(0)" }}
                className="app-sheet-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--sheet-bg)] shadow-2xl will-change-transform md:max-h-[86vh] md:max-w-md md:rounded-[1.75rem]"
              >
                <div className="shrink-0 bg-[var(--sheet-bg)] px-5 py-4 md:px-6">
                  <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-[var(--surface-tint-strong)] md:hidden" />
                  {/* Header: Cancel left, title center, Save right */}
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={requestWalletDetailClose}
                      className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                    >
                      {tr("Batal", "Cancel")}
                    </button>
                    <h3 className="min-w-0 flex-1 truncate text-center text-2xl font-black text-[var(--text)]">
                      {tr("Edit Dompet", "Edit Wallet")}
                    </h3>
                    <button
                      type="button"
                      onClick={async () => {
                        const didSave = await saveWallet(activeWallet)
                        if (didSave) setActiveWallet(null)
                      }}
                      disabled={busyWalletId === activeWallet.id || uploadingWalletId === activeWallet.id}
                      className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
                    >
                      {busyWalletId === activeWallet.id
                        ? tr("Menyimpan…", "Saving…")
                        : tr("Simpan", "Save")}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 md:px-6">
                  <div className="relative pb-5">
                    <GlossyWalletPreview
                      accent={getWalletAccent(activeWallet)}
                      label={activeWallet.label || activeWallet.name}
                      name={activeWallet.name}
                      type={activeWallet.type}
                      currency={activeWallet.currency}
                      balance={activeWallet.balance}
                      isBotDefault={activeWallet.is_bot_default}
                      txnCount={activeWallet.transaction_count}
                      imageUrl={activeWallet.image_url}
                      balanceLabel={tr("Baki", "Balance")}
                      sharedLabel={tr("Bersama", "Shared")}
                      personalLabel={tr("Personal", "Personal")}
                      botLabel="BOT"
                      recordsLabel={tr("rekod", "txns")}
                    />

                    <button
                      type="button"
                      onClick={() => updateActiveWallet({ is_bot_default: !activeWallet.is_bot_default })}
                      className={cn(
                        "absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-md transition",
                        activeWallet.is_bot_default
                          ? "bg-emerald-500 text-white"
                          : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]",
                      )}
                    >
                      {activeWallet.is_bot_default ? <Check size={13} strokeWidth={3} /> : <MessageCircle size={13} />}
                      {activeWallet.is_bot_default
                        ? tr("Bot aktif", "Bot active")
                        : tr("Set bot default", "Set bot default")}
                    </button>
                  </div>

                  <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      {tr("Penampilan", "Appearance")}
                    </p>
                    <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] bg-[var(--card)] text-xs font-semibold text-[var(--muted)]">
                      <Upload size={14} /> {uploadingWalletId === activeWallet.id ? tr("Sedang upload…", "Uploading…") : tr("Upload imej (maks 512 KB)", "Upload image (max 512 KB)")}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadWalletImage(file, activeWallet); e.target.value = "" }} />
                    </label>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {CARD_ACCENTS.map((accent) => {
                        const isSelected = activeWallet.card_color === accent.key
                        return (
                          <button
                            key={accent.key}
                            type="button"
                            onClick={() => updateActiveWallet({ card_color: accent.key })}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-full transition-all",
                              isSelected
                                ? "scale-105 ring-2 ring-[var(--text)] ring-offset-1 ring-offset-[var(--card)]"
                                : "opacity-80 hover:opacity-100",
                            )}
                            aria-label={accent.label}
                            title={accent.label}
                            style={{ backgroundColor: accent.color }}
                          >
                            {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Jenis Dompet card */}
                  <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      {tr("Jenis Dompet", "Wallet Type")}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {WALLET_TYPE_OPTIONS.map((opt) => {
                        const selected = activeWallet.type === opt.value
                        const Icon = walletTypeIcon(opt.value)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateActiveWallet({ type: opt.value })}
                            className={cn(
                              "flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium transition active:scale-[0.98]",
                              selected
                                ? "bg-[var(--text)] text-[var(--bg)]"
                                : "border border-[var(--border)] text-[var(--text)]",
                            )}
                          >
                            <Icon size={14} />
                            {isBm ? opt.bm : opt.en}
                          </button>
                        )
                      })}
                      {activeWallet.type === "shared" ? (
                        <button
                          type="button"
                          className="flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--text)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--bg)]"
                        >
                          <Users size={14} />
                          {tr("Bersama", "Shared")}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Mata Wang card */}
                  <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      {tr("Mata Wang", "Currency")}
                    </p>
                    <input
                      value={activeWallet.currency}
                      onChange={(e) =>
                        updateActiveWallet({ currency: e.target.value.toUpperCase().slice(0, 5) })
                      }
                      className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium uppercase tracking-[0.12em] outline-none focus:border-[var(--border-strong)]"
                      placeholder="RM"
                    />
                  </div>

                  {/* Nama pada Dompet card */}
                  <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      {tr("Nama pada Dompet", "Name on Wallet")}
                    </p>
                    <input
                      value={activeWallet.label}
                      onChange={(e) => updateActiveWallet({ label: e.target.value })}
                      className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium outline-none focus:border-[var(--border-strong)]"
                      placeholder={tr("Contoh: Maybank Utama", "Example: Main Maybank")}
                    />
                  </div>

                  {/* Prefix Bot card */}
                  <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      {tr("Prefix Bot", "Bot Prefix")}
                    </p>
                    <input
                      value={activeWallet.name}
                      onChange={(e) => updateActiveWallet({ name: e.target.value.toLowerCase() })}
                      className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[0.8125rem] font-medium uppercase tracking-[0.12em] outline-none focus:border-[var(--border-strong)]"
                      placeholder={tr("Contoh: cash", "Example: cash")}
                    />
                    <p className="text-[0.6875rem] text-[var(--muted)]">
                      {tr("Untuk arahan bot.", "For bot commands.")}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
                  {activeWallet.transaction_count === 0 && (
                    <button
                      type="button"
                      onClick={() => deleteWallet(activeWallet.id)}
                      disabled={busyWalletId === activeWallet.id}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-rose-500/25 bg-rose-500/10 text-sm font-black text-rose-500 transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {busyWalletId === activeWallet.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                      {tr("Padam Dompet", "Delete Wallet")}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {alertModal}
    </div>
  )
}
