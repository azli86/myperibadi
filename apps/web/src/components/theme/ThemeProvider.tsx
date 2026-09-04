"use client"

import React, { createContext, useContext, useEffect, useRef, useState } from "react"
import { getAccessToken } from "@/lib/auth-session"
import { fetchApiJson } from "@/lib/api-cache"
import {
  THEME_COOKIE_KEY,
  THEME_RESOLVED_COOKIE_KEY,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
  getPwaThemeColor,
  isResolvedTheme,
  isThemeMode,
} from "@/lib/theme"

interface ThemeContextType {
  theme: ThemeMode
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

interface ThemeProviderProps {
  children: React.ReactNode
  initialTheme?: ThemeMode
  initialResolvedTheme?: ResolvedTheme
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
})

const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function getCookie(name: string): string | null {
  if (!isBrowser()) return null
  const target = `${name}=`
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(target))
  if (!cookie) return null
  return decodeURIComponent(cookie.slice(target.length))
}

function setCookie(name: string, value: string) {
  if (!isBrowser()) return
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`
}

function getLocalStorageTheme(): ThemeMode | null {
  if (!isBrowser()) return null
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeMode(stored) ? stored : null
}

function getDocumentThemeSetting(): ThemeMode | null {
  if (!isBrowser()) return null
  const setting = document.documentElement.dataset.themeSetting
  return isThemeMode(setting) ? setting : null
}

function getCookieThemeSetting(): ThemeMode | null {
  const setting = getCookie(THEME_COOKIE_KEY)
  return isThemeMode(setting) ? setting : null
}

function getCookieResolvedTheme(): ResolvedTheme | null {
  const resolved = getCookie(THEME_RESOLVED_COOKIE_KEY)
  return isResolvedTheme(resolved) ? resolved : null
}

function getStoredTheme(fallback: ThemeMode = "system"): ThemeMode {
  return getLocalStorageTheme() || getDocumentThemeSetting() || getCookieThemeSetting() || fallback
}

function getSystemTheme(): ResolvedTheme {
  if (!isBrowser()) return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme()
  }
  return theme
}

function getInitialResolvedTheme(theme: ThemeMode, fallback: ResolvedTheme = "dark"): ResolvedTheme {
  if (!isBrowser()) return fallback
  const documentTheme = document.documentElement.dataset.theme
  if (isResolvedTheme(documentTheme)) return documentTheme
  return resolveTheme(theme)
}

export function storeThemePreference(theme: ThemeMode, resolvedTheme: ResolvedTheme = resolveTheme(theme)) {
  if (!isBrowser()) return
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  setCookie(THEME_COOKIE_KEY, theme)
  setCookie(THEME_RESOLVED_COOKIE_KEY, resolvedTheme)
}

function setMetaContent(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!meta) {
    meta = document.createElement("meta")
    meta.name = name
    document.head.appendChild(meta)
  }
  meta.content = content
}

function applyTheme(theme: ThemeMode, resolvedTheme: ResolvedTheme) {
  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.dataset.themeSetting = theme
  document.documentElement.style.colorScheme = resolvedTheme
  storeThemePreference(theme, resolvedTheme)

  const pwaThemeColor = getPwaThemeColor(resolvedTheme)
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = pwaThemeColor
  })
  setMetaContent("theme-color", pwaThemeColor)
  setMetaContent("navigation-bar-color", pwaThemeColor)
  setMetaContent("msapplication-navbutton-color", pwaThemeColor)
  setMetaContent("apple-mobile-web-app-status-bar-style", resolvedTheme === "dark" ? "black-translucent" : "default")

  const metaCS = document.querySelector('meta[name="color-scheme"]')
  if (metaCS) {
    metaCS.setAttribute("content", resolvedTheme)
  }

  const manifest = document.querySelector('link[rel="manifest"]')
  if (manifest) {
    manifest.setAttribute("href", `/manifest.webmanifest?t=${resolvedTheme}-${pwaThemeColor.replace("#", "")}`)
  }
}

async function saveThemeToServer(theme: ThemeMode) {
  const token = getAccessToken()
  if (!token) return

  try {
    await fetch("/api/users/me", {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme_mode: theme }),
    })
  } catch {
    // Local cookie/localStorage still prevents theme flash; DB sync can retry on next toggle/load.
  }
}

export function ThemeProvider({
  children,
  initialTheme = "system",
  initialResolvedTheme = "dark",
}: ThemeProviderProps) {
  const hadLocalThemeAtStart = useRef(getLocalStorageTheme() !== null)
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme(initialTheme))
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getInitialResolvedTheme(getStoredTheme(initialTheme), initialResolvedTheme),
  )
  const currentThemeRef = useRef(theme)

  useEffect(() => {
    currentThemeRef.current = theme
  }, [theme])

  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      setResolvedTheme(mediaQuery.matches ? "dark" : "light")
    }

    handleChange()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange)
      return () => mediaQuery.removeEventListener("change", handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [theme])

  useEffect(() => {
    applyTheme(theme, resolvedTheme)
  }, [theme, resolvedTheme])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    let cancelled = false

    async function syncServerTheme() {
      try {
        const data = await fetchApiJson<{ theme_mode?: unknown }>("/api/users/me", token)
        const serverTheme = data?.theme_mode
        if (!isThemeMode(serverTheme) || cancelled) return

        if (hadLocalThemeAtStart.current) {
          const localTheme = getLocalStorageTheme()
          if (localTheme && localTheme !== serverTheme) {
            await saveThemeToServer(localTheme)
          }
          return
        }

        if (serverTheme !== currentThemeRef.current) {
          const nextResolved = serverTheme === "system" ? getSystemTheme() : serverTheme
          setThemeState(serverTheme)
          setResolvedTheme(nextResolved)
          storeThemePreference(serverTheme, nextResolved)
        }
      } catch {
        // Best effort only. Stored cookie/localStorage keeps the UI stable.
      }
    }

    void syncServerTheme()
    return () => {
      cancelled = true
    }
  }, [])

  function setTheme(nextTheme: ThemeMode) {
    const nextResolved = nextTheme === "system" ? getSystemTheme() : nextTheme
    setThemeState(nextTheme)
    setResolvedTheme(nextResolved)
    storeThemePreference(nextTheme, nextResolved)
    void saveThemeToServer(nextTheme)
  }

  function toggleTheme() {
    const modes: ThemeMode[] = ["light", "dark", "system"]
    const currentIndex = modes.indexOf(theme)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % modes.length
    setTheme(modes[nextIndex])
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
