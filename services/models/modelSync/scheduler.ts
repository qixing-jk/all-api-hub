import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { OCTOPUS } from "~/constants/siteType"
import * as octopusApi from "~/services/apiService/octopus"
import { ModelRedirectService } from "~/services/models/modelRedirect"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type {
  ManagedSiteChannel,
  ManagedSiteChannelListData,
} from "~/types/managedSite"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
} from "~/types/managedSiteModelRedirect"
import {
  ExecutionProgress,
  ExecutionResult,
} from "~/types/managedSiteModelSync"
import type { OctopusConfig } from "~/types/octopusConfig"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import {
  getManagedSiteAdminConfig,
  getManagedSiteConfig,
  getManagedSiteContext,
} from "~/utils/managedSite"

import { channelConfigStorage } from "../../channelConfigStorage"
import { octopusChannelToManagedSite } from "../../managedSites/providers/octopus"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "../../preferences/userPreferences"
import { collectModelsFromExecution } from "./modelCollection"
import { ModelSyncService } from "./modelSyncService"
import { runOctopusBatch } from "./octopusModelSync"
import { managedSiteModelSyncStorage } from "./storage"

const logger = createLogger("ManagedSiteModelSync")

/**
 * Scheduler for New API Model Sync.
 * Responsibilities:
 * - Sets up alarms to run sync on a fixed cadence (when alarms API is available).
 * - Orchestrates execution with user preferences (interval, concurrency, retries).
 * - Applies model redirect mappings immediately after successful channel syncs.
 */
class ModelSyncScheduler {
  static readonly ALARM_NAME = "managedSiteModelSync"
  private isInitialized = false
  private currentProgress: ExecutionProgress | null = null

  /**
   * Build a ModelSyncService instance using persisted preferences and channel configs.
   * @throws {Error} When New API config is missing.
   */
  private async createService(): Promise<ModelSyncService> {
    const userPrefs = await userPreferences.getPreferences()

    const { siteType, messagesKey } = getManagedSiteContext(userPrefs)
    const managedConfig = getManagedSiteAdminConfig(userPrefs)

    if (!managedConfig) {
      throw new Error(t(`messages:${messagesKey}.configMissing`))
    }

    const { baseUrl, adminToken, userId } = managedConfig

    const config =
      userPrefs.managedSiteModelSync ??
      DEFAULT_PREFERENCES.managedSiteModelSync!

    const channelConfigs = await channelConfigStorage.getAllConfigs()

    return new ModelSyncService(
      baseUrl,
      adminToken,
      userId,
      config.rateLimit,
      config.allowedModels,
      channelConfigs,
      config.globalChannelModelFilters,
      siteType,
    )
  }

  /**
   * Initialize the scheduler (idempotent).
   * Registers alarm listeners and schedules the first alarm if supported.
   */
  async initialize() {
    if (this.isInitialized) {
      logger.debug("Scheduler already initialized")
      return
    }

    try {
      // Set up alarm listener using browserApi (if supported)
      if (hasAlarmsAPI()) {
        onAlarm(async (alarm) => {
          if (alarm.name === ModelSyncScheduler.ALARM_NAME) {
            try {
              // Await to keep the MV3 service worker alive while the sync runs.
              await this.executeSync()
            } catch (error) {
              logger.error("Scheduled execution failed", error)
            }
          }
        })

        // Setup initial alarm based on preferences
        await this.setupAlarm()
      } else {
        logger.warn("Alarms API not available, automatic sync disabled")
      }

      this.isInitialized = true
      logger.info("Scheduler initialized")
    } catch (error) {
      logger.error("Failed to initialize scheduler", error)
    }
  }

