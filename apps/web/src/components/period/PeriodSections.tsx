"use client"

import { Check, ClipboardCopy, Download, Info, Pencil, Plus, Droplet } from "lucide-react"
import { periodLabel, type PeriodCycle, type PeriodDayLog, type PeriodStats, type PeriodSummary } from "./types"

const CARD = "rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5"

function fmt(iso: string | null | undefined, isBm: boolean, withYear = false) {
  if (!iso) return "—"
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(isBm ? "ms-MY" : "en-MY", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  })
}

/** The next period, the fertile window and how regular the cycle is. */
export function PeriodEstimates({ summary, today, isBm }: { summary: PeriodSummary; today: string; isBm: boolean }) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const window = summary.upcoming.find((u) => u.fertile_start && u.fertile_end && u.fertile_end >= today) || null
  const next = summary.next_range_start
    ? `${fmt(summary.next_range_start, isBm)} – ${fmt(summary.next_range_end, isBm)}`
    : summary.next_start
      ? `${fmt(summary.next_start, isBm)} – ${fmt(summary.next_end, isBm)}`
      : "—"
  const withheld = !summary.fertile_reliable
  const cycle =
    summary.regular == null
      ? tr("Perlu lebih data", "Needs more data")
      : summary.regular
        ? tr("Teratur", "Regular")
        : tr("Tidak teratur", "Irregular")
  const tiles = [
    { label: summary.next_range_start ? tr("Period dijangka antara", "Period expected between") : tr("Period seterusnya", "Next period"), value: next },
    { label: tr("Tempoh subur", "Fertile window"), value: withheld ? tr("Tidak dianggar", "Not estimated") : window ? `${fmt(window.fertile_start, isBm)} – ${fmt(window.fertile_end, isBm)}` : "—", muted: withheld },
    { label: tr("Ovulasi", "Ovulation"), value: withheld ? tr("Tidak dianggar", "Not estimated") : fmt(window?.ovulation, isBm), muted: withheld },
    { label: tr("Kitaran", "Cycle"), value: summary.irregular && summary.cycle_range ? `${cycle} · ${summary.cycle_range[0]}–${summary.cycle_range[1]} ${tr("hari", "days")}` : cycle },
  ]
  return (
    <section className={CARD}>
      <p className="text-sm font-bold text-[var(--text)]">{tr("Anggaran", "Estimates")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0 rounded-2xl border border-[var(--border)] px-3.5 py-3">
            <p className="text-[0.6875rem] font-medium text-[var(--muted)]">{tile.label}</p>
            <p className={`mt-1 text-sm font-bold ${tile.muted ? "text-[var(--muted)]" : "text-[var(--text)]"} [overflow-wrap:anywhere]`}>{tile.value}</p>
          </div>
        ))}
      </div>
      {summary.irregular ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-[var(--surface-tint)] p-3">
          <Info size={16} className="mt-0.5 shrink-0 text-[var(--btn-primary-bg)]" />
          <p className="text-[0.8125rem] leading-relaxed text-[var(--text-soft)]">
            {summary.anchored_by_test
              ? tr(
                  "Kitaran anda berubah-ubah, jadi ramalan dianggar daripada ujian ovulasi positif anda. Julatnya ± 2 hari.",
                  "Your cycle varies, so the estimate is worked out from your positive ovulation test. The range is ± 2 days.",
                )
              : tr(
                  "Kitaran anda berubah-ubah, jadi period dijangka sebagai julat dan tempoh subur tidak dianggar. Catat ujian ovulasi positif untuk dapat anggaran yang lebih baik.",
                  "Your cycle varies, so the period is a range and no fertile window is estimated. Log a positive ovulation test for a better estimate.",
                )}
          </p>
        </div>
      ) : null}
      <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--muted)]">
        {summary.cycle_length_known
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
  )
}

