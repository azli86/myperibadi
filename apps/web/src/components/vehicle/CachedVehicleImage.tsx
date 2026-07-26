"use client"

import React, { useEffect, useRef, useState } from "react"
import { Car, Loader2 } from "lucide-react"
import { SmartImage } from "@/components/ui/SmartImage"
import { cn } from "@/lib/utils"
import { loadVehicleImageUrl } from "@/lib/vehicle-image-cache"

type CachedVehicleImageProps = {
  vehicleId: number
  hasImage?: boolean
  /** Direct public R2 CDN URL when available — preferred over API proxy. */
  imageUrl?: string | null
  alt?: string
  bust?: number
  className?: string
  imgClassName?: string
  showLoader?: boolean
  fallbackIconSize?: number
  naturalHeight?: boolean
  onNaturalSize?: (size: { width: number; height: number }) => void
}

/**
 * Vehicle image: prefer direct R2 CDN `imageUrl`, else authenticated API + IndexedDB cache.
 */
export function CachedVehicleImage({
  vehicleId,
  hasImage = true,
  imageUrl = null,
  alt = "",
  bust = 0,
  className,
  imgClassName,
  showLoader = true,
  fallbackIconSize = 26,
  naturalHeight = false,
  onNaturalSize,
}: CachedVehicleImageProps) {
  const directUrl = (imageUrl || "").trim()
  const useDirect = Boolean(directUrl)

  // ── Direct R2 CDN path ──────────────────────────────────────────────
  if (useDirect && hasImage) {
    const src = bust > 0
      ? `${directUrl}${directUrl.includes("?") ? "&" : "?"}t=${bust}`
      : directUrl
    return (
      <div
        className={cn(
          "relative w-full overflow-hidden",
          naturalHeight ? "h-auto min-h-[8rem]" : "h-full",
          className,
        )}
      >
        <SmartImage
          src={src}
          fallbackSrc={`/api/vehicles/${vehicleId}/image`}
          alt={alt}
          showLoader={showLoader}
          loading="lazy"
          className={naturalHeight ? "h-auto w-full" : "h-full w-full"}
          imgClassName={cn(
            naturalHeight
              ? "block h-auto w-full max-w-full object-contain object-center"
              : "h-full w-full object-cover",
            imgClassName,
          )}
          onLoad={() => {
            if (!onNaturalSize) return
            const probe = new window.Image()
            probe.onload = () => {
              if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
                onNaturalSize({ width: probe.naturalWidth, height: probe.naturalHeight })
              }
            }
            probe.src = src
          }}
        />
      </div>
    )
  }

  return (
    <CachedVehicleImageProxy
      vehicleId={vehicleId}
      hasImage={hasImage}
      alt={alt}
      bust={bust}
      className={className}
      imgClassName={imgClassName}
      showLoader={showLoader}
      fallbackIconSize={fallbackIconSize}
      naturalHeight={naturalHeight}
      onNaturalSize={onNaturalSize}
    />
  )
}

/** Fallback: authenticated API proxy + local blob cache. */
function CachedVehicleImageProxy({
  vehicleId,
  hasImage = true,
  alt = "",
  bust = 0,
  className,
  imgClassName,
  showLoader = true,
  fallbackIconSize = 26,
  naturalHeight = false,
  onNaturalSize,
}: Omit<CachedVehicleImageProps, "imageUrl">) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(hasImage))
  const [failed, setFailed] = useState(false)
  const [displayed, setDisplayed] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!hasImage || !vehicleId) {
      setSrc(null)
      setLoading(false)
      setFailed(false)
      setDisplayed(false)
      return
    }

    setLoading(true)
    setFailed(false)
    setDisplayed(false)
    setSrc(null)

    ;(async () => {
      try {
        const url = await loadVehicleImageUrl(vehicleId, { bust })
        if (cancelled) return
        if (!url) {
          setSrc(null)
          setFailed(true)
        } else {
          setSrc(url)
        }
      } catch {
        if (!cancelled) {
          setSrc(null)
          setFailed(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [vehicleId, hasImage, bust])

  useEffect(() => {
    const img = imgRef.current
    if (!img || !src) return
    if (img.complete && img.naturalWidth > 0) {
      setDisplayed(true)
      onNaturalSize?.({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }, [src, onNaturalSize])

  if (!hasImage || failed) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center bg-[var(--surface-tint)] text-[var(--accent2)]",
          naturalHeight ? "min-h-[14rem]" : "h-full",
          className,
        )}
      >
        <Car size={fallbackIconSize} className="opacity-50" strokeWidth={1.5} />
      </div>
    )
  }

  const showSpinner = showLoader && (!src || !displayed)

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        naturalHeight ? "h-auto min-h-[8rem]" : "h-full",
        className,
      )}
    >
      {showSpinner ? (
        <div
          className={cn(
            "flex w-full items-center justify-center bg-[var(--surface-tint)]",
            naturalHeight ? "min-h-[14rem]" : "absolute inset-0 z-[1]",
          )}
        >
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
          className={cn(
            naturalHeight
              ? "block h-auto w-full max-w-full object-contain object-center"
              : "h-full w-full object-cover",
            !displayed && "opacity-0",
            imgClassName,
          )}
          loading="eager"
          decoding="async"
          onLoad={(e) => {
            setDisplayed(true)
            const img = e.currentTarget
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              onNaturalSize?.({ width: img.naturalWidth, height: img.naturalHeight })
            }
          }}
          onError={() => {
            setDisplayed(false)
            setFailed(true)
          }}
        />
      ) : null}
    </div>
  )
}
