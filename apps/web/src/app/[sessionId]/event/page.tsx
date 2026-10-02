"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CalendarClock, Check, Compass, ImagePlus, Loader2, PartyPopper, Pencil, Plus, Trash2 } from "lucide-react"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { CATEGORY_ICON_OPTIONS, CategoryIconGlyph } from "@/lib/category-icons"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type EventItem = {
  id: number
  name: string
  icon_name?: string | null
  start_date?: string | null
  end_date?: string | null
  currency: string
  wallet_id?: number | null
  budget?: number | null
  notes?: string | null
  status: string
  has_image: boolean
  image_url?: string | null
  spent?: number
  transaction_count?: number
}

type WalletItem = { id: number; name: string; label?: string | null; currency: string }
type Form = { name: string; icon_name: string; start_date: string; end_date: string; wallet_id: string; budget: string; notes: string }
const emptyForm: Form = { name: "", icon_name: "gift", start_date: "", end_date: "", wallet_id: "", budget: "", notes: "" }

const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(value?: string | null, locale = "en-MY") {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString(locale, { day: "numeric", month: "short" })
}

/** Days from today (Kuala Lumpur) to a date; negative when it has passed. */
function daysTo(value?: string | null): number | null {
  if (!value) return null
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  kl.setHours(0, 0, 0, 0)
  const d = new Date(`${value}T00:00:00`)
  return isNaN(d.getTime()) ? null : Math.round((d.getTime() - kl.getTime()) / 86400000)
}

