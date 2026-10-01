"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { CalendarHeart, ChevronLeft, ChevronRight, Droplet, Loader2, Pencil, Plus, Sparkles } from "lucide-react"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero, heroPrimaryButtonStyle, heroQuietButtonStyle } from "@/components/ui/ModenHero"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"

type PeriodCycle = {
  id: number
  start_date: string
  end_date: string | null
  period_length: number | null
  notes: string | null
}

type Upcoming = { start: string; end: string; ovulation: string; fertile_start: string; fertile_end: string }

type PeriodSummary = {
  avg_cycle_length: number
  avg_period_length: number
  cycle_length_known: boolean
  cycles_counted: number
  regular: boolean | null
  status: "no_data" | "period" | "waiting" | "late"
  cycle_day: number | null
  period_day: number | null
  days_until_next: number | null
  days_late: number | null
  next_start: string | null
  next_end: string | null
  ovulation_date: string | null
  fertile_start: string | null
  fertile_end: string | null
  upcoming: Upcoming[]
}

type Overview = { cycles: PeriodCycle[]; summary: PeriodSummary; today: string }

type Draft = { id: number | null; start: string; end: string; notes: string }

const PERIOD = "#f43f5e"
const FERTILE = "var(--btn-primary-bg)"

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function inRange(iso: string, start?: string | null, end?: string | null) {
  return Boolean(start && end && iso >= start && iso <= end)
}

