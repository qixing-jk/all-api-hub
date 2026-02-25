/**
 * Shared storage key registry.
 *
 * Keep these constants in a standalone module to avoid circular dependencies
 * between storage services (e.g. account storage <-> tag storage).
 */

export const STORAGE_LOCKS = {
  /**
   * Exclusive lock used for any read-modify-write sequences touching account
   * storage and related derived blobs (e.g. global tag store).
   */
  ACCOUNT_STORAGE: "all-api-hub:account-storage",
  /**
   * Exclusive lock used for read-modify-write sequences touching the daily
   * balance history store.
   */
  DAILY_BALANCE_HISTORY: "all-api-hub:daily-balance-history",
  /**
   * Exclusive lock used for read-modify-write sequences touching API credential
   * profiles storage.
   */
  API_CREDENTIAL_PROFILES: "all-api-hub:api-credential-profiles",
  /**
   * Exclusive lock used for read-modify-write sequences touching the changelog
   * on update state store.
   */
  CHANGELOG_ON_UPDATE: "all-api-hub:changelog-on-update",
} as const

export const ACCOUNT_STORAGE_KEYS = {
  ACCOUNTS: "site_accounts",
} as const

export const TAG_STORAGE_KEYS = {
  TAG_STORE: "global_tag_store",
} as const

export const USER_PREFERENCES_STORAGE_KEYS = {
  USER_PREFERENCES: "user_preferences",
} as const

export const DAILY_BALANCE_HISTORY_STORAGE_KEYS = {
  STORE: "dailyBalanceHistory_store",
} as const

export const API_CREDENTIAL_PROFILES_STORAGE_KEYS = {
  API_CREDENTIAL_PROFILES: "api_credential_profiles",
} as const

export const ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS = {
  REPAIR_PROGRESS: "accountKeyRepair_progress",
} as const

export const CHANGELOG_ON_UPDATE_STORAGE_KEYS = {
  PENDING_VERSION: "changelogOnUpdate_pendingVersion",
} as const

/**
 * Centralized storage keys registry.
 *
 * Prefer this export when you need to reference storage keys outside of a
 * specific storage module so discovery and auditing remain straightforward.
 */
export const STORAGE_KEYS = {
  ...ACCOUNT_STORAGE_KEYS,
  ...TAG_STORAGE_KEYS,
  ...API_CREDENTIAL_PROFILES_STORAGE_KEYS,
  ...ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS,
  ...USER_PREFERENCES_STORAGE_KEYS,
  CHANGELOG_ON_UPDATE_PENDING_VERSION:
    CHANGELOG_ON_UPDATE_STORAGE_KEYS.PENDING_VERSION,
  DAILY_BALANCE_HISTORY_STORE: DAILY_BALANCE_HISTORY_STORAGE_KEYS.STORE,
} as const
