import type { DevOptionsMenuItemId } from "./devOptionsMenuIds"

/**
 * Stable Options page menu ids.
 *
 * These values are used as URL hash fragments (e.g. `#basic`) and must remain
 * consistent across the options UI, background scripts, and navigation helpers.
 */
export const MENU_ITEM_IDS = {
  OVERVIEW: "overview",
  BASIC: "basic",
  ACCOUNT: "account",
  BOOKMARK: "bookmark",
  AUTO_CHECKIN: "autoCheckin",
  USAGE_ANALYTICS: "usageAnalytics",
  BALANCE_HISTORY: "balanceHistory",
  SITE_ANNOUNCEMENTS: "siteAnnouncements",
  MODELS: "models",
  KEYS: "keys",
  API_CREDENTIAL_PROFILES: "apiCredentialProfiles",
  MANAGED_SITE_CHANNELS: "managedSiteChannels",
  MANAGED_SITE_MODEL_SYNC: "managedSiteModelSync",
  IMPORT_EXPORT: "importExport",
  ABOUT: "about",
} as const

export type OptionsMenuItemId =
  (typeof MENU_ITEM_IDS)[keyof typeof MENU_ITEM_IDS]

export const OPTIONS_MENU_CATEGORY_IDS = {
  GENERAL: "general",
  API: "api",
  AUTOMATION: "automation",
  INSIGHTS: "insights",
  SITE_MANAGEMENT: "siteManagement",
  SYSTEM: "system",
} as const

export type OptionsMenuCategoryId =
  (typeof OPTIONS_MENU_CATEGORY_IDS)[keyof typeof OPTIONS_MENU_CATEGORY_IDS]

/**
 * Runtime menu ids rendered in the options sidebar, including dev-only entries.
 */
export type OptionsPageMenuItemId = OptionsMenuItemId | DevOptionsMenuItemId