export default function PeriodTrackerPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const { showAlert, alertModal } = usePageAlert(lang)

  const [data, setData] = useState<Overview | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const locale = isBm ? "ms-MY" : "en-MY"
  const fmt = (iso?: string | null, withYear = false) =>
    iso
      ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
          ...(withYear ? { year: "numeric" } : {}),
          timeZone: "UTC",
        })
      : "—"

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = getAccessToken()
    const res = await fetch(`/api${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    const body = await res.json().catch(() => null)
    return { res, body }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { res, body } = await request("/period")
      if (res.status === 404) {
        setDisabled(true)
        return
      }
      if (res.ok) {
        setDisabled(false)
        setData(body as Overview)
      }
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    void load()
  }, [load])

  async function mutate(path: string, method: string, payload?: unknown) {
    setWorking(true)
    try {
      const { res, body } = await request(path, { method, body: payload ? JSON.stringify(payload) : undefined })
      if (!res.ok) {
        showAlert(tr("Tidak disimpan", "Not saved"), body?.detail || tr("Cuba lagi.", "Please try again."), "error")
        return false
      }
      setData(body as Overview)
      return true
    } finally {
      setWorking(false)
    }
  }

  const today = data?.today || new Date().toISOString().slice(0, 10)
  const summary = data?.summary
  const cycles = data?.cycles || []
  const openCycle = cycles.find((c) => !c.end_date) || null
  // The fertile window still ahead (a late period's window is already past).
  const nextWindow = summary?.upcoming.find((u) => u.fertile_end >= today) || null

  const startToday = () => void mutate("/period/cycles", "POST", { start_date: today })
  const endToday = () => openCycle && void mutate(`/period/cycles/${openCycle.id}`, "PATCH", { end_date: today })

  async function saveDraft() {
    if (!draft) return
    if (!draft.start) {
      showAlert(tr("Tarikh mula diperlukan", "Start date needed"), tr("Pilih tarikh period bermula.", "Pick the day the period started."), "warning")
      return
    }
    const payload = draft.id
      ? { start_date: draft.start, end_date: draft.end || null, clear_end_date: !draft.end, notes: draft.notes }
      : { start_date: draft.start, end_date: draft.end || null, notes: draft.notes }
    const ok = await mutate(draft.id ? `/period/cycles/${draft.id}` : "/period/cycles", draft.id ? "PATCH" : "POST", payload)
    if (ok) setDraft(null)
  }

  async function deleteDraft() {
    if (!draft?.id) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    const ok = await mutate(`/period/cycles/${draft.id}`, "DELETE")
    if (ok) setDraft(null)
  }

  const openDraft = (next: Draft) => {
    setConfirmDelete(false)
    setDraft(next)
  }

  // The calendar: every day of the month, coloured by what is recorded or expected.
  const calendar = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    const first = new Date(Date.UTC(y, m - 1, 1))
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const lead = (first.getUTCDay() + 6) % 7 // Monday first
    const cells: Array<{ iso: string | null; day: number }> = []
    for (let i = 0; i < lead; i++) cells.push({ iso: null, day: 0 })
    for (let d = 1; d <= days; d++) cells.push({ iso: `${month}-${String(d).padStart(2, "0")}`, day: d })
    return cells
  }, [month])

  const dayKind = (iso: string) => {
    const recorded = cycles.some((c) => inRange(iso, c.start_date, c.end_date || (c.start_date <= today ? today : c.start_date)))
    if (recorded) return "period"
    const upcoming = summary?.upcoming || []
    if (upcoming.some((u) => inRange(iso, u.start, u.end))) return "predicted"
    if (upcoming.some((u) => u.ovulation === iso)) return "ovulation"
    if (upcoming.some((u) => inRange(iso, u.fertile_start, u.fertile_end))) return "fertile"
    return null
  }

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  const weekdays = isBm ? ["Is", "Se", "Ra", "Kh", "Ju", "Sa", "Ah"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

  const headline = !summary
    ? "—"
    : summary.status === "period"
      ? tr(`Hari ke-${summary.period_day}`, `Day ${summary.period_day}`)
      : summary.status === "waiting"
        ? tr(`${summary.days_until_next} hari lagi`, `${summary.days_until_next} days to go`)
        : summary.status === "late"
          ? summary.days_late
            ? tr(`Lewat ${summary.days_late} hari`, `${summary.days_late} days late`)
            : tr("Dijangka hari ini", "Expected today")
          : tr("Mula rekod", "Start recording")
  const subline = !summary
    ? ""
    : summary.status === "period"
      ? tr("Period sedang berlaku", "Period in progress")
      : summary.status === "waiting"
        ? tr(`Period seterusnya dijangka ${fmt(summary.next_start)}`, `Next period expected ${fmt(summary.next_start)}`)
        : summary.status === "late"
          ? tr("Period seterusnya mungkin bermula bila-bila masa.", "Your next period may start any day now.")
          : tr("Rekod period terakhir anda untuk mula meramal.", "Record your last period to start predicting.")

  const header = (
    <>
      <div className="lg:hidden">
        <MobilePageHeader title="Period Tracker" fallbackHref={`/${sessionId}`} />
      </div>
      <DesktopPageHeader className="hidden lg:block" title="Period Tracker" homeHref={`/${sessionId}`} beta />
    </>
  )

  if (!loading && disabled) {
    return (
      <div className="pb-24 lg:pb-0">
        {header}
        <DesktopPageBody className="mt-4 px-1 lg:mt-0 lg:px-0">
          <div className="mx-auto flex max-w-md flex-col items-center rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--text)]">
              <CalendarHeart size={22} />
            </span>
            <p className="mt-4 text-base font-bold text-[var(--text)]">{tr("Period Tracker belum dihidupkan", "Period Tracker is off")}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {tr("Hidupkan di Tetapan › Keutamaan untuk mula guna.", "Switch it on in Settings › Preferences to start.")}
            </p>
            <Link
              href={`/${sessionId}/settings`}
              className="mt-5 inline-flex h-11 items-center rounded-full bg-[var(--btn-primary-bg)] px-5 text-sm font-semibold text-[var(--btn-primary-text)]"
            >
              {tr("Buka Tetapan", "Open Settings")}
            </Link>
          </div>
        </DesktopPageBody>
        {alertModal}
      </div>
    )
  }

  return (
    <div className="pb-24 lg:pb-0">
      {header}

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        {/* Status */}
        <ModenHero
          label={
            <>
              <Droplet size={16} style={{ color: PERIOD }} />
              {tr("Kitaran semasa", "Current cycle")}
            </>
          }
          currency={null}
          amount={loading ? <Loader2 className="animate-spin" size={28} /> : headline}
          amountSize="clamp(1.9rem, 8vw, 2.75rem)"
          stats={[
            {
              key: "cycle",
              tone: "neutral",
              icon: <Sparkles size={15} strokeWidth={2.2} />,
              label: tr("Purata kitaran", "Avg cycle"),
              value: summary ? `${summary.avg_cycle_length} ${tr("hari", "days")}${summary.cycle_length_known ? "" : "*"}` : "—",
            },
            {
              key: "period",
              tone: "neutral",
              icon: <Droplet size={15} strokeWidth={2.2} />,
              label: tr("Purata tempoh", "Avg period"),
              value: summary ? `${summary.avg_period_length} ${tr("hari", "days")}` : "—",
            },
          ]}
        >
          <p className="max-w-md text-[0.8125rem] font-medium leading-relaxed" style={{ color: "var(--hero-muted)" }}>
            {subline}
          </p>
          <div className="grid grid-cols-2 gap-2 md:flex">
            {openCycle ? (
              <button
                type="button"
                onClick={endToday}
                disabled={working || loading}
                className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] disabled:opacity-50 md:px-5"
                style={heroPrimaryButtonStyle}
              >
                {working ? <Loader2 size={16} className="animate-spin" /> : <Droplet size={16} />}
                {tr("Tamat hari ini", "Ended today")}
              </button>
            ) : (
              <button
                type="button"
                onClick={startToday}
                disabled={working || loading}
                className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] disabled:opacity-50 md:px-5"
                style={heroPrimaryButtonStyle}
              >
                {working ? <Loader2 size={16} className="animate-spin" /> : <Droplet size={16} />}
                {tr("Mula hari ini", "Started today")}
              </button>
            )}
            <button
              type="button"
              onClick={() => openDraft({ id: null, start: today, end: "", notes: "" })}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] md:px-5"
              style={heroQuietButtonStyle}
            >
              <Plus size={16} />
              {tr("Tambah rekod", "Add record")}
            </button>
          </div>
        </ModenHero>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-5">
          {/* Calendar */}
          <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label={tr("Bulan lepas", "Previous month")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-sm font-bold text-[var(--text)]">{monthLabel}</p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label={tr("Bulan depan", "Next month")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center">
              {weekdays.map((w) => (
                <div key={w} className="py-1 text-[0.6875rem] font-semibold text-[var(--muted)]">
                  {w}
                </div>
              ))}
              {calendar.map((cell, i) => {
                if (!cell.iso) return <div key={`b${i}`} />
                const kind = dayKind(cell.iso)
                const isToday = cell.iso === today
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => cell.iso && cell.iso <= today && openDraft({ id: null, start: cell.iso, end: "", notes: "" })}
                    className={cn(
                      "relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition",
                      kind === null && "text-[var(--text)] hover:bg-[var(--surface-tint)]",
                      isToday && "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--card)]"
                    )}
                    style={
                      kind === "period"
                        ? { background: PERIOD, color: "#ffffff" }
                        : kind === "predicted"
                          ? { border: `1.5px dashed ${PERIOD}`, color: PERIOD }
                          : kind === "ovulation"
                            ? { background: FERTILE, color: "#ffffff" }
                            : kind === "fertile"
                              ? { background: "color-mix(in srgb, var(--btn-primary-bg) 16%, transparent)", color: "var(--text)" }
                              : undefined
                    }
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[0.75rem] font-medium text-[var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: PERIOD }} />
                {tr("Period", "Period")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ border: `1.5px dashed ${PERIOD}` }} />
                {tr("Dijangka", "Expected")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: "color-mix(in srgb, var(--btn-primary-bg) 25%, transparent)" }} />
                {tr("Subur", "Fertile")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: FERTILE }} />
                {tr("Ovulasi", "Ovulation")}
              </span>
            </div>
          </section>

          <div className="flex flex-col gap-4 lg:gap-5">
            {/* Estimates */}
            <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
              <p className="text-sm font-bold text-[var(--text)]">{tr("Anggaran", "Estimates")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: tr("Period seterusnya", "Next period"), value: summary?.next_start ? `${fmt(summary.next_start)} – ${fmt(summary.next_end)}` : "—" },
                  { label: tr("Tempoh subur", "Fertile window"), value: nextWindow ? `${fmt(nextWindow.fertile_start)} – ${fmt(nextWindow.fertile_end)}` : "—" },
                  { label: tr("Ovulasi", "Ovulation"), value: fmt(nextWindow?.ovulation) },
                  {
                    label: tr("Kitaran", "Cycle"),
                    value:
                      summary?.regular == null
                        ? tr("Perlu lebih data", "Needs more data")
                        : summary.regular
                          ? tr("Teratur", "Regular")
                          : tr("Tidak teratur", "Irregular"),
                  },
                ].map((tile) => (
                  <div key={tile.label} className="min-w-0 rounded-2xl border border-[var(--border)] px-3.5 py-3">
                    <p className="text-[0.6875rem] font-medium text-[var(--muted)]">{tile.label}</p>
                    <p className="mt-1 truncate text-sm font-bold text-[var(--text)]">{tile.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--muted)]">
                {summary?.cycle_length_known
                  ? tr(
                      `Dikira daripada ${summary.cycles_counted} kitaran terakhir. Anggaran sahaja, bukan kaedah perancang keluarga.`,
                      `Worked out from your last ${summary.cycles_counted} cycles. Estimates only, not a method of contraception.`,
                    )
                  : tr(
                      "* Purata 28 hari digunakan sehingga ada sekurang-kurangnya dua rekod. Anggaran sahaja, bukan kaedah perancang keluarga.",
                      "* A 28-day average is used until there are at least two records. Estimates only, not a method of contraception.",
                    )}
              </p>
            </section>

            {/* History */}
            <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
              <p className="text-sm font-bold text-[var(--text)]">{tr("Sejarah", "History")}</p>
              {cycles.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">{tr("Belum ada rekod.", "No records yet.")}</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--border)]">
                  {cycles.map((c, index) => {
                    const previous = cycles[index + 1]
                    const gap = previous
                      ? Math.round((Date.parse(`${c.start_date}T00:00:00Z`) - Date.parse(`${previous.start_date}T00:00:00Z`)) / 86400000)
                      : null
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, #f43f5e 14%, transparent)", color: PERIOD }}>
                          <Droplet size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--text)]">
                            {fmt(c.start_date, true)} – {c.end_date ? fmt(c.end_date) : tr("sedang berlaku", "ongoing")}
                          </p>
                          <p className="truncate text-xs text-[var(--muted)]">
                            {c.period_length ? tr(`${c.period_length} hari`, `${c.period_length} days`) : tr("Belum tamat", "Not ended")}
                            {gap ? ` · ${tr(`kitaran ${gap} hari`, `${gap}-day cycle`)}` : ""}
                            {c.notes ? ` · ${c.notes}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDraft({ id: c.id, start: c.start_date, end: c.end_date || "", notes: c.notes || "" })}
                          aria-label={tr("Edit rekod", "Edit record")}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]"
                        >
                          <Pencil size={14} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </DesktopPageBody>

      <AppSheet
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        id="period-record"
        title={draft?.id ? tr("Edit rekod", "Edit record") : tr("Tambah rekod", "Add record")}
        size="sm"
      >
        {draft ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{tr("Tarikh mula", "Start date")}</span>
              <input
                type="date"
                value={draft.start}
                max={today}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
                style={{ fontSize: "16px" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{tr("Tarikh tamat (kosongkan jika belum)", "End date (leave empty if not yet)")}</span>
              <input
                type="date"
                value={draft.end}
                min={draft.start || undefined}
                max={today}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-[var(--text)] outline-none focus:border-[var(--btn-primary-bg)]"
                style={{ fontSize: "16px" }}
              />
            </label>
            <input
              type="text"
              value={draft.notes}
              maxLength={500}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder={tr("Nota (pilihan)", "Note (optional)")}
              className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--btn-primary-bg)]"
              style={{ fontSize: "16px" }}
            />
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={working}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-50"
            >
              {working ? <Loader2 size={16} className="animate-spin" /> : null}
              {tr("Simpan", "Save")}
            </button>
            {draft.id ? (
              <button
                type="button"
                onClick={() => void deleteDraft()}
                disabled={working}
                className="flex h-12 w-full items-center justify-center rounded-full border border-rose-500/25 bg-rose-500/10 text-sm font-bold text-rose-600 transition disabled:opacity-50 dark:text-rose-400"
              >
                {confirmDelete ? tr("Tekan sekali lagi untuk padam", "Tap again to delete") : tr("Padam rekod", "Delete record")}
              </button>
            ) : null}
          </div>
        ) : null}
      </AppSheet>

      {alertModal}
    </div>
  )
}
