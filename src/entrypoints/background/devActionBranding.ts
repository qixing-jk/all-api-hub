import { getActionApi, getManifest } from "~/utils/browser/browserApi"
import { getDevIdentity } from "~/utils/browser/extensionIdentity"
import { formatDevActionTitle } from "~/utils/core/devBranding"
import { isDevelopmentMode } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to development-only toolbar branding.
 */
const logger = createLogger("DevActionBranding")

/**
 * Runs one toolbar call in isolation: the badge APIs are best-effort and vary per
 * browser, so a rejected call must not skip the others. A rejected badge color,
 * for example, would otherwise also cost the tooltip.
 */
async function applyActionSetting(
  label: string,
  setting: () => Promise<void> | void,
) {
  try {
    await setting()
  } catch (error) {
    logger.debug(`Failed to apply toolbar ${label}`, error)
  }
}

/**
 * Adds a small dev-only visual indicator on the extension toolbar icon.
 *
 * The badge carries the instance color plus a code derived from the source
 * directory, and the tooltip carries the full path, so several local builds are
 * distinguishable from the toolbar alone.
 */
export async function applyDevActionBranding() {
  if (!isDevelopmentMode()) return

  try {
    const actionApi = getActionApi()
    const manifest = getManifest()
    const identity = getDevIdentity()
    const badgeColor = identity.color
    const versionName = (manifest as any).version_name as string | undefined
    const title = formatDevActionTitle(
      manifest.name,
      versionName,
      identity.path,
    )

    if (typeof actionApi.setBadgeText === "function") {
      await applyActionSetting("badge text", () =>
        actionApi.setBadgeText?.({ text: identity.badgeText }),
      )
    }

    if (badgeColor && typeof actionApi.setBadgeBackgroundColor === "function") {
      await applyActionSetting("badge color", () =>
        actionApi.setBadgeBackgroundColor?.({ color: badgeColor }),
      )
    }

    if (typeof actionApi.setTitle === "function") {
      await applyActionSetting("title", () => actionApi.setTitle?.({ title }))
    }
  } catch (error) {
    logger.debug("Failed to apply toolbar badge/title", error)
  }
}
