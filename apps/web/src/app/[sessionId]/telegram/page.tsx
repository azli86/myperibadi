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
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { HERO_MUTED, ModenHero, ModenHeroPill, heroPrimaryButtonStyle, heroQuietButtonStyle } from "@/components/ui/ModenHero"
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
    if (!isCookieAuthSentinel(token)) headers.set("Authorization", `Bearer ${token}`)
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
      // The code card sits below the status card; on phones the button is in the
      // header, so without this the fresh code stays off-screen and looks empty.
      requestAnimationFrame(() => {
        document.getElementById("telegram-pair-code")?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
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
  const botHandle = botUsername.replace(/^@/, "")
  // t.me/<bot> answers with a redirect to tg://resolve?... Inside an in-app WebView
  // there is no handler for the tg: scheme, so the tab dies with
  // "net::ERR_UNKNOWN_URL_SCHEME". Ask for tg: directly and fall back to the web page
  // only when the app never took over (the document keeps focus).
  function openBot() {
    const webUrl = `https://t.me/${botHandle}`
    let handedOff = false
    const markHandedOff = () => {
      handedOff = true
    }
    window.addEventListener("blur", markHandedOff, { once: true })
    document.addEventListener("visibilitychange", markHandedOff, { once: true })
    window.location.href = `tg://resolve?domain=${encodeURIComponent(botHandle)}`
    // Runs after the navigation attempt settles; no timer involved.
    queueMicrotask(() => {
      window.setTimeout(() => {
        window.removeEventListener("blur", markHandedOff)
        document.removeEventListener("visibilitychange", markHandedOff)
        if (!handedOff) window.open(webUrl, "_blank", "noopener,noreferrer")
      }, 0)
    })
  }
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
        breadcrumbs={[{ label: lang === "BM" ? "Penyambung" : "Connector", href: `/${sessionId}/connector` }]}
        homeHref={`/${sessionId}`}
        backHref={`/${sessionId}/connector`}
        actions={desktopHeaderActions}
      />

      <DesktopPageBody className="mt-2 flex flex-col gap-4 px-1 lg:mt-0 lg:gap-5 lg:px-0">
        {/* Status: the Moden hero card */}
        <ModenHero
          label={
            <>
              Telegram
              <ModenHeroPill dot={isConnected ? "#4ADE80" : "var(--hero-muted)"}>
                {loading ? (isBM ? "Menyemak" : "Checking") : isConnected ? (isBM ? "Aktif" : "Live") : (isBM ? "Tidak aktif" : "Offline")}
              </ModenHeroPill>
            </>
          }
          currency={null}
          amount={loading ? (isBM ? "Menyemak…" : "Checking…") : isConnected ? (isBM ? "Disambung" : "Connected") : (isBM ? "Belum disambung" : "Not connected")}
          amountSize="clamp(1.75rem, 7.5vw, 2.5rem)"
          stats={[
            { key: "account", tone: "neutral", icon: <Link2 size={16} strokeWidth={2.2} />, label: isBM ? "Akaun" : "Account", value: isConnected ? connectedName : "-" },
            { key: "bot", tone: "neutral", icon: <Send size={15} strokeWidth={2.2} />, label: "Bot", value: `@${botHandle}` },
          ]}
        >
          <p className="max-w-md text-[0.8125rem] font-medium leading-relaxed" style={{ color: HERO_MUTED }}>
            {isConnected
              ? (isBM ? "Hantar belanja dan pendapatan kepada bot dari Telegram." : "Send expenses and income to the bot from Telegram.")
              : (isBM ? "Jana kod, kemudian hantar kod itu kepada bot untuk paut." : "Generate a code, then send it to the bot to link.")}
          </p>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <button
              type="button"
              onClick={openBot}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] disabled:opacity-50 md:px-5 [&>svg]:shrink-0"
              style={heroPrimaryButtonStyle}
            >
              <ExternalLink size={16} />
              <span className="md:hidden">{isBM ? "Buka bot" : "Open bot"}</span>
              <span className="hidden md:inline">{isBM ? "Buka bot Telegram" : "Open Telegram bot"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(botHandle)
                showAlert(
                  isBM ? "Disalin" : "Copied",
                  isBM
                    ? `Cari @${botHandle} dalam Telegram.`
                    : `Search @${botHandle} in Telegram.`,
                  "success",
                )
              }}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold transition active:scale-[0.98] md:px-5 [&>svg]:shrink-0"
              style={heroQuietButtonStyle}
            >
              <Copy size={16} />
              {isBM ? "Salin nama bot" : "Copy bot name"}
            </button>
          </div>
        </ModenHero>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Pairing code */}
          <section id="telegram-pair-code" className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0550B8]" style={{ color: "#ffffff" }}>
                <Link2 size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-[var(--text)]">
                  {isBM ? "Kod sambungan" : "Pairing code"}
                </p>
                <p className="text-[0.8125rem] font-medium text-[var(--muted)]">
                  {isBM
                    ? "Hantar kod ini ke bot sebelum tamat tempoh."
                    : "Send this code to the bot before it expires."}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[1.25rem] border border-dashed border-[var(--border-strong)] bg-[var(--surface-tint)] px-4 py-6 text-center">
              <p className="font-mono text-[2rem] font-bold tracking-[0.2em] text-[var(--text)] md:text-[2.4rem]">
                {pairCode?.code || "------"}
              </p>
              <p className="mt-2 text-[0.75rem] font-medium text-[var(--muted)]">
                {pairCode?.expires_at
                  ? `${isBM ? "Tamat" : "Expires"}: ${new Date(pairCode.expires_at).toLocaleString()}`
                  : isBM
                    ? "Belum jana kod"
                    : "No code generated yet"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void (pairCode?.code ? copyCode() : requestPairCode())}
              disabled={working || loading}
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0550B8] px-4 text-sm font-semibold transition hover:bg-[#04449c] active:scale-[0.99] disabled:opacity-50"
              style={{ color: "#ffffff" }}
            >
              {working ? (
                <Loader2 size={16} className="animate-spin" />
              ) : pairCode?.code ? (
                <Copy size={16} />
              ) : (
                <Link2 size={16} />
              )}
              {pairCode?.code
                ? isBM
                  ? "Salin kod"
                  : "Copy code"
                : isBM
                  ? "Jana kod"
                  : "Generate code"}
            </button>
            {!isConnected ? (
              <p className="mt-3 text-[0.75rem] font-medium text-[var(--muted)]">
                {isBM
                  ? "Jana kod, buka bot, kemudian hantar kod itu ke bot."
                  : "Generate a code, open the bot, then send the code to it."}
              </p>
            ) : null}
          </section>

          {/* Commands */}
          <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0550B8]/10 text-[#0550B8]">
                <Send size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-[var(--text)]">
                  {isBM ? "Command asas" : "Basic commands"}
                </p>
                <p className="text-[0.8125rem] font-medium text-[var(--muted)]">
                  {isBM ? "Taip terus dalam chat bot." : "Type these straight into the bot chat."}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {["/start", "/help", "/summary", "makan nasi ayam 5"].map((cmd) => (
                <code
                  key={cmd}
                  className="truncate rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-[0.8125rem] font-semibold text-[var(--text-soft)]"
                >
                  {cmd}
                </code>
              ))}
              <div className="rounded-2xl border border-[var(--border)] px-3.5 py-2.5">
                <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-[var(--muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--expense)]" />
                  {isBM ? "Tambah belanja" : "Add expense"}
                </p>
                <code className="mt-0.5 block text-[0.8125rem] font-bold text-[var(--text)]">/add expense</code>
              </div>
              <div className="rounded-2xl border border-[var(--border)] px-3.5 py-2.5">
                <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-[var(--muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--income)]" />
                  {isBM ? "Tambah pendapatan" : "Add income"}
                </p>
                <code className="mt-0.5 block text-[0.8125rem] font-bold text-[var(--text)]">/add income</code>
              </div>
            </div>
          </section>
        </div>

        {feedback ? (
          <p className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[0.8125rem] font-semibold text-[var(--text-soft)]">
            {feedback}
          </p>
        ) : null}
      </DesktopPageBody>
      {alertModal}
    </div>
  )
}