  /**
   * Setup or update the alarm based on current preferences.
   * Preserves an existing matching alarm to avoid re-scheduling on background
   * restarts or unrelated settings updates, only recreating when missing or when
   * the interval changes.
   *
   * Respects modelSync.enabled/interval; no-op if alarms API unavailable.
   */
  async setupAlarm() {
    // Check if alarms API is supported
    if (!hasAlarmsAPI()) {
      logger.warn("Alarms API not supported, auto-sync disabled")
      return
    }

    const prefs = await userPreferences.getPreferences()
    const config =
      prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!

    if (!config.enabled) {
      await clearAlarm(ModelSyncScheduler.ALARM_NAME)
      logger.info("Auto-sync disabled; alarm cleared")
      return
    }

    const intervalMs = config.interval
    const intervalInMinutes = Math.max(intervalMs / 1000 / 60, 1)

    try {
      const existingAlarm = await getAlarm(ModelSyncScheduler.ALARM_NAME)
      const existingPeriodInMinutes = existingAlarm?.periodInMinutes

      if (
        existingAlarm &&
        existingPeriodInMinutes != null &&
        Math.abs(existingPeriodInMinutes - intervalInMinutes) < 0.001
      ) {
        logger.debug("Alarm already exists; preserving", {
          name: existingAlarm.name,
          scheduledTime: existingAlarm.scheduledTime
            ? new Date(existingAlarm.scheduledTime)
            : null,
          periodInMinutes: existingPeriodInMinutes,
        })
        return
      }

      await clearAlarm(ModelSyncScheduler.ALARM_NAME)
      await createAlarm(ModelSyncScheduler.ALARM_NAME, {
        delayInMinutes: intervalInMinutes, // Initial delay
        periodInMinutes: intervalInMinutes, // Repeat interval
      })

      // Verify alarm was created
      const alarm = await getAlarm(ModelSyncScheduler.ALARM_NAME)
      if (alarm) {
        logger.info("Alarm set successfully", {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime
            ? new Date(alarm.scheduledTime)
            : null,
          periodInMinutes: alarm.periodInMinutes,
        })
      } else {
        logger.warn("Alarm was not created properly")
      }
    } catch (error) {
      logger.error("Failed to create alarm", error)
    }
  }

  async listChannels(): Promise<ManagedSiteChannelListData> {
    const userPrefs = await userPreferences.getPreferences()
    const { siteType, messagesKey } = getManagedSiteContext(userPrefs)

    // Octopus 使用独立的 API 服务
    if (siteType === OCTOPUS) {
      const { config } = getManagedSiteConfig(userPrefs)
      const octopusConfig = config as OctopusConfig

      // Validate config like createService does
      if (
        !octopusConfig?.baseUrl ||
        !octopusConfig?.username ||
        !octopusConfig?.password
      ) {
        throw new Error(t(`messages:${messagesKey}.configMissing`))
      }

      const channels = await octopusApi.listChannels(octopusConfig)
      return {
        items: channels.map(octopusChannelToManagedSite),
        total: channels.length,
        type_counts: {},
      }
    }

    const service = await this.createService()
    return service.listChannels()
  }

