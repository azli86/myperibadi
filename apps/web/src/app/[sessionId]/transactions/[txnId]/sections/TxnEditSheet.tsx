"use client"

import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import { X, Check, ChevronDown, Plus, MinusCircle, Wallet, HandCoins, Repeat, Tag, Upload, XCircle, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrencyLabel } from "@/components/ui/MoneyAmount"
import { CategoryIconGlyph } from "@/lib/category-icons"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import type {
  CategoryOption,
  WalletOption,
  LoanOption,
  SubscriptionOption,
  EditItem,
} from "../types"

export type EditFormState = {
  description: string
  amount: string
  category_id: string
  wallet_id: string
  type: "expense" | "income"
  date: string
  time: string
  notes: string
}

export type TxnEditSheetProps = {
  open: boolean
  categories: CategoryOption[]
  wallets: WalletOption[]
  loans: LoanOption[]
  subscriptions: SubscriptionOption[]
  editForm: EditFormState
  editItems: EditItem[]
  linkedLoanId: string
  linkedSubscriptionId: string
  saving: boolean
  saveSuccess: boolean
  onEditFormChange: (next: Partial<EditFormState>) => void
  onEditItemsChange: (next: EditItem[]) => void
  onLinkedLoanIdChange: (value: string) => void
  onLinkedSubscriptionIdChange: (value: string) => void
  onEditFileChange: (file: File | null) => void
  editFile: File | null
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}

