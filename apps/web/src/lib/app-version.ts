import { BUILD_VERSION } from "@/generated/build-version"

const [packageVersion = "0.0.0"] = BUILD_VERSION.split("+")
const [versionYear = "0", versionMonth = "0", versionPatch = "0"] = packageVersion.split(".")

export const APP_VERSION_LABEL = `v${versionYear}.${versionMonth.padStart(2, "0")}.${versionPatch.padStart(2, "0")}` as const
export const APP_BUILD_VERSION = BUILD_VERSION
