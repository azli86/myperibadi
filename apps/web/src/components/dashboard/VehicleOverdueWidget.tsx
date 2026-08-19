"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { useLang } from "@/lib/lang"
import { useParams } from "next/navigation"

type OverdueItem = {
  id: number
  vehicle_id: number
  vehicle_name: string
  registration_number?: string | null
  type: string
  title: string
  due_date?: string | null
  due_odometer?: number | null
  days_overdue?: number | null
  km_overdue?: number | null
  target_tab?: string
}

type OverdueResponse = {
  total_overdue: number
  items: OverdueItem[]
}

/**
 * Personal dashboard widget — only renders when total_overdue > 0.
 * Failure never breaks the rest of the dashboard.
 */
export function VehicleOverdueWidget() {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  const { lang } = useLang()
  const isBm = lang === "BM"
  const tr = (bm: string, en: string) => (isBm ? bm : en)

  const [data, setData] = useState<OverdueResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = getAccessToken()
        const headers: HeadersInit =
          token && !isCookieAuthSentinel(token) ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch("/api/vehicles/dashboard/overdue?limit=3", {
          credentials: "include",
          headers,
          cache: "no-store",
        })
        if (!res.ok) throw new Error("failed")
        const json = (await res.json()) as OverdueResponse
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (failed || !data || !data.total_overdue || data.total_overdue <= 0) {
    return null
  }

  const items = data.items || []

  return (
    <section className="overflow-hidden rounded-2xl border border-red-500/25 bg-[color-mix(in_srgb,theme(colors.red.500)_8%,var(--card))] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-red-500/15 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
            <AlertTriangle size={16} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[var(--text)]">
              {tr("Kenderaan Tertunggak", "My Vehicle Overdue")}
            </p>
            <p className="text-[11px] font-bold text-red-500/90">
              {data.total_overdue} {tr("item", "item")}
              {data.total_overdue === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-red-500/10">
        {items.map((item) => {
          const href = `/${sessionId}/vehicle/${item.vehicle_id}?tab=${item.target_tab || "reminders"}`
          const detail =
            item.days_overdue != null
              ? tr(`${item.days_overdue} hari lewat`, `${item.days_overdue} days overdue`)
              : item.km_overdue != null
                ? tr(`Lewat ${Number(item.km_overdue).toLocaleString()} KM`, `Overdue by ${Number(item.km_overdue).toLocaleString()} KM`)
                : item.due_date || ""
          return (
            <li key={`${item.type}-${item.id}-${item.vehicle_id}`}>
              <Link href={href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-red-500/5 active:scale-[0.99]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text)]">
                    {item.vehicle_name}
                    {item.registration_number ? (
                      <span className="ml-1.5 text-[11px] font-semibold text-[var(--muted)]">{item.registration_number}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-red-600 dark:text-red-400">
                    {item.title}
                    {detail ? ` · ${detail}` : ""}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
              </Link>
            </li>
          )
        })}
      </ul>

      {data.total_overdue > items.length && (
        <div className="border-t border-red-500/15 px-4 py-2.5">
          <Link
            href={`/${sessionId}/vehicle?filter=overdue`}
            className="text-xs font-bold text-red-600 dark:text-red-400"
          >
            {tr("Lihat semua", "View all")} →
          </Link>
        </div>
      )}
    </section>
  )
}
