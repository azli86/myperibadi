"use client"

import { useEffect, useState } from "react"
import { Droplet, Loader2 } from "lucide-react"
import { AppSheet } from "@/components/ui/AppSheet"
import { cn } from "@/lib/utils"
import { periodLabel, type PeriodCycle, type PeriodDayLog } from "./types"

type DayFields = {
  flow: string | null
  symptoms: string[]
  mood: string | null
  temperature: string
  ovulation_test: string | null
  notes: string
}

const EMPTY: DayFields = { flow: null, symptoms: [], mood: null, temperature: "", ovulation_test: null, notes: "" }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-2 text-[0.8125rem] font-semibold transition active:scale-95",
        active
          ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
          : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text-soft)]"
      )}
    >
      {children}
    </button>
  )
}

/**
 * One day of the calendar: start or end a period on it, and note its flow,
 * symptoms, mood, temperature, ovulation test and a note.
 */
export function PeriodDaySheet({
  day,
  label,
  log,
  cycles,
  options,
  isBm,
  working,
  onClose,
  onSave,
  onClear,
  onStartPeriod,
  onEndPeriod,
}: {
  day: string | null
  label: string
  log: PeriodDayLog | null
  cycles: PeriodCycle[]
  options: { flows: string[]; symptoms: string[]; moods: string[]; ovulation_tests: string[] }
  isBm: boolean
  working: boolean
  onClose: () => void
  onSave: (fields: Record<string, unknown>) => void
  onClear: () => void
  onStartPeriod: () => void
  onEndPeriod: (cycle: PeriodCycle) => void
}) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const [fields, setFields] = useState<DayFields>(EMPTY)

  useEffect(() => {
    setFields(
      log
        ? {
            flow: log.flow,
            symptoms: log.symptoms,
            mood: log.mood,
            temperature: log.temperature != null ? String(log.temperature) : "",
            ovulation_test: log.ovulation_test,
            notes: log.notes || "",
          }
        : EMPTY
    )
  }, [log, day])

  const containing = day
    ? cycles.find((c) => c.start_date <= day && (c.end_date ? day <= c.end_date : true))
    : undefined
  const openCycle = cycles.find((c) => !c.end_date)
  const canEndHere = Boolean(openCycle && day && day >= openCycle.start_date)

  const toggle = (key: keyof DayFields, value: string) =>
    setFields((f) => ({ ...f, [key]: f[key] === value ? null : value }))

  const save = () =>
    onSave({
      flow: fields.flow,
      symptoms: fields.symptoms,
      mood: fields.mood,
      temperature: fields.temperature.trim() ? Number(fields.temperature.replace(",", ".")) : null,
      ovulation_test: fields.ovulation_test,
      notes: fields.notes,
    })

  return (
    <AppSheet open={Boolean(day)} onClose={onClose} id="period-day" title={label} size="md">
      <div className="space-y-5">
        {/* Start or end a period on this day */}
        <div className="flex items-center gap-3 rounded-[1.25rem] border border-[var(--border)] p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, #f43f5e 14%, transparent)", color: "#f43f5e" }}>
            <Droplet size={16} />
          </span>
          <p className="min-w-0 flex-1 text-[0.8125rem] font-medium text-[var(--text-soft)]">
            {containing
              ? tr("Hari ini dalam rekod period.", "This day is in a recorded period.")
              : tr("Tiada period direkod pada hari ini.", "No period recorded on this day.")}
          </p>
          {canEndHere && openCycle ? (
            <button
              type="button"
              onClick={() => onEndPeriod(openCycle)}
              disabled={working}
              className="shrink-0 rounded-full bg-[var(--btn-primary-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--btn-primary-text)] disabled:opacity-50"
            >
              {tr("Tamat di sini", "Ended here")}
            </button>
          ) : !containing ? (
            <button
              type="button"
              onClick={onStartPeriod}
              disabled={working}
              className="shrink-0 rounded-full bg-[var(--btn-primary-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--btn-primary-text)] disabled:opacity-50"
            >
              {tr("Mula di sini", "Started here")}
            </button>
          ) : null}
        </div>

        <section>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{tr("Aliran", "Flow")}</p>
          <div className="flex flex-wrap gap-2">
            {options.flows.map((f) => (
              <Chip key={f} active={fields.flow === f} onClick={() => toggle("flow", f)}>
                {periodLabel(f, isBm)}
              </Chip>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{tr("Simptom", "Symptoms")}</p>
          <div className="flex flex-wrap gap-2">
            {options.symptoms.map((s) => (
              <Chip
                key={s}
                active={fields.symptoms.includes(s)}
                onClick={() =>
                  setFields((f) => ({
                    ...f,
                    symptoms: f.symptoms.includes(s) ? f.symptoms.filter((x) => x !== s) : [...f.symptoms, s],
                  }))
                }
              >
                {periodLabel(s, isBm)}
              </Chip>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Mood</p>
          <div className="flex flex-wrap gap-2">
            {options.moods.map((m) => (
              <Chip key={m} active={fields.mood === m} onClick={() => toggle("mood", m)}>
                {periodLabel(m, isBm)}
              </Chip>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{tr("Suhu badan (°C)", "Temperature (°C)")}</span>
            <input
              type="text"
              inputMode="decimal"
              value={fields.temperature}
              onChange={(e) => setFields((f) => ({ ...f, temperature: e.target.value.replace(/[^0-9.,]/g, "") }))}
              placeholder="36.5"
              className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--btn-primary-bg)]"
              style={{ fontSize: "16px" }}
            />
          </label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{tr("Ujian ovulasi", "Ovulation test")}</span>
            <div className="flex gap-2">
              {options.ovulation_tests.map((t) => (
                <Chip key={t} active={fields.ovulation_test === t} onClick={() => toggle("ovulation_test", t)}>
                  {periodLabel(t, isBm)}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <input
          type="text"
          value={fields.notes}
          maxLength={500}
          onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
          placeholder={tr("Nota (pilihan)", "Note (optional)")}
          className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--btn-primary-bg)]"
          style={{ fontSize: "16px" }}
        />

        <div className="space-y-2">
          <button
            type="button"
            onClick={save}
            disabled={working}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {working ? <Loader2 size={16} className="animate-spin" /> : null}
            {tr("Simpan catatan", "Save log")}
          </button>
          {log ? (
            <button
              type="button"
              onClick={onClear}
              disabled={working}
              className="flex h-11 w-full items-center justify-center rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--text-soft)] disabled:opacity-50"
            >
              {tr("Kosongkan catatan hari ini", "Clear this day's log")}
            </button>
          ) : null}
        </div>
      </div>
    </AppSheet>
  )
}
