"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Baby, CalendarDays, Info, CalendarHeart, ChevronLeft, ChevronRight, ClipboardList, Droplet, Home, Loader2, Plus, SlidersHorizontal, Sparkles } from "lucide-react"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { ModenHero, ModenHeroIconButton, heroPrimaryButtonStyle, heroQuietButtonStyle } from "@/components/ui/ModenHero"
import { PeriodDaySheet } from "@/components/period/PeriodDaySheet"
import { PeriodHelpSheet } from "@/components/period/PeriodHelpSheet"
import { PeriodAlerts, PeriodChart, PeriodQada, PeriodSettingsCard, PeriodSpendCard } from "@/components/period/PeriodPanels"
import { PeriodDoctorSummary, PeriodEstimates, PeriodHistoryList, PeriodTodayCard } from "@/components/period/PeriodSections"
import { periodError, type PeriodCycle, type PeriodOverview } from "@/components/period/types"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"

type Draft = { id: number | null; start: string; end: string; notes: string }
type Tab = "today" | "calendar" | "history" | "more"

const PERIOD = "#f43f5e"
const FERTILE = "var(--btn-primary-bg)"
// A recorded period day, lighter for a lighter flow.
const FLOW_SHADE: Record<string, string> = { spotting: "38%", light: "60%", medium: "82%", heavy: "100%" }
const TAB_KEY = "period-tab"

