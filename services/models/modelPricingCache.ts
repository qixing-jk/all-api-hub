import { Storage } from "@plasmohq/storage"

import type { PricingResponse } from "~/services/apiService/common/type"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to persisted model-pricing cache operations.
 */
const logger = createLogger("ModelPricingCache")

const STORAGE_KEYS = {
  PRICING_CACHE: "modelPricing_cache_v1",
} as const

export const MODEL_PRICING_CACHE_TTL_MS = 10 * 60 * 1000

interface CachedPricingEntry {
  pricing: PricingResponse
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

  private getAccountKey(accountId: string) {
    return accountId
  }

  async get(accountId: string): Promise<PricingResponse | null> {
    try {
      const cache =
        (await this.storage.get<PricingCacheMap>(STORAGE_KEYS.PRICING_CACHE)) ||
        {}
      const entry = cache[this.getAccountKey(accountId)]
      if (!entry) return null

      if (Date.now() - entry.lastUpdated > MODEL_PRICING_CACHE_TTL_MS) {
        return null
      }
      return entry.pricing
    } catch (error) {
      logger.error("Failed to get cache", error)
      return null
    }
  }

  async set(accountId: string, pricing: PricingResponse): Promise<void> {
    try {
      const cache =
        (await this.storage.get<PricingCacheMap>(STORAGE_KEYS.PRICING_CACHE)) ||
        {}

      cache[this.getAccountKey(accountId)] = {
        pricing,
        lastUpdated: Date.now(),
      }

      await this.storage.set(STORAGE_KEYS.PRICING_CACHE, cache)
    } catch (error) {
      logger.error("Failed to set cache", error)
    }
  }

  async invalidate(accountId: string): Promise<void> {
    try {
      const cache =
        (await this.storage.get<PricingCacheMap>(STORAGE_KEYS.PRICING_CACHE)) ||
        {}
      delete cache[this.getAccountKey(accountId)]
      await this.storage.set(STORAGE_KEYS.PRICING_CACHE, cache)
    } catch (error) {
      logger.error("Failed to invalidate cache", error)
    }
  }
}

export const modelPricingCache = new ModelPricingCacheService()
