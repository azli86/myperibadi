"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Check, Info, Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { DesktopPageBody, DesktopPageHeader, MobilePageHeader } from "@/components/layout/PageHeader"
import { AppSheet } from "@/components/ui/AppSheet"
import { HelpBlock, HelpCommands, HelpNote, HelpStep } from "@/components/ui/HelpParts"
import { ModenHero, ModenHeroIconButton } from "@/components/ui/ModenHero"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"

type Item = { id: number; name: string; quantity: string | null; note: string | null; done: boolean }
type Overview = { items: Item[]; open_count: number; done_count: number }

export default function ShoppingListPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const { showAlert, alertModal } = usePageAlert(lang)

  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | "add" | "clear" | null>(null)
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = getAccessToken()
    const res = await fetch(`/api${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    return { res, body: await res.json().catch(() => null) }
  }, [])

  const load = useCallback(async () => {
    try {
      const { res, body } = await request("/shopping")
      if (res.ok) setData(body as Overview)
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    void load()
  }, [load])

  async function mutate(key: number | "add" | "clear", path: string, method: string, payload?: unknown) {
    setBusy(key)
    try {
      const { res, body } = await request(path, { method, body: payload !== undefined ? JSON.stringify(payload) : undefined })
      if (!res.ok) {
        showAlert(tr("Tidak disimpan", "Not saved"), shoppingError(body?.detail, isBm), "error")
        return false
      }
      setData(body as Overview)
      return true
    } finally {
      setBusy(null)
    }
  }

  async function addItem(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (await mutate("add", "/shopping/items", "POST", { name: trimmed, quantity: quantity.trim() || null })) {
      setName("")
      setQuantity("")
      nameRef.current?.focus()
    }
  }

  const todo = data?.items.filter((i) => !i.done) || []
  const bought = data?.items.filter((i) => i.done) || []

  const header = (
    <>
      <div className="lg:hidden">
        <MobilePageHeader title={tr("Senarai Beli", "Shopping List")} fallbackHref={`/${sessionId}`} />
      </div>
      <DesktopPageHeader className="hidden lg:block" title={tr("Senarai Beli", "Shopping List")} homeHref={`/${sessionId}`} />
    </>
  )

  return (
    <div className="pb-24 lg:pb-0">
      {header}
      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        <ModenHero
          label={
            <>
              <ShoppingCart size={16} />
              {tr("Perlu dibeli", "To buy")}
            </>
          }
          actions={
            <ModenHeroIconButton onClick={() => setHelpOpen(true)} aria-label={tr("Cara guna", "How to use")} aria-haspopup="dialog">
              <Info size={18} />
            </ModenHeroIconButton>
          }
          currency={null}
          amount={loading ? <Loader2 className="animate-spin" size={28} /> : tr(`${todo.length} item`, `${todo.length} item${todo.length === 1 ? "" : "s"}`)}
          amountSize="clamp(1.9rem, 8vw, 2.75rem)"
          stats={[
            { key: "todo", tone: "neutral", icon: <ShoppingCart size={15} strokeWidth={2.2} />, label: tr("Belum beli", "To buy"), value: String(todo.length) },
            { key: "done", tone: "in", icon: <Check size={15} strokeWidth={2.4} />, label: tr("Sudah beli", "Bought"), value: String(bought.length) },
          ]}
        >
          <form onSubmit={(e) => void addItem(e)} className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={nameRef}
              type="text"
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("Tambah barang, cth: susu", "Add an item, e.g. milk")}
              aria-label={tr("Nama barang", "Item name")}
              className="h-12 min-w-0 rounded-full px-4 outline-none sm:flex-1"
              style={{ fontSize: "16px", background: "var(--hero-chip)", border: "1px solid var(--hero-chip-line)", color: "var(--hero-text)" }}
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={quantity}
                maxLength={40}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={tr("Kuantiti", "Qty")}
                aria-label={tr("Kuantiti", "Quantity")}
                className="h-12 w-24 min-w-0 rounded-full px-4 outline-none sm:w-28"
                style={{ fontSize: "16px", background: "var(--hero-chip)", border: "1px solid var(--hero-chip-line)", color: "var(--hero-text)" }}
              />
              <button
                type="submit"
                disabled={busy === "add" || !name.trim()}
                aria-label={tr("Tambah", "Add")}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 sm:flex-none"
                style={{ background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)" }}
              >
                {busy === "add" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {tr("Tambah", "Add")}
              </button>
            </div>
          </form>
        </ModenHero>

        <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
          <p className="text-sm font-bold text-[var(--text)]">{tr("Senarai", "List")}</p>
          {!loading && todo.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]">
                <ShoppingCart size={20} />
              </span>
              <p className="mt-3 text-sm font-semibold text-[var(--text)]">
                {bought.length ? tr("Semua sudah dibeli 🎉", "Everything is bought 🎉") : tr("Senarai kosong", "The list is empty")}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tr("Tambah di atas, atau hantar `buyx susu` kepada bot.", "Add above, or send `buyx milk` to the bot.")}
              </p>
            </div>
          ) : (
            <ul className="mt-1 divide-y divide-[var(--border)]">
              {todo.map((item) => (
                <ItemRow key={item.id} item={item} busy={busy === item.id} isBm={isBm} onToggle={() => void mutate(item.id, `/shopping/items/${item.id}`, "PATCH", { done: true })} onDelete={() => void mutate(item.id, `/shopping/items/${item.id}`, "DELETE")} />
              ))}
            </ul>
          )}
        </section>

        {bought.length ? (
          <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-[var(--text)]">{tr("Sudah dibeli", "Bought")}</p>
              <button
                type="button"
                onClick={() => void mutate("clear", "/shopping/clear-done", "POST")}
                disabled={busy === "clear"}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 text-xs font-semibold text-[var(--text-soft)] transition hover:text-[var(--text)] disabled:opacity-50"
              >
                {busy === "clear" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {tr("Kosongkan", "Clear")}
              </button>
            </div>
            <ul className="mt-1 divide-y divide-[var(--border)]">
              {bought.map((item) => (
                <ItemRow key={item.id} item={item} busy={busy === item.id} isBm={isBm} onToggle={() => void mutate(item.id, `/shopping/items/${item.id}`, "PATCH", { done: false })} onDelete={() => void mutate(item.id, `/shopping/items/${item.id}`, "DELETE")} />
              ))}
            </ul>
          </section>
        ) : null}
      </DesktopPageBody>
      <ShoppingHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} isBm={isBm} sessionId={sessionId} />
      {alertModal}
    </div>
  )
}

// Errors the API returns in English, in the reader's language.
function shoppingError(detail: unknown, isBm: boolean) {
  const text = typeof detail === "string" ? detail : ""
  if (!text) return isBm ? "Cuba lagi." : "Please try again."
  if (!isBm) return text
  if (text === "Name is required.") return "Nama barang diperlukan."
  const full = text.match(/^The list is full \((\d+) items\)/)
  if (full) return `Senarai penuh (${full[1]} barang). Tandakan beberapa yang sudah dibeli dahulu.`
  return text
}

/** How to use the list: in the app, and from WhatsApp, Telegram and web chat. */
function ShoppingHelpSheet({ open, onClose, isBm, sessionId }: { open: boolean; onClose: () => void; isBm: boolean; sessionId: string }) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  // [BM command, EN command, BM text, EN text]. The bot takes either language on any
  // account; the sheet shows the one that matches the page.
  const commands: Array<[string, string, string, string]> = [
    ["buyx", "buyx", "Papar senarai", "Show the list"],
    ["buyx susu 2", "buyx milk 2", "Tambah barang (dengan kuantiti)", "Add an item (with a quantity)"],
    ["buyx telur, roti, beras 5kg", "buyx eggs, bread, rice 5kg", "Tambah banyak sekali gus, asingkan dengan koma", "Add several at once, separated by commas"],
    ["buyx siap 2", "buyx done 2", "Tanda nombor 2 sudah dibeli (atau 'buyx siap susu')", "Tick number 2 off (or 'buyx done milk')"],
    ["buyx batal susu", "buyx undo milk", "Kembalikan barang ke senarai", "Put an item back on the list"],
    ["buyx buang 2", "buyx remove 2", "Buang barang dari senarai", "Remove an item from the list"],
    ["buyx kosongkan", "buyx clear", "Kosongkan semua yang sudah dibeli", "Clear everything already bought"],
    ["buyx bantuan", "buyx help", "Senarai arahan ini dalam chat", "This list of commands, in the chat"],
  ]
  return (
    <AppSheet open={open} onClose={onClose} id="shopping-help" title={tr("Cara guna Senarai Beli", "How to use the Shopping List")} size="md">
      <div className="space-y-4">
        <HelpBlock title={tr("Dalam app", "In the app")}>
          <ol className="space-y-3">
            <HelpStep n={1}>{tr("Taip nama barang di kotak atas, dan kuantiti jika perlu, kemudian tekan Tambah.", "Type the item in the box at the top, add a quantity if you like, then tap Add.")}</HelpStep>
            <HelpStep n={2}>{tr("Di kedai, tekan bulatan di sebelah barang bila sudah dimasukkan ke troli. Ia berpindah ke bahagian Sudah dibeli.", "In the shop, tap the circle next to an item once it is in your trolley. It moves to Bought.")}</HelpStep>
            <HelpStep n={3}>{tr("Tekan ikon tong sampah untuk buang barang, atau Kosongkan untuk membuang semua yang sudah dibeli.", "Tap the bin to remove an item, or Clear to remove everything already bought.")}</HelpStep>
          </ol>
        </HelpBlock>

        <HelpBlock title={tr("Dari WhatsApp, Telegram atau web chat", "From WhatsApp, Telegram or web chat")}>
          <ol className="space-y-3">
            <HelpStep n={1}>
              {tr("Sambungkan WhatsApp atau Telegram anda sekali sahaja di ", "Connect your WhatsApp or Telegram once, in ")}
              <Link href={`/${sessionId}/connector`} onClick={onClose} className="font-semibold text-[var(--btn-primary-bg)] underline underline-offset-2 dark:text-[#5aa6ff]">
                Connector
              </Link>
              {tr(". Web chat tidak perlu disambung.", ". Web chat needs no connecting.")}
            </HelpStep>
            <HelpStep n={2}>
              {tr(
                "WhatsApp: hantar mesej ke chat dengan diri sendiri (Message yourself). Telegram: hantar kepada bot dalam chat peribadi. Web chat: buka Chat dalam app.",
                "WhatsApp: send the message in your chat with yourself (Message yourself). Telegram: send it to the bot in a private chat. Web chat: open Chat in the app.",
              )}
            </HelpStep>
            <HelpStep n={3}>{tr("Taip arahan di bawah. Bot membalas dengan senarai terkini.", "Type a command below. The bot replies with the latest list.")}</HelpStep>
          </ol>

          <div className="mt-4">
            <HelpCommands commands={commands.map(([cmdBm, cmdEn, bm, en]): [string, string] => [isBm ? cmdBm : cmdEn, isBm ? bm : en])} />
          </div>

          <HelpNote>
            {tr(
              "Arahan dalam BM dan English kedua-duanya diterima (contoh: buyx siap = buyx done), dan balasan ikut bahasa akaun anda. Senarai di app dan di bot ialah senarai yang sama. Bot tidak membalas arahan ini dalam group WhatsApp.",
              "Commands work in both English and Malay (e.g. buyx done = buyx siap), and replies follow your account language. The list in the app and in the bot is the same one. The bot does not answer these commands in a WhatsApp group.",
            )}
          </HelpNote>
        </HelpBlock>
      </div>
    </AppSheet>
  )
}

function ItemRow({ item, busy, isBm, onToggle, onDelete }: { item: Item; busy: boolean; isBm: boolean; onToggle: () => void; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.done ? (isBm ? `Kembalikan ${item.name}` : `Put ${item.name} back`) : isBm ? `Tanda ${item.name} sudah dibeli` : `Mark ${item.name} bought`}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90 disabled:opacity-50",
          item.done ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border-strong)] text-transparent hover:border-[var(--btn-primary-bg)]"
        )}
      >
        {busy ? <Loader2 size={14} className="animate-spin text-[var(--muted)]" /> : <Check size={16} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[0.9375rem] font-semibold", item.done ? "text-[var(--muted)] line-through" : "text-[var(--text)]")}>{item.name}</p>
        {item.quantity ? <p className="truncate text-xs text-[var(--muted)]">× {item.quantity}</p> : null}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label={isBm ? `Buang ${item.name}` : `Remove ${item.name}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-tint)] hover:text-rose-500 disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </li>
  )
}
