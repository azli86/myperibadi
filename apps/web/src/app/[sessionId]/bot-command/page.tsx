"use client"

import React, { useState } from "react"
import { useParams } from "next/navigation"
import { Bot, Search } from "lucide-react"
import { useLang } from "@/lib/lang"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"

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

const CATEGORIES = [
  { id: "general", label: "Bot General" },
  { id: "budget", label: "Budget" },
  { id: "inventory", label: "Inventory" },
  { id: "debt", label: "Debt" },
  { id: "loan", label: "Loan" },
  { id: "subscription", label: "Subscription" },
  { id: "transfer", label: "Transfer" },
  { id: "group", label: "Group" },
  { id: "places", label: "Places" },
  { id: "split", label: "Split Bill" },
] as const

type CatId = typeof CATEGORIES[number]["id"]

export default function BotCommandPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useLang()
  const [q, setQ] = useState("")
  const [activeCat, setActiveCat] = useState<CatId | "all">("all")

  function tr(en: string, ms: string) { return lang === "BM" ? ms : en }
  const exLabel = lang === "BM" ? "Contoh" : "Example"
  const isBM = lang === "BM"

  const commands: { cmd: string; desc: string; example: string; category: string; catId: CatId }[] = [
    // General
    { cmd: "help", desc: tr("Tunjuk mesej bantuan ringkas bot.", "Shows the bot help message."), example: "help", category: "Bot General", catId: "general" },
    { cmd: "summary", desc: tr("Ringkasan bulan semasa (pendapatan, perbelanjaan, baki bersih).", "Current month summary (income, expense, net)."), example: "summary", category: "Bot General", catId: "general" },
    { cmd: "list", desc: tr("Papar 5 transaksi terbaru anda.", "Shows your latest 5 transactions."), example: "list", category: "Bot General", catId: "general" },
    { cmd: "checkwallet", desc: tr("Papar baki setiap wallet + jumlah keseluruhan.", "Shows each wallet balance + total balance."), example: "checkwallet", category: "Bot General", catId: "general" },
    { cmd: "semak wallet", desc: tr("Sama seperti checkwallet, versi Bahasa Melayu.", "Same as checkwallet in BM."), example: "semak wallet", category: "Bot General", catId: "general" },
    { cmd: "lang en | lang bm", desc: tr("Tukar bahasa respon bot.", "Switch bot reply language."), example: "lang en", category: "Bot General", catId: "general" },
    // Budget
    { cmd: "budget | bajet", desc: tr("Tunjuk bantuan command budget.", "Show budget command help."), example: "bajet", category: "Budget", catId: "budget" },
    { cmd: "budget set <kategori> <jumlah>", desc: tr("Set atau kemaskini budget kategori untuk bulan semasa.", "Set or update category budget for current month."), example: "budget set makanan 600", category: "Budget", catId: "budget" },
    { cmd: "budget set <kategori> <jumlah> @YYYY-MM", desc: tr("Set budget untuk bulan tertentu.", "Set budget for a specific month."), example: "budget set makanan 600 @2026-04", category: "Budget", catId: "budget" },
    { cmd: "budget list", desc: tr("Lihat senarai budget aktif.", "View active budgets."), example: "budget list", category: "Budget", catId: "budget" },
    { cmd: "budget summary", desc: tr("Ringkasan penggunaan budget bulanan semua kategori.", "Monthly budget summary for all categories."), example: "budget summary", category: "Budget", catId: "budget" },
    { cmd: "budget baki <kategori>", desc: tr("Semak baki budget kategori tertentu.", "Check budget balance for a specific category."), example: "budget baki makanan", category: "Budget", catId: "budget" },
    { cmd: "budget delete <kategori>", desc: tr("Padam budget kategori untuk bulan semasa.", "Delete a category budget."), example: "budget delete makanan", category: "Budget", catId: "budget" },
    // Inventory
    { cmd: "stuff help", desc: tr("Papar panduan ringkas command Barang Saya.", "Show quick inventory command guide."), example: "stuff help", category: "Inventory", catId: "inventory" },
    { cmd: "stuff <nama barang>", desc: tr("Tambah barang ke inventori secara pantas.", "Add an item to inventory quickly."), example: "stuff kabel hdmi", category: "Inventory", catId: "inventory" },
    { cmd: "stuff <nama> <lokasi/bekas>", desc: tr("Tambah barang terus ke lokasi atau bekas simpanan.", "Add an item directly to a location or box."), example: "stuff kotak bilik stor", category: "Inventory", catId: "inventory" },
    { cmd: "tambah barang <nama> [N]", desc: tr("Tambah barang dengan kuantiti tertentu.", "Add item with specific quantity."), example: "tambah barang bateri 3", category: "Inventory", catId: "inventory" },
    { cmd: "stuff cari <kata>", desc: tr("Cari barang mengikut nama dalam inventori.", "Search items by name in inventory."), example: "stuff cari kabel", category: "Inventory", catId: "inventory" },
    { cmd: "tambah stor <nama>", desc: tr("Cipta lokasi stor baharu.", "Create a new storeroom / location."), example: "tambah stor Ruang Tamu", category: "Inventory", catId: "inventory" },
    { cmd: "tambah bekas <nama>", desc: tr("Cipta bekas / kotak baharu.", "Create a new box / container."), example: "tambah bekas Kotak A", category: "Inventory", catId: "inventory" },
    // Debt
    { cmd: "lend <nama> <amaun>", desc: tr("Rekod orang hutang kita.", "Record money someone owes you."), example: "lend Ali 50", category: "Debt", catId: "debt" },
    { cmd: "borrow <nama> <amaun>", desc: tr("Rekod kita hutang orang.", "Record money you owe someone."), example: "borrow Ahmad 100", category: "Debt", catId: "debt" },
    { cmd: "pay <nama> <amaun>", desc: tr("Rekod bayaran balik hutang.", "Record repayment to that person."), example: "pay Ahmad 30", category: "Debt", catId: "debt" },
    { cmd: "balance <nama>", desc: tr("Semak baki hutang untuk individu tertentu.", "Check debt balance for one person."), example: "balance Ali", category: "Debt", catId: "debt" },
    { cmd: "debt list", desc: tr("Senarai semua baki hutang aktif (lend + borrow).", "List all active debt balances."), example: "debt list", category: "Debt", catId: "debt" },
    // Loan
    { cmd: "loanx list", desc: tr("Senarai loan aktif bersama baki bulan.", "List active loans with months remaining."), example: "loanx list", category: "Loan", catId: "loan" },
    { cmd: "loanx add <nama> <jumlah> <bulanan>", desc: tr("Tambah loan baru dengan amaun bulanan untuk kiraan baki bulan.", "Add new loan with monthly amount for countdown."), example: "loanx add kereta 12000 500", category: "Loan", catId: "loan" },
    { cmd: "loanx pay <nama> <jumlah>", desc: tr("Bayar ansuran loan & rekod expense.", "Pay loan & record expense transaction."), example: "loanx pay kereta 500", category: "Loan", catId: "loan" },
    { cmd: "loanx pay <nama> <jumlah> wallet <nama_wallet>", desc: tr("Bayar loan daripada wallet tertentu.", "Pay loan from specific wallet."), example: "loanx pay kereta 500 wallet maybank", category: "Loan", catId: "loan" },
    // Subscription
    { cmd: "subx <nama> <jumlah> <day>HB", desc: tr("Simpan langganan bulanan berserta tarikh due.", "Save recurring monthly subscription with due day."), example: "SUBX ASTRO 89.90 15HB", category: "Subscription", catId: "subscription" },
    { cmd: "subx pay <nama> <jumlah> <wallet>", desc: tr("Bayar langganan & rekod transaksi automatik ke wallet pilihan.", "Pay subscription & record expense transaction to selected wallet."), example: "SUBX PAY ASTRO 89.90 TNG", category: "Subscription", catId: "subscription" },
    // Transfer
    { cmd: "transfer <jumlah> <wallet_A> <wallet_B>", desc: tr("Pindah amaun dari wallet A ke wallet B.", "Move amount from wallet A to wallet B."), example: "transfer 100 maybank cash", category: "Transfer", catId: "transfer" },
    { cmd: "transfer <jumlah> dari <wallet_A> ke <wallet_B>", desc: tr("Format ayat penuh yang lebih mudah dibaca.", "Readable sentence format."), example: "transfer 50 dari maybank ke cash", category: "Transfer", catId: "transfer" },
    { cmd: "pindah <jumlah> <wallet_A> <wallet_B>", desc: tr("Format Bahasa Melayu.", "Malay keyword version."), example: "pindah 35 cash tabung", category: "Transfer", catId: "transfer" },
    // Group
    { cmd: "bd makan 12.50", desc: tr("Rekod transaksi dalam group menggunakan trigger prefix.", "Record expense inside group with trigger prefix."), example: "bd makan 12.50", category: "Group", catId: "group" },
    { cmd: "bd summary", desc: tr("Semak ringkasan dalam group dengan perlindungan privasi.", "Check summary inside group with privacy protection."), example: "bd summary", category: "Group", catId: "group" },
    // Places
    { cmd: "pinx", desc: tr("Papar panduan command My Places.", "Show My Places command guide."), example: "pinx", category: "Places", catId: "places" },
    { cmd: "pinx <tajuk> <kategori> @here", desc: tr("Simpan pin lokasi semasa. Hantar location pin dahulu, kemudian taip command ini.", "Save current location pin. Send location pin first, then command."), example: "pinx rumah mak family @here", category: "Places", catId: "places" },
    // Split Bill
    { cmd: "makan tng split 6", desc: tr("Buat split untuk resit terakhir yang dihantar.", "Create a split from the last receipt image sent."), example: "makan tng split 6", category: "Split Bill", catId: "split" },
    { cmd: "splitx tng", desc: tr("Rekod bayaran balik daripada screenshot pembayaran.", "Record repayment with payment screenshot."), example: "splitx tng", category: "Split Bill", catId: "split" },
    { cmd: "splitx create <tajuk> <jumlah> <orang>", desc: tr("Cipta split manual tanpa gambar resit.", "Create split manually without receipt."), example: "splitx create dinner 66 6", category: "Split Bill", catId: "split" },
    { cmd: "splitx list", desc: tr("Lihat senarai split bill yang masih aktif.", "List active split bills."), example: "splitx list", category: "Split Bill", catId: "split" },
  ]

  const filtered = commands.filter((c) => {
    const matchCat = activeCat === "all" || c.catId === activeCat
    const qq = q.trim().toLowerCase()
    const matchQ = !qq || c.cmd.toLowerCase().includes(qq) || c.desc.toLowerCase().includes(qq) || c.example.toLowerCase().includes(qq)
    return matchCat && matchQ
  })

  const content = (
    <>
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("Cari command…", "Search commands…")}
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-3 pl-10 pr-4 text-sm font-medium text-[var(--text)] outline-none transition focus:border-[var(--text)]/40"
        />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCat("all")}
          className={cnCat(activeCat === "all")}
        >
          {tr("Semua", "All")}
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" onClick={() => setActiveCat(c.id)} className={cnCat(activeCat === c.id)}>
            {tr(c.label === "Split Bill" ? "Split Bil" : c.label, c.label)}
          </button>
        ))}
      </div>

      {/* Result count */}
      <p className="text-xs text-[var(--muted)]">
        {filtered.length} {tr("arahan", "commands")}
      </p>

      {/* Commands grid */}
      <div className="grid grid-cols-1 gap-3">
        {filtered.map((c) => (
          <CommandCard key={c.cmd} cmd={c.cmd} desc={c.desc} example={c.example} exLabel={exLabel} category={c.category} />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">
            {tr("Tiada command dijumpai.", "No commands found.")}
          </p>
        )}
      </div>
    </>
  )

  return (
    <div className="min-h-screen">
      <div className="md:hidden">
        <MobilePageHeader title={tr("Command Bot", "Bot Commands")} fallbackHref={`/${sessionId}`} />
        <div className="space-y-4 px-1 pt-1">{content}</div>
      </div>
      <div className="hidden md:block">
        <DesktopPageHeader title={tr("Command Bot", "Bot Commands")} homeHref={`/${sessionId}`} />
        <DesktopPageBody className="space-y-5">{content}</DesktopPageBody>
      </div>
    </div>
  )

  function cnCat(active: boolean) {
    return (
      "rounded-full border px-3.5 py-1.5 text-xs font-bold transition active:scale-95 " +
      (active
        ? "border-transparent bg-[var(--text)] text-[var(--bg)] shadow-sm"
        : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]")
    )
  }
}
