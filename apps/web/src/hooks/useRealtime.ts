"use client"

import { useEffect } from "react"
import { getAccessToken } from "@/lib/auth-session"

/**
 * Opens a single SSE connection to `/api/realtime` for the signed-in user.
 * On any server event it dispatches a window-level CustomEvent `app:data-changed`
 * with `{ resource }` so mounted pages can refetch their data without manual refresh.
 *
 * Mount this ONCE in the Shell layout so every page under it receives updates.
 * The auth cookie is same-origin so EventSource sends it automatically.
 */
export function useRealtime({ enabled = false }: { enabled?: boolean } = {}) {
  useEffect(() => {
    if (!enabled) return
    let source: EventSource | null = null
    let closed = false

    // If an SSE endpoint is implemented in the future, connect with strict failure cutoff
    const token = getAccessToken()
    if (!token) return

    try {
      source = new EventSource(`/api/realtime?access_token=${encodeURIComponent(token)}`)
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
        // Disconnect immediately on failure and do not reconnect in a loop
        source?.close()
        source = null
      }
    } catch {
      // Do not retry in loop if not supported
    }

    return () => {
      closed = true
      source?.close()
      source = null
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
