/**
 * Stable Options page menu ids.
 *
 * These values are used as URL hash fragments (e.g. `#basic`) and must remain
 * consistent across the options UI, background scripts, and navigation helpers.
 */
export const MENU_ITEM_IDS = {
  BASIC: "basic",
  ACCOUNT: "account",
  BOOKMARK: "bookmark",
  AUTO_CHECKIN: "autoCheckin",
  USAGE_ANALYTICS: "usageAnalytics",
  BALANCE_HISTORY: "balanceHistory",
  MODELS: "models",
  KEYS: "keys",
  API_CREDENTIAL_PROFILES: "apiCredentialProfiles",
  MANAGED_SITE_CHANNELS: "managedSiteChannels",
  MANAGED_SITE_MODEL_SYNC: "managedSiteModelSync",
  IMPORT_EXPORT: "importExport",
  ABOUT: "about",
  MESH_GRADIENT_LAB: "meshGradientLab",
} as const

export type OptionsMenuItemId =
  (typeof MENU_ITEM_IDS)[keyof typeof MENU_ITEM_IDS]
