import fs from "node:fs"
import { fileURLToPath } from "node:url"

export const E2E_BUILD_VARIANTS = {
  Default: "default",
  DnrRequired: "dnr-required",
  BookmarksRequired: "bookmarks-required",
}

const E2E_BUILD_VARIANT_VALUES = Object.values(E2E_BUILD_VARIANTS)
const e2eBuildVariantsConfig = readE2eBuildVariantsConfig()

export const E2E_BUILD_VARIANT_ENV = e2eBuildVariantsConfig.envName

export function readE2eBuildVariant(env = process.env) {
  const value = env[E2E_BUILD_VARIANT_ENV]?.trim()
  if (!value) return e2eBuildVariantsConfig.defaultVariant
  if (isE2eBuildVariant(value)) return value

  throw new Error(`Unsupported ${E2E_BUILD_VARIANT_ENV} '${value}'`)
}

export function getE2eExtensionDirName(variant = readE2eBuildVariant()) {
  return e2eBuildVariantsConfig.variants[variant].extensionDirName
}

export function getE2eTestOutDirTemplate(variant = readE2eBuildVariant()) {
  return e2eBuildVariantsConfig.variants[variant].testOutDirTemplate
}

export function getE2eRequiredChromiumPermissions(
  variant = readE2eBuildVariant(),
) {
  return [
    ...e2eBuildVariantsConfig.variants[variant].requiredChromiumPermissions,
  ]
}

function isE2eBuildVariant(value) {
  return E2E_BUILD_VARIANT_VALUES.includes(value)
}

function readE2eBuildVariantsConfig() {
  const configPath = fileURLToPath(
    new URL("../e2e-build-variants.json", import.meta.url),
  )
  return JSON.parse(fs.readFileSync(configPath, "utf8"))
}
