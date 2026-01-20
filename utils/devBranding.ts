export type DevBuildInfo = {
  /**
   * Git branch name, for example: `feat/account-disable`.
   * This value is expected to be injected by the build tooling in dev mode.
   */
  branch: string
  /**
   * Short git commit SHA, for example: `a1b2c3d`.
   */
  sha: string
  /**
   * Whether the working tree contains uncommitted changes.
   */
  dirty: boolean
}

/**
 * Formats a human-friendly dev build label used in extension metadata.
 * Kept short because it appears in browser extension UIs.
 */
export function formatDevVersionName(info: DevBuildInfo): string {
  const branch = (info.branch || "unknown").trim()
  const sha = (info.sha || "unknown").trim()
  const dirtySuffix = info.dirty ? "+dirty" : ""
  return `dev ${branch}@${sha}${dirtySuffix}`
}

/**
 * Appends dev build info to a manifest `name` string.
 * This is only intended for development builds (WXT `serve`).
 */
export function formatDevManifestName(baseName: string, versionName: string) {
  const safeBase = (baseName || "All API Hub").trim()
  const safeVersion = (versionName || "dev").trim()
  return `${safeBase} [${safeVersion}]`
}

/**
 * Appends dev build info to a manifest `description` string.
 * Prefer a separator over newlines to keep extension stores/browser UIs happy.
 */
export function formatDevManifestDescription(
  baseDescription: string,
  versionName: string,
) {
  const safeBase = (baseDescription || "").trim()
  const safeVersion = (versionName || "dev").trim()
  return safeBase ? `${safeBase} | ${safeVersion}` : safeVersion
}

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
  const safeBase = (baseTitle || "All API Hub").trim()
  const safeVersion = (versionName || "").trim()
  if (!safeVersion) return `${safeBase} (dev)`
  return safeBase.includes(safeVersion)
    ? safeBase
    : `${safeBase} (${safeVersion})`
}
