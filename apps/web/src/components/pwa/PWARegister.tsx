"use client"

import { useEffect } from "react"

const CHUNK_RELOAD_KEY = "budget-by-digitalport:chunk-reload-at"
const CHUNK_ERROR_PATTERNS = [
  "ChunkLoadError",
  "Loading chunk",
  "failed to fetch dynamically imported module",
  "Importing a module script failed",
  "dynamically imported module",
]

function isChunkLoadError(message: string) {
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

function reloadOnceForChunkError() {
  try {
    const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0")
    if (Number.isFinite(lastReload) && Date.now() - lastReload < 15000) {
      return
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
  }
  window.location.reload()
}

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    let isMounted = true
    let didReloadForController = false

    const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" })
      registration.installing?.addEventListener("statechange", () => {
        if (registration.installing?.state === "installed" && navigator.serviceWorker.controller) {
          registration.installing.postMessage({ type: "SKIP_WAITING" })
        }
      })
    }

    const handleControllerChange = () => {
      if (didReloadForController) return
      didReloadForController = true
      window.location.reload()
    }

    const handleWindowError = (event: ErrorEvent) => {
      const message = `${event.message || ""} ${event.error?.message || ""}`
      if (isChunkLoadError(message)) {
        reloadOnceForChunkError()
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = `${reason?.message || ""} ${String(reason || "")}`
      if (isChunkLoadError(message)) {
        reloadOnceForChunkError()
      }
    }

    const register = async () => {
      try {
        if (!isMounted) return
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        activateWaitingWorker(registration)
        await registration.update()
        activateWaitingWorker(registration)
      } catch (error) {
        console.error("PWA service worker registration failed", error)
      }
    }

    const runRegister = () => {
      void register()
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)
    window.addEventListener("error", handleWindowError)
    window.addEventListener("unhandledrejection", handleUnhandledRejection)

    if (document.readyState === "complete") {
      runRegister()
    } else {
      window.addEventListener("load", runRegister, { once: true })
    }

    return () => {
      isMounted = false
      window.removeEventListener("load", runRegister)
      window.removeEventListener("error", handleWindowError)
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
    }
  }, [])

  return null
}
