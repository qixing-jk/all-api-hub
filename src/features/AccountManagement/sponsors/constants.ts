export const SPONSOR_CATALOG_SCHEMA_VERSION = 5

export const SPONSOR_REMOTE_CATALOG_V5_URL =
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/sponsor-catalog.v5.json"

export const SPONSOR_LOCALE_FALLBACKS = ["zh-CN", "en"] as const

export const SPONSOR_RECOMMENDATION_SURFACES = {
  Newcomer: "newcomer",
  AddAccountDialog: "add-account-dialog",
} as const

export type SponsorRecommendationSurface =
  (typeof SPONSOR_RECOMMENDATION_SURFACES)[keyof typeof SPONSOR_RECOMMENDATION_SURFACES]
