"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Check,
  ChevronRight,
  Flame,
  Footprints,
  Gauge,
  History,
  Layers,
  LocateFixed,
  Maximize2,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Route,
  StopCircle,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { useTheme } from "@/components/theme/ThemeProvider"
import {
  MobilePageHeader,
  MobileIconButton,
  DesktopPageHeader,
  DesktopPageAction,
} from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"
import { usePageAlert } from "@/hooks/usePageAlert"
import "leaflet/dist/leaflet.css"

// ── MAPS TILE SERVERS (Global CDN, High-Performance) ──
const MAPS_STREET_URL = "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
const MAPS_HYBRID_URL = "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
const MAPS_TERRAIN_URL = "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

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
  isFastest?: boolean
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
  mode?: "outdoor" | "indoor"
  caloriesKcal: number
  avgPaceMinPerKm: number
  splits?: SplitLap[]
  targetKm?: number | null
  path: [number, number][]
  createdAt: string
}

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
  const { resolvedTheme } = useTheme()
  const darkTiles = resolvedTheme === "dark"
  const sessionId = (params.sessionId as string) || ""
  const { showAlert, alertModal } = usePageAlert(lang)

  // Tracking states (Mobile GPS tracking)
  const [trackingState, setTrackingState] = useState<"idle" | "countdown" | "running" | "paused">("idle")
  const [countdownNum, setCountdownNum] = useState(3)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [distanceMeters, setDistanceMeters] = useState(0)
  const [steps, setSteps] = useState(0)
  const [hasNativeStepSensor, setHasNativeStepSensor] = useState(false)
  const [runMode, setRunMode] = useState<"outdoor" | "indoor">("outdoor")
  const [isWebMotionActive, setIsWebMotionActive] = useState(false)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0)
  const [pathPoints, setPathPoints] = useState<LatLngPoint[]>([])
  const [viewMode, setViewMode] = useState<"cockpit" | "map">("cockpit")
  const [activeTab, setActiveTab] = useState<"tracker" | "history">("tracker")
  const [targetGoalKm, setTargetGoalKm] = useState<number | null>(null)
  const [splits, setSplits] = useState<SplitLap[]>([])

  // Completed run summary modal
  const [completedSession, setCompletedSession] = useState<RunSession | null>(null)
  const [savedHistory, setSavedHistory] = useState<RunSession[]>([])

  // Google Maps style state (Mobile)
  const [mapType, setMapType] = useState<"google-streets" | "google-hybrid" | "google-terrain">("google-streets")
  const [showMapTypeMenu, setShowMapTypeMenu] = useState(false)

  // Mobile Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null)
  const polylineRef = useRef<import("leaflet").Polyline | null>(null)
  const userMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const accuracyCircleRef = useRef<import("leaflet").Circle | null>(null)
  const startMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)

  // ── DESKTOP REFS & STATE (Workout History & Interactive Google Map / Splits Viewer) ──
  const desktopMapContainerRef = useRef<HTMLDivElement | null>(null)
  const desktopMapInstanceRef = useRef<import("leaflet").Map | null>(null)
  const desktopPolylineRef = useRef<import("leaflet").Polyline | null>(null)
  const desktopMarkersRef = useRef<import("leaflet").Marker[]>([])
  const desktopTileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const [desktopMapType, setDesktopMapType] = useState<"google-streets" | "google-hybrid" | "google-terrain">("google-streets")
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  // Helper to resolve tile layer config for Maps
  const getTileConfig = useCallback(
    (type: "google-streets" | "google-hybrid" | "google-terrain", isDark: boolean) => {
      if (type === "google-hybrid") {
        return {
          url: MAPS_HYBRID_URL,
          subdomains: ["0", "1", "2", "3"],
          className: "google-map-satellite",
          maxZoom: 20,
        }
      }
      if (type === "google-terrain") {
        return {
          url: MAPS_TERRAIN_URL,
          subdomains: ["0", "1", "2", "3"],
          className: isDark ? "google-map-dark" : "google-map-light",
          maxZoom: 19,
        }
      }
      // default: streets (Maps with theme monochrome filter)
      return {
        url: MAPS_STREET_URL,
        subdomains: ["0", "1", "2", "3"],
        className: isDark ? "google-map-dark" : "google-map-light",
        maxZoom: 20,
      }
    },
    []
  )

  // Geolocation watch ID ref
  const watchIdRef = useRef<number | null>(null)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const stepIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimestampRef = useRef<number>(0)
  const lastLocationRef = useRef<LatLngPoint | null>(null)
  const lastSplitDistanceKmRef = useRef<number>(0)
  const lastSplitTimeRef = useRef<number>(0)

  const historyStorageKey = `myperibadi_health_runs_${sessionId}`

  // Load saved run history (production: only genuine user workouts)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(historyStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as RunSession[]
        const realData = parsed.filter((s) => !s.id.startsWith("demo_"))
        setSavedHistory(realData)
        if (realData.length !== parsed.length) {
          localStorage.setItem(historyStorageKey, JSON.stringify(realData))
        }
      }
    } catch {
      // ignore
    }
  }, [historyStorageKey])

  // Check Android hardware Step Sensor bridge
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

  // Web Accelerometer Motion step detector for browser / stationary fallback
  useEffect(() => {
    if (trackingState !== "running") return

    let lastMagnitude = 9.8
    let isRising = false
    let lastStepTime = 0

    const handleMotion = (event: DeviceMotionEvent) => {
      // If Android native bridge is supplying steps, let it handle
      if (hasNativeStepSensor) return

      const acc = event.accelerationIncludingGravity || event.acceleration
      if (!acc) return
      const x = acc.x ?? 0
      const y = acc.y ?? 0
      const z = acc.z ?? 0
      const magnitude = Math.sqrt(x * x + y * y + z * z)
      const now = Date.now()

      if (magnitude > lastMagnitude && magnitude > 11.6) {
        isRising = true
      } else if (isRising && magnitude < lastMagnitude) {
        if (now - lastStepTime >= 240) {
          lastStepTime = now
          setSteps((prev) => prev + 1)
          setIsWebMotionActive(true)
        }
        isRising = false
      }
      lastMagnitude = magnitude
    }

    if (typeof window !== "undefined" && "DeviceMotionEvent" in window) {
      const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
      if (typeof DME.requestPermission === "function") {
        DME.requestPermission().then((res) => {
          if (res === "granted") {
            window.addEventListener("devicemotion", handleMotion)
          }
        }).catch(() => {})
      } else {
        window.addEventListener("devicemotion", handleMotion)
      }
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("devicemotion", handleMotion)
      }
    }
  }, [trackingState, hasNativeStepSensor])

  // Initialize Leaflet with Google Maps
  const initLeaflet = useCallback(async () => {
    if (!mapContainerRef.current || mapInstanceRef.current) return
    const L = await import("leaflet")
    if (!mapContainerRef.current || mapInstanceRef.current) return
    leafletRef.current = L

    const defaultCenter: [number, number] = [3.139, 101.6869]

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    })

    const conf = getTileConfig(mapType, darkTiles)
    const tileLayer = L.tileLayer(conf.url, {
      maxZoom: conf.maxZoom,
      subdomains: conf.subdomains,
      className: conf.className,
    }).addTo(map)
    tileLayerRef.current = tileLayer
    mapInstanceRef.current = map

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mapInstanceRef.current) return
          const { latitude, longitude } = pos.coords
          setCurrentCoord({ lat: latitude, lng: longitude })
          mapInstanceRef.current.setView([latitude, longitude], 16)
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      )
    }
  }, [darkTiles, getTileConfig, mapType])

  useEffect(() => {
    void initLeaflet()
  }, [initLeaflet])

  // Invalidate map on layout switch so tiles render immediately
  useEffect(() => {
    if (viewMode === "map") {
      if (!mapInstanceRef.current) {
        void initLeaflet()
      } else {
        const timer = setTimeout(() => {
          mapInstanceRef.current?.invalidateSize()
        }, 50)
        const timer2 = setTimeout(() => {
          mapInstanceRef.current?.invalidateSize()
        }, 250)
        return () => {
          clearTimeout(timer)
          clearTimeout(timer2)
        }
      }
    }
  }, [viewMode, initLeaflet])

  // Dynamically swap Google Maps tile layer when mapType or theme changes
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletRef.current) return
    const L = leafletRef.current
    if (tileLayerRef.current) {
      tileLayerRef.current.remove()
    }
    const conf = getTileConfig(mapType, darkTiles)
    const newLayer = L.tileLayer(conf.url, {
      maxZoom: conf.maxZoom,
      subdomains: conf.subdomains,
      className: conf.className,
    }).addTo(mapInstanceRef.current)
    tileLayerRef.current = newLayer
  }, [mapType, darkTiles, getTileConfig])

  // Invalidate map on layout switch
  useEffect(() => {
    if (!mapInstanceRef.current) return
    const id = window.setTimeout(() => {
      mapInstanceRef.current?.invalidateSize()
    }, 280)
    return () => window.clearTimeout(id)
  }, [viewMode])

  // Center Map to runner
  const centerOnUser = useCallback(() => {
    if (!mapInstanceRef.current || !currentCoord) return
    mapInstanceRef.current.setView([currentCoord.lat, currentCoord.lng], 17, { animate: true })
  }, [currentCoord])

  // Running telemetry stats
  const calculatedStats = useMemo(() => {
    // If indoor mode, distance is calculated directly from steps (avg running stride: 0.75m)
    // Or in outdoor mode if user is stationary/running in place (steps > 15 but distanceMeters < 20)
    const effectiveMeters =
      runMode === "indoor"
        ? steps * 0.75
        : Math.max(distanceMeters, steps > 15 && distanceMeters < 20 ? steps * 0.75 : distanceMeters)
    const km = effectiveMeters / 1000
    const paceMinPerKm = km > 0.05 ? elapsedSeconds / 60 / km : (steps > 10 && elapsedSeconds > 10 ? (elapsedSeconds / 60) / (km || 0.01) : 0)
    const calories = Math.round(km * 65 + (runMode === "indoor" || distanceMeters < 20 ? steps * 0.045 : 0))
    const effectiveSteps = hasNativeStepSensor || isWebMotionActive || steps > 0 ? steps : Math.round(distanceMeters / 0.76)
    const cadenceSpm = elapsedSeconds > 15 ? Math.round(effectiveSteps / (elapsedSeconds / 60)) : 0
    const progressPercent = targetGoalKm ? Math.min(100, Math.round((km / targetGoalKm) * 100)) : null

    return {
      distanceKm: km.toFixed(2),
      rawKm: km,
      pace: formatPace(paceMinPerKm),
      paceNumber: paceMinPerKm,
      calories,
      effectiveSteps,
      cadenceSpm,
      progressPercent,
    }
  }, [distanceMeters, elapsedSeconds, hasNativeStepSensor, isWebMotionActive, runMode, steps, targetGoalKm])

  // Split Laps Tracker (every 1 km)
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
      setSplits((prev) => {
        const next = [...prev, newSplit]
        const fastestSecs = Math.min(...next.map((s) => s.durationSeconds))
        return next.map((s) => ({ ...s, isFastest: s.durationSeconds === fastestSecs }))
      })
      lastSplitDistanceKmRef.current = completedKmCount
      lastSplitTimeRef.current = elapsedSeconds
    }
  }, [distanceMeters, elapsedSeconds])

  // Live GPS tracking execution
  const beginTrackingExecution = useCallback(() => {
    setTrackingState("running")
    startTimestampRef.current = Date.now() - elapsedSeconds * 1000

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

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
          }, 400)
        } catch {
          // ignore
        }
      }
    }

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

        if (mapInstanceRef.current && leafletRef.current) {
          const L = leafletRef.current
          const latLng = L.latLng(latitude, longitude)

          if (!userMarkerRef.current) {
            const userDotIcon = L.divIcon({
              className: "run-user-marker",
              html: `
                <div class="relative flex h-8 w-8 items-center justify-center">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full ${darkTiles ? "bg-white/40" : "bg-neutral-900/30"}"></span>
                  <span class="relative inline-flex h-4 w-4 rounded-full border-2 ${darkTiles ? "border-neutral-950 bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]" : "border-white bg-neutral-950 shadow-[0_0_10px_rgba(0,0,0,0.5)]"}"></span>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })
            userMarkerRef.current = L.marker(latLng, { icon: userDotIcon }).addTo(mapInstanceRef.current)
          } else {
            userMarkerRef.current.setLatLng(latLng)
          }

          if (!accuracyCircleRef.current) {
            accuracyCircleRef.current = L.circle(latLng, {
              radius: accuracy || 15,
              color: darkTiles ? "#737373" : "#a3a3a3",
              fillColor: darkTiles ? "#ffffff" : "#000000",
              fillOpacity: darkTiles ? 0.08 : 0.05,
              weight: 1,
            }).addTo(mapInstanceRef.current)
          } else {
            accuracyCircleRef.current.setLatLng(latLng)
            accuracyCircleRef.current.setRadius(accuracy || 15)
          }

          if (!startMarkerRef.current && lastLocationRef.current) {
            const startIcon = L.divIcon({
              className: "run-start-marker",
              html: `
                <div class="flex items-center gap-1 rounded-full ${darkTiles ? "bg-white text-black border-neutral-300" : "bg-neutral-900 text-white border-neutral-700"} px-2 py-0.5 text-[9px] font-black tracking-widest uppercase shadow-md border">
                  <span>START</span>
                </div>
              `,
              iconSize: [48, 18],
              iconAnchor: [24, 9],
            })
            startMarkerRef.current = L.marker(latLng, { icon: startIcon }).addTo(mapInstanceRef.current)
          }

          const polylineColor = mapType === "google-hybrid" ? "#00f0ff" : darkTiles ? "#f5f5f5" : "#171717"
          if (!polylineRef.current) {
            polylineRef.current = L.polyline([[latitude, longitude]], {
              color: polylineColor,
              weight: 5.5,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }).addTo(mapInstanceRef.current)
          } else {
            polylineRef.current.addLatLng(latLng)
            polylineRef.current.setStyle({ color: polylineColor })
          }

          mapInstanceRef.current.panTo(latLng, { animate: true })
        }
      },
      (err) => {
        console.warn("GPS watch error:", err)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    )
  }, [darkTiles, elapsedSeconds])

  // Countdown initiator
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

  // Pause
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

  // Finish & Save
  const finishTracking = useCallback(() => {
    pauseTracking()

    if (typeof window !== "undefined") {
      const androidApp = (window as unknown as { AndroidApp?: { stopStepTracking?: () => void } }).AndroidApp
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

    const effectiveDistance =
      runMode === "indoor"
        ? calculatedStats.effectiveSteps * 0.75
        : Math.max(distanceMeters, calculatedStats.effectiveSteps * 0.75)

    if (effectiveDistance < 20 && elapsedSeconds < 15 && calculatedStats.effectiveSteps < 30) {
      showAlert(
        isBm ? "Sesi Terlalu Pendek" : "Session Too Short",
        isBm ? "Jarak atau masa larian terlalu singkat untuk direkodkan." : "Run session is too short to record.",
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
      distanceMeters: Math.round(effectiveDistance),
      steps: calculatedStats.effectiveSteps,
      stepSource: hasNativeStepSensor ? "native" : "calculated",
      mode: runMode,
      caloriesKcal: calculatedStats.calories,
      avgPaceMinPerKm: calculatedStats.paceNumber,
      splits: splits.length > 0 ? splits : undefined,
      targetKm: targetGoalKm,
      path: pathPoints.map((p) => [p.lat, p.lng]),
      createdAt: new Date().toISOString(),
    }

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

  // Reset
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

    if (typeof window !== "undefined") {
      const androidApp = (window as unknown as { AndroidApp?: { resetStepCount?: () => void } }).AndroidApp
      if (androidApp && typeof androidApp.resetStepCount === "function") {
        try {
          androidApp.resetStepCount()
        } catch {
          // ignore
        }
      }
    }

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

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current)
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  // Aggregate stats for History
  const historySummary = useMemo(() => {
    const totalDistKm = savedHistory.reduce((acc, s) => acc + s.distanceMeters, 0) / 1000
    const totalSecs = savedHistory.reduce((acc, s) => acc + s.durationSeconds, 0)
    const totalCalories = savedHistory.reduce((acc, s) => acc + s.caloriesKcal, 0)
    const longestDistKm = savedHistory.length > 0 ? Math.max(...savedHistory.map((s) => s.distanceMeters)) / 1000 : 0
    const overallPaceMinPerKm = totalDistKm > 0 ? totalSecs / 60 / totalDistKm : 0
    return {
      totalDistKm: totalDistKm.toFixed(1),
      totalRuns: savedHistory.length,
      totalDuration: formatDuration(totalSecs),
      totalCalories,
      longestDistKm: longestDistKm.toFixed(2),
      overallAvgPace: formatPace(overallPaceMinPerKm),
    }
  }, [savedHistory])

  // Selected run on Desktop
  const selectedRun = useMemo(() => {
    if (!savedHistory.length) return null
    return savedHistory.find((r) => r.id === selectedRunId) || savedHistory[0]
  }, [savedHistory, selectedRunId])

  // Auto-select first run if none selected
  useEffect(() => {
    if (savedHistory.length > 0 && !selectedRunId) {
      setSelectedRunId(savedHistory[0].id)
    }
  }, [savedHistory, selectedRunId])


  // Initialize Desktop Leaflet Map
  const initDesktopMap = useCallback(async () => {
    if (!desktopMapContainerRef.current || desktopMapInstanceRef.current) return
    const L = leafletRef.current || (await import("leaflet"))
    leafletRef.current = L
    if (!desktopMapContainerRef.current || desktopMapInstanceRef.current) return

    const defaultCenter: [number, number] = [3.139, 101.6869]

    const map = L.map(desktopMapContainerRef.current, {
      center: defaultCenter,
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    })

    const conf = getTileConfig(desktopMapType, darkTiles)
    const tileLayer = L.tileLayer(conf.url, {
      maxZoom: conf.maxZoom,
      subdomains: conf.subdomains,
      className: conf.className,
    }).addTo(map)

    desktopTileLayerRef.current = tileLayer
    desktopMapInstanceRef.current = map

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!desktopMapInstanceRef.current) return
          if (!selectedRun?.path?.length) {
            desktopMapInstanceRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15)
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      )
    }

    setTimeout(() => {
      map.invalidateSize()
    }, 100)
    setTimeout(() => {
      map.invalidateSize()
    }, 400)
  }, [darkTiles, desktopMapType, getTileConfig, selectedRun])

  useEffect(() => {
    if (!desktopMapInstanceRef.current && desktopMapContainerRef.current) {
      void initDesktopMap()
    }
  })

  // Fit Desktop Route to Map viewport
  const fitDesktopRoute = useCallback(() => {
    if (!desktopMapInstanceRef.current) return
    const map = desktopMapInstanceRef.current
    if (desktopPolylineRef.current) {
      const bounds = desktopPolylineRef.current.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 })
      }
    } else if (selectedRun?.path && selectedRun.path.length > 0) {
      map.setView([selectedRun.path[0][0], selectedRun.path[0][1]], 15)
    } else {
      map.setView([3.139, 101.6869], 14)
    }
  }, [selectedRun])

  // Update desktop map route polyline & markers when selected run or theme changes
  useEffect(() => {
    if (!desktopMapInstanceRef.current || !selectedRun) return
    const map = desktopMapInstanceRef.current

    void (async () => {
      const L = leafletRef.current || (await import("leaflet"))
      leafletRef.current = L

      if (desktopPolylineRef.current) {
        desktopPolylineRef.current.remove()
        desktopPolylineRef.current = null
      }
      desktopMarkersRef.current.forEach((m) => m.remove())
      desktopMarkersRef.current = []

      if (!selectedRun.path || selectedRun.path.length === 0) {
        return
      }

      const latLngs = selectedRun.path.map(([lat, lng]) => L.latLng(lat, lng))

      // Outer glow track
      const polyOutline = L.polyline(latLngs, {
        color: darkTiles ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)",
        weight: 9,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map)
      desktopMarkersRef.current.push(polyOutline as unknown as import("leaflet").Marker)

      // Main GPS track
      const poly = L.polyline(latLngs, {
        color: darkTiles ? "#ffffff" : "#171717",
        weight: 4.5,
        opacity: 1,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map)
      desktopPolylineRef.current = poly

      // Start Marker (S)
      const startPt = latLngs[0]
      const startIcon = L.divIcon({
        className: "run-route-pin",
        html: `
          <div class="flex items-center justify-center h-7 w-7 rounded-full border-2 border-white bg-emerald-600 text-[11px] font-black text-white shadow-xl">
            S
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      const startMarker = L.marker(startPt, { icon: startIcon })
        .bindTooltip(isBm ? "Titik Mula" : "Start Point", { permanent: false, direction: "top" })
        .addTo(map)
      desktopMarkersRef.current.push(startMarker)

      // Finish Marker (F)
      if (latLngs.length > 1) {
        const endPt = latLngs[latLngs.length - 1]
        const endIcon = L.divIcon({
          className: "run-route-pin",
          html: `
            <div class="flex items-center justify-center h-7 w-7 rounded-full border-2 border-white bg-rose-600 text-[11px] font-black text-white shadow-xl">
              F
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })
        const endMarker = L.marker(endPt, { icon: endIcon })
          .bindTooltip(isBm ? "Titik Tamat" : "Finish Point", { permanent: false, direction: "top" })
          .addTo(map)
        desktopMarkersRef.current.push(endMarker)
      }

      const bounds = poly.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 })
      }
      setTimeout(() => {
        map.invalidateSize()
      }, 120)
    })()
  }, [selectedRun, darkTiles, isBm])

  // Desktop map tile layer swap
  useEffect(() => {
    if (!desktopMapInstanceRef.current || !leafletRef.current) return
    const L = leafletRef.current
    if (desktopTileLayerRef.current) {
      desktopTileLayerRef.current.remove()
    }
    const conf = getTileConfig(desktopMapType, darkTiles)
    const newLayer = L.tileLayer(conf.url, {
      maxZoom: conf.maxZoom,
      subdomains: conf.subdomains,
      className: conf.className,
    }).addTo(desktopMapInstanceRef.current)
    desktopTileLayerRef.current = newLayer
  }, [desktopMapType, darkTiles, getTileConfig])

  // Map resize handler
  useEffect(() => {
    const handleResize = () => {
      desktopMapInstanceRef.current?.invalidateSize()
      mapInstanceRef.current?.invalidateSize()
    }
    window.addEventListener("resize", handleResize)
    const t1 = setTimeout(handleResize, 150)
    const t2 = setTimeout(handleResize, 500)
    return () => {
      window.removeEventListener("resize", handleResize)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page-bg)] text-[var(--text)] selection:bg-[var(--text)] selection:text-[var(--page-bg)]">
      {/* ── MAPS THEME MONOCHROME FILTERS ── */}
      <style jsx global>{`
        /* Maps Monochrome Light: Clean Silver Nike/Apple aesthetic */
        .google-map-light {
          filter: grayscale(100%) contrast(108%) brightness(96%);
        }
        /* Maps Monochrome Dark: Midnight obsidian theme matching globals.css */
        .google-map-dark {
          filter: invert(100%) hue-rotate(180deg) grayscale(100%) contrast(90%) brightness(88%);
        }
        /* Maps Satellite / Hybrid: Rich contrast satellite view */
        .google-map-satellite {
          filter: contrast(106%) brightness(96%);
        }
        .leaflet-container {
          background: var(--card) !important;
        }
      `}</style>

      {/* ── DESKTOP WORKSPACE (STRICTLY WORKOUT HISTORY, ROUTE MAP & KM SPLITS) ── */}
      <div className="hidden md:block flex-1 pb-20">
        <DesktopPageHeader
          title="RunTracker"
          homeHref={`/${sessionId}/health`}
        />

        <main className="mx-auto w-full max-w-7xl px-6 py-6 space-y-6">
          {/* LIFETIME METRICS OVERVIEW BANNER */}
          <div className="modern-card rounded-[var(--radius-3xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--card-shadow)]">
            <div className="flex items-center justify-between border-b border-[var(--divider)] pb-4">
              <div>
                <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <Trophy size={20} className="text-[var(--text-soft)]" />
                  <span>{isBm ? "Hab Analisis & Sejarah Larian" : "Running Analytics & Workout History"}</span>
                </h2>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {isBm
                    ? "Paparan desktop dikhaskan untuk arkib rekod larian, analisis laluan peta, dan pecahan pace kilometer."
                    : "Desktop view is dedicated to workout archives, route map analysis, and kilometer pace splits."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-1 text-xs font-bold text-[var(--text)]">
                  {historySummary.totalRuns} {isBm ? "Sesi Tersimpan" : "Sessions Saved"}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-center">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{isBm ? "Jumlah Jarak" : "Total Distance"}</div>
                <div className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                  {historySummary.totalDistKm} <span className="text-xs font-bold text-[var(--muted)]">KM</span>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{isBm ? "Jumlah Larian" : "Workouts"}</div>
                <div className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                  {historySummary.totalRuns}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{isBm ? "Masa Larian" : "Total Time"}</div>
                <div className="mt-1 text-2xl font-black tabular-nums font-mono text-[var(--text)]">
                  {historySummary.totalDuration}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{isBm ? "Pace Purata" : "Overall Pace"}</div>
                <div className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                  {historySummary.overallAvgPace}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{isBm ? "Jarak Terjauh" : "Longest Run"}</div>
                <div className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                  {historySummary.longestDistKm} <span className="text-xs font-bold text-[var(--muted)]">KM</span>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{isBm ? "Kalori Terbakar" : "Calories"}</div>
                <div className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                  {historySummary.totalCalories} <span className="text-xs font-bold text-[var(--muted)]">kcal</span>
                </div>
              </div>
            </div>
          </div>

          {/* TWO COLUMN WORKSPACE: LIST ON LEFT, INTERACTIVE MAP & SPLITS ON RIGHT */}
          <div className="grid grid-cols-12 gap-6 items-start">
            {/* LEFT: WORKOUT HISTORY LIST */}
            <div className="col-span-12 lg:col-span-5 xl:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                  {isBm ? "Senarai Sesi Larian" : "Workout Sessions"} ({savedHistory.length})
                </span>
                {savedHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(isBm ? "Kosongkan semua rekod larian?" : "Clear all workout history?")) {
                        setSavedHistory([])
                        setSelectedRunId(null)
                        localStorage.removeItem(historyStorageKey)
                      }
                    }}
                    className="text-[11px] font-bold text-[var(--muted)] hover:text-rose-500 transition"
                  >
                    {isBm ? "Kosongkan Semua" : "Clear All"}
                  </button>
                )}
              </div>

              {!savedHistory.length ? (
                <div className="modern-card flex flex-col items-center justify-center rounded-[var(--radius-2xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-[var(--card-shadow)]">
                  <Footprints size={32} className="text-[var(--muted)]" />
                  <p className="mt-3 text-sm font-black text-[var(--text)]">
                    {isBm ? "Belum ada rekod larian." : "No workouts recorded yet."}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)] max-w-xs">
                    {isBm
                      ? "Mulakan larian di telefon pintar anda menggunakan penjejak GPS. Semua rekod larian dan peta laluan akan disimpan dan dipaparkan di sini secara automatik."
                      : "Start a run on your smartphone using the GPS tracker. All your workout records and route maps will be saved and displayed here automatically."}
                  </p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-270px)] space-y-2.5 overflow-y-auto pr-1">
                  {savedHistory.map((item) => {
                    const isSelected = selectedRun?.id === item.id
                    const dateStr = new Date(item.startTime || item.createdAt).toLocaleDateString(
                      isBm ? "ms-MY" : "en-US",
                      { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
                    )
                    const distKm = (item.distanceMeters / 1000).toFixed(2)
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedRunId(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedRunId(item.id)
                          }
                        }}
                        className={cn(
                          "modern-card group relative cursor-pointer rounded-[var(--radius-2xl)] border p-4 text-left shadow-xs transition-all",
                          isSelected
                            ? "border-[var(--text)] bg-[var(--card)] ring-2 ring-[var(--text)]/20 shadow-md"
                            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-tint)]"
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                isSelected ? "bg-emerald-500 animate-pulse" : "bg-[var(--muted)]"
                              )}
                            />
                            <span className="text-xs font-black text-[var(--text)]">{dateStr}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteHistoryItem(item.id)
                              if (selectedRunId === item.id) {
                                setSelectedRunId(null)
                              }
                            }}
                            title={isBm ? "Padam rekod" : "Delete"}
                            className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-tint-strong)] hover:text-rose-500 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div className="my-3 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                            <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{isBm ? "Jarak" : "Distance"}</div>
                            <div className="mt-0.5 text-base font-black tabular-nums text-[var(--text)]">{distKm} <span className="text-[10px] text-[var(--muted)]">km</span></div>
                          </div>
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                            <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{isBm ? "Pace" : "Pace"}</div>
                            <div className="mt-0.5 text-base font-black tabular-nums text-[var(--text)]">{formatPace(item.avgPaceMinPerKm)}</div>
                          </div>
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                            <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{isBm ? "Masa" : "Time"}</div>
                            <div className="mt-0.5 font-mono text-base font-black tabular-nums text-[var(--text)]">{formatDuration(item.durationSeconds)}</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-medium text-[var(--muted)]">
                          <span className="flex items-center gap-1.5">
                            <Footprints size={12} />
                            <span>{item.steps.toLocaleString()} {isBm ? "langkah" : "steps"}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {item.splits && item.splits.length > 0 && (
                              <span className="rounded-full bg-[var(--surface-tint-strong)] px-2 py-0.5 text-[10px] font-bold text-[var(--text)]">
                                {item.splits.length} Splits
                              </span>
                            )}
                            <span className="font-bold tabular-nums text-[var(--text)]">{item.caloriesKcal} kcal</span>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: INTERACTIVE MAP & KM SPLITS */}
            <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
              {/* MAP CONTAINER CARD (ALWAYS MOUNTED & INTERACTIVE) */}
              <div className="modern-card overflow-hidden rounded-[var(--radius-3xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between border-b border-[var(--divider)] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                      <Route size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[var(--text)]">
                        {isBm ? "Laluan GPS & Visualisasi Peta" : "GPS Route & Map Visualization"}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                        {selectedRun ? (
                          <>
                            <span>{new Date(selectedRun.startTime || selectedRun.createdAt).toLocaleDateString(isBm ? "ms-MY" : "en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                            <span>•</span>
                            <span>{(selectedRun.distanceMeters / 1000).toFixed(2)} KM</span>
                            <span>•</span>
                            <span>{formatPace(selectedRun.avgPaceMinPerKm)}/km</span>
                          </>
                        ) : (
                          <span>{isBm ? "Peta interaktif aktif • Sedia untuk memplot laluan larian" : "Interactive map active • Ready to plot workout routes"}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Controls: Recenter and Style Switcher */}
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-tint)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setDesktopMapType("google-streets")}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
                          desktopMapType === "google-streets"
                            ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                            : "text-[var(--muted)] hover:text-[var(--text)]"
                        )}
                      >
                        {isBm ? "Jalan" : "Street"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesktopMapType("google-hybrid")}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
                          desktopMapType === "google-hybrid"
                            ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                            : "text-[var(--muted)] hover:text-[var(--text)]"
                        )}
                      >
                        {isBm ? "Satelit" : "Satellite"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesktopMapType("google-terrain")}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
                          desktopMapType === "google-terrain"
                            ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                            : "text-[var(--muted)] hover:text-[var(--text)]"
                        )}
                      >
                        {isBm ? "Rupa Bumi" : "Terrain"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={fitDesktopRoute}
                      title={isBm ? "Muat Semula Laluan" : "Fit Route to Screen"}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)] transition hover:bg-[var(--surface-tint-strong)]"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Map element */}
                <div className="relative h-[440px] min-h-[440px] w-full bg-[var(--card)]">
                  <div ref={desktopMapContainerRef} className="h-full min-h-[440px] w-full z-0" />

                  {/* Maps badge */}
                  <div className="pointer-events-none absolute bottom-3 left-3 z-[10] flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1 shadow-md backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)]">Maps</span>
                  </div>

                  {/* Route pin legend or status banner */}
                  {selectedRun && selectedRun.path && selectedRun.path.length > 0 ? (
                    <div className="pointer-events-none absolute bottom-3 right-3 z-[10] flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1 shadow-md backdrop-blur-md text-[10px] font-bold text-[var(--text)]">
                      <span className="flex items-center gap-1">
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-bold text-white">S</span>
                        <span>{isBm ? "Mula" : "Start"}</span>
                      </span>
                      <span className="text-[var(--divider)]">|</span>
                      <span className="flex items-center gap-1">
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-600 text-[8px] font-bold text-white">F</span>
                        <span>{isBm ? "Tamat" : "Finish"}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="pointer-events-none absolute bottom-3 right-3 z-[10] rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1 text-[11px] font-medium text-[var(--muted)] shadow-md backdrop-blur-md">
                      {isBm ? "Peta GPS Aktif" : "GPS Map Active"}
                    </div>
                  )}
                </div>
              </div>

              {/* KM SPLITS & PACE ANALYSIS (OR READY TO RECORD NOTICE) */}
              {selectedRun ? (
                <div className="modern-card rounded-[var(--radius-3xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--card-shadow)]">
                  <div className="flex items-center justify-between border-b border-[var(--divider)] pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                        <Gauge size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-[var(--text)]">
                          {isBm ? "Pecahan Pace Setiap Kilometer (KM Splits)" : "Kilometer Splits & Pace Analysis"}
                        </h4>
                        <p className="text-[11px] text-[var(--muted)]">
                          {isBm
                            ? "Analisis kelajuan larian setiap selang 1.00 KM sepanjang laluan"
                            : "Lap duration and pace breakdown every 1.00 KM along the route"}
                        </p>
                      </div>
                    </div>

                    {selectedRun.splits && selectedRun.splits.length > 0 && (
                      <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1 text-[11px] font-bold text-[var(--text)]">
                        <Trophy size={13} className="text-amber-500" />
                        <span>
                          {isBm ? "Pecutan Terpantas: " : "Fastest Split: "}
                          {selectedRun.splits.find((s) => s.isFastest)?.paceFormatted || selectedRun.splits[0].paceFormatted}/km
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedRun.splits && selectedRun.splits.length > 0 ? (
                    <div className="mt-4 space-y-2.5">
                      {selectedRun.splits.map((lap) => {
                        const maxSplitSecs = Math.max(...selectedRun.splits!.map((s) => s.durationSeconds))
                        const barWidthPct = Math.max(25, Math.round((lap.durationSeconds / maxSplitSecs) * 100))
                        return (
                          <div
                            key={lap.kmNumber}
                            className={cn(
                              "flex items-center justify-between gap-4 rounded-xl border p-3 transition",
                              lap.isFastest
                                ? "border-[var(--text)] bg-[var(--surface-tint-strong)]"
                                : "border-[var(--border)] bg-[var(--surface-tint)]"
                            )}
                          >
                            <div className="flex items-center gap-3 w-28 shrink-0">
                              <span className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black",
                                lap.isFastest ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "bg-[var(--card)] text-[var(--text)] border border-[var(--border)]"
                              )}>
                                {lap.kmNumber}
                              </span>
                              <div>
                                <div className="text-xs font-black text-[var(--text)]">KM {lap.kmNumber}</div>
                                <div className="text-[10px] font-medium text-[var(--muted)]">{formatDuration(lap.durationSeconds)}</div>
                              </div>
                            </div>

                            {/* Pace bar representation */}
                            <div className="flex-1 max-w-xs">
                              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--card)] border border-[var(--border)]">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    lap.isFastest ? "bg-emerald-500" : "bg-[var(--text)]"
                                  )}
                                  style={{ width: `${barWidthPct}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-right">
                              {lap.isFastest && (
                                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  <Trophy size={10} />
                                  {isBm ? "Terpantas" : "Fastest"}
                                </span>
                              )}
                              <span className="font-mono text-sm font-black tabular-nums text-[var(--text)]">
                                {lap.paceFormatted}<span className="text-[10px] text-[var(--muted)]">/km</span>
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] p-6 text-center">
                      <Gauge size={24} className="mx-auto text-[var(--muted)]" />
                      <p className="mt-2 text-xs font-bold text-[var(--text)]">
                        {isBm ? "Tiada rekod pecahan kilometer tersedia" : "No kilometer splits recorded"}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--muted)] max-w-sm mx-auto">
                        {isBm
                          ? "Pecahan 1KM direkodkan secara automatik setiap kali larian anda melintasi jarak 1,000 meter."
                          : "1KM splits are automatically stamped every time your GPS distance crosses 1,000 meters."}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="modern-card flex flex-col items-center justify-center rounded-[var(--radius-3xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-[var(--card-shadow)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]">
                    <Route size={24} />
                  </div>
                  <h4 className="mt-3 text-sm font-black text-[var(--text)]">
                    {savedHistory.length > 0
                      ? isBm ? "Pilih Sesi Larian" : "Select a Workout"
                      : isBm ? "Sedia Memplot Laluan" : "Ready to Plot GPS Route"}
                  </h4>
                  <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">
                    {savedHistory.length > 0
                      ? isBm
                        ? "Pilih mana-mana sesi larian dari senarai di sebelah kiri untuk melihat laluan pada peta dan analisis pace."
                        : "Choose a workout from the list on the left to view its route on the map and pace splits."
                      : isBm
                        ? "Mulakan larian di telefon pintar anda. Laluan GPS dan pecahan pace kilometer akan dipaparkan di peta atas sebaik sahaja anda selesai berlari."
                        : "Start a run on your smartphone. The GPS route and kilometer splits will be plotted on the map above as soon as you finish your workout."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ── MOBILE WORKSPACE (ATHLETIC RUN TRACKER & RUN HISTORY) ── */}
      <div className="md:hidden flex flex-col flex-1">
        <MobilePageHeader
          className="border-b border-[color:var(--border)] pb-4"
          title="RunTracker"
          fallbackHref={`/${sessionId}/health`}
          action={
            <div className="flex items-center gap-1.5">
              {activeTab === "tracker" && (
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === "cockpit" ? "map" : "cockpit")}
                  className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 text-xs font-bold text-[var(--text)]"
                >
                  {viewMode === "cockpit" ? <Route size={14} /> : <Gauge size={14} />}
                  <span>{viewMode === "cockpit" ? (isBm ? "HUD Peta" : "Map HUD") : (isBm ? "Metrik" : "Metrics")}</span>
                </button>
              )}
            </div>
          }
        />

      {/* ── COUNTDOWN OVERLAY ── */}
      {trackingState === "countdown" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-2xl">
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--muted)]">
            {isBm ? "BERSEDIA" : "GET READY"}
          </span>
          <div className="my-6 flex h-36 w-36 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] text-7xl font-black text-[var(--text)] shadow-2xl animate-pulse">
            {countdownNum}
          </div>
          <p className="text-xs font-medium text-[var(--text-soft)]">
            {isBm ? "Mengunci isyarat GPS OpenStreetMap..." : "Locking high-accuracy GPS signal..."}
          </p>
        </div>
      )}

      {/* ── MAIN CONTENT: FULL-WIDE ON MOBILE (px-1) MATCHING HEALTH DASHBOARD ── */}
      <main className="flex-1 pb-24">
        {/* TOP STATUS RIBBON */}
        <div className="mx-auto w-full max-w-5xl px-1 pt-1 md:px-6 md:pt-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--divider)] pb-3">
            {/* Tab pill switcher */}
            <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] p-1">
              <button
                type="button"
                onClick={() => setActiveTab("tracker")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition",
                  activeTab === "tracker"
                    ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                <Route size={13} />
                <span>{isBm ? "Larian" : "Tracker"}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition",
                  activeTab === "history"
                    ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                <History size={13} />
                <span>{isBm ? "Sejarah" : "History"}</span>
                {savedHistory.length > 0 && (
                  <span className="ml-1 rounded-full bg-[var(--surface-tint-strong)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--text)]">
                    {savedHistory.length}
                  </span>
                )}
              </button>
            </div>

            {/* GPS Signal badge */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1 text-[11px] font-medium text-[var(--text)]">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    gpsAccuracy && gpsAccuracy < 15
                      ? "bg-[var(--text)] animate-ping"
                      : gpsAccuracy && gpsAccuracy < 35
                      ? "bg-[var(--text-soft)]"
                      : "bg-[var(--muted)]"
                  )}
                />
                <span className="text-[10px] font-bold">
                  {gpsAccuracy ? `±${Math.round(gpsAccuracy)}m` : isBm ? "Mencari GPS..." : "Searching GPS..."}
                </span>
              </div>

              {hasNativeStepSensor && (
                <div className="hidden sm:flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-2.5 py-1 text-[10px] font-bold text-[var(--text)]">
                  <Zap size={11} />
                  <span>{isBm ? "Sensor Perkakasan" : "Hardware Sensor"}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {activeTab === "tracker" ? (
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 pt-3 md:px-6 md:pt-4">
            {/* ── RUN COCKPIT VIEW ── */}
            <div className={cn("space-y-4", viewMode === "cockpit" ? "block" : "hidden")}>
                {/* 1. GIANT ATHLETIC DISTANCE DISPLAY */}
                <div className="modern-card relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] p-5 text-center shadow-[var(--card-shadow)] md:rounded-[var(--radius-3xl)] md:p-8">
                  {/* Subtle top indicator */}
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                    <span>
                      {trackingState === "running"
                        ? runMode === "indoor"
                          ? isBm ? "● LARI SETEMPAT / TREADMILL" : "● INDOOR / TREADMILL"
                          : isBm ? "● SEDANG BERLARI (GPS)" : "● LIVE RUN (GPS)"
                        : trackingState === "paused"
                        ? isBm ? "❚❚ DIJEDA" : "❚❚ PAUSED"
                        : isBm ? "SEDIA UNTUK LARI" : "READY TO RUN"}
                    </span>
                    {calculatedStats.progressPercent !== null && (
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text)]">
                        {calculatedStats.progressPercent}% {isBm ? "Sasaran" : "Target"}
                      </span>
                    )}
                  </div>

                  {/* Main giant number */}
                  <div className="my-4 flex flex-col items-center justify-center">
                    <div className="text-7xl font-black tabular-nums tracking-tighter text-[var(--text)] sm:text-8xl md:text-9xl">
                      {calculatedStats.distanceKm}
                    </div>
                    <div className="mt-1 text-sm font-black tracking-widest text-[var(--muted)] sm:text-base">
                      {isBm ? "KILOMETER" : "KILOMETERS"}
                    </div>
                  </div>

                  {/* Big athletic digital clock */}
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-1.5">
                    <Timer size={15} className="text-[var(--muted)]" />
                    <span className="text-xl font-black tabular-nums tracking-wider text-[var(--text)] sm:text-2xl font-mono">
                      {formatDuration(elapsedSeconds)}
                    </span>
                  </div>

                  {/* Target Goal & Run Mode (when idle) */}
                  {trackingState === "idle" && (
                    <div className="mt-6 border-t border-[var(--divider)] pt-4 space-y-4">
                      {/* Mode Segmented Selector */}
                      <div className="flex flex-col items-center">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                          {isBm ? "Pilih Mod Larian:" : "Select Run Mode:"}
                        </div>
                        <div className="inline-flex rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-1 w-full max-w-sm">
                          <button
                            type="button"
                            onClick={() => setRunMode("outdoor")}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-black transition",
                              runMode === "outdoor"
                                ? "bg-[var(--card)] text-[var(--text)] shadow-xs border border-[var(--border)]"
                                : "text-[var(--muted)] hover:text-[var(--text)]"
                            )}
                          >
                            <Navigation size={13} />
                            <span>{isBm ? "Luar (GPS)" : "Outdoor (GPS)"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRunMode("indoor")}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-black transition",
                              runMode === "indoor"
                                ? "bg-[var(--card)] text-[var(--text)] shadow-xs border border-[var(--border)]"
                                : "text-[var(--muted)] hover:text-[var(--text)]"
                            )}
                          >
                            <Footprints size={13} />
                            <span>{isBm ? "Setempat / Treadmill" : "Indoor / Treadmill"}</span>
                          </button>
                        </div>
                        {runMode === "indoor" && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--muted)] text-center">
                            {isBm
                              ? "⚡ Penderia langkah aktif: Jarak & kalori dikira daripada langkah setempat."
                              : "⚡ Step sensor active: Distance & calories calculated from stationary steps."}
                          </p>
                        )}
                      </div>

                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] text-center">
                        {isBm ? "Tetapkan Sasaran Larian:" : "Set Target Goal:"}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {[
                          { label: isBm ? "Bebas" : "Free", val: null },
                          { label: "1 km", val: 1 },
                          { label: "3 km", val: 3 },
                          { label: "5 km (5K)", val: 5 },
                          { label: "10 km (10K)", val: 10 },
                          { label: isBm ? "21 km (Separuh)" : "21 km (Half)", val: 21 },
                        ].map((g) => (
                          <button
                            key={String(g.val)}
                            type="button"
                            onClick={() => setTargetGoalKm(g.val)}
                            className={cn(
                              "rounded-full px-3.5 py-1 text-xs font-bold transition",
                              targetGoalKm === g.val
                                ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs"
                                : "border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text-soft)] hover:text-[var(--text)]"
                            )}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>

                      {/* ── HERO START BUTTON (NIKE RUN CLUB ICONIC FOCUS) ── */}
                      <div className="mt-6 flex flex-col items-center justify-center pt-2">
                        <button
                          type="button"
                          onClick={triggerStartCountdown}
                          className="group relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 ring-4 ring-[var(--surface-tint-strong)] cursor-pointer"
                          title={isBm ? "Ketik untuk mula larian" : "Tap to start run"}
                        >
                          {/* Concentric athletic pulsing radar rings */}
                          <span className="absolute -inset-3 rounded-full border-2 border-[var(--text)]/20 animate-ping pointer-events-none" />
                          <span className="absolute -inset-1 rounded-full border border-[var(--border-strong)] pointer-events-none" />

                          <div className="flex flex-col items-center justify-center">
                            <Play size={32} className="translate-x-0.5 fill-current" />
                            <span className="mt-1 text-xs font-black uppercase tracking-widest">
                              {isBm ? "MULA" : "START"}
                            </span>
                          </div>
                        </button>

                        <div className="mt-4 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-1.5 text-xs font-bold text-[var(--text)]">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              gpsAccuracy && gpsAccuracy < 25 ? "bg-emerald-500 animate-pulse" : "bg-[var(--muted)]"
                            )}
                          />
                          <span>
                            {gpsAccuracy && gpsAccuracy < 25
                              ? isBm ? "GPS bersedia • Ketik MULA untuk berlari" : "GPS ready • Tap START to begin"
                              : isBm ? "Ketik butang MULA untuk menjejak" : "Tap START to begin tracking"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* IN-CARD RUNNING CONTROLS */}
                  {trackingState === "running" && (
                    <div className="mt-6 flex flex-col items-center justify-center border-t border-[var(--divider)] pt-4">
                      <button
                        type="button"
                        onClick={pauseTracking}
                        className="flex h-14 items-center gap-2.5 rounded-full border-2 border-[var(--border-strong)] bg-[var(--card)] px-8 text-xs font-black uppercase tracking-wider text-[var(--text)] shadow-lg transition hover:bg-[var(--surface-tint-strong)] active:scale-95 cursor-pointer"
                      >
                        <Pause size={20} className="fill-current" />
                        <span>{isBm ? "Jeda Larian" : "Pause Run"}</span>
                      </button>
                      <span className="mt-2 text-[11px] font-medium text-[var(--muted)]">
                        {isBm ? "Larian sedang dirakam • Ketik untuk jeda" : "Run in progress • Tap to pause"}
                      </span>
                    </div>
                  )}

                  {/* IN-CARD PAUSED CONTROLS */}
                  {trackingState === "paused" && (
                    <div className="mt-6 flex flex-col items-center justify-center gap-3 border-t border-[var(--divider)] pt-4">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={beginTrackingExecution}
                          className="flex h-13 w-13 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-lg transition hover:opacity-90 active:scale-95 sm:h-14 sm:w-14"
                          title={isBm ? "Sambung larian" : "Resume run"}
                        >
                          <Play size={22} className="translate-x-0.5 fill-current" />
                        </button>
                        <button
                          type="button"
                          onClick={finishTracking}
                          className="flex h-13 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-5 text-xs font-black uppercase tracking-wider text-[var(--text)] shadow-md transition hover:bg-[var(--card-active)] active:scale-95 sm:h-14"
                        >
                          <StopCircle size={18} />
                          <span>{isBm ? "Tamat & Simpan" : "Finish & Save"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={resetTracking}
                          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] shadow-xs transition hover:text-[var(--text)] active:scale-95 sm:h-12 sm:w-12"
                          title={isBm ? "Set Semula" : "Reset"}
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                      <span className="text-[11px] font-medium text-[var(--muted)]">
                        {isBm ? "Sesi dijeda • Sambung atau tamatkan bila selesai" : "Session paused • Resume or finish when done"}
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. 4-METRIC ATHLETIC TELEMETRY TILES */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
                  {/* Avg Pace */}
                  <div className="modern-card flex flex-col justify-between rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs md:rounded-[var(--radius-2xl)] md:p-4">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>{isBm ? "Pace Purata" : "Avg Pace"}</span>
                      <TrendingUp size={14} />
                    </div>
                    <div className="mt-2.5 md:mt-3">
                      <div className="text-2xl font-black tabular-nums tracking-tight text-[var(--text)] sm:text-3xl">
                        {calculatedStats.pace}
                      </div>
                      <div className="text-[10px] font-bold text-[var(--muted)]">MIN / KM</div>
                    </div>
                  </div>

                  {/* Current Speed */}
                  <div className="modern-card flex flex-col justify-between rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs md:rounded-[var(--radius-2xl)] md:p-4">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>{isBm ? "Kelajuan" : "Speed"}</span>
                      <Gauge size={14} />
                    </div>
                    <div className="mt-2.5 md:mt-3">
                      <div className="text-2xl font-black tabular-nums tracking-tight text-[var(--text)] sm:text-3xl">
                        {currentSpeedKmh}
                      </div>
                      <div className="text-[10px] font-bold text-[var(--muted)]">{isBm ? "KM / JAM" : "KM / H"}</div>
                    </div>
                  </div>

                  {/* Cadence / Steps */}
                  <div className="modern-card flex flex-col justify-between rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs md:rounded-[var(--radius-2xl)] md:p-4">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>{isBm ? "Langkah" : "Steps"}</span>
                      <Footprints size={14} />
                    </div>
                    <div className="mt-2.5 md:mt-3">
                      <div className="text-2xl font-black tabular-nums tracking-tight text-[var(--text)] sm:text-3xl">
                        {calculatedStats.effectiveSteps.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-bold text-[var(--muted)]">
                        {calculatedStats.cadenceSpm > 0 ? `${calculatedStats.cadenceSpm} SPM` : hasNativeStepSensor ? (isBm ? "SENSOR" : "HARDWARE") : "GPS"}
                      </div>
                    </div>
                  </div>

                  {/* Calories */}
                  <div className="modern-card flex flex-col justify-between rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs md:rounded-[var(--radius-2xl)] md:p-4">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      <span>{isBm ? "Kalori" : "Calories"}</span>
                      <Flame size={14} />
                    </div>
                    <div className="mt-2.5 md:mt-3">
                      <div className="text-2xl font-black tabular-nums tracking-tight text-[var(--text)] sm:text-3xl">
                        {calculatedStats.calories}
                      </div>
                      <div className="text-[10px] font-bold text-[var(--muted)]">{isBm ? "KCAL TERBAKAR" : "KCAL BURNED"}</div>
                    </div>
                  </div>
                </div>

                {/* 3. MINI MAP PREVIEW CARD */}
                <div
                  onClick={() => setViewMode("map")}
                  className="modern-card modern-card-interactive group relative flex h-32 cursor-pointer items-center justify-between overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs transition hover:border-[var(--border-strong)] md:h-36 md:rounded-[var(--radius-3xl)]"
                >
                  <div className="z-10 max-w-[65%]">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                      <Route size={15} />
                      <span>{isBm ? "Peta Langsung" : "Live Map View"}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {isBm
                        ? "Ketik untuk melihat peta skrin penuh dengan jejak laluan & mod satelit."
                        : "Tap to view full interactive map with live route & satellite mode."}
                    </p>
                  </div>
                  <div className="z-10 flex h-9 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)] shadow-sm md:h-10 md:px-3.5">
                    <span>{isBm ? "Buka Peta" : "Open Map"}</span>
                    <ChevronRight size={14} />
                  </div>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 opacity-15 transition group-hover:opacity-25">
                    <Navigation size={90} className="text-[var(--text)]" />
                  </div>
                </div>

                {/* 4. SPLIT LAPS TABLE */}
                {splits.length > 0 && (
                  <div className="modern-card rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs md:rounded-[var(--radius-3xl)] md:p-5">
                    <div className="mb-3 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                        {isBm ? "Pecahan Kilometer (Splits)" : "KM Splits"}
                      </span>
                      <span className="text-xs font-bold text-[var(--text)]">
                        {splits.length} KM {isBm ? "SELESAI" : "COMPLETED"}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {splits.map((s) => (
                        <div
                          key={s.kmNumber}
                          className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2 text-xs md:px-4"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[var(--text)]">KM {s.kmNumber}</span>
                            {s.isFastest && (
                              <span className="rounded-full bg-[var(--text)] px-1.5 py-0.2 text-[9px] font-black text-[var(--page-bg)]">
                                {isBm ? "TERPANTAS" : "FASTEST"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 font-mono">
                            <span className="font-bold text-[var(--text)]">{s.paceFormatted} /km</span>
                            <span className="text-[var(--muted)]">{formatDuration(s.durationSeconds)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* ── FULL HUD MAP VIEW (FULL SCREEN MOBILE GPS) ── */}
            <div
              className={cn(
                "relative h-[calc(100dvh-105px)] min-h-[560px] w-full overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--card-shadow)] md:h-[calc(100dvh-180px)] md:rounded-[var(--radius-3xl)]",
                viewMode === "map" ? "block" : "hidden"
              )}
            >
              {/* Leaflet container */}
              <div ref={mapContainerRef} className="h-full min-h-[560px] w-full touch-none z-[1]" />

              {/* 1. Floating Map HUD Top Bar */}
              <div className="pointer-events-none absolute inset-x-2 top-2 z-[15] flex items-center justify-between gap-1.5 md:inset-x-3 md:top-3 md:gap-2">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1.5 shadow-lg backdrop-blur-md md:gap-3 md:px-4 md:py-2">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] md:text-[10px]">{isBm ? "Jarak" : "Dist"}</div>
                    <div className="text-base font-black tabular-nums text-[var(--text)] md:text-lg">{calculatedStats.distanceKm} KM</div>
                  </div>
                  <div className="h-5 w-px bg-[var(--divider)] md:h-6" />
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] md:text-[10px]">{isBm ? "Pace" : "Pace"}</div>
                    <div className="text-base font-black tabular-nums text-[var(--text)] md:text-lg">{calculatedStats.pace}</div>
                  </div>
                  <div className="h-5 w-px bg-[var(--divider)] md:h-6" />
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] md:text-[10px]">{isBm ? "Masa" : "Time"}</div>
                    <div className="text-base font-black tabular-nums text-[var(--text)] font-mono md:text-lg">{formatDuration(elapsedSeconds)}</div>
                  </div>
                </div>

                {/* Switch back to cockpit button */}
                <button
                  type="button"
                  onClick={() => setViewMode("cockpit")}
                  className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 text-xs font-bold text-[var(--text)] shadow-lg backdrop-blur-md transition hover:bg-[var(--surface-tint-strong)] active:scale-95 md:h-11 md:px-4 cursor-pointer"
                >
                  <Gauge size={14} />
                  <span>{isBm ? "Metrik" : "Metrics"}</span>
                </button>
              </div>

              {/* 2. Map Brand Badge (Top-Left below top bar) */}
              <div className="pointer-events-none absolute left-2.5 top-15 z-[12] flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--text-soft)] shadow-md backdrop-blur-md md:left-3 md:top-16">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span>Maps</span>
                {mapType === "google-hybrid" && <span className="text-[9px] text-[var(--muted)]">• Satelit</span>}
              </div>

              {/* 3. Map Controls Tools Dock (Top-Right below top bar - Zero clash with bottom buttons!) */}
              <div className="absolute right-2.5 top-15 z-[15] flex flex-col items-end gap-2 md:right-3 md:top-16">
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMapTypeMenu(!showMapTypeMenu)}
                    title={isBm ? "Tukar gaya peta" : "Change Map style"}
                    className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/90 text-[var(--text)] shadow-lg backdrop-blur-md transition hover:bg-[var(--surface-tint-strong)] active:scale-95 md:h-11 md:w-11 cursor-pointer"
                  >
                    <Layers size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={centerOnUser}
                    title={isBm ? "Pusatkan lokasi saya" : "Center on me"}
                    className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/90 text-[var(--text)] shadow-lg backdrop-blur-md transition hover:bg-[var(--surface-tint-strong)] active:scale-95 md:h-11 md:w-11 cursor-pointer"
                  >
                    <LocateFixed size={17} />
                  </button>
                </div>

                {/* Map style selector popup */}
                {showMapTypeMenu && (
                  <div className="pointer-events-auto mt-1 flex flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-2 shadow-2xl backdrop-blur-md min-w-[175px] text-xs">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {isBm ? "Gaya Peta" : "Map Style"}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMapType("google-streets")
                        setShowMapTypeMenu(false)
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-2 font-bold transition text-left cursor-pointer",
                        mapType === "google-streets"
                          ? "bg-[var(--surface-tint-strong)] text-[var(--text)]"
                          : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint)]"
                      )}
                    >
                      <span>{isBm ? "Jalan (Monokrom)" : "Street (Monochrome)"}</span>
                      {mapType === "google-streets" && <Check size={14} className="shrink-0" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMapType("google-hybrid")
                        setShowMapTypeMenu(false)
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-2 font-bold transition text-left cursor-pointer",
                        mapType === "google-hybrid"
                          ? "bg-[var(--surface-tint-strong)] text-[var(--text)]"
                          : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint)]"
                      )}
                    >
                      <span>{isBm ? "Satelit" : "Satellite"}</span>
                      {mapType === "google-hybrid" && <Check size={14} className="shrink-0" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMapType("google-terrain")
                        setShowMapTypeMenu(false)
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-2 font-bold transition text-left cursor-pointer",
                        mapType === "google-terrain"
                          ? "bg-[var(--surface-tint-strong)] text-[var(--text)]"
                          : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-tint)]"
                      )}
                    >
                      <span>{isBm ? "Rupa Bumi" : "Terrain"}</span>
                      {mapType === "google-terrain" && <Check size={14} className="shrink-0" />}
                    </button>
                  </div>
                )}
              </div>

              {/* 4. Live Speed readout (Placed safely above bottom dock when running) */}
              {trackingState === "running" && currentSpeedKmh > 0 && (
                <div className="absolute bottom-20 left-3 z-[15] flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1 text-[var(--text)] shadow-lg backdrop-blur-md md:bottom-22 md:px-4 md:py-1.5">
                  <Gauge size={14} className="text-[var(--text-soft)]" />
                  <span className="text-xs font-black tabular-nums md:text-sm">{currentSpeedKmh} {isBm ? "km/j" : "km/h"}</span>
                </div>
              )}

              {/* 5. ── OVERLAID MAP BOTTOM RUNNER CONTROLS (FULL WIDTH ON MOBILE, ZERO CLASH) ── */}
              <div className="pointer-events-none absolute inset-x-3 bottom-4 z-[20] flex justify-center">
                {trackingState === "idle" && (
                  <button
                    type="button"
                    onClick={triggerStartCountdown}
                    className="pointer-events-auto flex h-14 w-full max-w-lg items-center justify-center gap-3 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-black uppercase tracking-widest text-[var(--btn-primary-text)] shadow-2xl transition hover:opacity-95 active:scale-[0.98] ring-4 ring-[var(--card)]/80 md:h-16 cursor-pointer"
                  >
                    <Play size={22} className="translate-x-0.5 fill-current" />
                    <span>{isBm ? "MULA LARIAN" : "START RUN"}</span>
                  </button>
                )}
                {trackingState === "running" && (
                  <button
                    type="button"
                    onClick={pauseTracking}
                    className="pointer-events-auto flex h-14 w-full max-w-lg items-center justify-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--card)]/95 px-6 text-sm font-black uppercase tracking-widest text-[var(--text)] shadow-2xl backdrop-blur-md transition hover:bg-[var(--surface-tint-strong)] active:scale-[0.98] md:h-16 cursor-pointer"
                  >
                    <Pause size={22} className="fill-current" />
                    <span>{isBm ? "JEDA LARIAN" : "PAUSE RUN"}</span>
                  </button>
                )}
                {trackingState === "paused" && (
                  <div className="pointer-events-auto flex w-full max-w-lg items-center justify-center gap-2.5 rounded-full border border-[var(--border-strong)] bg-[var(--card)]/95 p-2 shadow-2xl backdrop-blur-md">
                    <button
                      type="button"
                      onClick={beginTrackingExecution}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-4 text-xs font-black uppercase tracking-wider text-[var(--btn-primary-text)] shadow-md transition active:scale-95 cursor-pointer"
                      title={isBm ? "Sambung" : "Resume"}
                    >
                      <Play size={18} className="translate-x-0.5 fill-current" />
                      <span>{isBm ? "Sambung" : "Resume"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={finishTracking}
                      className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-4 text-xs font-black uppercase tracking-wider text-[var(--text)] transition active:scale-95 cursor-pointer"
                    >
                      <StopCircle size={17} />
                      <span>{isBm ? "Tamat" : "Finish"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={resetTracking}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] transition active:scale-95 cursor-pointer"
                      title={isBm ? "Set Semula" : "Reset"}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── FLOATING RUNNER ACTION DOCK (ALWAYS IN THUMB REACH ON RUN / PAUSE) ── */}
            {(trackingState === "running" || trackingState === "paused") && (
              <aside aria-label="Runner controls" className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 flex justify-center px-3 pointer-events-none md:bottom-6">
                <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--card)]/95 px-4 py-2 shadow-2xl backdrop-blur-xl">
                  {trackingState === "running" ? (
                    <>
                      <div className="flex items-center gap-2 pr-2 border-r border-[var(--divider)]">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-mono font-bold tabular-nums text-[var(--text)]">
                          {calculatedStats.distanceKm} KM • {calculatedStats.pace}/km
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={pauseTracking}
                        className="flex h-10 items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-4 text-xs font-black uppercase tracking-wider text-[var(--btn-primary-text)] shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        <Pause size={15} className="fill-current" />
                        <span>{isBm ? "Jeda" : "Pause"}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={beginTrackingExecution}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs transition active:scale-95"
                        title={isBm ? "Sambung" : "Resume"}
                      >
                        <Play size={18} className="translate-x-0.5 fill-current" />
                      </button>
                      <button
                        type="button"
                        onClick={finishTracking}
                        className="flex h-10 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] px-3 text-xs font-black uppercase tracking-wider text-[var(--text)] transition active:scale-95"
                      >
                        <StopCircle size={15} />
                        <span>{isBm ? "Tamat" : "Finish"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={resetTracking}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] transition active:scale-95"
                        title={isBm ? "Set Semula" : "Reset"}
                      >
                        <RotateCcw size={15} />
                      </button>
                    </>
                  )}
                </div>
              </aside>
            )}
          </div>
        ) : (
          /* ── RUN WORKOUT HISTORY (STRAVA STYLE) ── */
          <div className="mx-auto w-full max-w-5xl space-y-4 px-1 pt-3 md:px-6 md:pt-4">
            {/* Lifetime stats header card */}
            <div className="modern-card rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--card-shadow)] md:rounded-[var(--radius-3xl)] md:p-6">
              <div className="flex items-center justify-between border-b border-[var(--divider)] pb-4">
                <div>
                  <h2 className="text-base font-black text-[var(--text)] flex items-center gap-2 md:text-lg">
                    <Trophy size={18} className="text-[var(--text-soft)]" />
                    <span>{isBm ? "Statistik Keseluruhan Larian" : "Lifetime Running Stats"}</span>
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    {historySummary.totalRuns} {isBm ? "sesi berjaya direkodkan" : "total workouts recorded"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 md:gap-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 md:rounded-2xl">
                  <div className="text-[10px] font-bold uppercase text-[var(--muted)]">{isBm ? "Jumlah Jarak" : "Total Dist"}</div>
                  <div className="mt-1 text-xl font-black tabular-nums text-[var(--text)] md:text-2xl">{historySummary.totalDistKm} <span className="text-xs font-bold text-[var(--muted)]">KM</span></div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 md:rounded-2xl">
                  <div className="text-[10px] font-bold uppercase text-[var(--muted)]">{isBm ? "Jumlah Larian" : "Runs"}</div>
                  <div className="mt-1 text-xl font-black tabular-nums text-[var(--text)] md:text-2xl">{historySummary.totalRuns}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 md:rounded-2xl">
                  <div className="text-[10px] font-bold uppercase text-[var(--muted)]">{isBm ? "Masa Larian" : "Total Time"}</div>
                  <div className="mt-1 text-xl font-black tabular-nums text-[var(--text)] font-mono md:text-2xl">{historySummary.totalDuration}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3 md:rounded-2xl">
                  <div className="text-[10px] font-bold uppercase text-[var(--muted)]">{isBm ? "Jarak Terjauh" : "Longest Run"}</div>
                  <div className="mt-1 text-xl font-black tabular-nums text-[var(--text)] md:text-2xl">{historySummary.longestDistKm} <span className="text-xs font-bold text-[var(--muted)]">KM</span></div>
                </div>
              </div>
            </div>

            {/* Run feed items */}
            {!savedHistory.length ? (
              <div className="modern-card flex flex-col items-center justify-center rounded-[var(--radius-2xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center md:rounded-[var(--radius-3xl)] md:p-12">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]">
                  <Footprints size={28} />
                </div>
                <p className="mt-4 text-base font-black text-[var(--text)]">
                  {isBm ? "Belum ada rekod larian tersimpan." : "No workout sessions yet."}
                </p>
                <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">
                  {isBm
                    ? "Ketik MULA LARIAN untuk menjejak larian luar pertama anda dengan GPS!"
                    : "Hit START RUN to track your first outdoor run with GPS!"}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("tracker")}
                  className="mt-5 rounded-full bg-[var(--btn-primary-bg)] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--btn-primary-text)] shadow-xs hover:opacity-90 active:scale-[0.98]"
                >
                  {isBm ? "Mula Larian Sekarang" : "Start Run Now"}
                </button>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2 md:gap-3.5">
                {savedHistory.map((item) => {
                  const dateStr = new Date(item.startTime || item.createdAt).toLocaleDateString(
                    isBm ? "ms-MY" : "en-US",
                    { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
                  )
                  const distKm = (item.distanceMeters / 1000).toFixed(2)
                  return (
                    <div
                      key={item.id}
                      className="modern-card modern-card-interactive flex flex-col justify-between rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-shadow)] transition hover:border-[var(--border-strong)] md:rounded-[var(--radius-3xl)] md:p-5"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--divider)] pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-tint-strong)] text-[var(--text)]">
                            <Route size={16} />
                          </div>
                          <div>
                            <span className="text-xs font-black text-[var(--text)]">{dateStr}</span>
                            <div className="text-[10px] font-medium text-[var(--muted)]">
                              {item.stepSource === "native"
                                ? isBm ? "Sensor Android" : "Android Sensor"
                                : isBm ? "Langkah GPS" : "GPS Cadence"}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteHistoryItem(item.id)}
                          title={isBm ? "Padam rekod" : "Delete workout"}
                          className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-tint-strong)] hover:text-[var(--text)]"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="my-3.5 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5 md:rounded-2xl md:p-3">
                          <div className="text-[10px] font-bold uppercase text-[var(--muted)]">
                            {isBm ? "Jarak" : "Distance"}
                          </div>
                          <div className="mt-0.5 text-base font-black tabular-nums text-[var(--text)] md:text-lg">
                            {distKm} <span className="text-xs font-bold text-[var(--muted)]">km</span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5 md:rounded-2xl md:p-3">
                          <div className="text-[10px] font-bold uppercase text-[var(--muted)]">
                            {isBm ? "Langkah" : "Steps"}
                          </div>
                          <div className="mt-0.5 text-base font-black tabular-nums text-[var(--text)] md:text-lg">
                            {item.steps.toLocaleString()}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2.5 md:rounded-2xl md:p-3">
                          <div className="text-[10px] font-bold uppercase text-[var(--muted)]">
                            {isBm ? "Masa" : "Time"}
                          </div>
                          <div className="mt-0.5 text-base font-black tabular-nums text-[var(--text)] font-mono md:text-lg">
                            {formatDuration(item.durationSeconds)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-medium text-[var(--muted)]">
                        <span>
                          Pace: <strong className="font-bold tabular-nums text-[var(--text)]">{formatPace(item.avgPaceMinPerKm)}</strong>
                        </span>
                        <span className="font-bold tabular-nums text-[var(--text)]">
                          {item.caloriesKcal} kcal
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
      </div>

      {/* ── WORKOUT COMPLETED MODAL (NIKE / STRAVA SHARE CARD) ── */}
      {completedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-3 backdrop-blur-md md:p-4">
          <div className="modern-card relative w-full max-w-md overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl md:rounded-[var(--radius-3xl)] md:p-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint-strong)] text-[var(--text)] shadow-xs md:h-16 md:w-16">
                <Trophy size={30} />
              </div>
              <h3 className="mt-3 text-lg font-black text-[var(--text)] uppercase tracking-wider md:mt-4 md:text-xl">
                {isBm ? "LARIAN SELESAI!" : "WORKOUT COMPLETED!"}
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {isBm ? "Sesi larian anda telah direkodkan ke sejarah kesihatan." : "Run session saved to your health history."}
              </p>
            </div>

            <div className="my-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 text-center md:my-6 md:p-5">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                  {completedSession.mode === "indoor"
                    ? isBm ? "🏠 Larian Setempat / Treadmill" : "🏠 Indoor / Treadmill"
                    : isBm ? "🏃 Larian Luar (GPS)" : "🏃 Outdoor Run (GPS)"}
                </span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{isBm ? "JUMLAH JARAK" : "TOTAL DISTANCE"}</div>
              <div className="mt-1 text-4xl font-black tabular-nums text-[var(--text)] md:text-5xl">
                {(completedSession.distanceMeters / 1000).toFixed(2)} <span className="text-base font-bold text-[var(--muted)]">KM</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{isBm ? "Langkah" : "Steps"}</div>
                <div className="mt-1 text-xs font-black tabular-nums text-[var(--text)]">
                  {completedSession.steps.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{isBm ? "Pace" : "Pace"}</div>
                <div className="mt-1 text-xs font-black tabular-nums text-[var(--text)]">
                  {formatPace(completedSession.avgPaceMinPerKm)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{isBm ? "Masa" : "Time"}</div>
                <div className="mt-1 text-xs font-black tabular-nums text-[var(--text)] font-mono">
                  {formatDuration(completedSession.durationSeconds)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-2">
                <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{isBm ? "Kalori" : "Calories"}</div>
                <div className="mt-1 text-xs font-black tabular-nums text-[var(--text)]">
                  {completedSession.caloriesKcal}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2.5 md:mt-6">
              <button
                type="button"
                onClick={() => setCompletedSession(null)}
                className="w-full rounded-full bg-[var(--btn-primary-bg)] py-3 text-xs font-black uppercase tracking-wider text-[var(--btn-primary-text)] shadow-xs hover:opacity-90 active:scale-[0.98] md:py-3.5"
              >
                {isBm ? "Tutup & Teruskan" : "Close & Continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletedSession(null)
                  setActiveTab("history")
                }}
                className="w-full rounded-full py-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
              >
                {isBm ? "Lihat Sejarah Larian" : "View Workout History"}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal}
    </div>
  )
}
