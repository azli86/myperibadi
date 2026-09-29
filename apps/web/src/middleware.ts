import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { LANDING_COOKIE } from "@/lib/landing-page"

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase()
  const url = request.nextUrl

  if (host === "app.digitalport.my") {
    return NextResponse.redirect(`https://app.myperibadi.com${url.pathname}${url.search}`, 301)
  }

  // The manifest is often fetched without cookies, so the page tells it the
  // theme it applied through ?t=dark-… / ?t=light-…; pass that on as a header
  // manifest.ts can read (a metadata route does not see the query string).
  if (url.pathname === "/manifest.webmanifest") {
    const hint = (url.searchParams.get("t") || "").split("-")[0]
    const requestHeaders = new Headers(request.headers)
    requestHeaders.delete("x-theme-hint")
    if (hint === "dark" || hint === "light") requestHeaders.set("x-theme-hint", hint)
    const manifestResponse = NextResponse.next({ request: { headers: requestHeaders } })
    manifestResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    return manifestResponse
  }

  const response = NextResponse.next()
  // Clear the retired "Halaman Utama" cookie so devices that had it set stop
  // being redirected to a non-dashboard screen.
  if (request.cookies.has(LANDING_COOKIE)) {
    response.cookies.delete(LANDING_COOKIE)
  }
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  return response
}

export const config = {
  matcher: [
    "/((?!api|_next|favicon\\.ico|icon-|manifest|sw\\.js|build-version\\.json|offline).*)",
    "/manifest.webmanifest",
  ],
}
