"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { AppSheet } from "@/components/ui/AppSheet"
import { getAccessToken } from "@/lib/auth-session"
import { fetchApiJson, readApiCache } from "@/lib/api-cache"
import { cn, getTodayDateInTimeZone } from "@/lib/utils"

type Kind = "expense" | "income"

type Category = {
  id: number
  name: string
  kind: Kind
  icon_name?: string | null
  status?: string | null
}

export type RecordSheetWallet = {
  id: number
  name: string
  label?: string | null
  is_saving?: boolean | null
}

const CATEGORIES_URL = "/api/categories"

/**
 * The phone home's quick "Record", one step at a time: first expense or income
 * and the amount, large in the middle; then the category; then the rest
 * (note, date, wallet) and Save. The wallet is optional; left on Auto, the server picks
 * the user's default wallet as it does for bot messages.
 */
export default function RecordSheet({
  open,
  onClose,
  onSaved,
  wallets,
  lang,
  timezone,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  wallets: RecordSheetWallet[]
  lang: string
  timezone: string
}) {
  const isBm = lang !== "EN"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [kind, setKind] = useState<Kind>("expense")
  const [amount, setAmount] = useState("")
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [date, setDate] = useState(() => getTodayDateInTimeZone(timezone))
  const [walletId, setWalletId] = useState<number | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const amountRef = useRef<HTMLInputElement>(null)

  const today = getTodayDateInTimeZone(timezone)
  const yesterday = useMemo(() => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }, [today])

  // Fresh form each time it opens; categories from cache first, then the API.
  useEffect(() => {
    if (!open) return
    setStep(1)
    setKind("expense")
    setAmount("")
    setCategoryId(null)
    setNote("")
    setDate(getTodayDateInTimeZone(timezone))
    setWalletId(null)
    setError("")
    const token = getAccessToken() || ""
    const cached = readApiCache<Category[]>(CATEGORIES_URL, token)
    if (cached) setCategories(cached)
    fetchApiJson<Category[]>(CATEGORIES_URL, token)
      .then((rows) => setCategories(Array.isArray(rows) ? rows : []))
      .catch(() => setCategories((prev) => prev ?? []))
    const t = window.setTimeout(() => amountRef.current?.focus(), 250)
    return () => window.clearTimeout(t)
  }, [open, timezone])

  const kindCategories = useMemo(
    () => (categories || []).filter((c) => c.kind === kind && c.status !== "archived"),
    [categories, kind]
  )
  const spendWallets = wallets.filter((w) => !w.is_saving)
  const amountValue = Number.parseFloat(amount.replace(",", "."))
  const hasAmount = Number.isFinite(amountValue) && amountValue > 0
  const canSave = hasAmount && !saving

  const switchKind = (next: Kind) => {
    setKind(next)
    setCategoryId(null)
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError("")
    const category = kindCategories.find((c) => c.id === categoryId)
    const title = note.trim() || category?.name || (kind === "expense" ? tr("Belanja", "Expense") : tr("Pendapatan", "Income"))
    try {
      const token = getAccessToken()
      const res = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          type: kind,
          amount: Math.round(amountValue * 100) / 100,
          vendor_or_source: title.slice(0, 50),
          notes: note.trim() || null,
          txn_date: date || today,
          category_id: category?.id ?? null,
          wallet_id: walletId,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const detail = typeof payload?.detail === "string" ? payload.detail : ""
        throw new Error(detail || tr("Rekod tidak dapat disimpan.", "The record could not be saved."))
      }
      window.dispatchEvent(new Event("refreshData"))
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Rekod tidak dapat disimpan.", "The record could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  const isExpense = kind === "expense"
  const selectedCategory = kindCategories.find((c) => c.id === categoryId) || null
  const chip = (active: boolean) =>
    cn(
      "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition active:scale-95",
      active ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--card)] text-[var(--text-soft)] shadow-[var(--shadow-card)]"
    )
  const primaryButton =
    "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-black text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-40"

  const goToCategory = () => {
    if (!hasAmount) {
      amountRef.current?.focus()
      return
    }
    setStep(2)
  }
  const pickCategory = (id: number) => {
    setCategoryId(id)
    // A short beat so the choice shows before the next step slides in.
    window.setTimeout(() => setStep(3), 160)
  }

  const amountLabel = `${isExpense ? "−" : "+"}RM ${hasAmount ? amountValue.toFixed(2) : "0.00"}`
  const kindLabel = isExpense ? tr("Belanja", "Expense") : tr("Pendapatan", "Income")

  // Steps 2 and 3 open with what was chosen so far; tapping it goes back.
  const summary = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setStep(step === 3 ? 2 : 1)}
        aria-label={tr("Kembali", "Back")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--card)] text-[var(--text)] shadow-[var(--shadow-card)] transition active:scale-90"
      >
        <ChevronLeft size={18} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={() => setStep(1)}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl bg-[var(--card)] px-4 py-2.5 text-left shadow-[var(--shadow-card)] transition active:scale-[0.99]"
      >
        <span className="min-w-0">
          <span className="block text-[0.6875rem] font-bold text-[var(--muted)]">
            {kindLabel}
            {step === 3 ? ` · ${selectedCategory ? selectedCategory.name : tr("Tiada kategori", "No category")}` : ""}
          </span>
          <span className={cn("block truncate text-lg font-black tabular-nums", isExpense ? "text-[var(--expense)]" : "text-[var(--income)]")}>
            {amountLabel}
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-[var(--muted)]">{tr("Ubah", "Edit")}</span>
      </button>
    </div>
  )

  const footer =
    step === 1 ? (
      <button type="button" onClick={goToCategory} disabled={!hasAmount} className={primaryButton}>
        {tr("Seterusnya", "Next")}
        <ChevronRight size={17} strokeWidth={2.6} />
      </button>
    ) : step === 2 ? (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setCategoryId(null)
            setStep(3)
          }}
          className="flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--card)] text-sm font-bold text-[var(--text-soft)] shadow-[var(--shadow-card)] transition active:scale-[0.98]"
        >
          {tr("Langkau", "Skip")}
        </button>
        {selectedCategory ? (
          <button type="button" onClick={() => setStep(3)} className={cn(primaryButton, "flex-1")}>
            {tr("Seterusnya", "Next")}
            <ChevronRight size={17} strokeWidth={2.6} />
          </button>
        ) : null}
      </div>
    ) : (
      <button type="button" onClick={() => void save()} disabled={!canSave} className={primaryButton}>
        {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={3} />}
        {saving ? tr("Menyimpan…", "Saving…") : tr("Simpan", "Save")}
      </button>
    )

  return (
    <AppSheet
      open={open}
      onClose={onClose}
      id="mobile-home-record"
      title={tr("Rekod Baharu", "New Record")}
      subtitle={tr(`Langkah ${step} daripada 3`, `Step ${step} of 3`)}
      size="lg"
      bodyClassName="space-y-5"
      footer={footer}
    >
      {/* Progress */}
      <div aria-hidden className="flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("h-1 flex-1 rounded-full transition-colors", n <= step ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--surface-tint-strong)]")} />
        ))}
      </div>

      {step === 1 ? (
        <>
          {/* Expense / income */}
          <div role="tablist" className="flex rounded-full bg-[var(--surface-tint-strong)] p-1">
            {(["expense", "income"] as const).map((k) => {
              const active = kind === k
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchKind(k)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-sm font-black transition",
                    active ? "bg-[var(--card)] text-[var(--text)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]" : "text-[var(--muted)]"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", k === "expense" ? "bg-[var(--expense)]" : "bg-[var(--income)]", !active && "opacity-50")} />
                  {k === "expense" ? tr("Belanja", "Expense") : tr("Pendapatan", "Income")}
                </button>
              )
            })}
          </div>

          {/* Amount, large in the middle */}
          <label className="flex min-h-[12rem] flex-col items-center justify-center text-center">
            <span className="text-sm font-semibold text-[var(--muted)]">{tr("Masukkan amaun", "Enter the amount")}</span>
            <span className="mt-3 flex max-w-full items-baseline justify-center gap-2">
              <span className={cn("text-2xl font-bold", isExpense ? "text-[var(--expense)]" : "text-[var(--income)]")}>
                {isExpense ? "−" : "+"}RM
              </span>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                enterKeyHint="next"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    goToCategory()
                  }
                }}
                // Inline: globals.css has an unlayered `input { font: inherit }`,
                // which beats the layered text-*/font-* utilities on an input.
                style={{
                  width: `${Math.max(4, amount.length || 4) + 0.5}ch`,
                  fontSize: "4rem",
                  fontWeight: 900,
                  lineHeight: 1,
                }}
                className="min-w-0 max-w-[16rem] border-0 bg-transparent text-center tabular-nums tracking-tight text-[var(--text)] outline-none placeholder:font-black placeholder:text-[var(--muted)]/35"
              />
            </span>
          </label>
        </>
      ) : null}

      {step === 2 ? (
        <>
          {summary}
          <section>
            <p className="mb-3 px-1 text-base font-black text-[var(--text)]">{tr("Pilih kategori", "Pick a category")}</p>
            {categories === null ? (
              <div className="flex flex-wrap gap-2">
                {[64, 88, 72, 96, 60, 80].map((w, i) => (
                  <div key={i} className="skeleton-surface h-10 rounded-full" style={{ width: w }} />
                ))}
              </div>
            ) : kindCategories.length === 0 ? (
              <p className="rounded-2xl bg-[var(--card)] px-4 py-3 text-xs font-medium text-[var(--muted)] shadow-[var(--shadow-card)]">
                {tr("Tiada kategori untuk jenis ini. Tekan Langkau untuk teruskan.", "No categories of this kind. Tap Skip to go on.")}
              </p>
            ) : (
              // Names only, as text chips: no icons or emoji.
              <div className="flex max-h-[18rem] flex-wrap gap-2 overflow-y-auto overscroll-contain pb-1">
                {kindCategories.map((c) => {
                  const active = categoryId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCategory(c.id)}
                      aria-pressed={active}
                      className={cn(
                        "max-w-full truncate rounded-full px-4 py-2.5 text-sm font-bold transition active:scale-95",
                        active
                          ? isExpense
                            ? "bg-rose-500/12 text-rose-700 ring-2 ring-rose-500/50 dark:text-rose-300"
                            : "bg-emerald-500/12 text-emerald-700 ring-2 ring-emerald-500/50 dark:text-emerald-300"
                          : "bg-[var(--card)] text-[var(--text-soft)] shadow-[var(--shadow-card)]"
                      )}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {step === 3 ? (
        <>
          {summary}

          {/* Note */}
          <label className="block">
            <span className="mb-2 block px-1 text-xs font-bold text-[var(--muted)]">{tr("Nota", "Note")}</span>
            <input
              type="text"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isExpense ? tr("Cth: Nasi lemak", "E.g. Lunch") : tr("Cth: Gaji September", "E.g. September salary")}
              className="h-12 w-full rounded-2xl border-0 bg-[var(--card)] px-4 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-card)] outline-none placeholder:font-medium placeholder:text-[var(--muted)]/70 focus:ring-2 focus:ring-[var(--text)]/20"
            />
          </label>

          {/* Date */}
          <section>
            <p className="mb-2 px-1 text-xs font-bold text-[var(--muted)]">{tr("Tarikh", "Date")}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDate(today)} className={chip(date === today)}>
                {tr("Hari ini", "Today")}
              </button>
              <button type="button" onClick={() => setDate(yesterday)} className={chip(date === yesterday)}>
                {tr("Semalam", "Yesterday")}
              </button>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value || today)}
                aria-label={tr("Pilih tarikh", "Pick a date")}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-full border-0 px-3 text-xs font-bold outline-none",
                  date !== today && date !== yesterday ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--card)] text-[var(--text-soft)] shadow-[var(--shadow-card)]"
                )}
              />
            </div>
          </section>

          {/* Wallet (optional) */}
          {spendWallets.length > 1 ? (
            <section>
              <p className="mb-2 px-1 text-xs font-bold text-[var(--muted)]">{tr("Dompet", "Wallet")}</p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
                <button type="button" onClick={() => setWalletId(null)} className={chip(walletId === null)}>
                  {tr("Auto (lalai)", "Auto (default)")}
                </button>
                {spendWallets.map((w) => (
                  <button key={w.id} type="button" onClick={() => setWalletId(w.id)} className={chip(walletId === w.id)}>
                    {w.label || w.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-2xl bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </AppSheet>
  )
}
