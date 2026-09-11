import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { LANDING_COOKIE, landingPathForId } from "@/lib/landing-page"
import { SESSION_COOKIE } from "@/lib/auth-session"

// Session ids are generated as UUIDs — anything else is refused (path safety).
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

// Top-level routes that are NOT the [sessionId] app shell.
const NON_APP_ROUTES = new Set([
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "verify-email",
  "share-target",
  "share-target-file",
  "offline",
])

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase()
  const url = request.nextUrl

  if (host === "app.digitalport.my") {
    return NextResponse.redirect(`https://app.myperibadi.com${url.pathname}${url.search}`, 301)
  }

  // "Halaman Utama": on a hard load of /{sessionId} (app open, bookmark, wrapper)
  // send the browser straight to the chosen screen — dashboard never renders.
  // In-app navigations are left alone so tapping Home works. Next 16 strips the
  // RSC/prefetch headers from middleware, so sniff the fetch metadata instead:
  // document loads are Sec-Fetch-Dest: document, RSC fetches ask for
  // text/x-component / Sec-Fetch-Dest: empty.
  const fetchDest = request.headers.get("sec-fetch-dest")
  const isDocumentLoad =
    (fetchDest === null || fetchDest === "document") &&
    !(request.headers.get("accept") || "").includes("text/x-component")
  const segments = url.pathname.split("/").filter(Boolean)
  const landingPath = landingPathForId(request.cookies.get(LANDING_COOKIE)?.value)
  if (isDocumentLoad && (request.method === "GET" || request.method === "HEAD") && landingPath) {
    // App open at "/" (PWA icon, bookmark): go straight to the chosen screen.
    if (segments.length === 0) {
      const sessionId = request.cookies.get(SESSION_COOKIE)?.value || ""
      if (SESSION_ID_PATTERN.test(sessionId)) {
        url.pathname = `/${sessionId}${landingPath}`
        return NextResponse.redirect(url)
      }
    }
    // Hard load of /{sessionId} (wrapper, deep link): same, before the dashboard renders.
    if (segments.length === 1 && !NON_APP_ROUTES.has(segments[0])) {
      url.pathname = `/${segments[0]}${landingPath}`
      return NextResponse.redirect(url)
    }
  }

  const response = NextResponse.next()
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  return response
}

export const config = {
  matcher: "/((?!api|_next|favicon\\.ico|icon-|manifest|sw\\.js|build-version\\.json|offline).*)",
}
