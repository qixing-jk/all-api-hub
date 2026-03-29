import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "wxt"

import { reactDevToolsAuto } from "./plugins/react-devtools-auto"

const requestedMode = readWxtCliMode()
const isTestBuild = requestedMode === "test"

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  publicDir: "src/public",
  outDirTemplate: isTestBuild
    ? "{{browser}}-mv{{manifestVersion}}-test"
    : "{{browser}}-mv{{manifestVersion}}{{modeSuffix}}",
  modules: ["@wxt-dev/auto-icons", "@wxt-dev/module-react"],
  dev: {
    server: {
      host: "127.0.0.1",
    },
  },
  manifest: (env) => {
    const projectPath = getProjectRootPath()
    const description =
      env.command === "serve"
        ? buildDevManifestDescription(projectPath)
        : "__MSG_manifest_description__"

    return {
      name: "__MSG_manifest_name__",
      description,
      default_locale: "en",
      permissions: [
        "tabs",
        "storage",
        "alarms",
        "contextMenus",
        ...(env.browser === "firefox" || env.browser === "safari"
          ? []
          : ["sidePanel"]),
      ],
      ...(env.browser === "firefox"
        ? {
            optional_permissions: [
              "cookies",
              "webRequest",
              "webRequestBlocking",
              "clipboardRead",
            ],
          }
        : {
            optional_permissions: [
              "cookies",
              "declarativeNetRequestWithHostAccess",
              "clipboardRead",
            ],
          }),
      // ensure can get site cookies, please refer to https://stackoverflow.com/a/70070106/22460724
      host_permissions: ["<all_urls>"],
      browser_specific_settings: {
        gecko: {
          id: "{bc73541a-133d-4b50-b261-36ea20df0d24}",
          strict_min_version: "58.0",
        },
        gecko_android: {
          strict_min_version: "120.0",
        },
      },
      commands: {
        _execute_sidebar_action: {
          description: "__MSG_manifest_commands_sidebar_action__",
        },
        _execute_action: {
          description: "__MSG_manifest_commands_action__",
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
        sourcemap: env.mode === "development" ? "inline" : false,
        minify: env.mode !== "development",
      },
      server: {
        host: "127.0.0.1",
      },
    }
  },
})

const MANIFEST_DESCRIPTION_MAX_LEN = 132

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
