import {
  TEMP_CONTEXT_MODES,
  TEMP_CONTEXT_PREFERENCE_MODES,
  type TempContextPreferenceMode,
} from "~/constants/tempContextMode"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  type TempWindowFallbackReminderPreferences,
  type UserPreferences,
} from "~/services/preferences/preferencesSchema"
import {
  normalizeTempWindowFallbackPreferences,
  type TempWindowFallbackPreferences,
} from "~/services/preferences/tempWindowFallbackPreferences"
import {
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsModeId,
} from "~/services/productAnalytics/contracts"
import {
  SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTY_FEATURES,
  type SettingsSnapshotAutomaticFeatureBypassProperty,
} from "~/services/productAnalytics/settingsSnapshot"

import { type SettingChangedPayload } from "./values"
import type { SettingsSnapshotProjection } from "./values"

/** Project temp window fallback into privacy-reviewed analytics facts. */
function buildTempWindowFallbackSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getTempWindowFallbackPreferences(preferences)
  const reminderConfig = getTempWindowFallbackReminderPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.TempWindowFallbackConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    ...buildAutomaticFeatureBypassSnapshot(preferences),
    mode: getTempWindowMode(config.tempContextMode),
    reminder_dismissed: reminderConfig.dismissed === true,
  }
}

/** Normalize protection bypass choices before projecting controlled flags. */
function getTempWindowFallbackPreferences(
  preferences: UserPreferences,
): TempWindowFallbackPreferences {
  return normalizeTempWindowFallbackPreferences(
    preferences.tempWindowFallback ?? DEFAULT_PREFERENCES.tempWindowFallback,
  )
}

/** Resolve reminder defaults without changing the saved preference. */
function getTempWindowFallbackReminderPreferences(
  preferences: UserPreferences,
): TempWindowFallbackReminderPreferences {
  return (
    preferences.tempWindowFallbackReminder ??
    DEFAULT_PREFERENCES.tempWindowFallbackReminder!
  )
}

/** Project per-feature protection bypass flags using privacy-reviewed field names. */
export function buildAutomaticFeatureBypassSnapshot(
  preferences: UserPreferences,
): Record<SettingsSnapshotAutomaticFeatureBypassProperty, boolean> {
  const config = getTempWindowFallbackPreferences(preferences)
  return Object.fromEntries(
    Object.entries(
      SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTY_FEATURES,
    ).map(([property, feature]) => [
      property,
      config.automaticFeatureBypass[feature],
    ]),
  ) as Record<SettingsSnapshotAutomaticFeatureBypassProperty, boolean>
}

/** Map the normalized temporary context preference to a controlled analytics mode. */
function getTempWindowMode(
  mode: TempWindowFallbackPreferences["tempContextMode"],
): ProductAnalyticsModeId {
  return TEMP_WINDOW_ANALYTICS_MODE_BY_PREFERENCE[mode]
}

const TEMP_WINDOW_ANALYTICS_MODE_BY_PREFERENCE = {
  [TEMP_CONTEXT_PREFERENCE_MODES.Auto]:
    PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeAuto,
  [TEMP_CONTEXT_MODES.Tab]: PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeTab,
  [TEMP_CONTEXT_MODES.Composite]:
    PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeComposite,
  [TEMP_CONTEXT_MODES.Window]: PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeWindow,
} as const satisfies Record<TempContextPreferenceMode, ProductAnalyticsModeId>

/** Keep patch attribution beside the safe projection of each settings area. */
export const protectionSettingsSnapshots = {
  tempWindowFallback: {
    keys: ["tempWindowFallback", "tempWindowFallbackReminder"],
    build: buildTempWindowFallbackSnapshot,
  },
} satisfies Record<string, SettingsSnapshotProjection>
