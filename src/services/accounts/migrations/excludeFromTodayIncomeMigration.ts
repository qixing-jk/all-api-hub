import type { SiteAccount } from "~/types"

/**
 * Migrate/normalize the persisted {@link SiteAccount.excludeFromTodayIncome} flag.
 *
 * Older stored accounts may not have the field at all. Missing/undefined accounts
 * continue to participate in Today Income aggregates (`false`). This migration ensures:
 * - The attribute exists on persisted records after migration
 * - The value is normalized to a boolean (`true` only when explicitly true)
 */
export function migrateExcludeFromTodayIncomeConfig(
  account: SiteAccount,
): SiteAccount {
  return {
    ...account,
    excludeFromTodayIncome: account.excludeFromTodayIncome === true,
  }
}
