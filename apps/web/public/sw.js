try {
  importScripts("/firebase-app-compat.js")
  importScripts("/firebase-messaging-compat.js")

  firebase.initializeApp({
    apiKey: "AIzaSyDl7ZC5T3hdRaGlaP6qMYOQyx3u8xUbvEs",
    authDomain: "digitalport-d23f0.firebaseapp.com",
    projectId: "digitalport-d23f0",
    storageBucket: "digitalport-d23f0.firebasestorage.app",
    messagingSenderId: "968953639969",
    appId: "1:968953639969:web:fde4422f15ecda53375f60",
  })

  const fcmMessaging = firebase.messaging()

  fcmMessaging.onBackgroundMessage((payload) => {
    const data = payload.data || {}
    const notification = payload.notification || {}
    const title = notification.title || data.title || "Pesanan Baru"
    const body = notification.body || data.body || ""
    const link = data.link || "/"

    self.registration.showNotification(title, {
      body,
      icon: "/icon-192-v3.png",
      badge: "/icon-192-v3.png",
      tag: data.tag || data.type || "new-order",
      data: { link },
      vibrate: [200, 100, 200],
      requireInteraction: true,
      renotify: true,
    })
  })
} catch (e) {
  console.error("[sw.js] Firebase init failed:", e)
}

const CACHE_NAME = "budget-by-digitalport-shell-v30"
const APP_SHELL = ["/offline", "/manifest.webmanifest", "/icon-192-v3.png", "/icon-512-v3.png", "/assets/lock/keypadbanner-v5.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
      .then(async () => {
        const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
        await Promise.all(windowClients.map((client) => {
          if ("navigate" in client && client.url) {
            return client.navigate(client.url).catch(() => undefined)
          }
          return undefined
        }))
      })
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.pathname.startsWith("/api/") || url.pathname === "/build-version.json") return

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(request, { cache: "reload" }))
        if (response && response.status !== 503) return response
      } catch {}
      const cachedOffline = await caches.match("/offline")
      return cachedOffline || new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    })())
    return
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/_next/")) return
  if (!APP_SHELL.includes(url.pathname)) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        return cached || Response.error()
      })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const link = event.notification?.data?.link || "/"
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const client of allClients) {
      if ("focus" in client) {
        client.focus()
        if ("navigate" in client) {
          try { return await client.navigate(link) } catch {}
        }
        return
      }
    }
    if (clients.openWindow) return clients.openWindow(link)
  })())
})