  /**
   * Execute model sync for all channels (or a filtered subset).
   * Also generates model redirect mappings immediately after successful channel syncs.
   * @param channelIds Optional subset of channel IDs to sync; defaults to all.
   * @returns ExecutionResult with per-channel outcomes and statistics.
   */
  async executeSync(channelIds?: number[]): Promise<ExecutionResult> {
    logger.info("Starting execution")

    // Get preferences from userPreferences
    const prefs = await userPreferences.getPreferences()
    const { siteType, messagesKey } = getManagedSiteContext(prefs)

    const config =
      prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!
    const concurrency = Math.max(1, config.concurrency)
    const { maxRetries } = config

    // Octopus 使用独立的模型同步逻辑
    if (siteType === OCTOPUS) {
      return this.executeSyncForOctopus(
        channelIds,
        prefs,
        messagesKey,
        concurrency,
        maxRetries,
      )
    }

    // Initialize service (for non-Octopus sites)
    const service = await this.createService()

    // List channels
    const channelListResponse = await service.listChannels()
    const allChannels = channelListResponse.items

    // Filter channels if specific IDs provided
    let channels: ManagedSiteChannel[]
    if (channelIds && channelIds.length > 0) {
      channels = allChannels.filter((c) => channelIds.includes(c.id))
    } else {
      channels = allChannels
    }

    if (channels.length === 0) {
      throw new Error(t(`messages:${messagesKey}.noChannelsToSync`))
    }

    // Placeholder for model redirect config, will generate after sync if enabled
    const modelRedirectConfig =
      prefs.modelRedirect ?? DEFAULT_MODEL_REDIRECT_PREFERENCES
    const standardModels =
      modelRedirectConfig.standardModels.length > 0
        ? modelRedirectConfig.standardModels
        : ALL_PRESET_STANDARD_MODELS

    // Update progress
    this.currentProgress = {
      isRunning: true,
      total: channels.length,
      completed: 0,
      failed: 0,
    }

    let failureCount = 0
    let mappingSuccessCount = 0
    let mappingErrorCount = 0

    let result
    try {
      // Execute batch sync
      result = await service.runBatch(channels, {
        concurrency,
        maxRetries,
        onProgress: async (payload) => {
          if (!payload.lastResult.ok) {
            failureCount += 1
          } else {
            // Generate and apply model redirect mapping immediately after successful sync
            if (modelRedirectConfig.enabled && standardModels.length > 0) {
              try {
                // Find the channel that was just synced
                const channel = allChannels.find(
                  (c) => c.id === payload.lastResult.channelId,
                )
                if (!channel) {
                  logger.warn("Channel not found", {
                    channelId: payload.lastResult.channelId,
                  })
                } else {
                  const actualModels = payload.lastResult.newModels || []

                  const oldModelsSet = new Set(
                    (payload.lastResult.oldModels ?? [])
                      .map((model) => model.trim())
                      .filter(Boolean),
                  )
                  const newModelsSet = new Set(
                    (payload.lastResult.newModels ?? [])
                      .map((model) => model.trim())
                      .filter(Boolean),
                  )
                  const modelsChanged =
                    oldModelsSet.size !== newModelsSet.size ||
                    Array.from(oldModelsSet).some(
                      (model) => !newModelsSet.has(model),
                    )

                  const newMapping =
                    ModelRedirectService.generateModelMappingForChannel(
                      standardModels,
                      actualModels,
                    )

                  // Use unified method for incremental merge and apply
                  const shouldPruneMissingTargetsOnSync =
                    modelRedirectConfig.pruneMissingTargetsOnModelSync &&
                    modelsChanged &&
                    newModelsSet.size > 0

                  const { prunedCount, updated } =
                    await ModelRedirectService.applyModelMappingToChannel(
                      channel,
                      newMapping,
                      service,
                      shouldPruneMissingTargetsOnSync
                        ? {
                            pruneMissingTargets: true,
                            availableModels: actualModels,
                            siteType,
                          }
                        : undefined,
                    )
                  mappingSuccessCount++
                  logger.info("Applied model redirects to channel", {
                    channelId: channel.id,
                    channelName: channel.name,
                    mappingCount: Object.keys(newMapping).length,
                    modelsChanged,
                    pruneMissingTargetsOnModelSync:
                      shouldPruneMissingTargetsOnSync,
                    prunedCount,
                    updated,
                  })
                }
              } catch (error) {
                logger.error("Failed to apply mapping for channel", {
                  channelId: payload.lastResult.channelId,
                  channelName: payload.lastResult.channelName,
                  error,
                })
                mappingErrorCount++
              }
            }
          }

          if (this.currentProgress) {
            this.currentProgress.completed = payload.completed
            this.currentProgress.lastResult = payload.lastResult
            this.currentProgress.currentChannel = payload.lastResult.channelName
            this.currentProgress.failed = failureCount
          }
          this.notifyProgress()
        },
      })

      // Save execution result
      await managedSiteModelSyncStorage.saveLastExecution(result)

      // Cache upstream model options for allow-list selection, only if full sync
      if (!channelIds) {
        const collectedModels = collectModelsFromExecution(result)
        if (collectedModels.length > 0) {
          await managedSiteModelSyncStorage.saveChannelUpstreamModelOptions(
            collectedModels,
          )
        }
      }

      logger.info("Execution completed", {
        successCount: result.statistics.successCount,
        total: result.statistics.total,
      })

      // Log model redirect mapping results
      if (modelRedirectConfig.enabled && standardModels.length > 0) {
        logger.info("Model redirect mappings applied", {
          succeeded: mappingSuccessCount,
          failed: mappingErrorCount,
        })
      }

      return result
    } finally {
      // Clear progress
      this.currentProgress = null
      this.notifyProgress()
    }
  }

