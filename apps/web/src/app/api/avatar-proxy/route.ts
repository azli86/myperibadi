import { NextRequest, NextResponse } from "next/server"

// Avatar cache bridge: the R2 CDN (cdn-mixed.myperibadi.com) serves no
// Access-Control-Allow-Origin, so the browser cannot fetch() avatar bytes for
// localStorage caching. This same-origin proxy relays the image so the client
// cache works. Allow-listed to avatar paths only (not an open proxy).
const CDN_HOST = process.env.NEXT_PUBLIC_R2_CDN_DOMAIN || "cdn-mixed.myperibadi.com"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url")
  if (!rawUrl) return new NextResponse("missing url", { status: 400 })
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return new NextResponse("bad url", { status: 400 })
  }
  if (parsed.hostname !== CDN_HOST || !parsed.pathname.startsWith("/avatars/")) {
    return new NextResponse("forbidden", { status: 403 })
  }
  try {
    const res = await fetch(parsed.toString())
    if (!res.ok) return new NextResponse(`upstream ${res.status}`, { status: 502 })
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch {
    return new NextResponse("proxy error", { status: 502 })
  }
}
