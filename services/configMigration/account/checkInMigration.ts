import type { SiteAccount } from "~/types"

/**
 * This module handles the migration of check-in related configuration from version 0 to version 1.
 * It is now part of the centralized version-based migration system.
 */

/**
 * Checks if a SiteAccount needs to be migrated from the old check-in properties.
 * This is specifically for the v0 -> v1 migration.
 * @param account The SiteAccount to check.
 * @returns True if migration is needed, false otherwise.
 */
function needsCheckInMigration(account: Partial<SiteAccount>): boolean {
  return (
    !account.checkIn &&
    (account.supports_check_in === true ||
      typeof account.can_check_in !== "undefined")
  )
}

/**
 * Migrates a SiteAccount from the old check-in structure (v0) to the new `checkIn` object structure (v1).
 * This function is called by the central migration service.
 *
 * The migration logic is as follows:
 * 1. If `supports_check_in` is true, create the `checkIn` object.
 *    - `enableDetection` is set to `true`.
 *    - `checkIn.siteStatus.isCheckedInToday` is set based on the INVERTED value of `can_check_in`.
 *      - `can_check_in: true` (can check in) => `isCheckedInToday: false` (not checked in today)
 *      - `can_check_in: false` (already checked in) => `isCheckedInToday: true` (checked in today)
 * 2. If `supports_check_in` is not true, the `checkIn` object is not created.
 * 3. The old `supports_check_in` and `can_check_in` properties are removed after migration.
 * @param account The SiteAccount to migrate (at config version 0).
 * @returns The migrated SiteAccount (at config version 1, without the version number set).
 * @example
 * // Scenario 1: Can check in
 * const account1 = { id: '1', supports_check_in: true, can_check_in: true };
 * const migrated1 = migrateCheckInConfig(account1);
 * // migrated1 will be { id: '1', checkIn: { enableDetection: true, siteStatus: { isCheckedInToday: false } } }
 * @example
 * // Scenario 2: Already checked in
 * const account2 = { id: '2', supports_check_in: true, can_check_in: false };
 * const migrated2 = migrateCheckInConfig(account2);
 * // migrated2 will be { id: '2', checkIn: { enableDetection: true, siteStatus: { isCheckedInToday: true } } }
 * @example
 * // Scenario 3: `can_check_in` is undefined
 * const account3 = { id: '3', supports_check_in: true };
 * const migrated3 = migrateCheckInConfig(account3);
 * // migrated3 will be { id: '3', checkIn: { enableDetection: true, siteStatus: { isCheckedInToday: false } } }
 * @example
 * // Scenario 4: Feature not supported
 * const account4 = { id: '4', supports_check_in: false };
 * const migrated4 = migrateCheckInConfig(account4);
 * // migrated4 will be { id: '4' }
 * @example
 * // Scenario 5: Already migrated
 * const account5 = { id: '5', checkIn: { enableDetection: true, siteStatus: { isCheckedInToday: false } } };
 * const migrated5 = migrateCheckInConfig(account5);
 * // migrated5 will be { id: '5', checkIn: { enableDetection: true, siteStatus: { isCheckedInToday: false } } }
 */
export function migrateCheckInConfig<T extends Partial<SiteAccount>>(
  account: T,
): T {
  if (!needsCheckInMigration(account)) {
    // If migration is not needed, but old keys still exist (e.g. supports_check_in: false),
    // we should clean them up.
    if (account.supports_check_in === false && !account.checkIn) {
      const cleanedAccount = { ...account }
      delete cleanedAccount.supports_check_in
      delete cleanedAccount.can_check_in
      return cleanedAccount
    }
    return account
  }

  const migratedAccount = { ...account }

  // Create the new checkIn object if supported
  if (migratedAccount.supports_check_in === true) {
    migratedAccount.checkIn = {
      enableDetection: true,
      // The logic is inverted:
      // old `can_check_in: true` (can check in) => new `isCheckedInToday: false` (not checked in)
      // old `can_check_in: false` (already checked in) => new `isCheckedInToday: true` (checked in)
      siteStatus: {
        isCheckedInToday: !(migratedAccount.can_check_in ?? true),
      },
    }
  }

  // Remove old properties
  delete migratedAccount.supports_check_in
  delete migratedAccount.can_check_in

  return migratedAccount
}
