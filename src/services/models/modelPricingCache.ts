import { Storage } from "@plasmohq/storage"

import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to persisted model-pricing cache operations.
 */
const logger = createLogger("ModelPricingCache")

const STORAGE_KEYS = {
  PRICING_CACHE: "modelCatalog_cache_v1",
} as const

export const MODEL_PRICING_CACHE_TTL_MS = 10 * 60 * 1000

interface CachedPricingEntry {
  pricing: ModelCatalogSnapshot
  lastUpdated: number
}

type PricingCacheMap = Record<string, CachedPricingEntry>

class ModelPricingCacheService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  async get(
    cacheKey: string,
    ttlMs: number = MODEL_PRICING_CACHE_TTL_MS,
  ): Promise<ModelCatalogSnapshot | null> {
    try {
      const cache =
        (await this.storage.get<PricingCacheMap>(STORAGE_KEYS.PRICING_CACHE)) ||
        {}
      const entry = cache[cacheKey]
      if (!entry) return null

      if (Date.now() - entry.lastUpdated > ttlMs) {
        return null
      }
      return entry.pricing
    } catch (error) {
      logger.error("Failed to get cache", error)
      return null
    }
  }

  async set(cacheKey: string, pricing: ModelCatalogSnapshot): Promise<void> {
    try {
      const cache =
        (await this.storage.get<PricingCacheMap>(STORAGE_KEYS.PRICING_CACHE)) ||
        {}

      cache[cacheKey] = {
        pricing,
        lastUpdated: Date.now(),
      }

      await this.storage.set(STORAGE_KEYS.PRICING_CACHE, cache)
    } catch (error) {
      logger.error("Failed to set cache", error)
    }
  }

  async invalidate(cacheKey: string): Promise<void> {
    try {
      const cache =
        (await this.storage.get<PricingCacheMap>(STORAGE_KEYS.PRICING_CACHE)) ||
        {}
      delete cache[cacheKey]
      await this.storage.set(STORAGE_KEYS.PRICING_CACHE, cache)
    } catch (error) {
      logger.error("Failed to invalidate cache", error)
    }
  }
}

export const modelPricingCache = new ModelPricingCacheService()
