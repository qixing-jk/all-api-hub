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
  lastSettingsSnapshotAt?: number
  shieldBypassSummary?: ProductAnalyticsShieldBypassSummaryState
  updatedAt?: number
}

type ProductAnalyticsPreferencePatch = Partial<ProductAnalyticsPreferenceState>

export type ProductAnalyticsShieldBypassSummaryState = {
  day?: string
  promptShownCount?: number
  promptDismissedCount?: number
  settingsVisitedCount?: number
  tempWindowFetchSuccessCount?: number
  tempWindowFetchFailureCount?: number
  tempWindowTurnstileFetchSuccessCount?: number
  tempWindowTurnstileFetchFailureCount?: number
}

export type ProductAnalyticsShieldBypassSummaryPatch = Omit<
  ProductAnalyticsShieldBypassSummaryState,
  "day"
>

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

  if (
    typeof state.lastSettingsSnapshotAt === "number" &&
    Number.isFinite(state.lastSettingsSnapshotAt)
  ) {
    normalized.lastSettingsSnapshotAt = state.lastSettingsSnapshotAt
  }

  const shieldBypassSummary = normalizeShieldBypassSummaryState(
    state.shieldBypassSummary,
  )
  if (shieldBypassSummary) {
    normalized.shieldBypassSummary = shieldBypassSummary
  }

  if (typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)) {
    normalized.updatedAt = state.updatedAt
  }

  return normalized
}

/**
 * Normalizes persisted counters to positive integer increments only.
 */
function normalizeCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  return Math.floor(value)
}

/**
 * Keeps only valid shield-bypass summary fields from persisted storage.
 */
export function normalizeShieldBypassSummaryState(
  value: unknown,
): ProductAnalyticsShieldBypassSummaryState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const state = value as ProductAnalyticsShieldBypassSummaryState
  const normalized: ProductAnalyticsShieldBypassSummaryState = {}

  if (typeof state.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(state.day)) {
    normalized.day = state.day
  }

  const countKeys = [
    "promptShownCount",
    "promptDismissedCount",
    "settingsVisitedCount",
    "tempWindowFetchSuccessCount",
    "tempWindowFetchFailureCount",
    "tempWindowTurnstileFetchSuccessCount",
    "tempWindowTurnstileFetchFailureCount",
  ] as const

  for (const key of countKeys) {
    const count = normalizeCount(state[key])
    if (typeof count === "number") {
      normalized[key] = count
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
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

  async setLastSettingsSnapshotAt(timestamp: number): Promise<boolean> {
    if (!Number.isFinite(timestamp)) {
      return false
    }

    try {
      await this.withStorageWriteLock(async () => {
        const state = await this.getState()
        await this.saveState(state, { lastSettingsSnapshotAt: timestamp })
      })
      return true
    } catch (error) {
      logger.warn("Failed to update settings snapshot timestamp", error)
      return false
    }
  }

  async getShieldBypassSummaryState(): Promise<ProductAnalyticsShieldBypassSummaryState> {
    const state = await this.getState()
    return state.shieldBypassSummary ?? {}
  }

  async replaceShieldBypassSummaryState(
    nextSummary: ProductAnalyticsShieldBypassSummaryState,
  ): Promise<boolean> {
    try {
      await this.withStorageWriteLock(async () => {
        const state = await this.getState()
        await this.saveState(state, {
          shieldBypassSummary:
            normalizeShieldBypassSummaryState(nextSummary) ?? {},
        })
      })
      return true
    } catch (error) {
      logger.warn("Failed to replace shield bypass summary state", error)
      return false
    }
  }

  async incrementShieldBypassSummary(
    patch: ProductAnalyticsShieldBypassSummaryPatch,
  ): Promise<boolean> {
    try {
      await this.withStorageWriteLock(async () => {
        const state = await this.getState()
        const today = new Date().toISOString().slice(0, 10)
        const current =
          state.shieldBypassSummary?.day === today
            ? state.shieldBypassSummary
            : { day: today }
        const nextSummary: ProductAnalyticsShieldBypassSummaryState = {
          ...current,
          day: today,
        }

        for (const [key, value] of Object.entries(patch) as Array<
          [keyof ProductAnalyticsShieldBypassSummaryPatch, number | undefined]
        >) {
          if (typeof value !== "number" || !Number.isFinite(value)) continue
          nextSummary[key] = Math.max(0, (nextSummary[key] ?? 0) + value)
        }

        await this.saveState(state, {
          shieldBypassSummary: normalizeShieldBypassSummaryState(
            nextSummary,
          ) ?? { day: today },
        })
      })
      return true
    } catch (error) {
      logger.warn("Failed to increment shield bypass summary state", error)
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
