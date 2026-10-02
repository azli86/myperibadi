"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Bell, Download, Minus, Moon, Pill, Plus, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PeriodAlert, PeriodCycle, PeriodPrefs, PeriodSpend, QadaYear } from "./types"

const CARD = "rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5"

function fmt(iso: string, isBm: boolean) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(isBm ? "ms-MY" : "en-MY", { day: "numeric", month: "short", timeZone: "UTC" })
}

function Switch({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:opacity-50"
    >
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          on ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--surface-tint-strong)] ring-1 ring-[var(--border)]"
        )}
      >
        <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  )
}

/** Gentle flags worth raising with a doctor. Never a diagnosis. */
export function PeriodAlerts({ alerts, isBm }: { alerts: PeriodAlert[]; isBm: boolean }) {
  if (!alerts.length) return null
  const text = (a: PeriodAlert) => {
    switch (a.key) {
      case "short_cycle":
        return isBm ? `Kitaran baru-baru ini pendek (${a.value} hari, kurang 21).` : `A recent cycle was short (${a.value} days, under 21).`
      case "long_cycle":
        return isBm ? `Kitaran baru-baru ini panjang (${a.value} hari, lebih 35).` : `A recent cycle was long (${a.value} days, over 35).`
      case "missed":
        return isBm ? `Sudah ${a.value} hari sejak period terakhir.` : `It has been ${a.value} days since your last period.`
      case "skipped":
        return isBm ? `Ada selang ${a.value} hari tanpa period baru-baru ini.` : `There was a ${a.value}-day stretch without a period recently.`
      case "long_period":
        return isBm ? `Period baru-baru ini lama (${a.value} hari, lebih 7).` : `A recent period was long (${a.value} days, over 7).`
      default:
        return a.key
    }
  }
  return (
    <section className="rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 space-y-1">
          {alerts.map((a) => (
            <p key={a.key} className="text-sm font-semibold text-[var(--text)]">
              {text(a)}
            </p>
          ))}
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            {isBm
              ? "Ini bukan diagnosis. Jika ia berterusan atau anda risau, berjumpalah dengan doktor."
              : "This is not a diagnosis. If it keeps happening or worries you, see a doctor."}
          </p>
        </div>
      </div>
    </section>
  )
}

