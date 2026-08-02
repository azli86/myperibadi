"use client"

import React, { useRef, useCallback, useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CalendarClock,
  ChevronDown,
  CreditCard,
  FileImage,
  Hash,
  KeyRound,
  MapPin,
  MessageSquare,
  Repeat,
  Shield,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import HistoryBackButton from "@/components/navigation/HistoryBackButton"
import { useTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"

/* ── Inline components ── */

function CodeBlock({ children }: { children: string }) {
  return (
    <code className="inline-block px-2 py-0.5 rounded-lg bg-[var(--surface-tint-strong)] text-[var(--text)] text-[0.8125rem] font-mono font-medium leading-relaxed">
      {children}
    </code>
  )
}

function ExampleBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-[var(--surface-tint-strong)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--text)]">
      <code>{children}</code>
    </pre>
  )
}

function SectionHeading({ id, icon, title }: { id: string; icon: React.ReactNode; title: string }) {
  return (
    <div id={id} className="flex items-center gap-2.5 scroll-mt-20 mb-3">
      <div className="h-8 w-8 rounded-xl bg-[var(--surface-tint-strong)] flex items-center justify-center text-[var(--muted)] flex-shrink-0">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
    </div>
  )
}

function CommandRow({ cmd, desc, example, exLabel }: { cmd: string; desc: string; example: string; exLabel: string }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <CodeBlock>{cmd}</CodeBlock>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{desc}</p>
      <p className="text-xs text-[var(--muted)] mt-1.5">
        {exLabel}: <CodeBlock>{example}</CodeBlock>
      </p>
    </div>
  )
}

function FormatCard({ title, pattern, examples, exLabel, patLabel }: { title: string; pattern: string; examples: string[]; exLabel: string; patLabel: string }) {
  return (
    <div className="bg-[var(--surface-tint)] border border-[var(--border)] rounded-2xl p-4">
      <p className="text-sm font-semibold text-[var(--text)] mb-1.5">{title}</p>
      <p className="text-xs text-[var(--muted)]">{patLabel}: <CodeBlock>{pattern}</CodeBlock></p>
      <p className="text-xs text-[var(--muted)] mt-1.5">{exLabel}: {examples.map((ex, i) => <span key={i}>{i > 0 && <span className="mx-1 opacity-40">|</span>}<CodeBlock>{ex}</CodeBlock></span>)}</p>
    </div>
  )
}

function TipBox({ children, isLight }: { children: React.ReactNode; isLight: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 text-sm leading-relaxed",
      isLight ? "border-amber-300/50 bg-amber-50/80 text-amber-800" : "border-amber-400/20 bg-amber-400/8 text-amber-200"
    )}>
      {children}
    </div>
  )
}

/* ── Main page ── */

