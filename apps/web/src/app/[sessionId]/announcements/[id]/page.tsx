"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Bell } from "lucide-react"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { TONE_STYLE } from "@/components/announcements/AnnouncementList"
import { getAccessToken } from "@/lib/auth-session"
import { fetchApiJson, readApiCache } from "@/lib/api-cache"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { announcementDate, announcementText, announcementTone, type Announcement } from "@/lib/announcements"

// One announcement in full: the bell and the list show two lines of it.
export default function AnnouncementDetailPage() {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  const id = String(params?.id || "")
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const [item, setItem] = useState<Announcement | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  // Readers can switch to the other language when the admin wrote both.
  const [readLang, setReadLang] = useState<string | null>(null)
  const shownLang = readLang || lang

  useEffect(() => {
    const token = getAccessToken()
    const url = `/api/announcements/${encodeURIComponent(id)}`
    const cached = readApiCache<Announcement>(url, token, 24 * 60 * 60 * 1000)
    if (cached) {
      setItem(cached)
      setState("ready")
    }
    let cancelled = false
    fetchApiJson<Announcement>(url, token)
      .then((a) => {
        if (cancelled) return
        setItem(a)
        setState("ready")
      })
      .catch(() => {
        if (!cancelled && !cached) setState("missing")
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const title = tr("Pengumuman", "Announcement")
  const text = item ? announcementText(item, shownLang) : null
  const tone = item ? announcementTone(item.type, lang) : null
  const style = tone ? TONE_STYLE[tone.key] : null
  const hasBoth = Boolean(item && (item.title_bm || item.message_bm) && (item.title_en || item.message_en))

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      <div className="md:hidden">
        <MobilePageHeader title={title} fallbackHref={`/${sessionId}/announcements`} backPreferHistory />
      </div>
      <DesktopPageHeader
        title={title}
        breadcrumbs={[{ label: tr("Pengumuman", "Announcements"), href: `/${sessionId}/announcements` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/announcements`}
        backPreferHistory
        className="hidden md:block"
      />

      <DesktopPageBody className="px-1 pb-24 md:px-4 md:pb-16">
        {state === "loading" ? (
          <div className="skeleton-surface mt-4 h-56 rounded-[1.5rem]" aria-busy="true" />
        ) : !item || !text || !tone || !style ? (
          <div className="mt-6 flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card)] text-[var(--muted)] shadow-[var(--shadow-card)]">
              <Bell size={24} />
            </span>
            <p className="mt-4 text-base font-black text-[var(--text)]">{tr("Pengumuman tidak dijumpai", "Announcement not found")}</p>
          </div>
        ) : (
          // Read like a blog post: no card, the text sits on the page.
          <article className="mx-auto max-w-[42rem] px-3 pb-10 pt-4 md:px-0 md:pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em]">
                <span className={cn("inline-flex items-center gap-1.5", style.cls, "bg-transparent")}>
                  <style.Icon size={15} />
                  {tone.label}
                </span>
                {item.is_current ? (
                  <span className="text-emerald-700 dark:text-emerald-300">· {tr("Aktif", "Live")}</span>
                ) : null}
              </p>
              {hasBoth ? (
                <div className="inline-flex rounded-full bg-[var(--surface-tint-strong)] p-0.5" role="group" aria-label={tr("Bahasa", "Language")}>
                  {(["BM", "EN"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setReadLang(l)}
                      aria-pressed={shownLang === l}
                      className={cn(
                        "min-h-8 rounded-full px-3 text-xs font-bold transition",
                        shownLang === l ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <h1 className="mt-4 text-[1.9rem] font-black leading-[1.15] tracking-tight text-[var(--text)] [overflow-wrap:anywhere] [text-wrap:balance] md:text-[2.5rem]">
              {text.title || title}
            </h1>
            <p className="mt-3 text-sm font-semibold text-[var(--muted)]">{announcementDate(item, lang, true)}</p>

            <hr className="my-6 border-0 border-t border-[var(--divider)]" />

            {item.image_url ? (
              <div className="mb-6 flex justify-center overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt="" className="max-h-[560px] w-auto max-w-full rounded-2xl object-contain" />
              </div>
            ) : null}

            {text.message ? (
              <div className="whitespace-pre-line text-[1.0625rem] leading-[1.75] text-[var(--text-soft)] [overflow-wrap:anywhere] [text-wrap:pretty]">
                {text.message}
              </div>
            ) : null}
          </article>
        )}
      </DesktopPageBody>
    </div>
  )
}
