/**
 * Sentinel selection value for entering Key Management "All accounts" mode.
 */
export const KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE = "all" as const

/**
 * Route parameters consumed by Key Management deep links.
 */
export const KEY_MANAGEMENT_ROUTE_PARAMS = {
  GuidedImport: "guidedImport",
  TokenId: "tokenId",
} as const

/**
 * Supported guided import targets for Key Management deep links.
 */
export const KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS = {
  ManagedSite: "managedSite",
} as const
