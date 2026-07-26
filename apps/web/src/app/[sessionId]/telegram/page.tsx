"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Send,
  Unlink,
  Unplug,
} from "lucide-react"
import {
  DesktopPageAction,
  DesktopPageBody,
  DesktopPageChip,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"

type TelegramStatus = {
  is_connected: boolean
  telegram_username?: string | null
  telegram_user_id?: string | null
  telegram_chat_id?: string | null
  linked_at?: string | null
  bot_username?: string | null
}

type TelegramPairCode = {
  code: string
  expires_at: string
  bot_username?: string | null
}

export default function TelegramPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const { showAlert, alertModal } = usePageAlert(lang)
  const isBM = lang === "BM"

  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [pairCode, setPairCode] = useState<TelegramPairCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [feedback, setFeedback] = useState("")

  async function authedFetch(path: string, init: RequestInit = {}) {
    const token = getAccessToken()
    if (!token) throw new Error("Missing session")
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${token}`)
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
    const res = await fetch(`/api${path}`, { ...init, headers, cache: "no-store" })
    if (!res.ok) throw new Error(await res.text().catch(() => "Request failed"))
    return res
  }

  async function loadStatus() {
    setLoading(true)
    try {
      const res = await authedFetch("/telegram/link/status")
      setStatus((await res.json()) as TelegramStatus)
    } catch {
      setFeedback(isBM ? "Gagal ambil status Telegram." : "Failed to load Telegram status.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  async function requestPairCode() {
    setWorking(true)
    try {
      const res = await authedFetch("/telegram/link/request", { method: "POST" })
      const data = (await res.json()) as TelegramPairCode
      setPairCode(data)
      setFeedback(
        isBM
          ? "Kod Telegram dijana. Hantar kod ini dekat bot."
          : "Telegram code generated. Send this code to the bot.",
      )
    } catch {
      showAlert(
        isBM ? "Gagal" : "Failed",
        isBM ? "Gagal jana kod Telegram." : "Failed to generate Telegram code.",
        "error",
      )
    } finally {
      setWorking(false)
    }
  }

  async function unlinkTelegram() {
    setWorking(true)
    try {
      await authedFetch("/telegram/link", { method: "DELETE" })
      setPairCode(null)
      await loadStatus()
      showAlert(
        isBM ? "Selesai" : "Done",
        isBM ? "Telegram telah dinyahpaut." : "Telegram has been unlinked.",
        "success",
      )
    } catch {
      showAlert(
        isBM ? "Gagal" : "Failed",
        isBM ? "Gagal nyahpaut Telegram." : "Failed to unlink Telegram.",
        "error",
      )
    } finally {
      setWorking(false)
    }
  }

  async function copyCode() {
    if (!pairCode?.code) return
    await navigator.clipboard.writeText(pairCode.code)
    showAlert(
      isBM ? "Disalin" : "Copied",
      isBM ? "Kod Telegram disalin." : "Telegram code copied.",
      "success",
    )
  }

  const botUsername = pairCode?.bot_username || status?.bot_username || "budgetdigitalportbot"
  const botUrl = `https://t.me/${botUsername.replace(/^@/, "")}`
  const connectedName = status?.telegram_username
    ? `@${status.telegram_username}`
    : status?.telegram_user_id || "Telegram"
  const isConnected = Boolean(status?.is_connected)

  const desktopHeaderActions = (
    <>
      <DesktopPageChip
        className={cn(
          isConnected
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
            : "border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]",
        )}
      >
        <span
          className={cn("h-2 w-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-[var(--muted)]")}
        />
        {loading
          ? isBM
            ? "Semak..."
            : "Checking..."
          : isConnected
            ? isBM
              ? "Disambung"
              : "Connected"
            : isBM
              ? "Tiada sambungan"
              : "No connection"}
      </DesktopPageChip>
      {isConnected ? (
        <DesktopPageAction
          onClick={() => void unlinkTelegram()}
          disabled={working || loading}
          className="border border-red-500/25 bg-red-500/15 text-red-500 shadow-none hover:bg-red-500/20"
        >
          {working ? <Loader2 strokeWidth={2.5} className="animate-spin" /> : <Unlink strokeWidth={2.5} />}
          {isBM ? "Putus" : "Disconnect"}
        </DesktopPageAction>
      ) : (
        <DesktopPageAction onClick={() => void requestPairCode()} disabled={working || loading}>
          {working ? <Loader2 strokeWidth={2.5} className="animate-spin" /> : <Link2 strokeWidth={2.5} />}
          {isBM ? "Sambung" : "Connect"}
        </DesktopPageAction>
      )}
    </>
  )

  const mobileHeaderAction = isConnected ? (
    <MobileIconButton
      onClick={() => void unlinkTelegram()}
      disabled={working || loading}
      label={isBM ? "Putus" : "Disconnect"}
      className="bg-red-500/15 text-red-500 shadow-none"
    >
      {working ? <Loader2 strokeWidth={2.5} className="animate-spin" /> : <Unlink strokeWidth={2.5} />}
    </MobileIconButton>
  ) : (
    <MobileIconButton
      onClick={() => void requestPairCode()}
      disabled={working || loading}
      label={isBM ? "Sambung" : "Connect"}
    >
      {working ? <Loader2 strokeWidth={2.5} className="animate-spin" /> : <Link2 strokeWidth={2.5} />}
    </MobileIconButton>
  )

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden">
        <MobilePageHeader
          title="Telegram"
          fallbackHref={`/${sessionId}/connector`}
          action={mobileHeaderAction}
        />
      </div>

      <DesktopPageHeader
        className="hidden lg:block"
        title="Telegram"
        backHref={`/${sessionId}/connector`}
        actions={desktopHeaderActions}
      />

      <DesktopPageBody className="mt-4 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        {/* Hero */}
        <section className="subscription-hero relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[#1a1a1a] p-5 text-[#f5f5f5] md:p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
          <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3.5">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "rgba(56,189,248,0.15)", color: "#7dd3fc" }}
              >
                <Send size={22} />
              </div>
              <div className="min-w-0">
                <p className="force-white text-xl font-black leading-tight text-[#ffffff] md:text-2xl">
                  Telegram
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[#a3a3a3] md:text-sm">
                  {isConnected
                    ? connectedName
                    : isBM
                      ? "Belum disambung"
                      : "Not connected"}
                </p>
              </div>
            </div>
            <div
              className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
              style={{
                backgroundColor: isConnected
                  ? "rgba(110,231,183,0.14)"
                  : "rgba(255,255,255,0.08)",
                color: isConnected ? "#6ee7b7" : "#cbd5e1",
              }}
            >
              {loading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : isConnected ? (
                <CheckCircle2 size={13} />
              ) : (
                <Unplug size={13} />
              )}
              {loading
                ? isBM
                  ? "Semak..."
                  : "Checking..."
                : isConnected
                  ? isBM
                    ? "Disambung"
                    : "Connected"
                  : isBM
                    ? "Tiada sambungan"
                    : "No connection"}
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Link status */}
          <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)]">
                <Link2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-base font-black text-[var(--text)]">
                  {isBM ? "Status pautan" : "Link status"}
                </p>
                <p className="truncate text-sm font-semibold text-[var(--muted)]">
                  {isConnected
                    ? connectedName
                    : isBM
                      ? "Telegram belum dipautkan"
                      : "Telegram is not linked yet"}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              <a
                href={botUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--bg)] transition active:scale-[0.99]"
              >
                <ExternalLink size={16} />
                {isBM ? "Buka bot Telegram" : "Open Telegram bot"}
              </a>
              {!isConnected ? (
                <p className="text-[11px] font-medium text-[var(--muted)]">
                  {isBM
                    ? "Tekan Sambung di header untuk jana kod, kemudian hantar kod itu ke bot."
                    : "Press Connect in the header to generate a code, then send it to the bot."}
                </p>
              ) : null}
            </div>
          </section>

          {/* Pairing code */}
          <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
            <p className="text-base font-black text-[var(--text)]">
              {isBM ? "Kod sambungan" : "Pairing code"}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {isBM
                ? "Hantar kod ini ke bot sebelum tamat tempoh."
                : "Send this code to the bot before it expires."}
            </p>

            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-5 text-center">
              <p className="text-[2rem] font-black tracking-[0.2em] text-[var(--text)] md:text-[2.4rem]">
                {pairCode?.code || "------"}
              </p>
              <p className="mt-2 text-[11px] font-bold text-[var(--muted)]">
                {pairCode?.expires_at
                  ? `${isBM ? "Tamat" : "Expires"}: ${new Date(pairCode.expires_at).toLocaleString()}`
                  : isBM
                    ? "Belum jana kod"
                    : "No code generated yet"}
              </p>
            </div>

            <button
              type="button"
              onClick={copyCode}
              disabled={!pairCode?.code}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 text-sm font-bold text-[var(--text)] transition active:scale-[0.99] disabled:opacity-50"
            >
              <Copy size={16} />
              {isBM ? "Salin kod" : "Copy code"}
            </button>
          </section>
        </div>

        {/* Commands */}
        <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
          <p className="text-base font-black text-[var(--text)]">
            {isBM ? "Command asas" : "Basic commands"}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {["/start", "/help", "/summary", "makan nasi ayam 5"].map((cmd) => (
              <code
                key={cmd}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm font-semibold text-[var(--muted)]"
              >
                {cmd}
              </code>
            ))}
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5">
              <p className="text-[10px] font-bold text-rose-500">
                {isBM ? "Tambah belanja" : "Add expense"}
              </p>
              <code className="mt-0.5 block text-sm font-black text-rose-500">/add expense</code>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5">
              <p className="text-[10px] font-bold text-emerald-600">
                {isBM ? "Tambah pendapatan" : "Add income"}
              </p>
              <code className="mt-0.5 block text-sm font-black text-emerald-600">/add income</code>
            </div>
          </div>
        </section>

        {feedback ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--text)]">
            {feedback}
          </p>
        ) : null}
      </DesktopPageBody>
      {alertModal}
    </div>
  )
}
