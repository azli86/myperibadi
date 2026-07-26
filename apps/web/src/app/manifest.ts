import { cookies } from "next/headers"
import type { MetadataRoute } from "next"
import { THEME_COOKIE_KEY, getPwaThemeColor } from "@/lib/theme"

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = "MyPeribadi"
  const shortName = name
  const desc = "Manage your personal budget, receipts, and daily expenses with ease."

  const cookieStore = await cookies()
  const themeCookie = cookieStore.get(THEME_COOKIE_KEY)?.value
  const effectiveTheme = themeCookie === "light" ? "light" : "dark"
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
