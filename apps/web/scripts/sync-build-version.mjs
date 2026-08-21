import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const packageJsonPath = resolve(projectRoot, "package.json")
const outputTsPath = resolve(projectRoot, "src/generated/build-version.ts")
const outputJsonPath = resolve(projectRoot, "public/build-version.json")

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
const packageVersion = String(packageJson.version ?? "0.0.0")
const now = new Date()
const buildStamp = [
  now.getUTCFullYear(),
  String(now.getUTCMonth() + 1).padStart(2, "0"),
  String(now.getUTCDate()).padStart(2, "0"),
  String(now.getUTCHours()).padStart(2, "0"),
  String(now.getUTCMinutes()).padStart(2, "0"),
  String(now.getUTCSeconds()).padStart(2, "0"),
].join("")

const buildVersion = `${packageVersion}+${buildStamp}`
const tsFileContents = `export const BUILD_VERSION = "${buildVersion}" as const\n`
const jsonFileContents = `${JSON.stringify({ version: buildVersion }, null, 2)}\n`

mkdirSync(dirname(outputTsPath), { recursive: true })
mkdirSync(dirname(outputJsonPath), { recursive: true })
writeFileSync(outputTsPath, tsFileContents, "utf8")
writeFileSync(outputJsonPath, jsonFileContents, "utf8")

// Ensure pdf.worker.min.mjs is available in public/ for self-hosted CSP compliance
try {
  const { copyFileSync, existsSync } = await import("node:fs")
  const workerSrcPath = resolve(projectRoot, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs")
  const workerDestPath = resolve(projectRoot, "public/pdf.worker.min.mjs")
  if (existsSync(workerSrcPath)) {
    copyFileSync(workerSrcPath, workerDestPath)
  }
} catch (e) {
  // best effort
}
