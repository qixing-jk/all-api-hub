import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "wxt"

import {
  getE2eRequiredChromiumPermissions,
  getE2eTestOutDirTemplate,
  readE2eBuildVariant,
} from "./e2e/utils/e2eBuildVariants"
import { reactDevToolsAuto } from "./plugins/react-devtools-auto"

type BrowserTarget = "chrome" | "firefox" | "safari" | string
type ManifestPermission = string

const MANIFEST_DESCRIPTION_MAX_LEN = 132
const MANIFEST_BROWSER_TARGETS = {
  Firefox: "firefox",
  Safari: "safari",
} as const
const PRODUCTION_OUT_DIR_TEMPLATE =
  "{{browser}}-mv{{manifestVersion}}{{modeSuffix}}"
const CORE_EXTENSION_PERMISSIONS = [
  "tabs",
  "storage",
  "alarms",
  "contextMenus",
] as const
const CHROMIUM_ONLY_REQUIRED_PERMISSIONS = ["sidePanel"] as const
const FIREFOX_COOKIE_OPTIONAL_PERMISSIONS = [
  "cookies",
  "webRequest",
  "webRequestBlocking",
] as const
const CHROMIUM_COOKIE_DNR_OPTIONAL_PERMISSIONS = [
  "cookies",
  "declarativeNetRequestWithHostAccess",
] as const
const COMMON_OPTIONAL_PERMISSIONS = ["clipboardRead", "notifications"] as const
const BOOKMARK_IMPORT_OPTIONAL_PERMISSIONS = ["bookmarks"] as const

const requestedMode = readWxtCliMode()
const isTestBuild = requestedMode === "test"
const e2eBuildVariant = readE2eBuildVariant()

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  publicDir: "src/public",
  outDirTemplate: getOutDirTemplate(),
  modules: ["@wxt-dev/auto-icons", "@wxt-dev/module-react"],
  manifest: (env) => {
    const projectPath = getProjectRootPath()
    const description =
      env.command === "serve"
        ? buildDevManifestDescription(projectPath)
        : "__MSG_manifest_description__"
    const requiredPermissions = getManifestRequiredPermissions(env.browser)
    const optionalPermissions = getManifestOptionalPermissions(env.browser)

    return {
      name: "__MSG_manifest_name__",
      description,
      default_locale: "en",
      permissions: requiredPermissions,
      optional_permissions: optionalPermissions,
      // ensure can get site cookies, please refer to https://stackoverflow.com/a/70070106/22460724
      host_permissions: ["<all_urls>"],
      browser_specific_settings: {
        gecko: {
          id: "{bc73541a-133d-4b50-b261-36ea20df0d24}",
          // Firefox 104 covers the current Vite baseline and p-queue 9 runtime APIs.
          strict_min_version: "104.0",
        },
        gecko_android: {
          strict_min_version: "120.0",
        },
      },
      commands: {
        _execute_sidebar_action: {
          description: "__MSG_manifest_commands_sidebar_action__",
        },
        _execute_browser_action: {
          description: "__MSG_manifest_commands_browser_action__",
        },
      },
    }
  },
  vite: (env) => {
    console.log("当前构建模式:", env.mode)
    return {
      plugins: [reactDevToolsAuto()],
      content_security_policy: {
        extension_pages: {
          "script-src": ["'self'", "http://localhost:8097"],
        },
      },
      build: {
        sourcemap: getBuildSourcemap(env.mode),
        minify: env.mode !== "development",
      },
    }
  },
})

function getOutDirTemplate() {
  if (!isTestBuild) return PRODUCTION_OUT_DIR_TEMPLATE

  return getE2eTestOutDirTemplate(e2eBuildVariant)
}

function getManifestRequiredPermissions(browser: BrowserTarget) {
  const permissions: ManifestPermission[] = [...CORE_EXTENSION_PERMISSIONS]

  if (isChromiumManifestTarget(browser)) {
    permissions.push(...CHROMIUM_ONLY_REQUIRED_PERMISSIONS)
    permissions.push(...getE2eRequiredChromiumPermissions(e2eBuildVariant))
  }

  return permissions
}

function getManifestOptionalPermissions(browser: BrowserTarget) {
  const browserOptionalPermissions = isFirefoxManifestTarget(browser)
    ? FIREFOX_COOKIE_OPTIONAL_PERMISSIONS
    : getChromiumOptionalPermissions()
  const requiredPermissions = getManifestRequiredPermissions(browser)

  return [
    ...browserOptionalPermissions,
    ...COMMON_OPTIONAL_PERMISSIONS,
    ...BOOKMARK_IMPORT_OPTIONAL_PERMISSIONS,
  ].filter((permission) => !requiredPermissions.includes(permission))
}

function getChromiumOptionalPermissions() {
  const requiredPermissions = getE2eRequiredChromiumPermissions(e2eBuildVariant)

  return CHROMIUM_COOKIE_DNR_OPTIONAL_PERMISSIONS.filter(
    (permission) => !requiredPermissions.includes(permission),
  )
}

function isFirefoxManifestTarget(browser: BrowserTarget) {
  return browser === MANIFEST_BROWSER_TARGETS.Firefox
}

function isChromiumManifestTarget(browser: BrowserTarget) {
  return (
    browser !== MANIFEST_BROWSER_TARGETS.Firefox &&
    browser !== MANIFEST_BROWSER_TARGETS.Safari
  )
}

/**
 * Get the absolute path to the project root directory.
 */
function getProjectRootPath() {
  return path.resolve(fileURLToPath(new URL(".", import.meta.url)))
}

/**
 * Shorten a file path for display in the manifest description, keeping the drive letter and the end of the path if it exceeds the maximum length.
 * @param value The original file path to shorten.
 * @param maxLen The maximum allowed length for the shortened path, including the drive letter and ellipsis.
 */
function shortenPathForManifestDescription(value: string, maxLen: number) {
  if (maxLen <= 0) return ""
  if (value.length <= maxLen) return value

  const ellipsis = "…"
  const drivePrefix = value.match(/^[A-Za-z]:\\/u)?.[0] ?? ""
  const availableTailLen = maxLen - drivePrefix.length - ellipsis.length
  if (availableTailLen <= 0) return value.slice(0, maxLen)

  return `${drivePrefix}${ellipsis}${value.slice(-availableTailLen)}`
}

/**
 * Generate a manifest description for development builds that includes the project path.
 * @param projectPath The absolute path to the project root.
 */
function buildDevManifestDescription(projectPath: string) {
  const prefix = "DEV "
  const maxPathLen = MANIFEST_DESCRIPTION_MAX_LEN - prefix.length
  const shortPath = shortenPathForManifestDescription(projectPath, maxPathLen)
  return `${prefix}${shortPath}`
}

function getBuildSourcemap(mode: string) {
  if (mode === "development") return "inline"

  return isBuildSourcemapEnabled() ? true : false
}

function isBuildSourcemapEnabled() {
  const value = process.env.AAH_BUILD_SOURCEMAP?.trim().toLowerCase()
  return value === "1" || value === "true"
}

/**
 * Parse the explicit WXT CLI mode from process arguments when present.
 */
function readWxtCliMode() {
  const modeFlagIndex = process.argv.findIndex(
    (arg) => arg === "--mode" || arg === "-m",
  )
  if (modeFlagIndex < 0) return undefined

  const modeValue = process.argv[modeFlagIndex + 1]
  return modeValue?.trim() || undefined
}
