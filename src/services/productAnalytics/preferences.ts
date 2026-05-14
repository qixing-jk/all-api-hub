import { Storage } from "@plasmohq/storage"

import {
  PRODUCT_ANALYTICS_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProductAnalyticsPreferences")

export const PRODUCT_ANALYTICS_DEFAULT_ENABLED = true

interface ProductAnalyticsPreferenceState {
  enabled?: boolean
  anonymousId?: string
  lastSiteEcosystemSnapshotAt?: number
  updatedAt?: number
}

type ProductAnalyticsPreferencePatch = Partial<ProductAnalyticsPreferenceState>

/**
 * Keeps only supported preference fields from persisted storage payloads.
 */
export function normalizeState(
  value: unknown,
): ProductAnalyticsPreferenceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const state = value as Partial<ProductAnalyticsPreferenceState>
  const normalized: ProductAnalyticsPreferenceState = {}

  if (typeof state.enabled === "boolean") {
    normalized.enabled = state.enabled
  }

  const anonymousId =
    typeof state.anonymousId === "string" ? state.anonymousId.trim() : ""
  if (anonymousId) {
    normalized.anonymousId = anonymousId
  }

  if (
    typeof state.lastSiteEcosystemSnapshotAt === "number" &&
    Number.isFinite(state.lastSiteEcosystemSnapshotAt)
  ) {
    normalized.lastSiteEcosystemSnapshotAt = state.lastSiteEcosystemSnapshotAt
  }

  if (typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)) {
    normalized.updatedAt = state.updatedAt
  }

  return normalized
}

class ProductAnalyticsPreferencesService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(STORAGE_LOCKS.PRODUCT_ANALYTICS, work)
  }

  private async saveState(
    state: ProductAnalyticsPreferenceState,
    patch: ProductAnalyticsPreferencePatch,
  ): Promise<void> {
    await this.storage.set(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
      {
        ...state,
        ...patch,
        updatedAt: Date.now(),
      },
    )
  }

  async getState(): Promise<ProductAnalyticsPreferenceState> {
    try {
      const stored = await this.storage.get(
        PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
      )
      return normalizeState(stored)
    } catch (error) {
      logger.warn("Failed to read product analytics preferences", error)
      return {}
    }
  }

  async isEnabled(): Promise<boolean> {
    const state = await this.getState()
    return state.enabled ?? PRODUCT_ANALYTICS_DEFAULT_ENABLED
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    try {
      await this.withStorageWriteLock(async () => {
        const state = await this.getState()
        await this.saveState(state, { enabled })
      })
      return true
    } catch (error) {
      logger.error(
        "Failed to update product analytics enabled preference",
        error,
      )
      return false
    }
  }

  async getOrCreateAnonymousId(): Promise<string> {
    return await this.withStorageWriteLock(async () => {
      const state = await this.getState()
      return await this.getOrCreateAnonymousIdFromState(state)
    })
  }

  async getAnonymousIdIfEnabled(): Promise<string | null> {
    return await this.withStorageWriteLock(async () => {
      const state = await this.getState()
      if (!(state.enabled ?? PRODUCT_ANALYTICS_DEFAULT_ENABLED)) {
        return null
      }
      return await this.getOrCreateAnonymousIdFromState(state)
    })
  }

  async withAnonymousIdIfEnabled<T>(
    work: (anonymousId: string) => Promise<T>,
  ): Promise<T | null> {
    return await this.withStorageWriteLock(async () => {
      const state = await this.getState()
      if (!(state.enabled ?? PRODUCT_ANALYTICS_DEFAULT_ENABLED)) {
        return null
      }

      const anonymousId = await this.getOrCreateAnonymousIdFromState(state)
      return await work(anonymousId)
    })
  }

  async setLastSiteEcosystemSnapshotAt(timestamp: number): Promise<boolean> {
    if (!Number.isFinite(timestamp)) {
      return false
    }

    try {
      await this.withStorageWriteLock(async () => {
        const state = await this.getState()
        await this.saveState(state, { lastSiteEcosystemSnapshotAt: timestamp })
      })
      return true
    } catch (error) {
      logger.warn("Failed to update site ecosystem snapshot timestamp", error)
      return false
    }
  }

  private async getOrCreateAnonymousIdFromState(
    state: ProductAnalyticsPreferenceState,
  ): Promise<string> {
    if (state.anonymousId) {
      return state.anonymousId
    }

    const anonymousId = safeRandomUUID("analytics")
    await this.saveState(state, { anonymousId })

    return anonymousId
  }
}

export const productAnalyticsPreferences =
  new ProductAnalyticsPreferencesService()
