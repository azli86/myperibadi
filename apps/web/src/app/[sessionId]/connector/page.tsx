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
    if (state === "connected") return "bg-emerald-500/10 text-emerald-500"
    if (state === "error") return "bg-rose-500/10 text-rose-500"
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

  const renderCard = (item: ConnectorCard) => {
    const Icon = item.icon
    const connected = item.state === "connected"
    return (
      <Link
        key={item.key}
        href={item.href}
        className="group flex items-center gap-3.5 rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 transition active:scale-[0.985] hover:border-[var(--border-strong)] md:p-5"
      >
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-2xl md:h-14 md:w-14",
            item.accent,
          )}
        >
          <Icon size={22} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-black tracking-tight text-[var(--text)] md:text-lg">{item.name}</p>
            {item.key === "hermes" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.5rem] font-black uppercase tracking-[0.12em] text-amber-600">Beta</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.625rem] font-bold",
                statusClass(item.state),
              )}
            >
              {item.state === "loading" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : connected ? (
                <CheckCircle2 size={11} />
              ) : item.state === "error" ? (
                <Unplug size={11} />
              ) : (
                <Unplug size={11} />
              )}
              {statusLabel(item.state)}
            </span>
            {item.detail ? (
              <span className="truncate text-[0.6875rem] font-semibold text-[var(--muted)]">{item.detail}</span>
            ) : null}
          </div>
        </div>

        <ChevronRight size={16} className="shrink-0 text-[var(--muted)] opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </Link>
    )
  }

  const listBody = showSkeleton ? (
    <div className="grid gap-2 md:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-[var(--card-radius-lg)] border border-[var(--border)] bg-[var(--card)]" />
      ))}
    </div>
  ) : (
    <div className="grid gap-2 md:grid-cols-2">{connectors.map(renderCard)}</div>
  )

  const summaryStrip = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
      <span className="inline-flex items-center gap-1.5">
        <Plug size={12} />
        {showSkeleton ? "—" : stats.total} {tr("jumlah", "total")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 size={12} className="text-emerald-500" />
        {showSkeleton ? "—" : stats.connected} {tr("disambung", "connected")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Unplug size={12} className="text-amber-500" />
        {showSkeleton ? "—" : stats.disconnected} {tr("tiada sambungan", "no connection")}
      </span>
    </div>
  )

  return (
    <div className="space-y-4 pb-24 md:space-y-0 md:pb-0">
      <div className="space-y-4 md:hidden">
        <MobilePageHeader
          title={tr("Connector", "Connector")}
          fallbackHref={`/${sessionId}`}
          action={
            <MobileIconButton onClick={() => void loadStatus({ silent: true })} label={tr("Muat semula", "Refresh")} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && "animate-spin")} strokeWidth={2.5} />
            </MobileIconButton>
          }
        />

        <div className="space-y-3 px-1">
          {summaryStrip}
          {listBody}
        </div>
      </div>

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
        <DesktopPageBody className="space-y-4">
          {summaryStrip}
          {listBody}
        </DesktopPageBody>
      </div>
    </div>
  )
}
