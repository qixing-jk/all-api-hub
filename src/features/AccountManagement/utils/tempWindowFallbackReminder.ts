import {
  DisplaySiteData,
  HealthStatusCode,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
} from "~/types"

export type TempWindowFallbackSettingsTab = "refresh" | "permissions"
export type TempWindowFallbackSettingsAnchor = "shield-settings"
export type TempWindowFallbackReminderCode =
  | typeof TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED
  | typeof TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED

export interface TempWindowFallbackIssue {
  code: TempWindowFallbackReminderCode
  accountId: string
  accountName: string
  settingsTab: TempWindowFallbackSettingsTab
  settingsAnchor?: TempWindowFallbackSettingsAnchor
}

/** Invalid invocation context is locally retryable and must not open Settings. */
export function isTempWindowFallbackReminderCode(
  code: HealthStatusCode | null,
): code is TempWindowFallbackReminderCode {
  return (
    code === TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED ||
    code === TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED
  )
}

/**
 * Maps a health status code to the most relevant Settings tab for fixing the issue.
 */
export function getTempWindowFallbackSettingsTab(
  code: HealthStatusCode,
): TempWindowFallbackSettingsTab {
  if (code === TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED) {
    return "permissions"
  }
  return "refresh"
}

/**
 * Maps a health status code to the most relevant in-tab Settings anchor.
 */
export function getTempWindowFallbackSettingsAnchor(
  code: HealthStatusCode,
): TempWindowFallbackSettingsAnchor | undefined {
  if (code === TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED) {
    return "shield-settings"
  }

  return undefined
}

/**
 * Returns the first temp-window fallback issue found in a list of display accounts.
 *
 * The extension uses health status codes to indicate when the temp-window fallback
 * flow would be required for normal refresh, but is currently blocked.
 */
export function getTempWindowFallbackIssue(
  sites: DisplaySiteData[],
): TempWindowFallbackIssue | null {
  for (const site of sites) {
    const code = site.health?.code
    if (!code || !isTempWindowFallbackReminderCode(code)) {
      continue
    }

    return {
      code,
      accountId: site.id,
      accountName: site.name,
      settingsTab: getTempWindowFallbackSettingsTab(code),
      settingsAnchor: getTempWindowFallbackSettingsAnchor(code),
    }
  }

  return null
}
