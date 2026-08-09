"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { CreditCard, ChevronRight } from "lucide-react"
import Link from "next/link"
import { getAccessToken } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { useDelayedSkeleton } from "@/hooks/useDelayedSkeleton"

type BnplRow = {
  id: number
  name: string
  provider: string
  monthly_amount: number
  due_day_of_month: number
  outstanding_amount: number
  status: string
}

/**
 * BNPL monthly-total row for the personal dashboard.
 * Fail-soft: renders nothing when there are no active BNPLs or on fetch error.
 */
export function DashboardBnplHeroRow({
  variant = "card",
  layout = "desktop",
  className,
}: {
  variant?: "hero" | "card"
  layout?: "default" | "desktop"
  className?: string
}) {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  const [items, setItems] = useState<BnplRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = getAccessToken()
        const headers: HeadersInit =
          token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch("/api/bnpl?include_settled=false", {
          credentials: "include",
          headers,
          cache: "no-store",
        })
        if (!res.ok) throw new Error("bnpl failed")
        const json = await res.json()
        const list: BnplRow[] = Array.isArray(json) ? json : []
        if (!cancelled) setItems(list)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const active = useMemo(
    () => (items || []).filter((i) => i.status === "active"),
    [items],
  )
  const monthlyTotal = useMemo(
    () => active.reduce((s, i) => s + Number(i.monthly_amount || 0), 0),
    [active],
  )

  const loading = items === null && !failed
  const showSkeleton = useDelayedSkeleton(loading)

  if (failed || active.length === 0) return null
  if (loading) {
    if (!showSkeleton) return null
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-card)]",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-[var(--surface-tint-strong)]" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-32 animate-pulse rounded bg-[var(--surface-tint-strong)]" />
            <div className="h-5 w-24 animate-pulse rounded bg-[var(--surface-tint-strong)]" />
          </div>
        </div>
      </div>
    )
  }

  const display = layout === "desktop" ? active.slice(0, 4) : active.slice(0, 3)
  const others = active.length - display.length

  return (
    <Link
      href={`/${sessionId}/bnpl`}
      className={cn(
        "group flex items-center justify-between gap-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-card)] transition hover:border-[var(--border-strong)]",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--accent2)]">
          <CreditCard size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            {tr("Total Perlu Bayar Bulanan BNPL", "Total Monthly BNPL Due")}
          </p>
          <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-[var(--text)]">
            RM {monthlyTotal.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
          </p>
          {display.length > 0 && (
            <p className="mt-0.5 truncate text-[0.62rem] font-semibold text-[var(--muted)]">
              {display.map((i) => i.name).join(", ")}
              {others > 0 ? ` +${others} ${tr("lagi", "more")}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[var(--muted)]">
        <span className="text-[0.62rem] font-bold uppercase tracking-wider">
          {tr("BNPL", "BNPL")}
        </span>
        <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}
