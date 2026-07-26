"use client"

import { useEffect, useId, useRef } from "react"

interface TurnstileProps {
  sitekey?: string
  onVerify: (token: string) => void
  onError?: () => void
  theme?: "light" | "dark" | "auto"
  className?: string
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, opts: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
      ready?: (cb: () => void) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("cf-turnstile-script") as HTMLScriptElement | null
    if (existing) {
      const poll = (attempt = 0) => {
        if (window.turnstile) resolve()
        else if (attempt > 120) reject(new Error("Turnstile script timeout"))
        else setTimeout(() => poll(attempt + 1), 50)
      }
      poll()
      return
    }

    const script = document.createElement("script")
    script.id = "cf-turnstile-script"
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("Failed to load Turnstile"))
    }
    document.head.appendChild(script)
  })

  return scriptPromise
}

/**
 * Cloudflare Turnstile widget.
 *
 * Note: browser console often shows font CSP errors with
 * `default-src 'none'` coming FROM INSIDE the Turnstile iframe.
 * Those are Cloudflare's own iframe policy and are safe to ignore.
 */
export default function Turnstile({
  sitekey,
  onVerify,
  onError,
  theme = "auto",
  className,
}: TurnstileProps) {
  const reactId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const renderedRef = useRef(false)
  const onVerifyRef = useRef(onVerify)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onVerifyRef.current = onVerify
  }, [onVerify])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    let cancelled = false

    if (!sitekey) {
      onErrorRef.current?.()
      return
    }

    const mount = async () => {
      try {
        await loadTurnstileScript()
      } catch {
        if (!cancelled) onErrorRef.current?.()
        return
      }
      if (cancelled || !window.turnstile) {
        if (!cancelled) onErrorRef.current?.()
        return
      }

      const el = containerRef.current
      if (!el) return

      // Guard against double render (React Strict Mode / remount races)
      if (renderedRef.current && widgetIdRef.current) return

      // Clean any previous leftover nodes
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* noop */
        }
        widgetIdRef.current = null
      }
      el.innerHTML = ""

      try {
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey,
          theme,
          size: "flexible",
          appearance: "always",
          retry: "auto",
          "retry-interval": 8000,
          "refresh-expired": "auto",
          callback: (token: string) => {
            onVerifyRef.current(token || "")
          },
          "expired-callback": () => {
            onVerifyRef.current("")
          },
          "error-callback": () => {
            // Do not auto-remount here — prevents challenge spam loops.
            onVerifyRef.current("")
            onErrorRef.current?.()
          },
          "timeout-callback": () => {
            onVerifyRef.current("")
            onErrorRef.current?.()
          },
        })
        renderedRef.current = true
      } catch {
        renderedRef.current = false
        if (!cancelled) onErrorRef.current?.()
      }
    }

    void mount()

    return () => {
      cancelled = true
      renderedRef.current = false
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* noop */
        }
      }
      widgetIdRef.current = null
      if (containerRef.current) containerRef.current.innerHTML = ""
    }
    // Only re-create when sitekey/theme intentionally change.
  }, [sitekey, theme, reactId])

  return (
    <div
      className={className ?? "my-2 flex min-h-[70px] w-full items-center justify-center"}
      data-turnstile-host={reactId}
    >
      <div ref={containerRef} className="cf-turnstile w-full" />
    </div>
  )
}
