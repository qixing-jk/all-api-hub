import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  type ProtectionBypassAutomaticFeature,
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
