import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase()
  const url = request.nextUrl

  if (host === "app.digitalport.my") {
    return NextResponse.redirect(`https://app.myperibadi.com${url.pathname}${url.search}`, 301)
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
