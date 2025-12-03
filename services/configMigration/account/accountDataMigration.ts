/**
 * Centralized configuration migration system
 * Handles version-based migrations for SiteAccount configurations
 */

import type { SiteAccount } from "~/types"

import { migrateCheckInConfig } from "./checkInMigration"

// Current version of the configuration schema
export const CURRENT_CONFIG_VERSION = 1

/**
 * Migration function type
 * Takes an account at version N and returns it at version N+1
 */
type MigrationFunction = (account: SiteAccount) => SiteAccount

/**
 * Registry of migration functions
 * Key: target version number
 * Value: migration function to upgrade to that version
 */
const migrations: Record<number, MigrationFunction> = {
  // Version 0 -> 1: Migrate check-in configuration
  1: (account: SiteAccount): SiteAccount => {
    const migrated = migrateCheckInConfig(account)
    migrated.configVersion = 1
    return migrated
  },

  // Future migrations will be added here:
  // 2: (account: SiteAccount): SiteAccount => { ... },
}

/**
 * Check if an account needs migration
 */
export function needsConfigMigration(account: SiteAccount): boolean {
  const currentVersion = account.configVersion ?? 0
  return currentVersion < CURRENT_CONFIG_VERSION
}

/**
 * Get the version of an account's configuration
 */
export function getConfigVersion(account: SiteAccount): number {
  return account.configVersion ?? 0
}

/**
 * Migrate an account to the latest configuration version
 * Applies all necessary migrations sequentially
 */
export function migrateAccountConfig(account: SiteAccount): SiteAccount {
  let currentVersion = getConfigVersion(account)
  let migratedAccount = { ...account }

  // Apply migrations sequentially until we reach current version
  while (currentVersion < CURRENT_CONFIG_VERSION) {
    const nextVersion = currentVersion + 1
    const migrationFn = migrations[nextVersion]

    if (!migrationFn) {
      console.error(`No migration defined for version ${nextVersion}`)
      break
    }

    console.log(
      `Migrating account ${account.id} from v${currentVersion} to v${nextVersion}`,
    )
    migratedAccount = migrationFn(migratedAccount)
    currentVersion = nextVersion
  }

  return migratedAccount
}

/**
 * Migrate an array of accounts to the latest version
 * Returns migrated accounts and count of migrations performed
 */
export function migrateAccountsConfig(accounts: SiteAccount[]): {
  accounts: SiteAccount[]
  migratedCount: number
} {
  let migratedCount = 0

  const migratedAccounts = accounts.map((account) => {
    if (needsConfigMigration(account)) {
      migratedCount++
      return migrateAccountConfig(account)
    }
    return account
  })

  if (migratedCount > 0) {
    console.log(
      `Successfully migrated ${migratedCount} account(s) to config version ${CURRENT_CONFIG_VERSION}`,
    )
  }

  return {
    accounts: migratedAccounts,
    migratedCount,
  }
}
