"use client"

import "leaflet/dist/leaflet.css"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { AppSheetHeader } from "@/components/ui/AppSheetHeader"
import { useParams } from "next/navigation"
import {
  ExternalLink,
  List,
  MapPin,
  MapPinned,
  Plus,
  RefreshCw,
  Route,
  Share2,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { useLang } from "@/lib/lang"
import { getAccessToken } from "@/lib/auth-session"
import { useOverlayBackClose } from "@/lib/useOverlayBackClose"
import { useTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"

type PlacePoint = {
  id: number
  title: string
  latitude: number
  longitude: number
  location_name?: string | null
  category_id?: number | null
  category_name?: string | null
  category_color?: string | null
  source_channel?: string | null
}

type PlaceCategory = {
  id: number
  name: string
  color?: string | null
}

type PlaceShareGroup = {
  id: number
  name: string
  phones: string[]
  phone_count: number
}

type MarkerEntry = {
  marker: import("leaflet").Marker
  point: PlacePoint
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function authHeaders() {
  const token = getAccessToken()
  return {
    credentials: "include" as const,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
}

function placeMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function buildPlaceShareText(point: {
  title: string
  latitude: number
  longitude: number
}) {
  return `📍 ${point.title}\n${placeMapsUrl(point.latitude, point.longitude)}`
}

function parsePhoneInput(raw: string): string[] {
  const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    let digits = part.replace(/\D/g, "")
    if (!digits) continue
    if (digits.startsWith("0") && digits.length >= 9) digits = `60${digits.slice(1)}`
    if (digits.length < 8 || digits.length > 15) continue
    if (seen.has(digits)) continue
    seen.add(digits)
    out.push(digits)
    if (out.length >= 20) break
  }
  return out
}

function createPlaceMarkerIcon(
  L: typeof import("leaflet"),
  point: PlacePoint,
  isActive: boolean,
  index: number,
) {
  const label = escapeHtml(point.title || "Pin")
  const number = String(index + 1)
  const color = point.category_color || "var(--accent2)"
  return L.divIcon({
    className: "txn-marker-wrap",
    html: `
      <div class="txn-marker ${isActive ? "is-active" : ""}" style="--marker-accent:${escapeHtml(String(color))}">
        <span class="txn-marker__badge">
          <span class="txn-marker__number">${number}</span>
          <span class="txn-marker__amount">${label}</span>
        </span>
        <span class="txn-marker__stem"></span>
        <span class="txn-marker__dot"></span>
      </div>
    `,
    iconSize: [184, 68],
    iconAnchor: [92, 68],
  })
}

/** Place lat/lng in upper part of map so bottom sheet does not cover the pin. */
function panMapForSheet(
  map: import("leaflet").Map,
  lat: number,
  lng: number,
  isMobile: boolean,
  zoom?: number,
  mode: "detail" | "form" = "detail",
) {
  const targetZoom = zoom ?? Math.max(map.getZoom(), 13)
  try {
    map.invalidateSize({ animate: false })
  } catch {
    /* ignore */
  }

  if (!isMobile) {
    map.setView([lat, lng], targetZoom, { animate: false })
    return
  }

  const h = map.getSize().y || (typeof window !== "undefined" ? window.innerHeight : 700)
  // Lower sheet band: bottom nav ~88px + sheet ~180–280px → pin must sit in top ~45%
  const offsetPx =
    mode === "form"
      ? Math.round(Math.min(h * 0.48, Math.max(300, h * 0.42)))
      : Math.round(Math.min(h * 0.42, Math.max(250, h * 0.36)))

  // Project pin, then set map center south of pin so pin renders higher on screen
  const pinPoint = map.project([lat, lng], targetZoom)
  const centerPoint = map.unproject([pinPoint.x, pinPoint.y + offsetPx], targetZoom)
  map.setView(centerPoint, targetZoom, { animate: false })
}

export default function PlacesPage() {
  const params = useParams()
  const { lang } = useLang()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === "light"
  const sessionId = (params.sessionId as string) || ""

  const [refreshKey, setRefreshKey] = useState(0)
  const [points, setPoints] = useState<PlacePoint[]>([])
  const [categories, setCategories] = useState<PlaceCategory[]>([])
  /** Drawer list filter only — never filters map markers. */
  const [listCategoryFilter, setListCategoryFilter] = useState<number | "all">("all")
  const [activePointId, setActivePointId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number } | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formCategory, setFormCategory] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [shareGroups, setShareGroups] = useState<PlaceShareGroup[]>([])
  const [shareOpen, setShareOpen] = useState(false)
  const [sharePlace, setSharePlace] = useState<PlacePoint | null>(null)
  const [shareTab, setShareTab] = useState<"group" | "numbers" | "manage">("group")
  const [shareGroupId, setShareGroupId] = useState<number | null>(null)
  const [sharePhones, setSharePhones] = useState("")
  const [shareSending, setShareSending] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupPhones, setNewGroupPhones] = useState("")
  const [groupSaving, setGroupSaving] = useState(false)

  const loadShareGroups = async () => {
    try {
      const res = await fetch("/api/places/groups", authHeaders())
      if (!res.ok) return
      const data = (await res.json()) as PlaceShareGroup[]
      setShareGroups(Array.isArray(data) ? data : [])
    } catch {
      /* ignore */
    }
  }

  const openShareSheet = (point: PlacePoint | null, tab: "group" | "numbers" | "manage" = "group") => {
    setSharePlace(point)
    setSharePhones("")
    setShareResult(null)
    setShareTab(tab)
    setShareGroupId(null)
    setShareOpen(true)
    setListOpen(false)
    void loadShareGroups()
  }

  const openGroupManager = () => {
    openShareSheet(null, "manage")
  }

  const closeShareSheet = () => {
    if (shareSending || groupSaving) return
    setShareOpen(false)
    setSharePlace(null)
    setSharePhones("")
    setShareResult(null)
    setShareGroupId(null)
    setNewGroupName("")
    setNewGroupPhones("")
  }

  const createShareGroup = async () => {
    const name = newGroupName.trim()
    const phones = parsePhoneInput(newGroupPhones)
    if (!name || !phones.length || groupSaving) return
    try {
      setGroupSaving(true)
      setShareResult(null)
      const res = await fetch("/api/places/groups", {
        method: "POST",
        ...authHeaders(),
        body: JSON.stringify({ name, phones }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShareResult(String((data as { detail?: string }).detail || `HTTP_${res.status}`))
        return
      }
      const group = data as PlaceShareGroup
      setShareGroups((prev) => [group, ...prev.filter((g) => g.id !== group.id)])
      setShareGroupId(group.id)
      setShareTab("group")
      setNewGroupName("")
      setNewGroupPhones("")
      setShareResult(lang === "EN" ? `Group "${group.name}" saved.` : `Group "${group.name}" disimpan.`)
    } catch (err) {
      setShareResult(err instanceof Error ? err.message : "Save failed")
    } finally {
      setGroupSaving(false)
    }
  }

  const deleteShareGroup = async (groupId: number) => {
    try {
      const res = await fetch(`/api/places/groups/${groupId}`, {
        method: "DELETE",
        ...authHeaders(),
      })
      if (!res.ok) return
      setShareGroups((prev) => prev.filter((g) => g.id !== groupId))
      if (shareGroupId === groupId) setShareGroupId(null)
    } catch {
      /* ignore */
    }
  }

  const sendShareWhatsApp = async () => {
    if (!sharePlace || shareSending) {
      if (!sharePlace) {
        setShareResult(
          lang === "EN"
            ? "Open share from a pin to send location."
            : "Buka share dari pin untuk hantar lokasi.",
        )
      }
      return
    }
    const phones = shareTab === "numbers" ? parsePhoneInput(sharePhones) : []
    const groupId = shareTab === "group" ? shareGroupId : null
    if (shareTab === "group" && !groupId) {
      setShareResult(lang === "EN" ? "Select a group first." : "Pilih group dulu.")
      return
    }
    if (shareTab === "numbers" && !phones.length) {
      setShareResult(lang === "EN" ? "Enter at least 1 valid phone number." : "Masukkan sekurang-kurangnya 1 nombor.")
      return
    }
    try {
      setShareSending(true)
      setShareResult(null)
      const res = await fetch(`/api/places/${sharePlace.id}/share-whatsapp`, {
        method: "POST",
        ...authHeaders(),
        body: JSON.stringify({
          phones,
          group_id: groupId,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        detail?: string
        sent_count?: number
        failed_count?: number
        group_name?: string
      }
      if (!res.ok) {
        const detail = data.detail || `HTTP_${res.status}`
        if (res.status === 409 || String(detail).toLowerCase().includes("not connected")) {
          setShareResult(
            lang === "EN"
              ? "WhatsApp not connected. Open WhatsApp page and scan QR first."
              : "WhatsApp belum sambung. Buka page WhatsApp dan scan QR dulu.",
          )
        } else {
          setShareResult(String(detail))
        }
        return
      }
      const sent = Number(data.sent_count || 0)
      const failed = Number(data.failed_count || 0)
      const gname = data.group_name ? ` (${data.group_name})` : ""
      if (failed === 0) {
        setShareResult(
          lang === "EN" ? `Sent to ${sent} number(s)${gname}.` : `Dihantar ke ${sent} nombor${gname}.`,
        )
      } else {
        setShareResult(
          lang === "EN"
            ? `Sent ${sent}, failed ${failed}${gname}.`
            : `Berjaya ${sent}, gagal ${failed}${gname}.`,
        )
      }
    } catch (err) {
      setShareResult(err instanceof Error ? err.message : "Share failed")
    } finally {
      setShareSending(false)
    }
  }

  const { requestClose: requestShareClose } = useOverlayBackClose({
    id: "place-share-sheet",
    isOpen: shareOpen,
    onClose: closeShareSheet,
  })

  const { requestClose: requestActivePointClose } = useOverlayBackClose({
    id: "place-point-detail",
    isOpen: activePointId !== null && !listOpen && !draftPin,
    onClose: () => setActivePointId(null),
  })

  const { requestClose: requestListClose } = useOverlayBackClose({
    id: "place-list-drawer",
    isOpen: listOpen,
    onClose: () => setListOpen(false),
  })

  const openCategoryList = (filter: number | "all" = "all") => {
    setListCategoryFilter(filter)
    setListOpen(true)
    setDraftPin(null)
  }

  const selectPlaceFromList = (placeId: number) => {
    setActivePointId(placeId)
    setListOpen(false)
  }

  const listTitle = useMemo(() => {
    if (listCategoryFilter === "all") return lang === "EN" ? "All places" : "Semua tempat"
    const cat = categories.find((c) => c.id === listCategoryFilter)
    return cat?.name || (lang === "EN" ? "Places" : "Tempat")
  }, [listCategoryFilter, categories, lang])

  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const markersRef = useRef<Map<number, MarkerEntry>>(new Map())
  const listItemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const tileLayerThemeRef = useRef<"light" | "dark" | null>(null)
  const draftMarkerRef = useRef<import("leaflet").Marker | null>(null)

  /** List drawer only */
  const listPoints = useMemo(() => {
    if (listCategoryFilter === "all") return points
    return points.filter((p) => p.category_id === listCategoryFilter)
  }, [points, listCategoryFilter])

  /** Map always shows every pin */
  const activePoint = useMemo(
    () => points.find((point) => point.id === activePointId) || null,
    [points, activePointId],
  )
  const activePointIndex = useMemo(
    () => points.findIndex((point) => point.id === activePointId),
    [points, activePointId],
  )

  useEffect(() => {
    const evaluateViewport = () => setIsMobileViewport(window.innerWidth < 1024)
    evaluateViewport()
    window.addEventListener("resize", evaluateViewport)
    return () => window.removeEventListener("resize", evaluateViewport)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const token = getAccessToken()
        if (!token) throw new Error("Missing auth token")

        const [placesRes, catsRes] = await Promise.all([
          fetch("/api/places?limit=1000", authHeaders()),
          fetch("/api/places/categories", authHeaders()),
        ])
        if (!placesRes.ok) throw new Error(`HTTP_${placesRes.status}`)
        if (!catsRes.ok) throw new Error(`HTTP_${catsRes.status}`)

        const placesData = (await placesRes.json()) as PlacePoint[]
        const catsData = (await catsRes.json()) as PlaceCategory[]
        if (cancelled) return
        setPoints(placesData)
        setCategories(catsData)
        setActivePointId((previous) => {
          if (previous != null && placesData.some((item) => item.id === previous)) return previous
          return placesData[0]?.id ?? null
        })
      } catch (fetchError) {
        if (cancelled) return
        console.error("Places fetch error:", fetchError)
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load places.")
        setPoints([])
        setActivePointId(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    let cancelled = false
    const renderMap = async () => {
      if (!mapHostRef.current) return
      const L = await import("leaflet")
      ;(window as typeof window & { L?: typeof import("leaflet") }).L = L
      if (cancelled || !mapHostRef.current) return
      leafletRef.current = L

      if (!mapRef.current) {
        const map = L.map(mapHostRef.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
        })
        mapRef.current = map
      }

      const map = mapRef.current
      if (!map) return

      if (!tileLayerRef.current || tileLayerThemeRef.current !== resolvedTheme) {
        if (tileLayerRef.current) tileLayerRef.current.remove()
        tileLayerRef.current = L.tileLayer(
          `https://{s}.basemaps.cartocdn.com/${isLight ? "light_all" : "dark_all"}/{z}/{x}/{y}{r}.png`,
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            className: isLight ? "map-tile-light" : "map-tile-dark-grey",
          },
        )
        tileLayerRef.current.addTo(map)
        tileLayerThemeRef.current = resolvedTheme
      }

      markersRef.current.forEach((entry) => entry.marker.remove())
      markersRef.current.clear()

      if (!points.length) {
        map.setView([3.139, 101.6869], 6)
      } else {
        const bounds = L.latLngBounds(
          points.map((point) => [point.latitude, point.longitude] as [number, number]),
        )
        points.forEach((point, index) => {
          const marker = L.marker([point.latitude, point.longitude], {
            icon: createPlaceMarkerIcon(L, point, false, index),
            keyboard: false,
          })
          marker.on("click", (e) => {
            if (e.originalEvent) e.originalEvent.stopPropagation()
            setDraftPin(null)
            setActivePointId(point.id)
          })
          marker.addTo(map)
          markersRef.current.set(point.id, { marker, point })
        })
        map.fitBounds(bounds, {
          paddingTopLeft: [24, 150],
          paddingBottomRight: [24, 200],
          maxZoom: 14,
        })
      }
    }
    void renderMap()
    return () => {
      cancelled = true
    }
  }, [points, isMobileViewport, isLight, resolvedTheme])

  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return
    const pointIndexById = new Map(points.map((point, index) => [point.id, index]))
    markersRef.current.forEach((entry) => {
      const isActive = entry.point.id === activePointId
      entry.marker.setIcon(
        createPlaceMarkerIcon(L, entry.point, isActive, pointIndexById.get(entry.point.id) ?? 0),
      )
      entry.marker.setZIndexOffset(isActive ? 1000 : 0)
    })
    // Skip if form sheet open — form pan handles it
    if (draftPin) return
    if (activePointId == null) return
    const active = markersRef.current.get(activePointId)
    if (!active) return
    const mobile =
      isMobileViewport || (typeof window !== "undefined" && window.innerWidth < 1024)
    const lat = active.point.latitude
    const lng = active.point.longitude
    requestAnimationFrame(() => {
      const liveMap = mapRef.current
      if (!liveMap) return
      panMapForSheet(liveMap, lat, lng, mobile, Math.max(liveMap.getZoom(), 13), "detail")
    })
  }, [activePointId, points, isMobileViewport, draftPin])


  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return
    if (draftMarkerRef.current) {
      draftMarkerRef.current.remove()
      draftMarkerRef.current = null
    }
    if (!draftPin) return
    const marker = L.marker([draftPin.lat, draftPin.lng], {
      icon: L.divIcon({
        className: "txn-marker-wrap",
        html: `<div class="txn-marker is-active"><span class="txn-marker__badge"><span class="txn-marker__number">+</span><span class="txn-marker__amount">New</span></span><span class="txn-marker__stem"></span><span class="txn-marker__dot"></span></div>`,
        iconSize: [184, 68],
        iconAnchor: [92, 68],
      }),
    })
    marker.addTo(map)
    draftMarkerRef.current = marker
    const mobile =
      isMobileViewport || (typeof window !== "undefined" && window.innerWidth < 1024)
    // Defer pan so map size is correct after sheet paints
    requestAnimationFrame(() => {
      const liveMap = mapRef.current
      if (!liveMap || !draftPin) return
      panMapForSheet(liveMap, draftPin.lat, draftPin.lng, mobile, Math.max(liveMap.getZoom(), 15), "form")
    })
  }, [draftPin, isMobileViewport])

  useEffect(() => {
    if (isMobileViewport || activePointId == null) return
    listItemRefs.current.get(activePointId)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [activePointId, isMobileViewport])

  useEffect(() => {
    const markerStore = markersRef.current
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markerStore.clear()
      tileLayerRef.current = null
      tileLayerThemeRef.current = null
      leafletRef.current = null
      draftMarkerRef.current = null
    }
  }, [])

  const savePlace = async () => {
    if (!draftPin || !formTitle.trim() || !formCategory.trim() || saving) return
    try {
      setSaving(true)
      setError(null)
      const res = await fetch("/api/places", {
        method: "POST",
        ...authHeaders(),
        body: JSON.stringify({
          title: formTitle.trim(),
          latitude: draftPin.lat,
          longitude: draftPin.lng,
          category_name: formCategory.trim(),
          source_channel: "web",
        }),
      })
      if (!res.ok) throw new Error(`HTTP_${res.status}`)
      setDraftPin(null)
      setFormTitle("")
      setFormCategory("")
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save place.")
    } finally {
      setSaving(false)
    }
  }

  const deletePlace = async (placeId: number) => {
    if (deleting) return
    try {
      setDeleting(true)
      setError(null)
      const res = await fetch(`/api/places/${placeId}`, {
        method: "DELETE",
        ...authHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP_${res.status}`)
      setActivePointId(null)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete place.")
    } finally {
      setDeleting(false)
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError(lang === "EN" ? "Geolocation not supported." : "Geolocation tidak disokong.")
      return
    }
    setGpsLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraftPin({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setFormTitle("")
        setFormCategory("")
        setActivePointId(null)
        setGpsLoading(false)
      },
      () => {
        setGpsLoading(false)
        setError(
          lang === "EN"
            ? "Unable to get GPS location. Allow location permission."
            : "Tidak dapat GPS. Benarkan permission lokasi.",
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  return (
    <div className="map-experience relative z-0 h-[100dvh] min-h-[100dvh] w-full overflow-hidden overscroll-none bg-[var(--page-bg)] text-[var(--text)] lg:h-full lg:min-h-0">
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[var(--page-bg)]/80 via-[var(--page-bg)]/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[var(--page-bg)]/70 via-transparent to-transparent" />
      </div>

      <div ref={mapHostRef} className="absolute inset-0 z-0 touch-none" />

      {/* Compact top actions — centered (desktop: within main, not over sidebar) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[430] flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.65rem)] sm:px-5 sm:pt-5 lg:left-0">
        <div className="pointer-events-auto flex w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/92 p-1 shadow-[var(--shadow-soft)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => openCategoryList(listCategoryFilter)}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95",
              listOpen
                ? "bg-[var(--btn-primary-bg)] text-white"
                : "text-[var(--text)] hover:bg-[var(--surface-tint)]",
            )}
            aria-label={lang === "EN" ? "List" : "Senarai"}
          >
            <List size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={openGroupManager}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95",
              shareOpen && shareTab === "manage"
                ? "bg-[var(--btn-primary-bg)] text-white"
                : "text-[var(--text)] hover:bg-[var(--surface-tint)]",
            )}
            aria-label={lang === "EN" ? "Groups" : "Group"}
          >
            <Users size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={gpsLoading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-bg)] text-[var(--accent2)] transition active:scale-95 disabled:opacity-50"
            aria-label="GPS"
          >
            <Plus size={18} strokeWidth={2.2} className={cn(gpsLoading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text)] transition hover:bg-[var(--surface-tint)] active:scale-95 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw size={17} strokeWidth={2.2} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-[455] px-4 sm:px-6">
          <p className="pointer-events-auto mx-auto w-full max-w-3xl rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600 backdrop-blur-md dark:text-rose-300">
            {error}
          </p>
        </div>
      )}

      {!loading && points.length === 0 && !error && !draftPin && !listOpen && (
        <div className="pointer-events-none absolute inset-0 z-[440] flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-[28px] border border-[var(--border)] bg-[var(--card)]/95 px-7 py-8 text-center shadow-[var(--shadow-lg)] backdrop-blur-xl">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--accent-bg)] text-[var(--accent2)]">
              <MapPinned size={24} />
            </span>
            <p className="text-base font-black text-[var(--text)]">
              {lang === "EN" ? "No places yet" : "Belum ada tempat"}
            </p>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-[var(--muted)]">
              {lang === "EN"
                ? "Use GPS pin button, or WhatsApp: pinx house maksu family @here"
                : "Guna butang Pin GPS, atau WhatsApp: pinx house maksu family @here"}
            </p>
          </div>
        </div>
      )}

      {draftPin && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-[480] max-h-[min(48dvh,22rem)] overflow-y-auto px-3 sm:px-5 lg:inset-x-auto lg:left-[240px] lg:right-[300px] lg:bottom-8 lg:max-h-none lg:flex lg:justify-end lg:overflow-visible lg:px-4">
          <div className="w-full max-w-md lg:w-[22rem]">
          <div className="pointer-events-auto mx-auto w-full max-w-md rounded-[26px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[var(--shadow-lg)] backdrop-blur-2xl lg:mx-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-black text-[var(--text)]">
                {lang === "EN" ? "Save place" : "Simpan tempat"}
              </p>
              <button
                type="button"
                onClick={() => setDraftPin(null)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] p-2 text-[var(--muted)]"
              >
                <X size={14} />
              </button>
            </div>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={lang === "EN" ? "Title (e.g. house maksu)" : "Tajuk (cth. house maksu)"}
              className="mb-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
            />
            <input
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder={lang === "EN" ? "Category (custom)" : "Kategori (custom)"}
              list="place-category-suggestions"
              className="mb-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
            />
            <datalist id="place-category-suggestions">
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name} />
              ))}
            </datalist>
            <p className="mb-3 text-[0.65rem] font-medium text-[var(--muted)]">
              {draftPin.lat.toFixed(5)}, {draftPin.lng.toFixed(5)}
            </p>
            <button
              type="button"
              disabled={saving || !formTitle.trim() || !formCategory.trim()}
              onClick={() => void savePlace()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (lang === "EN" ? "Saving…" : "Simpan…") : lang === "EN" ? "Save pin" : "Simpan pin"}
            </button>
          </div>
          </div>
        </div>
      )}

      {/* List drawer — slide from right (desktop: over main only) */}
      <div
        className={cn(
 "fixed inset-0 z-[500] transition-opacity duration-300 lg:left-[240px] lg:right-[300px]",
          listOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          aria-label="Close list"
          onClick={() => requestListClose()}
          className="absolute inset-0 bg-transparent"
        />
        <aside
          className={cn(
            "absolute bottom-0 right-0 top-0 flex w-full max-w-[22rem] flex-col border-l border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[24rem]",
            listOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <AppSheetHeader
            title={listTitle}
            eyebrow={lang === "EN" ? "List" : "Senarai"}
            onClose={requestListClose}
            showCancel={false}
          />

          <div className="shrink-0 overflow-x-auto border-b border-[var(--border)] px-3 py-2.5">
            <div className="flex w-max items-center gap-1.5">
              <button
                type="button"
                onClick={() => setListCategoryFilter("all")}
                className={cn(
                  "shrink-0 rounded-xl px-2.5 py-1.5 text-[0.7rem] font-bold transition",
                  listCategoryFilter === "all"
                    ? "bg-[var(--btn-primary-bg)] text-white"
                    : "bg-[var(--surface-tint)] text-[var(--muted)]",
                )}
              >
                {lang === "EN" ? "All" : "Semua"}
              </button>
              {categories.map((cat) => (
                <button
                  key={`drawer-tab-${cat.id}`}
                  type="button"
                  onClick={() => setListCategoryFilter(cat.id)}
                  className={cn(
                    "shrink-0 rounded-xl px-2.5 py-1.5 text-[0.7rem] font-bold transition",
                    listCategoryFilter === cat.id
                      ? "bg-[var(--btn-primary-bg)] text-white"
                      : "bg-[var(--surface-tint)] text-[var(--muted)]",
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {loading && (
              <p className="px-2 py-8 text-center text-xs font-semibold text-[var(--muted)]">
                {lang === "EN" ? "Loading…" : "Memuatkan…"}
              </p>
            )}
            {!loading && listPoints.length === 0 && (
              <div className="px-3 py-10 text-center">
                <MapPinned className="mx-auto mb-2 text-[var(--muted)]" size={22} />
                <p className="text-sm font-bold text-[var(--text)]">
                  {lang === "EN" ? "No places in this category" : "Tiada tempat dalam kategori ni"}
                </p>
              </div>
            )}
            {listPoints.map((point, index) => {
              const isActive = point.id === activePointId
              return (
                <div
                  key={point.id}
                  ref={(node) => {
                    if (node) listItemRefs.current.set(point.id, node)
                    else listItemRefs.current.delete(point.id)
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border px-2.5 py-2 transition-all",
                    isActive
                      ? "border-[color-mix(in_srgb,var(--accent2)_28%,var(--border))] bg-[var(--accent-bg)]"
                      : "border-[var(--border)] bg-[var(--surface-tint)]/70",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectPlaceFromList(point.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[0.7rem] font-black",
                        isActive
                          ? "bg-[var(--btn-primary-bg)] text-white"
                          : "bg-[var(--surface-tint-strong)] text-[var(--text)]",
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--text)]">{point.title}</p>
                      <p className="truncate text-[0.65rem] font-medium text-[var(--muted)]">
                        {point.category_name || "—"}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(placeMapsUrl(point.latitude, point.longitude), "_blank")
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                    aria-label="Maps"
                  >
                    <Route size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openShareSheet(point, "group")}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                    aria-label="WhatsApp"
                  >
                    <Share2 size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void deletePlace(point.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300"
                    aria-label={lang === "EN" ? "Delete" : "Padam"}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      {/* Share sheet: Group | Numbers | Manage */}
      {shareOpen && (
 <div className="fixed inset-0 z-[520] lg:left-[240px] lg:right-[300px]">
          <button
            type="button"
            aria-label="Close share"
            onClick={() => requestShareClose()}
            className="absolute inset-0 bg-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 flex justify-center px-0 sm:px-4 lg:justify-center lg:px-6">
            <div className="flex max-h-[min(82dvh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] border-b-0 bg-[var(--card)] shadow-2xl sm:mb-4 sm:rounded-[28px] sm:border-b">
              <div className="mb-1 flex shrink-0 justify-center pt-2.5">
                <span className="h-1 w-10 rounded-full bg-[var(--border)]" />
              </div>
              <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-2">
                <div className="min-w-0">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {sharePlace ? "WhatsApp" : lang === "EN" ? "Groups" : "Group"}
                  </p>
                  <h3 className="truncate text-sm font-black text-[var(--text)]">
                    {sharePlace
                      ? sharePlace.title
                      : lang === "EN"
                        ? "Convoi groups"
                        : "Group convoi"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => requestShareClose()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--muted)]"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex shrink-0 gap-1 px-3 pb-2">
                {(
                  [
                    ["group", lang === "EN" ? "Group" : "Group"],
                    ["numbers", lang === "EN" ? "Numbers" : "Nombor"],
                    ["manage", lang === "EN" ? "Manage" : "Urus"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setShareTab(key)
                      setShareResult(null)
                    }}
                    className={cn(
                      "flex-1 rounded-xl px-2 py-1.5 text-[0.7rem] font-bold transition",
                      shareTab === key
                        ? "bg-[var(--btn-primary-bg)] text-white"
                        : "bg-[var(--surface-tint)] text-[var(--muted)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                {shareTab === "group" && (
                  <div className="space-y-2">
                    <p className="text-[0.7rem] font-medium text-[var(--muted)]">
                      {lang === "EN"
                        ? "Select convoy group, then send."
                        : "Pilih group convoi, kemudian hantar."}
                    </p>
                    {shareGroups.length === 0 && (
                      <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs font-semibold text-[var(--muted)]">
                        {lang === "EN"
                          ? "No groups yet. Open Manage tab to create one."
                          : "Belum ada group. Buka tab Urus untuk buat."}
                      </p>
                    )}
                    {shareGroups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setShareGroupId(g.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 text-left transition",
                          shareGroupId === g.id
                            ? "border-[var(--accent2)] bg-[var(--accent-bg)]"
                            : "border-[var(--border)] bg-[var(--surface-tint)]/70",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--text)]">{g.name}</p>
                          <p className="text-[0.65rem] font-medium text-[var(--muted)]">
                            {g.phone_count ?? g.phones?.length ?? 0}{" "}
                            {lang === "EN" ? "numbers" : "nombor"}
                          </p>
                        </div>
                        {shareGroupId === g.id && (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--btn-primary-bg)]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {shareTab === "numbers" && (
                  <div>
                    <p className="mb-2 text-[0.7rem] font-medium text-[var(--muted)]">
                      {lang === "EN"
                        ? "Paste numbers (max 20). Uses linked WhatsApp QR."
                        : "Tampal nombor (max 20). Guna session WhatsApp QR."}
                    </p>
                    <textarea
                      value={sharePhones}
                      onChange={(e) => setSharePhones(e.target.value)}
                      rows={4}
                      placeholder={"60123456789\n60198765432\n0123456789"}
                      className="mb-2 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                    />
                    <p className="text-[0.65rem] font-medium text-[var(--muted)]">
                      {parsePhoneInput(sharePhones).length}{" "}
                      {lang === "EN" ? "valid number(s)" : "nombor sah"}
                    </p>
                  </div>
                )}

                {shareTab === "manage" && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)]/50 p-3">
                      <p className="mb-2 text-[0.7rem] font-bold text-[var(--text)]">
                        {lang === "EN" ? "New group" : "Group baru"}
                      </p>
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder={lang === "EN" ? "Name (e.g. Convoi Raya)" : "Nama (cth. Convoi Raya)"}
                        className="mb-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                      />
                      <textarea
                        value={newGroupPhones}
                        onChange={(e) => setNewGroupPhones(e.target.value)}
                        rows={3}
                        placeholder={"0123456789\n0198765432"}
                        className="mb-2 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent2)]"
                      />
                      <button
                        type="button"
                        disabled={
                          groupSaving ||
                          !newGroupName.trim() ||
                          !parsePhoneInput(newGroupPhones).length
                        }
                        onClick={() => void createShareGroup()}
                        className="w-full rounded-xl bg-[var(--btn-primary-bg)] py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {groupSaving
                          ? lang === "EN"
                            ? "Saving…"
                            : "Simpan…"
                          : lang === "EN"
                            ? "Save group"
                            : "Simpan group"}
                      </button>
                    </div>
                    {shareGroups.map((g) => (
                      <div
                        key={`manage-${g.id}`}
                        className="flex items-center gap-2 rounded-2xl border border-[var(--border)] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--text)]">{g.name}</p>
                          <p className="text-[0.65rem] text-[var(--muted)]">
                            {g.phone_count ?? g.phones?.length ?? 0} nombor
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteShareGroup(g.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/15 text-rose-600"
                          aria-label="Delete group"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {shareResult && (
                  <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-2 text-xs font-semibold text-[var(--text)]">
                    {shareResult}
                  </p>
                )}
              </div>

              {shareTab !== "manage" && sharePlace && (
                <div className="shrink-0 border-t border-[var(--border)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                  <button
                    type="button"
                    disabled={
                      shareSending ||
                      (shareTab === "group" && !shareGroupId) ||
                      (shareTab === "numbers" && !parsePhoneInput(sharePhones).length)
                    }
                    onClick={() => void sendShareWhatsApp()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Share2 size={14} />
                    {shareSending
                      ? lang === "EN"
                        ? "Sending…"
                        : "Hantar…"
                      : lang === "EN"
                        ? "Send via WhatsApp"
                        : "Hantar via WhatsApp"}
                  </button>
                </div>
              )}
              {shareTab !== "manage" && !sharePlace && (
                <div className="shrink-0 border-t border-[var(--border)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                  <p className="text-center text-[0.7rem] font-medium text-[var(--muted)]">
                    {lang === "EN"
                      ? "To send location, open Share icon on a pin."
                      : "Untuk hantar lokasi, tekan icon Share pada pin."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!draftPin && !listOpen && !shareOpen && (
        <div
          className={cn(
            "pointer-events-none fixed z-[480] px-3 sm:px-5",
            // mobile: above bottom nav
            "inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]",
            // desktop: main column only (between left 240px + right 300px rails)
            "lg:inset-x-auto lg:left-[240px] lg:right-[300px] lg:bottom-6 lg:flex lg:justify-center lg:px-4",
          )}
        >
          <div className="mx-auto w-full max-w-md lg:mx-0 lg:w-[22rem]">
            {activePoint && (
              <div className="pointer-events-auto relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)]/95 px-4 py-3.5 shadow-[var(--shadow-lg)] backdrop-blur-2xl">
                <button
                  onClick={() => requestActivePointClose()}
                  className="absolute right-2.5 top-2.5 z-10 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] p-1.5 text-[var(--muted)]"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
                <p className="pr-9 truncate text-sm font-black text-[var(--text)]">{activePoint.title}</p>
                <p className="mt-0.5 text-[0.68rem] font-medium text-[var(--muted)]">
                  {activePoint.category_name || "—"}
                  {activePointIndex >= 0 ? ` · ${activePointIndex + 1}/${points.length}` : ""}
                </p>
                <div className="mt-2.5 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => {
                      window.open(
                        placeMapsUrl(activePoint.latitude, activePoint.longitude),
                        "_blank",
                      )
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]"
                    aria-label="Maps"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button
                    onClick={() => openShareSheet(activePoint, "group")}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tint)] text-[var(--text)]"
                    aria-label="WhatsApp"
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    disabled={deleting}
                    onClick={() => void deletePlace(activePoint.id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300"
                    aria-label={lang === "EN" ? "Delete" : "Padam"}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
