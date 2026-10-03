"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Bell, BellOff, Check, Clock, Loader2, Pencil, Pill, Plus, Trash2, X } from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import { DesktopPageAction, DesktopPageBody, DesktopPageHeader, MobileIconButton, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero } from "@/components/ui/ModenHero"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type Schedule = { id: number; time: string; enabled: boolean; position: number }
type Dose = { schedule_id?: number | null; scheduled_time: string; status: string; taken_at?: string | null }
type Medication = {
  id: number
  name: string
  dosage?: string | null
  frequency: number
  timing: string
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
  reminder_enabled: boolean
  schedules: Schedule[]
  today_doses: Dose[]
}

function todayKey() {
  const kl = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }))
  return `${kl.getFullYear()}-${String(kl.getMonth() + 1).padStart(2, "0")}-${String(kl.getDate()).padStart(2, "0")}`
}

const field = "h-12 w-full rounded-full border border-[var(--border)] bg-transparent px-4 text-base text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]"

export default function HealthMedicationsPage() {
  const params = useParams()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])
  const locale = isBm ? "ms-MY" : "en-MY"
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, showConfirm, alertModal } = usePageAlert(lang)

  const [meds, setMeds] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [editing, setEditing] = useState<Medication | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const showSkeleton = useDelayedSkeleton(loading && !hasLoaded)

  const [name, setName] = useState("")
  const [dosage, setDosage] = useState("")
  const [pillCount, setPillCount] = useState("")
  const [timing, setTiming] = useState("anytime")
  const [times, setTimes] = useState<string[]>(["08:00"])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reminderEnabled, setReminderEnabled] = useState(true)

  const headers = useCallback((json = false): Record<string, string> => {
    const token = getAccessToken()
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])
  const errorOf = async (res: Response, fallback: string) => {
    const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null
    return typeof payload?.detail === "string" ? payload.detail : fallback
  }

  const loadMeds = useCallback(async () => {
    try {
      const res = await fetch("/api/health/medications", { headers: headers(), credentials: "include", cache: "no-store" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMeds(Array.isArray(data) ? data : [])
      setHasLoaded(true)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void loadMeds()
  }, [loadMeds])

  const openAdd = () => {
    setEditing(null)
    setName("")
    setDosage("")
    setPillCount("")
    setTiming("anytime")
    setTimes(["08:00"])
    setStartDate("")
    setEndDate("")
    setReminderEnabled(true)
    setSheet(true)
  }

  const openEdit = (med: Medication) => {
    // The dose is stored as one string: "2 pil · 500mg", "2 pil" or "500mg".
    const d = med.dosage || ""
    const m = d.match(/^(\d+)\s*pil\s*·\s*(.+)$/) || d.match(/^(\d+)\s*pil$/)
    setPillCount(m ? m[1] : "")
    setDosage(m ? m[2] || "" : d)
    setName(med.name)
    setTiming(med.timing || "anytime")
    setTimes(med.schedules.length ? med.schedules.map((s) => s.time) : ["08:00"])
    setStartDate(med.start_date || "")
    setEndDate(med.end_date || "")
    setReminderEnabled(med.reminder_enabled)
    setEditing(med)
    setSheet(true)
  }

  const close = () => {
    setSheet(false)
    setEditing(null)
  }

  const cleanTimes = times.filter(Boolean)
  const problem = !name.trim()
    ? tr("Nama ubat diperlukan.", "Medication name is required.")
    : cleanTimes.length === 0
      ? tr("Tambah sekurang-kurangnya satu waktu.", "Add at least one reminder time.")
      : new Set(cleanTimes).size !== cleanTimes.length
        ? tr("Dua waktu sama.", "Two reminder times are the same.")
        : startDate && endDate && endDate < startDate
          ? tr("Tarikh tamat sebelum tarikh mula.", "The end date is before the start date.")
          : null

  const saveMed = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (problem) {
      showAlert(tr("Maklumat tak lengkap", "Incomplete info"), problem, "error")
      return
    }
    setSaving(true)
    try {
      const doseText = dosage.trim()
      const pills = pillCount.trim()
      const fullDosage = pills ? (doseText ? `${pills} pil · ${doseText}` : `${pills} pil`) : doseText
      const sorted = [...cleanTimes].sort()
      const res = await fetch(editing ? `/api/health/medications/${editing.id}` : "/api/health/medications", {
        method: editing ? "PATCH" : "POST",
        headers: headers(true),
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          dosage: fullDosage || null,
          frequency: sorted.length,
          timing,
          start_date: startDate || null,
          end_date: endDate || null,
          reminder_enabled: reminderEnabled,
          schedules: sorted.map((t) => ({ time: t, enabled: true })),
        }),
      })
      if (!res.ok) throw new Error(await errorOf(res, tr("Gagal simpan ubat.", "Could not save the medication.")))
      close()
      await loadMeds()
    } catch (err) {
      showAlert(tr("Gagal simpan", "Save failed"), err instanceof Error ? err.message : "", "error")
    } finally {
      setSaving(false)
    }
  }

  const call = async (key: string, run: () => Promise<Response>, fallback: string) => {
    setBusyKey(key)
    try {
      const res = await run()
      if (!res.ok) throw new Error(await errorOf(res, fallback))
      await loadMeds()
    } catch (err) {
      showAlert(tr("Gagal", "Failed"), err instanceof Error ? err.message : fallback, "error")
    } finally {
      setBusyKey(null)
    }
  }

  const toggleReminder = (med: Medication) =>
    call(`r${med.id}`, () => fetch(`/api/health/medications/${med.id}/toggle-reminder?enabled=${!med.reminder_enabled}`, { method: "POST", headers: headers(), credentials: "include" }), tr("Gagal tukar peringatan.", "Could not change the reminder."))
  const toggleSchedule = (s: Schedule) =>
    call(`s${s.id}`, () => fetch(`/api/health/schedules/${s.id}?enabled=${!s.enabled}`, { method: "PATCH", headers: headers(), credentials: "include" }), tr("Gagal tukar waktu.", "Could not change the time."))
  const tickDose = (med: Medication, s: Schedule, status: string) =>
    call(`d${med.id}-${s.id}`, () => fetch(`/api/health/medications/${med.id}/doses`, { method: "POST", headers: headers(true), credentials: "include", body: JSON.stringify({ schedule_id: s.id, status }) }), tr("Gagal kemas kini dos.", "Could not update the dose."))

  const deleteMed = (med: Medication) =>
    showConfirm(tr("Padam ubat?", "Delete medication?"), tr(`Padam ${med.name} dan semua rekod dosnya?`, `Delete ${med.name} and its dose history?`), async () => {
      await call(`x${med.id}`, () => fetch(`/api/health/medications/${med.id}`, { method: "DELETE", headers: headers(), credentials: "include" }), tr("Gagal padam.", "Could not delete."))
      close()
    }, "warning")

  const doseOf = (med: Medication, s: Schedule) => med.today_doses.find((d) => d.schedule_id === s.id)
  const today = todayKey()
  const running = (m: Medication) => (!m.start_date || m.start_date <= today) && (!m.end_date || m.end_date >= today)

  const progress = useMemo(() => {
    let total = 0
    let taken = 0
    for (const m of meds) {
      if (!running(m)) continue
      for (const s of m.schedules) {
        if (!s.enabled) continue
        total++
        if (doseOf(m, s)?.status === "taken") taken++
      }
    }
    return { total, taken }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meds, today])

  const timingText = (t: string) => ({ before_meal: tr("Sebelum makan", "Before meal"), after_meal: tr("Selepas makan", "After meal") } as Record<string, string>)[t] || ""
  const periodText = (m: Medication) => {
    if (!m.start_date && !m.end_date) return ""
    const f = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })
    if (m.end_date && m.end_date < today) return tr(`Tamat ${f(m.end_date)}`, `Ended ${f(m.end_date)}`)
    if (m.start_date && m.start_date > today) return tr(`Bermula ${f(m.start_date)}`, `Starts ${f(m.start_date)}`)
    return m.end_date ? tr(`Hingga ${f(m.end_date)}`, `Until ${f(m.end_date)}`) : ""
  }

  const switchBtn = (on: boolean, onClick: () => void, aria: string, busy = false) => (
    <button type="button" role="switch" aria-checked={on} aria-label={aria} onClick={onClick} disabled={busy} className={cn("relative h-6 w-11 shrink-0 rounded-full disabled:opacity-50", on ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--border-strong)]")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white", on ? "left-[22px]" : "left-0.5")} />
    </button>
  )

  return (
    <div className="pb-24 md:pb-6">
      <div className="md:hidden">
        <MobilePageHeader
          title={tr("Ubat", "Medications")}
          fallbackHref={`/${sessionId}/health`}
          action={
            <MobileIconButton onClick={openAdd} label={tr("Tambah ubat", "Add medication")}>
              <Plus strokeWidth={2.5} />
            </MobileIconButton>
          }
        />
      </div>
      <DesktopPageHeader
        className="hidden md:block"
        title={tr("Ubat dan Peringatan", "Medications and Reminders")}
        homeHref={`/${sessionId}`}
        breadcrumbs={[{ label: tr("Kesihatan", "Health"), href: `/${sessionId}/health` }]}
        actions={
          <DesktopPageAction onClick={openAdd}>
            <Plus strokeWidth={2.5} />
            {tr("Tambah ubat", "Add medication")}
          </DesktopPageAction>
        }
      />

      <DesktopPageBody className="mt-2 space-y-4 px-1 md:mt-0 md:space-y-5 md:px-0">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <ModenHero
            label={
              <>
                <Pill size={16} />
                {tr("Dos hari ini", "Today's doses")}
              </>
            }
            currency={null}
            amount={showSkeleton ? "—" : `${progress.taken} / ${progress.total}`}
            amountSize="clamp(2rem, 9vw, 2.75rem)"
            stats={[
              { key: "left", tone: progress.total - progress.taken > 0 ? "out" : "in", icon: <Clock size={15} strokeWidth={2.2} />, label: tr("Belum diambil", "Still to take"), value: String(Math.max(0, progress.total - progress.taken)) },
              { key: "meds", tone: "neutral", icon: <Pill size={15} strokeWidth={2.2} />, label: tr("Ubat aktif", "Active meds"), value: String(meds.filter(running).length) },
            ]}
          />

          {showSkeleton ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-[1.5rem] bg-[var(--surface-tint)]" />
              ))}
            </div>
          ) : loadFailed && !hasLoaded ? (
            <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-10 text-center">
              <p className="text-sm font-bold text-[var(--text)]">{tr("Ubat tidak dapat dimuatkan", "Medications could not be loaded")}</p>
              <button type="button" onClick={() => { setLoading(true); void loadMeds() }} className="h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                {tr("Cuba lagi", "Try again")}
              </button>
            </div>
          ) : meds.length === 0 ? (
            <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]"><Pill size={24} /></span>
              <p className="mt-4 text-base font-bold text-[var(--text)]">{tr("Belum ada ubat", "No medications yet")}</p>
              <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{tr("Tambah ubat dan waktu pengambilan supaya anda diingatkan.", "Add a medication and its times and you will be reminded.")}</p>
              <button type="button" onClick={openAdd} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                <Plus size={15} />
                {tr("Tambah ubat", "Add medication")}
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {meds.map((med) => {
                const live = running(med)
                const extra = [timingText(med.timing), periodText(med)].filter(Boolean).join(" · ")
                return (
                  <li key={med.id} className={cn("rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4", !live && "opacity-70")}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]"><Pill size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-base font-bold text-[var(--text)] [overflow-wrap:anywhere]">{med.name}</p>
                        <p className="text-xs text-[var(--muted)] [overflow-wrap:anywhere]">{[med.dosage, extra].filter(Boolean).join(" · ") || tr("Tiada butiran dos", "No dose details")}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => toggleReminder(med)} disabled={busyKey === `r${med.id}`} aria-label={tr("Tukar peringatan", "Toggle reminder")} className={cn("flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-50", med.reminder_enabled ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>
                          {med.reminder_enabled ? <Bell size={15} /> : <BellOff size={15} />}
                        </button>
                        <button type="button" onClick={() => openEdit(med)} aria-label={tr("Ubah", "Edit")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><Pencil size={15} /></button>
                      </div>
                    </div>

                    <ul className="mt-3 space-y-2">
                      {med.schedules.map((s) => {
                        const dose = doseOf(med, s)
                        const key = `d${med.id}-${s.id}`
                        const status = dose?.status
                        return (
                          <li key={s.id} className="flex items-center gap-3 rounded-full border border-[var(--border)] py-2 pl-4 pr-2.5">
                            <Clock size={14} className="shrink-0 text-[var(--muted)]" />
                            <span className={cn("flex-1 text-sm font-bold tabular-nums text-[var(--text)]", !s.enabled && "opacity-40")}>{s.time}</span>
                            {s.enabled && live ? (
                              status === "taken" || status === "skipped" ? (
                                <span className="flex items-center gap-2">
                                  <span className={cn("flex items-center gap-1 text-xs font-semibold", status === "taken" ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]")}>
                                    {status === "taken" ? <Check size={13} strokeWidth={3} /> : null}
                                    {status === "taken" ? tr("Sudah ambil", "Taken") : tr("Dilangkau", "Skipped")}
                                  </span>
                                  <button type="button" onClick={() => tickDose(med, s, "pending")} disabled={busyKey === key} className="text-xs font-semibold text-[var(--muted)] underline underline-offset-2 disabled:opacity-50">{tr("Batal", "Undo")}</button>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <button type="button" onClick={() => tickDose(med, s, "skipped")} disabled={busyKey === key} className="h-8 rounded-full px-3 text-xs font-semibold text-[var(--muted)] disabled:opacity-50">{tr("Langkau", "Skip")}</button>
                                  <button type="button" onClick={() => tickDose(med, s, "taken")} disabled={busyKey === key} className="flex h-8 items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-4 text-xs font-semibold text-[var(--btn-primary-text)] disabled:opacity-50">
                                    {busyKey === key ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                                    {tr("Ambil", "Take")}
                                  </button>
                                </span>
                              )
                            ) : null}
                            {switchBtn(s.enabled, () => toggleSchedule(s), tr("Hidupkan waktu", "Enable time"), busyKey === `s${s.id}`)}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DesktopPageBody>

      <AppSheet
        open={sheet}
        onClose={close}
        id="health-med-sheet"
        title={editing ? tr("Ubah ubat", "Edit medication") : tr("Ubat baharu", "New medication")}
        size="md"
        footer={
          <div className="flex gap-2">
            {editing ? (
              <button type="button" onClick={() => deleteMed(editing)} disabled={saving} aria-label={tr("Padam", "Delete")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500 disabled:opacity-50"><Trash2 size={16} /></button>
            ) : null}
            <button type="button" onClick={() => void saveMed()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {tr("Simpan", "Save")}
            </button>
          </div>
        }
      >
        <form onSubmit={saveMed} className="space-y-4">
          <div>
            <label htmlFor="med-name" className={label}>{tr("Nama ubat", "Medication name")}</label>
            <input id="med-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={tr("cth. Metformin", "e.g. Metformin")} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={label}>{tr("Bilangan pil", "Pills")}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPillCount((v) => String(Math.max(1, (parseInt(v) || 1) - 1)))} aria-label={tr("Kurang pil", "Fewer pills")} className="flex h-12 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-lg font-bold text-[var(--text)]">−</button>
                <input value={pillCount} onChange={(e) => setPillCount(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="1" aria-label={tr("Bilangan pil", "Pills")} className={cn(field, "min-w-0 px-1 text-center")} />
                <button type="button" onClick={() => setPillCount((v) => String(Math.min(99, (parseInt(v) || 1) + 1)))} aria-label={tr("Tambah pil", "More pills")} className="flex h-12 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-lg font-bold text-[var(--text)]">+</button>
              </div>
            </div>
            <div>
              <label htmlFor="med-dose" className={label}>{tr("Dos", "Dosage")}</label>
              <input id="med-dose" value={dosage} maxLength={60} onChange={(e) => setDosage(e.target.value)} placeholder="500mg" className={field} />
            </div>
          </div>
          <div>
            <span className={label}>{tr("Cara ambil", "How to take")}</span>
            <div className="flex gap-1.5">
              {([["before_meal", tr("Sebelum makan", "Before meal")], ["after_meal", tr("Selepas makan", "After meal")], ["anytime", tr("Bila-bila", "Anytime")]] as const).map(([k, text]) => (
                <button key={k} type="button" aria-pressed={timing === k} onClick={() => setTiming(k)} className={cn("h-10 flex-1 rounded-full border px-2 text-xs font-semibold", timing === k ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--muted)]")}>{text}</button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>{tr("Waktu peringatan", "Reminder times")}</span>
            <div className="space-y-2">
              {times.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="time" value={t} aria-label={tr(`Waktu ${idx + 1}`, `Time ${idx + 1}`)} onChange={(e) => setTimes((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))} className={field} />
                  {times.length > 1 ? (
                    <button type="button" onClick={() => setTimes((prev) => prev.filter((_, i) => i !== idx))} aria-label={tr("Buang waktu", "Remove time")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)]"><X size={16} /></button>
                  ) : null}
                </div>
              ))}
              {times.length < 12 && (
                <button type="button" onClick={() => setTimes((prev) => [...prev, "12:00"])} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-[var(--border-strong)] px-4 text-xs font-semibold text-[var(--muted)]">
                  <Plus size={14} />
                  {tr("Tambah waktu", "Add a time")}
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="med-start" className={label}>{tr("Mula (pilihan)", "Start (optional)")}</label>
              <input id="med-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="med-end" className={label}>{tr("Tamat (pilihan)", "End (optional)")}</label>
              <input id="med-end" type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-full border border-[var(--border)] py-2.5 pl-4 pr-3">
            <span className="text-sm font-semibold text-[var(--text)]">{tr("Hantar peringatan", "Send reminders")}</span>
            {switchBtn(reminderEnabled, () => setReminderEnabled((v) => !v), tr("Hantar peringatan", "Send reminders"))}
          </div>
        </form>
      </AppSheet>

      {alertModal}
    </div>
  )
}
