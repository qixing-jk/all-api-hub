/** Canonical read-only endpoints used by API credential telemetry adapters. */
export const API_CREDENTIAL_TELEMETRY_ENDPOINTS = {
  deepSeekBalance: "/user/balance",
  glmQuota: "/api/monitor/usage/quota/limit",
  kimiQuota: "/coding/v1/usages",
  kimiOpenPlatformBalance: "/v1/users/me/balance",
  openCodeGoUsage: "/v1/usage",
  models: {
    google: "/v1beta/models",
    openAiCompatible: "/v1/models",
  },
  openAiBilling: {
    subscription: "/v1/dashboard/billing/subscription",
    usage: "/v1/dashboard/billing/usage",
  },
  newApiTokenUsage: "/api/usage/token/",
  sub2ApiUsage: "/v1/usage",
} as const
