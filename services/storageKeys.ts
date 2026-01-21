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
} as const

export const ACCOUNT_STORAGE_KEYS = {
  ACCOUNTS: "site_accounts",
} as const

export const TAG_STORAGE_KEYS = {
  TAG_STORE: "global_tag_store",
} as const
