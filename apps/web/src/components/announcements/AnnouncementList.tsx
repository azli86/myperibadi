"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, AlertTriangle, Bell, ChevronRight, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { announcementInstant, announcementText, announcementTone, type Announcement } from "@/lib/announcements"

type Tab = "all" | "info" | "warning" | "alert"

// tab: the idle tab's text; tabActive: the chosen tab's pill. Warning keeps
// dark text on its yellow pill: white on amber is under 3:1.
export const TONE_STYLE = {
  info: {
    Icon: Info,
    cls: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    bar: "bg-sky-500",
    tab: "text-sky-700 dark:text-sky-300",
    tabActive: "bg-sky-600 text-white",
  },
  warning: {
    Icon: AlertTriangle,
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
    tab: "text-amber-700 dark:text-amber-300",
    tabActive: "bg-amber-400 text-amber-950",
  },
  alert: {
    Icon: AlertCircle,
    cls: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
    tab: "text-rose-700 dark:text-rose-300",
    tabActive: "bg-rose-600 text-white",
  },
} as const

// Tones on the phone home: the app's own, except Info, which takes orange
// instead of sky because the home carries no blue.
const HOME_TONE_STYLE = {
  ...TONE_STYLE,
  info: {
    ...TONE_STYLE.info,
    cls: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
    bar: "bg-orange-500",
    tab: "text-orange-700 dark:text-orange-300",
    tabActive: "bg-orange-600 text-white",
  },
} as const

/**
 * Announcement history with an All tab and a tab per type (Info, Warning,
 * Alert), grouped by day the way the home screen's recent activity is.
 * Used by the bell panel on the phone home and by the announcements page.
 */
export function AnnouncementList({
  items,
  lang,
  sessionId,
  newAbove = Infinity,
  onNavigate,
  palette = "app",
}: {
  items: Announcement[] | null
  lang: string
  sessionId: string
  /** Notices with an id above this are marked new. */
  newAbove?: number
  onNavigate?: () => void
  /** "home": the phone home's tones (Info in orange, not sky). */
  palette?: "app" | "home"
}) {
  const TONES = palette === "home" ? HOME_TONE_STYLE : TONE_STYLE
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const [tab, setTab] = useState<Tab>("all")

  const counts = useMemo(() => {
    const c = { all: 0, info: 0, warning: 0, alert: 0 }
    for (const n of items || []) {
      c.all++
      c[announcementTone(n.type, lang).key]++
    }
    return c
  }, [items, lang])

  const shown = (items || []).filter((n) => tab === "all" || announcementTone(n.type, lang).key === tab)

  // Day groups, labelled as the home screen's recent activity: Today,
  // Yesterday, then the weekday and date.
  const groups = useMemo(() => {
    const locale = isBm ? "ms-MY" : "en-MY"
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const out: { key: string; label: string; items: Announcement[] }[] = []
    for (const n of shown) {
      const d = announcementInstant(n)
      const key = d ? dayKey(d) : "none"
      const label = !d
        ? "—"
        : key === dayKey(today)
          ? tr("Hari ini", "Today")
          : key === dayKey(yesterday)
            ? tr("Semalam", "Yesterday")
            : d.toLocaleDateString(locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
                ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
              })
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push(n)
      else out.push({ key, label, items: [n] })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((n) => n.id).join(","), isBm])

  const timeOf = (n: Announcement) =>
    announcementInstant(n)?.toLocaleTimeString(isBm ? "ms-MY" : "en-MY", { hour: "numeric", minute: "2-digit" }) || ""

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: tr("Semua", "All") },
    { key: "info", label: "Info" },
    { key: "warning", label: "Warning" },
    { key: "alert", label: "Alert" },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={tr("Jenis pengumuman", "Announcement type")} className="flex gap-1.5 px-1 pb-3">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              // Plain text until chosen; only the active tab becomes a pill.
              className={cn(
                "flex min-h-9 flex-1 items-center justify-center gap-1 rounded-full px-2.5 text-[0.625rem] font-bold transition-colors",
                // Idle tabs are plain grey text; only the chosen one takes a
                // colour, as a pill in its type's colour.
                !active
                  ? "bg-transparent text-[var(--muted)]"
                  : t.key === "all"
                    ? "bg-[var(--text)] text-[var(--bg)]"
                    : TONES[t.key].tabActive
              )}
            >
              {t.label}
              <span className="tabular-nums opacity-70">{counts[t.key]}</span>
            </button>
          )
        })}
      </div>

      {items == null ? (
        <div className="space-y-2 px-1">
          {[0, 1, 2].map((k) => (
            <div key={k} className="skeleton-surface h-20 rounded-2xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--card)] text-[var(--muted)] shadow-[var(--shadow-card)]">
            <Bell size={22} />
          </span>
          <p className="mt-3 text-sm font-bold text-[var(--text)]">{tr("Tiada pengumuman", "No announcements")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {items.length === 0
              ? tr("Pengumuman baharu akan muncul di sini.", "New announcements will appear here.")
              : tr("Tiada pengumuman jenis ini.", "Nothing of this type yet.")}
          </p>
        </div>
      ) : (
        <div role="tabpanel" className="space-y-4">
          {groups.map((group) => (
            <section key={group.key}>
              <p className="mb-2 px-2 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">{group.label}</p>
              <ul className="space-y-2">
                {group.items.map((n) => {
                  const { title, message } = announcementText(n, lang)
                  // A teaser, not the notice: its first paragraph on one line.
                  // The full text is on the announcement page.
                  const teaser = message.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim()
                  const tone = TONES[announcementTone(n.type, lang).key]
                  const isNew = n.id > newAbove
                  return (
                    <li key={n.id}>
                      <Link
                        href={`/${sessionId}/announcements/${n.id}`}
                        onClick={onNavigate}
                        className="flex items-center gap-3.5 rounded-2xl bg-[var(--card)] p-3.5 shadow-[var(--shadow-card)] transition active:scale-[0.99]"
                      >
                        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tone.cls)}>
                          <tone.Icon size={24} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            {isNew ? <span aria-label={tr("Baru", "New")} className="h-2 w-2 shrink-0 rounded-full bg-rose-500" /> : null}
                            <span className="truncate text-sm font-black text-[var(--text)]">{title || tr("Pengumuman", "Announcement")}</span>
                          </span>
                          {teaser ? <span className="mt-0.5 block truncate text-xs leading-snug text-[var(--muted)]">{teaser}</span> : null}
                          <span className="mt-1 flex items-center gap-2 text-[0.6875rem] font-semibold text-[var(--muted)]">
                            <span className="tabular-nums">{timeOf(n)}</span>
                            <span aria-hidden>·</span>
                            <span className="text-[var(--text-soft)]">{tr("Baca penuh", "Read more")}</span>
                            {n.is_current ? (
                              <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wider",
                            "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          )}
                        >
                                {tr("Aktif", "Live")}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
