"use client"

import { useEffect } from "react"
import { getAccessToken } from "@/lib/auth-session"

/**
 * Opens a single SSE connection to `/api/events` for the signed-in user.
 * On any server event it dispatches a window-level CustomEvent `app:data-changed`
 * with `{ resource }` so mounted pages can refetch their data without manual refresh.
 *
 * Mount this ONCE in the Shell layout so every page under it receives updates.
 * The auth cookie is same-origin so EventSource sends it automatically.
 */
export function useRealtime({ enabled = true }: { enabled?: boolean } = {}) {
  useEffect(() => {
    if (!enabled) return
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      if (closed) return
      try {
        source = new EventSource(`/api/events?access_token=${encodeURIComponent(getAccessToken() || "")}`)
        source.addEventListener("ready", () => {})
        source.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data)
            const resource = payload?.resource || ""
            window.dispatchEvent(
              new CustomEvent("app:data-changed", { detail: { resource, event: payload?.event, data: payload?.data } }),
            )
          } catch {}
        }
        source.onerror = () => {
          source?.close()
          source = null
          // Auto-reconnect with backoff.
          if (!closed) {
            retryTimer = setTimeout(connect, 5000)
          }
        }
      } catch {
        retryTimer = setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      closed = true
      source?.close()
      source = null
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [enabled])
}

export type DataChangedDetail = { resource: string; event?: string; data?: unknown }

/** Add a `app:data-changed` listener. Returns a cleanup fn. */
export function onDataChanged(handler: (detail: DataChangedDetail) => void): () => void {
  const onEvt = (e: Event) => {
    const detail = (e as CustomEvent<DataChangedDetail>).detail
    handler(detail)
  }
  window.addEventListener("app:data-changed", onEvt as EventListener)
  return () => window.removeEventListener("app:data-changed", onEvt as EventListener)
}

/** Convenience: return true when a data-changed event should trigger a refetch for this resource scope. */
export function shouldRefetchFor(resource: string, target: string): boolean {
  if (!resource || !target) return false
  return resource === target
}
