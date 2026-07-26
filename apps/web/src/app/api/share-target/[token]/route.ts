export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const SHARE_TARGET_DIR = join(tmpdir(), "budget-by-digitalport-share-target")
const SHARE_TARGET_TTL_MS = 30 * 60 * 1000

function isValidToken(token: string): boolean {
  return /^[a-f0-9-]{36}$/i.test(token)
}

function encodedHeaderValue(value: string | null | undefined): string {
  return encodeURIComponent(value || "")
}

async function readMetadata(token: string) {
  const dir = join(SHARE_TARGET_DIR, token)
  const metadataPath = join(dir, "metadata.json")
  const info = await stat(metadataPath)
  if (Date.now() - info.mtimeMs > SHARE_TARGET_TTL_MS) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    return null
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    fileName?: string | null
    mimeType?: string | null
    sizeBytes?: number
    title?: string
    text?: string
    url?: string
    createdAt?: string
  }
  return { dir, metadata }
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!isValidToken(token)) {
    return Response.json({ detail: "Invalid share token." }, { status: 400 })
  }

  const record = await readMetadata(token).catch(() => null)
  if (!record) {
    return Response.json({ detail: "Shared file expired." }, { status: 410 })
  }

  const { dir, metadata } = record
  if (!metadata.fileName) {
    return Response.json({
      title: metadata.title || "",
      text: metadata.text || "",
      url: metadata.url || "",
      createdAt: metadata.createdAt || null,
    })
  }

  const file = await readFile(join(dir, "file"))
  return new Response(file, {
    headers: {
      "content-type": metadata.mimeType || "application/octet-stream",
      "cache-control": "no-store",
      "x-shared-file-name": encodedHeaderValue(metadata.fileName),
      "x-shared-title": encodedHeaderValue(metadata.title),
      "x-shared-text": encodedHeaderValue(metadata.text),
      "x-shared-url": encodedHeaderValue(metadata.url),
    },
  })
}

export async function DELETE(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!isValidToken(token)) {
    return Response.json({ ok: false }, { status: 400 })
  }
  await rm(join(SHARE_TARGET_DIR, token), { recursive: true, force: true }).catch(() => undefined)
  return Response.json({ ok: true })
}
