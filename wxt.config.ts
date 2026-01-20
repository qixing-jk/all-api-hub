import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "wxt"

import { reactDevToolsAuto } from "./plugins/react-devtools-auto"
import {
  formatDevManifestDescription,
  formatDevManifestName,
  formatDevVersionName,
} from "./utils/devBranding"

type GitBuildInfo = {
  branch: string
  sha: string
  dirty: boolean
}

/**
 * Reads git metadata for dev builds. This is intentionally best-effort:
 * - When `git` is missing or the folder isn't a repo, dev builds still run.
 * - Production builds never call this (avoids leaking local metadata).
 */
function getGitBuildInfo(): GitBuildInfo | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const dirty =
      execSync("git status --porcelain", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim().length > 0

    return { branch, sha, dirty }
  } catch {
    return null
  }
}

type LocaleManifestStrings = { name: string; description: string }

/**
 * Loads the default-locale manifest strings from `public/_locales` so dev branding
 * stays in sync with i18n without hardcoding Chinese/English strings in config.
 */
function getDefaultLocaleManifestStrings(
  defaultLocale: string,
): LocaleManifestStrings | null {
  try {
    const filePath = path.resolve(
      process.cwd(),
      "public",
      "_locales",
      defaultLocale,
      "messages.json",
    )
    const raw = fs.readFileSync(filePath, "utf8")
    const messages = JSON.parse(raw) as Record<string, { message?: string }>
    const name = messages.manifest_name?.message?.trim()
    const description = messages.manifest_description?.message?.trim()
    if (!name || !description) return null
    return { name, description }
  } catch {
    return null
  }
}

/**
 * WXT uses `manifest.version_name` as a fallback input to compute `manifest.version`.
 * When we set a non-semver `version_name` for dev branding, we must also set a valid
 * semver `version` explicitly.
 */
function getExtensionVersionFromPackageJson(): string {
  try {
    const raw = fs.readFileSync(
      path.resolve(process.cwd(), "package.json"),
      "utf8",
    )
    const pkg = JSON.parse(raw) as { version?: string }
    const versionName = String(pkg.version || "").trim()
    const simplified =
      /^((0|[1-9][0-9]{0,8})([.](0|[1-9][0-9]{0,8})){0,3}).*$/.exec(
        versionName,
      )?.[1]
    return simplified || "0.0.0"
  } catch {
    return "0.0.0"
  }
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/auto-icons", "@wxt-dev/module-react"],
  manifest: (env) => {
    const defaultLocale = "zh_CN"
    const isDev = env.command === "serve" || env.mode === "development"

    const devLocaleStrings = isDev
      ? getDefaultLocaleManifestStrings(defaultLocale)
      : null
    const gitBuildInfo = isDev ? getGitBuildInfo() : null
    const versionName =
      isDev && gitBuildInfo ? formatDevVersionName(gitBuildInfo) : null

    const devNameBase = devLocaleStrings?.name ?? "All API Hub"
    const devDescriptionBase = devLocaleStrings?.description ?? ""
    const devVersion =
      isDev && versionName ? getExtensionVersionFromPackageJson() : null

    return {
      name:
        isDev && versionName
          ? formatDevManifestName(devNameBase, versionName)
          : "__MSG_manifest_name__",
      description:
        isDev && versionName
          ? formatDevManifestDescription(devDescriptionBase, versionName)
          : "__MSG_manifest_description__",
      default_locale: defaultLocale,
      ...(devVersion ? { version: devVersion } : {}),
      ...(isDev && versionName ? { version_name: versionName } : {}),
      permissions: [
        "tabs",
        "storage",
        "alarms",
        "contextMenus",
        ...(env.browser === "firefox" ? [] : ["sidePanel"]),
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
        sourcemap: env.mode === "development" ? "inline" : false,
        minify: env.mode !== "development",
      },
    }
  },
})
