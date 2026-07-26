"use client"

import React, { useEffect, useRef, useState } from "react"
import { Image as ImageIcon, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type SmartImageProps = {
  src?: string | null
  fallbackSrc?: string | null
  alt?: string
  className?: string
  imgClassName?: string
  /** Max retries per source before switching to fallback / failed. Default 4. */
  maxRetries?: number
  /** Base delay (ms) between retries; multiplies by attempt. Default 700. */
  retryBaseMs?: number
  loading?: "lazy" | "eager"
  decoding?: "async" | "auto" | "sync"
  showLoader?: boolean
  showMissingLabel?: boolean
  missingLabel?: string
  onLoad?: () => void
  onFail?: () => void
  onClick?: React.MouseEventHandler<HTMLImageElement>
}

function isBlobOrDataUrl(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:")
}

function withRetryParam(url: string, attempt: number) {
  if (attempt <= 0 || isBlobOrDataUrl(url)) return url
  return `${url}${url.includes("?") ? "&" : "?"}_retry=${attempt}`
}

/**
 * Global image loader for R2/CDN/proxy URLs.
 * Shows spinner while loading, retries on error (post-upload propagation), then optional fallback.
 * Handles already-cached images (onLoad may not fire if complete).
 */
export function SmartImage({
  src,
  fallbackSrc,
  alt = "",
  className,
  imgClassName,
  maxRetries = 4,
  retryBaseMs = 700,
  loading = "lazy",
  decoding = "async",
  showLoader = true,
  showMissingLabel = false,
  missingLabel = "Missing",
  onLoad,
  onFail,
  onClick,
}: SmartImageProps) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const retryTimer = useRef<number | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad

  const primary = (src || "").trim()
  const fallback = (fallbackSrc || "").trim()
  const hasSrc = Boolean(primary)

  useEffect(() => {
    setAttempt(0)
    setFailed(false)
    setLoaded(false)
    setUsingFallback(false)
    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }, [primary, fallback])

  useEffect(
    () => () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
    },
    [],
  )

  // If browser already has the image decoded (blob/cache), onLoad may never fire.
  useEffect(() => {
    const img = imgRef.current
    if (!img || failed || !hasSrc) return
    if (img.complete && img.naturalWidth > 0) {
      setLoaded(true)
      onLoadRef.current?.()
    }
  }, [primary, fallback, attempt, usingFallback, failed, hasSrc])

  if (!hasSrc || failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[var(--surface-tint)] text-[var(--muted)]",
          className,
        )}
      >
        <ImageIcon size={24} className="opacity-50" />
        {showMissingLabel ? (
          <span className="px-2 text-center text-[0.6rem] font-semibold uppercase tracking-wide opacity-70">
            {missingLabel}
          </span>
        ) : null}
      </div>
    )
  }

  const activeSrc = usingFallback && fallback && fallback !== primary ? fallback : primary
  const retryUrl = withRetryParam(activeSrc, attempt)

  return (
    <div className={cn("relative h-full w-full", className)}>
      {showLoader && !loaded ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[var(--surface-tint)]">
          <div className="absolute inset-0 animate-pulse bg-[var(--surface-tint-strong)]/70" />
          <Loader2 size={20} className="relative z-[1] animate-spin text-[var(--muted)]" />
        </div>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={retryUrl}
        alt={alt}
        loading={isBlobOrDataUrl(activeSrc) ? "eager" : loading}
        decoding={decoding}
        className={cn(imgClassName, !loaded && "opacity-0")}
        onClick={onClick}
        onLoad={() => {
          setLoaded(true)
          onLoadRef.current?.()
        }}
        onError={() => {
          setLoaded(false)
          // blob:/data: — no point retrying with query params
          if (isBlobOrDataUrl(activeSrc)) {
            if (!usingFallback && fallback && fallback !== primary) {
              setUsingFallback(true)
              setAttempt(0)
              return
            }
            setFailed(true)
            onFail?.()
            return
          }
          if (attempt >= maxRetries) {
            if (!usingFallback && fallback && fallback !== primary) {
              setUsingFallback(true)
              setAttempt(0)
              return
            }
            setFailed(true)
            onFail?.()
            return
          }
          retryTimer.current = window.setTimeout(
            () => setAttempt((value) => value + 1),
            retryBaseMs * (attempt + 1),
          )
        }}
      />
    </div>
  )
}
