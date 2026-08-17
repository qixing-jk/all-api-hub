/**
 * Sentinel selection value for entering Key Management "All accounts" mode.
 */
export const KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE = "all" as const

/**
 * Route parameters consumed by Key Management deep links.
 */
export const KEY_MANAGEMENT_ROUTE_PARAMS = {
  AccountId: "accountId",
  AssociationId: "associationId",
  GuidedImport: "guidedImport",
  TokenId: "tokenId",
  Workspace: "workspace",
} as const

/** States emitted while resolving an association deep-link target. */
export const KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES = {
  Loading: "loading",
  Locating: "locating",
  Found: "found",
  Missing: "missing",
  NeedsConfirmation: "needs-confirmation",
  Unavailable: "unavailable",
} as const

export type KeyManagementAssociationTargetState =
  (typeof KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES)[keyof typeof KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES]

export type KeyManagementAssociationTargetResultState =
  | typeof KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Found
  | typeof KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Missing

export type KeyManagementAssociationTargetLookupState =
  | typeof KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating
  | KeyManagementAssociationTargetResultState

/**
 * Supported guided import targets for Key Management deep links.
 */
export const KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS = {
  ManagedSite: "managedSite",
} as const

export const ACCOUNT_KEY_STATUS_FILTERS = {
  All: "all",
  Enabled: "enabled",
  Disabled: "disabled",
  Expired: "expired",
  Unknown: "unknown",
} as const
