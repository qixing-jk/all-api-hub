/**
 * RelayFor protocol constants.
 *
 * RelayFor (https://relayfor.xyz/) is a公益中转站 with a custom REST API.
 * Verified against console.bundle.js and live public endpoints.
 */

export const RELAYFOR_ENDPOINTS = {
  self: "/api/user/self",
  overview: "/api/user/overview",
  tokens: "/api/user/tokens",
  tokenDetail: (id: number | string) => `/api/user/tokens/${id}`,
  tokenRotate: (id: number | string) => `/api/user/tokens/${id}/rotate`,
  models: "/api/user/models",
  modelGroup: "/api/user/model-group",
  logs: "/api/user/logs",
  redeem: "/api/user/redeem",
  timedQuotas: "/api/user/timed-quotas",

  checkinCampaigns: "/api/user/checkin-campaigns",
  checkinClaim: (campaignId: number | string) =>
    `/api/user/checkin-campaigns/${campaignId}/claim`,
  announcement: "/api/site/announcement",
  about: "/api/about",
  authConfig: "/api/auth/config",
} as const

/**
 * 1 USD = 500,000 quota units, verified from console.bundle.js:
 * `const QUOTA_PER_USD = 500000;`
 */
export const RELAYFOR_QUOTA_PER_USD = 500000

export const quotaToUsd = (quota: number): number =>
  quota / RELAYFOR_QUOTA_PER_USD

export const usdToQuota = (usd: number): number =>
  Math.round(usd * RELAYFOR_QUOTA_PER_USD)
