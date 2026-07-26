import { createServer, request as httpRequest } from "node:http"
import { createConnection } from "node:net"
import { existsSync, readFileSync, watchFile } from "node:fs"
import { resolve } from "node:path"

const gatewayPort = Number(process.env.WEB_GATEWAY_PORT ?? 8022)
const routeFile = resolve(process.env.WEB_ROUTE_FILE ?? ".runtime/active.env")

let activeTarget = null

function parseStateFile(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf("=")
      const key = line.slice(0, separatorIndex)
      let value = line.slice(separatorIndex + 1)
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1)
      }

      acc[key] = value
      return acc
    }, {})
}

function loadTarget() {
  if (!existsSync(routeFile)) {
    activeTarget = null
    return
  }

  try {
    const state = parseStateFile(readFileSync(routeFile, "utf8"))
    const port = Number(state.ACTIVE_PORT)
    if (!Number.isFinite(port) || port <= 0) {
      activeTarget = null
      return
    }

    activeTarget = {
      slot: state.ACTIVE_SLOT ?? null,
      port,
      buildVersion: state.BUILD_VERSION ?? null,
      updatedAt: state.UPDATED_AT ?? null,
    }
  } catch (error) {
    console.error("[web-gateway] failed to load target", error)
    activeTarget = null
  }
}

function getForwardedForHeader(req) {
  const forwardedFor = req.headers["x-forwarded-for"]
  const remoteAddress = req.socket.remoteAddress ?? ""
  if (Array.isArray(forwardedFor)) {
    return [...forwardedFor, remoteAddress].filter(Boolean).join(", ")
  }

  return [forwardedFor, remoteAddress].filter(Boolean).join(", ")
}

function respondGatewayHealth(res) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" })
  res.end(
    JSON.stringify({
      service: "budgetdigital-web-gateway",
      activeTarget,
      routeFile,
    })
  )
}

function respondNoTarget(res) {
  res.writeHead(503, { "content-type": "application/json; charset=utf-8" })
  res.end(
    JSON.stringify({
      error: "No active web target is configured",
    })
  )
}

function proxyHttpRequest(req, res) {
  if (req.url === "/__gateway/health") {
    respondGatewayHealth(res)
    return
  }

  if (!activeTarget) {
    respondNoTarget(res)
    return
  }

  const upstreamRequest = httpRequest(
    {
      hostname: "127.0.0.1",
      port: activeTarget.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: req.headers.host ?? `127.0.0.1:${activeTarget.port}`,
        "x-forwarded-for": getForwardedForHeader(req),
        "x-forwarded-host": req.headers.host ?? "",
        "x-forwarded-port": String(gatewayPort),
        "x-forwarded-proto": "https",
      },
    },
    (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(res)
    }
  )

  upstreamRequest.on("error", (error) => {
    console.error("[web-gateway] upstream request failed", error)
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" })
    }
    res.end(
      JSON.stringify({
        error: "Upstream web server is unavailable",
      })
    )
  })

  req.pipe(upstreamRequest)
}

function proxyUpgradeRequest(req, socket, head) {
  if (!activeTarget) {
    socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n")
    return
  }

  const upstreamSocket = createConnection(activeTarget.port, "127.0.0.1")

  upstreamSocket.on("connect", () => {
    const headerLines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]

    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      headerLines.push(`${req.rawHeaders[index]}: ${req.rawHeaders[index + 1]}`)
    }

    headerLines.push(`x-forwarded-for: ${getForwardedForHeader(req)}`)
    headerLines.push(`x-forwarded-host: ${req.headers.host ?? ""}`)
    headerLines.push(`x-forwarded-port: ${gatewayPort}`)
    headerLines.push("x-forwarded-proto: https")

    upstreamSocket.write(`${headerLines.join("\r\n")}\r\n\r\n`)
    if (head.length > 0) {
      upstreamSocket.write(head)
    }

    socket.pipe(upstreamSocket).pipe(socket)
  })

  upstreamSocket.on("error", (error) => {
    console.error("[web-gateway] upgrade request failed", error)
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n")
  })
}

loadTarget()
watchFile(routeFile, { interval: 500 }, loadTarget)

const server = createServer(proxyHttpRequest)

server.on("upgrade", proxyUpgradeRequest)
server.listen(gatewayPort, () => {
  console.log(
    `[web-gateway] listening on :${gatewayPort} and routing via ${routeFile}`
  )
})
