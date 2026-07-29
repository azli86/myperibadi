"use client"

import React from "react"

interface Props {
  value: number
  onChange: (day: number) => void
  lang: "BM" | "EN"
}

const weekdayFmt = (lang: "BM" | "EN") =>
  new Intl.DateTimeFormat(lang === "BM" ? "ms-MY" : "en-GB", { weekday: "short" })
const monthFmt = (lang: "BM" | "EN") =>
  new Intl.DateTimeFormat(lang === "BM" ? "ms-MY" : "en-GB", { month: "long", year: "numeric" })

const MAX_DAY = 28 // avoid short-month gaps (Feb) for cycle reset

export default function CycleResetCalendar({ value, onChange, lang }: Props) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthLabel = monthFmt(lang).format(now)
  const weekdayNames = Array.from({ length: 7 }, (_, i) => weekdayFmt(lang).format(new Date(2024, 0, 7 + i)))
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-4">
      <p className="mb-3 text-center text-sm font-bold text-[var(--text)]">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1.5">
        {weekdayNames.map((w, i) => (
          <div key={`w${i}`} className="pb-1 text-center text-[0.6rem] font-black uppercase tracking-wider text-[var(--muted)]">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />
          const disabled = d > MAX_DAY
          const selected = d === value
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => onChange(d)}
              aria-pressed={selected}
              className={[
                "aspect-square rounded-xl text-sm font-bold transition-all active:scale-95",
                disabled
                  ? "cursor-not-allowed text-[var(--muted)]/30"
                  : selected
                  ? "bg-[var(--accent)] text-white shadow-md ring-2 ring-[var(--accent)]/40"
                  : "bg-[var(--card)] text-[var(--text)] ring-1 ring-[var(--border)] hover:ring-[var(--border-strong)]",
              ].join(" ")}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
