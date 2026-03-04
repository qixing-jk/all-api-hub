import type { SiteAccount } from "~/types"

/**
 * Migrate/normalize the persisted `disabled` flag on a {@link SiteAccount}.
 *
 * Older stored accounts may not have the `disabled` field at all. Per spec,
 * missing/undefined must be treated as enabled (false). This migration ensures:
 * - The attribute exists on persisted records after migration
 * - The value is normalized to a boolean (`true` only when explicitly true)
 */
export function migrateDisabledFlagConfig(account: SiteAccount): SiteAccount {
  return {
    ...account,
    disabled: account.disabled === true,
  }
}
