import { t } from "i18next"

import { ModelRedirectService } from "~/services/modelRedirect"
import { hasValidNewApiConfig } from "~/services/newApiService/newApiService"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
} from "~/types/modelRedirect"
import { NewApiChannel } from "~/types/newapi"
import { ExecutionProgress, ExecutionResult } from "~/types/newApiModelSync"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

import { channelConfigStorage } from "../channelConfigStorage"
import { DEFAULT_PREFERENCES, userPreferences } from "../userPreferences"
import { collectModelsFromExecution } from "./modelCollection"
import { NewApiModelSyncService } from "./NewApiModelSyncService"
import { newApiModelSyncStorage } from "./storage"

/**
 * Scheduler service for New API Model Sync
 * Handles periodic execution using chrome.alarms
 */
class NewApiModelSyncScheduler {
  private static readonly ALARM_NAME = "newApiModelSync"
  private isInitialized = false
  private currentProgress: ExecutionProgress | null = null

  private async createService(): Promise<NewApiModelSyncService> {
    const userPrefs = await userPreferences.getPreferences()

    if (!hasValidNewApiConfig(userPrefs)) {
      throw new Error(t("messages:newapi.configMissing"))
    }

    const {
      baseUrl: newApiBaseUrl,
      adminToken: newApiAdminToken,
      userId: newApiUserId,
    } = userPrefs.newApi

    const config =
      userPrefs.newApiModelSync ?? DEFAULT_PREFERENCES.newApiModelSync!

    const channelConfigs = await channelConfigStorage.getAllConfigs()

    return new NewApiModelSyncService(
      newApiBaseUrl!,
      newApiAdminToken!,
      newApiUserId!,
      config.rateLimit,
      config.allowedModels,
      channelConfigs,
      config.globalChannelModelFilters,
    )
  }

  /**
   * Initialize the scheduler
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("[NewApiModelSync] Scheduler already initialized")
      return
    }

    try {
      // Set up alarm listener using browserApi (if supported)
      if (hasAlarmsAPI()) {
        onAlarm((alarm) => {
          if (alarm.name === NewApiModelSyncScheduler.ALARM_NAME) {
            this.executeSync().catch((error) => {
              console.error(
                "[NewApiModelSync] Scheduled execution failed:",
                error,
              )
            })
          }
        })

        // Setup initial alarm based on preferences
        await this.setupAlarm()
      } else {
        console.warn(
          "[NewApiModelSync] Alarms API not available, automatic sync disabled",
        )
      }

      this.isInitialized = true
      console.log("[NewApiModelSync] Scheduler initialized")
    } catch (error) {
      console.error("[NewApiModelSync] Failed to initialize scheduler:", error)
    }
  }

  /**
   * Setup or update the alarm based on current preferences
   */
  async setupAlarm() {
    // Check if alarms API is supported
    if (!hasAlarmsAPI()) {
      console.warn(
        "[NewApiModelSync] Alarms API not supported, auto-sync disabled",
      )
      return
    }

    const prefs = await userPreferences.getPreferences()
    const config = prefs.newApiModelSync ?? DEFAULT_PREFERENCES.newApiModelSync!

    // Clear existing alarm
    await clearAlarm(NewApiModelSyncScheduler.ALARM_NAME)

    if (!config.enabled) {
      console.log("[NewApiModelSync] Auto-sync disabled, alarm cleared")
      return
    }

    const intervalMs = config.interval
    const intervalInMinutes = Math.max(intervalMs / 1000 / 60, 1)

    try {
      await createAlarm(NewApiModelSyncScheduler.ALARM_NAME, {
        delayInMinutes: intervalInMinutes, // Initial delay
        periodInMinutes: intervalInMinutes, // Repeat interval
      })

      // Verify alarm was created
      const alarm = await getAlarm(NewApiModelSyncScheduler.ALARM_NAME)
      if (alarm) {
        console.log(`[NewApiModelSync] Alarm set successfully:`, {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime
            ? new Date(alarm.scheduledTime)
            : null,
          periodInMinutes: alarm.periodInMinutes,
        })
      } else {
        console.warn("[NewApiModelSync] Alarm was not created properly")
      }
    } catch (error) {
      console.error("[NewApiModelSync] Failed to create alarm:", error)
    }
  }

  async listChannels() {
    const service = await this.createService()
    return service.listChannels()
  }

