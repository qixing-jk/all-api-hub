import { getManifest } from "~/utils/browserApi"
import { formatDevActionTitle, getDevBadgeText } from "~/utils/devBranding"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to development-only toolbar branding.
 */
const logger = createLogger("DevActionBranding")

/**
 * Adds a small dev-only visual indicator on the extension toolbar icon.
 *
 * This is intentionally best-effort: in some browsers/environments the action API
 * may not exist (or may not support badges), and failures should not break the
 * background script.
 */
export async function applyDevActionBranding() {
  if (import.meta.env.MODE !== "development") return

  const actionApi = (browser as any).action ?? (browser as any).browserAction
  if (!actionApi) return

  try {
    const manifest = getManifest()
    const versionName = (manifest as any).version_name as string | undefined
    const title = formatDevActionTitle(manifest.name, versionName)

    if (typeof actionApi.setBadgeText === "function") {
      await actionApi.setBadgeText({ text: getDevBadgeText() })
    }

    if (typeof actionApi.setBadgeBackgroundColor === "function") {
      await actionApi.setBadgeBackgroundColor({ color: "#DC2626" })
    }

    if (typeof actionApi.setTitle === "function") {
      await actionApi.setTitle({ title })
    }
  } catch (error) {
    logger.debug("Failed to apply toolbar badge/title", error)
  }
}
