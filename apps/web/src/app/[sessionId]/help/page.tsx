"use client"

import React, { useState, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { useParams } from "next/navigation"
import {
  Zap,
  ShieldCheck,
  Hash,
  Wallet,
  FileImage,
  Boxes,
  BookOpen,
  CreditCard,
  CalendarClock,
  Repeat,
  MessageSquare,
  MapPin,
  CalendarDays,
  KeyRound,
  Shield,
  Search,
  X,
  Copy,
  Check,
  ChevronRight,
  Info,
  Lightbulb,
  Sparkles,
  Bot,
  HelpCircle,
  Smartphone,
  ArrowRight,
  Menu,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useSwipeDownToClose } from "@/hooks/useSwipeDownToClose"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

/* ── Code / Copyable Pill Component (Monochrome) ── */
function CopyableCode({
  children,
  textToCopy,
  className,
}: {
  children: React.ReactNode
  textToCopy?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const val = textToCopy || (typeof children === "string" ? children : "")

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!val) return
    navigator.clipboard.writeText(val)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Salin command"
      className={cn(
        "group/copy inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-tint-strong)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--card)] active:scale-95 text-left",
        className
      )}
    >
      <span className="truncate">{children}</span>
      <span className="shrink-0 text-[var(--muted)] group-hover/copy:text-[var(--text)]">
        {copied ? <Check size={12} className="text-[var(--text)]" /> : <Copy size={11} className="opacity-60" />}
      </span>
    </button>
  )
}

/* ── Interactive Command Row Card (Monochrome) ── */
function CommandCard({
  cmd,
  desc,
  example,
  exLabel,
  category,
}: {
  cmd: string
  desc: string
  example: string
  exLabel: string
  category?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="group relative flex flex-col justify-between gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition hover:border-[var(--text)]/30 hover:shadow-sm sm:p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-tint-strong)] px-2.5 py-1 font-mono text-xs font-black text-[var(--text)]">
              {cmd}
            </span>
            {category && (
              <span className="rounded-md bg-[var(--surface-tint)] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                {category}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
          >
            {copied ? (
              <>
                <Check size={12} className="text-[var(--text)]" />
                <span className="text-[var(--text)]">Disalin</span>
              </>
            ) : (
              <>
                <Copy size={12} className="text-[var(--muted)]" />
                <span>Salin</span>
              </>
            )}
          </button>
        </div>

        <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-[var(--text)]/90">
          {desc}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)]/60 bg-[var(--surface-tint)] px-2.5 py-1.5 text-xs text-[var(--muted)]">
        <span className="font-semibold">{exLabel}:</span>
        <CopyableCode textToCopy={example} className="border-0 bg-transparent px-1 py-0 text-[var(--text)]">
          {example}
        </CopyableCode>
      </div>
    </div>
  )
}

/* ── Format Card with Monochrome Formula ── */
function FormatCard({
  title,
  pattern,
  examples,
  exLabel,
  patLabel,
}: {
  title: string
  pattern: string
  examples: string[]
  exLabel: string
  patLabel: string
}) {
  return (
    <div className="flex flex-col justify-between gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--text)]/30 hover:shadow-sm">
      <div>
        <p className="text-xs sm:text-sm font-bold text-[var(--text)]">{title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-[var(--muted)]">{patLabel}:</span>
          <span className="inline-block rounded-lg border border-[var(--border)] bg-[var(--surface-tint-strong)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--text)]">
            {pattern}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
        <span className="font-semibold text-[var(--muted)]">{exLabel}:</span>
        {examples.map((ex, i) => (
          <CopyableCode key={i} textToCopy={ex}>
            {ex}
          </CopyableCode>
        ))}
      </div>
    </div>
  )
}

/* ── Pro-Tip Callout Box (Monochrome) ── */
function CalloutBox({
  children,
  icon,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed text-[var(--text)] shadow-sm">
      {icon || <Info size={16} className="shrink-0 text-[var(--text)] opacity-80 mt-0.5" />}
      <div className="flex-1 min-w-0 font-medium">{children}</div>
    </div>
  )
}

/* ── Simulated Chat Bubble (Monochrome) ── */
function ChatPreview({
  userMessage,
  botReply,
}: {
  userMessage: string
  botReply: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5 sm:p-4 space-y-3 font-sans">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
        Simulasi Mesej WhatsApp / Telegram
      </p>

      {/* User Message (Solid High-Contrast Bubble Right) */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--text)] px-3.5 py-2 text-xs font-semibold text-[var(--bg)] shadow-sm">
          {userMessage}
        </div>
      </div>

      {/* Bot Reply (Card Bubble Left) */}
      <div className="flex justify-start">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-xs font-mono text-[var(--text)] shadow-sm">
          {botReply}
        </div>
      </div>
    </div>
  )
}

