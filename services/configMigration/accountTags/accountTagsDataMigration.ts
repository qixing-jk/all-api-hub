import {
  buildNormalizedNameIndex,
  generateTagId,
  normalizeTagNameForUniqueness,
  sanitizeTagStore,
} from "~/services/accountTags/tagStoreUtils"
import type { SiteAccount, TagStore } from "~/types"

export const CURRENT_ACCOUNT_TAG_DATA_VERSION = 1

type MigrationInput = {
  accounts: SiteAccount[]
  tagStore: TagStore
}

type MigrationResult = {
  accounts: SiteAccount[]
  tagStore: TagStore
  migratedAccountCount: number
  createdTagCount: number
}

type MigrationFunction = (input: MigrationInput) => MigrationResult

/**
 * Check whether any account still needs the legacy tag migration.
 *
 * Legacy shape: `account.tags: string[]` (non-empty) without `account.tagIds`.
 *
 * This helper is intentionally cheap and side-effect free so callers can avoid
 * triggering the full migration (and its storage write lock) during normal app
 * flows when no legacy data exists.
 */
export function needsAccountTagsDataMigration(
  accounts: SiteAccount[],
): boolean {
  return accounts.some((account) => {
    const hasTagIds = Array.isArray(account.tagIds) && account.tagIds.length > 0
    if (hasTagIds) return false

    const legacyTags = Array.isArray(account.tags) ? account.tags : []
    return legacyTags.some((tag) => Boolean(String(tag).trim()))
  })
}

const migrations: Record<number, MigrationFunction> = {
  1: (input) => {
    const { accounts } = input
    const tagStore = sanitizeTagStore(input.tagStore)
    const nameIndex = buildNormalizedNameIndex(tagStore)

    let migratedAccountCount = 0
    let createdTagCount = 0

    const nextAccounts = accounts.map((account) => {
      const hasTagIds =
        Array.isArray(account.tagIds) && account.tagIds.length > 0
      const legacyTags = Array.isArray(account.tags) ? account.tags : []
      const hasLegacyTags = legacyTags.some((tag) =>
        Boolean(String(tag).trim()),
      )

      if (hasTagIds || !hasLegacyTags) {
        return account
      }

      const nextTagIds: string[] = []
      const seen = new Set<string>()

      for (const rawTagName of legacyTags) {
        const normalized = normalizeTagNameForUniqueness(
          String(rawTagName ?? ""),
        )
        if (!normalized) continue

        let tagId = nameIndex.get(normalized.normalizedKey)
        if (!tagId) {
          tagId = generateTagId()
          tagStore.tagsById[tagId] = {
            id: tagId,
            name: normalized.displayName,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          nameIndex.set(normalized.normalizedKey, tagId)
          createdTagCount++
        }

        if (!seen.has(tagId)) {
          seen.add(tagId)
          nextTagIds.push(tagId)
        }
      }

      migratedAccountCount++

      const { tags: _legacyTags, ...rest } = account
      return {
        ...rest,
        tagIds: nextTagIds,
      }
    })

    return {
      accounts: nextAccounts,
      tagStore,
      migratedAccountCount,
      createdTagCount,
    }
  },
}

/**
 * Migrates account tags data to the latest version.
 */
export function migrateAccountTagsData(input: MigrationInput): MigrationResult {
  let currentVersion = 0
  let result: MigrationResult = {
    accounts: input.accounts,
    tagStore: sanitizeTagStore(input.tagStore),
    migratedAccountCount: 0,
    createdTagCount: 0,
  }

  while (currentVersion < CURRENT_ACCOUNT_TAG_DATA_VERSION) {
    const nextVersion = currentVersion + 1
    const migration = migrations[nextVersion]
    if (!migration) break

    const next = migration({
      accounts: result.accounts,
      tagStore: result.tagStore,
    })
    result = {
      accounts: next.accounts,
      tagStore: next.tagStore,
      migratedAccountCount:
        result.migratedAccountCount + next.migratedAccountCount,
      createdTagCount: result.createdTagCount + next.createdTagCount,
    }
    currentVersion = nextVersion
  }

  return result
}
