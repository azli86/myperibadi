"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plug,
  RefreshCw,
  Send,
  Unplug,
} from "lucide-react"
import {
  DesktopPageBody,
  DesktopPageHeader,
  MobileIconButton,
  MobilePageHeader,
} from "@/components/layout/PageHeader"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { AmountSkeleton } from "@/components/ui/DataSkeleton"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type ConnectorKey = "whatsapp" | "telegram" | "hermes"
type ConnectionState = "loading" | "connected" | "disconnected" | "error"

type ConnectorCard = {
  key: ConnectorKey
  name: string
  href: string
  icon: typeof Bot
  accent: string
  state: ConnectionState
  detail?: string | null
}

export default function ConnectorPage() {
  const params = useParams()
  const sessionId = (params.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = useCallback((bm: string, en: string) => (isBm ? bm : en), [isBm])

  const [waState, setWaState] = useState<ConnectionState>("loading")
  const [tgState, setTgState] = useState<ConnectionState>("loading")
  const [waDetail, setWaDetail] = useState<string | null>(null)
  const [tgDetail, setTgDetail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const showSkeleton = useDelayedSkeleton(loading && !refreshing)

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken()
    if (token && !isCookieAuthSentinel(token)) {
      return { Authorization: `Bearer ${token}` }
    }
    return {}
  }, [])

  const loadStatus = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true)
      else setLoading(true)
      setWaState("loading")
      setTgState("loading")

      const headers = authHeaders()

      const loadWhatsApp = async () => {
        try {
          const res = await fetch("/api/whatsapp/session", {
            headers,
            credentials: "include",
            cache: "no-store",
          })
          if (!res.ok) throw new Error("wa session failed")
          const data = (await res.json()) as { status?: string; phone?: string | null }
          const connected = data.status === "connected"
          setWaState(connected ? "connected" : "disconnected")
          setWaDetail(connected && data.phone ? String(data.phone) : null)
        } catch {
          try {
            const res = await fetch("/api/whatsapp/status", {
              headers,
              credentials: "include",
              cache: "no-store",
            })
            if (!res.ok) throw new Error("wa status failed")
            const data = (await res.json()) as { status?: string; phone?: string | null }
            const connected = data.status === "connected"
            setWaState(connected ? "connected" : "disconnected")
            setWaDetail(connected && data.phone ? String(data.phone) : null)
          } catch {
            setWaState("error")
            setWaDetail(null)
          }
        }
      }

      const loadTelegram = async () => {
        try {
          const res = await fetch("/api/telegram/link/status", {
            headers,
            credentials: "include",
            cache: "no-store",
          })
          if (!res.ok) throw new Error("tg status failed")
          const data = (await res.json()) as {
            is_connected?: boolean
            telegram_username?: string | null
          }
          const connected = Boolean(data.is_connected)
          setTgState(connected ? "connected" : "disconnected")
          setTgDetail(
            connected && data.telegram_username ? `@${data.telegram_username}` : null,
          )
        } catch {
          setTgState("error")
          setTgDetail(null)
        }
      }

      await Promise.all([loadWhatsApp(), loadTelegram()])
      setLoading(false)
      setRefreshing(false)
    },
    [authHeaders],
  )

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const statusLabel = (state: ConnectionState) => {
    if (state === "loading") return tr("Memeriksa...", "Checking...")
    if (state === "connected") return tr("Disambung", "Connected")
    if (state === "error") return tr("Ralat", "Error")
    return tr("Tiada sambungan", "No connection")
  }

  const statusClass = (state: ConnectionState) => {
    if (state === "connected") return "bg-[var(--surface-tint)] text-[var(--text)]"
    if (state === "error") return "bg-rose-500/12 text-rose-600"
    if (state === "loading") return "bg-[var(--surface-tint)] text-[var(--muted)]"
    return "bg-[var(--surface-tint)] text-[var(--muted)]"
  }

  const connectors: ConnectorCard[] = useMemo(
    () => [
      {
        key: "whatsapp",
        name: "WhatsApp",
        href: `/${sessionId}/whatsapp`,
        icon: Bot,
        accent: "bg-[var(--surface-tint)] text-[var(--text)]",
        state: waState,
        detail: waDetail,
      },
      {
        key: "telegram",
        name: "Telegram",
        href: `/${sessionId}/telegram`,
        icon: Send,
        accent: "bg-[var(--surface-tint)] text-[var(--text)]",
        state: tgState,
        detail: tgDetail,
      },
      {
        key: "hermes",
        name: "Hermes MCP",
        href: `/${sessionId}/hermes-mcp`,
        icon: Plug,
        accent: "bg-[var(--surface-tint)] text-[var(--text)]",
        state: "disconnected",
        detail: tr("Token peribadi selamat", "Secure personal token"),
      },
    ],
    [sessionId, tgDetail, tgState, tr, waDetail, waState],
  )

  const stats = useMemo(() => {
    const connected = connectors.filter((c) => c.state === "connected").length
    const disconnected = connectors.filter((c) => c.state === "disconnected").length
    const total = connectors.length
    return { connected, disconnected, total }
  }, [connectors])

  const renderMobileCard = (item: ConnectorCard) => {
    const Icon = item.icon
    const connected = item.state === "connected"
    return (
      <Link
        key={item.key}
        href={item.href}
        className="group flex items-start gap-3.5 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 transition active:scale-[0.99]"
      >
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            item.accent,
          )}
        >
          <Icon size={22} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 text-xl font-black tracking-tight text-[var(--text)]">{item.name}{item.key === "hermes" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-600">Beta</span>}</p>
            <ChevronRight size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
                statusClass(item.state),
              )}
            >
              {item.state === "loading" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : connected ? (
                <CheckCircle2 size={11} />
              ) : (
                <Unplug size={11} />
              )}
              {statusLabel(item.state)}
            </span>
            {item.detail ? (
              <span className="truncate text-[11px] font-semibold text-[var(--text)]">
                {item.detail}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    )
  }

  const renderDesktopCard = (item: ConnectorCard) => {
    const Icon = item.icon
    const connected = item.state === "connected"
    return (
      <Link
        key={item.key}
        href={item.href}
        className="group rounded-[1.6rem] border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[color-mix(in_srgb,var(--accent2)_28%,var(--border))] active:scale-[0.995]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.2rem]",
                item.accent,
              )}
            >
              <Icon size={26} strokeWidth={1.7} />
            </div>
            <p className="flex items-center gap-2 truncate text-2xl font-black tracking-tight text-[var(--text)]">
              {item.name}{item.key === "hermes" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-600">Beta</span>}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold",
              statusClass(item.state),
            )}
          >
            {item.state === "loading" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : connected ? (
              <CheckCircle2 size={11} />
            ) : (
              <Unplug size={11} />
            )}
            {statusLabel(item.state)}
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-[var(--muted)]">
              {connected
                ? tr("Akaun dipaut", "Linked account")
                : tr("Status", "Status")}
            </p>
            <p className="mt-0.5 truncate text-sm font-bold text-[var(--text)]">
              {item.detail ||
                (connected
                  ? tr("Disambung", "Connected")
                  : tr("Belum disambung", "Not connected"))}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent2)]">
            {tr("Buka", "Open")}
            <ChevronRight size={14} />
          </span>
        </div>
      </Link>
    )
  }

  const heroSubtitle =
    stats.connected === 0
      ? tr(
          "Sambung bot untuk rekod transaksi dan ringkasan.",
          "Connect bots to log transactions and get summaries.",
        )
      : tr(
          `${stats.connected} disambung · ${stats.disconnected} tiada sambungan`,
          `${stats.connected} connected · ${stats.disconnected} no connection`,
        )

  return (
    <div className="space-y-4 pb-24 md:space-y-0 md:pb-0">
      {/* ── Mobile ── */}
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Connector", "Connector")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton
              onClick={() => void loadStatus({ silent: true })}
              label={tr("Muat semula", "Refresh")}
              disabled={refreshing}
            >
              <RefreshCw className={cn(refreshing && "animate-spin")} strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        <section className="space-y-2.5 px-0.5">
          <p className="px-0.5 text-[0.7rem] font-bold tracking-wide text-[var(--muted)]">
            {tr("Senarai connector", "Connector list")}
          </p>
          {showSkeleton
            ? Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <AmountSkeleton className="h-4 w-28" />
                  <AmountSkeleton className="mt-2 h-3 w-44" />
                  <AmountSkeleton className="mt-3 h-6 w-24 rounded-full" />
                </div>
              ))
            : connectors.map(renderMobileCard)}
        </section>
      </div>

      {/* ── Desktop ── */}
      <div className="hidden md:block">
        <DesktopPageHeader
          title={tr("Connector", "Connector")}
          homeHref={`/${sessionId}`}
          actions={
            <button
              type="button"
              onClick={() => void loadStatus({ silent: true })}
              disabled={refreshing}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)] transition active:scale-[0.98] disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
              {tr("Muat semula", "Refresh")}
            </button>
          }
        />
        <DesktopPageBody className="space-y-5">
          <section className="subscription-hero relative overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[#1a1a1a] p-6 text-[#f5f5f5]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#202020] to-[#262626]" />
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/[0.04] blur-2xl" />
            <div className="absolute -bottom-14 left-10 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#ffffff" }}
                  >
                    <Plug size={20} />
                  </div>
                  {showSkeleton ? (
                    <AmountSkeleton className="h-8 w-56 bg-white/10" />
                  ) : (
                    <div className="min-w-0">
                      <p className="force-white text-2xl font-black leading-tight text-[#ffffff]">
                        {tr("Sambungan Bot", "Bot Connections")}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#a3a3a3]">{heroSubtitle}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid w-full grid-cols-3 gap-3 lg:max-w-md lg:shrink-0">
                {[
                  {
                    label: tr("Jumlah", "Total"),
                    value: stats.total,
                    icon: Plug,
                    color: "#bae6fd",
                  },
                  {
                    label: tr("Disambung", "Connected"),
                    value: stats.connected,
                    icon: CheckCircle2,
                    color: "#6ee7b7",
                  },
                  {
                    label: tr("Tiada", "None"),
                    value: stats.disconnected,
                    icon: Unplug,
                    color: "#fcd34d",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-center gap-2">
                      <stat.icon size={15} style={{ color: stat.color }} />
                      <p
                        className="text-[0.6rem] font-bold tracking-wide"
                        style={{ color: "#cbd5e1" }}
                      >
                        {stat.label}
                      </p>
                    </div>
                    <p
                      className="mt-3 text-2xl font-black tabular-nums leading-none"
                      style={{ color: stat.color }}
                    >
                      {showSkeleton ? "—" : stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[0.7rem] font-bold tracking-wide text-[var(--muted)]">
                  {tr("Senarai connector", "Connector list")}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {tr("Klik card untuk buka halaman connector.", "Click a card to open the connector page.")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {showSkeleton
                ? Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-52 animate-pulse rounded-[1.6rem] border border-[var(--border)] bg-[var(--card)]"
                    />
                  ))
                : connectors.map(renderDesktopCard)}
            </div>
          </section>
        </DesktopPageBody>
      </div>
    </div>
  )
}