/** What was noted today, or a prompt to note it. */
export function PeriodTodayCard({ log, isBm, onOpen }: { log: PeriodDayLog | null; isBm: boolean; onOpen: () => void }) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const chips = log
    ? [
        ...(log.flow ? [`${tr("Aliran", "Flow")}: ${periodLabel(log.flow, isBm)}`] : []),
        ...log.symptoms.map((s) => periodLabel(s, isBm)),
        ...(log.mood ? [periodLabel(log.mood, isBm)] : []),
        ...(log.temperature != null ? [`${log.temperature.toFixed(1)}°C`] : []),
        ...(log.ovulation_test ? [`${tr("Ovulasi", "Ovulation")}: ${periodLabel(log.ovulation_test, isBm)}`] : []),
      ]
    : []
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-[var(--text)]">{tr("Hari ini", "Today")}</p>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-tint)]"
        >
          {chips.length ? <Pencil size={13} /> : <Plus size={13} />}
          {chips.length ? tr("Ubah", "Edit") : tr("Catat", "Log")}
        </button>
      </div>
      {chips.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-[var(--surface-tint-strong)] px-3 py-1.5 text-[0.8125rem] font-semibold text-[var(--text)]">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {tr("Belum ada catatan. Catat aliran, simptom atau mood supaya corak mudah dilihat.", "Nothing logged yet. Note flow, symptoms or mood so patterns show up.")}
        </p>
      )}
    </section>
  )
}

/** The numbers a doctor asks for, with a copy and an export button. */
export function PeriodDoctorSummary({
  stats,
  irregular,
  isBm,
  onCopy,
  onExport,
  copied,
}: {
  stats: PeriodStats
  irregular: boolean
  isBm: boolean
  onCopy: () => void
  onExport: () => void
  copied: boolean
}) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const days = (n: number | null) => (n == null ? "—" : tr(`${n} hari`, `${n} days`))
  const rows = [
    { label: tr("Rekod", "Records"), value: String(stats.records) },
    { label: tr("Kitaran terpendek", "Shortest cycle"), value: days(stats.shortest) },
    { label: tr("Kitaran terpanjang", "Longest cycle"), value: days(stats.longest) },
    { label: tr("Kitaran biasa", "Typical cycle"), value: days(stats.median) },
    { label: tr("Beza terpendek–terpanjang", "Shortest–longest gap"), value: days(stats.spread) },
    { label: tr("Tempoh period", "Period length"), value: stats.shortest_period == null ? "—" : stats.shortest_period === stats.longest_period ? days(stats.shortest_period) : `${stats.shortest_period}–${stats.longest_period} ${tr("hari", "days")}` },
  ]
  return (
    <section className={CARD}>
      <p className="text-sm font-bold text-[var(--text)]">{tr("Ringkasan untuk doktor", "Summary for your doctor")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0 rounded-2xl border border-[var(--border)] px-3.5 py-3">
            <p className="text-[0.6875rem] font-medium text-[var(--muted)]">{r.label}</p>
            <p className="mt-1 truncate text-sm font-bold tabular-nums text-[var(--text)]">{r.value}</p>
          </div>
        ))}
      </div>
      {irregular ? (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--muted)]">
          {tr("Kitaran berubah lebih seminggu. Itu patut disebut kepada doktor.", "Your cycles vary by more than a week. Worth mentioning to your doctor.")}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] text-[0.8125rem] font-semibold text-[var(--text)]"
        >
          {copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
          {copied ? tr("Disalin", "Copied") : tr("Salin ringkasan", "Copy summary")}
        </button>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] text-[0.8125rem] font-semibold text-[var(--text)]"
        >
          <Download size={15} />
          {tr("Eksport CSV", "Export CSV")}
        </button>
      </div>
    </section>
  )
}

/** Every recorded period, newest first, with the gap to the one before. */
export function PeriodHistoryList({
  cycles,
  isBm,
  onAdd,
  onEdit,
}: {
  cycles: PeriodCycle[]
  isBm: boolean
  onAdd: () => void
  onEdit: (cycle: PeriodCycle) => void
}) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-[var(--text)]">{tr("Sejarah", "History")}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-3.5 text-xs font-semibold text-[var(--btn-primary-text)]"
        >
          <Plus size={14} />
          {tr("Tambah rekod", "Add record")}
        </button>
      </div>
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
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, #f43f5e 14%, transparent)", color: "#f43f5e" }}>
                  <Droplet size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text)]">
                    {fmt(c.start_date, isBm, true)} – {c.end_date ? fmt(c.end_date, isBm) : tr("sedang berlaku", "ongoing")}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {c.period_length ? tr(`${c.period_length} hari`, `${c.period_length} days`) : tr("Belum tamat", "Not ended")}
                    {gap ? ` · ${tr(`kitaran ${gap} hari`, `${gap}-day cycle`)}` : ""}
                    {c.notes ? ` · ${c.notes}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(c)}
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
  )
}
