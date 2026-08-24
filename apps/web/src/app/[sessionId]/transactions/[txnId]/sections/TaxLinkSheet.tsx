"use client"

import { useEffect, useState } from "react"
import { BadgePercent, Loader2, Plus, Trash2, Check } from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"

export type TaxLinkSheetProps = {
  open: boolean
  transactionId: number
  transactionAmount: number
  categoryLabel: string
  onClose: () => void
  onSaved: () => void
}

const YEARS = [2027, 2026, 2025, 2024]

export default function TaxLinkSheet({
  open,
  transactionId,
  transactionAmount,
  categoryLabel,
  onClose,
  onSaved,
}: TaxLinkSheetProps) {
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  const [links, setLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(2026)
  const [taxType, setTaxType] = useState<"relief" | "rebate" | "income">("relief")
  const [claimAmount, setClaimAmount] = useState("")
  const [notice, setNotice] = useState("")

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken()
    const h: Record<string, string> = {}
    if (token && !isCookieAuthSentinel(token)) h["Authorization"] = `Bearer ${token}`
    return h
  }

  const loadLinks = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tax/transaction-links?assessment_year=${year}`, {
        credentials: "include",
        headers: authHeaders(),
      })
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setLinks(list.filter((l) => l.transaction_id === transactionId))
    } catch (e) {
      setLinks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setClaimAmount(transactionAmount > 0 ? String(transactionAmount) : "")
      setTaxType("relief")
      setNotice("")
      loadLinks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year, transactionId])

  if (!open) return null

  async function addLink() {
    setSaving(true)
    setNotice("")
    try {
      const res = await fetch(`/api/tax/transaction-links`, {
        method: "POST",
        credentials: "include",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: transactionId,
          tax_year: year,
          tax_type: taxType,
          claim_amount: claimAmount ? Number(claimAmount) : transactionAmount,
          status: "reviewed",
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || "Gagal")
      }
      setNotice(tr("Transaksi dikaitkan dengan cukai", "Transaction linked to tax"))
      setLinks((prev) => {
        const newLink = {
          id: Math.random(),
          transaction_id: transactionId,
          tax_year: year,
          tax_type: taxType,
          claim_amount: claimAmount ? Number(claimAmount) : transactionAmount,
          status: "reviewed",
        }
        const filtered = prev.filter(
          (l) => !(l.tax_type === taxType && l.tax_year === year)
        )
        return [...filtered, newLink]
      })
      onSaved()
    } catch (e: any) {
      setNotice(e.message || "Ralat")
    } finally {
      setSaving(false)
    }
  }

  async function removeLink(linkId: number) {
    setSaving(true)
    try {
      await fetch(`/api/tax/transaction-links/${linkId}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(),
      })
      setLinks((prev) => prev.filter((l) => l.id !== linkId))
      setNotice(tr("Pautan dibuang", "Link removed"))
      onSaved()
    } catch (e) {
      setNotice("Ralat")
    } finally {
      setSaving(false)
    }
  }

  const yearLinks = links.filter((l) => l.tax_year === year)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-transparent p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl border border-[var(--border)] bg-[var(--sheet-bg)] p-5 sm:max-w-[24rem] sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <BadgePercent size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-[var(--text)]">{tr("Cukai / Tax", "Tax / Cukai")}</h3>
            <p className="truncate text-sm text-[var(--muted)]">
              {categoryLabel} · #{transactionId} · RM {Number(transactionAmount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* assessment year */}
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">{tr("Tahun Taksiran", "Assessment Year")}</label>
          <div className="flex gap-1.5">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={
                  "flex-1 rounded-xl border px-3 py-2 text-xs font-bold " +
                  (year === y
                    ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                    : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]")
                }
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* existing links for this year */}
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">
            {tr("Pautan Sedia Ada", "Existing Links")} ({yearLinks.length})
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <Loader2 size={14} className="animate-spin" /> {tr("Memuat…", "Loading…")}
            </div>
          ) : yearLinks.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">{tr("Belum ada pautan untuk tahun ini.", "No links for this year yet.")}</p>
          ) : (
            <div className="space-y-1.5">
              {yearLinks.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2">
                  <div>
                    <p className="text-xs font-bold capitalize text-[var(--text)]">{l.tax_type}</p>
                    <p className="text-[0.65rem] capitalize text-[var(--muted)]">{l.status} · RM {Number(l.claim_amount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <button type="button" onClick={() => removeLink(l.id)} className="rounded-full p-1.5 text-rose-500" aria-label={tr("Buang", "Remove")}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* add link */}
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-3">
          <p className="text-xs font-semibold text-[var(--muted)]">{tr("Tambah Pautan", "Add Link")}</p>
          <div className="mt-2 flex gap-1.5">
            {(["relief", "rebate", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTaxType(t)}
                className={
                  "flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold capitalize " +
                  (taxType === t
                    ? "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                    : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]")
                }
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <label className="mb-1 block text-[0.65rem] font-semibold text-[var(--muted)]">{tr("Amaun Tuntutan (RM)", "Claim Amount (RM)")}</label>
            <input
              type="number"
              inputMode="decimal"
              value={claimAmount}
              onChange={(e) => setClaimAmount(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
              placeholder="0.00"
            />
          </div>
          <button
            type="button"
            onClick={addLink}
            disabled={saving}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-[var(--btn-primary-text)] disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {tr("Kaitkan dengan Cukai", "Link to Tax")}
          </button>
        </div>

        {notice && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <Check size={13} /> {notice}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] py-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          {tr("Tutup", "Close")}
        </button>
      </div>
    </div>
  )
}
