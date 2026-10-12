/** Native console protocol values, shared by transport and account projections. */
export const FOXCODE_ENDPOINTS = {
  Identity: "/api/auth/me",
  Dashboard: "/api/user/dashboard",
  Channels: "/api/system-config/public/model_square_config",
  InferenceOrigin: "/api/system-config/public/api_endpoint_config",
  Keys: "/api/keys",
  Pricing: "/api/model-pricing",
  Referral: "/api/user/referral",
} as const

export const FOXCODE_UNITS_PER_USD = 1_000_000
export const FOXCODE_UNLIMITED_QUOTA = -1
export const FOXCODE_KEY_PAGE_SIZE = 100
export const FOXCODE_KEY_MAX_PAGES = 1000
export const FOXCODE_NON_RESETTING_PLAN = "NEVER"
