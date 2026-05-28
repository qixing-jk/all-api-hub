import { Storage } from "@plasmohq/storage"

import {
  PRODUCT_ANALYTICS_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProductAnalyticsState")

interface ProductAnalyticsState {
  lastSiteEcosystemSnapshotAt?: number
  lastSettingsSnapshotAt?: number
  shieldBypassSummary?: ProductAnalyticsShieldBypassSummaryState
}

type ProductAnalyticsStatePatch = Partial<ProductAnalyticsState>

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

/**
 * Keeps only analytics runtime state from persisted analytics state payloads.
 */
export function normalizeProductAnalyticsState(
  value: unknown,
): ProductAnalyticsState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const state = value as Partial<ProductAnalyticsState>
  const normalized: ProductAnalyticsState = {}

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

  return normalized
}

class ProductAnalyticsStateService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(STORAGE_LOCKS.PRODUCT_ANALYTICS, work)
  }

  private async saveState(patch: ProductAnalyticsStatePatch): Promise<void> {
    const stored = await this.storage.get(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE,
    )
    await this.storage.set(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE,
      {
        ...(stored && typeof stored === "object" && !Array.isArray(stored)
          ? stored
          : {}),
        ...patch,
        updatedAt: Date.now(),
      },
    )
  }

  async getState(): Promise<ProductAnalyticsState> {
    try {
      const stored = await this.storage.get(
        PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE,
      )
      return normalizeProductAnalyticsState(stored)
    } catch (error) {
      logger.warn("Failed to read product analytics state", error)
      return {}
    }
  }

  async setLastSiteEcosystemSnapshotAt(timestamp: number): Promise<boolean> {
    if (!Number.isFinite(timestamp)) {
      return false
    }

    try {
      await this.withStorageWriteLock(async () => {
        await this.saveState({ lastSiteEcosystemSnapshotAt: timestamp })
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
        await this.saveState({ lastSettingsSnapshotAt: timestamp })
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
        await this.saveState({
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

        await this.saveState({
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
}

export const productAnalyticsState = new ProductAnalyticsStateService()