export default function EventPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [events, setEvents] = useState<EventItem[]>([])
  const [wallets, setWallets] = useState<WalletItem[]>([])
  const [filter, setFilter] = useState<"active" | "ended" | "all">("active")
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const fileRef = useRef<HTMLInputElement>(null)
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])
  const errorOf = async (res: Response, fallback: string) => {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof body?.detail === "string" ? body.detail : fallback
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/events", { headers: headers(), cache: "no-store" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void load()
    void (async () => {
      try {
        const res = await fetch("/api/wallets", { headers: headers(), cache: "no-store" })
        if (res.ok) setWallets(await res.json())
      } catch {
        // optional
      }
    })()
  }, [load, headers])

  const isOpen = (e: EventItem) => e.status !== "ended" && e.status !== "cancelled"
  const sorted = useMemo(
    () =>
      [...events].sort((a, b) => {
        const ao = isOpen(a) ? 0 : 1
        const bo = isOpen(b) ? 0 : 1
        if (ao !== bo) return ao - bo
        // Open ones soonest first; finished ones most recent first.
        const ad = a.start_date || a.end_date || ""
        const bd = b.start_date || b.end_date || ""
        return ao === 0 ? ad.localeCompare(bd) : bd.localeCompare(ad)
      }),
    [events]
  )
  const visible = sorted.filter((e) => (filter === "all" ? true : filter === "active" ? isOpen(e) : !isOpen(e)))
  const openEvents = events.filter(isOpen)
  const ongoing = events.filter((e) => e.status === "ongoing")
  const spentOpen = openEvents.reduce((s, e) => s + Number(e.spent || 0), 0)
  const budgetOpen = openEvents.reduce((s, e) => s + Number(e.budget || 0), 0)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }
  const openEdit = (e: EventItem) => {
    setEditing(e)
    setForm({
      name: e.name,
      icon_name: e.icon_name || "gift",
      start_date: e.start_date || "",
      end_date: e.end_date || "",
      wallet_id: e.wallet_id ? String(e.wallet_id) : "",
      budget: e.budget != null ? String(e.budget) : "",
      notes: e.notes || "",
    })
    setShowForm(true)
  }

  const budgetNum = form.budget.trim() === "" ? null : parseFloat(form.budget)
  const problem = !form.name.trim()
    ? tr("Nama diperlukan.", "A name is required.")
    : !form.start_date || !form.end_date
      ? tr("Pilih tarikh mula dan tamat.", "Choose a start and end date.")
      : form.start_date > form.end_date
        ? tr("Tarikh mula tidak boleh selepas tarikh tamat.", "The start date cannot be after the end date.")
        : budgetNum != null && (isNaN(budgetNum) || budgetNum < 0)
          ? tr("Bajet tidak sah.", "The budget is not valid.")
          : null

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/events/${editing.id}` : "/api/events", {
        method: editing ? "PATCH" : "POST",
        headers: headers(true),
        body: JSON.stringify({
          name: form.name.trim(),
          icon_name: form.icon_name || null,
          start_date: form.start_date,
          end_date: form.end_date,
          wallet_id: form.wallet_id ? Number(form.wallet_id) : null,
          budget: budgetNum,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan acara.", "Could not save the event.")))
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const remove = (ev: EventItem) => {
    showConfirm(
      tr("Padam acara?", "Delete event?"),
      tr(`Padam “${ev.name}”? Transaksi anda tidak terjejas.`, `Delete “${ev.name}”? Your transactions are not affected.`),
      async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/events/${ev.id}`, { method: "DELETE", headers: headers() })
          if (!res.ok) throw new Error(await errorOf(res, tr("Gagal padam.", "Could not delete.")))
          setShowForm(false)
          setEditing(null)
          await load()
        } catch (err) {
          showAlert(tr("Gagal padam", "Delete failed"), err instanceof Error ? err.message : "", "error")
        } finally {
          setSaving(false)
        }
      },
      "warning"
    )
  }

  const uploadImage = async (file: File) => {
    if (!editing) return
    if (!file.type.startsWith("image/")) {
      showAlert(tr("Fail tak sah", "Invalid file"), tr("Pilih fail gambar.", "Choose an image file."), "error")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showAlert(tr("Fail terlalu besar", "File too large"), tr("Had 5 MB.", "The limit is 5 MB."), "warning")
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/events/${editing.id}/image`, { method: "POST", headers: headers(), body: fd })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal muat naik.", "Upload failed.")))
      const updated = (await res.json()) as EventItem
      setEditing({ ...editing, ...updated })
      await load()
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
  const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

  const statusChip = (e: EventItem) => {
    const days = daysTo(e.start_date)
    const text =
      e.status === "ongoing"
        ? tr("Sedang berlangsung", "Ongoing")
        : e.status === "ended"
          ? tr("Tamat", "Ended")
          : e.status === "cancelled"
            ? tr("Dibatalkan", "Cancelled")
            : days != null && days > 0
              ? tr(`${days} hari lagi`, `In ${days} days`)
              : tr("Akan datang", "Upcoming")
    const tone = e.status === "ongoing" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-[var(--border)] text-[var(--muted)]"
    return <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tone)}>{text}</span>
  }

  const tabs: Array<["active" | "ended" | "all", string, number]> = [
    ["active", tr("Aktif", "Active"), openEvents.length],
    ["ended", tr("Tamat", "Ended"), events.length - openEvents.length],
    ["all", tr("Semua", "All"), events.length],
  ]

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader
          title={tr("Acara Saya", "My Events")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={openCreate} label={tr("Tambah acara", "Add event")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden lg:block"
        title={tr("Acara Saya", "My Events")}
        homeHref={`/${sessionId}`}
        actions={
          <DesktopPageAction onClick={openCreate}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah acara", "Add event")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <PartyPopper size={16} />
              {tr("Belanja acara aktif", "Spent on active events")}
            </>
          }
          currency="RM"
          amount={showSkeleton ? "—" : money(spentOpen)}
          amountSize="clamp(2rem, 9vw, 2.75rem)"
          stats={[
            { key: "ongoing", tone: "in", icon: <Compass size={15} strokeWidth={2.2} />, label: tr("Berlangsung", "Ongoing"), value: String(ongoing.length) },
            { key: "budget", tone: "neutral", icon: <CalendarClock size={15} strokeWidth={2.2} />, label: tr("Jumlah bajet", "Total budget"), value: budgetOpen > 0 ? `RM ${money(budgetOpen)}` : "—" },
          ]}
        />

        {loadFailed && !hasLoaded ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-base font-bold text-[var(--text)]">{tr("Acara tidak dapat dimuatkan", "Events could not be loaded")}</p>
            <button type="button" onClick={() => { setLoading(true); void load() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
              {tr("Cuba lagi", "Try again")}
            </button>
          </div>
        ) : (
          <>
            <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map(([key, text, count]) => (
                <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", filter === key ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")}>
                  {text}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", filter === key ? "bg-white/20" : "bg-[var(--surface-tint-strong)]")}>{count}</span>
                </button>
              ))}
            </div>

            {showSkeleton ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                  <PartyPopper size={24} />
                </span>
                <p className="mt-4 text-base font-bold text-[var(--text)]">{events.length ? tr("Tiada dalam tapisan ini", "None in this filter") : tr("Belum ada acara", "No events yet")}</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{tr("Jejak belanja percutian, majlis atau projek dalam satu tempoh.", "Track spending for a trip, a celebration or a project over a period.")}</p>
                {!events.length && (
                  <button type="button" onClick={openCreate} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                    <Plus size={15} />
                    {tr("Tambah acara", "Add event")}
                  </button>
                )}
              </div>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {visible.map((ev) => {
                  const budget = Number(ev.budget || 0)
                  const spent = Number(ev.spent || 0)
                  const ratio = budget > 0 ? spent / budget : 0
                  const over = budget > 0 && spent > budget
                  return (
                    <li key={ev.id} className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => router.push(`/${sessionId}/event/${ev.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          {ev.has_image && ev.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ev.image_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
                              <CategoryIconGlyph iconName={ev.icon_name} categoryName={ev.name} kind="expense" size={22} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-bold text-[var(--text)]">{ev.name}</span>
                            <span className="block truncate text-xs text-[var(--muted)]">
                              {fmtDate(ev.start_date, locale)} – {fmtDate(ev.end_date, locale)}
                              {ev.transaction_count ? ` · ${ev.transaction_count} ${tr("transaksi", "transactions")}` : ""}
                            </span>
                          </span>
                        </button>
                        <button type="button" onClick={() => openEdit(ev)} aria-label={tr("Ubah", "Edit")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]">
                          <Pencil size={14} />
                        </button>
                      </div>
                      <div className="mt-2.5">{statusChip(ev)}</div>
                      <button type="button" onClick={() => router.push(`/${sessionId}/event/${ev.id}`)} className="mt-3 block w-full text-left">
                        {budget > 0 ? (
                          <>
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-tint-strong)]">
                              <div className={cn("h-full rounded-full transition-all", over ? "bg-rose-500" : ratio > 0.8 ? "bg-amber-500" : "bg-[var(--btn-primary-bg)]")} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                            </div>
                            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                              <span className="text-[var(--muted)]">
                                {tr("Belanja", "Spent")} <span className="font-semibold tabular-nums text-[var(--text)]">{ev.currency} {money(spent)}</span>
                              </span>
                              <span className={cn("font-bold tabular-nums", over ? "text-rose-500" : "text-[var(--text)]")}>
                                {over ? tr(`Lebih ${ev.currency} ${money(spent - budget)}`, `Over by ${ev.currency} ${money(spent - budget)}`) : tr(`Baki ${ev.currency} ${money(budget - spent)}`, `${ev.currency} ${money(budget - spent)} left`)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="text-[var(--muted)]">{tr("Belanja", "Spent")}</span>
                            <span className="font-bold tabular-nums text-[var(--text)]">{ev.currency} {money(spent)}</span>
                          </div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </DesktopPageBody>

      <AppSheet
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null) }}
        id="event-create-sheet"
        title={editing ? tr("Ubah acara", "Edit event") : tr("Acara baharu", "New event")}
        size="md"
        footer={
          <div className="flex gap-2">
            {editing && (
              <button type="button" onClick={() => remove(editing)} disabled={saving} aria-label={tr("Padam", "Delete")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500 disabled:opacity-50">
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editing ? tr("Simpan perubahan", "Save changes") : tr("Tambah acara", "Add event")}
            </button>
          </div>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="ev-name" className={label}>{tr("Nama acara", "Event name")}</label>
            <input id="ev-name" value={form.name} maxLength={190} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tr("cth. Percutian Langkawi", "e.g. Langkawi trip")} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ev-start" className={label}>{tr("Tarikh mula", "Start date")}</label>
              <input id="ev-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: form.end_date && form.end_date < e.target.value ? e.target.value : form.end_date })} className={field} />
            </div>
            <div>
              <label htmlFor="ev-end" className={label}>{tr("Tarikh tamat", "End date")}</label>
              <input id="ev-end" type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={field} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-[var(--muted)]">{tr("Semua belanja dalam tempoh ini dikira sebagai belanja acara.", "Everything you spend within these dates counts towards the event.")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ev-budget" className={label}>{tr("Bajet (pilihan)", "Budget (optional)")}</label>
              <input id="ev-budget" inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0.00" className={field} />
            </div>
            <div>
              <label htmlFor="ev-wallet" className={label}>{tr("Dompet (pilihan)", "Wallet (optional)")}</label>
              <select id="ev-wallet" value={form.wallet_id} onChange={(e) => setForm({ ...form, wallet_id: e.target.value })} className={field}>
                <option value="">{tr("Semua dompet", "All wallets")}</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>{w.label || w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className={label}>{tr("Ikon", "Icon")}</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_ICON_OPTIONS.slice(0, 18).map((o) => (
                <button key={o.name} type="button" aria-label={o.label} aria-pressed={form.icon_name === o.name} onClick={() => setForm({ ...form, icon_name: o.name })} className={cn("flex h-11 w-11 items-center justify-center rounded-full border transition", form.icon_name === o.name ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--text)]")}>
                  <o.icon size={18} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="ev-notes" className={label}>{tr("Nota (pilihan)", "Notes (optional)")}</label>
            <textarea id="ev-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-[1.25rem] border border-[var(--border)] bg-transparent p-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]" />
          </div>
          {editing && (
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadImage(f) }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={saving} className="flex h-11 items-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] px-5 text-sm font-semibold text-[var(--muted)] disabled:opacity-50">
                <ImagePlus size={15} />
                {editing.has_image ? tr("Tukar gambar", "Change picture") : tr("Tambah gambar (pilihan)", "Add a picture (optional)")}
              </button>
            </div>
          )}
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
