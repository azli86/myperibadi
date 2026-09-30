"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnnouncements } from "@/lib/announcements"
import { AnnouncementList } from "@/components/announcements/AnnouncementList"

/**
 * The announcement bell in the desktop right rail's footer. Its panel opens
 * upwards from the bottom-right corner, over the rail (the bell sits mid-way
 * along a rail at the screen edge, so anchoring on the bell would push the
 * panel off screen). It replaces the notice banner on the desktop dashboard.
 */
export function DesktopAnnouncementBell({ sessionId, lang }: { sessionId: string; lang: string }) {
  const tr = (bm: string, en: string) => (lang === "BM" ? bm : en)
  const { items, unread, seenId, markAllSeen } = useAnnouncements()
  const [open, setOpen] = useState(false)
  const [newAbove, setNewAbove] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) {
      setNewAbove(seenId)
      markAllSeen()
    }
    setOpen((v) => !v)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={tr("Pengumuman", "Announcements")}
        aria-label={unread ? tr("Pengumuman baru", "New announcement") : tr("Pengumuman", "Announcements")}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] transition active:scale-[0.98]",
          open
            ? "bg-[var(--surface-tint-strong)] text-[var(--text)]"
            : "bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface-tint)]"
        )}
      >
        <Bell size={16} strokeWidth={2} />
        {unread ? (
          <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" style={{ boxShadow: "0 0 0 2px var(--card)" }} />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={tr("Pengumuman", "Announcements")}
          className="fixed bottom-[4.25rem] right-3 z-50 flex max-h-[70vh] w-[22rem] flex-col overflow-hidden rounded-[1.25rem] bg-[var(--page-bg)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-[var(--divider)]"
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <p className="text-sm font-black text-[var(--text)]">{tr("Pengumuman", "Announcements")}</p>
            <Link
              href={`/${sessionId}/announcements`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-0.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
            >
              {tr("Lihat semua", "See all")}
              <ChevronRight size={13} />
            </Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3">
            <AnnouncementList items={items} lang={lang} sessionId={sessionId} newAbove={newAbove} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
