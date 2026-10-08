import {
  PROTECTION_BYPASS_FEATURES,
  type ProtectionBypassAutomaticFeature,
} from "~/services/protectionBypass/contracts"

export const SETTINGS_SNAPSHOT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

/** Snapshot name for the automatic-bypass master, not a total bypass kill switch. */
export const SETTINGS_SNAPSHOT_AUTOMATIC_BYPASS_ENABLED_PROPERTY =
  "temp_window_fallback_automatic_bypass_enabled" as const

export const SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTY_FEATURES = {
  temp_window_fallback_automatic_bypass_account_refresh_enabled:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  temp_window_fallback_automatic_bypass_balance_history_enabled:
    PROTECTION_BYPASS_FEATURES.BalanceHistory,
  temp_window_fallback_automatic_bypass_checkin_enabled:
    PROTECTION_BYPASS_FEATURES.Checkin,
  temp_window_fallback_automatic_bypass_redemption_assist_enabled:
    PROTECTION_BYPASS_FEATURES.RedemptionAssist,
  temp_window_fallback_automatic_bypass_ldoh_site_lookup_enabled:
    PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
  temp_window_fallback_automatic_bypass_key_management_enabled:
    PROTECTION_BYPASS_FEATURES.KeyManagement,
  temp_window_fallback_automatic_bypass_managed_site_channels_enabled:
    PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
  temp_window_fallback_automatic_bypass_managed_site_model_sync_enabled:
    PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
} as const satisfies Record<string, ProtectionBypassAutomaticFeature>

export const SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTIES =
  Object.keys(
    SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTY_FEATURES,
  ) as (keyof typeof SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTY_FEATURES)[]

export type SettingsSnapshotAutomaticFeatureBypassProperty =
  (typeof SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTIES)[number]

/**
 * Checks whether the three-day settings snapshot cadence has elapsed.
 */
export function shouldSendSettingsSnapshot(
  lastSentAt: number | undefined,
  now = Date.now(),
): boolean {
  if (typeof lastSentAt !== "number" || !Number.isFinite(lastSentAt)) {
    return true
  }
  return now - lastSentAt >= SETTINGS_SNAPSHOT_INTERVAL_MS
}
