import { Storage } from "@plasmohq/storage"

import type {
  ExecutionResult,
  ManagedSiteModelSyncPreferences,
} from "~/types/managedSiteModelSync"
import { createLogger } from "~/utils/logger"

import { DEFAULT_PREFERENCES, userPreferences } from "../../userPreferences"

const logger = createLogger("ManagedSiteModelSyncStorage")

/**
 * Storage keys for New API Model Sync
 */
type StorageKeyMigrationSpec = {
  canonical: string
  legacy: readonly string[]
  removeLegacyAfterMigration?: boolean
}

const STORAGE_KEY_MIGRATIONS = {
  LAST_EXECUTION: {
    canonical: "managedSiteModelSync_lastExecution",
    legacy: ["newApiModelSync_lastExecution"],
    removeLegacyAfterMigration: true,
  },
  CHANNEL_UPSTREAM_MODELS_CACHE: {
    canonical: "managedSiteModelSync_channelUpstreamModelsCache",
    legacy: ["newApiModelSync_channelUpstreamModelsCache"],
    removeLegacyAfterMigration: true,
  },
} as const satisfies Record<string, StorageKeyMigrationSpec>

/**
 * Storage service for New API Model Sync
 */
class ManagedSiteModelSyncStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  /**
   * Read a value from canonical storage key first, falling back to legacy key.
   *
   * When a legacy value is found, it will be written through to the canonical
   * key (one-time migration) to stop legacy identifiers leaking into persisted
   * IDs while staying backward compatible.
   */
  private async getWithMigration<T>(
    spec: StorageKeyMigrationSpec,
  ): Promise<T | undefined> {
    const stored = (await this.storage.get(spec.canonical)) as T | undefined
    if (stored !== undefined) {
      return stored
    }

    for (const legacyKey of spec.legacy) {
      const legacyStored = (await this.storage.get(legacyKey)) as T | undefined
      if (legacyStored === undefined) {
        continue
      }

      await this.storage.set(spec.canonical, legacyStored)
      if (spec.removeLegacyAfterMigration) {
        await this.storage.remove(legacyKey)
      }
      return legacyStored
    }

    return undefined
  }

  /**
   * Get sync preferences from userPreferences
   */
  async getPreferences(): Promise<ManagedSiteModelSyncPreferences> {
    try {
      const prefs = await userPreferences.getPreferences()
      const config =
        prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!
      return {
        enableSync: config.enabled,
        intervalMs: config.interval,
        concurrency: config.concurrency,
        maxRetries: config.maxRetries,
        rateLimit: { ...config.rateLimit },
        allowedModels: [...(config.allowedModels ?? [])],
        globalChannelModelFilters: [
          ...(config.globalChannelModelFilters ?? []),
        ],
      }
    } catch (error) {
      logger.error("Failed to get preferences", error)
      return this.getDefaultPreferences()
    }
  }

  /**
   * Save sync preferences to userPreferences
   */
  async savePreferences(
    preferences: Partial<ManagedSiteModelSyncPreferences>,
  ): Promise<boolean> {
    try {
      const prefs = await userPreferences.getPreferences()
      const current =
        prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!

      const updated = {
        enabled:
          preferences.enableSync !== undefined
            ? preferences.enableSync
            : current.enabled,
        interval:
          preferences.intervalMs !== undefined
            ? preferences.intervalMs
            : current.interval,
        concurrency:
          preferences.concurrency !== undefined
            ? preferences.concurrency
            : current.concurrency,
        maxRetries:
          preferences.maxRetries !== undefined
            ? preferences.maxRetries
            : current.maxRetries,
        rateLimit: preferences.rateLimit
          ? { ...current.rateLimit, ...preferences.rateLimit }
          : { ...current.rateLimit },
        allowedModels:
          preferences.allowedModels !== undefined
            ? [...preferences.allowedModels]
            : [...(current.allowedModels ?? [])],
        globalChannelModelFilters:
          preferences.globalChannelModelFilters !== undefined
            ? [...preferences.globalChannelModelFilters]
            : [...(current.globalChannelModelFilters ?? [])],
      }

      await userPreferences.savePreferences({ managedSiteModelSync: updated })
      logger.info("Preferences saved", {
        enabled: updated.enabled,
        intervalMs: updated.interval,
        concurrency: updated.concurrency,
        maxRetries: updated.maxRetries,
        allowedModelsCount: updated.allowedModels?.length ?? 0,
        globalChannelModelFiltersCount:
          updated.globalChannelModelFilters?.length ?? 0,
      })
      return true
    } catch (error) {
      logger.error("Failed to save preferences", error)
      return false
    }
  }

  /**
   * Get last execution result
   */
  async getLastExecution(): Promise<ExecutionResult | null> {
    try {
      const stored = await this.getWithMigration<ExecutionResult>(
        STORAGE_KEY_MIGRATIONS.LAST_EXECUTION,
      )

      return stored || null
    } catch (error) {
      logger.error("Failed to get last execution", error)
      return null
    }
  }

  /**
   * Save execution result
   */
  async saveLastExecution(result: ExecutionResult): Promise<boolean> {
    try {
      await this.storage.set(
        STORAGE_KEY_MIGRATIONS.LAST_EXECUTION.canonical,
        result,
      )
      logger.debug("Execution result saved")
      return true
    } catch (error) {
      logger.error("Failed to save execution result", error)
      return false
    }
  }

  /**
   * Clear last execution result
   */
  async clearLastExecution(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEY_MIGRATIONS.LAST_EXECUTION.canonical)
      logger.debug("Last execution cleared")
      return true
    } catch (error) {
      logger.error("Failed to clear last execution", error)
      return false
    }
  }

  /**
   * Get cached channel upstream model names collected from the last sync run
   */
  async getChannelUpstreamModelOptions(): Promise<string[]> {
    try {
      const stored = await this.getWithMigration<string[]>(
        STORAGE_KEY_MIGRATIONS.CHANNEL_UPSTREAM_MODELS_CACHE,
      )

      if (!stored || stored.length === 0) {
        return []
      }

      const normalized = Array.from(
        new Set(stored.map((model) => model.trim()).filter(Boolean)),
      )

      return normalized.sort((a, b) => a.localeCompare(b))
    } catch (error) {
      logger.error("Failed to get channel upstream model cache", error)
      return []
    }
  }

  /**
   * Persist channel upstream model names cache after sync
   */
  async saveChannelUpstreamModelOptions(models: string[]): Promise<boolean> {
    try {
      const normalized = Array.from(
        new Set(models.map((model) => model.trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b))

      await this.storage.set(
        STORAGE_KEY_MIGRATIONS.CHANNEL_UPSTREAM_MODELS_CACHE.canonical,
        normalized,
      )
      logger.info("Cached channel upstream models", {
        count: normalized.length,
      })
      return true
    } catch (error) {
      logger.error("Failed to save channel upstream model cache", error)
      return false
    }
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): ManagedSiteModelSyncPreferences {
    const defaultConfig = DEFAULT_PREFERENCES.managedSiteModelSync!
    return {
      enableSync: defaultConfig.enabled,
      intervalMs: defaultConfig.interval,
      concurrency: defaultConfig.concurrency,
      maxRetries: defaultConfig.maxRetries,
      rateLimit: { ...defaultConfig.rateLimit },
      allowedModels: [...(defaultConfig.allowedModels ?? [])],
      globalChannelModelFilters: [
        ...(defaultConfig.globalChannelModelFilters ?? []),
      ],
    }
  }
}

// Create singleton instance
export const managedSiteModelSyncStorage = new ManagedSiteModelSyncStorage()
