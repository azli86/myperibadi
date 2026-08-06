"use client"

import { useState, useRef } from "react"
import { X, Check, ChevronDown, Plus, MinusCircle, Wallet, HandCoins, Repeat, Tag, Upload, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
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

  if (!open) return null

  return (
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
          className="w-full max-h-[82dvh] overflow-y-auto overscroll-contain touch-pan-y rounded-t-[36px] border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl sm:max-h-[85vh] sm:max-w-[30rem] sm:rounded-[16px]"
        >
          <div className="sticky top-0 z-30 mb-3 rounded-t-[36px] bg-[var(--sheet-bg)] px-5 py-4 sm:px-6">
            <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-[var(--surface-tint-strong)] sm:hidden" />
            {/* Header: Cancel left, title center, Update right */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                {isBm ? "Batal" : "Cancel"}
              </button>
              <h3 className="min-w-0 flex-1 truncate text-center text-2xl font-black text-[var(--text)]">
                {isBm ? "Edit Transaksi" : "Edit Transaction"}
              </h3>
              <button
                type="submit"
                form="edit-txn-form"
                disabled={saving}
                className="shrink-0 px-1 py-1.5 text-xl font-bold text-[var(--btn-primary-bg)] transition-opacity disabled:opacity-60"
              >
                {saving
                  ? (isBm ? "Menyimpan…" : "Saving…")
                  : (isBm ? "Kemas Kini" : "Update")}
              </button>
            </div>
          </div>

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
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onEditFormChange({ type })}
                  className={cn(
                    "rounded-2xl py-2.5 text-sm font-semibold transition-all",
                    editForm.type === type
                      ? type === "expense"
                        ? isLight
                          ? "border border-rose-500/20 bg-rose-500/10 text-rose-600"
                          : "border border-rose-400/20 bg-rose-400/10 text-rose-400/80"
                        : isLight
                          ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                          : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-400/80"
                      : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:border-[var(--border-strong)]"
                  )}
                >
                  {type === "expense" ? langT.expense : langT.income}
                </button>
              ))}
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
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={langT.amount}
                  placeholder={langT.amount}
                  value={editForm.amount}
                  onChange={(e) => onEditFormChange({ amount: sanitizeDecimalInput(e.target.value) })}
                  required
                  className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                />
              </>
            )}

            <div className="relative">
              <button type="button" aria-label={langT.category} onClick={toggleCategory} className={pickerBtn}>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", pickerLabel)}>{langT.category}</span>
                  <span className={cn("block", pickerValue(Boolean(editForm.category_id)))}>
                    {editForm.category_id
                      ? categories.find((cat) => String(cat.id) === editForm.category_id)?.name || langT.category
                      : langT.category}
                  </span>
                </span>
                <ChevronDown size={20} className={cn("shrink-0 text-[var(--muted)] transition-transform", showCategoryPicker && "rotate-180")} />
              </button>
            </div>

            <div className="relative">
              <button type="button" aria-label={langT.walletLabel} onClick={toggleWallet} className={pickerBtn}>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", pickerLabel)}>{langT.walletLabel}</span>
                  <span className={cn("block", pickerValue(Boolean(editForm.wallet_id)))}>
                    {editForm.wallet_id
                      ? wallets.find((w) => String(w.id) === editForm.wallet_id)?.label ||
                        wallets.find((w) => String(w.id) === editForm.wallet_id)?.name ||
                        langT.walletLabel
                      : langT.walletLabel}
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
                    <div className="grid grid-cols-4 gap-1.5 px-1 text-[0.62rem] font-black uppercase tracking-wider text-[var(--muted)]">
                      <span className="col-span-2">{isBm ? "Qty" : "Qty"}</span>
                      <span className="text-center">{isBm ? "Harga" : "Price"}</span>
                      <span className="text-right">{isBm ? "Total" : "Total"}</span>
                    </div>
                    {editItems.map((item, index) => {
                      const quantity = Number.parseFloat(item.quantity || "0") || 0
                      const unitPrice = Number.parseFloat(item.unit_price || "0") || 0
                      const subtotal = Math.max(0, quantity) * Math.max(0, unitPrice)
                      return (
                        <div
                          key={index}
                          className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateEditItem(index, "name", e.target.value)}
                              placeholder={isBm ? "Nama item" : "Item"}
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
                          <div className="grid grid-cols-4 items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.quantity}
                              onChange={(e) => updateEditItem(index, "quantity", sanitizeDecimalInput(e.target.value))}
                              placeholder="1"
                              className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-2 py-2 text-center text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.unit_price}
                              onChange={(e) => updateEditItem(index, "unit_price", sanitizeDecimalInput(e.target.value))}
                              placeholder="0.00"
                              className="w-full rounded-xl border border-transparent bg-[var(--surface-tint)] px-2 py-2 text-right text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)] focus:outline-none"
                            />
                            <div className="col-span-2 truncate text-right text-sm font-black text-[var(--text)]">{subtotal.toFixed(2)}</div>
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
                  {wallets.map((wallet) => {
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
    </>
  )
}
