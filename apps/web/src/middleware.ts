import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { LANDING_COOKIE, landingPathForId } from "@/lib/landing-page"

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
  // Client-side navigations (RSC/prefetch) are left alone so tapping Home works.
  const isClientNav =
    request.headers.get("rsc") === "1" || Boolean(request.headers.get("next-router-prefetch"))
  const segments = url.pathname.split("/").filter(Boolean)
  if (
    !isClientNav &&
    (request.method === "GET" || request.method === "HEAD") &&
    segments.length === 1 &&
    !NON_APP_ROUTES.has(segments[0])
  ) {
    const landingPath = landingPathForId(request.cookies.get(LANDING_COOKIE)?.value)
    if (landingPath) {
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
