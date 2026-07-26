"use client"

import React, { useEffect, useRef, useState } from "react"
import { Loader2, Package } from "lucide-react"
import { SmartImage } from "@/components/ui/SmartImage"
import { getAccessToken, isCookieAuthSentinel } from "@/lib/auth-session"
import { cn } from "@/lib/utils"

type WarrantyDeviceImageProps = {
  deviceId: number
  hasImage?: boolean
  /** Direct public R2 CDN URL when available. */
  imageUrl?: string | null
  alt?: string
  className?: string
  imgClassName?: string
  fallbackIconSize?: number
  bust?: number
}

const RETRY_DELAYS_MS = [600, 1200, 2200, 3500]

/**
 * Warranty device image: prefer direct R2 CDN, else authenticated API proxy with retry.
 */
export function WarrantyDeviceImage({
  deviceId,
  hasImage = true,
  imageUrl = null,
  alt = "",
  className,
  imgClassName,
  fallbackIconSize = 26,
  bust = 0,
}: WarrantyDeviceImageProps) {
  const directUrl = (imageUrl || "").trim()

  if (directUrl && hasImage) {
    const src = bust > 0
      ? `${directUrl}${directUrl.includes("?") ? "&" : "?"}t=${bust}`
      : directUrl
    return (
      <div className={cn("relative overflow-hidden bg-[var(--surface-tint)]", className)}>
        <SmartImage
          src={src}
          fallbackSrc={`/api/warranties/${deviceId}/image`}
          alt={alt}
          loading="lazy"
          className="h-full w-full"
          imgClassName={cn("h-full w-full object-cover object-center", imgClassName)}
        />
      </div>
    )
  }

  return (
    <WarrantyDeviceImageProxy
      deviceId={deviceId}
      hasImage={hasImage}
      alt={alt}
      className={className}
      imgClassName={imgClassName}
      fallbackIconSize={fallbackIconSize}
      bust={bust}
    />
  )
}

function WarrantyDeviceImageProxy({
  deviceId,
  hasImage = true,
  alt = "",
  className,
  imgClassName,
  fallbackIconSize = 26,
  bust = 0,
}: Omit<WarrantyDeviceImageProps, "imageUrl">) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(hasImage))
  const [failed, setFailed] = useState(false)
  const [displayed, setDisplayed] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    if (!hasImage || !deviceId) {
      setSrc(null)
      setLoading(false)
      setFailed(false)
      setDisplayed(false)
      return
    }

    setFailed(false)
    setSrc(null)
    setLoading(true)
    setDisplayed(false)

    ;(async () => {
      const token = getAccessToken()
      const headers: HeadersInit = {}
      if (token && !isCookieAuthSentinel(token)) {
        headers.Authorization = `Bearer ${token}`
      }
      const baseUrl = bust
        ? `/api/warranties/${deviceId}/image?t=${bust}`
        : `/api/warranties/${deviceId}/image`

      let lastError: unknown = null
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        if (cancelled) return
        try {
          const url = attempt > 0
            ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_retry=${attempt}`
            : baseUrl
          const res = await fetch(url, {
            headers,
            credentials: "include",
            cache: "no-store",
          })
          if (!res.ok) throw new Error(`Warranty image failed (${res.status})`)
          const blob = await res.blob()
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setSrc(objectUrl)
          setLoading(false)
          return
        } catch (err) {
          lastError = err
          if (attempt < RETRY_DELAYS_MS.length) {
            await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
          }
        }
      }

      if (!cancelled) {
        console.warn("Warranty image load failed:", lastError)
        setFailed(true)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [deviceId, hasImage, bust])

  useEffect(() => {
    const img = imgRef.current
    if (!img || !src) return
    if (img.complete && img.naturalWidth > 0) setDisplayed(true)
  }, [src])

  if (!hasImage || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-[var(--accent-bg)] via-[var(--surface-tint)] to-[var(--card)] text-[var(--accent2)]",
          className,
        )}
      >
        <Package size={fallbackIconSize} className="opacity-55" strokeWidth={1.4} />
      </div>
    )
  }

  const showSpinner = loading || !src || !displayed

  return (
    <div className={cn("relative overflow-hidden bg-[var(--surface-tint)]", className)}>
      {showSpinner ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[var(--surface-tint)]">
          <div className="absolute inset-0 animate-pulse bg-[var(--surface-tint-strong)]/60" />
          <Loader2 size={18} className="relative z-[1] animate-spin text-[var(--muted)]" />
        </div>
      ) : null}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          className={cn(
            "h-full w-full object-cover object-center",
            !displayed && "opacity-0",
            imgClassName,
          )}
          onLoad={() => setDisplayed(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  )
}