  /**
   * Execute model sync for all channels
   * Also generates model redirect mappings if enabled
   */
  async executeSync(channelIds?: number[]): Promise<ExecutionResult> {
    console.log("[NewApiModelSync] Starting execution")

    // Initialize service
    const service = await this.createService()

    // Get preferences from userPreferences
    const prefs = await userPreferences.getPreferences()
    const config = prefs.newApiModelSync ?? DEFAULT_PREFERENCES.newApiModelSync!
    const concurrency = Math.max(1, config.concurrency)
    const { maxRetries } = config

    // List channels
    const newApiChannelListResponse = await service.listChannels()
    const allChannels = newApiChannelListResponse.items

    // Filter channels if specific IDs provided
    let channels: NewApiChannel[]
    if (channelIds && channelIds.length > 0) {
      channels = allChannels.filter((c) => channelIds.includes(c.id))
    } else {
      channels = allChannels
    }

    if (channels.length === 0) {
      throw new Error("No channels to sync")
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
                    `[NewApiModelSync] Channel ${payload.lastResult.channelId} not found`,
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
                    `[NewApiModelSync] Applied ${Object.keys(newMapping).length} model redirects to channel ${channel.name}`,
                  )
                }
              } catch (error) {
                console.error(
                  `[NewApiModelSync] Failed to apply mapping for channel ${payload.lastResult.channelName}:`,
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
      await newApiModelSyncStorage.saveLastExecution(result)

      // Cache upstream model options for allow-list selection, only if full sync
      if (!channelIds) {
        const collectedModels = collectModelsFromExecution(result)
        if (collectedModels.length > 0) {
          await newApiModelSyncStorage.saveChannelUpstreamModelOptions(
            collectedModels,
          )
        }
      }

      console.log(
        `[NewApiModelSync] Execution completed: ${result.statistics.successCount}/${result.statistics.total} succeeded`,
      )

      // Log model redirect mapping results
      if (modelRedirectConfig.enabled && standardModels.length > 0) {
        console.log(
          `[NewApiModelSync] Model redirect mappings applied: ${mappingSuccessCount} succeeded, ${mappingErrorCount} failed`,
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
   */
  async executeFailedOnly(): Promise<ExecutionResult> {
    const lastExecution = await newApiModelSyncStorage.getLastExecution()
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
   */
  getProgress(): ExecutionProgress | null {
    return this.currentProgress
  }

  /**
   * Update sync settings and reschedule alarm
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
      prefs.newApiModelSync ?? DEFAULT_PREFERENCES.newApiModelSync!

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

    await userPreferences.savePreferences({ newApiModelSync: updated })
    await this.setupAlarm()
    console.log("[NewApiModelSync] Settings updated:", updated)
  }

  /**
   * Notify frontend about progress
   */
  private notifyProgress() {
    try {
      browser.runtime
        .sendMessage({
          type: "NEW_API_MODEL_SYNC_PROGRESS",
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
export const newApiModelSyncScheduler = new NewApiModelSyncScheduler()

/**
 * Message handler for New API Model Sync
 */
export const handleNewApiModelSyncMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case "newApiModelSync:triggerAll": {
        const resultAll = await newApiModelSyncScheduler.executeSync()
        sendResponse({ success: true, data: resultAll })
        break
      }

      case "newApiModelSync:triggerSelected": {
        const resultSelected = await newApiModelSyncScheduler.executeSync(
          request.channelIds,
        )
        sendResponse({ success: true, data: resultSelected })
        break
      }

      case "newApiModelSync:triggerFailedOnly": {
        const resultFailed = await newApiModelSyncScheduler.executeFailedOnly()
        sendResponse({ success: true, data: resultFailed })
        break
      }

      case "newApiModelSync:getLastExecution": {
        const lastExecution = await newApiModelSyncStorage.getLastExecution()
        sendResponse({ success: true, data: lastExecution })
        break
      }

      case "newApiModelSync:getProgress": {
        const progress = newApiModelSyncScheduler.getProgress()
        sendResponse({ success: true, data: progress })
        break
      }

      case "newApiModelSync:updateSettings":
        await newApiModelSyncScheduler.updateSettings(request.settings)
        sendResponse({ success: true })
        break

      case "newApiModelSync:getPreferences": {
        const prefs = await newApiModelSyncStorage.getPreferences()
        sendResponse({ success: true, data: prefs })
        break
      }

      case "newApiModelSync:getChannelUpstreamModelOptions": {
        const upstreamOptions =
          await newApiModelSyncStorage.getChannelUpstreamModelOptions()
        sendResponse({ success: true, data: upstreamOptions })
        break
      }

      case "newApiModelSync:listChannels": {
        const channels = await newApiModelSyncScheduler.listChannels()
        sendResponse({ success: true, data: channels })
        break
      }

      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    console.error("[NewApiModelSync] Message handling failed:", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
