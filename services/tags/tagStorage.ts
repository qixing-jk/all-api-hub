import { Storage } from "@plasmohq/storage"

import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { ensureAccountTagsStorageMigrated } from "~/services/configMigration/accountTags/accountTagsStorageMigration"
import {
  ACCOUNT_STORAGE_KEYS,
  STORAGE_LOCKS,
  TAG_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type { AccountStorageConfig, SiteAccount, Tag, TagStore } from "~/types"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"

import {
  generateTagId,
  listTagsSorted,
  mergeTagStoresAndRemapAccounts,
  normalizeTagNameForUniqueness,
  sanitizeTagStore,
  TAG_STORE_VERSION,
} from "./tagStoreUtils"

export { TAG_STORAGE_KEYS }

/**
 * Unified logger scoped to the global account tag storage service.
 */
const logger = createLogger("TagStorage")

/**
 * Global tag storage service.
 *
 * This service persists a global tag store and provides CRUD operations.
 * It also implements the required referential integrity semantics:
 * deleting a tag removes it from all accounts that reference it.
 */
class TagStorageService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  /**
   * Best-effort broadcast to other extension contexts so they can refresh
   * in-memory state (e.g. options page vs popup).
   */
  private notifyTagStoreUpdated() {
    try {
      const maybePromise = sendRuntimeMessage({
        type: "TAG_STORE_UPDATE",
        payload: { timestamp: Date.now() },
      })
      // In test environments, fake browser implementations may reject when
      // there are no listeners. This notification is best-effort and should
      // never crash storage operations.
      if (maybePromise && typeof maybePromise.catch === "function") {
        void maybePromise.catch((error: unknown) => {
          logger.debug("Runtime notify ignored", error)
        })
      }
    } catch (error) {
      // Non-fatal: tests and non-extension environments may not support runtime messaging.
      logger.debug("Failed to notify runtime listeners", error)
    }
  }

  private async getAccountStorageConfig(): Promise<AccountStorageConfig> {
    const raw = (await this.storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)) as
      | AccountStorageConfig
      | undefined

    return {
      accounts: raw?.accounts ?? [],
      bookmarks: Array.isArray(raw?.bookmarks) ? raw.bookmarks : [],
      pinnedAccountIds: raw?.pinnedAccountIds ?? [],
      orderedAccountIds: raw?.orderedAccountIds ?? [],
      last_updated: raw?.last_updated ?? Date.now(),
    }
  }

  private async saveAccountStorageConfig(config: AccountStorageConfig) {
    const next: AccountStorageConfig = {
      accounts: config.accounts ?? [],
      bookmarks: Array.isArray(config.bookmarks) ? config.bookmarks : [],
      pinnedAccountIds: config.pinnedAccountIds ?? [],
      orderedAccountIds: config.orderedAccountIds ?? [],
      last_updated: Date.now(),
    }

    await this.storage.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, next)
  }

  /**
   * Reads the global tag store from storage with a safe default.
   */
  async getTagStore(): Promise<TagStore> {
    const raw = await this.storage.get(TAG_STORAGE_KEYS.TAG_STORE)
    const sanitized = sanitizeTagStore(raw)
    if (!sanitized.version) {
      sanitized.version = TAG_STORE_VERSION
    }
    return sanitized
  }

  private async saveTagStore(next: TagStore) {
    await this.storage.set(TAG_STORAGE_KEYS.TAG_STORE, sanitizeTagStore(next))
  }

  /**
   * Export the tag store for backup/sync.
   */
  async exportTagStore(): Promise<TagStore> {
    return this.getTagStore()
  }

  /**
   * Replace the persisted tag store (used by import/sync restore flows).
   *
   * NOTE: This does not rewrite accounts. If accounts reference tag ids not
   * present in the imported store, those labels will not resolve.
   */
  async importTagStore(rawStore: unknown): Promise<void> {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.ACCOUNT_STORAGE,
      async () => {
        await this.saveTagStore(sanitizeTagStore(rawStore))
      },
    )
    this.notifyTagStoreUpdated()
  }

  /**
   * Returns all tags sorted for UI rendering.
   */
  async listTags(): Promise<Tag[]> {
    const store = await this.getTagStore()
    return listTagsSorted(store)
  }

  /**
   * Create a new tag.
   * Enforces case-insensitive uniqueness after normalization.
   */
  async createTag(name: string): Promise<Tag> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.ACCOUNT_STORAGE,
      async () => {
        const store = await this.getTagStore()
        const normalized = normalizeTagNameForUniqueness(name)
        if (!normalized) {
          throw new Error("Tag name cannot be empty.")
        }

        const existing = Object.values(store.tagsById).find((tag) => {
          const existingNormalized = normalizeTagNameForUniqueness(tag.name)
          return (
            existingNormalized &&
            existingNormalized.normalizedKey === normalized.normalizedKey
          )
        })
        if (existing) {
          throw new Error("Tag name already exists.")
        }

        const id = generateTagId()
        const now = Date.now()
        const tag: Tag = {
          id,
          name: normalized.displayName,
          createdAt: now,
          updatedAt: now,
        }

        const next: TagStore = {
          ...store,
          version: store.version || TAG_STORE_VERSION,
          tagsById: { ...store.tagsById, [id]: tag },
        }

        await this.saveTagStore(next)
        return tag
      },
    ).finally(() => {
      this.notifyTagStoreUpdated()
    })
  }

  /**
   * Rename an existing tag by id.
   * Enforces case-insensitive uniqueness after normalization.
   */
  async renameTag(tagId: string, nextName: string): Promise<Tag> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.ACCOUNT_STORAGE,
      async () => {
        const store = await this.getTagStore()
        const existing = store.tagsById[tagId]
        if (!existing) {
          throw new Error("Tag not found.")
        }

        const normalized = normalizeTagNameForUniqueness(nextName)
        if (!normalized) {
          throw new Error("Tag name cannot be empty.")
        }

        const conflict = Object.values(store.tagsById).find((tag) => {
          if (tag.id === tagId) return false
          const existingNormalized = normalizeTagNameForUniqueness(tag.name)
          return (
            existingNormalized &&
            existingNormalized.normalizedKey === normalized.normalizedKey
          )
        })
        if (conflict) {
          throw new Error("Tag name already exists.")
        }

        const updated: Tag = {
          ...existing,
          name: normalized.displayName,
          updatedAt: Date.now(),
        }

        const next: TagStore = {
          ...store,
          tagsById: { ...store.tagsById, [tagId]: updated },
        }

        await this.saveTagStore(next)
        return updated
      },
    ).finally(() => {
      this.notifyTagStoreUpdated()
    })
  }

  /**
   * Delete a tag and remove it from all taggable entities.
   *
   * Returns how many entities were modified.
   */
  async deleteTag(tagId: string): Promise<{
    updatedAccounts: number
    updatedBookmarks: number
    updatedApiCredentialProfiles: number
  }> {
    const result = await withExtensionStorageWriteLock(
      STORAGE_LOCKS.ACCOUNT_STORAGE,
      async () => {
        const store = await this.getTagStore()
        if (!store.tagsById[tagId]) {
          return { updatedAccounts: 0, updatedBookmarks: 0, tagDeleted: false }
        }

        const { [tagId]: _deleted, ...remaining } = store.tagsById
        await this.saveTagStore({
          version: store.version || TAG_STORE_VERSION,
          tagsById: remaining,
        })

        const accountConfig = await this.getAccountStorageConfig()
        let updatedAccounts = 0
        let updatedBookmarks = 0

        const nextAccounts: SiteAccount[] = accountConfig.accounts.map(
          (account) => {
            if (!Array.isArray(account.tagIds) || account.tagIds.length === 0) {
              return account
            }
            if (!account.tagIds.includes(tagId)) {
              return account
            }
            updatedAccounts++
            return {
              ...account,
              tagIds: account.tagIds.filter((id) => id !== tagId),
            }
          },
        )

        const nextBookmarks = (accountConfig.bookmarks || []).map(
          (bookmark) => {
            if (
              !Array.isArray(bookmark.tagIds) ||
              bookmark.tagIds.length === 0
            ) {
              return bookmark
            }
            if (!bookmark.tagIds.includes(tagId)) {
              return bookmark
            }
            updatedBookmarks++
            return {
              ...bookmark,
              tagIds: bookmark.tagIds.filter((id) => id !== tagId),
            }
          },
        )

        if (updatedAccounts > 0 || updatedBookmarks > 0) {
          await this.saveAccountStorageConfig({
            ...accountConfig,
            accounts: nextAccounts,
            bookmarks: nextBookmarks,
          })
        }

        return { updatedAccounts, updatedBookmarks, tagDeleted: true }
      },
    )

    let updatedApiCredentialProfiles = 0
    if (result.tagDeleted) {
      try {
        const profileResult =
          await apiCredentialProfilesStorage.removeTagIdFromAllProfiles(tagId)
        updatedApiCredentialProfiles = profileResult.updatedProfiles
      } catch (error) {
        logger.warn("Failed to remove tag id from API credential profiles", {
          error,
          tagId,
        })
      }
    }

    this.notifyTagStoreUpdated()
    return {
      updatedAccounts: result.updatedAccounts,
      updatedBookmarks: result.updatedBookmarks,
      updatedApiCredentialProfiles,
    }
  }

  /**
   * Runs the legacy migration:
   * - `account.tags: string[]` => global TagStore + `account.tagIds: string[]`
   *
   * This is safe to call multiple times (idempotent).
   */
  async ensureLegacyMigration(): Promise<{
    migratedAccountCount: number
    createdTagCount: number
  }> {
    const result = await ensureAccountTagsStorageMigrated(this.storage)

    if (result.migratedAccountCount > 0 || result.createdTagCount > 0) {
      this.notifyTagStoreUpdated()
    }
    return result
  }

  /**
   * Helper used by WebDAV merge flows:
   * merges two stores and remaps tag ids for all tag-referencing entities.
   */
  mergeTagStoresForSync<
    TTaggable extends { tagIds?: string[] } = { tagIds?: string[] },
  >(input: {
    localTagStore: TagStore
    remoteTagStore: TagStore
    localAccounts: SiteAccount[]
    remoteAccounts: SiteAccount[]
    localBookmarks?: AccountStorageConfig["bookmarks"]
    remoteBookmarks?: AccountStorageConfig["bookmarks"]
    localTaggables?: TTaggable[]
    remoteTaggables?: TTaggable[]
  }) {
    return mergeTagStoresAndRemapAccounts(input)
  }
}

export const tagStorage = new TagStorageService()