  /**
   * Execute model sync for Octopus site.
   * Octopus uses a different API structure for fetching and updating models.
   *
   * NOTE: This Octopus-specific sync path intentionally omits ModelRedirectService
   * mappings (unlike executeSync for New API/Veloera). This is because:
   * 1. runOctopusBatch / octopusApi.updateChannel only update the model list directly
   * 2. Octopus channels initialize model_mapping as an empty string
   * 3. Redirect logic is not applicable to Octopus's channel architecture
   *
   * If redirect behavior is ever required for Octopus, refer to ModelRedirectService
   * and the executeSync method for the pattern used by New API/Veloera channels.
   */
  private async executeSyncForOctopus(
    channelIds: number[] | undefined,
    prefs: Awaited<ReturnType<typeof userPreferences.getPreferences>>,
    messagesKey: string,
    concurrency: number,
    maxRetries: number,
  ): Promise<ExecutionResult> {
    const { config } = getManagedSiteConfig(prefs)
    const octopusConfig = config as OctopusConfig

    // Validate config like createService does
    if (
      !octopusConfig?.baseUrl ||
      !octopusConfig?.username ||
      !octopusConfig?.password
    ) {
      throw new Error(t(`messages:${messagesKey}.configMissing`))
    }

    // List channels using Octopus API
    const octopusChannels = await octopusApi.listChannels(octopusConfig)
    const allChannels = octopusChannels.map(octopusChannelToManagedSite)

    // Filter channels if specific IDs provided
    let channels: ManagedSiteChannel[]
    if (channelIds && channelIds.length > 0) {
      channels = allChannels.filter((c) => channelIds.includes(c.id))
    } else {
      channels = allChannels
    }

    if (channels.length === 0) {
      throw new Error(t(`messages:${messagesKey}.noChannelsToSync`))
    }

    // Update progress
    this.currentProgress = {
      isRunning: true,
      total: channels.length,
      completed: 0,
      failed: 0,
    }

    let failureCount = 0

    let result
    try {
      // Execute batch sync using Octopus-specific implementation
      result = await runOctopusBatch(octopusConfig, channels, {
        concurrency,
        maxRetries,
        onProgress: async (payload) => {
          if (!payload.lastResult.ok) {
            failureCount += 1
          }

          if (this.currentProgress) {
            this.currentProgress.completed = payload.completed
            this.currentProgress.lastResult = payload.lastResult
            this.currentProgress.currentChannel = payload.lastResult.channelName
            this.currentProgress.failed = failureCount
          }
          this.notifyProgress()
        },
      })

      // Save execution result
      await managedSiteModelSyncStorage.saveLastExecution(result)

      // Cache upstream model options for allow-list selection, only if full sync
      if (!channelIds) {
        const collectedModels = collectModelsFromExecution(result)
        if (collectedModels.length > 0) {
          await managedSiteModelSyncStorage.saveChannelUpstreamModelOptions(
            collectedModels,
          )
        }
      }

      logger.info("Octopus execution completed", {
        successCount: result.statistics.successCount,
        total: result.statistics.total,
      })

      return result
    } finally {
      // Clear progress
      this.currentProgress = null
      this.notifyProgress()
    }
  }

  /**
   * Execute sync for failed channels only
   * @returns ExecutionResult for retry batch.
   * @throws {Error} When no previous execution exists or no failed channels are found.
   */
  async executeFailedOnly(): Promise<ExecutionResult> {
    const lastExecution = await managedSiteModelSyncStorage.getLastExecution()
    if (!lastExecution) {
      throw new Error("No previous execution found")
    }

    const failedChannelIds = lastExecution.items
      .filter((item) => !item.ok)
      .map((item) => item.channelId)

    if (failedChannelIds.length === 0) {
      throw new Error("No failed channels to retry")
    }

    return this.executeSync(failedChannelIds)
  }

  /**
   * Get current execution progress
   * @returns Latest progress snapshot or null when idle.
   */
  getProgress(): ExecutionProgress | null {
    return this.currentProgress
  }

