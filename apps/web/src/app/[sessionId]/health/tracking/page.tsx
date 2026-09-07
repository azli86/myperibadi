"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Compass,
  CornerDownRight,
  Flame,
  Footprints,
  Gauge,
  Heart,
  History,
  Info,
  Layers,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Route,
  Share2,
  ShieldAlert,
  Sparkles,
  StopCircle,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import "leaflet/dist/leaflet.css"

interface LatLngPoint {
  lat: number
  lng: number
  timestamp: number
  accuracy?: number
  speed?: number | null
}

interface SplitLap {
  kmNumber: number
  durationSeconds: number
  paceFormatted: string
}

interface RunSession {
  id: string
  sessionId: string
  startTime: number
  endTime: number
  durationSeconds: number
  distanceMeters: number
  steps: number
  stepSource: "native" | "calculated"
  caloriesKcal: number
  avgPaceMinPerKm: number
  splits?: SplitLap[]
  targetKm?: number | null
  path: [number, number][]
  createdAt: string
}

// Distance calculation using Haversine formula (returns meters)
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

function formatPace(minPerKm: number): string {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0 || minPerKm > 60) return "—"
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return `${m}'${String(s).padStart(2, "0")}"`
}

export default function HealthTrackingPage() {
  const params = useParams()
  const router = useRouter()
  const { lang } = useLang()
  const isBm = lang === "BM"
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)

  // Tracking states
  const [trackingState, setTrackingState] = useState<"idle" | "countdown" | "running" | "paused">("idle")
  const [countdownNum, setCountdownNum] = useState(3)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [distanceMeters, setDistanceMeters] = useState(0)
  const [steps, setSteps] = useState(0)
  const [hasNativeStepSensor, setHasNativeStepSensor] = useState(false)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0)
  const [pathPoints, setPathPoints] = useState<LatLngPoint[]>([])
  const [tileMode, setTileMode] = useState<"street" | "satellite">("street")
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<"tracker" | "history">("tracker")
  const [targetGoalKm, setTargetGoalKm] = useState<number | null>(null)
  const [splits, setSplits] = useState<SplitLap[]>([])

  // Completed run summary modal
  const [completedSession, setCompletedSession] = useState<RunSession | null>(null)
  const [savedHistory, setSavedHistory] = useState<RunSession[]>([])

  // Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null)
  const polylineRef = useRef<import("leaflet").Polyline | null>(null)
  const userMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const accuracyCircleRef = useRef<import("leaflet").Circle | null>(null)
  const startMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)

  // Geolocation watch ID ref
  const watchIdRef = useRef<number | null>(null)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const stepIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimestampRef = useRef<number>(0)
  const lastLocationRef = useRef<LatLngPoint | null>(null)
  const lastSplitDistanceKmRef = useRef<number>(0)
  const lastSplitTimeRef = useRef<number>(0)

  const historyStorageKey = `myperibadi_health_runs_${sessionId}`

  // Load saved run history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(historyStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setSavedHistory(parsed)
        }
      }
    } catch {
      // ignore
    }
  }, [historyStorageKey])

  // Check native Android Step sensor availability
  useEffect(() => {
    if (typeof window !== "undefined") {
      const androidApp = (window as unknown as { AndroidApp?: { isStepSensorAvailable?: () => boolean } }).AndroidApp
      if (androidApp && typeof androidApp.isStepSensorAvailable === "function") {
        try {
          setHasNativeStepSensor(androidApp.isStepSensorAvailable())
        } catch {
          setHasNativeStepSensor(false)
        }
      }
    }
  }, [])

  // Initialize Leaflet Map
  useEffect(() => {
    let isCancelled = false

    async function initLeaflet() {
      if (!mapContainerRef.current || mapInstanceRef.current) return
      const L = await import("leaflet")
      if (isCancelled) return
      leafletRef.current = L

      // Default center: Kuala Lumpur or fallback
      const defaultCenter: [number, number] = [3.139, 101.6869]

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      })

      const tileUrl =
        tileMode === "satellite"
          ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

      const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map)
      tileLayerRef.current = tileLayer
      mapInstanceRef.current = map

      // Initial quick geolocation fix
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (isCancelled || !mapInstanceRef.current) return
            const { latitude, longitude } = pos.coords
            setCurrentCoord({ lat: latitude, lng: longitude })
            mapInstanceRef.current.setView([latitude, longitude], 16)
          },
          () => {},
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
        )
      }
    }

    void initLeaflet()

    return () => {
      isCancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [tileMode])

  // Switch Map Tile Layer
  const switchTileLayer = useCallback((mode: "street" | "satellite") => {
    setTileMode(mode)
    if (!mapInstanceRef.current || !leafletRef.current) return
    const L = leafletRef.current
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current)
    }
    const tileUrl =
      mode === "satellite"
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    const newLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(mapInstanceRef.current)
    tileLayerRef.current = newLayer
  }, [])

  // Center Map to current user position
  const centerOnUser = useCallback(() => {
    if (!mapInstanceRef.current || !currentCoord) return
    mapInstanceRef.current.setView([currentCoord.lat, currentCoord.lng], 17, { animate: true })
  }, [currentCoord])

  // Calculate live stats
  const calculatedStats = useMemo(() => {
    const km = distanceMeters / 1000
    // Pace: min per km
    const paceMinPerKm = km > 0.05 ? (elapsedSeconds / 60) / km : 0
    // Calories: ~65kcal per km for a normal runner
    const calories = Math.round(km * 65)
    // Cadence / step fallback if no hardware sensor
    const effectiveSteps = hasNativeStepSensor ? steps : Math.round(distanceMeters / 0.76) // ~76cm stride
    // Progress towards target goal
    const progressPercent = targetGoalKm ? Math.min(100, Math.round((km / targetGoalKm) * 100)) : null

    return {
      distanceKm: km.toFixed(2),
      rawKm: km,
      pace: formatPace(paceMinPerKm),
      paceNumber: paceMinPerKm,
      calories,
      effectiveSteps,
      progressPercent,
    }
  }, [distanceMeters, elapsedSeconds, hasNativeStepSensor, steps, targetGoalKm])

  // Track Split Laps (every 1.0 km)
  useEffect(() => {
    const km = distanceMeters / 1000
    const completedKmCount = Math.floor(km)
    if (completedKmCount > lastSplitDistanceKmRef.current && completedKmCount > 0) {
      const splitTimeSecs = elapsedSeconds - lastSplitTimeRef.current
      const splitPace = formatPace(splitTimeSecs / 60)
      const newSplit: SplitLap = {
        kmNumber: completedKmCount,
        durationSeconds: splitTimeSecs,
        paceFormatted: splitPace,
      }
      setSplits((prev) => [...prev, newSplit])
      lastSplitDistanceKmRef.current = completedKmCount
      lastSplitTimeRef.current = elapsedSeconds
    }
  }, [distanceMeters, elapsedSeconds])

  // Actual Tracking executor after countdown
  const beginTrackingExecution = useCallback(() => {
    setTrackingState("running")
    startTimestampRef.current = Date.now() - elapsedSeconds * 1000

    // Start timer interval
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    // Start native Android step sensor bridge
    if (typeof window !== "undefined") {
      const androidApp = (window as unknown as {
        AndroidApp?: {
          startStepTracking?: () => void
          getStepCount?: () => number
        }
      }).AndroidApp

      if (androidApp && typeof androidApp.startStepTracking === "function") {
        try {
          androidApp.startStepTracking()
          if (stepIntervalRef.current) clearInterval(stepIntervalRef.current)
          stepIntervalRef.current = setInterval(() => {
            if (typeof androidApp.getStepCount === "function") {
              const currentNativeSteps = androidApp.getStepCount()
              if (typeof currentNativeSteps === "number" && currentNativeSteps >= 0) {
                setSteps(currentNativeSteps)
              }
            }
          }, 1000)
        } catch {
          // ignore
        }
      }
    }

    // Start Geolocation watch position
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed } = position.coords
        setGpsAccuracy(accuracy)
        if (speed && speed > 0) {
          setCurrentSpeedKmh(Math.round(speed * 3.6 * 10) / 10)
        }

        const newPoint: LatLngPoint = {
          lat: latitude,
          lng: longitude,
          timestamp: position.timestamp || Date.now(),
          accuracy,
          speed,
        }

        setCurrentCoord({ lat: latitude, lng: longitude })

        // Check distance delta to filter out GPS noise
        if (lastLocationRef.current) {
          const delta = getDistanceFromLatLonInMeters(
            lastLocationRef.current.lat,
            lastLocationRef.current.lng,
            latitude,
            longitude
          )
          if (delta >= 2.5 && delta < 120) {
            setDistanceMeters((prev) => prev + delta)
            setPathPoints((prev) => [...prev, newPoint])
            lastLocationRef.current = newPoint
          }
        } else {
          lastLocationRef.current = newPoint
          setPathPoints((prev) => [...prev, newPoint])
        }

        // Update Map Marker & Polyline
        if (mapInstanceRef.current && leafletRef.current) {
          const L = leafletRef.current
          const latLng = L.latLng(latitude, longitude)

          // User live pulsating marker
          if (!userMarkerRef.current) {
            const userDotIcon = L.divIcon({
              className: "run-user-marker",
              html: `
                <div class="relative flex h-8 w-8 items-center justify-center">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-80"></span>
                  <span class="relative inline-flex h-5 w-5 rounded-full border-2 border-white bg-gradient-to-tr from-orange-600 to-amber-500 shadow-xl"></span>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })
            userMarkerRef.current = L.marker(latLng, { icon: userDotIcon }).addTo(mapInstanceRef.current)
          } else {
            userMarkerRef.current.setLatLng(latLng)
          }

          // Accuracy circle
          if (!accuracyCircleRef.current) {
            accuracyCircleRef.current = L.circle(latLng, {
              radius: accuracy || 15,
              color: "#f97316",
              fillColor: "#fb923c",
              fillOpacity: 0.15,
              weight: 1.5,
            }).addTo(mapInstanceRef.current)
          } else {
            accuracyCircleRef.current.setLatLng(latLng)
            accuracyCircleRef.current.setRadius(accuracy || 15)
          }

          // Start point marker
          if (!startMarkerRef.current && lastLocationRef.current) {
            const startIcon = L.divIcon({
              className: "run-start-marker",
              html: `
                <div class="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black uppercase text-white shadow-lg border border-white/50">
                  <span>START</span>
                </div>
              `,
              iconSize: [52, 22],
              iconAnchor: [26, 11],
            })
            startMarkerRef.current = L.marker(latLng, { icon: startIcon }).addTo(mapInstanceRef.current)
          }

          // Dynamic Route Polyline
          if (!polylineRef.current) {
            polylineRef.current = L.polyline([[latitude, longitude]], {
              color: "#f97316",
              weight: 6,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }).addTo(mapInstanceRef.current)
          } else {
            polylineRef.current.addLatLng(latLng)
          }

          // Auto-center view
          mapInstanceRef.current.panTo(latLng, { animate: true })
        }
      },
      (err) => {
        console.warn("Geolocation watch error:", err)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    )
  }, [elapsedSeconds])

  // Initiate run with athletic 3-2-1 Countdown
  const triggerStartCountdown = useCallback(() => {
    if (!navigator.geolocation) {
      showAlert(
        isBm ? "GPS Tidak Disokong" : "GPS Not Supported",
        isBm ? "Peranti anda tidak menyokong fungsi geolokasi GPS." : "Your device does not support GPS geolocation.",
        "error"
      )
      return
    }

    setTrackingState("countdown")
    setCountdownNum(3)

    let current = 3
    const cInterval = setInterval(() => {
      current -= 1
      if (current > 0) {
        setCountdownNum(current)
      } else {
        clearInterval(cInterval)
        beginTrackingExecution()
      }
    }, 900)
  }, [beginTrackingExecution, isBm, showAlert])

  // Pause Tracking
  const pauseTracking = useCallback(() => {
    setTrackingState("paused")
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  // Stop & Save Tracking
  const finishTracking = useCallback(() => {
    pauseTracking()

    // Stop native step sensor
    if (typeof window !== "undefined") {
      const androidApp = (window as unknown as {
        AndroidApp?: {
          stopStepTracking?: () => void
        }
      }).AndroidApp
      if (androidApp && typeof androidApp.stopStepTracking === "function") {
        try {
          androidApp.stopStepTracking()
        } catch {
          // ignore
        }
      }
    }
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current)
      stepIntervalRef.current = null
    }

    if (distanceMeters < 30 && elapsedSeconds < 15) {
      showAlert(
        isBm ? "Sesi Terlalu Pendek" : "Session Too Short",
        isBm
          ? "Jarak atau masa larian terlalu singkat untuk disimpan."
          : "The run distance or duration is too short to save.",
        "warning"
      )
      setTrackingState("idle")
      return
    }

    const newSession: RunSession = {
      id: `run_${Date.now()}`,
      sessionId,
      startTime: startTimestampRef.current,
      endTime: Date.now(),
      durationSeconds: elapsedSeconds,
      distanceMeters,
      steps: calculatedStats.effectiveSteps,
      stepSource: hasNativeStepSensor ? "native" : "calculated",
      caloriesKcal: calculatedStats.calories,
      avgPaceMinPerKm: calculatedStats.paceNumber,
      splits: splits.length > 0 ? splits : undefined,
      targetKm: targetGoalKm,
      path: pathPoints.map((p) => [p.lat, p.lng]),
      createdAt: new Date().toISOString(),
    }

    // Save to state and localStorage
    const updated = [newSession, ...savedHistory]
    setSavedHistory(updated)
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(updated))
    } catch {
      // ignore
    }

    setCompletedSession(newSession)
    setTrackingState("idle")
  }, [
    calculatedStats.calories,
    calculatedStats.effectiveSteps,
    calculatedStats.paceNumber,
    distanceMeters,
    elapsedSeconds,
    hasNativeStepSensor,
    historyStorageKey,
    isBm,
    pathPoints,
    pauseTracking,
    savedHistory,
    sessionId,
    showAlert,
    splits,
    targetGoalKm,
  ])

  // Reset Run Session
  const resetTracking = useCallback(() => {
    pauseTracking()
    setTrackingState("idle")
    setElapsedSeconds(0)
    setDistanceMeters(0)
    setSteps(0)
    setPathPoints([])
    setSplits([])
    lastLocationRef.current = null
    lastSplitDistanceKmRef.current = 0
    lastSplitTimeRef.current = 0

    // Reset native step count
    if (typeof window !== "undefined") {
      const androidApp = (window as unknown as {
        AndroidApp?: {
          resetStepCount?: () => void
        }
      }).AndroidApp
      if (androidApp && typeof androidApp.resetStepCount === "function") {
        try {
          androidApp.resetStepCount()
        } catch {
          // ignore
        }
      }
    }

    // Clear map layers
    if (mapInstanceRef.current) {
      if (polylineRef.current) {
        mapInstanceRef.current.removeLayer(polylineRef.current)
        polylineRef.current = null
      }
      if (startMarkerRef.current) {
        mapInstanceRef.current.removeLayer(startMarkerRef.current)
        startMarkerRef.current = null
      }
    }
  }, [pauseTracking])

  // Delete history item
  const deleteHistoryItem = useCallback(
    (id: string) => {
      const filtered = savedHistory.filter((item) => item.id !== id)
      setSavedHistory(filtered)
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(filtered))
      } catch {
        // ignore
      }
    },
    [historyStorageKey, savedHistory]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current)
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page-bg)] text-[var(--text)] selection:bg-orange-500 selection:text-white">
      {/* ── TOP APP BAR ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-4 py-3 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <Link
            href={`/${sessionId}/health`}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--text)] transition hover:bg-[var(--border)] active:scale-95"
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              <h1 className="text-base font-black tracking-tight text-[var(--text)]">
                {isBm ? "Larian & Penjejak Langkah" : "Pro Run & Step Tracker"}
              </h1>
            </div>
            <p className="text-[11px] font-semibold text-[var(--muted)]">
              {trackingState === "running"
                ? isBm
                  ? "Sesi GPS aktif • Sedang merekod"
                  : "Live GPS active • Recording run"
                : trackingState === "paused"
                ? isBm
                  ? "Sesi larian dijeda"
                  : "Run paused"
                : isBm
                ? "Sedia untuk memulakan latihan"
                : "Ready for workout"}
            </p>
          </div>
        </div>

        {/* Tab switch pills */}
        <div className="flex items-center rounded-2xl bg-[var(--surface-tint)] p-1 border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setActiveTab("tracker")}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition",
              activeTab === "tracker"
                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <Route size={14} />
            <span>{isBm ? "Larian" : "Tracker"}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition",
              activeTab === "history"
                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <History size={14} />
            <span>{isBm ? "Sejarah" : "History"}</span>
            {savedHistory.length > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-black text-white">
                {savedHistory.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── COUNTDOWN OVERLAY ── */}
      {trackingState === "countdown" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex flex-col items-center text-center">
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
              {isBm ? "BERSEDIA" : "GET READY"}
            </span>
            <div className="my-4 flex h-36 w-36 items-center justify-center rounded-full border-4 border-orange-500/30 bg-gradient-to-tr from-orange-600 to-amber-500 text-7xl font-black text-white shadow-2xl shadow-orange-500/50 animate-bounce">
              {countdownNum}
            </div>
            <p className="text-sm font-semibold text-slate-300">
              {isBm ? "Mengunci isyarat satelit GPS..." : "Locking high-accuracy GPS signal..."}
            </p>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 pb-16">
        {activeTab === "tracker" ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 md:p-6">
            
            {/* ── MAP HERO CARD ── */}
            <section
              className={cn(
                "relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--card)] shadow-xl transition-all duration-300",
                isMapExpanded ? "h-[65vh] md:h-[75vh]" : "h-[300px] md:h-[400px]"
              )}
            >
              {/* Leaflet Map */}
              <div ref={mapContainerRef} className="h-full w-full touch-none z-[1]" />

              {/* Floating Status & Sensor Badges */}
              <div className="absolute left-3.5 top-3.5 z-[10] flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-[var(--card)]/90 px-3.5 py-1.5 text-[11px] font-bold text-[var(--text)] shadow-lg backdrop-blur-md border border-[var(--border)]">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      gpsAccuracy && gpsAccuracy < 15
                        ? "bg-emerald-500 animate-ping"
                        : gpsAccuracy && gpsAccuracy < 35
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    )}
                  />
                  <span>
                    GPS: {gpsAccuracy ? `±${Math.round(gpsAccuracy)}m` : isBm ? "Mencari Satelit..." : "Searching..."}
                  </span>
                </div>

                {hasNativeStepSensor ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1.5 text-[11px] font-extrabold text-emerald-500 shadow-md backdrop-blur-md border border-emerald-500/30">
                    <Zap size={13} className="fill-emerald-500" />
                    <span>Android Hardware Sensor</span>
                  </div>
                ) : (
                  <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-sky-500/20 px-3 py-1.5 text-[11px] font-extrabold text-sky-500 shadow-md backdrop-blur-md border border-sky-500/30">
                    <Navigation size={13} />
                    <span>GPS Cadence</span>
                  </div>
                )}
              </div>

              {/* Map Action Floating Dock */}
              <div className="absolute right-3.5 top-3.5 z-[10] flex flex-col gap-2">
                <button
                  type="button"
                  onClick={centerOnUser}
                  title={isBm ? "Pusatkan Lokasi Saya" : "Center on me"}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--card)]/90 text-[var(--text)] shadow-lg backdrop-blur-md border border-[var(--border)] transition hover:scale-105 active:scale-95"
                >
                  <LocateFixed size={18} className="text-orange-500" />
                </button>

                <button
                  type="button"
                  onClick={() => switchTileLayer(tileMode === "street" ? "satellite" : "street")}
                  title={isBm ? "Tukar Peta Satelit / Jalan" : "Switch Satellite / Street"}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--card)]/90 text-[var(--text)] shadow-lg backdrop-blur-md border border-[var(--border)] transition hover:scale-105 active:scale-95"
                >
                  <Layers size={18} className="text-[var(--text)]" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMapExpanded(!isMapExpanded)}
                  title={isBm ? "Besarkan Paparan Peta" : "Toggle Full Map"}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--card)]/90 text-[var(--text)] shadow-lg backdrop-blur-md border border-[var(--border)] transition hover:scale-105 active:scale-95"
                >
                  {isMapExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </div>

              {/* Real-time speed badge over map */}
              {trackingState === "running" && currentSpeedKmh > 0 && (
                <div className="absolute bottom-3 left-3.5 z-[10] flex items-center gap-2 rounded-2xl bg-black/75 px-3.5 py-1.5 text-white shadow-xl backdrop-blur-md border border-white/10">
                  <Gauge size={15} className="text-orange-400" />
                  <span className="text-xs font-black">{currentSpeedKmh} km/h</span>
                </div>
              )}
            </section>

            {/* ── ATHLETIC HERO METRIC DASHBOARD ── */}
            <section className="rounded-[2.2rem] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6 shadow-xl relative overflow-hidden">
              {/* Background gradient decorative glow */}
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

              {/* Top Hero: Big Distance Display */}
              <div className="flex flex-col sm:flex-row items-center justify-between border-b border-[var(--border)] pb-5 gap-4">
                <div className="text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-orange-500">
                      {isBm ? "JUMLAH JARAK" : "TOTAL DISTANCE"}
                    </span>
                    {calculatedStats.progressPercent !== null && (
                      <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-black text-orange-500">
                        {calculatedStats.progressPercent}% Goal
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-center sm:justify-start gap-2">
                    <span className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-[var(--text)]">
                      {calculatedStats.distanceKm}
                    </span>
                    <span className="text-lg sm:text-2xl font-black text-orange-500">KM</span>
                  </div>
                </div>

                {/* Target Goal Selector */}
                {trackingState === "idle" && (
                  <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--surface-tint)] p-1.5 border border-[var(--border)]">
                    <span className="px-2 text-[10px] font-bold uppercase text-[var(--muted)]">
                      {isBm ? "Sasaran:" : "Goal:"}
                    </span>
                    {[
                      { label: "Bebas", val: null },
                      { label: "1 km", val: 1 },
                      { label: "3 km", val: 3 },
                      { label: "5 km", val: 5 },
                      { label: "10 km", val: 10 },
                    ].map((g) => (
                      <button
                        key={String(g.val)}
                        type="button"
                        onClick={() => setTargetGoalKm(g.val)}
                        className={cn(
                          "rounded-xl px-2.5 py-1 text-xs font-bold transition",
                          targetGoalKm === g.val
                            ? "bg-orange-500 text-white shadow-sm"
                            : "text-[var(--text)] hover:bg-[var(--border)]"
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Secondary Metrics Matrix */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* Steps */}
                <div className="flex flex-col justify-between rounded-2xl bg-[var(--surface-tint)] p-4 border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {isBm ? "Langkah" : "Steps"}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                      <Footprints size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-[var(--text)]">
                      {calculatedStats.effectiveSteps.toLocaleString()}
                    </span>
                    <span className="ml-1 text-[10px] font-bold text-[var(--muted)]">
                      {hasNativeStepSensor ? "sensor" : "gps"}
                    </span>
                  </div>
                </div>

                {/* Duration */}
                <div className="flex flex-col justify-between rounded-2xl bg-[var(--surface-tint)] p-4 border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {isBm ? "Tempoh Masa" : "Duration"}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500">
                      <Timer size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-[var(--text)]">
                      {formatDuration(elapsedSeconds)}
                    </span>
                  </div>
                </div>

                {/* Pace */}
                <div className="flex flex-col justify-between rounded-2xl bg-[var(--surface-tint)] p-4 border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {isBm ? "Purata Pace" : "Avg Pace"}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
                      <TrendingUp size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-[var(--text)]">
                      {calculatedStats.pace}
                    </span>
                    <span className="ml-1 text-[10px] font-bold text-[var(--muted)]">/km</span>
                  </div>
                </div>

                {/* Calories */}
                <div className="flex flex-col justify-between rounded-2xl bg-[var(--surface-tint)] p-4 border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {isBm ? "Kalori" : "Calories"}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-500/15 text-rose-500">
                      <Flame size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-rose-500">
                      {calculatedStats.calories}
                    </span>
                    <span className="ml-1 text-[10px] font-bold text-[var(--muted)]">kcal</span>
                  </div>
                </div>
              </div>

              {/* Lap Splits List (if available) */}
              {splits.length > 0 && (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-[var(--muted)] tracking-wider">
                      {isBm ? "Pecahan Pusingan (Splits)" : "KM Splits"}
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--muted)]">
                      {splits.length} KM selesai
                    </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {splits.map((s) => (
                      <div
                        key={s.kmNumber}
                        className="flex min-w-24 flex-col items-center rounded-xl bg-[var(--surface-tint)] px-3 py-2 text-center border border-[var(--border)]"
                      >
                        <span className="text-[10px] font-black text-orange-500">KM {s.kmNumber}</span>
                        <span className="text-xs font-black text-[var(--text)]">{s.paceFormatted}</span>
                        <span className="text-[9px] text-[var(--muted)]">{formatDuration(s.durationSeconds)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ── RUN WORKOUT CONTROLS ── */}
            <section className="mt-2 flex items-center justify-center gap-3">
              {trackingState === "idle" && (
                <button
                  type="button"
                  onClick={triggerStartCountdown}
                  className="group relative flex h-16 w-full max-w-md items-center justify-center gap-3 rounded-[2rem] bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-8 font-black text-white shadow-2xl shadow-orange-500/35 transition hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                    <Play size={22} className="fill-white translate-x-0.5" />
                  </div>
                  <span className="text-lg tracking-wide uppercase">
                    {isBm ? "Mula Larian" : "Start Run"}
                  </span>
                </button>
              )}

              {trackingState === "running" && (
                <div className="flex w-full max-w-md items-center gap-3">
                  <button
                    type="button"
                    onClick={pauseTracking}
                    className="flex h-16 flex-1 items-center justify-center gap-2 rounded-[2rem] bg-amber-500 px-6 font-black text-white shadow-xl shadow-amber-500/25 transition hover:bg-amber-600 active:scale-98"
                  >
                    <Pause size={22} className="fill-white" />
                    <span className="text-base uppercase">{isBm ? "Jeda" : "Pause"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={finishTracking}
                    className="flex h-16 flex-1 items-center justify-center gap-2 rounded-[2rem] bg-rose-600 px-6 font-black text-white shadow-xl shadow-rose-600/25 transition hover:bg-rose-700 active:scale-98"
                  >
                    <StopCircle size={22} />
                    <span className="text-base uppercase">{isBm ? "Tamat" : "Finish"}</span>
                  </button>
                </div>
              )}

              {trackingState === "paused" && (
                <div className="flex w-full max-w-md items-center gap-3">
                  <button
                    type="button"
                    onClick={beginTrackingExecution}
                    className="flex h-16 flex-1 items-center justify-center gap-2 rounded-[2rem] bg-emerald-600 px-6 font-black text-white shadow-xl shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-98"
                  >
                    <Play size={22} className="fill-white translate-x-0.5" />
                    <span className="text-base uppercase">{isBm ? "Sambung" : "Resume"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={finishTracking}
                    className="flex h-16 flex-1 items-center justify-center gap-2 rounded-[2rem] bg-rose-600 px-6 font-black text-white shadow-xl shadow-rose-600/25 transition hover:bg-rose-700 active:scale-98"
                  >
                    <StopCircle size={22} />
                    <span className="text-base uppercase">{isBm ? "Simpan" : "Save"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetTracking}
                    title={isBm ? "Set Semula Sesi" : "Reset Session"}
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[2rem] border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] shadow-md transition hover:text-rose-500 active:scale-95"
                  >
                    <RotateCcw size={20} />
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ── ATHLETIC RUN HISTORY TAB ── */
          <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-orange-500" />
                  {isBm ? "Rekod & Sejarah Larian" : "Workout History"}
                </h2>
                <p className="text-xs text-[var(--muted)] font-semibold">
                  {savedHistory.length} {isBm ? "sesi berjaya direkodkan" : "sessions recorded"}
                </p>
              </div>
            </div>

            {!savedHistory.length ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] p-12 text-center bg-[var(--card)]">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
                  <Footprints size={32} />
                </div>
                <p className="mt-4 text-base font-black text-[var(--text)]">
                  {isBm ? "Belum ada rekod larian tersimpan." : "No saved running records."}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)] max-w-xs">
                  {isBm
                    ? "Mulakan larian pertama anda hari ini untuk menjejak jarak, langkah, dan membakar kalori!"
                    : "Start your first workout today to track distance, steps, and burn calories!"}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("tracker")}
                  className="mt-5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-xs font-black uppercase text-white shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-98"
                >
                  {isBm ? "Mula Larian Sekarang" : "Start Run Now"}
                </button>
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2">
                {savedHistory.map((item) => {
                  const dateStr = new Date(item.startTime || item.createdAt).toLocaleDateString(
                    isBm ? "ms-MY" : "en-US",
                    { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
                  )
                  const distKm = (item.distanceMeters / 1000).toFixed(2)
                  return (
                    <div
                      key={item.id}
                      className="group flex flex-col justify-between rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg transition hover:border-orange-500/40 hover:shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500">
                            <Route size={16} />
                          </div>
                          <div>
                            <span className="text-xs font-black text-[var(--text)]">{dateStr}</span>
                            <div className="text-[10px] font-bold text-orange-500">
                              {item.stepSource === "native" ? "📱 Android Sensor" : "📡 GPS Cadence"}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteHistoryItem(item.id)}
                          className="rounded-xl p-2 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-500"
                          title={isBm ? "Padam rekod" : "Delete record"}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="my-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-[var(--surface-tint)] p-3">
                          <div className="text-[10px] font-bold text-[var(--muted)] uppercase">
                            {isBm ? "Jarak" : "Distance"}
                          </div>
                          <div className="mt-0.5 text-lg font-black text-[var(--text)]">{distKm} <span className="text-xs text-orange-500">km</span></div>
                        </div>

                        <div className="rounded-2xl bg-[var(--surface-tint)] p-3">
                          <div className="text-[10px] font-bold text-[var(--muted)] uppercase">
                            {isBm ? "Langkah" : "Steps"}
                          </div>
                          <div className="mt-0.5 text-lg font-black text-[var(--text)]">
                            {item.steps.toLocaleString()}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-[var(--surface-tint)] p-3">
                          <div className="text-[10px] font-bold text-[var(--muted)] uppercase">
                            {isBm ? "Masa" : "Time"}
                          </div>
                          <div className="mt-0.5 text-lg font-black text-[var(--text)]">
                            {formatDuration(item.durationSeconds)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-bold text-[var(--muted)]">
                        <span>
                          Pace: <strong className="text-[var(--text)]">{formatPace(item.avgPaceMinPerKm)}</strong>
                        </span>
                        <span className="text-rose-500 font-black">
                          🔥 {item.caloriesKcal} kcal
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── RUN COMPLETED CONGRATULATIONS MODAL ── */}
      {completedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl relative overflow-hidden">
            {/* Top Victory Gradient */}
            <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl" />
            
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-orange-600 via-amber-500 to-orange-400 text-white shadow-xl shadow-orange-500/40">
                <Trophy size={40} />
              </div>
              <h3 className="mt-4 text-2xl font-black text-[var(--text)]">
                {isBm ? "Hebat! Larian Selesai" : "Workout Completed!"}
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)] font-semibold">
                {isBm
                  ? "Sesi larian anda telah berjaya disimpan ke rekod kesihatan."
                  : "Your running session has been saved to your health history."}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[var(--surface-tint)] p-3.5 text-center border border-[var(--border)]">
                <div className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  {isBm ? "Jumlah Jarak" : "Distance"}
                </div>
                <div className="mt-1 text-2xl font-black text-[var(--text)]">
                  {(completedSession.distanceMeters / 1000).toFixed(2)} <span className="text-xs text-orange-500">km</span>
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--surface-tint)] p-3.5 text-center border border-[var(--border)]">
                <div className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  {isBm ? "Jumlah Langkah" : "Steps"}
                </div>
                <div className="mt-1 text-2xl font-black text-[var(--text)]">
                  {completedSession.steps.toLocaleString()}
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--surface-tint)] p-3.5 text-center border border-[var(--border)]">
                <div className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  {isBm ? "Tempoh Masa" : "Duration"}
                </div>
                <div className="mt-1 text-2xl font-black text-[var(--text)]">
                  {formatDuration(completedSession.durationSeconds)}
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--surface-tint)] p-3.5 text-center border border-[var(--border)]">
                <div className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  {isBm ? "Kalori Terbakar" : "Calories"}
                </div>
                <div className="mt-1 text-2xl font-black text-rose-500">
                  {completedSession.caloriesKcal} <span className="text-xs">kcal</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setCompletedSession(null)}
                className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-98"
              >
                {isBm ? "Tutup & Teruskan" : "Close & Continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletedSession(null)
                  setActiveTab("history")
                }}
                className="w-full rounded-xl py-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
              >
                {isBm ? "Lihat Sejarah Larian" : "View Run History"}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal}
    </div>
  )
}
