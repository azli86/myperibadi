"use client"

import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useCallback, useState, useSyncExternalStore } from "react"
import { MobileHome } from "./MobileHome"

// The home route picks between two screens.
//
// A phone opens on MobileHome: balance, wallets and recent activity, without the
// chart libraries. Desktop and large tablets get the full dashboard exactly as
// before.
//
// It started as an installed-PWA-only screen, but a home-screen shortcut on
// Android opens a plain Chrome tab (display-mode "browser", no WebView
// marker), so an installed app cannot be told apart reliably. The screen size
// is what the slow launch was about, so that is what decides.
//
// The full dashboard is a separate chunk. On desktop its download starts as
// soon as this module runs, before hydration, so a desktop visit waits no
// longer than it did when the dashboard was this file.

function prefersLiteHome(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (
      window.matchMedia("(max-width: 767.98px)").matches ||
      window.matchMedia("(pointer: coarse) and (max-width: 1023.98px)").matches
    )
  } catch {
    return false
  }
}

const loadDashboard = () => import("./DashboardHome")
if (typeof window !== "undefined" && !prefersLiteHome()) void loadDashboard()

const DashboardHome = dynamic(loadDashboard, { loading: () => <HomeBootSkeleton /> })

const noopSubscribe = () => () => {}

export default function HomePage() {
  const params = useParams()
  const sessionId = (params?.sessionId as string) || ""
  // The server cannot see the screen, so it renders the neutral skeleton and
  // the client picks after hydration, without a mismatch.
  const lite = useSyncExternalStore(noopSubscribe, prefersLiteHome, () => null)
  const [forceFull, setForceFull] = useState(false)
  const handOver = useCallback(() => setForceFull(true), [])

  if (lite === null) return <HomeBootSkeleton />
  if (lite && !forceFull) return <MobileHome sessionId={sessionId} onNeedsFullDashboard={handOver} />
  return <DashboardHome />
}

// Neutral on purpose: it must not look like either screen, or a desktop visit
// flashes the phone layout before the dashboard replaces it.
function HomeBootSkeleton() {
  return (
    <div className="space-y-4 px-1 pt-1" aria-busy="true">
      <div className="skeleton-surface h-44 rounded-2xl md:h-56" />
      <div className="skeleton-surface h-24 rounded-2xl" />
      <div className="skeleton-surface h-56 rounded-2xl" />
    </div>
  )
}
