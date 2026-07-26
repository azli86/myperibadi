"use client"

import React from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, CalendarDays, ScrollText, Sparkles } from "lucide-react"
import { useLang } from "@/lib/lang"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { DesktopPageBody, DesktopPageHeader } from "@/components/layout/PageHeader"

type ChangelogEntry = {
  version: string
  date: string
  title: string
  items: string[]
}

export default function ChangelogPage() {
  const params = useParams()
  const sessionId = params.sessionId as string || ""
  const { lang, t } = useLang()

  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => isBm ? bm : en

  const entries: ChangelogEntry[] = isBm
    ? [
        {
          version: "v2026.05.07",
          date: "7 Mei 2026",
          title: "Kemaskini Portal & Connector",
          items: [
            "Penambahbaikan umum pada paparan portal dan aliran transaksi.",
            "Kemaskini kestabilan untuk connector chat dan lampiran.",
            "Pelarasan kecil pada pengalaman mobile dan tetapan sistem.",
          ],
        },
        {
          version: "v2026.05.03",
          date: "3 Mei 2026",
          title: "Kestabilan WhatsApp & Reconnect",
          items: [
            "Tambah auto-quarantine untuk session WhatsApp rosak supaya worker dan bot user lain tidak terganggu.",
            "WhatsApp page kini tunjuk status Perlu Reconnect dan butang Reconnect WhatsApp bila session perlu dipaut semula.",
            "Naikkan timeout proses media/lokasi WhatsApp dan tambah guard QR/reconnect supaya bot kurang diam ketika proses berat.",
            "Kemaskini rujukan sistem kepada MyPeribadi serta ringkasan update Analisis Maps Expenses.",
          ],
        },
        {
          version: "v2026.04.20",
          date: "20 Apr 2026",
          title: "Budget Tracker & Bantuan",
          items: [
            "Tambah modul Budget Tracker ikut kategori dengan page Budget khusus.",
            "Tambah command WhatsApp budget: budget set, budget list, budget baki, budget delete, budget summary.",
            "Kemaskini halaman Help supaya command budget dipaparkan dalam rujukan rasmi.",
          ],
        },
        {
          version: "v2026.04.19",
          date: "19 Apr 2026",
          title: "Kestabilan & Navigasi",
          items: [
            "Butang back kini ikut halaman sebelumnya (history) di lebih banyak skrin.",
            "Tambah halaman Log Perubahan untuk rujukan update sistem.",
            "Kemaskini menu Tetapan untuk akses cepat ke changelog.",
          ],
        },
        {
          version: "v2026.04.18",
          date: "18 Apr 2026",
          title: "Dashboard & Analitik",
          items: [
            "Tambah tab Daily pada graf bar untuk semakan perbelanjaan harian.",
            "Penambahbaikan paparan mobile untuk chart scrolling.",
            "Pelarasan behavior monthly vs daily supaya lebih konsisten.",
          ],
        },
        {
          version: "v2026.04.17",
          date: "17 Apr 2026",
          title: "WhatsApp Bot",
          items: [
            "Sokongan input tarikh @DDMMYYYY untuk rekod transaksi ikut tarikh mesej.",
            "Perbaikan mesej Done supaya tunjuk tarikh transaksi dengan jelas.",
            "Penambahbaikan command bantuan untuk memudahkan pengguna baru.",
          ],
        },
        {
          version: "v2026.04.16",
          date: "16 Apr 2026",
          title: "Security & Infrastruktur",
          items: [
            "Hardening endpoint webhook dalaman.",
            "Pelarasan route sensitif supaya tidak terbuka dari public web path.",
            "Optimasi restart flow service untuk deployment lebih stabil.",
          ],
        },
      ]
    : [
        {
          version: "v2026.05.07",
          date: "7 May 2026",
          title: "Portal & Connector Update",
          items: [
            "General improvements to portal views and transaction flow.",
            "Stability updates for chat connectors and attachments.",
            "Small refinements for mobile experience and system settings.",
          ],
        },
        {
          version: "v2026.05.03",
          date: "3 May 2026",
          title: "WhatsApp Stability & Reconnect",
          items: [
            "Added auto-quarantine for damaged WhatsApp sessions so one bad account does not affect other users or the worker.",
            "WhatsApp page now shows Reconnect Required with a Reconnect WhatsApp button when the session needs to be linked again.",
            "Increased WhatsApp media/location processing timeout and added QR/reconnect guards for more stable bot replies.",
            "Updated system references to MyPeribadi and summarized the Analisis Maps Expenses update.",
          ],
        },
        {
          version: "v2026.04.20",
          date: "20 Apr 2026",
          title: "Budget Tracker & Help",
          items: [
            "Added category-based Budget Tracker with dedicated Budget page.",
            "Added WhatsApp budget commands: budget set, budget list, budget baki, budget delete, budget summary.",
            "Updated Help page to include budget commands in the official command reference.",
          ],
        },
        {
          version: "v2026.04.19",
          date: "19 Apr 2026",
          title: "Stability & Navigation",
          items: [
            "Back buttons now follow previous-page history on more screens.",
            "Added a dedicated Changelog page for update tracking.",
            "Updated Settings menu for quick changelog access.",
          ],
        },
        {
          version: "v2026.04.18",
          date: "18 Apr 2026",
          title: "Dashboard & Analytics",
          items: [
            "Added Daily tab in bar chart for day-level expense review.",
            "Improved mobile chart scrolling behavior.",
            "Adjusted monthly vs daily flow for better consistency.",
          ],
        },
        {
          version: "v2026.04.17",
          date: "17 Apr 2026",
          title: "WhatsApp Bot",
          items: [
            "Added @DDMMYYYY date token support for dated transaction entry.",
            "Improved Done reply formatting with clearer transaction date.",
            "Enhanced help commands for easier onboarding.",
          ],
        },
        {
          version: "v2026.04.16",
          date: "16 Apr 2026",
          title: "Security & Infrastructure",
          items: [
            "Hardened internal webhook endpoints.",
            "Adjusted sensitive route exposure from public web paths.",
            "Improved service restart flow for more stable deployments.",
          ],
        },
      ]

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">

      {/* ─── Mobile View ─── */}
      <div className="space-y-5 md:hidden">
        {/* Header */}
        <div className="px-1 pt-1">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 pt-4">
            <HistoryBackButton fallbackHref={`/${sessionId}/settings`} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--text)]">
              <ArrowLeft size={18} />
            </HistoryBackButton>
            <h1 className="text-center text-[1.2rem] font-extrabold tracking-tight text-[var(--text)]">
              {t.changelog}
            </h1>
            <div className="h-10 w-10" aria-hidden="true" />
          </div>

          {/* Intro Card */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--surface-tint)] text-[var(--text)]">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black text-[var(--text)]">{tr("Log Perubahan", "Changelog")}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                {tr("Rekod kemaskini dan perubahan sistem.", "System update and change record.")}
              </p>
            </div>
          </div>
        </div>

        {/* Timeline entries */}
        <div className="px-1 space-y-3">
          {entries.map((entry) => (
            <div key={entry.version} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{entry.version}</p>
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/30 px-2.5 py-1 text-[0.625rem] font-bold text-[var(--muted)]">
                  <CalendarDays size={12} />
                  {entry.date}
                </div>
              </div>
              <h3 className="mt-2 text-base font-bold text-[var(--text)]">{entry.title}</h3>
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[0.625rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  <ScrollText size={13} />
                  {tr("Perubahan", "Changes")}
                </div>
                <ul className="space-y-1.5 text-sm list-disc pl-5 text-[var(--muted)]">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Log Perubahan", "Changelog")} />
        <DesktopPageBody className="space-y-6">
        {/* Timeline Grid */}
        <div className="grid gap-4">
          {entries.map((entry, i) => (
            <div key={entry.version} className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Sparkles size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{entry.version}</p>
                      <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                        <CalendarDays size={13} />
                        {entry.date}
                      </span>
                    </div>
                    <h3 className="mt-1 text-lg font-black text-[var(--text)]">{entry.title}</h3>
                  </div>
                </div>
                <span className="flex sm:hidden items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)]/30 px-2.5 py-1 text-[0.625rem] font-bold text-[var(--muted)]">
                  <CalendarDays size={12} />
                  {entry.date}
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/30 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[0.625rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                  <ScrollText size={14} />
                  {tr("Perubahan", "Changes")}
                </div>
                <ul className="space-y-1.5 text-sm list-disc pl-5 text-[var(--muted)]">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        </DesktopPageBody>
      </div>
    </div>
  )
}
