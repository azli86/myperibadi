"use client"

import React, { useState, useMemo } from "react"
import { useParams } from "next/navigation"
import {
  Zap,
  Wallet,
  Boxes,
  BookOpen,
  CreditCard,
  CalendarClock,
  Repeat,
  MessageSquare,
  MapPin,
  Search,
  X,
  Sparkles,
  Bot,
  Hash,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

/* ── Command / Copyable Pill Component (Monochrome) ── */
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
            {copied ? "✓" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--muted)]">{desc}</p>
      </div>
      {example && (
        <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-[var(--surface-tint-strong)] px-2.5 py-1.5 text-[11px]">
          <span className="font-semibold uppercase text-[var(--muted)]">{exLabel}</span>
          <code className="font-mono font-bold text-[var(--text)]">{example}</code>
        </div>
      )}
    </div>
  )
}

type Cmd = { cmd: string; desc: string; example: string }

export default function BotCommandPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useLang()
  const [activeSectionId, setActiveSectionId] = useState("general")
  const [searchQuery, setSearchQuery] = useState("")

  const isBM = lang === "BM"
  const tr = (en: string, ms: string) => (isBM ? ms : en)
  const exLabel = isBM ? "Contoh" : "Example"

  /* ── Section Definitions (command categories) ── */
  const sectionList = useMemo(
    () => [
      { id: "general", label: tr("Bot General", "Bot General"), icon: <Bot size={16} />, badge: "Asas" },
      { id: "recording", label: tr("Rekod Transaksi", "Record Transactions"), icon: <Hash size={16} />, badge: "Harian" },
      { id: "budget", label: tr("Command Budget", "Budget Commands"), icon: <Wallet size={16} />, badge: "Bajet" },
      { id: "inventory", label: tr("Barang Saya (Inventori)", "My Inventory"), icon: <Boxes size={16} />, badge: "Storan" },
      { id: "debt", label: tr("Tracker Hutang", "Debt Tracker"), icon: <CreditCard size={16} />, badge: "Pinjaman" },
      { id: "loan", label: tr("Tracker Loan", "Loan Tracker"), icon: <CreditCard size={16} />, badge: "Ansuran" },
      { id: "subscription", label: tr("Langganan (SUBX)", "Subscription (SUBX)"), icon: <CalendarClock size={16} />, badge: "Recurring" },
      { id: "transfer", label: tr("Pindah Wallet", "Wallet Transfer"), icon: <Repeat size={16} />, badge: "Dompet" },
      { id: "group", label: tr("Mode Group", "Group Mode"), icon: <MessageSquare size={16} />, badge: "Trigger" },
      { id: "places", label: tr("Tempat Saya", "My Places"), icon: <MapPin size={16} />, badge: "Lokasi" },
      { id: "split", label: tr("Split Bill", "Split Bill"), icon: <CreditCard size={16} />, badge: "Kongsi" },
    ],
    [tr]
  )

  /* ── Commands per category ── */
  const commandsBySection: Record<string, { title: string; sub: string; icon: React.ReactNode; rows: Cmd[] }> = {
    general: {
      title: tr("Senarai Command WhatsApp & Bot", "WhatsApp & Bot Commands"),
      sub: tr("Arahan pantas untuk semakan baki, ringkasan, dan tetapan bahasa.", "Quick commands for balance checks, summaries, and language."),
      icon: <Bot size={18} />,
      rows: [
        { cmd: "help", desc: tr("Tunjuk mesej bantuan ringkas bot.", "Shows the bot help message."), example: "help" },
        { cmd: "summary", desc: tr("Ringkasan bulan semasa (pendapatan, perbelanjaan, baki bersih).", "Current month summary (income, expense, net)."), example: "summary" },
        { cmd: "list", desc: tr("Papar 5 transaksi terbaru anda.", "Shows your latest 5 transactions."), example: "list" },
        { cmd: "checkwallet", desc: tr("Papar baki setiap wallet + jumlah keseluruhan.", "Shows each wallet balance + total balance."), example: "checkwallet" },
        { cmd: "semak wallet", desc: tr("Sama seperti checkwallet, versi Bahasa Melayu.", "Same as checkwallet in BM."), example: "semak wallet" },
        { cmd: "lang en | lang bm", desc: tr("Tukar bahasa respon bot.", "Switch bot reply language."), example: "lang en" },
      ],
    },
    recording: {
      title: tr("Rekod Transaksi", "Record Transactions"),
      sub: tr("Format perbelanjaan, pendapatan, dan gaji untuk bot.", "Expense, income, and salary formats for the bot."),
      icon: <Hash size={18} />,
      rows: [
        { cmd: "makan 12.50", desc: tr("Rekod perbelanjaan dengan kategori auto.", "Record expense with auto category."), example: "makan 12.50" },
        { cmd: "makan 12.50 cash", desc: tr("Rekod perbelanjaan ke wallet tertentu.", "Record expense to a specific wallet."), example: "makan 12.50 cash" },
        { cmd: "Mgaji 2500", desc: tr("Rekod pendapatan gaji (prefix M = income).", "Record salary income (M prefix = income)."), example: "Mgaji 2500" },
        { cmd: "Mgaji 2500 maybank", desc: tr("Rekod pendapatan ke wallet tertentu.", "Record income to a specific wallet."), example: "Mgaji 2500 maybank" },
      ],
    },
    budget: {
      title: tr("Command Budget", "Budget Commands"),
      sub: tr("Urus budget bulanan mengikut kategori.", "Manage monthly budgets by category."),
      icon: <Wallet size={18} />,
      rows: [
        { cmd: "budget | bajet", desc: tr("Tunjuk bantuan command budget.", "Show budget command help."), example: "bajet" },
        { cmd: "budget set <kategori> <jumlah>", desc: tr("Set atau kemaskini budget kategori untuk bulan semasa.", "Set or update category budget for current month."), example: "budget set makanan 600" },
        { cmd: "budget set <kategori> <jumlah> @YYYY-MM", desc: tr("Set budget untuk bulan tertentu.", "Set budget for a specific month."), example: "budget set makanan 600 @2026-04" },
        { cmd: "budget list", desc: tr("Lihat senarai budget aktif.", "View active budgets."), example: "budget list" },
        { cmd: "budget summary", desc: tr("Ringkasan penggunaan budget bulanan semua kategori.", "Monthly budget summary for all categories."), example: "budget summary" },
        { cmd: "budget baki <kategori>", desc: tr("Semak baki budget kategori tertentu.", "Check budget balance for a specific category."), example: "budget baki makanan" },
        { cmd: "budget delete <kategori>", desc: tr("Padam budget kategori untuk bulan semasa.", "Delete a category budget."), example: "budget delete makanan" },
      ],
    },
    inventory: {
      title: tr("Barang Saya (Inventori)", "My Inventory"),
      sub: tr("Cari barang letak mana — lokasi, bekas, kategori & gambar.", "Find where items are — location, box, category & image."),
      icon: <Boxes size={18} />,
      rows: [
        { cmd: "stuff help", desc: tr("Papar panduan ringkas command Barang Saya.", "Show quick inventory command guide."), example: "stuff help" },
        { cmd: "stuff <nama barang>", desc: tr("Tambah barang ke inventori secara pantas.", "Add an item to inventory quickly."), example: "stuff kabel hdmi" },
        { cmd: "stuff <nama> <lokasi/bekas>", desc: tr("Tambah barang terus ke lokasi atau bekas simpanan.", "Add an item directly to a location or box."), example: "stuff kotak bilik stor" },
        { cmd: "tambah barang <nama> [N]", desc: tr("Tambah barang dengan kuantiti tertentu.", "Add item with specific quantity."), example: "tambah barang bateri 3" },
        { cmd: "stuff cari <kata>", desc: tr("Cari barang mengikut nama dalam inventori.", "Search items by name in inventory."), example: "stuff cari kabel" },
        { cmd: "tambah stor <nama>", desc: tr("Cipta lokasi stor baharu.", "Create a new storeroom / location."), example: "tambah stor Ruang Tamu" },
        { cmd: "tambah bekas <nama>", desc: tr("Cipta bekas / kotak baharu.", "Create a new box / container."), example: "tambah bekas Kotak A" },
      ],
    },
    debt: {
      title: tr("Tracker Hutang", "Debt Tracker"),
      sub: tr("Urus hutang piutang dengan individu.", "Manage money owed to and by people."),
      icon: <CreditCard size={18} />,
      rows: [
        { cmd: "lend <nama> <amaun>", desc: tr("Rekod orang hutang kita.", "Record money someone owes you."), example: "lend Ali 50" },
        { cmd: "borrow <nama> <amaun>", desc: tr("Rekod kita hutang orang.", "Record money you owe someone."), example: "borrow Ahmad 100" },
        { cmd: "pay <nama> <amaun>", desc: tr("Rekod bayaran balik hutang.", "Record repayment to that person."), example: "pay Ahmad 30" },
        { cmd: "balance <nama>", desc: tr("Semak baki hutang untuk individu tertentu.", "Check debt balance for one person."), example: "balance Ali" },
        { cmd: "debt list", desc: tr("Senarai semua baki hutang aktif (lend + borrow).", "List all active debt balances."), example: "debt list" },
      ],
    },
    loan: {
      title: tr("Tracker Loan", "Loan Tracker"),
      sub: tr("Urus pinjaman/loan dengan kiraan baki bulan.", "Manage loans with month countdown."),
      icon: <CreditCard size={18} />,
      rows: [
        { cmd: "loanx list", desc: tr("Senarai loan aktif bersama baki bulan.", "List active loans with months remaining."), example: "loanx list" },
        { cmd: "loanx add <nama> <jumlah> <bulanan>", desc: tr("Tambah loan baru dengan amaun bulanan untuk kiraan baki bulan.", "Add new loan with monthly amount for countdown."), example: "loanx add kereta 12000 500" },
        { cmd: "loanx pay <nama> <jumlah>", desc: tr("Bayar ansuran loan & rekod expense.", "Pay loan & record expense transaction."), example: "loanx pay kereta 500" },
        { cmd: "loanx pay <nama> <jumlah> wallet <nama_wallet>", desc: tr("Bayar loan daripada wallet tertentu.", "Pay loan from specific wallet."), example: "loanx pay kereta 500 wallet maybank" },
      ],
    },
    subscription: {
      title: tr("Langganan (SUBX)", "Subscription (SUBX)"),
      sub: tr("Urus langganan bulanan berulang.", "Manage recurring monthly subscriptions."),
      icon: <CalendarClock size={18} />,
      rows: [
        { cmd: "subx <nama> <jumlah> <day>HB", desc: tr("Simpan langganan bulanan berserta tarikh due.", "Save recurring monthly subscription with due day."), example: "SUBX ASTRO 89.90 15HB" },
        { cmd: "subx pay <nama> <jumlah> <wallet>", desc: tr("Bayar langganan & rekod transaksi automatik ke wallet pilihan.", "Pay subscription & record expense transaction to selected wallet."), example: "SUBX PAY ASTRO 89.90 TNG" },
      ],
    },
    transfer: {
      title: tr("Pindah Wallet", "Wallet Transfer"),
      sub: tr("Pindahkan wang antara wallet.", "Move money between wallets."),
      icon: <Repeat size={18} />,
      rows: [
        { cmd: "transfer <jumlah> <wallet_A> <wallet_B>", desc: tr("Pindah amaun dari wallet A ke wallet B.", "Move amount from wallet A to wallet B."), example: "transfer 100 maybank cash" },
        { cmd: "transfer <jumlah> dari <wallet_A> ke <wallet_B>", desc: tr("Format ayat penuh yang lebih mudah dibaca.", "Readable sentence format."), example: "transfer 50 dari maybank ke cash" },
        { cmd: "pindah <jumlah> <wallet_A> <wallet_B>", desc: tr("Format Bahasa Melayu.", "Malay keyword version."), example: "pindah 35 cash tabung" },
      ],
    },
    group: {
      title: tr("Mode Group", "Group Mode"),
      sub: tr("Rekod dan semak dalam group WhatsApp.", "Record and check inside WhatsApp group."),
      icon: <MessageSquare size={18} />,
      rows: [
        { cmd: "bd makan 12.50", desc: tr("Rekod transaksi dalam group menggunakan trigger prefix.", "Record expense inside group with trigger prefix."), example: "bd makan 12.50" },
        { cmd: "bd summary", desc: tr("Semak ringkasan dalam group dengan perlindungan privasi.", "Check summary inside group with privacy protection."), example: "bd summary" },
      ],
    },
    places: {
      title: tr("Tempat Saya", "My Places"),
      sub: tr("Simpan dan semak lokasi pin.", "Save and manage location pins."),
      icon: <MapPin size={18} />,
      rows: [
        { cmd: "pinx", desc: tr("Papar panduan command My Places.", "Show My Places command guide."), example: "pinx" },
        { cmd: "pinx <tajuk> <kategori> @here", desc: tr("Simpan pin lokasi semasa. Hantar location pin dahulu, kemudian taip command ini.", "Save current location pin. Send location pin first, then command."), example: "pinx rumah mak family @here" },
      ],
    },
    split: {
      title: tr("Split Bill", "Split Bill"),
      sub: tr("Kongsi bil dan bayaran dengan rakan.", "Split bills and repayments with friends."),
      icon: <CreditCard size={18} />,
      rows: [
        { cmd: "makan tng split 6", desc: tr("Buat split untuk resit terakhir yang dihantar.", "Create a split from the last receipt image sent."), example: "makan tng split 6" },
        { cmd: "splitx tng", desc: tr("Rekod bayaran balik daripada screenshot pembayaran.", "Record repayment with payment screenshot."), example: "splitx tng" },
        { cmd: "splitx create <tajuk> <jumlah> <orang>", desc: tr("Cipta split manual tanpa gambar resit.", "Create split manually without receipt."), example: "splitx create dinner 66 6" },
        { cmd: "splitx list", desc: tr("Lihat senarai split bill yang masih aktif.", "List active split bills."), example: "splitx list" },
      ],
    },
  }

  /* ── Search filter ── */
  const searchLower = searchQuery.trim().toLowerCase()
  const filteredSections = useMemo(() => {
    if (!searchLower) return Object.keys(commandsBySection)
    const hit = Object.entries(commandsBySection)
      .filter(([, sec]) =>
        sec.rows.some(
          (r) =>
            r.cmd.toLowerCase().includes(searchLower) ||
            r.desc.toLowerCase().includes(searchLower) ||
            r.example.toLowerCase().includes(searchLower)
        )
      )
      .map(([id]) => id)
    return hit
  }, [searchLower, commandsBySection])

  const renderSection = (id: string) => {
    const sec = commandsBySection[id]
    const rows = searchLower
      ? sec.rows.filter(
          (r) =>
            r.cmd.toLowerCase().includes(searchLower) ||
            r.desc.toLowerCase().includes(searchLower) ||
            r.example.toLowerCase().includes(searchLower)
        )
      : sec.rows
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)]">
              {sec.icon}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[var(--text)]">{sec.title}</h2>
              <p className="text-xs text-[var(--muted)]">{sec.sub}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {rows.map((row) => (
            <CommandCard key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} category={sec.title} />
          ))}
          {rows.length === 0 && (
            <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">
              {tr("Tiada command dijumpai.", "No commands found.")}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* ── MOBILE HEADER ── */}
      <div className="md:hidden">
        <MobilePageHeader title={tr("Command Bot", "Bot Commands")} fallbackHref={`/${sessionId}`} />
      </div>

      {/* ── DESKTOP HEADER ── */}
      <DesktopPageHeader
        title={tr("Command Bot & Panduan", "Bot Command & Guide")}
        breadcrumbs={[{ label: tr("Tetapan", "Settings"), href: `/${sessionId}/settings` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/settings`}
        backPreferHistory
        className="hidden md:block"
      />

      <div className="md:hidden">
        <div className="space-y-4 px-1 pt-1">
          {/* HERO */}
          <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--text)] shadow-sm">
            <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-neutral-500/10 blur-3xl" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-3 py-0.5 text-xs font-bold text-[var(--text)]">
                <Sparkles size={13} />
                <span>{tr("Panduan Command Bot", "Bot Command Guide")}</span>
              </div>
              <h1 className="mt-2 text-xl font-black tracking-tight text-[var(--text)]">
                {tr("Command Bot WhatsApp & Telegram", "WhatsApp & Telegram Bot Commands")}
              </h1>
              <p className="mt-1 text-xs sm:text-sm font-medium text-[var(--muted)]">
                {tr("Semua format arahan WhatsApp & Telegram dalam satu tempat.", "All WhatsApp & Telegram command formats in one place.")}
              </p>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={tr("Cari arahan (cth: 'makan', 'lend', 'stuff', 'budget')...", "Search commands (e.g. 'lunch', 'lend', 'stuff', 'budget')...")}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 pl-10 pr-9 text-xs sm:text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--text)] focus:bg-[var(--card)]"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)] hover:text-[var(--text)]">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* MOBILE TOPICS SCROLL */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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

          {/* MOBILE CONTENT */}
          <div className="space-y-6">
            {searchQuery
              ? filteredSections.map((id) => <div key={id}>{renderSection(id)}</div>)
              : renderSection(activeSectionId)}
          </div>
        </div>
      </div>

      {/* ── DESKTOP ── */}
      <DesktopPageBody className="space-y-6 hidden md:block">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--text)] shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-neutral-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 left-10 h-48 w-48 rounded-full bg-neutral-400/5 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-3 py-0.5 text-xs font-bold text-[var(--text)]">
                <Sparkles size={13} />
                <span>{tr("Panduan Command Bot", "Bot Command Guide")}</span>
              </div>
              <h1 className="mt-2 text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl lg:text-3xl">
                {tr("Command Bot WhatsApp & Telegram", "WhatsApp & Telegram Bot Commands")}
              </h1>
              <p className="mt-1 text-xs sm:text-sm font-medium text-[var(--muted)]">
                {tr("Semua format arahan WhatsApp & Telegram dalam satu tempat.", "All WhatsApp & Telegram command formats in one place.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Kategori", "Categories")}</p>
                <p className="text-lg font-black text-[var(--text)]">{sectionList.length}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{tr("Arahan", "Commands")}</p>
                <p className="text-lg font-black text-[var(--text)]">{Object.values(commandsBySection).reduce((n, s) => n + s.rows.length, 0)}</p>
              </div>
            </div>
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr("Cari arahan (cth: 'makan', 'lend', 'stuff', 'budget')...", "Search commands (e.g. 'lunch', 'lend', 'stuff', 'budget')...")}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] py-2.5 pl-10 pr-9 text-xs sm:text-sm font-medium text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition focus:border-[var(--text)] focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--text)]/15"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)] hover:text-[var(--text)]">
                <X size={14} />
              </button>
            )}
          </div>
        </section>

        {/* DESKTOP DUAL-PANE */}
        <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* LEFT SIDEBAR */}
          <aside className="hidden md:flex sticky top-20 flex-col rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-sm">
            <div className="border-b border-[var(--border)]/60 pb-3 mb-2 px-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">{tr("Kategori Arahan", "Command Categories")}</p>
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
                      <span className={cn("shrink-0", isActive ? "text-[var(--bg)]" : "text-[var(--muted)] group-hover:text-[var(--text)]")}>{s.icon}</span>
                      <span className="truncate">{s.label}</span>
                    </div>
                    <span className={cn("rounded-md px-1.5 py-0.2 text-[9px] font-black", isActive ? "bg-[var(--bg)] text-[var(--text)]" : "bg-[var(--surface-tint-strong)] text-[var(--muted)]")}>
                      {s.badge}
                    </span>
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* RIGHT MAIN */}
          <main className="space-y-6 min-w-0">
            {searchQuery
              ? filteredSections.map((id) => <div key={id}>{renderSection(id)}</div>)
              : renderSection(activeSectionId)}
          </main>
        </div>
      </DesktopPageBody>
    </div>
  )
}
