/**
 * Right Code protocol constants.
 *
 * Right Code (https://www.right.codes, also served as https://right.codes and
 * https://rightapi.ai) is a commercial relay with a provider-owned REST console.
 * It is not a One API / New API deployment, so these paths are taken from the
 * deployment's own console client rather than from an upstream repository.
 *
 * Verified against the console bundle and https://docs.rightapi.ai
 */

/** Console/API paths, relative to the account's own origin. */
export const RIGHTCODE_ENDPOINTS = {
  me: "/auth/me",
  usageStats: "/use-log/stats",
  usageStatsOverall: "/use-log/stats/overall",
  usageRecentMetrics: "/use-log/recent-metrics",
  inviteStats: "/auth/invite-stats",
  subscriptions: "/subscriptions/list",
  subscriptionSummary: "/subscriptions/summary/total",
  upstreams: "/upstreams/effective",
  modelPricing: "/models/effective",
  configs: "/configs",
  apiKeys: "/api-key/list",
  apiKeyCreate: "/api-key/create",
  apiKeyDetail: (id: number | string) => `/api-key/${id}`,
  apiKeyExpire: (id: number | string) => `/api-key/${id}/expire`,
  apiKeyResetUsage: (id: number | string) => `/api-key/${id}/reset-usage`,
} as const

/** Registration/invite landing path used by the deployment's own console. */
export const RIGHTCODE_INVITE_PATH = "/register"