export default function HelpPage() {
  const params = useParams()
  const sessionId = params.sessionId as string || ""
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const isBM = lang === "BM"
  const isLight = resolvedTheme === "light"
  const contentRef = useRef<HTMLDivElement>(null)
  const [selectedMobileSection, setSelectedMobileSection] = useState("")
  const [showMobileSectionMenu, setShowMobileSectionMenu] = useState(false)
  const exLabel = isBM ? "Contoh" : "Example"
  const patLabel = isBM ? "Format" : "Pattern"

  const sections = isBM
    ? [
        { id: "quick-start", label: "Mula Pantas", icon: <Zap size={14} /> },
        { id: "portal", label: "Fungsi Portal", icon: <ShieldCheck size={14} /> },
        { id: "recording", label: "Rekod Transaksi", icon: <Hash size={14} /> },
        { id: "salary", label: "Kitar Gaji", icon: <Wallet size={14} /> },
        { id: "items", label: "Item & Kuantiti", icon: <FileImage size={14} /> },
        { id: "commands", label: "Command WhatsApp", icon: <BookOpen size={14} /> },
        { id: "budget", label: "Command Budget", icon: <Wallet size={14} /> },
        { id: "debt", label: "Tracker Hutang", icon: <CreditCard size={14} /> },
        { id: "loan", label: "Tracker Loan", icon: <CreditCard size={14} /> },
        { id: "subscription", label: "Subscription", icon: <CalendarClock size={14} /> },
        { id: "transfer", label: "Transfer Wallet", icon: <Repeat size={14} /> },
        { id: "group", label: "Mode Group", icon: <MessageSquare size={14} /> },
        { id: "receipt", label: "Upload Resit", icon: <FileImage size={14} /> },
        { id: "places", label: "My Places", icon: <MapPin size={14} /> },
        { id: "security", label: "6PIN & Sekuriti", icon: <KeyRound size={14} /> },
        { id: "tips", label: "Tips & Keselamatan", icon: <Shield size={14} /> },
              ]
    : [
        { id: "quick-start", label: "Quick Start", icon: <Zap size={14} /> },
        { id: "portal", label: "Portal Features", icon: <ShieldCheck size={14} /> },
        { id: "recording", label: "Recording Transactions", icon: <Hash size={14} /> },
        { id: "salary", label: "Salary Cycle", icon: <Wallet size={14} /> },
        { id: "items", label: "Items & Quantity", icon: <FileImage size={14} /> },
        { id: "commands", label: "WhatsApp Commands", icon: <BookOpen size={14} /> },
        { id: "budget", label: "Budget Commands", icon: <Wallet size={14} /> },
        { id: "debt", label: "Debt Tracker", icon: <CreditCard size={14} /> },
        { id: "loan", label: "Loan Tracker", icon: <CreditCard size={14} /> },
        { id: "subscription", label: "Subscription", icon: <CalendarClock size={14} /> },
        { id: "transfer", label: "Wallet Transfer", icon: <Repeat size={14} /> },
        { id: "group", label: "Group Mode", icon: <MessageSquare size={14} /> },
        { id: "receipt", label: "Receipt Upload", icon: <FileImage size={14} /> },
        { id: "places", label: "My Places", icon: <MapPin size={14} /> },
        { id: "security", label: "6PIN & Security", icon: <KeyRound size={14} /> },
        { id: "tips", label: "Tips & Safety", icon: <Shield size={14} /> },
              ]

  const filteredSections = useMemo(() => sections, [sections])

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  useEffect(() => {
    if (!filteredSections.length) return
    if (!selectedMobileSection || !filteredSections.some((section) => section.id === selectedMobileSection)) {
      setSelectedMobileSection(filteredSections[0].id)
    }
  }, [filteredSections, selectedMobileSection])

  useEffect(() => {
    setShowMobileSectionMenu(false)
  }, [selectedMobileSection])

  const getSectionClassName = useCallback((sectionId: string) => cn(
    "bg-[var(--surface-tint)] border border-[var(--border)] rounded-2xl p-5",
    selectedMobileSection === sectionId ? "block" : "hidden md:block"
  ), [selectedMobileSection])



  return (
    <div className="mx-auto max-w-5xl md:mx-0 md:max-w-none">
      {/* Header */}
      <div className="mb-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 pt-4 md:flex md:items-center md:gap-4">
        <HistoryBackButton
          fallbackHref={`/${sessionId}/settings`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] text-[var(--text)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft size={18} />
        </HistoryBackButton>
        <div className="min-w-0 text-center md:text-left">
          <h1 className="truncate text-[1.28rem] font-extrabold tracking-tight text-[var(--text)]">
            {isBM ? "Bot Command Guide" : "Bot Command Guide"}
          </h1>
        </div>
        <div className="h-10 w-10 md:hidden" aria-hidden="true" />
      </div>

      <div className="mb-5 space-y-4">
        <div className="md:hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
          <button
            onClick={() => setShowMobileSectionMenu((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-sm font-medium text-[var(--text)]"
          >
            <span>{filteredSections.find((section) => section.id === selectedMobileSection)?.label || (isBM ? "Pilih bahagian" : "Choose section")}</span>
            <ChevronDown size={16} className={cn("text-[var(--muted)] transition-transform", showMobileSectionMenu && "rotate-180")} />
          </button>
          {showMobileSectionMenu && (
            <div className="mt-2 space-y-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2">
              {filteredSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setSelectedMobileSection(section.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    selectedMobileSection === section.id
                      ? "bg-[var(--surface-tint)] text-[var(--text)]"
                      : "text-[var(--text-soft)] hover:bg-[var(--surface-tint)] hover:text-[var(--text)]"
                  )}
                >
                  {section.icon}
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      <div className="flex gap-8">
        {/* Sidebar TOC — desktop only */}
        <nav className="hidden lg:block w-48 flex-shrink-0 sticky top-8 self-start">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-[var(--muted)] mb-3">
            {isBM ? "Kandungan" : "Contents"}
          </p>
          <ul className="space-y-0.5">
            {filteredSections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => { setSelectedMobileSection(s.id); scrollTo(s.id) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint)] transition-colors text-left"
                >
                  {s.icon}
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div ref={contentRef} className="flex-1 min-w-0 space-y-6 pb-12">

          {/* ── 1. Quick Start ── */}
          <section className={getSectionClassName("quick-start")}>
            <SectionHeading id="quick-start" icon={<Zap size={16} />} title={isBM ? "Mula Pantas" : "Quick Start"} />
            <ol className="space-y-2.5 text-sm text-[var(--text-soft)] list-decimal pl-5 marker:text-[var(--muted)] marker:font-semibold">
              {(isBM ? [
                <>Sambung akaun di halaman <strong>WhatsApp</strong> atau <strong>Telegram</strong>, ikut connector yang anda mahu guna.</>,
                <>Hantar mesej ke chat sendiri. Untuk WhatsApp group, hanya group yang anda allow + trigger prefix akan diproses.</>,
                <>Untuk rekod transaksi, pastikan ada amount - contoh: <CodeBlock>makan 12.50</CodeBlock></>,
                <>Untuk banyak item, guna <CodeBlock>item makan</CodeBlock> atau <CodeBlock>bd makan</CodeBlock> pada baris pertama.</>,
                <>Guna command <CodeBlock>summary</CodeBlock>, <CodeBlock>list</CodeBlock>, <CodeBlock>budget set makanan 600</CodeBlock>, <CodeBlock>debt list</CodeBlock>, dan <CodeBlock>checkwallet</CodeBlock> bila perlu.</>,
              ] : [
                <>Link your account on the <strong>WhatsApp</strong> or <strong>Telegram</strong> page, depending on the connector you want.</>,
                <>Send messages to your own chat. For WhatsApp groups, only allowed groups with trigger prefix will be processed.</>,
                <>For transactions, include an amount - e.g. <CodeBlock>lunch 12.50</CodeBlock></>,
                <>For multiple items, use <CodeBlock>item lunch</CodeBlock> or <CodeBlock>bd lunch</CodeBlock> on the first line.</>,
                <>Use <CodeBlock>summary</CodeBlock>, <CodeBlock>list</CodeBlock>, <CodeBlock>budget set food 600</CodeBlock>, <CodeBlock>debt list</CodeBlock>, and <CodeBlock>checkwallet</CodeBlock> as needed.</>,
              ]).map((step, i) => (
                <li key={i} className="leading-relaxed">{step}</li>
              ))}
            </ol>
          </section>


          {/* ── 2. Portal Features ── */}
          <section className={getSectionClassName("portal")}>
            <SectionHeading id="portal" icon={<ShieldCheck size={16} />} title={isBM ? "Fungsi Portal" : "Portal Features"} />
            <ul className="space-y-2 text-sm text-[var(--text-soft)] list-disc pl-5 marker:text-[var(--muted)]">
              {(isBM ? [
                <>Dashboard papar baki, income, expense, budget, wallet ringkas, dan transaksi terkini.</>,
                <>Transactions simpan rekod penuh, resit style detail, item, notes, kategori, wallet, tarikh, dan lampiran.</>,
                <>Wallet Settings urus wallet, bot default, nama, dan baki ikut transaksi sebenar.</>,
                <>Budget urus limit kategori ikut bulan, summary, baki, dan penggunaan.</>,
                <>Categories urus kategori dan keyword supaya bot pilih kategori dengan lebih tepat.</>,
                <>Map dan Map Analysis guna lokasi transaksi daripada location yang anda attach/reply pada transaksi.</>,
                <>Security urus password, 6PIN quick unlock, dan perlindungan akaun.</>,
              ] : [
                <>Dashboard shows balance, income, expense, budget, wallet summary, and recent transactions.</>,
                <>Transactions keeps full records, receipt-style detail, items, notes, category, wallet, date, and attachments.</>,
                <>Wallet Settings manages wallets, bot default wallet, names, and balance from real transactions.</>,
                <>Budget manages category limits by month, summary, remaining balance, and usage.</>,
                <>Categories manages category keywords so the bot can classify transactions more accurately.</>,
                <>Map and Map Analysis use locations attached/replied to transactions.</>,
                <>Security manages password, 6PIN quick unlock, and account protection.</>,
              ]).map((tip, i) => (
                <li key={i} className="leading-relaxed">{tip}</li>
              ))}
            </ul>
          </section>

          {/* ── 3. Recording Transactions ── */}
          <section className={getSectionClassName("recording")}>
            <SectionHeading id="recording" icon={<Hash size={16} />} title={isBM ? "Format Rekod Transaksi" : "Recording Transactions"} />
            <div className="space-y-3">
              {(isBM ? [
                { title: "Rekod perbelanjaan biasa", pattern: "nota + amount + [wallet]", examples: ["makan 12.50", "grab rm18.50 cash"] },
                { title: "Rekod pendapatan", pattern: "nota pendapatan + amount + [wallet]", examples: ["gaji 3500", "bonus 500 maybank"] },
                { title: "Rekod tarikh tertentu (backdate)", pattern: "mesej + @DDMMYYYY", examples: ["grab 18.50 @05042026", "makan 10 @01042026"] },
                { title: "Pilih wallet tertentu", pattern: "nota + amount + nama_wallet", examples: ["makan 12.50 cash", "gaji 3500 maybank"] },
                { title: "Simpan lokasi transaksi", pattern: "reply transaksi + attach/share location", examples: ["reply mesej TXN, hantar location", "reply transaksi lama, share location"] },
              ] : [
                { title: "Normal expense record", pattern: "note + amount + [wallet]", examples: ["lunch 12.50", "grab rm18.50 cash"] },
                { title: "Income record", pattern: "income note + amount + [wallet]", examples: ["salary 3500", "bonus 500 maybank"] },
                { title: "Record with specific date (backdate)", pattern: "message + @DDMMYYYY", examples: ["grab 18.50 @05042026", "lunch 10 @01042026"] },
                { title: "Choose specific wallet", pattern: "note + amount + wallet_name", examples: ["lunch 12.50 cash", "salary 3500 maybank"] },
                { title: "Save transaction location", pattern: "reply transaction + attach/share location", examples: ["reply TXN message, send location", "reply old transaction, share location"] },
              ]).map((row) => (
                <FormatCard key={row.title} title={row.title} pattern={row.pattern} examples={row.examples} exLabel={exLabel} patLabel={patLabel} />
              ))}
            </div>
          </section>

          {/* ── Salary Cycle ── */}
          <section className={getSectionClassName("salary")}>
            <SectionHeading id="salary" icon={<Wallet size={16} />} title={isBM ? "Kitar Gaji Bulanan" : "Monthly Salary Cycle"} />
            <TipBox isLight={isLight}>
              {isBM
                ? <>Gunakan command <CodeBlock>Mgaji</CodeBlock> untuk rekod gaji bulanan dan reset kitar belanjawan. Bot auto-kategorikan sebagai <CodeBlock>Monthly Salary</CodeBlock> dan menetapkan tarikh gaji untuk kitar baru. Pendapatan seterusnya dikira dari tarikh ini.</>
                : <>Use the <CodeBlock>Msalary</CodeBlock> command to record monthly salary and reset your budget cycle. The bot auto-categorizes it as <CodeBlock>Monthly Salary</CodeBlock> and sets the salary date for a new cycle. Subsequent income is counted from this date.</>
              }
            </TipBox>
            <div className="space-y-3 mt-4">
              {(isBM ? [
                { title: "Rekod gaji & reset kitar", pattern: "Mgaji + amount + [wallet]", examples: ["Mgaji 3500", "Mgaji 3500 maybank"] },
                { title: "Gaji backdate", pattern: "Mgaji + amount + @DDMMYYYY", examples: ["Mgaji 3500 @01042026"] },
              ] : [
                { title: "Record salary & reset cycle", pattern: "Msalary + amount + [wallet]", examples: ["Msalary 3500", "Msalary 3500 maybank"] },
                { title: "Backdated salary", pattern: "Msalary + amount + @DDMMYYYY", examples: ["Msalary 3500 @01042026"] },
              ]).map((row) => (
                <FormatCard key={row.title} title={row.title} pattern={row.pattern} examples={row.examples} exLabel={exLabel} patLabel={patLabel} />
              ))}
            </div>
          </section>


          {/* ── 4. Multi Item ── */}
          <section className={getSectionClassName("items")}>
            <SectionHeading id="items" icon={<FileImage size={16} />} title={isBM ? "Banyak Item & Kuantiti" : "Multiple Items & Quantity"} />
            <TipBox isLight={isLight}>
              {isBM
                ? <>Bot jumlahkan semua item automatik. Baris pertama jadi tajuk resit. Guna prefix <CodeBlock>item</CodeBlock>, <CodeBlock>items</CodeBlock>, atau <CodeBlock>bd</CodeBlock> untuk mode banyak item.</>
                : <>Bot totals all items automatically. First line becomes the receipt title. Use <CodeBlock>item</CodeBlock>, <CodeBlock>items</CodeBlock>, or <CodeBlock>bd</CodeBlock> for multi-item mode.</>
              }
            </TipBox>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--text)]">{isBM ? "Item tanpa kuantiti" : "Items without quantity"}</p>
                <ExampleBlock>{isBM ? `item makan
nasi ayam 5
nasi goreng 10` : `item lunch
chicken rice 5
fried rice 10`}</ExampleBlock>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--text)]">{isBM ? "Dengan kuantiti x harga" : "With quantity x unit price"}</p>
                <ExampleBlock>{isBM ? `item pasar
telur 2 x 8.50
ayam 1.5 @ 12` : `item groceries
eggs 2 x 8.50
chicken 1.5 @ 12`}</ExampleBlock>
              </div>
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-semibold text-[var(--text)]">{isBM ? "Prefix tajuk boleh dibuang dari nama item" : "Title prefix can be removed from item names"}</p>
                <ExampleBlock>{isBM ? `bd makan
makan nasi ayam 5
makan nasi goreng 10` : `bd food
food chicken rice 5
food fried rice 10`}</ExampleBlock>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-soft)] list-disc pl-5 marker:text-[var(--muted)] mt-4">
              {(isBM ? [
                <>Format item biasa: <CodeBlock>nama item amount</CodeBlock>.</>,
                <>Format kuantiti: <CodeBlock>nama item qty x harga</CodeBlock>, <CodeBlock>nama item qty @ harga</CodeBlock>, atau simbol <CodeBlock>×</CodeBlock>.</>,
                <>Tanpa prefix <CodeBlock>item</CodeBlock>/<CodeBlock>bd</CodeBlock>, bot hanya cuba simpan kalau ada sekurang-kurangnya 2 baris item sah.</>,
              ] : [
                <>Normal item format: <CodeBlock>item name amount</CodeBlock>.</>,
                <>Quantity format: <CodeBlock>item name qty x price</CodeBlock>, <CodeBlock>item name qty @ price</CodeBlock>, or symbol <CodeBlock>×</CodeBlock>.</>,
                <>Without <CodeBlock>item</CodeBlock>/<CodeBlock>bd</CodeBlock> prefix, bot only saves when at least 2 valid item rows exist.</>,
              ]).map((tip, i) => (
                <li key={i} className="leading-relaxed">{tip}</li>
              ))}
            </ul>
          </section>

          {/* ── 5. WhatsApp Commands ── */}
          <section className={getSectionClassName("commands")}>
            <SectionHeading id="commands" icon={<BookOpen size={16} />} title={isBM ? "Senarai Command WhatsApp" : "WhatsApp Command List"} />
            <div className="divide-y divide-[var(--border)]">
              {(isBM ? [
                { cmd: "help", desc: "Tunjuk mesej bantuan ringkas bot.", example: "help" },
                { cmd: "summary", desc: "Ringkasan bulan semasa (pendapatan, perbelanjaan, baki bersih).", example: "summary" },
                { cmd: "list", desc: "Papar 5 transaksi terbaru.", example: "list" },
                { cmd: "checkwallet", desc: "Papar baki setiap wallet + jumlah keseluruhan.", example: "checkwallet" },
                { cmd: "semak wallet", desc: "Sama seperti checkwallet, versi Bahasa Melayu.", example: "semak wallet" },
                { cmd: "lang en | lang bm", desc: "Tukar bahasa reply bot.", example: "lang en" },
              ] : [
                { cmd: "help", desc: "Shows the bot help message.", example: "help" },
                { cmd: "summary", desc: "Current month summary (income, expense, net balance).", example: "summary" },
                { cmd: "list", desc: "Shows your latest 5 transactions.", example: "list" },
                { cmd: "checkwallet", desc: "Shows each wallet balance + total balance.", example: "checkwallet" },
                { cmd: "semak wallet", desc: "Same as checkwallet, Malay version.", example: "semak wallet" },
                { cmd: "lang en | lang bm", desc: "Switch bot reply language.", example: "lang bm" },
              ]).map((row) => (
                <CommandRow key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} />
              ))}
            </div>
          </section>

          {/* ── 6. Budget Commands ── */}
          <section className={getSectionClassName("budget")}>
            <SectionHeading id="budget" icon={<Wallet size={16} />} title={isBM ? "Command Budget" : "Budget Commands"} />
            <div className="divide-y divide-[var(--border)]">
              {(isBM ? [
                { cmd: "budget | bajet", desc: "Tunjuk bantuan command budget.", example: "bajet" },
                { cmd: "budget set <kategori> <jumlah>", desc: "Set atau kemaskini budget kategori untuk bulan semasa.", example: "budget set makanan 600" },
                { cmd: "budget set <kategori> <jumlah> @YYYY-MM", desc: "Set budget untuk bulan tertentu.", example: "budget set makanan 600 @2026-04" },
                { cmd: "budget list", desc: "Lihat senarai budget aktif.", example: "budget list" },
                { cmd: "budget summary | budget ringkasan", desc: "Ringkasan budget bulanan - semua kategori.", example: "budget ringkasan" },
                { cmd: "budget baki <kategori>", desc: "Semak baki budget kategori tertentu.", example: "budget baki makanan" },
                { cmd: "budget delete | budget padam", desc: "Padam budget kategori untuk bulan tertentu.", example: "budget padam makanan @2026-04" },
              ] : [
                { cmd: "budget | bajet", desc: "Show budget command help.", example: "budget" },
                { cmd: "budget set <category> <amount>", desc: "Set or update category budget for current month.", example: "budget set food 600" },
                { cmd: "budget set <category> <amount> @YYYY-MM", desc: "Set budget for a specific month.", example: "budget set food 600 @2026-04" },
                { cmd: "budget list", desc: "View active budgets.", example: "budget list" },
                { cmd: "budget summary | budget ringkasan", desc: "Monthly budget summary - all categories.", example: "budget summary" },
                { cmd: "budget baki <category>", desc: "Check budget balance for a specific category.", example: "budget baki food" },
                { cmd: "budget delete | budget padam", desc: "Delete a category budget for a specific month.", example: "budget delete food @2026-04" },
              ]).map((row) => (
                <CommandRow key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} />
              ))}
            </div>
          </section>

          {/* ── 7. Debt Tracker ── */}
          <section className={getSectionClassName("debt")}>
            <SectionHeading id="debt" icon={<CreditCard size={16} />} title={isBM ? "Tracker Hutang" : "Debt Tracker"} />
            <TipBox isLight={isLight}>
              {isBM
                ? <><strong>lend</strong> = orang hutang kita (kita bagi pinjam). <strong>borrow</strong> = kita hutang orang (kita pinjam). <strong>pay</strong> = rekod bayaran balik hutang. Guna <strong>balance</strong> untuk semak baki.</>
                : <><strong>lend</strong> = someone owes you (you lent money). <strong>borrow</strong> = you owe someone (you borrowed). <strong>pay</strong> = record a repayment. Use <strong>balance</strong> to check remaining.</>
              }
            </TipBox>
            <div className="divide-y divide-[var(--border)] mt-4">
              {(isBM ? [
                { cmd: "lend <nama> <amaun>", desc: "Rekod orang hutang kita. Amaun positif tambah hutang, negatif tolak/selesai.", example: "lend Ali 50" },
                { cmd: "borrow <nama> <amaun>", desc: "Rekod kita hutang orang. Amaun positif tambah hutang, negatif tolak/selesai.", example: "borrow Ahmad 100" },
                { cmd: "pay <nama> <amaun>", desc: "Rekod bayaran balik hutang kepada nama tersebut.", example: "pay Ahmad 30" },
                { cmd: "balance <nama>", desc: "Semak baki hutang untuk satu nama.", example: "balance Ali" },
                { cmd: "debt list", desc: "Senarai semua baki hutang aktif (lend + borrow).", example: "debt list" },
                { cmd: "debtcmd", desc: "Papar panduan ringkas command hutang dalam chat.", example: "debtcmd" },
              ] : [
                { cmd: "lend <name> <amount>", desc: "Record money someone owes you. Positive to add, negative to settle.", example: "lend Ali 50" },
                { cmd: "borrow <name> <amount>", desc: "Record money you owe someone. Positive to add, negative to settle.", example: "borrow Ahmad 100" },
                { cmd: "pay <name> <amount>", desc: "Record a repayment to that person.", example: "pay Ahmad 30" },
                { cmd: "balance <name>", desc: "Check debt balance for one person.", example: "balance Ali" },
                { cmd: "debt list", desc: "List all active debt balances (lent + borrowed).", example: "debt list" },
                { cmd: "debtcmd", desc: "Show quick debt command guide in chat.", example: "debtcmd" },
              ]).map((row) => (
                <CommandRow key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} />
              ))}
            </div>
          </section>

          {/* ── 8. Loan Tracker ── */}
          <section className={getSectionClassName("loan")}>
            <SectionHeading id="loan" icon={<CreditCard size={16} />} title={isBM ? "Tracker Loan" : "Loan Tracker"} />
            <TipBox isLight={isLight}>
              {isBM
                ? <>Loan guna formula <strong>Jumlah Loan / Bayaran Bulanan = Baki Bulan</strong>. Buat loan baru tidak cipta transaksi. Hanya <strong>loanx pay</strong> akan tolak wallet dan rekod expense.</>
                : <>Loan uses formula <strong>Total Loan / Monthly Pay = Months Remaining</strong>. Creating a new loan does not create a transaction. Only <strong>loanx pay</strong> deducts wallet and records expense.</>
              }
            </TipBox>
            <div className="divide-y divide-[var(--border)] mt-4">
              {(isBM ? [
                { cmd: "loanx", desc: "Papar panduan command loan.", example: "loanx" },
                { cmd: "loanx list", desc: "Senarai loan aktif bersama baki bulan.", example: "loanx list" },
                { cmd: "loanx add <nama> <jumlah> <bulanan>", desc: "Tambah loan baru dengan amaun bulanan untuk kiraan baki bulan.", example: "loanx add kereta 12000 500" },
                { cmd: "loanx add <nama> <jumlah> monthly <bulanan>", desc: "Format jelas untuk bulanan.", example: "loanx add rumah 250000 monthly 1200" },
                { cmd: "loanx pay <nama> <jumlah>", desc: "Bayar loan guna wallet default bot.", example: "loanx pay kereta 500" },
                { cmd: "loanx pay <nama> <jumlah> wallet <nama_wallet>", desc: "Bayar loan dari wallet pilihan.", example: "loanx pay kereta 500 wallet maybank" },
              ] : [
                { cmd: "loanx", desc: "Show loan command help.", example: "loanx" },
                { cmd: "loanx list", desc: "List active loans with months remaining.", example: "loanx list" },
                { cmd: "loanx add <name> <amount> <monthly>", desc: "Create a new loan with monthly amount for month calculation.", example: "loanx add car 12000 500" },
                { cmd: "loanx add <name> <amount> monthly <monthly>", desc: "Explicit monthly format.", example: "loanx add house 250000 monthly 1200" },
                { cmd: "loanx pay <name> <amount>", desc: "Pay loan using bot default wallet.", example: "loanx pay car 500" },
                { cmd: "loanx pay <name> <amount> wallet <wallet_name>", desc: "Pay loan from selected wallet.", example: "loanx pay car 500 wallet maybank" },
              ]).map((row) => (
                <CommandRow key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} />
              ))}
            </div>
          </section>

          {/* ── 9. Subscription (SUBX) ── */}
          <section className={getSectionClassName("subscription")}>
            <SectionHeading id="subscription" icon={<CalendarClock size={16} />} title={isBM ? "Subscription Langganan (SUBX)" : "Subscription (SUBX)"} />
            <TipBox isLight={isLight}>
              {isBM
                ? <><strong>SUBX</strong> untuk simpan langganan bulanan dengan due day. <strong>SUBX PAY</strong> untuk bayar langganan & rekod transaksi automatik ke wallet.</>
                : <><strong>SUBX</strong> to save monthly subscriptions with due day. <strong>SUBX PAY</strong> to pay subscription & auto record transaction to wallet.</>
              }
            </TipBox>
            <div className="divide-y divide-[var(--border)] mt-4">
              {(isBM ? [
                { cmd: "subx <nama> <jumlah> <day>HB", desc: "Simpan langganan bulanan dengan due day. Tiada transaksi dibuat.", example: "SUBX ASTRO 89.90 15HB" },
                { cmd: "subx pay <nama> <jumlah> <wallet>", desc: "Bayar langganan & rekod transaksi expense automatik ke wallet pilihan.", example: "SUBX PAY ASTRO 89.90 TNG" },
                { cmd: "Senarai di portal", desc: "Buka halaman Subscription di portal untuk lihat, edit, dan padam langganan.", example: "Menu → Personal → Subscription" },
              ] : [
                { cmd: "subx <name> <amount> <day>HB", desc: "Save a monthly subscription with due day. No transaction created.", example: "SUBX ASTRO 89.90 15HB" },
                { cmd: "subx pay <name> <amount> <wallet>", desc: "Pay subscription & auto record expense transaction to selected wallet.", example: "SUBX PAY ASTRO 89.90 TNG" },
                { cmd: "Portal list", desc: "Open Subscription page in portal to view, edit, and delete subscriptions.", example: "Menu → Personal → Subscription" },
              ]).map((row) => (
                <CommandRow key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} />
              ))}
            </div>
          </section>

          {/* ── 10. Transfer Between Wallets ── */}
          <section className={getSectionClassName("transfer")}>
            <SectionHeading id="transfer" icon={<Repeat size={16} />} title={isBM ? "Transfer Antara Wallet" : "Transfer Between Wallets"} />
            <div className="divide-y divide-[var(--border)]">
              {(isBM ? [
                { cmd: "transfer <jumlah> <wallet_A> <wallet_B>", desc: "Pindah amaun dari wallet A ke wallet B. Pastikan nama wallet tepat.", example: "transfer 100 maybank cash" },
                { cmd: "transfer <jumlah> dari <wallet_A> ke <wallet_B>", desc: "Format ayat penuh, lebih mudah dibaca.", example: "transfer 50 dari maybank ke cash" },
                { cmd: "pindah <jumlah> <wallet_A> <wallet_B>", desc: "Sama seperti transfer, versi Bahasa Melayu.", example: "pindah 35 cash tabung" },
              ] : [
                { cmd: "transfer <amount> <wallet_A> <wallet_B>", desc: "Move amount from wallet A to wallet B. Use exact wallet names.", example: "transfer 100 maybank cash" },
                { cmd: "transfer <amount> from <wallet_A> to <wallet_B>", desc: "Readable sentence format.", example: "transfer 50 from maybank to cash" },
                { cmd: "pindah <amount> <wallet_A> <wallet_B>", desc: "Same as transfer, Malay version.", example: "pindah 35 cash savings" },
              ]).map((row) => (
                <CommandRow key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} />
              ))}
            </div>
          </section>

          {/* ── 9. Group Mode ── */}
          <section className={getSectionClassName("group")}>
            <SectionHeading id="group" icon={<MessageSquare size={16} />} title={isBM ? "Mode Group (Trigger Prefix)" : "Group Mode (Trigger Prefix)"} />
            <ul className="space-y-2 text-sm text-[var(--text-soft)] list-disc pl-5 marker:text-[var(--muted)]">
              {(isBM ? [
                <>Bot hanya proses mesej dari group yang anda <strong>allow</strong> di halaman WhatsApp.</>,
                <>Gunakan trigger prefix group (contoh <CodeBlock>bd</CodeBlock>) sebelum arahan. Contoh: <CodeBlock>bd makan 12.50</CodeBlock></>,
                <>Mesej tanpa trigger di group akan diabaikan.</>,
                <>Tetapan privacy group boleh sorok baki wallet, income, dan expense. Nilai akan keluar sebagai <strong>Private</strong>.</>,
              ] : [
                <>Bot only processes messages from groups you <strong>allow</strong> on the WhatsApp page.</>,
                <>Use the group trigger prefix (e.g. <CodeBlock>bd</CodeBlock>) before commands. Example: <CodeBlock>bd lunch 12.50</CodeBlock></>,
                <>Messages without trigger in groups are ignored.</>,
                <>Group privacy settings can hide wallet balance, income, and expense. Values will show as <strong>Private</strong>.</>,
              ]).map((tip, i) => (
                <li key={i} className="leading-relaxed">{tip}</li>
              ))}
            </ul>
          </section>

          {/* ── 10. Receipt Upload ── */}
          <section className={getSectionClassName("receipt")}>
            <SectionHeading id="receipt" icon={<FileImage size={16} />} title={isBM ? "Upload Resit & Lampiran" : "Receipt & Attachment Upload"} />
            <ul className="space-y-2 text-sm text-[var(--text-soft)] list-disc pl-5 marker:text-[var(--muted)]">
              {(isBM ? [
                <>Jika mahu upload lampiran ke transaksi lama, <strong>reply mesej bot yang ada TXN</strong>, kemudian hantar gambar atau PDF.</>,
                <>Jika hantar <CodeBlock>makan 12.50</CodeBlock> bersama gambar dalam mesej sama, sistem akan simpan transaksi baru dan cuba lampirkan media pada transaksi itu.</>,
                <>Jika kategori tidak pasti, bot akan minta pilihan kategori dahulu. Selepas anda pilih kategori, sistem sambung proses lampiran.</>,
                <>Jika mesej reply tiada TXN sah atau transaksi itu sudah dipadam, upload lampiran akan gagal dan tidak akan masuk ke transaksi lain.</>,
                <>Semua media sekarang akan tunjuk progress awal seperti <CodeBlock>Lampiran diterima</CodeBlock> supaya user tahu bot sedang bekerja.</>,
              ] : [
                <>If you want to upload an attachment to an older transaction, <strong>reply to the bot message that contains TXN</strong>, then send the image or PDF.</>,
                <>If you send <CodeBlock>lunch 12.50</CodeBlock> together with an image in the same message, the system will save a new transaction and try to attach the media to that transaction.</>,
                <>If the category is unclear, the bot will ask you to pick a category first. After you choose it, the system continues the attachment flow.</>,
                <>If the replied message has no valid TXN or that transaction was deleted, attachment upload will fail and will not go into another transaction.</>,
                <>All media now shows early progress such as <CodeBlock>Attachment received</CodeBlock> so users know the bot is working.</>,
              ]).map((tip, i) => (
                <li key={i} className="leading-relaxed">{tip}</li>
              ))}
            </ul>
          </section>

          {/* ── My Places ── */}
          <section className={getSectionClassName("places")}>
            <SectionHeading id="places" icon={<MapPin size={16} />} title={isBM ? "My Places (Tempat Saya)" : "My Places"} />
            <TipBox isLight={isLight}>
              {isBM
                ? <>My Places simpan pin lokasi penting seperti rumah, kerja, dan tempat keluarga. Boleh save melalui WhatsApp guna command <CodeBlock>pinx</CodeBlock> atau terus di peta portal.</>
                : <>My Places saves important location pins like home, work, and family places. You can save via WhatsApp using the <CodeBlock>pinx</CodeBlock> command or directly on the portal map.</>
              }
            </TipBox>
            <div className="divide-y divide-[var(--border)] mt-4">
              {(isBM ? [
                { cmd: "pinx", desc: "Papar panduan command My Places.", example: "pinx" },
                { cmd: "pinx <tajuk> <kategori> @here", desc: "Simpan pin lokasi semasa. Hantar location pin dahulu, kemudian taip command. Kategori ialah token terakhir.", example: "pinx rumah mak family @here" },
                { cmd: "pinx <tajuk> <kategori> @here (dengan location)", desc: "Hantar location pin dalam mesej yang sama atau reply mesej location, kemudian taip command.", example: "pinx pejabat office @here" },
              ] : [
                { cmd: "pinx", desc: "Show My Places command guide.", example: "pinx" },
                { cmd: "pinx <title> <category> @here", desc: "Save current location pin. Send a location pin first, then type the command. Category is the last token.", example: "pinx home mom family @here" },
                { cmd: "pinx <title> <category> @here (with location)", desc: "Send a location pin in the same message or reply to the location message, then type the command.", example: "pinx office work @here" },
              ]).map((row) => (
                <CommandRow key={row.cmd} cmd={row.cmd} desc={row.desc} example={row.example} exLabel={exLabel} />
              ))}
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-soft)] list-disc pl-5 marker:text-[var(--muted)] mt-4">
              {(isBM ? [
                <>Senarai tempat hanya boleh dilihat di halaman <strong>My Places</strong> dalam portal — bukan WhatsApp untuk elak spam/ban.</>,
                <>Di portal, tekan butang <strong>+</strong> pada peta atau guna <strong>Use My Location</strong> untuk drop pin baharu.</>,
                <>Pilih kategori untuk setiap pin supaya mudah ditapis di peta dan Map Analysis.</>,
                <>Pin boleh dikongsi ke nombor WhatsApp lain melalui <strong>Share</strong> di portal.</>,
                <>Pin dari transaksi (reply + attach location) akan muncul di Map dan Map Analysis, berasingan dari My Places.</>,
              ] : [
                <>Place list is only viewable on the <strong>My Places</strong> page in the portal — not via WhatsApp to avoid spam/ban.</>,
                <>On the portal, tap the <strong>+</strong> button on the map or use <strong>Use My Location</strong> to drop a new pin.</>,
                <>Assign a category to each pin for easy filtering on the map and Map Analysis.</>,
                <>Pins can be shared to other WhatsApp numbers via <strong>Share</strong> on the portal.</>,
                <>Transaction pins (reply + attach location) appear on Map and Map Analysis, separate from My Places.</>,
              ]).map((tip, i) => (
                <li key={i} className="leading-relaxed">{tip}</li>
              ))}
            </ul>
          </section>

          {/* ── 12. Security ── */}
          <section className={getSectionClassName("security")}>
            <SectionHeading id="security" icon={<KeyRound size={16} />} title={isBM ? "6PIN & Sekuriti" : "6PIN & Security"} />
            <ul className="space-y-2 text-sm text-[var(--text-soft)] list-disc pl-5 marker:text-[var(--muted)]">
              {(isBM ? [
                <>6PIN ialah quick unlock untuk portal pada device sendiri selepas login berjaya.</>,
                <>Session boleh lock semula bila idle atau app dibuka semula, ikut tetapan browser/PWA dan mode security semasa.</>,
                <>Password masih diperlukan untuk login penuh dan perubahan keselamatan penting.</>,
                <>Semak Security untuk urus PIN, kata laluan, dan perlindungan akses akaun.</>,
              ] : [
                <>6PIN is quick unlock for your own device after successful login.</>,
                <>Session can lock again when idle or when the app reopens, depending on browser/PWA behavior and active security mode.</>,
                <>Password is still required for full login and important security changes.</>,
                <>Use Security to manage PIN, password, and account access protection.</>,
              ]).map((tip, i) => (
                <li key={i} className="leading-relaxed">{tip}</li>
              ))}
            </ul>
          </section>

          {/* ── 13. Tips & Safety ── */}
          <section className={getSectionClassName("tips")}>
            <SectionHeading id="tips" icon={<Shield size={16} />} title={isBM ? "Tips Elak Data Rosak" : "Tips to Avoid Bad Data"} />
            <ul className="space-y-2 text-sm text-[var(--text-soft)] list-disc pl-5 marker:text-[var(--muted)]">
              {(isBM ? [
                <>Pastikan ejaan nama wallet <strong>tepat</strong> untuk transfer dan pemilihan wallet.</>,
                <>Gunakan format tarikh tepat <CodeBlock>@DDMMYYYY</CodeBlock> (contoh <CodeBlock>@05042026</CodeBlock>).</>,
                "Jika amount tidak dikesan dalam mesej, bot tidak akan simpan transaksi.",
                <>Budget guna format bulan <CodeBlock>@YYYY-MM</CodeBlock> (contoh <CodeBlock>@2026-04</CodeBlock>).</>,
                "Semak kategori dan keyword di halaman Categories jika kategori sentiasa salah.",
              ] : [
                <>Use <strong>exact wallet names</strong> for transfers and wallet assignment.</>,
                <>Use exact date format <CodeBlock>@DDMMYYYY</CodeBlock> (e.g. <CodeBlock>@05042026</CodeBlock>).</>,
                "If amount is not detected in the message, bot will not save the transaction.",
                <>Budget uses month format <CodeBlock>@YYYY-MM</CodeBlock> (e.g. <CodeBlock>@2026-04</CodeBlock>).</>,
                "Check categories and keywords on the Categories page if categories are always wrong.",
              ]).map((tip, i) => (
                <li key={i} className="leading-relaxed">{tip}</li>
              ))}
            </ul>
          </section>


        </div>
      </div>
    </div>
  )
}
