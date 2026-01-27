import type { SiteAccount } from "~/types"

/**
 * Migrate/normalize the persisted {@link SiteAccount.excludeFromTotalBalance} flag.
 *
 * Older stored accounts may not have the field at all. Per spec, missing/undefined
 * must be treated as included in Total Balance (`false`). This migration ensures:
 * - The attribute exists on persisted records after migration
 * - The value is normalized to a boolean (`true` only when explicitly true)
 */
export function migrateExcludeFromTotalBalanceConfig(
  account: SiteAccount,
): SiteAccount {
  return {
    ...account,
    excludeFromTotalBalance: account.excludeFromTotalBalance === true,
  }
}
