import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

import type {
  ProductAnnouncementState,
  RawProductAnnouncementFeed,
} from "./types"

const logger = createLogger("ProductAnnouncementStorage")
const PRODUCT_ANNOUNCEMENT_STATE_SCHEMA_VERSION = 1 as const

/**
 * Creates an empty product announcement state with the current schema version.
 */
function createEmptyState(): ProductAnnouncementState {
  return {
    schemaVersion: PRODUCT_ANNOUNCEMENT_STATE_SCHEMA_VERSION,
    dismissed: {},
    seenAt: {},
    lastShownAt: {},
  }
}

/**
 * Keeps only string-to-number record entries from persisted state maps.
 */
function sanitizeNumberRecord(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) {
    return {}
  }

  const sanitized: Record<string, number> = {}
  for (const [key, recordValue] of Object.entries(value)) {
    const trimmedKey = key.trim()
    if (
      trimmedKey &&
      typeof recordValue === "number" &&
      Number.isFinite(recordValue)
    ) {
      sanitized[trimmedKey] = recordValue
    }
  }

  return sanitized
}

/**
 * Validates persisted state and drops data from incompatible schemas.
 */
function sanitizeState(value: unknown): ProductAnnouncementState {
  if (
    !isPlainObject(value) ||
    value.schemaVersion !== PRODUCT_ANNOUNCEMENT_STATE_SCHEMA_VERSION
  ) {
    return createEmptyState()
  }

  const state: ProductAnnouncementState = {
    schemaVersion: PRODUCT_ANNOUNCEMENT_STATE_SCHEMA_VERSION,
    dismissed: sanitizeNumberRecord(value.dismissed),
    seenAt: sanitizeNumberRecord(value.seenAt),
    lastShownAt: sanitizeNumberRecord(value.lastShownAt),
  }

  if (
    typeof value.lastFetchedAt === "number" &&
    Number.isFinite(value.lastFetchedAt)
  ) {
    state.lastFetchedAt = value.lastFetchedAt
  }

  if (isPlainObject(value.cachedFeed)) {
    state.cachedFeed = value.cachedFeed as RawProductAnnouncementFeed
  }

  return state
}

class ProductAnnouncementStorage {
  private storage = new Storage({ area: "local" })

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.PRODUCT_ANNOUNCEMENTS,
      work,
    )
  }

  async getState(): Promise<ProductAnnouncementState> {
    try {
      const stored = await this.storage.get(
        STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE,
      )
      return sanitizeState(stored)
    } catch (error) {
      logger.warn("Failed to load product announcement state", error)
      return createEmptyState()
    }
  }

  async setState(state: ProductAnnouncementState): Promise<void> {
    await this.storage.set(STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE, state)
  }

  async updateState(
    updater: (
      state: ProductAnnouncementState,
    ) => ProductAnnouncementState | void,
  ): Promise<ProductAnnouncementState> {
    return this.withStorageWriteLock(async () => {
      const current = await this.getState()
      const updated = updater(current) ?? current
      await this.setState(updated)
      return updated
    })
  }
}

export const productAnnouncementStorage = new ProductAnnouncementStorage()
