"use client"

import React, { useState, useMemo } from "react"
import { useParams } from "next/navigation"
import {
  Zap,
  Wallet,
  Boxes,
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
  Copy,
  Check,
  ChevronRight,
  Terminal,
  HelpCircle,
  Layers,
  ArrowRight,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

/* ── Modern Command Card Component ── */
function CommandCard({
  cmd,
  desc,
  example,
  exLabel,
  category,
  categoryColor,
}: {
  cmd: string
  desc: string
  example: string
  exLabel: string
  category?: string
  categoryColor?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div
      onClick={() => handleCopy()}
      className="group relative flex flex-col justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all duration-200 hover:border-[var(--border-strong)] hover:shadow-md cursor-pointer"
    >
      <div>
        {/* Header: Command Badge & Copy Button */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint-strong)] px-3 py-1.5 font-mono text-xs md:text-[0.82rem] font-black text-[var(--text)] tracking-tight select-all">
              <Terminal size={12} className="text-[var(--muted)] shrink-0" />
              <span>{cmd}</span>
            </span>
            {category && (
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-bold",
                  categoryColor || "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
                )}
              >
                {category}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            title="Salin arahan / Copy command"
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition active:scale-95",
              copied
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint-strong)]"
            )}
          >
            {copied ? (
              <>
                <Check size={12} strokeWidth={3} />
                <span>Disalin</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Salin</span>
              </>
            )}
          </button>
        </div>

        {/* Description */}
        <p className="mt-2.5 text-xs md:text-[0.82rem] leading-relaxed text-[var(--muted)]">
          {desc}
        </p>
      </div>

      {/* Example Box */}
      {example && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] shrink-0">
              {exLabel}:
            </span>
            <code className="font-mono text-xs font-semibold text-[var(--text)] truncate">
              {example}
            </code>
          </div>
          <span className="text-[10px] text-[var(--muted)] opacity-0 group-hover:opacity-100 transition shrink-0 hidden sm:inline">
            Klik kad untuk salin
          </span>
        </div>
      )}
    </div>
  )
}

type Cmd = { cmd: string; desc: string; example: string }

