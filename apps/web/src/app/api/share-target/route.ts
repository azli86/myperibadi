export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { randomUUID } from "node:crypto"
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const SHARE_TARGET_DIR = join(tmpdir(), "budget-by-digitalport-share-target")
const SHARE_TARGET_TTL_MS = 30 * 60 * 1000
const MAX_SHARED_FILE_BYTES = 15 * 1024 * 1024

type ShareTargetMetadata = {
  token: string
  createdAt: string
  title: string
  text: string
  url: string
  fileName: string | null
  mimeType: string | null
  sizeBytes: number
}

function redirectShareTarget(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } })
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name || "")
}

async function cleanupOldShares() {
  await mkdir(SHARE_TARGET_DIR, { recursive: true })
  const entries = await readdir(SHARE_TARGET_DIR, { withFileTypes: true }).catch(() => [])
  const now = Date.now()

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return
    const dir = join(SHARE_TARGET_DIR, entry.name)
    try {
      const info = await stat(dir)
      if (now - info.mtimeMs > SHARE_TARGET_TTL_MS) {
        await rm(dir, { recursive: true, force: true })
      }
    } catch {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }))
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return redirectShareTarget("/share-target?error=invalid")
  }

  await cleanupOldShares().catch(() => undefined)

  const file = formData.get("file")
  const title = String(formData.get("title") || "")
  const text = String(formData.get("text") || "")
  const url = String(formData.get("url") || "")
  const token = randomUUID()
  const dir = join(SHARE_TARGET_DIR, token)
  await mkdir(dir, { recursive: true })

  const metadata: ShareTargetMetadata = {
    token,
    createdAt: new Date().toISOString(),
    title,
    text,
    url,
    fileName: null,
    mimeType: null,
    sizeBytes: 0,
  }

  if (file instanceof File && file.size > 0) {
    if (!isImageFile(file)) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      return redirectShareTarget("/share-target?error=unsupported")
    }

    if (file.size > MAX_SHARED_FILE_BYTES) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      return redirectShareTarget("/share-target?error=too_large")
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    metadata.fileName = file.name || "shared-screenshot.png"
    metadata.mimeType = file.type || "image/png"
    metadata.sizeBytes = file.size
    await writeFile(join(dir, "file"), buffer)
  }

  await writeFile(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8")
  return redirectShareTarget(`/share-target?token=${encodeURIComponent(token)}`)
}