function inRange(iso: string, start?: string | null, end?: string | null) {
  return Boolean(start && end && iso >= start && iso <= end)
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

export default function PeriodTrackerPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const { showAlert, alertModal } = usePageAlert(lang)

  const [data, setData] = useState<PeriodOverview | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("today")
  const [copied, setCopied] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // Remember the tab for next time.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TAB_KEY)
      if (saved === "today" || saved === "calendar" || saved === "history" || saved === "more") setTab(saved)
    } catch {}
  }, [])
  const chooseTab = (next: Tab) => {
    setTab(next)
    try {
      window.localStorage.setItem(TAB_KEY, next)
    } catch {}
  }

  const locale = isBm ? "ms-MY" : "en-MY"
  const fmt = (iso?: string | null, opts: Intl.DateTimeFormatOptions = {}) =>
    iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC", ...opts }) : "—"

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
        setData(body as PeriodOverview)
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
      const { res, body } = await request(path, { method, body: payload !== undefined ? JSON.stringify(payload) : undefined })
      if (!res.ok) {
        showAlert(tr("Tidak disimpan", "Not saved"), periodError(body?.detail, isBm), "error")
        return false
      }
      setData(body as PeriodOverview)
      return true
    } finally {
      setWorking(false)
    }
  }

  const today = data?.today || new Date().toISOString().slice(0, 10)
  const summary = data?.summary
  const cycles = data?.cycles || []
  const logs = data?.logs || []
  const logByDay = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs])
  const openCycle = cycles.find((c) => !c.end_date) || null
  const pregnant = summary?.status === "pregnant"

  const startOn = (day: string) => mutate("/period/cycles", "POST", { start_date: day })
  const endOn = (cycle: PeriodCycle, day: string) => mutate(`/period/cycles/${cycle.id}`, "PATCH", { end_date: day })
  const savePrefs = (patch: Record<string, unknown>) => mutate("/period/prefs", "PUT", patch)

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

  async function exportCsv() {
    const token = getAccessToken()
    const res = await fetch("/api/period/export.csv", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) {
      showAlert(tr("Eksport gagal", "Export failed"), tr("Cuba lagi.", "Please try again."), "error")
      return
    }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement("a")
    a.href = url
    a.download = `period-tracker-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copySummary() {
    if (!summary) return
    const st = summary.stats
    const days = (n: number | null) => (n == null ? "-" : `${n} ${tr("hari", "days")}`)
    const text = [
      tr("Ringkasan kitaran haid", "Menstrual cycle summary"),
      `${tr("Rekod", "Records")}: ${st.records}`,
      `${tr("Kitaran biasa", "Typical cycle")}: ${days(st.median)}`,
      `${tr("Terpendek / terpanjang", "Shortest / longest")}: ${days(st.shortest)} / ${days(st.longest)}`,
      `${tr("Tempoh period", "Period length")}: ${st.shortest_period ?? "-"}–${st.longest_period ?? "-"} ${tr("hari", "days")}`,
      `${tr("Haid terakhir bermula", "Last period started")}: ${cycles[0]?.start_date ?? "-"}`,
    ].join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      showAlert(tr("Tidak dapat salin", "Could not copy"), text, "info")
    }
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
    if (pregnant) return null
    const upcoming = summary?.upcoming || []
    const expected = upcoming.find((u) => inRange(iso, u.start, u.end))
    if (expected) return expected.uncertain ? "range" : "predicted"
    if (upcoming.some((u) => u.ovulation === iso)) return "ovulation"
    if (upcoming.some((u) => inRange(iso, u.fertile_start, u.fertile_end))) return "fertile"
    return null
  }

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number)
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7))
  }
  const weekdays = isBm ? ["Is", "Se", "Ra", "Kh", "Ju", "Sa", "Ah"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

  // The hero: one big line and one small line about where the cycle stands.
  const rangeDays =
    summary?.next_range_start && summary.next_range_end
      ? `${Math.max(0, daysBetween(today, summary.next_range_start))}–${Math.max(0, daysBetween(today, summary.next_range_end))}`
      : null
  const rangeText = summary?.next_range_start ? `${fmt(summary.next_range_start)} – ${fmt(summary.next_range_end)}` : ""
  const headline = !summary
    ? "—"
    : summary.status === "pregnant"
      ? tr(`Minggu ke-${summary.pregnancy_week}`, `Week ${summary.pregnancy_week}`)
      : summary.status === "period"
        ? tr(`Hari ke-${summary.period_day}`, `Day ${summary.period_day}`)
        : summary.status === "waiting"
          ? rangeDays
            ? tr(`${rangeDays} hari lagi`, `${rangeDays} days to go`)
            : tr(`${summary.days_until_next} hari lagi`, `${summary.days_until_next} days to go`)
          : summary.status === "expected"
            ? tr("Bila-bila masa", "Any day now")
            : summary.status === "late"
              ? summary.days_late
                ? tr(`Lewat ${summary.days_late} hari`, `${summary.days_late} days late`)
                : tr("Dijangka hari ini", "Expected today")
              : tr("Mula rekod", "Start recording")
  const subline = !summary
    ? ""
    : summary.status === "pregnant"
      ? tr("Mod kehamilan: ramalan dan peringatan dihentikan.", "Pregnancy mode: predictions and reminders are paused.")
      : summary.status === "period"
        ? tr("Period sedang berlaku", "Period in progress")
        : summary.status === "waiting" || summary.status === "expected"
          ? rangeText
            ? tr(`Kitaran tak teratur: dijangka antara ${rangeText}`, `Irregular cycle: expected between ${rangeText}`)
            : tr(`Period seterusnya dijangka ${fmt(summary.next_start)}`, `Next period expected ${fmt(summary.next_start)}`)
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

  const heroButton = "inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] disabled:opacity-50 md:px-5"
  const tabs: Array<{ key: Tab; label: string; icon: typeof Home }> = [
    { key: "today", label: tr("Ringkasan", "Overview"), icon: Home },
    { key: "calendar", label: tr("Kalendar", "Calendar"), icon: CalendarDays },
    { key: "history", label: tr("Sejarah", "History"), icon: ClipboardList },
    { key: "more", label: tr("Lagi", "More"), icon: SlidersHorizontal },
  ]
  const cycleStat =
    summary?.irregular && summary.cycle_range
      ? { label: tr("Kitaran", "Cycle"), value: `${summary.cycle_range[0]}–${summary.cycle_range[1]} ${tr("hari", "days")}` }
      : { label: tr("Purata kitaran", "Avg cycle"), value: summary ? `${summary.avg_cycle_length} ${tr("hari", "days")}${summary.cycle_length_known ? "" : "*"}` : "—" }

  return (
    <div className="pb-24 lg:pb-0">
      {header}

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        {/* Status */}
        <ModenHero
          label={
            <>
              {pregnant ? <Baby size={16} style={{ color: PERIOD }} /> : <Droplet size={16} style={{ color: PERIOD }} />}
              {pregnant ? tr("Kehamilan", "Pregnancy") : tr("Kitaran semasa", "Current cycle")}
            </>
          }
          actions={
            <ModenHeroIconButton onClick={() => setHelpOpen(true)} aria-label={tr("Cara guna", "How to use")} aria-haspopup="dialog">
              <Info size={18} />
            </ModenHeroIconButton>
          }
          currency={null}
          amount={loading ? <Loader2 className="animate-spin" size={28} /> : headline}
          amountSize="clamp(1.9rem, 8vw, 2.75rem)"
          stats={[
            { key: "cycle", tone: "neutral", icon: <Sparkles size={15} strokeWidth={2.2} />, label: cycleStat.label, value: cycleStat.value },
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
              <button type="button" onClick={() => void endOn(openCycle, today)} disabled={working || loading} className={heroButton} style={heroPrimaryButtonStyle}>
                {working ? <Loader2 size={16} className="animate-spin" /> : <Droplet size={16} />}
                {tr("Tamat hari ini", "Ended today")}
              </button>
            ) : (
              <button type="button" onClick={() => void startOn(today)} disabled={working || loading} className={heroButton} style={heroPrimaryButtonStyle}>
                {working ? <Loader2 size={16} className="animate-spin" /> : <Droplet size={16} />}
                {tr("Mula hari ini", "Started today")}
              </button>
            )}
            <button type="button" onClick={() => setOpenDay(today)} className={heroButton} style={heroQuietButtonStyle}>
              <Plus size={16} />
              {tr("Catat hari ini", "Log today")}
            </button>
          </div>
        </ModenHero>

        {/* Tabs: one thing at a time, instead of one long page */}
        <div role="tablist" aria-label="Period Tracker" className="sticky top-2 z-20 flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
          {tabs.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => chooseTab(t.key)}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2.5 text-[0.75rem] font-semibold transition-colors md:px-5 md:text-[0.8125rem]",
                  active ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                <t.icon size={14} className="hidden shrink-0 sm:block" />
                <span className="truncate">{t.label}</span>
              </button>
            )
          })}
        </div>

        {tab === "today" ? (
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="flex flex-col gap-4 lg:gap-5">
              {summary ? <PeriodAlerts alerts={summary.alerts} isBm={isBm} /> : null}
              <PeriodTodayCard log={logByDay.get(today) || null} isBm={isBm} onOpen={() => setOpenDay(today)} />
            </div>
            {summary && !pregnant ? <PeriodEstimates summary={summary} today={today} isBm={isBm} /> : null}
          </div>
        ) : null}

        {tab === "calendar" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-5">
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
                  const iso = cell.iso
                  const kind = dayKind(iso)
                  const isToday = iso === today
                  const log = logByDay.get(iso)
                  const hasNotes = Boolean(log && (log.symptoms.length || log.mood || log.temperature != null || log.notes))
                  const shade = log?.flow ? FLOW_SHADE[log.flow] : "100%"
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => iso <= today && setOpenDay(iso)}
                      disabled={iso > today}
                      className={cn(
                        "relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition disabled:cursor-default",
                        kind === null && "text-[var(--text)] hover:bg-[var(--surface-tint)]",
                        isToday && "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--card)]"
                      )}
                      style={
                        kind === "period"
                          ? { background: `color-mix(in srgb, ${PERIOD} ${shade}, transparent)`, color: "#ffffff" }
                          : kind === "predicted"
                            ? { border: `1.5px dashed ${PERIOD}`, color: PERIOD }
                            : kind === "range"
                              ? { border: `1.5px dashed color-mix(in srgb, ${PERIOD} 55%, transparent)`, color: `color-mix(in srgb, ${PERIOD} 75%, var(--text))` }
                              : kind === "ovulation"
                                ? { background: FERTILE, color: "#ffffff" }
                                : kind === "fertile"
                                  ? { background: "color-mix(in srgb, var(--btn-primary-bg) 16%, transparent)", color: "var(--text)" }
                                  : undefined
                      }
                    >
                      {cell.day}
                      {hasNotes ? (
                        <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: kind === "period" || kind === "ovulation" ? "#ffffff" : "var(--btn-primary-bg)" }} />
                      ) : null}
                      {log?.ovulation_test === "positive" ? (
                        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)]" style={{ background: FERTILE }} />
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[0.75rem] font-medium text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: PERIOD }} />
                  Period
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ border: `1.5px dashed ${PERIOD}` }} />
                  {summary?.irregular ? tr("Mungkin (julat)", "Possible (range)") : tr("Dijangka", "Expected")}
                </span>
                {summary?.fertile_reliable !== false ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ background: "color-mix(in srgb, var(--btn-primary-bg) 25%, transparent)" }} />
                      {tr("Subur", "Fertile")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ background: FERTILE }} />
                      {tr("Ovulasi", "Ovulation")}
                    </span>
                  </>
                ) : null}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--btn-primary-bg)" }} />
                  {tr("Ada catatan", "Logged")}
                </span>
              </div>
              <p className="mt-2 text-[0.75rem] text-[var(--muted)]">{tr("Tekan satu hari untuk catat aliran, simptom dan mood.", "Tap a day to log flow, symptoms and mood.")}</p>
            </section>
            <PeriodChart cycles={cycles} isBm={isBm} />
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <PeriodHistoryList
              cycles={cycles}
              isBm={isBm}
              onAdd={() => openDraft({ id: null, start: today, end: "", notes: "" })}
              onEdit={(c) => openDraft({ id: c.id, start: c.start_date, end: c.end_date || "", notes: c.notes || "" })}
            />
            {summary ? (
              <PeriodDoctorSummary stats={summary.stats} irregular={summary.irregular} isBm={isBm} copied={copied} onCopy={() => void copySummary()} onExport={() => void exportCsv()} />
            ) : null}
          </div>
        ) : null}

        {tab === "more" && data ? (
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="flex flex-col gap-4 lg:gap-5">
              <PeriodQada
                qada={data.qada}
                isBm={isBm}
                working={working}
                onSetPaid={(year, count) => void savePrefs({ qada_paid: { [year]: count } })}
                onSetRamadan={(year, start, end) => void savePrefs({ ramadan: { [year]: [start, end] } })}
              />
              <PeriodSpendCard
                spend={data.spend}
                selectedId={data.prefs.spend_category_id}
                isBm={isBm}
                working={working}
                onChoose={(id) => void savePrefs({ spend_category_id: id })}
              />
            </div>
            <PeriodSettingsCard
              prefs={data.prefs}
              sessionId={sessionId}
              isBm={isBm}
              working={working}
              onChange={(patch) => void savePrefs(patch)}
              onExport={() => void exportCsv()}
            />
          </div>
        ) : null}
      </DesktopPageBody>

      <PeriodHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} isBm={isBm} sessionId={sessionId} />

      <PeriodDaySheet
        day={openDay}
        label={openDay ? fmt(openDay, { weekday: "long", year: "numeric", month: "long" }) : ""}
        log={openDay ? logByDay.get(openDay) || null : null}
        cycles={cycles}
        options={data?.options || { flows: [], symptoms: [], moods: [], ovulation_tests: [] }}
        isBm={isBm}
        working={working}
        onClose={() => setOpenDay(null)}
        onSave={async (fields) => {
          if (openDay && (await mutate(`/period/days/${openDay}`, "PUT", fields))) setOpenDay(null)
        }}
        onClear={async () => {
          if (openDay && (await mutate(`/period/days/${openDay}`, "DELETE"))) setOpenDay(null)
        }}
        onStartPeriod={async () => {
          if (openDay) await startOn(openDay)
        }}
        onEndPeriod={async (cycle) => {
          if (openDay) await endOn(cycle, openDay)
        }}
      />

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