/* ── Main Help Page Component ── */
export default function HelpPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBM = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBM ? bm : en), [isBM])

  const [activeSectionId, setActiveSectionId] = useState("quick-start")
  const [searchQuery, setSearchQuery] = useState("")
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const swipe = useSwipeDownToClose(() => setShowMobileMenu(false))

  const exLabel = isBM ? "Contoh" : "Example"
  const patLabel = isBM ? "Format" : "Pattern"

  /* Section Definitions */
  const sectionList = useMemo(
    () => [
      { id: "quick-start", label: tr("Mula Pantas", "Quick Start"), icon: <Zap size={16} />, badge: "Asas" },
      { id: "recording", label: tr("Rekod Transaksi", "Recording Transactions"), icon: <Hash size={16} />, badge: "Harian" },
      { id: "salary", label: tr("Kitar Gaji", "Salary Cycle"), icon: <Wallet size={16} />, badge: "Bulanan" },
      { id: "items", label: tr("Banyak Item & Kuantiti", "Multi-Items & Quantity"), icon: <FileImage size={16} />, badge: "Resit" },
      { id: "commands", label: tr("Command WhatsApp", "WhatsApp Commands"), icon: <BookOpen size={16} />, badge: "Bot" },
      { id: "budget", label: tr("Command Budget", "Budget Commands"), icon: <Wallet size={16} />, badge: "Bajet" },
      { id: "inventory", label: tr("Barang Saya (Inventori)", "My Inventory"), icon: <Boxes size={16} />, badge: "Storan" },
      { id: "debt", label: tr("Tracker Hutang", "Debt Tracker"), icon: <CreditCard size={16} />, badge: "Pinjaman" },
      { id: "loan", label: tr("Tracker Loan", "Loan Tracker"), icon: <CreditCard size={16} />, badge: "Ansuran" },
      { id: "subscription", label: tr("Langganan (SUBX)", "Subscription (SUBX)"), icon: <CalendarClock size={16} />, badge: "Recurring" },
      { id: "transfer", label: tr("Pindah Antara Wallet", "Wallet Transfer"), icon: <Repeat size={16} />, badge: "Dompet" },
      { id: "group", label: tr("Mode Group", "Group Mode"), icon: <MessageSquare size={16} />, badge: "Trigger" },
      { id: "receipt", label: tr("Upload Resit & Media", "Receipt Upload"), icon: <FileImage size={16} />, badge: "OCR" },
      { id: "places", label: tr("Tempat Saya (My Places)", "My Places"), icon: <MapPin size={16} />, badge: "Lokasi" },
      { id: "split", label: tr("Split Bill (Kongsi Bil)", "Split Bill"), icon: <CreditCard size={16} />, badge: "Kongsi" },
      { id: "bnpl", label: tr("BNPL (PayLater)", "BNPL"), icon: <CreditCard size={16} />, badge: "PayLater" },
      { id: "event", label: tr("Acara Saya (My Event)", "My Event"), icon: <CalendarDays size={16} />, badge: "Acara" },
      { id: "security", label: tr("6PIN & Sekuriti", "6PIN & Security"), icon: <KeyRound size={16} />, badge: "Akses" },
      { id: "tips", label: tr("Tips & Pencegahan", "Tips & Safety"), icon: <Shield size={16} />, badge: "Panduan" },
    ],
    [tr]
  )

  return (
    <>
      {/* ── MOBILE HEADER WITH BURGER MENU BUTTON ── */}
      <div className="border-b border-[color:var(--border)] pb-4 md:hidden">
        <MobilePageHeader
          title={tr("Pusat Bantuan", "Help Center")}
          fallbackHref={`/${sessionId}/settings`}
          backPreferHistory
          action={
            <button
              type="button"
              onClick={() => setShowMobileMenu(true)}
              aria-label={tr("Buka Menu Topik", "Open Topics Menu")}
              title={tr("Menu Topik Panduan", "Guide Topics Menu")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-tint-strong)] active:scale-95"
            >
              <Menu size={18} />
            </button>
          }
        />
      </div>

      {/* ── DESKTOP HEADER ── */}
      <DesktopPageHeader
        title={tr("Pusat Bantuan & Panduan Bot", "Bot Guide & Help Center")}
        breadcrumbs={[{ label: tr("Tetapan", "Settings"), href: `/${sessionId}/settings` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/settings`}
        backPreferHistory
        className="hidden md:block"
      />

      <DesktopPageBody className="space-y-6">
        {/* ── HERO SHOWCASE BANNER (MONOCHROME) ── */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--text)] shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-neutral-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 left-10 h-48 w-48 rounded-full bg-neutral-400/5 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-3 py-0.5 text-xs font-bold text-[var(--text)]">
                <Sparkles size={13} />
                <span>{tr("Panduan Lengkap Versi 2026", "Complete 2026 Guide")}</span>
              </div>
              <h1 className="mt-2 text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl lg:text-3xl">
                {tr("Pusat Panduan & Rujukan Bot", "Bot Command & Feature Center")}
              </h1>
              <p className="mt-1 text-xs sm:text-sm font-medium text-[var(--muted)]">
                {tr(
                  "Ketahui semua format arahan WhatsApp, pengurusan transaksi, tracker peribadi, dan kawalan portal.",
                  "Master all WhatsApp commands, transaction formats, personal trackers, and portal controls."
                )}
              </p>
            </div>

            {/* Quick stats pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Topik Panduan", "Guide Topics")}
                </p>
                <p className="text-lg font-black text-[var(--text)]">{sectionList.length}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Platform", "Platforms")}
                </p>
                <p className="text-lg font-black text-[var(--text)]">WA & TG</p>
              </div>
            </div>
          </div>

          {/* Search Bar inside Hero */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr(
                "Cari arahan (cth: 'makan 12.50', 'Mgaji', 'lend', 'stuff', 'budget')...",
                "Search commands (e.g. 'lunch 12.50', 'Msalary', 'lend', 'stuff', 'budget')..."
              )}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 pl-10 pr-9 text-xs sm:text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--text)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--text)]/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </section>

        {/* ── MOBILE HORIZONTAL TOPICS SCROLL CAROUSEL ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:hidden scrollbar-none">
          {sectionList.map((s) => {
            const isActive = activeSectionId === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSectionId(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition active:scale-95",
                  isActive
                    ? "bg-[var(--text)] text-[var(--bg)] shadow-md"
                    : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                {s.icon}
                <span>{s.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── DESKTOP DUAL-PANE LAYOUT ── */}
        <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* ── LEFT SIDEBAR: TOPIC EXPLORER (MONOCHROME) ── */}
          <aside className="hidden md:flex sticky top-20 flex-col rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-sm">
            <div className="border-b border-[var(--border)]/60 pb-3 mb-2 px-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">
                {tr("Kategori Panduan", "Guide Topics")}
              </p>
            </div>

            <nav className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
              {sectionList.map((s) => {
                const isActive = activeSectionId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSectionId(s.id)}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98]",
                      isActive
                        ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                        : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn("shrink-0", isActive ? "text-[var(--bg)]" : "text-[var(--muted)] group-hover:text-[var(--text)]")}>
                        {s.icon}
                      </span>
                      <span className="truncate">{s.label}</span>
                    </div>

                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.2 text-[9px] font-black",
                        isActive
                          ? "bg-[var(--bg)] text-[var(--text)]"
                          : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                      )}
                    >
                      {s.badge}
                    </span>
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* ── RIGHT MAIN EXPLORER: CONTENT SECTIONS (MONOCHROME) ── */}
          <main className="space-y-6 min-w-0">
            {/* 1. Mula Pantas / Quick Start */}
            {activeSectionId === "quick-start" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Zap size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Mula Pantas & Panduan Asas", "Quick Start Guide")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Langkah pertama menggunakan Bot WhatsApp & Telegram.", "First steps to use WhatsApp & Telegram Bot.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    {
                      step: "1",
                      title: tr("Sambung Akaun WhatsApp / Telegram", "Connect WhatsApp / Telegram"),
                      desc: tr(
                        "Buka halaman WhatsApp atau Telegram pada portal dan lengkapkan sambungan connector akaun anda.",
                        "Open the WhatsApp or Telegram connector page in portal to link your phone."
                      ),
                    },
                    {
                      step: "2",
                      title: tr("Hantar Mesej Transaksi", "Send Transaction Message"),
                      desc: tr(
                        "Hantar mesej perbelanjaan atau pendapatan terus ke chat nombor bot anda. Pastikan mesej mengandungi jumlah harga.",
                        "Send your expense or income note to bot chat. Ensure the message contains an amount."
                      ),
                      cmd: "makan 12.50",
                    },
                    {
                      step: "3",
                      title: tr("Semak Baki & Laporan", "Check Balances & Reports"),
                      desc: tr(
                        "Gunakan arahan pantas untuk mendapatkan ringkasan bulanan atau senarai transaksi pada bila-bila masa.",
                        "Use quick commands to get monthly summaries or transaction lists on demand."
                      ),
                      cmd: "summary",
                    },
                  ].map((st, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--text)] font-black text-[var(--bg)] text-sm">
                        {st.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-black text-[var(--text)]">{st.title}</h4>
                        <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{st.desc}</p>
                        {st.cmd && (
                          <div className="mt-2">
                            <CopyableCode textToCopy={st.cmd}>{st.cmd}</CopyableCode>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <ChatPreview
                  userMessage="makan nasi ayam 10.50 cash"
                  botReply="✅ TRANSAKSI DIREKOD
🏷️ Kategori: Makanan & Minuman
💵 Jumlah: RM 10.50
💳 Wallet: Cash (Baki: RM 189.50)
📅 Tarikh: Hari ini"
                />
              </div>
            )}

            {/* 2. Format Rekod Transaksi */}
            {activeSectionId === "recording" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Hash size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Format Rekod Transaksi", "Recording Transactions")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Struktur mesej untuk merekod perbelanjaan, pendapatan, dan backdate.", "Message syntax for expenses, income, and backdating.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { title: tr("Rekod perbelanjaan biasa", "Normal expense"), pattern: "nota + amount + [wallet]", examples: ["makan 12.50", "grab rm18.50 cash"] },
                    { title: tr("Rekod pendapatan / gaji", "Income record"), pattern: "nota pendapatan + amount + [wallet]", examples: ["gaji 3500", "bonus 500 maybank"] },
                    { title: tr("Rekod tarikh lampau (Backdate)", "Backdated record"), pattern: "mesej + @DDMMYYYY", examples: ["grab 18.50 @05042026", "makan 10 @01042026"] },
                    { title: tr("Pilih wallet tertentu", "Specific wallet"), pattern: "nota + amount + nama_wallet", examples: ["makan 12.50 cash", "gaji 3500 maybank"] },
                    { title: tr("Simpan lokasi transaksi (GPS)", "GPS Location"), pattern: "reply transaksi + share location pin", examples: ["reply mesej TXN, hantar location pin"] },
                  ].map((row) => (
                    <FormatCard
                      key={row.title}
                      title={row.title}
                      pattern={row.pattern}
                      examples={row.examples}
                      exLabel={exLabel}
                      patLabel={patLabel}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 3. Kitar Gaji Bulanan */}
            {activeSectionId === "salary" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Wallet size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Kitar Gaji Bulanan", "Monthly Salary Cycle")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Reset kitar perbelanjaan dan mula kitar kewangan baharu.", "Reset budget cycle and start new pay period.")}
                      </p>
                    </div>
                  </div>
                </div>

                <CalloutBox>
                  {tr(
                    "Gunakan command Mgaji untuk rekod gaji bulanan dan reset kitar belanjawan. Bot secara automatik mengkategorikan sebagai 'Monthly Salary' dan menetapkan tarikh gaji.",
                    "Use the Msalary command to record monthly salary and reset your budget cycle. The bot auto-categorizes it as 'Monthly Salary'."
                  )}
                </CalloutBox>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { title: tr("Rekod gaji & reset kitar", "Record salary & reset"), pattern: "Mgaji + amount + [wallet]", examples: ["Mgaji 3500", "Mgaji 3500 maybank"] },
                    { title: tr("Gaji tarikh lampau (Backdate)", "Backdated salary"), pattern: "Mgaji + amount + @DDMMYYYY", examples: ["Mgaji 3500 @01042026"] },
                  ].map((row) => (
                    <FormatCard
                      key={row.title}
                      title={row.title}
                      pattern={row.pattern}
                      examples={row.examples}
                      exLabel={exLabel}
                      patLabel={patLabel}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 4. Banyak Item & Kuantiti */}
            {activeSectionId === "items" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <FileImage size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Banyak Item & Kuantiti (Multi-Items)", "Multi-Items & Quantity")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Merekod resit terperinci dengan pengiraan kuantiti automatik.", "Breakdown receipts with auto-sum quantity calculations.")}
                      </p>
                    </div>
                  </div>
                </div>

                <CalloutBox>
                  {tr(
                    "Bot menjumlahkan semua item secara automatik. Baris pertama menjadi tajuk resit. Gunakan prefix item, items, atau bd.",
                    "The bot sums all lines automatically. The first line becomes the title. Use prefix item, items, or bd."
                  )}
                </CalloutBox>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2">
                    <p className="text-xs font-bold text-[var(--text)]">{tr("Item Tanpa Kuantiti", "Items without quantity")}</p>
                    <pre className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint-strong)] p-3 text-xs font-mono text-[var(--text)]">
                      {isBM ? "item makan\nnasi ayam 5\nnasi goreng 10" : "item lunch\nchicken rice 5\nfried rice 10"}
                    </pre>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2">
                    <p className="text-xs font-bold text-[var(--text)]">{tr("Dengan Kuantiti × Harga", "With Quantity × Price")}</p>
                    <pre className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint-strong)] p-3 text-xs font-mono text-[var(--text)]">
                      {isBM ? "item pasar\ntelur 2 x 8.50\nayam 1.5 @ 12" : "item groceries\neggs 2 x 8.50\nchicken 1.5 @ 12"}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Senarai Command WhatsApp */}
            {activeSectionId === "commands" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Senarai Command WhatsApp & Bot", "WhatsApp & Bot Commands")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Arahan pantas untuk semakan baki, ringkasan, dan tetapan bahasa.", "Quick commands for balance checks, summaries, and language.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "help", desc: tr("Tunjuk mesej bantuan ringkas bot.", "Shows the bot help message."), example: "help" },
                    { cmd: "summary", desc: tr("Ringkasan bulan semasa (pendapatan, perbelanjaan, baki bersih).", "Current month summary (income, expense, net)."), example: "summary" },
                    { cmd: "list", desc: tr("Papar 5 transaksi terbaru anda.", "Shows your latest 5 transactions."), example: "list" },
                    { cmd: "checkwallet", desc: tr("Papar baki setiap wallet + jumlah keseluruhan.", "Shows each wallet balance + total balance."), example: "checkwallet" },
                    { cmd: "semak wallet", desc: tr("Sama seperti checkwallet, versi Bahasa Melayu.", "Same as checkwallet in BM."), example: "semak wallet" },
                    { cmd: "lang en | lang bm", desc: tr("Tukar bahasa respon bot.", "Switch bot reply language."), example: "lang en" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Bot General"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 6. Command Budget */}
            {activeSectionId === "budget" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Wallet size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Pengurusan & Command Budget", "Budget Commands")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Tetapkan had perbelanjaan mengikut kategori dan pantau baki.", "Set category limits and track remaining balance.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "budget | bajet", desc: tr("Tunjuk bantuan command budget.", "Show budget command help."), example: "bajet" },
                    { cmd: "budget set <kategori> <jumlah>", desc: tr("Set atau kemaskini budget kategori untuk bulan semasa.", "Set or update category budget for current month."), example: "budget set makanan 600" },
                    { cmd: "budget set <kategori> <jumlah> @YYYY-MM", desc: tr("Set budget untuk bulan tertentu (contoh: @2026-04).", "Set budget for a specific month."), example: "budget set makanan 600 @2026-04" },
                    { cmd: "budget list", desc: tr("Lihat senarai budget aktif.", "View active budgets."), example: "budget list" },
                    { cmd: "budget summary", desc: tr("Ringkasan penggunaan budget bulanan semua kategori.", "Monthly budget summary for all categories."), example: "budget summary" },
                    { cmd: "budget baki <kategori>", desc: tr("Semak baki budget kategori tertentu.", "Check budget balance for a specific category."), example: "budget baki makanan" },
                    { cmd: "budget delete <kategori>", desc: tr("Padam budget kategori untuk bulan semasa.", "Delete a category budget."), example: "budget delete makanan" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Budget"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 7. Barang Saya (Inventori) */}
            {activeSectionId === "inventory" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Boxes size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Barang Saya (Inventori Peribadi)", "My Inventory (Personal Storage)")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Simpan senarai barang, lokasi, bekas/kotak, status, dan gambar.", "Track personal items, locations, boxes, status, and photos.")}
                      </p>
                    </div>
                  </div>
                </div>

                <CalloutBox>
                  {tr(
                    "Anda boleh menghantar gambar barang bersama caption 'stuff <nama barang>' terus di WhatsApp untuk menyimpan gambar dan rekod inventori!",
                    "You can send an item photo with 'stuff <item name>' caption directly on WhatsApp to save both the photo and inventory record!"
                  )}
                </CalloutBox>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "stuff help", desc: tr("Papar panduan ringkas command Barang Saya.", "Show quick inventory command guide."), example: "stuff help" },
                    { cmd: "stuff <nama barang>", desc: tr("Tambah barang ke inventori secara pantas.", "Add an item to inventory quickly."), example: "stuff kabel hdmi" },
                    { cmd: "stuff <nama> <lokasi/bekas>", desc: tr("Tambah barang terus ke lokasi atau bekas simpanan.", "Add an item directly to a location or box."), example: "stuff kotak bilik stor" },
                    { cmd: "tambah barang <nama> [N]", desc: tr("Tambah barang dengan kuantiti tertentu.", "Add item with specific quantity."), example: "tambah barang bateri 3" },
                    { cmd: "stuff cari <kata>", desc: tr("Cari barang mengikut nama dalam inventori.", "Search items by name in inventory."), example: "stuff cari kabel" },
                    { cmd: "tambah stor <nama>", desc: tr("Cipta lokasi stor baharu.", "Create a new storeroom / location."), example: "tambah stor Ruang Tamu" },
                    { cmd: "tambah bekas <nama>", desc: tr("Cipta bekas / kotak baharu.", "Create a new box / container."), example: "tambah bekas Kotak A" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Inventory"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 8. Tracker Hutang */}
            {activeSectionId === "debt" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Tracker Hutang (Lend & Borrow)", "Debt Tracker")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Jejak duit yang orang hutang anda dan hutang yang anda perlu bayar.", "Track money people owe you and debts you owe others.")}
                      </p>
                    </div>
                  </div>
                </div>

                <CalloutBox>
                  {tr(
                    "lend = orang hutang kita (kita bagi pinjam). borrow = kita hutang orang. pay = rekod bayaran balik hutang.",
                    "lend = someone owes you. borrow = you owe someone. pay = record a repayment."
                  )}
                </CalloutBox>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "lend <nama> <amaun>", desc: tr("Rekod orang hutang kita.", "Record money someone owes you."), example: "lend Ali 50" },
                    { cmd: "borrow <nama> <amaun>", desc: tr("Rekod kita hutang orang.", "Record money you owe someone."), example: "borrow Ahmad 100" },
                    { cmd: "pay <nama> <amaun>", desc: tr("Rekod bayaran balik hutang.", "Record repayment to that person."), example: "pay Ahmad 30" },
                    { cmd: "balance <nama>", desc: tr("Semak baki hutang untuk individu tertentu.", "Check debt balance for one person."), example: "balance Ali" },
                    { cmd: "debt list", desc: tr("Senarai semua baki hutang aktif (lend + borrow).", "List all active debt balances."), example: "debt list" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Debt"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 9. Tracker Loan */}
            {activeSectionId === "loan" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Tracker Pinjaman / Loan (loanx)", "Loan Tracker")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Kira baki bulan dan bayaran bulanan pinjaman kereta/rumah.", "Calculate months remaining and payments for car/housing loans.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "loanx list", desc: tr("Senarai loan aktif bersama baki bulan.", "List active loans with months remaining."), example: "loanx list" },
                    { cmd: "loanx add <nama> <jumlah> <bulanan>", desc: tr("Tambah loan baru dengan amaun bulanan untuk kiraan baki bulan.", "Add new loan with monthly amount for countdown."), example: "loanx add kereta 12000 500" },
                    { cmd: "loanx pay <nama> <jumlah>", desc: tr("Bayar ansuran loan & rekod expense.", "Pay loan & record expense transaction."), example: "loanx pay kereta 500" },
                    { cmd: "loanx pay <nama> <jumlah> wallet <nama_wallet>", desc: tr("Bayar loan daripada wallet tertentu.", "Pay loan from specific wallet."), example: "loanx pay kereta 500 wallet maybank" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Loan"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 10. Langganan (SUBX) */}
            {activeSectionId === "subscription" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <CalendarClock size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Langganan Berkala (SUBX)", "Subscription (SUBX)")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Pengurusan bil berulang bulanan seperti Netflix, Spotify, Astro, dan utiliti.", "Manage recurring monthly bills with due days.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "subx <nama> <jumlah> <day>HB", desc: tr("Simpan langganan bulanan berserta tarikh due.", "Save recurring monthly subscription with due day."), example: "SUBX ASTRO 89.90 15HB" },
                    { cmd: "subx pay <nama> <jumlah> <wallet>", desc: tr("Bayar langganan & rekod transaksi automatik ke wallet pilihan.", "Pay subscription & record expense transaction to selected wallet."), example: "SUBX PAY ASTRO 89.90 TNG" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Subscription"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 11. Pindah Antara Wallet */}
            {activeSectionId === "transfer" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Repeat size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Pemindahan Antara Wallet", "Transfer Between Wallets")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Pindahkan dana antara akaun bank, e-wallet, dan tunai.", "Move funds between bank accounts, e-wallets, and cash.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "transfer <jumlah> <wallet_A> <wallet_B>", desc: tr("Pindah amaun dari wallet A ke wallet B.", "Move amount from wallet A to wallet B."), example: "transfer 100 maybank cash" },
                    { cmd: "transfer <jumlah> dari <wallet_A> ke <wallet_B>", desc: tr("Format ayat penuh yang lebih mudah dibaca.", "Readable sentence format."), example: "transfer 50 dari maybank ke cash" },
                    { cmd: "pindah <jumlah> <wallet_A> <wallet_B>", desc: tr("Format Bahasa Melayu.", "Malay keyword version."), example: "pindah 35 cash tabung" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Transfer"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 12. Mode Group */}
            {activeSectionId === "group" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <MessageSquare size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Mode Kumpulan (WhatsApp Group)", "Group Mode (Trigger Prefix)")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Cara menggunakan bot di dalam WhatsApp Group tanpa mengganggu mesej lain.", "Using the bot inside WhatsApp groups with privacy.")}
                      </p>
                    </div>
                  </div>
                </div>

                <CalloutBox>
                  {tr(
                    "Bot hanya memproses mesej dari group yang anda 'Allow' di tetapan WhatsApp portal. Gunakan trigger prefix (cth: bd) sebelum arahan.",
                    "The bot only responds in groups you 'Allow' in WhatsApp settings. Use the trigger prefix (e.g. bd) before commands."
                  )}
                </CalloutBox>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "bd makan 12.50", desc: tr("Rekod transaksi dalam group menggunakan trigger prefix.", "Record expense inside group with trigger prefix."), example: "bd makan 12.50" },
                    { cmd: "bd summary", desc: tr("Semak ringkasan dalam group dengan perlindungan privasi.", "Check summary inside group with privacy protection."), example: "bd summary" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Group"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 13. Upload Resit & Media */}
            {activeSectionId === "receipt" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <FileImage size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Upload Resit & Lampiran Media", "Receipt & Attachment Upload")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Simpan gambar resit atau dokumen PDF pada transaksi.", "Attach receipt images or PDF files to transactions.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2">
                    <p className="text-xs sm:text-sm font-bold text-[var(--text)]">
                      {tr("1. Transaksi Baharu Bersama Gambar", "New Transaction with Image")}
                    </p>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {tr(
                        "Hantar gambar resit bersama caption 'makan 12.50' dalam mesej yang sama. Sistem akan mencipta transaksi dan melampirkan gambar secara automatik.",
                        "Send receipt photo with 'lunch 12.50' caption in the same message. Bot auto-saves both."
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2">
                    <p className="text-xs sm:text-sm font-bold text-[var(--text)]">
                      {tr("2. Lampirkan Gambar Pada Transaksi Lama", "Attach to Existing Transaction")}
                    </p>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {tr(
                        "Reply mana-mana mesej bot yang mempunyai nombor TXN, kemudian hantar gambar resit atau fail PDF.",
                        "Reply to any bot message containing a TXN code, then send your receipt photo or PDF."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 14. Tempat Saya (My Places) */}
            {activeSectionId === "places" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <MapPin size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Tempat Saya (My Places & Pin GPS)", "My Places")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Simpan pin lokasi kegemaran, kedai, pejabat, dan rumah.", "Save favorite places, shops, offices, and home pins.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "pinx", desc: tr("Papar panduan command My Places.", "Show My Places command guide."), example: "pinx" },
                    { cmd: "pinx <tajuk> <kategori> @here", desc: tr("Simpan pin lokasi semasa. Hantar location pin dahulu, kemudian taip command ini.", "Save current location pin. Send location pin first, then command."), example: "pinx rumah mak family @here" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Places"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 15. Split Bill */}
            {activeSectionId === "split" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Split Bill (Kongsi Bil Makan / Aktiviti)", "Split Bill")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Bahagikan satu bil kepada beberapa orang dan kutip bayaran balik.", "Split one bill evenly and track reimbursements.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { cmd: "makan tng split 6", desc: tr("Buat split untuk resit terakhir yang dihantar.", "Create a split from the last receipt image sent."), example: "makan tng split 6" },
                    { cmd: "splitx tng", desc: tr("Rekod bayaran balik daripada screenshot pembayaran.", "Record repayment with payment screenshot."), example: "splitx tng" },
                    { cmd: "splitx create <tajuk> <jumlah> <orang>", desc: tr("Cipta split manual tanpa gambar resit.", "Create split manually without receipt."), example: "splitx create dinner 66 6" },
                    { cmd: "splitx list", desc: tr("Lihat senarai split bill yang masih aktif.", "List active split bills."), example: "splitx list" },
                  ].map((row) => (
                    <CommandCard
                      key={row.cmd}
                      cmd={row.cmd}
                      desc={row.desc}
                      example={row.example}
                      exLabel={exLabel}
                      category="Split Bill"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 16. BNPL & Event */}
            {activeSectionId === "bnpl" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("BNPL (Buy Now Pay Later / Ansuran)", "BNPL Installments")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Urus pembelian ansuran Shopee PayLater, SPayLater, dan pelan bayaran bertempoh.", "Manage installment plans like SPayLater.")}
                      </p>
                    </div>
                  </div>
                </div>

                <CalloutBox>
                  {tr(
                    "Uruskan pembelian ansuran di halaman BNPL portal. Setiap bayaran ansuran direkodkan secara teratur mengikut kategori dan baki bulan.",
                    "Manage installment purchases on the BNPL portal page. Each payment is tracked against remaining balance."
                  )}
                </CalloutBox>
              </div>
            )}

            {/* 17. Acara Saya (My Event) */}
            {activeSectionId === "event" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <CalendarDays size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Acara Saya (My Event)", "My Event Tracking")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Khas untuk perancangan belanjawan majlis, percutian, dan gathering.", "Dedicated event budget tracking for weddings, trips, and gatherings.")}
                      </p>
                    </div>
                  </div>
                </div>

                <CalloutBox>
                  {tr(
                    "Cipta acara baharu di portal dengan bajet khusus. Semua transaksi yang ditag pada acara tidak akan mengganggu bajet harian anda.",
                    "Create a new event with dedicated budget on portal. Event transactions will be tracked under that event umbrella."
                  )}
                </CalloutBox>
              </div>
            )}

            {/* 18. 6PIN & Sekuriti */}
            {activeSectionId === "security" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("6PIN & Keselamatan Akses", "6PIN & Access Security")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Perlindungan akses pantas pada peranti anda.", "Quick unlock and session protection for your device.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2">
                    <p className="text-xs sm:text-sm font-bold text-[var(--text)]">
                      {tr("Fungsi 6PIN Quick Unlock", "6PIN Quick Unlock Feature")}
                    </p>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {tr(
                        "6PIN membolehkan anda membuka portal dengan pantas tanpa memasukkan kata laluan panjang setiap kali.",
                        "6PIN allows you to unlock the portal quickly without typing your full password repeatedly."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 19. Tips & Pencegahan */}
            {activeSectionId === "tips" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Shield size={18} />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-[var(--text)]">
                        {tr("Tips Elak Ralat Data", "Tips to Avoid Data Errors")}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {tr("Amalan terbaik untuk memastikan data kewangan sentiasa tepat.", "Best practices for accurate record tracking.")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    tr("Pastikan ejaan nama wallet tepat (cth: 'maybank', 'cash', 'tng').", "Use exact wallet names (e.g. 'maybank', 'cash', 'tng')."),
                    tr("Gunakan format tarikh @DDMMYYYY untuk backdate (cth: @05042026).", "Use date format @DDMMYYYY for backdating (e.g. @05042026)."),
                    tr("Pastikan ada amaun nombor dalam mesej transaksi anda.", "Ensure there is a number amount in your message."),
                    tr("Kemas kini kata kunci kategori di halaman Kategori jika bot silap mengkategorikan transaksi.", "Update category keywords on Categories page if needed."),
                  ].map((tip, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-sm">
                      <Check size={16} className="shrink-0 text-[var(--text)]" />
                      <span className="text-xs sm:text-sm font-medium text-[var(--text)]">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </DesktopPageBody>

      {/* ── MOBILE BURGER TOPICS SHEET (MONOCHROME) ── */}
      {showMobileMenu && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center overscroll-none bg-[var(--overlay)] p-0 sm:items-center"
          onClick={() => setShowMobileMenu(false)}
          onTouchMove={(e) => e.preventDefault()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-swipe-sheet
            {...swipe}
            className="app-sheet-panel app-sheet-panel--sm w-full max-h-[85dvh] overflow-y-auto overscroll-contain touch-pan-y border border-[var(--border)] bg-[var(--sheet-bg)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] will-change-transform sm:max-w-[26rem] sm:rounded-3xl"
          >
            <AppSheetHeader
              title={tr("Menu Topik Panduan", "Guide Topics Menu")}
              eyebrow={tr("Pusat Bantuan", "Help Center")}
              onClose={() => setShowMobileMenu(false)}
            />

            <div className="space-y-1 p-4 pt-2">
              {sectionList.map((s) => {
                const isActive = activeSectionId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSectionId(s.id)
                      setShowMobileMenu(false)
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-xs font-bold transition active:scale-[0.98]",
                      isActive
                        ? "bg-[var(--text)] text-[var(--bg)] shadow-md"
                        : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn("shrink-0", isActive ? "text-[var(--bg)]" : "text-[var(--muted)]")}>
                        {s.icon}
                      </span>
                      <span className="truncate">{s.label}</span>
                    </div>

                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[9px] font-black",
                        isActive
                          ? "bg-[var(--bg)] text-[var(--text)]"
                          : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                      )}
                    >
                      {s.badge}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
