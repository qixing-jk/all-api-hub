import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassAutomaticFeature,
  type ProtectionBypassAutomaticTrigger,
  type ProtectionBypassSurface,
} from "~/services/protectionBypass/contracts"

export const SHIELD_AUTOMATIC_FEATURE_ITEMS = [
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    titleKey: "settings:refresh.shieldAutomaticFeatureAccountRefresh",
    keyword: "Account refresh",
  },
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory,
    titleKey: "settings:refresh.shieldAutomaticFeatureBalanceHistory",
    keyword: "Balance history",
  },
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin,
    titleKey: "settings:refresh.shieldAutomaticFeatureCheckin",
    keyword: "Check-in",
  },
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.RedemptionAssist,
    titleKey: "settings:refresh.shieldAutomaticFeatureRedemptionAssist",
    keyword: "Redemption assistance",
  },
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.LdohSiteLookup,
    titleKey: "settings:refresh.shieldAutomaticFeatureLdohSiteLookup",
    keyword: "Site lookup",
  },
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement,
    titleKey: "settings:refresh.shieldAutomaticFeatureKeyManagement",
    keyword: "Key management",
  },
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteChannels,
    titleKey: "settings:refresh.shieldAutomaticFeatureManagedSiteChannels",
    keyword: "Managed-site channels",
  },
  {
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteModelSync,
    titleKey: "settings:refresh.shieldAutomaticFeatureManagedSiteModelSync",
    keyword: "Managed-site model sync",
  },
] as const satisfies readonly {
  feature: ProtectionBypassAutomaticFeature
  titleKey: string
  keyword: string
}[]

export const SHIELD_DEV_TRIGGER_PRESET_IDS = {
  AccountRefreshScheduled: "account_refresh_scheduled",
  BalanceHistoryScheduled: "balance_history_scheduled",
  CheckinScheduled: "checkin_scheduled",
  RedemptionAssistRecovery: "redemption_assist_recovery",
  LdohSiteLookupRecovery: "ldoh_site_lookup_recovery",
  KeyManagementRecovery: "key_management_recovery",
} as const

export type ShieldDevTriggerPresetId =
  (typeof SHIELD_DEV_TRIGGER_PRESET_IDS)[keyof typeof SHIELD_DEV_TRIGGER_PRESET_IDS]

/** Existing automatic roots that can safely exercise the generic fallback task. */
export const SHIELD_DEV_TRIGGER_PRESETS = [
  {
    id: SHIELD_DEV_TRIGGER_PRESET_IDS.AccountRefreshScheduled,
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  },
  {
    id: SHIELD_DEV_TRIGGER_PRESET_IDS.BalanceHistoryScheduled,
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  },
  {
    id: SHIELD_DEV_TRIGGER_PRESET_IDS.CheckinScheduled,
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  },
  {
    id: SHIELD_DEV_TRIGGER_PRESET_IDS.RedemptionAssistRecovery,
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.RedemptionAssist,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  },
  {
    id: SHIELD_DEV_TRIGGER_PRESET_IDS.LdohSiteLookupRecovery,
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.LdohSiteLookup,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  },
  {
    id: SHIELD_DEV_TRIGGER_PRESET_IDS.KeyManagementRecovery,
    feature: PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    surface: PROTECTION_BYPASS_SURFACES.Options,
  },
] as const satisfies readonly {
  id: ShieldDevTriggerPresetId
  feature: ProtectionBypassAutomaticFeature
  trigger: ProtectionBypassAutomaticTrigger
  surface: ProtectionBypassSurface
}[]

export const DEFAULT_SHIELD_DEV_TRIGGER_PRESET_ID =
  SHIELD_DEV_TRIGGER_PRESET_IDS.AccountRefreshScheduled

/** Resolves a controlled preset id without accepting arbitrary execution metadata. */
export function getShieldDevTriggerPreset(id: ShieldDevTriggerPresetId) {
  return (
    SHIELD_DEV_TRIGGER_PRESETS.find((preset) => preset.id === id) ??
    SHIELD_DEV_TRIGGER_PRESETS[0]
  )
}
