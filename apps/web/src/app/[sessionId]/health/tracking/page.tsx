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
import { ModenHero } from "@/components/ui/ModenHero"
import "leaflet/dist/leaflet.css"

// ── MAPS TILE SERVERS (Global CDN, High-Performance) ──
const MAPS_STREET_URL = "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
const MAPS_HYBRID_URL = "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
const MAPS_TERRAIN_URL = "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"

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
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)

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
    // Count from the clock, not by adding 1 a tick: a phone throttles timers when the screen
    // locks, which made the run time fall behind.
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTimestampRef.current) / 1000)))
    }, 1000)

    // Keep the screen awake so the GPS keeps reporting while you run.
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
      if (wl && !wakeLockRef.current) {
        wl.request("screen").then((lock) => { wakeLockRef.current = lock }).catch(() => {})
      }
    } catch {
      // not supported
    }

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
    // Resuming after a pause: the first new fix becomes the anchor, so the distance walked
    // while paused is not added to the run.
    lastLocationRef.current = null

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

        // A fix that is off by more than 50 m would add phantom distance; show it, do not count it.
        const usable = !accuracy || accuracy <= 50
        if (!usable) {
          // skip distance and path for this fix
        } else if (lastLocationRef.current) {
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
                  <span class="absolute inline-flex h-full w-full rounded-full ${darkTiles ? "bg-white/25" : "bg-neutral-900/20"}"></span>
                  <span class="relative inline-flex h-4 w-4 rounded-full border-2 ${darkTiles ? "border-neutral-950 bg-white  " : "border-white bg-neutral-950  "}"></span>
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
                <div class="flex items-center gap-1 rounded-full ${darkTiles ? "bg-white text-black border-neutral-300" : "bg-neutral-900 text-white border-neutral-700"} px-2 py-0.5 text-[9px] font-black tracking-widest uppercase   border">
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
        if (err.code === err.PERMISSION_DENIED) {
          showAlert(
            isBm ? "Akses lokasi ditolak" : "Location access denied",
            isBm ? "Benarkan akses lokasi untuk app ini supaya jarak dapat dijejak." : "Allow location access for this app so the distance can be tracked.",
            "error"
          )
          setTrackingState("paused")
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
          }
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    )
  }, [darkTiles, elapsedSeconds, isBm, showAlert])

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

    if (countdownRef.current) clearInterval(countdownRef.current)
    let current = 3
    countdownRef.current = setInterval(() => {
      current -= 1
      if (current > 0) {
        setCountdownNum(current)
      } else {
        if (countdownRef.current) clearInterval(countdownRef.current)
        countdownRef.current = null
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
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current)
      stepIntervalRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
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
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      wakeLockRef.current?.release().catch(() => {})
    }
  }, [])

  // Leaving mid-run throws the run away, so ask first.
  useEffect(() => {
    if (trackingState !== "running" && trackingState !== "paused") return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [trackingState])

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
          <div class="flex items-center justify-center h-7 w-7 rounded-full border-2 border-white bg-emerald-600 text-[11px] font-black text-white  ">
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
            <div class="flex items-center justify-center h-7 w-7 rounded-full border-2 border-white bg-rose-600 text-[11px] font-black text-white  ">
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

  const stateLabel =
    trackingState === "running"
      ? isBm ? "Sedang berlari" : "Running"
      : trackingState === "paused"
        ? isBm ? "Dijeda" : "Paused"
        : isBm ? "Sedia untuk lari" : "Ready to run"
  const gpsLabel = gpsAccuracy ? `GPS ±${Math.round(gpsAccuracy)} m` : isBm ? "Mencari GPS…" : "Searching GPS…"
  const gpsGood = Boolean(gpsAccuracy && gpsAccuracy < 25)
  const goalOptions: Array<{ label: string; val: number | null }> = [
    { label: isBm ? "Bebas" : "Free", val: null },
    { label: "1 km", val: 1 },
    { label: "3 km", val: 3 },
    { label: "5 km", val: 5 },
    { label: "10 km", val: 10 },
    { label: isBm ? "21 km" : "21 km", val: 21 },
  ]
  const segBtn = (on: boolean) =>
    cn(
      "flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold",
      on ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "text-[var(--muted)]"
    )
  const bigBtn = "flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-base font-semibold"

  // One set of controls, below whichever view is showing, always in the same place.
  const runControls = (
    <div className="space-y-3">
      {trackingState === "idle" && (
        <>
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold text-[var(--muted)]">{isBm ? "Mod larian" : "Run mode"}</p>
            <div className="flex rounded-full border border-[var(--border)] p-1">
              <button type="button" onClick={() => setRunMode("outdoor")} aria-pressed={runMode === "outdoor"} className={segBtn(runMode === "outdoor")}>
                <Navigation size={15} />
                {isBm ? "Luar (GPS)" : "Outdoor (GPS)"}
              </button>
              <button type="button" onClick={() => setRunMode("indoor")} aria-pressed={runMode === "indoor"} className={segBtn(runMode === "indoor")}>
                <Footprints size={15} />
                {isBm ? "Treadmill" : "Treadmill"}
              </button>
            </div>
            {runMode === "indoor" && (
              <p className="mt-2 px-1 text-xs text-[var(--muted)]">
                {isBm ? "Jarak dan kalori dikira daripada langkah." : "Distance and calories are worked out from your steps."}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold text-[var(--muted)]">{isBm ? "Sasaran" : "Target"}</p>
            <div className="grid grid-cols-3 gap-2">
              {goalOptions.map((g) => (
                <button
                  key={String(g.val)}
                  type="button"
                  aria-pressed={targetGoalKm === g.val}
                  onClick={() => setTargetGoalKm(g.val)}
                  className={cn(
                    "h-11 rounded-full border text-sm font-semibold",
                    targetGoalKm === g.val ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "border-[var(--border)] text-[var(--text)]"
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={triggerStartCountdown} className={cn(bigBtn, "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]")}>
            <Play size={20} className="fill-current" />
            {isBm ? "Mula larian" : "Start run"}
          </button>
        </>
      )}
      {trackingState === "running" && (
        <button type="button" onClick={pauseTracking} className={cn(bigBtn, "border border-[var(--border-strong)] text-[var(--text)]")}>
          <Pause size={20} className="fill-current" />
          {isBm ? "Jeda" : "Pause"}
        </button>
      )}
      {trackingState === "paused" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={beginTrackingExecution} className={cn(bigBtn, "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]")}>
              <Play size={20} className="fill-current" />
              {isBm ? "Sambung" : "Resume"}
            </button>
            <button type="button" onClick={finishTracking} className={cn(bigBtn, "border border-[var(--border-strong)] text-[var(--text)]")}>
              <StopCircle size={20} />
              {isBm ? "Tamat" : "Finish"}
            </button>
          </div>
          <button type="button" onClick={resetTracking} className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-[var(--muted)]">
            <RotateCcw size={15} />
            {isBm ? "Set semula larian" : "Discard this run"}
          </button>
        </>
      )}
    </div>
  )

  const metricTile = (icon: React.ReactNode, name: string, value: React.ReactNode, unit: string) => (
    <div className="min-w-0 rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        {icon}
        <span className="truncate">{name}</span>
      </div>
      <p className="mt-1.5 truncate text-xl font-bold tabular-nums text-[var(--text)]">{value}</p>
      <p className="truncate text-[0.6875rem] text-[var(--muted)]">{unit}</p>
    </div>
  )

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
          <div className="modern-card rounded-[var(--radius-3xl)] border border-[var(--border)] bg-[var(--card)] p-6  ">
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
                    className="text-[11px] font-bold text-[var(--muted)] hover:text-rose-500  "
                  >
                    {isBm ? "Kosongkan Semua" : "Clear All"}
                  </button>
                )}
              </div>

              {!savedHistory.length ? (
                <div className="modern-card flex flex-col items-center justify-center rounded-[var(--radius-2xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center  ">
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
                          "modern-card group relative cursor-pointer rounded-[var(--radius-2xl)] border p-4 text-left shadow-xs  ",
                          isSelected
                            ? "border-[var(--text)] bg-[var(--card)] ring-2 ring-[var(--text)]/20  "
                            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-tint)]"
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                isSelected ? "bg-emerald-500  " : "bg-[var(--muted)]"
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
                            className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-tint-strong)] hover:text-rose-500  "
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
              <div className="modern-card overflow-hidden rounded-[var(--radius-3xl)] border border-[var(--border)] bg-[var(--card)]  ">
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
                          "rounded-full px-2.5 py-1 text-[11px] font-bold  ",
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
                          "rounded-full px-2.5 py-1 text-[11px] font-bold  ",
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
                          "rounded-full px-2.5 py-1 text-[11px] font-bold  ",
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
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]   hover:bg-[var(--surface-tint-strong)]"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Map element */}
                <div className="relative h-[440px] min-h-[440px] w-full bg-[var(--card)]">
                  <div ref={desktopMapContainerRef} className="h-full min-h-[440px] w-full z-0" />

                  {/* Maps badge */}
                  <div className="pointer-events-none absolute bottom-3 left-3 z-[10] flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1   backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)]">Maps</span>
                  </div>

                  {/* Route pin legend or status banner */}
                  {selectedRun && selectedRun.path && selectedRun.path.length > 0 ? (
                    <div className="pointer-events-none absolute bottom-3 right-3 z-[10] flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1   backdrop-blur-md text-[10px] font-bold text-[var(--text)]">
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
                    <div className="pointer-events-none absolute bottom-3 right-3 z-[10] rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-1 text-[11px] font-medium text-[var(--muted)]   backdrop-blur-md">
                      {isBm ? "Peta GPS Aktif" : "GPS Map Active"}
                    </div>
                  )}
                </div>
              </div>

              {/* KM SPLITS & PACE ANALYSIS (OR READY TO RECORD NOTICE) */}
              {selectedRun ? (
                <div className="modern-card rounded-[var(--radius-3xl)] border border-[var(--border)] bg-[var(--card)] p-6  ">
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
                              "flex items-center justify-between gap-4 rounded-xl border p-3  ",
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
                                    "h-full rounded-full  ",
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
                <div className="modern-card flex flex-col items-center justify-center rounded-[var(--radius-3xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center  ">
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

      {/* ── MOBILE: tracker and history ── */}
      <div className="flex flex-1 flex-col md:hidden">
        <MobilePageHeader title={isBm ? "Larian" : "Run Tracker"} fallbackHref={`/${sessionId}/health`} />

        {trackingState === "countdown" && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--overlay)] p-4">
            <span className="text-sm font-semibold text-[var(--muted)]">{isBm ? "Bersedia" : "Get ready"}</span>
            <div className="my-6 flex h-36 w-36 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] text-7xl font-black text-[var(--text)]">
              {countdownNum}
            </div>
            <p className="text-xs text-[var(--text-soft)]">{isBm ? "Mengunci isyarat GPS…" : "Locking the GPS signal…"}</p>
          </div>
        )}

        <main className="flex-1 space-y-3 px-1 pb-28 pt-2">
          <div className="flex rounded-full border border-[var(--border)] p-1" role="tablist">
            <button type="button" role="tab" aria-selected={activeTab === "tracker"} onClick={() => setActiveTab("tracker")} className={segBtn(activeTab === "tracker")}>
              <Route size={15} />
              {isBm ? "Larian" : "Tracker"}
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "history"} onClick={() => setActiveTab("history")} className={segBtn(activeTab === "history")}>
              <History size={15} />
              {isBm ? "Sejarah" : "History"}
              {savedHistory.length > 0 ? <span className="rounded-full bg-white/20 px-1.5 text-xs">{savedHistory.length}</span> : null}
            </button>
          </div>

          {activeTab === "tracker" ? (
            <>
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <span className={cn("h-2 w-2 rounded-full", trackingState === "running" ? "bg-emerald-500" : trackingState === "paused" ? "bg-amber-500" : "bg-[var(--muted)]")} />
                  {stateLabel}
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text)]">
                  <span className={cn("h-1.5 w-1.5 rounded-full", gpsGood ? "bg-emerald-500" : "bg-[var(--muted)]")} />
                  {gpsLabel}
                </span>
              </div>

              <div className="flex rounded-full border border-[var(--border)] p-1">
                <button type="button" aria-pressed={viewMode === "cockpit"} onClick={() => setViewMode("cockpit")} className={segBtn(viewMode === "cockpit")}>
                  <Gauge size={15} />
                  {isBm ? "Metrik" : "Metrics"}
                </button>
                <button type="button" aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")} className={segBtn(viewMode === "map")}>
                  <Route size={15} />
                  {isBm ? "Peta" : "Map"}
                </button>
              </div>

              <div className={cn("space-y-3", viewMode === "cockpit" ? "block" : "hidden")}>
                <ModenHero
                  pageActions={false}
                  label={
                    <>
                      <Timer size={16} />
                      <span className="font-mono tabular-nums">{formatDuration(elapsedSeconds)}</span>
                      {calculatedStats.progressPercent !== null ? <span className="ml-auto text-xs opacity-70">{calculatedStats.progressPercent}% {isBm ? "sasaran" : "of target"}</span> : null}
                    </>
                  }
                  currency={null}
                  amount={
                    <>
                      {calculatedStats.distanceKm}
                      <span className="ml-2 text-base font-semibold opacity-60">km</span>
                    </>
                  }
                  amountSize="clamp(3rem, 16vw, 4.5rem)"
                  stats={[
                    { key: "pace", tone: "neutral", icon: <TrendingUp size={15} strokeWidth={2.2} />, label: isBm ? "Pace purata" : "Avg pace", value: `${calculatedStats.pace} /km` },
                    { key: "speed", tone: "neutral", icon: <Gauge size={15} strokeWidth={2.2} />, label: isBm ? "Kelajuan" : "Speed", value: `${currentSpeedKmh} km/h` },
                  ]}
                />
                {runControls}
                <div className="grid grid-cols-2 gap-2">
                  {metricTile(<Footprints size={13} />, isBm ? "Langkah" : "Steps", calculatedStats.effectiveSteps.toLocaleString(), calculatedStats.cadenceSpm > 0 ? `${calculatedStats.cadenceSpm} spm` : hasNativeStepSensor ? (isBm ? "Sensor" : "Sensor") : "GPS")}
                  {metricTile(<Flame size={13} />, isBm ? "Kalori" : "Calories", calculatedStats.calories, "kcal")}
                </div>
                {splits.length > 0 && (
                  <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="mb-2 flex items-baseline justify-between">
                      <h2 className="text-base font-bold text-[var(--text)]">{isBm ? "Pecahan km" : "Km splits"}</h2>
                      <span className="text-xs text-[var(--muted)]">{splits.length} km</span>
                    </div>
                    <ul className="space-y-1.5">
                      {splits.map((sp) => (
                        <li key={sp.kmNumber} className="flex items-center justify-between rounded-full border border-[var(--border)] px-4 py-2 text-sm">
                          <span className="font-semibold text-[var(--text)]">
                            km {sp.kmNumber}
                            {sp.isFastest ? <span className="ml-2 rounded-full bg-[var(--btn-primary-bg)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--btn-primary-text)]">{isBm ? "Terpantas" : "Fastest"}</span> : null}
                          </span>
                          <span className="font-mono tabular-nums text-[var(--muted)]">
                            {sp.paceFormatted} /km · {formatDuration(sp.durationSeconds)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              <div className={cn("relative h-[calc(100dvh-24rem)] min-h-[320px] w-full overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]", viewMode === "map" ? "block" : "hidden")}>
                <div ref={mapContainerRef} className="z-[1] h-full w-full touch-none" />
                <div className="pointer-events-none absolute inset-x-2 top-2 z-[15] flex items-start justify-between gap-2">
                  <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-4 py-1.5 backdrop-blur-md">
                    <div>
                      <div className="text-[0.625rem] text-[var(--muted)]">km</div>
                      <div className="text-base font-bold tabular-nums text-[var(--text)]">{calculatedStats.distanceKm}</div>
                    </div>
                    <div className="h-6 w-px bg-[var(--divider)]" />
                    <div>
                      <div className="text-[0.625rem] text-[var(--muted)]">pace</div>
                      <div className="text-base font-bold tabular-nums text-[var(--text)]">{calculatedStats.pace}</div>
                    </div>
                    <div className="h-6 w-px bg-[var(--divider)]" />
                    <div>
                      <div className="text-[0.625rem] text-[var(--muted)]">{isBm ? "masa" : "time"}</div>
                      <div className="font-mono text-base font-bold tabular-nums text-[var(--text)]">{formatDuration(elapsedSeconds)}</div>
                    </div>
                  </div>
                  <div className="pointer-events-auto flex flex-col items-end gap-2">
                    <button type="button" onClick={() => setShowMapTypeMenu(!showMapTypeMenu)} aria-label={isBm ? "Gaya peta" : "Map style"} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/90 text-[var(--text)] backdrop-blur-md">
                      <Layers size={17} />
                    </button>
                    <button type="button" onClick={centerOnUser} aria-label={isBm ? "Pusatkan" : "Center on me"} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/90 text-[var(--text)] backdrop-blur-md">
                      <LocateFixed size={17} />
                    </button>
                    {showMapTypeMenu && (
                      <div className="flex min-w-[10.5rem] flex-col gap-1 rounded-[1.25rem] border border-[var(--border)] bg-[var(--card)] p-1.5">
                        {([["google-streets", isBm ? "Jalan" : "Street"], ["google-hybrid", isBm ? "Satelit" : "Satellite"], ["google-terrain", isBm ? "Rupa bumi" : "Terrain"]] as const).map(([k, text]) => (
                          <button key={k} type="button" onClick={() => { setMapType(k); setShowMapTypeMenu(false) }} className={cn("flex h-10 items-center justify-between rounded-full px-4 text-sm font-semibold", mapType === k ? "bg-[var(--surface-tint-strong)] text-[var(--text)]" : "text-[var(--muted)]")}>
                            {text}
                            {mapType === k && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {viewMode === "map" ? runControls : null}
            </>
          ) : (
            <div className="space-y-3">
              <ModenHero
                pageActions={false}
                label={
                  <>
                    <Trophy size={16} />
                    {isBm ? "Jumlah larian" : "Lifetime running"}
                  </>
                }
                currency={null}
                amount={
                  <>
                    {historySummary.totalDistKm}
                    <span className="ml-2 text-base font-semibold opacity-60">km</span>
                  </>
                }
                amountSize="clamp(2rem, 9vw, 2.75rem)"
                stats={[
                  { key: "runs", tone: "neutral", icon: <Route size={15} strokeWidth={2.2} />, label: isBm ? "Larian" : "Runs", value: String(historySummary.totalRuns) },
                  { key: "time", tone: "neutral", icon: <Timer size={15} strokeWidth={2.2} />, label: isBm ? "Jumlah masa" : "Total time", value: historySummary.totalDuration },
                ]}
              />
              {!savedHistory.length ? (
                <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-[var(--border)] px-6 py-12 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-tint-strong)] text-[var(--muted)]"><Footprints size={24} /></span>
                  <p className="mt-4 text-base font-bold text-[var(--text)]">{isBm ? "Belum ada larian" : "No runs yet"}</p>
                  <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{isBm ? "Larian yang anda simpan akan muncul di sini." : "Runs you save will show up here."}</p>
                  <button type="button" onClick={() => setActiveTab("tracker")} className="mt-5 h-11 rounded-full bg-[var(--btn-primary-bg)] px-6 text-sm font-semibold text-[var(--btn-primary-text)]">
                    {isBm ? "Mula larian" : "Start a run"}
                  </button>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {savedHistory.map((item) => {
                    const when = new Date(item.startTime || item.createdAt).toLocaleString(isBm ? "ms-MY" : "en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
                    return (
                      <li key={item.id} className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-base font-bold tabular-nums text-[var(--text)]">{(item.distanceMeters / 1000).toFixed(2)} km</p>
                            <p className="text-xs text-[var(--muted)]">{when} · {item.mode === "indoor" ? "Treadmill" : "GPS"}</p>
                          </div>
                          <button type="button" onClick={() => deleteHistoryItem(item.id)} aria-label={isBm ? "Padam larian" : "Delete run"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-500/30 text-rose-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                          {([[isBm ? "Masa" : "Time", formatDuration(item.durationSeconds)], ["Pace", formatPace(item.avgPaceMinPerKm)], [isBm ? "Langkah" : "Steps", item.steps.toLocaleString()], ["kcal", String(item.caloriesKcal)]] as const).map(([k, v]) => (
                            <div key={k} className="min-w-0 rounded-[1rem] border border-[var(--border)] px-1 py-2">
                              <dt className="text-[0.625rem] text-[var(--muted)]">{k}</dt>
                              <dd className="truncate text-sm font-bold tabular-nums text-[var(--text)]">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── WORKOUT COMPLETED MODAL (NIKE / STRAVA SHARE CARD) ── */}
      {completedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-3 md:p-4">
          <div className="modern-card relative w-full max-w-md overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] p-5   md:rounded-[var(--radius-3xl)] md:p-6">
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
