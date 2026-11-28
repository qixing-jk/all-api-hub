/** Health is public; native console routes use OAuth Cookies, separate from inference /v1. */
export const PMPLAN_ENDPOINTS = {
  Health: "/api/health",
  Identity: "/api/me",
  Keys: "/api/keys",
  Models: "/api/models",
  ModelSquare: "/api/model-square",
  Notices: "/api/notices",
  RedeemResetCard: "/api/reset-cards/redeem",
} as const

/** Public health signature owned by the protocol, independent of display branding. */
export const PMPLAN_PROGRAM_NAME = "PM-Plan"

/** Unknown upstream statuses remain readable but grant no key actions. */
export const PMPLAN_KEY_STATUSES = {
  Active: "active",
  Revoked: "revoked",
  Expired: "expired",
} as const

/** Native monetary fields count millionths of a US dollar. */
export const PMPLAN_MICRO_USD_PER_USD = 1_000_000
