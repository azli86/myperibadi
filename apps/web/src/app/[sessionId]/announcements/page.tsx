"use client"

import { useEffect } from "react"
import { useParams } from "next/navigation"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { AnnouncementList } from "@/components/announcements/AnnouncementList"
import { useLang } from "@/lib/lang"
import { useAnnouncements } from "@/lib/announcements"

// Every announcement published from Mastermind, newest first, with a tab per type.
export default function AnnouncementsPage() {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  const { lang } = useLang()
  const title = lang === "BM" ? "Pengumuman" : "Announcements"
  const { items, seenId, markAllSeen } = useAnnouncements()

  // Opening the list counts as seeing everything in it.
  useEffect(() => {
    if (items && items.length) markAllSeen()
  }, [items, markAllSeen])

  return (
    <div className="relative min-h-[calc(100vh-4rem)] max-w-full text-[var(--text)]">
      <div className="md:hidden">
        <MobilePageHeader title={title} fallbackHref={`/${sessionId}`} backPreferHistory />
      </div>
      <DesktopPageHeader title={title} homeHref={`/${sessionId}`} backHref={`/${sessionId}`} backPreferHistory className="hidden md:block" />
      <DesktopPageBody className="flex flex-col px-2 pb-24 pt-2 md:px-4 md:pb-16 lg:max-w-3xl">
        <AnnouncementList items={items} lang={lang} sessionId={sessionId} newAbove={seenId} />
      </DesktopPageBody>
    </div>
  )
}
