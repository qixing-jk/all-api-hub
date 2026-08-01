import { Storage } from "@plasmohq/storage"

import {
  PRODUCT_ANALYTICS_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"

import { PRODUCT_ANALYTICS_PROTECTION_BYPASS_DIMENSIONS } from "./contracts"

const logger = createLogger("ProductAnalyticsState")

interface ProductAnalyticsState {
  lastSiteEcosystemSnapshotAt?: number
  lastSettingsSnapshotAt?: number
  shieldBypassSummary?: ProductAnalyticsShieldBypassSummaryState
  sponsorRecommendationsSummary?: ProductAnalyticsSponsorRecommendationsSummaryState
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
  featureCounts?: ProductAnalyticsProtectionBypassCounter<"featureCounts">
  invocationKindCounts?: ProductAnalyticsProtectionBypassCounter<"invocationKindCounts">
  automaticTriggerCounts?: ProductAnalyticsProtectionBypassCounter<"automaticTriggerCounts">
  operationCounts?: ProductAnalyticsProtectionBypassCounter<"operationCounts">
  decisionCounts?: ProductAnalyticsProtectionBypassCounter<"decisionCounts">
  denialReasonCounts?: ProductAnalyticsProtectionBypassCounter<"denialReasonCounts">
  adapterCounts?: ProductAnalyticsProtectionBypassCounter<"adapterCounts">
}

type ProductAnalyticsProtectionBypassDimension =
  keyof typeof PRODUCT_ANALYTICS_PROTECTION_BYPASS_DIMENSIONS

type ProductAnalyticsProtectionBypassCounter<
  Dimension extends ProductAnalyticsProtectionBypassDimension,
> = Partial<
  Record<
    (typeof PRODUCT_ANALYTICS_PROTECTION_BYPASS_DIMENSIONS)[Dimension][number],
    number
  >
>

export type ProductAnalyticsShieldBypassSummaryPatch = Omit<
  ProductAnalyticsShieldBypassSummaryState,
  "day"
>

export type ProductAnalyticsSponsorRecommendationsSummaryState = {
  day?: string
  impressionCount?: number
  itemTotal?: number
  supportedItemTotal?: number
  unsupportedItemTotal?: number
  addAccountSurfaceCount?: number
  newcomerSurfaceCount?: number
}

export type ProductAnalyticsSponsorRecommendationsSummaryPatch = Omit<
  ProductAnalyticsSponsorRecommendationsSummaryState,
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

/** Folds persisted keys into a fixed enum-sized map plus one overflow bucket. */
function normalizeControlledCounter(
  value: unknown,
  allowedValues: readonly string[],
): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const allowed = new Set(allowedValues)
  const normalized: Record<string, number> = {}
  for (const [rawKey, rawCount] of Object.entries(value)) {
    const count = normalizeCount(rawCount)
    if (count === undefined) continue
    const key = allowed.has(rawKey) ? rawKey : "other"
    normalized[key] = (normalized[key] ?? 0) + count
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
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
  const mutableNormalized = normalized as Record<string, unknown>

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

  for (const [key, allowedValues] of Object.entries(
    PRODUCT_ANALYTICS_PROTECTION_BYPASS_DIMENSIONS,
  ) as Array<[ProductAnalyticsProtectionBypassDimension, readonly string[]]>) {
    const counts = normalizeControlledCounter(state[key], allowedValues)
    if (counts) {
      mutableNormalized[key] = counts
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

/**
 * Keeps only valid sponsor recommendation daily summary fields from storage.
 */
export function normalizeSponsorRecommendationsSummaryState(
  value: unknown,
): ProductAnalyticsSponsorRecommendationsSummaryState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const state = value as ProductAnalyticsSponsorRecommendationsSummaryState
  const normalized: ProductAnalyticsSponsorRecommendationsSummaryState = {}

  if (typeof state.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(state.day)) {
    normalized.day = state.day
  }

  const countKeys = [
    "impressionCount",
    "itemTotal",
    "supportedItemTotal",
    "unsupportedItemTotal",
    "addAccountSurfaceCount",
    "newcomerSurfaceCount",
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

  const sponsorRecommendationsSummary =
    normalizeSponsorRecommendationsSummaryState(
      state.sponsorRecommendationsSummary,
    )
  if (sponsorRecommendationsSummary) {
    normalized.sponsorRecommendationsSummary = sponsorRecommendationsSummary
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
        const mutableNextSummary = nextSummary as Record<string, unknown>

        const numericPatch = { ...patch } as Record<string, unknown>
        for (const key of Object.keys(
          PRODUCT_ANALYTICS_PROTECTION_BYPASS_DIMENSIONS,
        )) {
          delete numericPatch[key]
        }
        for (const [key, value] of Object.entries(numericPatch) as Array<
          [keyof ProductAnalyticsShieldBypassSummaryPatch, unknown]
        >) {
          if (typeof value !== "number" || !Number.isFinite(value)) continue
          mutableNextSummary[key] = Math.max(
            0,
            ((mutableNextSummary[key] as number) ?? 0) + value,
          )
        }

        for (const [key, allowedValues] of Object.entries(
          PRODUCT_ANALYTICS_PROTECTION_BYPASS_DIMENSIONS,
        ) as Array<
          [ProductAnalyticsProtectionBypassDimension, readonly string[]]
        >) {
          const increments = normalizeControlledCounter(
            patch[key],
            allowedValues,
          )
          if (!increments) continue
          const merged = {
            ...((nextSummary[key] as Record<string, number> | undefined) ?? {}),
          }
          for (const [bucket, count] of Object.entries(increments)) {
            merged[bucket] = (merged[bucket] ?? 0) + count
          }
          mutableNextSummary[key] = merged
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

  async getSponsorRecommendationsSummaryState(): Promise<ProductAnalyticsSponsorRecommendationsSummaryState> {
    const state = await this.getState()
    return state.sponsorRecommendationsSummary ?? {}
  }

  async replaceSponsorRecommendationsSummaryState(
    nextSummary: ProductAnalyticsSponsorRecommendationsSummaryState,
  ): Promise<boolean> {
    try {
      await this.withStorageWriteLock(async () => {
        await this.saveState({
          sponsorRecommendationsSummary:
            normalizeSponsorRecommendationsSummaryState(nextSummary) ?? {},
        })
      })
      return true
    } catch (error) {
      logger.warn("Failed to replace sponsor recommendations summary", error)
      return false
    }
  }

  async incrementSponsorRecommendationsSummary(
    patch: ProductAnalyticsSponsorRecommendationsSummaryPatch,
  ): Promise<boolean> {
    try {
      await this.withStorageWriteLock(async () => {
        const state = await this.getState()
        const today = new Date().toISOString().slice(0, 10)
        const current =
          state.sponsorRecommendationsSummary?.day === today
            ? state.sponsorRecommendationsSummary
            : { day: today }
        const nextSummary: ProductAnalyticsSponsorRecommendationsSummaryState =
          {
            ...current,
            day: today,
          }

        for (const [key, value] of Object.entries(patch) as Array<
          [
            keyof ProductAnalyticsSponsorRecommendationsSummaryPatch,
            number | undefined,
          ]
        >) {
          if (typeof value !== "number" || !Number.isFinite(value)) continue
          nextSummary[key] = Math.max(0, (nextSummary[key] ?? 0) + value)
        }

        await this.saveState({
          sponsorRecommendationsSummary:
            normalizeSponsorRecommendationsSummaryState(nextSummary) ?? {
              day: today,
            },
        })
      })
      return true
    } catch (error) {
      logger.warn("Failed to increment sponsor recommendations summary", error)
      return false
    }
  }
}

export const productAnalyticsState = new ProductAnalyticsStateService()
