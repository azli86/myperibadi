import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import AppShellBoundary from "@/components/layout/AppShellBoundary";
import ZoomLock from "@/components/layout/ZoomLock";
import { LangProvider } from "@/lib/lang";
import PWARegister from "@/components/pwa/PWARegister";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import AuthSessionSync from "@/components/auth/AuthSessionSync";
import {
  THEME_COOKIE_KEY,
  THEME_RESOLVED_COOKIE_KEY,
  type ResolvedTheme,
  type ThemeMode,
  getPwaThemeColor,
  isResolvedTheme,
  isThemeMode,
} from "@/lib/theme";


function resolveThemeMode(theme: ThemeMode, cookieResolvedTheme?: string): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme
  return isResolvedTheme(cookieResolvedTheme) ? cookieResolvedTheme : "dark"
}

export async function generateMetadata(): Promise<Metadata> {
  const heads = await headers()
  const host = heads.get("host") || ""
  const isRemovedBusiness = host.includes("removed_business")

  return {
      title: isRemovedBusiness ? "DigitalPort RemovedBusiness" : "MyPeribadi",
    description: isRemovedBusiness
      ? "Manage your business expenses, receipts, and financial reports with DigitalPort."
      : "Manage your personal budget, receipts, and daily expenses with ease.",
    applicationName: isRemovedBusiness ? "DigitalPort RemovedBusiness" : "MyPeribadi",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icon-512-v3.png",
      shortcut: "/icon-192-v3.png",
      apple: "/apple-icon.png",
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
        "max-snippet": -1,
        "max-image-preview": "none",
        "max-video-preview": -1,
      },
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: isRemovedBusiness ? "default" : "black-translucent",
    title: isRemovedBusiness ? "DigitalPort RemovedBusiness" : "MyPeribadi",
    },
    other: {
      "navigation-bar-color": isRemovedBusiness ? "#151515" : "#0d0d0d",
      "msapplication-navbutton-color": isRemovedBusiness ? "#151515" : "#0d0d0d",
    },
    formatDetection: {
      telephone: false,
    },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const heads = await headers()
  const isRemovedBusiness = (heads.get("host") || "").includes("removed_business")

  return {
    width: "device-width",
    initialScale: 1,
    minimumScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: getPwaThemeColor("light", isRemovedBusiness) },
      { media: "(prefers-color-scheme: dark)", color: getPwaThemeColor("dark", isRemovedBusiness) },
    ],
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies()
  const cookieTheme = cookieStore.get(THEME_COOKIE_KEY)?.value
  const cookieLang = cookieStore.get("lang")?.value
  const initialLang = cookieLang === "EN" || cookieLang === "BM" ? cookieLang : "BM"
  const initialThemeSetting: ThemeMode = isThemeMode(cookieTheme) ? cookieTheme : "system"
  const initialResolvedTheme = resolveThemeMode(
    initialThemeSetting,
    cookieStore.get(THEME_RESOLVED_COOKIE_KEY)?.value,
  )

  return (
    <html
      lang={initialLang === "BM" ? "ms" : "en"}
      data-lang={initialLang}
      data-theme={initialResolvedTheme}
      data-theme-setting={initialThemeSetting}
      style={{ colorScheme: initialResolvedTheme }}
      suppressHydrationWarning className="font-sans"
    >
      <body className="font-sans antialiased">
        <ThemeProvider initialTheme={initialThemeSetting} initialResolvedTheme={initialResolvedTheme}>
          <LangProvider initialLang={initialLang}>
            <ZoomLock />
            <PWARegister />
            <AuthSessionSync />
            <AppShellBoundary>
              {children}
            </AppShellBoundary>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
