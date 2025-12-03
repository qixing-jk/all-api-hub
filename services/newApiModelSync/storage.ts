import { Storage } from "@plasmohq/storage"

import type {
  ExecutionResult,
  NewApiModelSyncPreferences,
} from "~/types/newApiModelSync"

import { DEFAULT_PREFERENCES, userPreferences } from "../userPreferences"

/**
 * Storage keys for New API Model Sync
 */
const STORAGE_KEYS = {
  LAST_EXECUTION: "newApiModelSync_lastExecution",
  CHANNEL_UPSTREAM_MODELS_CACHE: "newApiModelSync_channelUpstreamModelsCache",
} as const

/**
 * Storage service for New API Model Sync
 */
class NewApiModelSyncStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  /**
   * Get sync preferences from userPreferences
   */
  async getPreferences(): Promise<NewApiModelSyncPreferences> {
    try {
      const prefs = await userPreferences.getPreferences()
      const config =
        prefs.newApiModelSync ?? DEFAULT_PREFERENCES.newApiModelSync!
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
      console.error("[NewApiModelSync] Failed to get preferences:", error)
      return this.getDefaultPreferences()
    }
  }

  /**
   * Save sync preferences to userPreferences
   */
  async savePreferences(
    preferences: Partial<NewApiModelSyncPreferences>,
  ): Promise<boolean> {
    try {
      const prefs = await userPreferences.getPreferences()
      const current =
        prefs.newApiModelSync ?? DEFAULT_PREFERENCES.newApiModelSync!

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

      await userPreferences.savePreferences({ newApiModelSync: updated })
      console.log("[NewApiModelSync] Preferences saved:", updated)
      return true
    } catch (error) {
      console.error("[NewApiModelSync] Failed to save preferences:", error)
      return false
    }
  }

  /**
   * Get last execution result
   */
  async getLastExecution(): Promise<ExecutionResult | null> {
    try {
      const stored = (await this.storage.get(STORAGE_KEYS.LAST_EXECUTION)) as
        | ExecutionResult
        | undefined

      return stored || null
    } catch (error) {
      console.error("[NewApiModelSync] Failed to get last execution:", error)
      return null
    }
  }

  /**
   * Save execution result
   */
  async saveLastExecution(result: ExecutionResult): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.LAST_EXECUTION, result)
      console.log("[NewApiModelSync] Execution result saved")
      return true
    } catch (error) {
      console.error("[NewApiModelSync] Failed to save execution result:", error)
      return false
    }
  }

  /**
   * Clear last execution result
   */
  async clearLastExecution(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEYS.LAST_EXECUTION)
      console.log("[NewApiModelSync] Last execution cleared")
      return true
    } catch (error) {
      console.error("[NewApiModelSync] Failed to clear last execution:", error)
      return false
    }
  }

  /**
   * Get cached channel upstream model names collected from the last sync run
   */
  async getChannelUpstreamModelOptions(): Promise<string[]> {
    try {
      const stored = (await this.storage.get(
        STORAGE_KEYS.CHANNEL_UPSTREAM_MODELS_CACHE,
      )) as string[] | undefined

      if (!stored || stored.length === 0) {
        return []
      }

      const normalized = Array.from(
        new Set(stored.map((model) => model.trim()).filter(Boolean)),
      )

      return normalized.sort((a, b) => a.localeCompare(b))
    } catch (error) {
      console.error(
        "[NewApiModelSync] Failed to get channel upstream model cache:",
        error,
      )
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
        STORAGE_KEYS.CHANNEL_UPSTREAM_MODELS_CACHE,
        normalized,
      )
      console.log(
        `[NewApiModelSync] Cached ${normalized.length} channel upstream models`,
      )
      return true
    } catch (error) {
      console.error(
        "[NewApiModelSync] Failed to save channel upstream model cache:",
        error,
      )
      return false
    }
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): NewApiModelSyncPreferences {
    const defaultConfig = DEFAULT_PREFERENCES.newApiModelSync!
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
export const newApiModelSyncStorage = new NewApiModelSyncStorage()
