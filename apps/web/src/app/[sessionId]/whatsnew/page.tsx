"use client"

import React from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, CalendarDays, ChevronDown, Rocket, Sparkles } from "lucide-react"
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
          version: "v2026.08.06",
          date: "6 Ogos 2026",
          title: "Masa Resit, Resit Terlekat Selepas Kategori & Dompet Unik",
          items: [
            "OCR resit kini baca masa pada resit (12 jam/24 jam, AM/PM) dan simpan masa transaksi — dipapar dalam butiran & boleh ubah dalam edit.",
            "Lampiran resit kini terlekat automatik pada transaksi selepas anda pilih kategori & dompet (atau `subx`/`loanx`).",
            "Amaran resit berganda bila scan yang sama dikesan, supaya tak tersimpan dua kali secara tak sengaja.",
            "Dompet & kata kunci kategori kini unik — sistem tak akan cipta duplikat `Cash` lagi, walaupun dua permintaan datang serentak.",
            "Pembersihan duplikat: dompet Cash ganda dan kata kunci kategori terbuang; transaksi sedia ada dipindah ke dompet asal yang betul.",
            "Dompet lalai kini paling baru digunakan, bukan sentiasa Cash.",
          ],
        },
        {
          version: "v2026.08.04",
          date: "4 Ogos 2026",
          title: "OCR Income, Resit Subskripsi/Loan & Due Date Langganan",
          items: [
            "OCR resit kini sokong pendapatan (slip gaji, DuitNow diterima, refund) dengan pemilihan kategori & dompet.",
            "Selepas scan resit, boleh terus balas `subx <nama sub> <dompet>` atau `loanx <nama loan> <dompet>` untuk paut bayaran ke langganan/pinjaman.",
            "Tarikh bayaran subskripsi & loan kini ikut backdate `@DDMMYYYY`.",
            "Butang Reset pada halaman langganan untuk kira semula status due dari rekod transaksi sebenar.",
            "Due date langganan dikira semula pintar: bayar lewat selepas due masih dikira kitaran yang sama, dan status overdue dipaparkan bila tiada rekod bayaran.",
            "Halaman transaksi desktop: butiran popup lebih nipis dari kanan dengan butang tutup.",
          ],
        },
        {
          version: "v2026.07.30",
          date: "30 Julai 2026",
          title: "Kitar Gaji, Langganan & Imej Dompet",
          items: [
            "Tambah kitar gaji bulanan (Mgaji/Msalary) untuk reset kitar belanjawan automatik.",
            "Sistem langganan kini jejak tarikh bayaran dan papar tarikh matang seterusnya.",
            "Imej dompet boleh diupload dan dipaparkan sebagai ikon serta latar kad.",
            "Dashboard kini papar komitmen dan auto-tanda SUBX yang telah dibayar.",
            "Tambah ringkasan bajet: pendapatan kitar, peruntukan, dan baki belum diagih.",
            "Label transaksi automatik: SUBX = Langganan, Loan Payment = Pinjaman.",
            "Icon kategori tersuai boleh diupload.",
          ],
        },
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
            "Tambah halaman Apa Baru untuk rujukan update sistem.",
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
          version: "v2026.08.06",
          date: "6 August 2026",
          title: "Receipt Time, Receipt Attached After Category & Unique Wallets",
          items: [
            "Receipt OCR now reads the time printed on the receipt (12h/24h, AM/PM) and stores the transaction time — shown in details and editable.",
            "Receipt attachment now auto-attaches to the transaction after you pick category & wallet (or `subx`/`loanx`).",
            "Duplicate receipt warning when the same scan is detected, preventing accidental double-saves.",
            "Wallets & category keywords are now unique — the system can no longer create duplicate `Cash` wallets, even with simultaneous requests.",
            "Duplicate cleanup: extra Cash wallets and duplicate category keywords removed; existing transactions moved to the correct original wallet.",
            "Default wallet is now the most recently used, not always Cash.",
          ],
        },
        {
          version: "v2026.08.04",
          date: "4 August 2026",
          title: "Income OCR, Receipt Sub/Loan Link & Smarter Due Dates",
          items: [
            "Receipt OCR now supports income (salary slip, DuitNow received, refund) with category & wallet selection.",
            "After scanning a receipt, reply `subx <sub name> <wallet>` or `loanx <loan name> <wallet>` to link the payment to a subscription or loan.",
            "Subscription & loan payments now honour backdate `@DDMMYYYY`.",
            "Reset button on the subscription page to recompute due status from actual transaction records.",
            "Smarter subscription due calculation: paying late after the due date still counts toward the same cycle, and overdue shows when no payment record exists.",
            "Desktop transaction pages: slimmer slide-in detail popup from the right with a close button.",
          ],
        },
        {
          version: "v2026.07.30",
          date: "30 July 2026",
          title: "Salary Cycle, Subscriptions & Wallet Images",
          items: [
            "Added monthly salary cycle (Mgaji/Msalary) to auto-reset budget cycles.",
            "Subscription system now tracks payment dates and shows next due date.",
            "Wallet images can be uploaded and displayed as icon and card background.",
            "Dashboard now shows commitments and auto-checks paid SUBX payments.",
            "Added budget summary: cycle income, allocation, and unallocated balance.",
            "Auto transaction labels: SUBX = Subscription, Loan Payment = Loan.",
            "Custom category icons can now be uploaded.",
          ],
        },
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

  const [latest, ...past] = entries

  const Hero = (
    <div className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-gradient-to-br from-amber-500/12 via-[var(--card)] to-[var(--card)] p-5 md:p-6">
      <Sparkles className="pointer-events-none absolute -right-4 -top-4 text-amber-500/15" size={110} strokeWidth={1.2} />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.625rem] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
            <Rocket size={12} />
            {tr("Terkini", "Latest")}
          </span>
          <span className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{latest.version}</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <CalendarDays size={13} />
            {latest.date}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-black leading-tight text-[var(--text)] md:text-2xl">{latest.title}</h2>
        <ul className="mt-4 space-y-2.5">
          {latest.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-[var(--text)]">
              <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  const Timeline = (
    <div className="space-y-2">
      <p className="px-1 text-[0.625rem] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
        {tr("Keluaran Terdahulu", "Earlier Releases")}
      </p>
      <div className="relative space-y-2 pl-6">
        <span className="absolute left-[0.42rem] top-2 bottom-2 w-px bg-[var(--border)]" aria-hidden="true" />
        {past.map((entry) => (
          <details key={entry.version} className="group relative rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <span className="absolute -left-[1.19rem] top-[1.15rem] h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--border)] group-open:bg-amber-500" aria-hidden="true" />
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.625rem] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{entry.version}</span>
                  <span className="inline-flex items-center gap-1 text-[0.625rem] font-bold text-[var(--muted)]">
                    <CalendarDays size={11} />
                    {entry.date}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-[var(--text)]">{entry.title}</p>
              </div>
              <ChevronDown size={16} className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-2 border-t border-[var(--border)] px-4 py-3.5">
              {entry.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-[var(--muted)]">
                  <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">

      {/* ─── Mobile View ─── */}
      <div className="space-y-5 md:hidden">
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
        </div>
        <div className="space-y-4 px-1">
          {Hero}
          {Timeline}
        </div>
      </div>

      {/* ─── Desktop View ─── */}
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Apa Baru", "What's New")} homeHref={`/${sessionId}`} />
        <DesktopPageBody className="space-y-5">
          {Hero}
          {Timeline}
        </DesktopPageBody>
      </div>
    </div>
  )
}
