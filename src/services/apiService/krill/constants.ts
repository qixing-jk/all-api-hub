/** Console routes of the Krill AI account API, all same-origin on the saved site URL. */
export const KRILL_ENDPOINTS = {
  Identity: "/api/auth/me",
  Subscription: "/api/subscription",
  TodayStats: "/api/request-logs/stats",
  Tokens: "/api/tokens",
  Channels: "/api/my/channels",
  Invite: "/api/invite/me",
  Announcements: "/api/public/announcements",
  Redeem: "/api/redeem",
  Models: "/api/models",
  ModelPricing: "/api/model-pricing",
  ModelRoutes: "/api/my/model-routes",
  DedicatedModels: "/api/my/dedicated-models",
  EndpointSettings: "/api/endpoint-settings/me",
} as const

/** The console's own day boundary for "today" statistics is Asia/Shanghai. */
export const KRILL_TODAY_TIME_ZONE_OFFSET_MINUTES = 8 * 60