export default function BotCommandPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useLang()
  const [activeSectionId, setActiveSectionId] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  const isBM = lang === "BM"
  const tr = (ms: string, en: string) => (isBM ? ms : en)
  const exLabel = isBM ? "Contoh" : "Example"

  /* ── Section Definitions ── */
  const sectionList = useMemo(
    () => [
      {
        id: "general",
        label: tr("Bot Asas", "General Bot"),
        icon: Bot,
        badge: "Asas",
        color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      },
      {
        id: "recording",
        label: tr("Rekod Transaksi", "Record Transactions"),
        icon: Hash,
        badge: "Harian",
        color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
      },
      {
        id: "budget",
        label: tr("Command Bajet", "Budget Commands"),
        icon: Wallet,
        badge: "Bajet",
        color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      },
      {
        id: "inventory",
        label: tr("Barang Saya", "My Inventory"),
        icon: Boxes,
        badge: "Storan",
        color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      },
      {
        id: "debt",
        label: tr("Tracker Hutang", "Debt Tracker"),
        icon: CreditCard,
        badge: "Hutang",
        color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      },
      {
        id: "loan",
        label: tr("Tracker Loan", "Loan Tracker"),
        icon: CreditCard,
        badge: "Ansuran",
        color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      },
      {
        id: "subscription",
        label: tr("Langganan (SUBX)", "Subscription (SUBX)"),
        icon: CalendarClock,
        badge: "Berulang",
        color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
      },
      {
        id: "transfer",
        label: tr("Pindah Wallet", "Wallet Transfer"),
        icon: Repeat,
        badge: "Dompet",
        color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      },
      {
        id: "group",
        label: tr("Mode Group", "Group Mode"),
        icon: MessageSquare,
        badge: "Kumpulan",
        color: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
      },
      {
        id: "places",
        label: tr("Tempat Saya", "My Places"),
        icon: MapPin,
        badge: "Lokasi",
        color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      },
      {
        id: "split",
        label: tr("Split Bill", "Split Bill"),
        icon: CreditCard,
        badge: "Kongsi",
        color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      },
    ],
    [tr]
  )

  /* ── Commands per category ── */
  const commandsBySection: Record<
    string,
    { title: string; sub: string; icon: React.ElementType; color: string; rows: Cmd[] }
  > = {
    general: {
      title: tr("Command Asas Bot & Semakan", "General Bot & Status Commands"),
      sub: tr("Arahan pantas untuk semakan baki, ringkasan bulanan, dan tetapan bahasa.", "Quick commands for balance checks, monthly summaries, and language switch."),
      icon: Bot,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      rows: [
        { cmd: "help", desc: tr("Papar mesej bantuan ringkas bot dan pautan pantas.", "Shows the bot help message and quick links."), example: "help" },
        { cmd: "summary", desc: tr("Ringkasan bulan semasa (pendapatan, perbelanjaan, dan baki bersih).", "Current month summary (income, expenses, and net balance)."), example: "summary" },
        { cmd: "list", desc: tr("Papar 5 transaksi terbaru yang direkodkan.", "Shows your latest 5 recorded transactions."), example: "list" },
        { cmd: "checkwallet", desc: tr("Papar baki setiap dompet/akaun berserta jumlah keseluruhan.", "Shows each wallet/account balance plus overall total."), example: "checkwallet" },
        { cmd: "semak wallet", desc: tr("Sama seperti checkwallet (versi Bahasa Melayu).", "Same as checkwallet in BM."), example: "semak wallet" },
        { cmd: "lang en | lang bm", desc: tr("Tukar bahasa respon bot antara Bahasa Melayu dan Bahasa Inggeris.", "Switch bot reply language between BM and English."), example: "lang en" },
      ],
    },
    recording: {
      title: tr("Rekod Transaksi Pantas", "Quick Transaction Recording"),
      sub: tr("Format perbelanjaan, pendapatan, dan gaji untuk bot WhatsApp & Telegram.", "Expense, income, and salary formats for bot chats."),
      icon: Hash,
      color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
      rows: [
        { cmd: "makan 12.50", desc: tr("Rekod perbelanjaan dengan kategori dipadankan secara automatik.", "Record expense with auto-assigned category."), example: "makan 12.50" },
        { cmd: "makan 12.50 cash", desc: tr("Rekod perbelanjaan terus ke wallet/dompet tertentu.", "Record expense to a specific wallet/account."), example: "makan 12.50 cash" },
        { cmd: "petrol 50 tng @semalam", desc: tr("Rekod perbelanjaan dengan tarikh lepas (@semalam / @DDMMYYYY).", "Record expense with backdated tag (@yesterday / @DDMMYYYY)."), example: "petrol 50 tng @semalam" },
        { cmd: "Mgaji 2500", desc: tr("Rekod pendapatan gaji (prefix huruf M = Income / Masuk).", "Record salary income (prefix M = Income)."), example: "Mgaji 2500" },
        { cmd: "Mgaji 2500 maybank", desc: tr("Rekod pendapatan masuk ke dompet tertentu.", "Record income into a specific wallet."), example: "Mgaji 2500 maybank" },
      ],
    },
    budget: {
      title: tr("Command Pengurusan Bajet", "Budget Management Commands"),
      sub: tr("Tetapkan had bajet bulanan mengikut kategori dan pantau baki semasa.", "Set monthly category budget limits and monitor remaining allocations."),
      icon: Wallet,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      rows: [
        { cmd: "budget | bajet", desc: tr("Papar panduan ringkas command pengurusan bajet.", "Show budget command quick help."), example: "bajet" },
        { cmd: "budget set <kategori> <jumlah>", desc: tr("Set atau kemaskini had bajet kategori untuk bulan semasa.", "Set or update category budget for current month."), example: "budget set makanan 600" },
        { cmd: "budget set <kategori> <jumlah> @YYYY-MM", desc: tr("Set had bajet untuk bulan tertentu di masa hadapan atau lepas.", "Set budget for a specific target month."), example: "budget set makanan 600 @2026-09" },
        { cmd: "budget list", desc: tr("Lihat senarai semua bajet aktif bersama peratus penggunaan.", "View all active budgets with percentage utilized."), example: "budget list" },
        { cmd: "budget summary", desc: tr("Ringkasan perbandingan bajet vs perbelanjaan sebenar.", "Summary of overall budget vs actual spending."), example: "budget summary" },
        { cmd: "budget baki <kategori>", desc: tr("Semak baki peruntukan bajet yang tinggal bagi kategori berkenaan.", "Check remaining budget limit for a specific category."), example: "budget baki makanan" },
        { cmd: "budget delete <kategori>", desc: tr("Padam bajet kategori untuk kitaran bulan semasa.", "Delete a category budget allocation."), example: "budget delete makanan" },
      ],
    },
    inventory: {
      title: tr("Barang Saya & Inventori Rumah", "My Inventory & Items"),
      sub: tr("Simpan rekod letak mana — lokasi bilik, bekas simpanan, status, dan kuantiti.", "Find where your items are stored — rooms, boxes, status, and photos."),
      icon: Boxes,
      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      rows: [
        { cmd: "stuff help", desc: tr("Papar panduan lengkap command Barang Saya.", "Show complete inventory command guide."), example: "stuff help" },
        { cmd: "stuff <nama barang>", desc: tr("Tambah barang baru ke inventori peribadi secara pantas.", "Quickly add a new item to your personal inventory."), example: "stuff kabel hdmi" },
        { cmd: "stuff <nama> <lokasi/bekas>", desc: tr("Tambah barang terus ditugaskan ke lokasi atau bekas tertentu.", "Add an item directly into a storage location or box."), example: "stuff palam kuasa bilik stor" },
        { cmd: "tambah barang <nama> [N]", desc: tr("Tambah barang berserta bilangan kuantiti tertentu.", "Add item with a specific quantity count."), example: "tambah barang bateri AA 4" },
        { cmd: "stuff cari <kata>", desc: tr("Cari lokasi dan maklumat simpanan barang mengikut nama.", "Search stored items by keyword or name."), example: "stuff cari pasport" },
        { cmd: "tambah stor <nama>", desc: tr("Cipta lokasi stor / bilik simpanan baharu.", "Create a new storeroom / location."), example: "tambah stor Bilik Belakang" },
        { cmd: "tambah bekas <nama>", desc: tr("Cipta nama bekas / kotak simpanan baharu.", "Create a new storage box / container."), example: "tambah bekas Kotak Alat" },
      ],
    },
    debt: {
      title: tr("Tracker Hutang & Piutang", "Personal Debt Tracker"),
      sub: tr("Urus rekod wang yang dipinjam atau dipinjamkan kepada orang lain.", "Track money lent to and borrowed from friends or family."),
      icon: CreditCard,
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      rows: [
        { cmd: "lend <nama> <amaun>", desc: tr("Rekod wang yang anda pinjamkan kepada orang lain (orang hutang kita).", "Record money you lent to someone."), example: "lend Ali 50" },
        { cmd: "borrow <nama> <amaun>", desc: tr("Rekod pinjaman yang anda ambil daripada orang lain (kita hutang orang).", "Record money you borrowed from someone."), example: "borrow Ahmad 100" },
        { cmd: "pay <nama> <amaun>", desc: tr("Rekod bayaran balik hutang kepada atau daripada individu berkenaan.", "Record repayment towards the specified debt."), example: "pay Ahmad 50" },
        { cmd: "balance <nama>", desc: tr("Semak baki hutang semasa untuk individu tertentu.", "Check active debt balance with a specific person."), example: "balance Ali" },
        { cmd: "debt list", desc: tr("Papar senarai semua baki hutang dan piutang yang masih aktif.", "List all active debt and receivable balances."), example: "debt list" },
      ],
    },
    loan: {
      title: tr("Tracker Pinjaman & Ansuran (Loan)", "Loan Tracker & Monthly Dues"),
      sub: tr("Urus pinjaman kenderaan, perumahan, atau peribadi berserta baki bulan.", "Manage installment loans with automated monthly countdowns."),
      icon: CreditCard,
      color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      rows: [
        { cmd: "loanx list", desc: tr("Papar senarai pinjaman aktif berserta baki bulan dan amaun ansuran.", "List active loans with months remaining and payment dues."), example: "loanx list" },
        { cmd: "loanx add <nama> <jumlah> <bulanan>", desc: tr("Daftar pinjaman baharu berserta amaun bulanan untuk kiraan baki kitaran.", "Register a new loan with total amount and monthly installment."), example: "loanx add kereta 12000 500" },
        { cmd: "loanx pay <nama> <jumlah>", desc: tr("Bayar ansuran pinjaman dan rekod perbelanjaan secara automatik.", "Pay loan installment and record an expense transaction."), example: "loanx pay kereta 500" },
        { cmd: "loanx pay <nama> <jumlah> wallet <nama_wallet>", desc: tr("Bayar ansuran pinjaman ditolak daripada akaun/dompet tertentu.", "Pay loan installment from a specific account/wallet."), example: "loanx pay kereta 500 wallet maybank" },
      ],
    },
    subscription: {
      title: tr("Langganan Berulang (SUBX)", "Recurring Subscriptions (SUBX)"),
      sub: tr("Pantau perbelanjaan langganan bulanan seperti Netflix, Internet, atau Coway.", "Manage recurring subscriptions with automated due dates."),
      icon: CalendarClock,
      color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
      rows: [
        { cmd: "subx list", desc: tr("Papar semua langganan aktif, amaun, dan tarikh matang seterusnya.", "List all active subscriptions with due dates."), example: "subx list" },
        { cmd: "subx <nama> <jumlah> <day>HB", desc: tr("Daftar langganan bulanan baharu dengan tarikh matang (cth: 15HB).", "Register recurring subscription with monthly due day."), example: "SUBX ASTRO 89.90 15HB" },
        { cmd: "subx pay <nama> <jumlah> <wallet>", desc: tr("Bayar langganan dan rekod perbelanjaan terus ke dompet pilihan.", "Pay subscription and log expense transaction to chosen wallet."), example: "SUBX PAY ASTRO 89.90 TNG" },
      ],
    },
    transfer: {
      title: tr("Pindahan Antara Dompet / Akaun", "Inter-Wallet Transfers"),
      sub: tr("Pindahkan baki antara bank, e-wallet, atau wang tunai tanpa menjejaskan laporan perbelanjaan.", "Transfer funds between wallets without affecting expense reports."),
      icon: Repeat,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      rows: [
        { cmd: "transfer <jumlah> <wallet_A> <wallet_B>", desc: tr("Pindah amaun dari wallet sumber (A) ke wallet destinasi (B).", "Move amount from source wallet (A) to destination wallet (B)."), example: "transfer 100 maybank cash" },
        { cmd: "transfer <jumlah> dari <wallet_A> ke <wallet_B>", desc: tr("Format ayat Bahasa Melayu penuh yang lebih mudah dibaca.", "Readable natural sentence format."), example: "transfer 50 dari maybank ke tng" },
        { cmd: "pindah <jumlah> <wallet_A> <wallet_B>", desc: tr("Format ringkas Bahasa Melayu.", "Malay keyword shorthand."), example: "pindah 35 cash tabung" },
      ],
    },
    group: {
      title: tr("Penggunaan Dalam Group WhatsApp", "WhatsApp Group Mode"),
      sub: tr("Rekod transaksi bersama atau semak ringkasan dalam kumpulan dengan trigger khas.", "Log shared group expenses and check balances safely."),
      icon: MessageSquare,
      color: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
      rows: [
        { cmd: "bd makan 12.50", desc: tr("Rekod perbelanjaan dalam group menggunakan trigger prefix 'bd'.", "Record expense inside group chat with prefix trigger 'bd'."), example: "bd makan 12.50" },
        { cmd: "bd summary", desc: tr("Semak ringkasan perbelanjaan dalam group dengan perlindungan privasi.", "Check summary inside group with privacy protection."), example: "bd summary" },
        { cmd: "bd checkwallet", desc: tr("Semak baki dompet anda secara peribadi (hanya dihantar ke PM jika dikonfigurasikan).", "Check wallet balance from group chat."), example: "bd checkwallet" },
      ],
    },
    places: {
      title: tr("Tempat Saya (My Places)", "My Places (Location Pins)"),
      sub: tr("Simpan dan susun lokasi pin penting seperti rumah, kedai kegemaran, atau bengkel.", "Save and organize important GPS location pins and categories."),
      icon: MapPin,
      color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      rows: [
        { cmd: "pinx", desc: tr("Papar panduan ringkas command Tempat Saya.", "Show My Places quick command guide."), example: "pinx" },
        { cmd: "pinx <tajuk> <kategori> @here", desc: tr("Simpan lokasi GPS semasa. Hantar pin lokasi di WhatsApp/Telegram dahulu, kemudian balas dengan command ini.", "Save current location pin. Send location pin first, then reply with this command."), example: "pinx rumah mak family @here" },
        { cmd: "pinx cari <nama>", desc: tr("Cari lokasi yang disimpan mengikut kata kunci nama.", "Search saved places by name keyword."), example: "pinx cari bengkel" },
      ],
    },
    split: {
      title: tr("Split Bill & Kongsi Kos", "Split Bills & Shared Costs"),
      sub: tr("Bahagikan bil besar secara automatik daripada imej resit atau kemasukan manual.", "Split large restaurant/grocery bills easily with friends from receipts."),
      icon: CreditCard,
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      rows: [
        { cmd: "makan tng split 6", desc: tr("Hantar gambar resit, kemudian balas dengan command ini untuk bahagi sama rata (cth: 6 orang).", "Send receipt photo, then reply with command to split evenly."), example: "makan tng split 6" },
        { cmd: "splitx tng", desc: tr("Hantar screenshot resit bayaran balik rakan untuk rekod reimbursement (tambah dompet tanpa tambah income).", "Send repayment screenshot to record reimbursement."), example: "splitx tng" },
        { cmd: "splitx create <tajuk> <jumlah> <orang>", desc: tr("Cipta rekod split bill manual tanpa memerlukan gambar resit.", "Create manual split bill without receipt image."), example: "splitx create dinner 120 4" },
        { cmd: "splitx list", desc: tr("Papar senarai semua split bill yang masih belum selesai dikutip.", "List all active, uncollected split bills."), example: "splitx list" },
      ],
    },
  }

  /* ── Search & Filter Logic ── */
  const searchLower = searchQuery.trim().toLowerCase()

  const displayedSections = useMemo(() => {
    let list = Object.keys(commandsBySection)

    if (activeSectionId !== "all") {
      list = list.filter((id) => id === activeSectionId)
    }

    if (searchLower) {
      list = list.filter((id) => {
        const sec = commandsBySection[id]
        return sec.rows.some(
          (r) =>
            r.cmd.toLowerCase().includes(searchLower) ||
            r.desc.toLowerCase().includes(searchLower) ||
            r.example.toLowerCase().includes(searchLower) ||
            sec.title.toLowerCase().includes(searchLower)
        )
      })
    }

    return list
  }, [activeSectionId, searchLower, commandsBySection])

  const totalCommandsCount = useMemo(() => {
    return Object.values(commandsBySection).reduce((n, s) => n + s.rows.length, 0)
  }, [commandsBySection])

  const renderSectionBlock = (id: string) => {
    const sec = commandsBySection[id]
    const Icon = sec.icon
    const rows = searchLower
      ? sec.rows.filter(
          (r) =>
            r.cmd.toLowerCase().includes(searchLower) ||
            r.desc.toLowerCase().includes(searchLower) ||
            r.example.toLowerCase().includes(searchLower)
        )
      : sec.rows

    if (rows.length === 0 && searchLower) return null

    return (
      <div key={id} className="space-y-3.5">
        {/* Section Header */}
        <div className="flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl border shrink-0",
                sec.color
              )}
            >
              <Icon size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-extrabold text-[var(--text)] truncate">
                {sec.title}
              </h2>
              <p className="text-[0.7rem] md:text-xs text-[var(--muted)] truncate">
                {sec.sub}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[0.68rem] font-bold text-[var(--muted)] shrink-0">
            {rows.length} {tr("arahan", "cmds")}
          </span>
        </div>

        {/* Command Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((row) => (
            <CommandCard
              key={row.cmd}
              cmd={row.cmd}
              desc={row.desc}
              example={row.example}
              exLabel={exLabel}
              category={sec.title.split(" ")[0]}
              categoryColor={sec.color}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-20 md:space-y-0 md:pb-0">
      {/* ── Mobile Layout ── */}
      <div className="space-y-5 md:hidden">
        <MobilePageHeader
          title={tr("Panduan Command Bot", "Bot Command Guide")}
          fallbackHref={`/${sessionId}`}
        />

        <section className="px-1 space-y-4">
          {/* Mobile Search & Info Banner */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Sparkles size={14} />
              </div>
              <p className="text-xs font-bold text-[var(--text)]">
                {tr("Koleksi Arahan WhatsApp & Telegram", "WhatsApp & Telegram Commands")}
              </p>
            </div>

            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr("Cari arahan (cth: 'makan', 'bajet', 'stuff')…", "Search commands (e.g. 'makan', 'budget')…")}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] py-2 pl-8 pr-8 text-xs text-[var(--text)] placeholder-[var(--input-placeholder)] outline-none focus:border-[var(--input-focus)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] p-0.5"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Horizontal Categories Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveSectionId("all")}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition active:scale-95",
                activeSectionId === "all"
                  ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)] font-bold shadow-xs"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <Layers size={13} />
              <span>{tr("Semua", "All")}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[0.65rem] font-bold",
                  activeSectionId === "all"
                    ? "bg-[var(--bg)] text-[var(--text)]"
                    : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                )}
              >
                {totalCommandsCount}
              </span>
            </button>

            {sectionList.map((s) => {
              const isActive = activeSectionId === s.id
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSectionId(s.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition active:scale-95",
                    isActive
                      ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)] font-bold shadow-xs"
                      : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <Icon size={13} />
                  <span>{s.label}</span>
                </button>
              )
            })}
          </div>

          {/* Mobile Content List */}
          <div className="space-y-6">
            {displayedSections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                  <Search size={18} />
                </div>
                <h3 className="mt-3 text-xs font-bold text-[var(--text)]">
                  {tr("Tiada arahan sepadan", "No matching commands")}
                </h3>
                <p className="mt-1 text-[0.7rem] text-[var(--muted)]">
                  {tr("Sila cuba kata carian yang berbeza atau pilih kategori lain.", "Try a different search term or category.")}
                </p>
              </div>
            ) : (
              displayedSections.map((id) => renderSectionBlock(id))
            )}
          </div>
        </section>
      </div>

      {/* ── Desktop Layout ── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Panduan Arahan & Command Bot", "Bot Command & Syntax Guide")}
          homeHref={`/${sessionId}`}
          breadcrumbs={[
            { label: tr("Tetapan", "Settings"), href: `/${sessionId}/settings` },
            { label: tr("Command Bot", "Bot Commands") },
          ]}
        />

        <DesktopPageBody className="space-y-6 pt-6">
          {/* Top Hero Banner */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Sparkles size={13} />
                  <span>{tr("Panduan Lengkap Sintaks Bot", "Complete Bot Syntax Reference")}</span>
                </div>
                <h1 className="text-xl lg:text-2xl font-black tracking-tight text-[var(--text)]">
                  {tr("Senarai Penuh Arahan WhatsApp & Telegram", "WhatsApp & Telegram Bot Commands")}
                </h1>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {tr(
                    "Gunakan arahan teks pantas di WhatsApp atau Telegram untuk merekod perbelanjaan, mengurus bajet, mencari barang, menjejak hutang, dan membayar ansuran tanpa membuka web.",
                    "Use quick text commands in WhatsApp or Telegram to log expenses, manage budgets, track debts, and handle loans instantly without opening the browser."
                  )}
                </p>
              </div>

              {/* Quick Metrics */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-center min-w-[90px]">
                  <div className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
                    {tr("Kategori", "Categories")}
                  </div>
                  <div className="text-xl font-black text-[var(--text)] mt-0.5">
                    {sectionList.length}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3 text-center min-w-[90px]">
                  <div className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
                    {tr("Arahan", "Commands")}
                  </div>
                  <div className="text-xl font-black text-emerald-500 mt-0.5">
                    {totalCommandsCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Search Bar */}
            <div className="relative mt-5 pt-4 border-t border-[var(--divider)]">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr("Cari sebarang arahan atau penerangan (cth: 'makan', 'lend', 'stuff', 'budget', 'subx')…", "Search any command syntax or keyword (e.g. 'makan', 'lend', 'stuff', 'budget')…")}
                className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] py-2.5 pl-10 pr-9 text-xs md:text-sm text-[var(--text)] placeholder-[var(--input-placeholder)] outline-none transition focus:border-[var(--input-focus)] focus:ring-1 focus:ring-[var(--input-focus)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] p-1 rounded-full"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Dual-Pane Desktop Layout */}
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[280px_1fr] gap-6 items-start">
            {/* Left Sidebar Category Navigation */}
            <aside className="sticky top-20 flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-sm">
              <div className="border-b border-[var(--divider)] pb-2.5 mb-2 px-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                  {tr("Kategori Arahan", "Command Categories")}
                </p>
              </div>

              <nav className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
                {/* All Categories Option */}
                <button
                  type="button"
                  onClick={() => setActiveSectionId("all")}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition active:scale-[0.98]",
                    activeSectionId === "all"
                      ? "bg-[var(--text)] text-[var(--bg)] font-bold shadow-xs"
                      : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Layers
                      size={15}
                      className={cn(
                        "shrink-0",
                        activeSectionId === "all"
                          ? "text-[var(--bg)]"
                          : "text-[var(--muted)] group-hover:text-[var(--text)]"
                      )}
                    />
                    <span className="truncate">{tr("Semua Kategori", "All Categories")}</span>
                  </div>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.2 text-[9px] font-bold",
                      activeSectionId === "all"
                        ? "bg-[var(--bg)] text-[var(--text)]"
                        : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                    )}
                  >
                    {totalCommandsCount}
                  </span>
                </button>

                {/* Specific Categories */}
                {sectionList.map((s) => {
                  const isActive = activeSectionId === s.id
                  const Icon = s.icon
                  const count = commandsBySection[s.id]?.rows.length || 0
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSectionId(s.id)}
                      className={cn(
                        "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition active:scale-[0.98]",
                        isActive
                          ? "bg-[var(--text)] text-[var(--bg)] font-bold shadow-xs"
                          : "text-[var(--text)] hover:bg-[var(--surface-tint)]"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          size={15}
                          className={cn(
                            "shrink-0",
                            isActive
                              ? "text-[var(--bg)]"
                              : "text-[var(--muted)] group-hover:text-[var(--text)]"
                          )}
                        />
                        <span className="truncate">{s.label}</span>
                      </div>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.2 text-[9px] font-bold",
                          isActive
                            ? "bg-[var(--bg)] text-[var(--text)]"
                            : "bg-[var(--surface-tint-strong)] text-[var(--muted)]"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </nav>
            </aside>

            {/* Right Main Content */}
            <main className="space-y-8 min-w-0">
              {displayedSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                    <Search size={22} />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-[var(--text)]">
                    {tr("Tiada arahan dijumpai", "No commands found")}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted)] max-w-sm mx-auto">
                    {tr(
                      "Tiada padanan untuk carian anda. Sila kosongkan carian atau pilih kategori lain.",
                      "No matching commands found. Please clear the search or choose another category."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("")
                      setActiveSectionId("all")
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-tint-strong)] transition"
                  >
                    <span>{tr("Set Semula Carian", "Reset Filter")}</span>
                  </button>
                </div>
              ) : (
                displayedSections.map((id) => renderSectionBlock(id))
              )}
            </main>
          </div>
        </DesktopPageBody>
      </div>
    </div>
  )
}
