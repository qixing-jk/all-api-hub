import {
  DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
} from "~/services/preferences/contentScriptFeatureDefaults"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { type TempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_ENTRYPOINTS } from "~/services/productAnalytics/contracts"
import { trackSettingsSnapshotEvents } from "~/services/productAnalytics/settings"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { normalizeSiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import { normalizeTaskNotificationPreferences } from "~/types/taskNotifications"
import type { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"

import type {
  PreferenceSaveOptions,
  RuntimeMutationResponse,
  UserManagedSiteModelSyncConfig,
} from "./preferenceContextTypes"

const DEFAULT_MANAGED_SITE_MODEL_SYNC_CONFIG =
  DEFAULT_PREFERENCES.managedSiteModelSync!

const DEFAULT_TEMP_WINDOW_FALLBACK_CONFIG =
  DEFAULT_PREFERENCES.tempWindowFallback!

const INVALID_RUNTIME_MUTATION_RESPONSE: RuntimeMutationResponse = {
  success: false,
  error: "Invalid response from background",
}

/**
 * Type guard to validate if an unknown value conforms to the RuntimeMutationResponse shape
 */
function isRuntimeMutationResponse(
  value: unknown,
): value is RuntimeMutationResponse {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.success === "boolean" &&
    (candidate.error === undefined || typeof candidate.error === "string") &&
    (candidate.message === undefined || typeof candidate.message === "string")
  )
}

/**
 * Normalizes an unknown value into a RuntimeMutationResponse
 */
export function normalizeRuntimeMutationResponse(
  value: unknown,
): RuntimeMutationResponse {
  return isRuntimeMutationResponse(value)
    ? value
    : INVALID_RUNTIME_MUTATION_RESPONSE
}

/**
 * Persist a preference patch and only include the optimistic concurrency guard
 * when a caller is saving from a tracked local draft snapshot.
 */
export function savePreferencesWithOptions(
  updates: Parameters<typeof userPreferences.savePreferences>[0],
  options?: PreferenceSaveOptions,
) {
  return typeof options?.expectedLastUpdated === "number"
    ? userPreferences.savePreferencesWithResult(updates, options)
    : userPreferences.savePreferencesWithResult(updates)
}

/**
 * Narrow an unknown runtime response payload to a persisted preferences snapshot.
 */
export function isUserPreferencesSnapshot(
  value: unknown,
): value is UserPreferences {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as UserPreferences).lastUpdated === "number"
  )
}

/**
 * Emits option-page settings snapshots with the current persisted preferences.
 */
export function trackOptionsSettingsSnapshots(
  preferences: UserPreferences,
  updates?: DeepPartial<UserPreferences>,
) {
  trackSettingsSnapshotEvents(
    preferences,
    PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    updates,
  )
}

/**
 * Fills legacy or partial preference snapshots before exposing them to UI and analytics.
 */
export function normalizeContextPreferenceSnapshot(
  preferences: UserPreferences,
): UserPreferences {
  return {
    ...preferences,
    autoCheckin: deepOverride(
      DEFAULT_PREFERENCES.autoCheckin,
      preferences.autoCheckin ?? {},
    ),
    balanceHistory: deepOverride(
      DEFAULT_PREFERENCES.balanceHistory ?? DEFAULT_BALANCE_HISTORY_PREFERENCES,
      preferences.balanceHistory ?? {},
    ),
    managedSiteModelSync: deepOverride(
      DEFAULT_MANAGED_SITE_MODEL_SYNC_CONFIG,
      preferences.managedSiteModelSync ?? preferences.newApiModelSync ?? {},
    ) as UserManagedSiteModelSyncConfig,
    modelRedirect: deepOverride(
      DEFAULT_PREFERENCES.modelRedirect,
      preferences.modelRedirect ?? {},
    ),
    redemptionAssist: deepOverride(
      DEFAULT_PREFERENCES.redemptionAssist ??
        DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      preferences.redemptionAssist ?? {},
    ),
    webAiApiCheck: deepOverride(
      DEFAULT_PREFERENCES.webAiApiCheck ?? DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      preferences.webAiApiCheck ?? {},
    ),
    tempWindowFallback: deepOverride(
      DEFAULT_TEMP_WINDOW_FALLBACK_CONFIG,
      preferences.tempWindowFallback ?? {},
    ) as TempWindowFallbackPreferences,
    taskNotifications: normalizeTaskNotificationPreferences(
      preferences.taskNotifications,
    ),
    siteAnnouncementNotifications: normalizeSiteAnnouncementPreferences(
      preferences.siteAnnouncementNotifications,
    ),
  }
}
// 1. 定义 Context 的值类型
