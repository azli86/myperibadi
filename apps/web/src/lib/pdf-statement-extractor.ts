/**
 * Client-Side PDF Statement Extractor
 * Extracts text from bank statements with password-protection unlocking support
 */

export type PdfExtractResult = {
  text?: string
  numPages?: number
  isPasswordProtected?: boolean
  needsPassword?: boolean
  invalidPassword?: boolean
  error?: string
}

export async function extractTextFromPdf(
  data: ArrayBuffer,
  password?: string
): Promise<PdfExtractResult> {
  try {
    const pdfjsLib = await import("pdfjs-dist")

    // Configure worker to use self-hosted public file to satisfy Content Security Policy
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
    }

    const loadingTask = pdfjsLib.getDocument({
      // PDF.js transfers this buffer to its worker, detaching it. Clone first so
      // password retries can safely reuse the original ArrayBuffer.
      data: new Uint8Array(data.slice(0)),
      password: password || undefined,
    })

    const pdf = await loadingTask.promise
    const numPages = pdf.numPages
    const pagesText: string[] = []

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()

      // Group text items by vertical position (Y) to reconstruct rows
      const items = textContent.items as Array<{ str: string; transform: number[] }>
      
      // Sort items: top-to-bottom, left-to-right
      const linesMap = new Map<number, Array<{ x: number; str: string }>>()

      items.forEach((item) => {
        if (!item.str || !item.str.trim()) return
        const y = Math.round(item.transform[5] / 2) * 2 // bucket lines within 2px
        const x = item.transform[4]

        if (!linesMap.has(y)) {
          linesMap.set(y, [])
        }
        linesMap.get(y)!.push({ x, str: item.str })
      })

      // Sort Y descending (PDF coordinates 0 is at bottom)
      const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a)

      const pageLines: string[] = []
      sortedYs.forEach((y) => {
        const lineItems = linesMap.get(y)!
        lineItems.sort((a, b) => a.x - b.x)
        const lineStr = lineItems.map((it) => it.str).join("  ").replace(/\s+/g, " ")
        pageLines.push(lineStr)
      })

      pagesText.push(pageLines.join("\n"))
    }

    return {
      text: pagesText.join("\n\n"),
      numPages,
      isPasswordProtected: false,
    }
  } catch (err: any) {
    if (err?.name === "PasswordException" || err?.message?.includes("password")) {
      const code = err?.code
      return {
        isPasswordProtected: true,
        needsPassword: true,
        invalidPassword: code === 2 || err?.message?.includes("Incorrect"),
        error: code === 2 ? "Kata laluan salah." : "Fail PDF dilindungi kata laluan.",
      }
    }

    return {
      error: err?.message || "Ralat semasa membaca fail PDF.",
    }
  }
}