export default function TxnEditSheet({
  open,
  categories,
  wallets,
  loans,
  subscriptions,
  editForm,
  editItems,
  linkedLoanId,
  linkedSubscriptionId,
  saving,
  saveSuccess,
  onEditFormChange,
  onEditItemsChange,
  onLinkedLoanIdChange,
  onLinkedSubscriptionIdChange,
  onEditFileChange,
  editFile,
  onSubmit,
  onClose,
}: TxnEditSheetProps) {
  const { lang, t: langT } = useLang()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const isBm = lang === "BM"
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [showWalletPicker, setShowWalletPicker] = useState(false)
  const [showLoanPicker, setShowLoanPicker] = useState(false)
  const [showSubscriptionPicker, setShowSubscriptionPicker] = useState(false)
  const swipe = useSwipeDownToClose(onClose)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editFilePreview, setEditFilePreview] = useState<string | null>(null)

  const handleFilePick = (file: File | null) => {
    if (editFilePreview) {
      URL.revokeObjectURL(editFilePreview)
      setEditFilePreview(null)
    }
    if (file) setEditFilePreview(URL.createObjectURL(file))
    onEditFileChange(file)
  }

  const itemManagerActive = editItems.length > 0
  const editItemsTotal = editItems.reduce((sum, item) => {
    const quantity = Number.parseFloat(item.quantity || "0")
    const unitPrice = Number.parseFloat(item.unit_price || "0")
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return sum
    return sum + Math.max(0, quantity) * Math.max(0, unitPrice)
  }, 0)

  const sanitizeDecimalInput = (value: string) => {
    const normalized = value.replace(/,/g, ".").replace(/[^0-9.]/g, "")
    const [firstPart, ...restParts] = normalized.split(".")
    return restParts.length ? `${firstPart}.${restParts.join("")}` : normalized
  }

  const addEditItem = () => {
    onEditItemsChange([...editItems, { name: "", quantity: "1", unit_price: "0" }])
  }

  const updateEditItem = (index: number, field: keyof EditItem, value: string) => {
    onEditItemsChange(editItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeEditItem = (index: number) => {
    onEditItemsChange(editItems.filter((_, i) => i !== index))
  }

  const bumpQuantity = (index: number, delta: number) => {
    const qty = Math.max(0, (Number.parseFloat(editItems[index]?.quantity || "0") || 0) + delta)
    onEditItemsChange(editItems.map((item, i) => (i === index ? { ...item, quantity: String(qty) } : item)))
  }

  const selectOption = (setter: (value: string) => void, value: string, close: () => void) => {
    setter(value)
    close()
  }

  const toggleCategory = () => {
    setShowCategoryPicker((p) => !p)
    setShowWalletPicker(false)
    setShowLoanPicker(false)
    setShowSubscriptionPicker(false)
  }
  const toggleWallet = () => {
    setShowWalletPicker((p) => !p)
    setShowCategoryPicker(false)
    setShowLoanPicker(false)
    setShowSubscriptionPicker(false)
  }
  const toggleLoan = () => {
    setShowLoanPicker((p) => !p)
    setShowCategoryPicker(false)
    setShowWalletPicker(false)
    setShowSubscriptionPicker(false)
  }
  const toggleSubscription = () => {
    setShowSubscriptionPicker((p) => !p)
    setShowCategoryPicker(false)
    setShowWalletPicker(false)
    setShowLoanPicker(false)
  }

  const pickerBtn =
    "flex w-full items-end justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-left transition-colors"
  const pickerLabel = "text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]"
  const pickerValue = (has: boolean) => cn("truncate text-base font-bold", has ? "text-[var(--text)]" : "text-[var(--muted)]")
  // Picker list row: icon + large text
  const rowBase = "flex w-full items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-left transition-colors"
  const selectedOption = "bg-[var(--text)] text-[var(--bg)]"
  const unselectedOption = "bg-[var(--surface-tint)] text-[var(--text)]"
  const rowText = "truncate text-base font-bold"
  const rowIcon = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--icon-bg)] text-[var(--icon-fg)] overflow-hidden"

  const activePickers =
    showCategoryPicker || showWalletPicker || showLoanPicker || showSubscriptionPicker

  const selectedWallet = wallets.find((w) => String(w.id) === String(editForm.wallet_id))
  const selectedWalletCurrency =
    selectedWallet?.currency || wallets[0]?.currency || "RM"

  if (!open) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-transparent p-0 sm:items-center"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          data-swipe-sheet
          {...swipe}
          className="app-sheet-panel app-sheet-panel--lg w-full max-h-[82dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-h-[85vh] sm:max-w-[30rem]"
        >
          <AppSheetHeader
            title={isBm ? "Edit Transaksi" : "Edit Transaction"}
            onClose={onClose}
            action={
              <button
                type="submit"
                form="edit-txn-form"
                disabled={saving}
                className="px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
              >
                {saving
                  ? (isBm ? "Menyimpan…" : "Saving…")
                  : (isBm ? "Kemas Kini" : "Update")}
              </button>
            }
          />

          {saveSuccess && (
            <div className={cn(
              "mb-4 flex items-center gap-2.5 rounded-2xl p-3 text-sm font-medium",
              isLight
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            )}>
              <Check size={16} /> {langT.recordUpdated}
            </div>
          )}

          <form id="edit-txn-form" onSubmit={onSubmit} className="space-y-3 px-4 pb-4 pt-1 sm:px-6 sm:pb-6 sm:pt-0">
            <div className="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-2">
              {(["expense", "income"] as const).map((type) => {
                const active = editForm.type === type
                const isExp = type === "expense"
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onEditFormChange({ type })}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-[var(--radius)] py-3 text-base font-bold transition-all active:scale-[0.98]",
                      active
                        ? isExp
                          ? isLight
                            ? "bg-rose-500/10 text-rose-600"
                            : "bg-rose-400/15 text-rose-400"
                          : isLight
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-emerald-400/15 text-emerald-400"
                        : "text-[var(--muted)]"
                    )}
                  >
                    {isExp ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                    {isExp ? langT.expense : langT.income}
                  </button>
                )
              })}
            </div>

            {!itemManagerActive && (
              <>
                <input
                  type="text"
                  aria-label={langT.description}
                  placeholder={langT.description}
                  value={editForm.description}
                  onChange={(e) => onEditFormChange({ description: e.target.value })}
                  required
                  className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                />
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={langT.amount}
                    placeholder={langT.amount}
                    value={editForm.amount}
                    onChange={(e) => onEditFormChange({ amount: sanitizeDecimalInput(e.target.value) })}
                    required
                    className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] py-3 pl-4 pr-16 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-[var(--muted)]">
                    {formatCurrencyLabel(selectedWalletCurrency)}
                  </span>
                </div>
              </>
            )}

            <div className="relative">
              <button type="button" aria-label={langT.category} onClick={toggleCategory} className={pickerBtn}>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  {editForm.category_id &&
                    (() => {
                      const cat = categories.find((c) => String(c.id) === editForm.category_id)
                      return (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                          <CategoryIconGlyph iconName={cat?.icon_name} categoryName={cat?.name || ""} kind="expense" size={20} />
                        </span>
                      )
                    })()}
                  <span className="min-w-0">
                    <span className={cn("block", pickerLabel)}>{langT.category}</span>
                    <span className={cn("block", pickerValue(Boolean(editForm.category_id)))}>
                      {editForm.category_id
                        ? categories.find((cat) => String(cat.id) === editForm.category_id)?.name || langT.category
                        : langT.category}
                    </span>
                  </span>
                </span>
                <ChevronDown size={20} className={cn("shrink-0 text-[var(--muted)] transition-transform", showCategoryPicker && "rotate-180")} />
              </button>
            </div>

            <div className="relative">
              <button type="button" aria-label={langT.walletLabel} onClick={toggleWallet} className={pickerBtn}>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  {editForm.wallet_id &&
                    (() => {
                      const w = wallets.find((x) => String(x.id) === editForm.wallet_id)
                      return (
                        <span className={rowIcon}>
                          {w?.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Wallet size={16} />
                          )}
                        </span>
                      )
                    })()}
                  <span className="min-w-0">
                    <span className={cn("block", pickerLabel)}>{langT.walletLabel}</span>
                    <span className={cn("block", pickerValue(Boolean(editForm.wallet_id)))}>
                      {editForm.wallet_id
                        ? wallets.find((w) => String(w.id) === editForm.wallet_id)?.label ||
                          wallets.find((w) => String(w.id) === editForm.wallet_id)?.name ||
                          langT.walletLabel
                        : langT.walletLabel}
                    </span>
                  </span>
                </span>
                <ChevronDown size={20} className={cn("shrink-0 text-[var(--muted)] transition-transform", showWalletPicker && "rotate-180")} />
              </button>
            </div>

            <div className="relative">
              <button type="button" aria-label="Link Loan" onClick={toggleLoan} className={pickerBtn}>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", pickerLabel)}>{isBm ? "Link Loan" : "Link Loan"}</span>
                  <span className={cn("block", pickerValue(Boolean(linkedLoanId)))}>
                    {linkedLoanId
                      ? loans.find((loan) => String(loan.id) === linkedLoanId)?.name || (isBm ? "Link Loan" : "Link Loan")
                      : isBm ? "Tiada link loan" : "No loan link"}
                  </span>
                </span>
                <ChevronDown size={20} className={cn("shrink-0 text-[var(--muted)] transition-transform", showLoanPicker && "rotate-180")} />
              </button>
            </div>

            <div className="relative">
              <button type="button" aria-label="Subscribe Link" onClick={toggleSubscription} className={pickerBtn}>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", pickerLabel)}>{isBm ? "Subscribe Link" : "Subscribe Link"}</span>
                  <span className={cn("block", pickerValue(editForm.description.startsWith("SUBX ")))}>
                    {editForm.description.startsWith("SUBX ")
                      ? editForm.description.replace("SUBX ", "")
                      : isBm ? "Tiada subscribe link" : "No subscribe link"}
                  </span>
                </span>
                <ChevronDown size={20} className={cn("shrink-0 text-[var(--muted)] transition-transform", showSubscriptionPicker && "rotate-180")} />
              </button>
            </div>

            {/* Details card: notes, date & time together */}
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
              <div className="flex items-center gap-1.5">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                  {isBm ? "Butiran" : "Details"}
                </p>
              </div>
              <textarea
                aria-label={langT.notesLabel}
                value={editForm.notes}
                onChange={(e) => onEditFormChange({ notes: e.target.value })}
                placeholder={langT.notesLabel}
                rows={2}
                className="w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                    {langT.date}
                  </span>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => onEditFormChange({ date: e.target.value })}
                    className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium text-[var(--text)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                    {langT.time}
                  </span>
                  <input
                    type="time"
                    value={editForm.time}
                    onChange={(e) => onEditFormChange({ time: e.target.value })}
                    className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium text-[var(--text)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </label>
              </div>
            </div>

            {editForm.type !== "income" && (
              <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      {isBm ? "Item" : "Items"}
                    </p>
                    <p className="text-xs font-semibold text-[var(--muted)]">
                      {itemManagerActive
                        ? `${editItems.filter((item) => item.name.trim()).length} ${isBm ? "item" : "items"} · RM ${editItemsTotal.toFixed(2)}`
                        : isBm
                          ? "Mod item kosong. Tekan Tambah untuk pecahkan harga."
                          : "Item mode empty. Tap Add to split the price."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addEditItem}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--bg)] active:scale-95"
                  >
                    <Plus size={13} /> {isBm ? "Tambah" : "Add"}
                  </button>
                </div>

                {editItems.length > 0 ? (
                  <div className="space-y-2">
                    {editItems.map((item, index) => {
                      const quantity = Number.parseFloat(item.quantity || "0") || 0
                      const unitPrice = Number.parseFloat(item.unit_price || "0") || 0
                      const subtotal = Math.max(0, quantity) * Math.max(0, unitPrice)
                      return (
                        <div
                          key={index}
                          className="space-y-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateEditItem(index, "name", e.target.value)}
                              placeholder={isBm ? "Nama item" : "Item name"}
                              className="min-w-0 flex-1 rounded-xl border border-transparent bg-[var(--surface-tint)] px-3 py-2.5 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => removeEditItem(index)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-rose-500 active:scale-95"
                              aria-label={isBm ? "Buang item" : "Remove item"}
                            >
                              <MinusCircle size={18} />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 items-end gap-2">
                            <label className="block">
                              <span className="mb-1 block text-[0.6rem] font-black uppercase tracking-wider text-[var(--muted)]">
                                {isBm ? "Kuantiti" : "Quantity"}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => bumpQuantity(index, -1)}
                                  disabled={quantity <= 0}
                                  aria-label={isBm ? "Kurang" : "Decrease"}
                                  className="flex h-[42px] w-9 shrink-0 items-center justify-center rounded-l-xl border border-transparent bg-[var(--surface-tint)] text-lg font-black text-[var(--text)] transition-colors focus:border-[var(--border-strong)] focus:outline-none disabled:opacity-40"
                                >
                                  −
                                </button>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.quantity}
                                  onChange={(e) => updateEditItem(index, "quantity", sanitizeDecimalInput(e.target.value))}
                                  placeholder="1"
                                  className="w-full min-w-0 flex-1 rounded-none border border-transparent bg-[var(--surface-tint)] px-1 py-2.5 text-center text-sm font-semibold text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => bumpQuantity(index, 1)}
                                  aria-label={isBm ? "Tambah" : "Increase"}
                                  className="flex h-[42px] w-9 shrink-0 items-center justify-center rounded-r-xl border border-transparent bg-[var(--surface-tint)] text-lg font-black text-[var(--text)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                                >
                                  +
                                </button>
                              </div>
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[0.6rem] font-black uppercase tracking-wider text-[var(--muted)]">
                                {isBm ? "Harga" : "Price"}
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.unit_price}
                                onChange={(e) => updateEditItem(index, "unit_price", sanitizeDecimalInput(e.target.value))}
                                placeholder="0.00"
                                className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-2 py-2.5 text-right text-sm font-semibold text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                              />
                            </label>
                            <div className="flex flex-col items-end">
                              <span className="mb-1 block text-[0.6rem] font-black uppercase tracking-wider text-[var(--muted)]">
                                {isBm ? "Jumlah" : "Total"}
                              </span>
                              <div className="flex h-[42px] w-full items-center justify-end rounded-xl bg-[var(--surface-tint)] px-3 text-sm font-black tabular-nums text-[var(--text)]">
                                {subtotal.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={addEditItem}
                    className="w-full rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-center text-sm font-bold text-[var(--muted)] active:scale-[0.99]"
                  >
                    {isBm ? "+ Tambah item pertama" : "+ Add first item"}
                  </button>
                )}
              </div>
            )}

            {/* Upload receipt card — tap to upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { handleFilePick(e.target.files?.[0] || null); e.target.value = "" }}
            />
            {editFilePreview ? (
              <div className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
                {editFilePreview.startsWith("blob:") && editFile?.type === "application/pdf" ? (
                  <div className="flex items-center gap-3 p-4">
                    <Upload size={20} className="text-[var(--muted)]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">{editFile?.name}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="block w-full"
                  >
                    <img src={editFilePreview} alt="" className="max-h-48 w-full object-contain bg-[var(--surface-tint)]" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleFilePick(null)}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] text-[var(--muted)] shadow active:scale-95"
                  aria-label={isBm ? "Buang resit" : "Remove receipt"}
                >
                  <XCircle size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-tint)] px-4 py-6 text-center transition-colors active:scale-[0.99]"
              >
                <Upload size={24} className="text-[var(--muted)]" />
                <span className="text-sm font-bold text-[var(--text)]">{langT.uploadReceiptOptional}</span>
              </button>
            )}
          </form>
        </div>
      </div>

      {activePickers && (
        <div
          className="fixed inset-0 z-[160] flex items-end justify-center overscroll-none bg-transparent p-0 sm:items-center"
          onClick={() => {
            setShowCategoryPicker(false)
            setShowWalletPicker(false)
            setShowLoanPicker(false)
            setShowSubscriptionPicker(false)
          }}
          onTouchMove={(e) => e.preventDefault()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            className="app-sheet-panel app-sheet-panel--lg w-full max-w-md overscroll-contain border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text)]">
                {showCategoryPicker
                  ? langT.category
                  : showWalletPicker
                    ? langT.walletLabel
                    : showLoanPicker
                      ? (isBm ? "Link Loan" : "Link Loan")
                      : (isBm ? "Subscribe Link" : "Subscribe Link")}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryPicker(false)
                  setShowWalletPicker(false)
                  setShowLoanPicker(false)
                  setShowSubscriptionPicker(false)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-tint)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[60vh] touch-pan-y space-y-2 overflow-y-auto overscroll-contain">
              {showCategoryPicker && (
                <>
                  <button
                    type="button"
                    onClick={() => selectOption((v) => onEditFormChange({ category_id: v }), "", () => setShowCategoryPicker(false))}
                    className={cn(rowBase, "justify-between", !editForm.category_id ? selectedOption : unselectedOption)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={rowIcon}><Tag size={16} /></span>
                      <span className={rowText}>{langT.category}</span>
                    </span>
                  </button>
                  {categories
                    .filter((c) => c.kind === editForm.type)
                    .map((cat) => {
                      const selected = String(cat.id) === editForm.category_id
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => selectOption((v) => onEditFormChange({ category_id: v }), String(cat.id), () => setShowCategoryPicker(false))}
                          className={cn(rowBase, "justify-between", selected ? selectedOption : unselectedOption)}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className={rowIcon}><CategoryIconGlyph iconName={cat.icon_name} categoryName={cat.name} kind={cat.kind} size={16} /></span>
                            <span className={rowText}>{cat.name}</span>
                          </span>
                        </button>
                      )
                    })}
                </>
              )}

              {showWalletPicker && (
                <>
                  <button
                    type="button"
                    onClick={() => selectOption((v) => onEditFormChange({ wallet_id: v }), "", () => setShowWalletPicker(false))}
                    className={cn(rowBase, "justify-between", !editForm.wallet_id ? selectedOption : unselectedOption)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={rowIcon}><Wallet size={16} /></span>
                      <span className={rowText}>{langT.walletLabel}</span>
                    </span>
                  </button>
                  {wallets.filter((wallet) => !wallet.is_saving).map((wallet) => {
                    const selected = String(wallet.id) === editForm.wallet_id
                    return (
                      <button
                        key={wallet.id}
                        type="button"
                        onClick={() => selectOption((v) => onEditFormChange({ wallet_id: v }), String(wallet.id), () => setShowWalletPicker(false))}
                        className={cn(rowBase, "justify-between", selected ? selectedOption : unselectedOption)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={rowIcon}>
                            {wallet.image_url ? (
                              <img src={wallet.image_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Wallet size={16} />
                            )}
                          </span>
                          <span className={rowText}>{wallet.label || wallet.name}</span>
                        </span>
                      </button>
                    )
                  })}
                </>
              )}

              {showLoanPicker && (
                <>
                  <button
                    type="button"
                    onClick={() => selectOption(onLinkedLoanIdChange, "", () => setShowLoanPicker(false))}
                    className={cn(rowBase, "justify-between", !linkedLoanId ? selectedOption : unselectedOption)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={rowIcon}><HandCoins size={16} /></span>
                      <span className={rowText}>{isBm ? "Tiada link loan" : "No loan link"}</span>
                    </span>
                  </button>
                  {loans.map((loan) => {
                    const selected = String(loan.id) === linkedLoanId
                    return (
                      <button
                        key={loan.id}
                        type="button"
                        onClick={() => selectOption(onLinkedLoanIdChange, String(loan.id), () => setShowLoanPicker(false))}
                        className={cn(rowBase, "justify-between", selected ? selectedOption : unselectedOption)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={rowIcon}><HandCoins size={16} /></span>
                          <span className={rowText}>{loan.name}</span>
                        </span>
                      </button>
                    )
                  })}
                </>
              )}

              {showSubscriptionPicker && (
                <>
                  <button
                    type="button"
                    onClick={() => { onLinkedSubscriptionIdChange(""); selectOption((v) => onEditFormChange({ description: v }), "", () => setShowSubscriptionPicker(false)) }}
                    className={cn(rowBase, "justify-between", !editForm.description.startsWith("SUBX ") ? selectedOption : unselectedOption)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={rowIcon}><Repeat size={16} /></span>
                      <span className={rowText}>{isBm ? "Tiada subscribe link" : "No subscribe link"}</span>
                    </span>
                  </button>
                  {subscriptions.map((sub) => {
                    const subPrefix = `SUBX ${sub.name}`
                    const selected = linkedSubscriptionId === String(sub.id)
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => { onLinkedSubscriptionIdChange(String(sub.id)); selectOption((v) => onEditFormChange({ description: v }), subPrefix, () => setShowSubscriptionPicker(false)) }}
                        className={cn(rowBase, "justify-between", selected ? selectedOption : unselectedOption)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={rowIcon}><Repeat size={16} /></span>
                          <span className={rowText}>{sub.name}</span>
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