/** Cycle and period length over the last cycles, as simple bars. */
export function PeriodChart({ cycles, isBm }: { cycles: PeriodCycle[]; isBm: boolean }) {
  const ordered = [...cycles].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const rows = ordered
    .map((c, i) => {
      const prev = ordered[i - 1]
      const gap = prev ? Math.round((Date.parse(`${c.start_date}T00:00:00Z`) - Date.parse(`${prev.start_date}T00:00:00Z`)) / 86400000) : null
      return { start: c.start_date, gap, length: c.period_length }
    })
    .filter((r) => r.gap != null && r.gap <= 60)
    .slice(-8)
  if (!rows.length) return null
  const max = Math.max(40, ...rows.map((r) => r.gap || 0))
  return (
    <section className={CARD}>
      <p className="text-sm font-bold text-[var(--text)]">{isBm ? "Corak kitaran" : "Cycle pattern"}</p>
      <div className="mt-4 flex h-36 items-end gap-2">
        {rows.map((r) => (
          <div key={r.start} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[0.6875rem] font-bold tabular-nums text-[var(--text)]">{r.gap}</span>
            <div className="relative w-full max-w-[2.25rem] rounded-t-lg" style={{ height: `${((r.gap || 0) / max) * 100}px`, background: "color-mix(in srgb, var(--btn-primary-bg) 30%, transparent)" }}>
              {r.length ? (
                <div className="absolute inset-x-0 bottom-0 rounded-t-lg" style={{ height: `${(r.length / max) * 100}px`, background: "#f43f5e" }} />
              ) : null}
            </div>
            <span className="truncate text-[0.625rem] text-[var(--muted)]">{fmt(r.start, isBm)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ background: "color-mix(in srgb, var(--btn-primary-bg) 30%, transparent)" }} />
          {isBm ? "Panjang kitaran (hari)" : "Cycle length (days)"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ background: "#f43f5e" }} />
          {isBm ? "Tempoh period" : "Period length"}
        </span>
      </div>
    </section>
  )
}

/** Fasting days to make up after Ramadan: missed, made up, left. */
export function PeriodQada({
  qada,
  isBm,
  working,
  onSetPaid,
  onSetRamadan,
}: {
  qada: QadaYear[]
  isBm: boolean
  working: boolean
  onSetPaid: (year: string, count: number) => void
  onSetRamadan: (year: string, start: string, end: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<[string, string]>(["", ""])
  if (!qada.length) return null
  return (
    <section className={CARD}>
      <div className="flex items-center gap-2">
        <Moon size={16} className="text-[var(--btn-primary-bg)]" />
        <p className="text-sm font-bold text-[var(--text)]">{isBm ? "Puasa ganti (qada)" : "Fasts to make up (qada)"}</p>
      </div>
      <div className="mt-3 space-y-3">
        {qada.map((q) => (
          <div key={q.year} className="rounded-2xl border border-[var(--border)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text)]">Ramadan {q.year}</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(editing === q.year ? null : q.year)
                    setDraft([q.ramadan_start, q.ramadan_end])
                  }}
                  className="text-left text-xs text-[var(--muted)] underline decoration-dotted underline-offset-2"
                >
                  {fmt(q.ramadan_start, isBm)} – {fmt(q.ramadan_end, isBm)}
                  {q.confirmed ? "" : isBm ? " (anggaran, tekan untuk betulkan)" : " (estimate, tap to correct)"}
                </button>
              </div>
              <span className="shrink-0 rounded-full px-3 py-1 text-sm font-bold tabular-nums" style={{ background: "color-mix(in srgb, var(--btn-primary-bg) 14%, transparent)", color: "var(--btn-primary-bg)" }}>
                {isBm ? `Baki ${q.remaining}` : `${q.remaining} left`}
              </span>
            </div>
            {editing === q.year ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[0, 1].map((i) => (
                  <input
                    key={i}
                    type="date"
                    value={draft[i]}
                    onChange={(e) => setDraft((d) => (i === 0 ? [e.target.value, d[1]] : [d[0], e.target.value]))}
                    className="h-11 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-[var(--text)]"
                    style={{ fontSize: "16px" }}
                  />
                ))}
                <button
                  type="button"
                  disabled={working || !draft[0] || !draft[1]}
                  onClick={() => {
                    onSetRamadan(q.year, draft[0], draft[1])
                    setEditing(null)
                  }}
                  className="col-span-2 h-11 rounded-full bg-[var(--btn-primary-bg)] text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-50"
                >
                  {isBm ? "Simpan tarikh Ramadan" : "Save Ramadan dates"}
                </button>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-[var(--text-soft)]">
                {isBm ? `${q.missed} hari tertinggal · ${q.made_up} diganti` : `${q.missed} missed · ${q.made_up} made up`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={isBm ? "Kurangkan" : "Less"}
                  disabled={working || q.made_up <= 0}
                  onClick={() => onSetPaid(q.year, q.made_up - 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)] disabled:opacity-40"
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  aria-label={isBm ? "Tanda satu hari diganti" : "Mark one day made up"}
                  disabled={working || q.made_up >= q.missed}
                  onClick={() => onSetPaid(q.year, q.made_up + 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--muted)]">
        {isBm
          ? "Dikira daripada hari period yang direkod dalam Ramadan. Tekan + setiap kali anda ganti satu hari."
          : "Counted from the recorded period days that fell in Ramadan. Tap + each time you make up a day."}
      </p>
    </section>
  )
}

/** What the chosen category cost this month, against the year's average. */
export function PeriodSpendCard({
  spend,
  selectedId,
  isBm,
  working,
  onChoose,
}: {
  spend: PeriodSpend | null
  selectedId: number | null
  isBm: boolean
  working: boolean
  onChoose: (id: number | null) => void
}) {
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([])
  useEffect(() => {
    let alive = true
    void (async () => {
      const { getAccessToken } = await import("@/lib/auth-session")
      const token = getAccessToken()
      const res = await fetch("/api/categories", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const data = res.ok ? await res.json() : []
      if (alive && Array.isArray(data)) {
        setCategories(data.filter((c: { kind?: string; is_internal?: boolean }) => c.kind === "expense" && !c.is_internal).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })))
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return (
    <section className={CARD}>
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-[var(--btn-primary-bg)]" />
        <p className="text-sm font-bold text-[var(--text)]">{isBm ? "Belanja keperluan" : "Supplies spending"}</p>
      </div>
      <select
        value={selectedId ?? ""}
        disabled={working}
        onChange={(e) => onChoose(e.target.value ? Number(e.target.value) : null)}
        className="mt-3 h-11 w-full rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-semibold text-[var(--text)] outline-none"
      >
        <option value="">{isBm ? "Pilih kategori (cth: Keperluan wanita)" : "Choose a category (e.g. personal care)"}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {spend ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-[var(--border)] px-3.5 py-3">
            <p className="text-[0.6875rem] font-medium text-[var(--muted)]">{isBm ? "Bulan ini" : "This month"}</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-[var(--text)]">RM {spend.this_month.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] px-3.5 py-3">
            <p className="text-[0.6875rem] font-medium text-[var(--muted)]">{isBm ? "Purata sebulan" : "Monthly average"}</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-[var(--text)]">RM {spend.monthly_average.toFixed(2)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {isBm ? "Pilih kategori yang anda guna untuk pad, ubat dan keperluan lain." : "Pick the category you use for pads, medicine and other supplies."}
        </p>
      )}
    </section>
  )
}

/** Reminders, pregnancy mode, the pill link and the export. */
export function PeriodSettingsCard({
  prefs,
  sessionId,
  isBm,
  working,
  onChange,
  onExport,
}: {
  prefs: PeriodPrefs
  sessionId: string
  isBm: boolean
  working: boolean
  onChange: (patch: Partial<PeriodPrefs> & Record<string, unknown>) => void
  onExport: () => void
}) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  return (
    <section className={CARD}>
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-[var(--btn-primary-bg)]" />
        <p className="text-sm font-bold text-[var(--text)]">{tr("Peringatan & tetapan", "Reminders & settings")}</p>
      </div>

      <div className="mt-2 divide-y divide-[var(--border)]">
        <label className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-sm font-medium text-[var(--text)]">{tr("Ingatkan sebelum period", "Remind before a period")}</span>
          <select
            value={prefs.remind_before_days}
            disabled={working}
            onChange={(e) => onChange({ remind_before_days: Number(e.target.value) })}
            className="h-9 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-sm font-semibold text-[var(--text)]"
          >
            <option value={0}>{tr("Tutup", "Off")}</option>
            {[1, 2, 3, 5, 7].map((n) => (
              <option key={n} value={n}>
                {tr(`${n} hari`, `${n} day${n > 1 ? "s" : ""}`)}
              </option>
            ))}
          </select>
        </label>
        <Switch on={prefs.remind_supplies} disabled={working} onToggle={() => onChange({ remind_supplies: !prefs.remind_supplies })} label={tr("Sertakan semakan stok pad", "Include a pad supply check")} />
        <Switch on={prefs.remind_late} disabled={working} onToggle={() => onChange({ remind_late: !prefs.remind_late })} label={tr("Tanya bila period lewat", "Ask when a period is late")} />
        <Switch on={prefs.remind_open} disabled={working} onToggle={() => onChange({ remind_open: !prefs.remind_open })} label={tr("Tanya jika lupa tanda tamat", "Ask if the end was not marked")} />
      </div>

      <p className="mt-3 text-xs font-semibold text-[var(--muted)]">{tr("Hantar melalui", "Send through")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["push", "whatsapp", "telegram"] as const).map((ch) => (
          <button
            key={ch}
            type="button"
            disabled={working}
            aria-pressed={prefs.channels[ch]}
            onClick={() => onChange({ channels: { ...prefs.channels, [ch]: !prefs.channels[ch] } })}
            className={cn(
              "rounded-full border px-3.5 py-2 text-[0.8125rem] font-semibold transition",
              prefs.channels[ch]
                ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text-soft)]"
            )}
          >
            {ch === "push" ? tr("Notifikasi app", "App notification") : ch === "whatsapp" ? "WhatsApp" : "Telegram"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[0.75rem] text-[var(--muted)]">
        {tr("Hanya ke chat peribadi anda, tidak sekali-kali ke group.", "Only to your own chats, never to a group.")}
      </p>

      <div className="mt-3 border-t border-[var(--border)] pt-1">
        <Switch on={prefs.pregnancy_mode} disabled={working} onToggle={() => onChange({ pregnancy_mode: !prefs.pregnancy_mode })} label={tr("Mod kehamilan", "Pregnancy mode")} />
        <p className="pb-1 text-[0.75rem] text-[var(--muted)]">
          {tr("Hentikan ramalan dan peringatan, dan tunjuk minggu kehamilan.", "Pauses predictions and reminders, and shows the week of pregnancy.")}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={`/${sessionId}/health/medications`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] text-[0.8125rem] font-semibold text-[var(--text)]"
        >
          <Pill size={15} />
          {tr("Pil / ubat", "Pill / meds")}
        </Link>
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
