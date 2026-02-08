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

/**
 * Centralized storage keys registry.
 *
 * Prefer this export when you need to reference storage keys outside of a
 * specific storage module so discovery and auditing remain straightforward.
 */
export const STORAGE_KEYS = {
  ...ACCOUNT_STORAGE_KEYS,
  ...TAG_STORAGE_KEYS,
  ...USER_PREFERENCES_STORAGE_KEYS,
  DAILY_BALANCE_HISTORY_STORE: DAILY_BALANCE_HISTORY_STORAGE_KEYS.STORE,
} as const
