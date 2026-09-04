import { cookies, headers } from "next/headers"
import type { MetadataRoute } from "next"
import { THEME_COOKIE_KEY, THEME_RESOLVED_COOKIE_KEY, getPwaThemeColor, isResolvedTheme } from "@/lib/theme"

function isResolved(value: string | null | undefined): value is "light" | "dark" {
  return value === "light" || value === "dark"
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = "MyPeribadi"
  const shortName = name
  const desc = "Manage your personal budget, receipts, and daily expenses with ease."

  const cookieStore = await cookies()
  const themeCookie = cookieStore.get(THEME_COOKIE_KEY)?.value
  const resolvedCookie = cookieStore.get(THEME_RESOLVED_COOKIE_KEY)?.value
  const headerStore = await headers()
  // Chrome sends this OS color-scheme client hint when opted in via Accept-CH.
  const osPrefers = headerStore.get("sec-ch-prefers-color-scheme")
  const effectiveTheme =
    themeCookie === "light" || themeCookie === "dark"
      ? themeCookie
      : isResolved(osPrefers)
        ? osPrefers
        : isResolvedTheme(resolvedCookie) ? resolvedCookie : "light"
  const pwaThemeColor = getPwaThemeColor(effectiveTheme)

  const appManifest = {
    name,
    short_name: shortName,
    description: desc,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: pwaThemeColor,
    theme_color: pwaThemeColor,
    categories: ["finance", "productivity", "business"],
    lang: "en",
    gcm_sender_id: "103953800507",
    icons: [
      {
        src: "/icon-192-v3.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Open Chat",
        short_name: "Chat",
        url: "/",
        icons: [{ src: "/icon-192-v3.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    share_target: {
      action: "/api/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "file",
            accept: ["image/*", ".jpg", ".jpeg", ".png", ".webp"],
          },
        ],
      },
    },
  }

  return appManifest as MetadataRoute.Manifest
}
