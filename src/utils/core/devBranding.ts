import { APP_SHORT_NAME } from "~/constants/branding"

/**
 * Dev-only badge text used to visually differentiate local builds.
 * Keep it <= 4 chars for good compatibility across browsers.
 */
export function getDevBadgeText() {
  return "DEV"
}

/**
 * Creates a dev-only tooltip title for the toolbar action.
 */
export function formatDevActionTitle(baseTitle: string, versionName?: string) {
  const safeBase = baseTitle?.trim() || APP_SHORT_NAME
  const safeVersion = versionName?.trim() || ""
  if (!safeVersion) return `${safeBase} (dev)`
  return safeBase.includes(safeVersion)
    ? safeBase
    : `${safeBase} (${safeVersion})`
}
