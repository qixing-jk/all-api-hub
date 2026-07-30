import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ProtectionBypassAutomaticFeature } from "~/services/protectionBypass/contracts"

export const SHIELD_SETTINGS_TARGET_IDS = {
  root: SETTINGS_ANCHORS.SHIELD_SETTINGS,
  enabled: "shield-enabled",
  method: "shield-method",
  automaticFeatures: "shield-automatic-features",
  feature: {
    account_refresh: "shield-automatic-feature-account-refresh",
    balance_history: "shield-automatic-feature-balance-history",
    checkin: "shield-automatic-feature-checkin",
    redemption_assist: "shield-automatic-feature-redemption-assist",
    ldoh_site_lookup: "shield-automatic-feature-ldoh-site-lookup",
    key_management: "shield-automatic-feature-key-management",
    managed_site_channels: "shield-automatic-feature-managed-site-channels",
    managed_site_model_sync: "shield-automatic-feature-managed-site-model-sync",
  },
} as const satisfies {
  root: string
  enabled: string
  method: string
  automaticFeatures: string
  feature: Record<ProtectionBypassAutomaticFeature, string>
}
