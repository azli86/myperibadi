"use client"

import React, { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const INTRO_SESSION_KEY = "myperibadi_intro_played_v3"
const VIDEO_CACHE_KEY = "myperibadi-intro-video-cache-v3"
const DEFAULT_VIDEO_URL = "/assets/videos/myperibadivideointro.mp4"

export default function MobileIntroSplash() {
  const [mounted, setMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [videoSrc, setVideoSrc] = useState<string>(DEFAULT_VIDEO_URL)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
    if (typeof window === "undefined") return

    // Trigger for mobile viewports / devices
    const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (!isMobile) return

    // Check if intro has already been played in this browser session
    const hasPlayed = sessionStorage.getItem(INTRO_SESSION_KEY)
    if (hasPlayed) return

    setIsVisible(true)

    // Load from Cache Storage API if available
    let isSubscribed = true
    const initVideoCache = async () => {
      try {
        if ("caches" in window) {
          const cache = await caches.open(VIDEO_CACHE_KEY)
          const matched = await cache.match(DEFAULT_VIDEO_URL)
          if (matched) {
            const blob = await matched.blob()
            if (isSubscribed && blob.size > 0) {
              const objUrl = URL.createObjectURL(blob)
              blobUrlRef.current = objUrl
              setVideoSrc(objUrl)
              return
            }
          }
          // If not cached, fetch & cache in background for next time
          fetch(DEFAULT_VIDEO_URL)
            .then((res) => {
              if (res.ok) cache.put(DEFAULT_VIDEO_URL, res.clone())
            })
            .catch(() => {})
        }
      } catch {
        /* ignore */
      }
    }
    void initVideoCache()

    // Fallback safety timeout in case video fails to fire onEnded (max 6 seconds)
    dismissTimerRef.current = setTimeout(() => {
      handleDismiss()
    }, 6000)

    return () => {
      isSubscribed = false
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (isVisible && videoRef.current) {
      videoRef.current.muted = false
      const playPromise = videoRef.current.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If browser autoplay policy blocks unmuted audio on cold start, fallback to muted
          if (videoRef.current) {
            videoRef.current.muted = true
            setIsMuted(true)
            videoRef.current.play().catch(() => {})
          }
        })
      }
    }
  }, [isVisible, videoSrc])

  const handleDismiss = () => {
    if (isFadingOut) return
    setIsFadingOut(true)
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, "1")
    } catch {
      /* ignore */
    }

    // Fade out duration 500ms
    setTimeout(() => {
      setIsVisible(false)
    }, 500)
  }

  if (!mounted || !isVisible) return null

  return (
    <div
      aria-label="App Intro"
      className={cn(
        "fixed inset-0 z-[99998] flex h-[100dvh] w-screen items-center justify-center bg-black transition-opacity duration-500 overflow-hidden touch-none select-none",
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100 cursor-pointer"
      )}
      onClick={handleDismiss}
    >
      {/* Intro Video Element (Fit Full Screen) */}
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        playsInline
        muted={isMuted}
        preload="auto"
        onEnded={handleDismiss}
        onError={handleDismiss}
        className="h-[100dvh] w-full object-cover pointer-events-none"
      />
    </div>
  )
}
