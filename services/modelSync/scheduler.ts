import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ModelRedirectService } from "~/services/modelRedirect"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
} from "~/types/managedSiteModelRedirect"
import {
  ExecutionProgress,
  ExecutionResult,
} from "~/types/managedSiteModelSync"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import {
  getManagedSiteAdminConfig,
  getManagedSiteContext,
} from "~/utils/managedSite"

import { channelConfigStorage } from "../channelConfigStorage"
import { DEFAULT_PREFERENCES, userPreferences } from "../userPreferences"
import { collectModelsFromExecution } from "./modelCollection"
import { ModelSyncService } from "./modelSyncService"
import { managedSiteModelSyncStorage } from "./storage"

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
      console.log("[ManagedSiteModelSync] Scheduler already initialized")
      return
    }

    try {
      // Set up alarm listener using browserApi (if supported)
      if (hasAlarmsAPI()) {
        onAlarm((alarm) => {
          if (alarm.name === ModelSyncScheduler.ALARM_NAME) {
            this.executeSync().catch((error) => {
              console.error(
                "[ManagedSiteModelSync] Scheduled execution failed:",
                error,
              )
            })
          }
        })

        // Setup initial alarm based on preferences
        await this.setupAlarm()
      } else {
        console.warn(
          "[ManagedSiteModelSync] Alarms API not available, automatic sync disabled",
        )
      }

      this.isInitialized = true
      console.log("[ManagedSiteModelSync] Scheduler initialized")
    } catch (error) {
      console.error(
        "[ManagedSiteModelSync] Failed to initialize scheduler:",
        error,
      )
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
      console.warn(
        "[ManagedSiteModelSync] Alarms API not supported, auto-sync disabled",
      )
      return
    }

    const prefs = await userPreferences.getPreferences()
    const config =
      prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!

    if (!config.enabled) {
      await clearAlarm(ModelSyncScheduler.ALARM_NAME)
      console.log("[ManagedSiteModelSync] Auto-sync disabled, alarm cleared")
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
        console.log(
          "[ManagedSiteModelSync] Alarm already exists, preserving:",
          {
            name: existingAlarm.name,
            scheduledTime: existingAlarm.scheduledTime
              ? new Date(existingAlarm.scheduledTime)
              : null,
            periodInMinutes: existingPeriodInMinutes,
          },
        )
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
        console.log(`[ManagedSiteModelSync] Alarm set successfully:`, {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime
            ? new Date(alarm.scheduledTime)
            : null,
          periodInMinutes: alarm.periodInMinutes,
        })
      } else {
        console.warn("[ManagedSiteModelSync] Alarm was not created properly")
      }
    } catch (error) {
      console.error("[ManagedSiteModelSync] Failed to create alarm:", error)
    }
  }

  async listChannels() {
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
    console.log("[ManagedSiteModelSync] Starting execution")

    // Initialize service
    const service = await this.createService()

    // Get preferences from userPreferences
    const prefs = await userPreferences.getPreferences()
    const { messagesKey } = getManagedSiteContext(prefs)
    const config =
      prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!
    const concurrency = Math.max(1, config.concurrency)
    const { maxRetries } = config

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
                  console.warn(
                    `[ManagedSiteModelSync] Channel ${payload.lastResult.channelId} not found`,
                  )
                } else {
                  const actualModels = payload.lastResult.newModels || []

                  const newMapping =
                    ModelRedirectService.generateModelMappingForChannel(
                      standardModels,
                      actualModels,
                    )

                  // Use unified method for incremental merge and apply
                  await ModelRedirectService.applyModelMappingToChannel(
                    channel,
                    newMapping,
                    service,
                  )
                  mappingSuccessCount++
                  console.log(
                    `[ManagedSiteModelSync] Applied ${Object.keys(newMapping).length} model redirects to channel ${channel.name}`,
                  )
                }
              } catch (error) {
                console.error(
                  `[ManagedSiteModelSync] Failed to apply mapping for channel ${payload.lastResult.channelName}:`,
                  error,
                )
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

      console.log(
        `[ManagedSiteModelSync] Execution completed: ${result.statistics.successCount}/${result.statistics.total} succeeded`,
      )

      // Log model redirect mapping results
      if (modelRedirectConfig.enabled && standardModels.length > 0) {
        console.log(
          `[ManagedSiteModelSync] Model redirect mappings applied: ${mappingSuccessCount} succeeded, ${mappingErrorCount} failed`,
        )
      }

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
    console.log("[ManagedSiteModelSync] Settings updated:", updated)
  }

  /**
   * Notify frontend about progress.
   * Swallows missing-receiver errors because UI may not be open.
   */
  private notifyProgress() {
    try {
      browser.runtime
        .sendMessage({
          type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
          payload: this.currentProgress,
        })
        .catch(() => {
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
    console.error("[ManagedSiteModelSync] Message handling failed:", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
