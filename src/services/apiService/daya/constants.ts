/** Console routes of the Daya API account API, all same-origin on the saved site URL. */
export const DAYA_ENDPOINTS = {
  CatalogModels: "/api/v1/catalog/models",
  Identity: "/api/v1/auth/me",
  TodayStats: "/api/v1/usage/dashboard/stats",
  Keys: "/api/v1/keys",
  DefaultKeyGroups: "/api/v1/groups/default-api-key-groups",
  GroupsAvailable: "/api/v1/groups/available",
  RewardsOverview: "/api/v1/rewards/overview",
  CheckIn: "/api/v1/rewards/check-in",
  Redeem: "/api/v1/code/apply",
  Announcements: "/api/v1/announcements",
  PublicSettings: "/api/v1/settings/public",
} as const

/**
 * The site's own day boundary (`site_timezone` in the rewards overview, and the
 * deployment's Asia/Shanghai clock). The today-stats route accepts a timezone
 * parameter and answers in that offset.
 */
export const DAYA_TODAY_TIME_ZONE = "Asia/Shanghai"

/** Native key lifecycle values, shared by parsing and editing. */
export const DAYA_KEY_STATUSES = {
  Active: "active",
  Inactive: "inactive",
  QuotaExhausted: "quota_exhausted",
  Expired: "expired",
} as const
