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
          version: "v2026.09.27",
          date: "27 Sep 2026",
          title: "Home Baharu, Loceng Pengumuman & Rupa Segar",
          items: [
            "Home baharu untuk telefon: jumlah baki di kiri, butang mata sebelah amaun, dan tekan amaun (atau \"Balance Info ›\") untuk graf bulanan & harian.",
            "Dompet utama dipapar di home ikut warna dompet sendiri. Tekan untuk buka semua dompet, tekan lama & seret untuk susun semula. 12 pilihan warna dompet baharu.",
            "Loceng pengumuman menggantikan banner: sejarah pengumuman dengan tab Semua / Info / Amaran / Penting, dan halaman baca penuh.",
            "Semua popup sheet kini satu rupa yang sama, lebih bersih.",
            "Tarik untuk segar semula (pull to refresh) kini ada di semua halaman, dengan logo MyPeribadi.",
            "Topbar halaman baharu: tajuk besar yang mengecil bila skrol.",
            "Dark mode: kad hero di halaman seperti Bajet, Hutang, Pinjaman dan Langganan kini cerah supaya lebih jelas.",
            "Halaman Kategori dan Request & Bantuan direka semula — senarai lebih kemas, jumlah bulan ini untuk setiap kategori.",
            "Butiran transaksi dibuka lebih pantas dan senarai transaksi dimuat 10 demi 10. App juga dimuat lebih laju selepas kali pertama.",
          ],
        },
        {
          version: "v2026.09.20",
          date: "20 Sep 2026",
          title: "Bajet Dibawa ke Bulan Depan, Nota Transaksi & Event",
          items: [
            "Bajet bulan ini kini dibawa ke bulan seterusnya secara automatik.",
            "Command bajet boleh kenal kategori melalui keyword, dan keyword kini dipadan tepat supaya kategori yang betul dipilih.",
            "Nota transaksi kini dipapar dalam senarai transaksi dan senarai event.",
            "Halaman Event direka semula: foto dan jumlah belanja di atas, transaksi dikumpul ikut kategori, tanda/nyahtanda transaksi tanpa hilang baris.",
            "Langganan kini dikumpul ikut tarikh due, dengan kedudukan setiap kitaran bayaran.",
            "Butiran transaksi direka semula: nama peniaga dan amaun di atas, gaya resit untuk senarai item.",
          ],
        },
        {
          version: "v2026.09.07",
          date: "7 Sep 2026",
          title: "Kesihatan, Cukai, Penyesuaian Bank & Suara",
          items: [
            "Kesihatan (Beta): rekod BMI dan larian dengan run tracker serta peta.",
            "Cukai: pautkan transaksi kepada pelepasan cukai terus dari butiran transaksi, dengan amaran pendapatan berganda.",
            "Penyesuaian Bank: pilih dompet, muat naik penyata bank, dan sistem baca transaksinya untuk dipadan.",
            "Transaksi suara: sebut amaun dalam BM atau English, semak dalam sheet sebelum simpan.",
            "Pilih Halaman Utama dalam Tetapan — app terus buka ke skrin pilihan anda (contoh Chat).",
            "Chat kini papar format WhatsApp/Telegram (*tebal*, _condong_, ~coret~, `kod`) dan boleh lampir gambar dari kamera atau galeri.",
            "Kongsi screenshot atau notifikasi bank ke app — ia masuk terus ke chat untuk dibaca bot.",
          ],
        },
        {
          version: "v2026.08.12",
          date: "12 Ogos 2026",
          title: "Barang Saya (Inventori Peribadi)",
          items: [
            "Barang Saya: simpan senarai barangan peribadi dengan lokasi, bekas, kuantiti, status, dan foto.",
            "Buka Menu → Personal → Barang Saya untuk tambah, cari, pindah, dan urus status setiap item.",
            "Command bot: `stuff <nama barang>` untuk tambah, `stuff cari <kata>` untuk cari, `tambah stor <lokasi>` dan `tambah bekas <nama>` untuk cipta lokasi/bekas.",
            "Tambah barang dengan foto: hantar gambar bersama caption `stuff <nama barang>` dari WhatsApp, Telegram, atau webchat — foto dimuat naik ke storan awan.",
            "Lokasi & bekas boleh dibuat terus dari halaman Barang Saya atau melalui bot.",
          ],
        },
        {
          version: "v2026.08.10",
          date: "10 Ogos 2026",
          title: "Split Bill & Command OCR Split",
          items: [
            "Split Bill: kongsi satu bil besar kepada beberapa orang. Bahagian anda dicatat sebagai expense, baki kutip jadi balance split — buka Menu → Personal → Split Bill.",
            "Command baharu dari gambar resit: hantar resit, kemudian taip `makan tng split 6` untuk kongsi bil 6 orang dengan dompet TOUCH & GO. Bahagian anda = jumlah / 6, baki = jumlah - bahagian.",
            "Rekod bayaran balik: hantar screenshot bayaran, kemudian taip `splitx tng` — jumlah masuk sebagai reimbursement (tambah baki wallet, tidak dikira sebagai income).",
            "Command lama `splitx` / `splitx create` / `splitx list` / `splitx pay` / `splitx done` masih disokong.",
            "Reimbursement kini tidak termasuk dalam laporan income, dashboard, dan budget — hanya menambah baki wallet dan dipaparkan dalam sejarah transaksi.",
            "Halaman Split Bill di portal untuk lihat, bayar, dan padam split. Ciri kongsi kos berkaitan: BNPL dan MyEvent tersedia di menu masing-masing.",
          ],
        },
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
          version: "v2026.09.27",
          date: "27 September 2026",
          title: "New Home, Announcement Bell & a Fresh Look",
          items: [
            "A new home for phones: total balance on the left, the eye button beside the amount, and tap the amount (or \"Balance Info ›\") for monthly and daily charts.",
            "Your top wallet shows on the home in its own colour. Tap it for all wallets; press and hold to drag them into a new order. Twelve new wallet colours.",
            "An announcement bell replaces the banner: announcement history with All / Info / Warning / Alert tabs and a full reading page.",
            "Every popup sheet now shares one cleaner look.",
            "Pull to refresh now works on every page, with the MyPeribadi logo.",
            "A new page top bar: a large title that shrinks as you scroll.",
            "Dark mode: hero cards on pages such as Budget, Debt, Loan and Subscription are now light so they stand out.",
            "Categories and Support & Requests are redesigned, with tidier lists and this month's amount for each category.",
            "Transaction details open faster and the transaction list loads 10 at a time. The app also loads quicker after the first visit.",
          ],
        },
        {
          version: "v2026.09.20",
          date: "20 September 2026",
          title: "Budgets Carry Over, Transaction Notes & Events",
          items: [
            "This month's budgets now carry over to the next month automatically.",
            "Budget commands recognise categories by keyword, and keywords now match exactly so the right category is picked.",
            "Transaction notes now show on the transaction list and event lists.",
            "Events are redesigned: photo and money spent up top, transactions grouped by category, and tick/untick without losing rows.",
            "Subscriptions are grouped by what is due, showing where each billing cycle stands.",
            "Transaction details are redesigned: merchant and amount up top, with a receipt-style item list.",
          ],
        },
        {
          version: "v2026.09.07",
          date: "7 September 2026",
          title: "Health, Tax, Bank Reconciliation & Voice",
          items: [
            "Health (Beta): track BMI and runs with a run tracker and map.",
            "Tax: link a transaction to a tax relief straight from its details, with a duplicate-income warning.",
            "Bank Reconciliation: pick a wallet, upload a bank statement, and its transactions are read for matching.",
            "Voice transactions: say the amount in Malay or English and review it in a sheet before saving.",
            "Choose your Main Page in Settings — the app opens straight to the screen you pick (e.g. Chat).",
            "Chat now renders WhatsApp/Telegram formatting (*bold*, _italic_, ~strike~, `code`) and can attach photos from the camera or gallery.",
            "Share a screenshot or bank notification to the app and it lands in chat for the bot to read.",
          ],
        },
        {
          version: "v2026.08.12",
          date: "12 August 2026",
          title: "My Inventory (Personal Items)",
          items: [
            "My Inventory: keep a list of your personal items with location, container, quantity, status, and photo.",
            "Open Menu → Personal → My Inventory to add, search, move, and manage the status of each item.",
            "Bot commands: `stuff <item name>` to add, `stuff cari <keyword>` to search, `tambah stor <location>` and `tambah bekas <name>` to create locations/containers.",
            "Add items with a photo: send an image with the `stuff <item name>` caption from WhatsApp, Telegram, or webchat — the photo is uploaded to cloud storage.",
            "Locations & containers can be created from the My Inventory page or via the bot.",
          ],
        },
        {
          version: "v2026.08.10",
          date: "10 Aug 2026",
          title: "Split Bill & OCR Split Commands",
          items: [
            "Split Bill: split one big bill among several people. Your share is recorded as expense, the collectable share becomes split balance — open Menu → Personal → Split Bill.",
            "New commands from a receipt image: send the receipt, then type `makan tng split 6` to split a 6-person bill with the TOUCH & GO wallet. Your share = amount / 6, collectable = amount - your share.",
            "Record repayments: send the payment screenshot, then type `splitx tng` — the amount comes in as reimbursement (adds to wallet balance, not counted as income).",
            "Legacy commands `splitx` / `splitx create` / `splitx list` / `splitx pay` / `splitx done` are still supported.",
            "Reimbursements are now excluded from income reports, dashboard, and budget — they only add to wallet balance and appear in transaction history.",
            "Split Bill page in the portal to view, pay, and delete splits. Related cost-sharing features: BNPL and MyEvent are available under their own menus.",
          ],
        },
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
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-amber-500/12 via-[var(--card)] to-[var(--card)] p-5 md:p-6">
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
