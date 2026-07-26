export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_BASE_URL = process.env.API_BASE_URL || process.env.WEB_API_INTERNAL_ORIGIN || "http://127.0.0.1:8023"

export async function POST(request: Request) {
  let formData: FormData

  try {
    formData = await request.formData()
  } catch {
    return Response.json({ detail: "Invalid form data." }, { status: 400 })
  }

  const headers = new Headers()
  const authorization = request.headers.get("authorization")
  if (authorization) {
    headers.set("authorization", authorization)
  }

  try {
    const upstream = await fetch(`${API_BASE_URL}/chat/message`, {
      method: "POST",
      headers,
      body: formData,
    })

    const contentType = upstream.headers.get("content-type") || "application/json"
    const body = await upstream.arrayBuffer()

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "content-type": contentType,
      },
    })
  } catch (error) {
    console.error("Chat upload forward failed", error)
    return Response.json({ detail: "Unable to reach chat service." }, { status: 502 })
  }
}