  /**
   * Update sync settings and reschedule alarm
   * @param settings Partial override of sync prefs (interval, concurrency, filters, rate limit).
   * @param settings.enableSync Whether periodic sync is enabled.
   * @param settings.intervalMs Interval in milliseconds between scheduled sync runs.
   * @param settings.concurrency Maximum number of channels processed in parallel.
   * @param settings.maxRetries Maximum retry attempts per channel.
   * @param settings.rateLimit Optional rate limit overrides.
   * @param settings.rateLimit.requestsPerMinute Allowed upstream requests per minute.
   * @param settings.rateLimit.burst Allowed burst size before throttling.
   * @param settings.allowedModels Optional allow-list of models to keep during sync.
   * @param settings.globalChannelModelFilters Optional global include/exclude channel filters.
   */
  async updateSettings(settings: {
    enableSync?: boolean
    intervalMs?: number
    concurrency?: number
    maxRetries?: number
    rateLimit?: {
      requestsPerMinute?: number
      burst?: number
    }
    allowedModels?: string[]
    globalChannelModelFilters?: ChannelModelFilterRule[]
  }) {
    // Get current config and update
    const prefs = await userPreferences.getPreferences()
    const current =
      prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!

    const updated = {
      enabled:
        settings.enableSync !== undefined
          ? settings.enableSync
          : current.enabled,
      interval:
        settings.intervalMs !== undefined
          ? settings.intervalMs
          : current.interval,
      concurrency:
        settings.concurrency !== undefined
          ? settings.concurrency
          : current.concurrency,
      maxRetries:
        settings.maxRetries !== undefined
          ? settings.maxRetries
          : current.maxRetries,
      rateLimit: settings.rateLimit
        ? { ...current.rateLimit, ...settings.rateLimit }
        : { ...current.rateLimit },
      allowedModels:
        settings.allowedModels !== undefined
          ? settings.allowedModels
          : current.allowedModels,
      globalChannelModelFilters:
        settings.globalChannelModelFilters !== undefined
          ? settings.globalChannelModelFilters
          : current.globalChannelModelFilters,
    }

    await userPreferences.savePreferences({ managedSiteModelSync: updated })
    await this.setupAlarm()
    logger.info("Settings updated", updated)
  }

  /**
   * Notify frontend about progress.
   * Swallows missing-receiver errors because UI may not be open.
   */
  private notifyProgress() {
    try {
      void sendRuntimeMessage(
        {
          type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
          payload: this.currentProgress,
        },
        { maxAttempts: 1 },
      ).catch(() => {
        // Silent: frontend might not be open
      })
    } catch {
      // Silent: frontend might not be open
    }
  }
}

// Create singleton instance
export const modelSyncScheduler = new ModelSyncScheduler()

/**
 * Message handler for New API Model Sync actions (trigger, retry failed, prefs).
 * Centralizes background-only control plane for sync operations.
 */
export const handleManagedSiteModelSyncMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.ModelSyncGetNextRun: {
        const alarm = await getAlarm(ModelSyncScheduler.ALARM_NAME)
        const nextScheduledAt =
          alarm?.scheduledTime != null
            ? new Date(alarm.scheduledTime).toISOString()
            : undefined

        sendResponse({
          success: true,
          data: {
            nextScheduledAt,
            periodInMinutes: alarm?.periodInMinutes,
          },
        })
        break
      }

      case RuntimeActionIds.ModelSyncTriggerAll: {
        const resultAll = await modelSyncScheduler.executeSync()
        sendResponse({ success: true, data: resultAll })
        break
      }

      case RuntimeActionIds.ModelSyncTriggerSelected: {
        const resultSelected = await modelSyncScheduler.executeSync(
          request.channelIds,
        )
        sendResponse({ success: true, data: resultSelected })
        break
      }

      case RuntimeActionIds.ModelSyncTriggerFailedOnly: {
        const resultFailed = await modelSyncScheduler.executeFailedOnly()
        sendResponse({ success: true, data: resultFailed })
        break
      }

      case RuntimeActionIds.ModelSyncGetLastExecution: {
        const lastExecution =
          await managedSiteModelSyncStorage.getLastExecution()
        sendResponse({ success: true, data: lastExecution })
        break
      }

      case RuntimeActionIds.ModelSyncGetProgress: {
        const progress = modelSyncScheduler.getProgress()
        sendResponse({ success: true, data: progress })
        break
      }

      case RuntimeActionIds.ModelSyncUpdateSettings:
        await modelSyncScheduler.updateSettings(request.settings)
        sendResponse({ success: true })
        break

      case RuntimeActionIds.ModelSyncGetPreferences: {
        const prefs = await managedSiteModelSyncStorage.getPreferences()
        sendResponse({ success: true, data: prefs })
        break
      }

      case RuntimeActionIds.ModelSyncGetChannelUpstreamModelOptions: {
        const upstreamOptions =
          await managedSiteModelSyncStorage.getChannelUpstreamModelOptions()
        sendResponse({ success: true, data: upstreamOptions })
        break
      }

      case RuntimeActionIds.ModelSyncListChannels: {
        const channels = await modelSyncScheduler.listChannels()
        sendResponse({ success: true, data: channels })
        break
      }

      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
