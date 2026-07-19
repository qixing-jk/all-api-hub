import { SITE_TYPES } from "~/constants/siteType"
import * as octopusApi from "~/services/apiService/octopus"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import {
  resolveCurrentManagedSiteRuntimeConfig,
  resolveManagedSiteRuntimeConfigForType,
} from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteContext,
  getManagedSiteNoChannelsToSyncMessage,
  getManagedSiteUnsupportedModelSyncMessage,
  ManagedSiteMessagesKey,
  supportsManagedSiteModelSync,
} from "~/services/managedSites/utils/managedSite"
import { ModelRedirectService } from "~/services/models/modelRedirect"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsManagedSiteType,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
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
import {
  getTaskNotificationStatusFromCounts,
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { channelConfigStorage } from "../../managedSites/channelConfigStorage"
import { sanitizeChannelFiltersForStorage } from "../../managedSites/channelModelFilterRules"
import { octopusChannelToManagedSite } from "../../managedSites/providers/octopus"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "../../preferences/userPreferences"
import { normalizeChannelProcessingTimeout } from "./channelProcessingTimeout"
import {
  onModelSyncMessage,
  type ModelSyncUpdateSettingsRequest,
} from "./messaging"
import { collectModelsFromExecution } from "./modelCollection"
import { ModelSyncService } from "./modelSyncService"
import { runOctopusBatch } from "./octopusModelSync"
import { managedSiteModelSyncStorage } from "./storage"

const logger = createLogger("ManagedSiteModelSync")

const MODEL_SYNC_BACKGROUND_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.ScheduledManagedSiteModelSync,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
} as const

/**
 * Buckets automatic sync failures without exposing raw backend messages.
 */
function classifyModelSyncError(error: unknown): ProductAnalyticsErrorCategory {
  const message = getErrorMessage(error).toLowerCase()

  if (message.includes("unsupported") || message.includes("不支持")) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
  }
  if (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("token") ||
    message.includes("auth") ||
    message.includes("鉴权") ||
    message.includes("认证")
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
  }
  if (
    message.includes("config") ||
    message.includes("validation") ||
    message.includes("invalid") ||
    message.includes("missing") ||
    message.includes("no channels") ||
    message.includes("配置") ||
    message.includes("无可同步") ||
    message.includes("沒有可同步")
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
  }
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("限流")
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("econn") ||
    message.includes("enotfound") ||
    message.includes("网络")
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
  }

  return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
}

/**
 * Picks one coarse failure category from failed batch items, if available.
 */
function classifyModelSyncResultError(
  result: ExecutionResult,
): ProductAnalyticsErrorCategory | undefined {
  const failedItem = result.items.find((item) => !item.ok)
  if (!failedItem) {
    return undefined
  }

  if (failedItem.httpStatus === 401 || failedItem.httpStatus === 403) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
  }
  if (failedItem.httpStatus === 429) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
  }
  if (
    failedItem.httpStatus != null &&
    failedItem.httpStatus >= 400 &&
    failedItem.httpStatus < 500
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
  }

  return classifyModelSyncError(failedItem.message ?? "unknown")
}

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

    const { messagesKey } = getManagedSiteContext(userPrefs)
    const managedConfig = resolveCurrentManagedSiteRuntimeConfig(userPrefs)

    if (!managedConfig) {
      throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
    }

    const config =
      userPrefs.managedSiteModelSync ??
      DEFAULT_PREFERENCES.managedSiteModelSync!

    const channelConfigs = await channelConfigStorage.getAllConfigs()

    return new ModelSyncService(
      managedConfig,
      config.rateLimit,
      config.allowedModels,
      channelConfigs,
      sanitizeChannelFiltersForStorage(config.globalChannelModelFilters, {
        idPrefix: "global-channel-filter",
      }),
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
            const tracker = startProductAnalyticsAction(
              MODEL_SYNC_BACKGROUND_ANALYTICS_CONTEXT,
            )
            const startedAt = Date.now()
            let managedSiteType: ProductAnalyticsManagedSiteType | undefined

            try {
              const prefs = await userPreferences.getPreferences()
              managedSiteType = resolveProductAnalyticsManagedSiteType(
                getManagedSiteContext(prefs).siteType,
              )

              // Await to keep the MV3 service worker alive while the sync runs.
              const result = await this.executeSync()
              tracker.complete(
                result.statistics.failureCount > 0
                  ? PRODUCT_ANALYTICS_RESULTS.Failure
                  : PRODUCT_ANALYTICS_RESULTS.Success,
                {
                  durationMs: Date.now() - startedAt,
                  errorCategory:
                    result.statistics.failureCount > 0
                      ? classifyModelSyncResultError(result)
                      : undefined,
                  insights: {
                    sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
                    ...(managedSiteType ? { managedSiteType } : {}),
                    itemCount: result.statistics.total,
                    successCount: result.statistics.successCount,
                    failureCount: result.statistics.failureCount,
                  },
                },
              )
              await notifyTaskResult({
                task: TASK_NOTIFICATION_TASKS.ManagedSiteModelSync,
                status: getTaskNotificationStatusFromCounts({
                  successCount: result.statistics.successCount,
                  failedCount: result.statistics.failureCount,
                }),
                counts: {
                  total: result.statistics.total,
                  success: result.statistics.successCount,
                  failed: result.statistics.failureCount,
                },
              })
            } catch (error) {
              logger.error("Scheduled execution failed", error)
              tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
                durationMs: Date.now() - startedAt,
                errorCategory: classifyModelSyncError(error),
                insights: {
                  sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
                  ...(managedSiteType ? { managedSiteType } : {}),
                },
              })
              await notifyTaskResult({
                task: TASK_NOTIFICATION_TASKS.ManagedSiteModelSync,
                status: TASK_NOTIFICATION_STATUSES.Failure,
                message: getErrorMessage(error),
              })
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
    if (siteType === SITE_TYPES.OCTOPUS) {
      const octopusRuntimeConfig =
        resolveCurrentManagedSiteRuntimeConfig(userPrefs)

      // Validate config like createService does
      if (
        !octopusRuntimeConfig ||
        octopusRuntimeConfig.siteType !== SITE_TYPES.OCTOPUS ||
        !octopusRuntimeConfig.config.baseUrl ||
        !octopusRuntimeConfig.config.username ||
        !octopusRuntimeConfig.config.password
      ) {
        throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
      }

      const channels = await octopusApi.listChannels(
        octopusRuntimeConfig.config,
      )
      return {
        items: channels.map(octopusChannelToManagedSite),
        total: channels.length,
        type_counts: {},
      }
    }

    if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
      const managedConfig = resolveManagedSiteRuntimeConfigForType(
        userPrefs,
        SITE_TYPES.CLAUDE_CODE_HUB,
      )
      if (!managedConfig) {
        throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
      }

      const service = getManagedSiteServiceForType(siteType)
      const channels = await service.searchChannel(managedConfig.config, "")

      return channels ?? { items: [], total: 0, type_counts: {} }
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
    const channelProcessingTimeout = normalizeChannelProcessingTimeout(
      config.channelProcessingTimeout,
    )

    // Octopus 使用独立的模型同步逻辑
    if (siteType === SITE_TYPES.OCTOPUS) {
      return this.executeSyncForOctopus(
        channelIds,
        prefs,
        messagesKey,
        concurrency,
        maxRetries,
        channelProcessingTimeout,
      )
    }

    if (!supportsManagedSiteModelSync(siteType)) {
      throw new Error(getManagedSiteUnsupportedModelSyncMessage(t, messagesKey))
    }

    // Initialize service (for non-Octopus sites)
    const service = await this.createService()

    const modelRedirectConfig =
      prefs.modelRedirect ?? DEFAULT_MODEL_REDIRECT_PREFERENCES

    // List channels
    const channelListResponse = await service.listChannels({
      preferResourceBacked: !modelRedirectConfig.enabled,
    })
    const allChannels = channelListResponse.items

    // Filter channels if specific IDs provided
    let channels: ManagedSiteChannel[]
    if (channelIds && channelIds.length > 0) {
      channels = allChannels.filter((c) => channelIds.includes(c.id))
    } else {
      channels = allChannels
    }

    if (channels.length === 0) {
      throw new Error(getManagedSiteNoChannelsToSyncMessage(t, messagesKey))
    }

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
    this.notifyProgress()

    let failureCount = 0
    let mappingSuccessCount = 0
    let mappingErrorCount = 0

    let result
    try {
      // Execute batch sync
      result = await service.runBatch(channels, {
        concurrency,
        maxRetries,
        channelProcessingTimeout,
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
    messagesKey: ManagedSiteMessagesKey,
    concurrency: number,
    maxRetries: number,
    channelProcessingTimeout: number,
  ): Promise<ExecutionResult> {
    const octopusRuntimeConfig = resolveCurrentManagedSiteRuntimeConfig(prefs)

    // Validate config like createService does
    if (
      !octopusRuntimeConfig ||
      octopusRuntimeConfig.siteType !== SITE_TYPES.OCTOPUS ||
      !octopusRuntimeConfig.config.baseUrl ||
      !octopusRuntimeConfig.config.username ||
      !octopusRuntimeConfig.config.password
    ) {
      throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
    }

    // List channels using Octopus API
    const octopusChannels = await octopusApi.listChannels(
      octopusRuntimeConfig.config,
    )
    const allChannels = octopusChannels.map(octopusChannelToManagedSite)

    // Filter channels if specific IDs provided
    let channels: ManagedSiteChannel[]
    if (channelIds && channelIds.length > 0) {
      channels = allChannels.filter((c) => channelIds.includes(c.id))
    } else {
      channels = allChannels
    }

    if (channels.length === 0) {
      throw new Error(getManagedSiteNoChannelsToSyncMessage(t, messagesKey))
    }

    // Update progress
    this.currentProgress = {
      isRunning: true,
      total: channels.length,
      completed: 0,
      failed: 0,
    }
    this.notifyProgress()

    let failureCount = 0

    let result
    try {
      // Execute batch sync using Octopus-specific implementation
      result = await runOctopusBatch(octopusRuntimeConfig.config, channels, {
        concurrency,
        maxRetries,
        channelProcessingTimeout,
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
   * @param settings.channelProcessingTimeout Maximum duration per channel, 0 for unlimited.
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
    channelProcessingTimeout?: number
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
      channelProcessingTimeout:
        settings.channelProcessingTimeout !== undefined
          ? normalizeChannelProcessingTimeout(settings.channelProcessingTimeout)
          : current.channelProcessingTimeout ??
            DEFAULT_PREFERENCES.managedSiteModelSync!.channelProcessingTimeout,
      rateLimit: settings.rateLimit
        ? { ...current.rateLimit, ...settings.rateLimit }
        : { ...current.rateLimit },
      allowedModels:
        settings.allowedModels !== undefined
          ? settings.allowedModels
          : current.allowedModels,
      globalChannelModelFilters:
        settings.globalChannelModelFilters !== undefined
          ? sanitizeChannelFiltersForStorage(
              settings.globalChannelModelFilters,
              {
                idPrefix: "global-channel-filter",
              },
            )
          : sanitizeChannelFiltersForStorage(
              current.globalChannelModelFilters,
              {
                idPrefix: "global-channel-filter",
              },
            ),
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
 * Resolve the next scheduled model-sync alarm information.
 */
export async function getModelSyncNextRun() {
  const alarm = await getAlarm(ModelSyncScheduler.ALARM_NAME)
  const nextScheduledAt =
    alarm?.scheduledTime != null
      ? new Date(alarm.scheduledTime).toISOString()
      : undefined

  return {
    success: true as const,
    data: {
      nextScheduledAt,
      periodInMinutes: alarm?.periodInMinutes,
    },
  }
}

/**
 * Run model sync for all eligible managed-site channels.
 */
export async function triggerAllModelSync() {
  const resultAll = await modelSyncScheduler.executeSync()
  return { success: true as const, data: resultAll }
}

/**
 * Run model sync for the selected managed-site channels.
 */
export async function triggerSelectedModelSync(channelIds?: number[]) {
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return {
      success: false as const,
      error: "channelIds must be a non-empty array for selected sync",
    }
  }

  const resultSelected = await modelSyncScheduler.executeSync(channelIds)
  return { success: true as const, data: resultSelected }
}

/**
 * Retry model sync only for channels from the last failed execution.
 */
export async function triggerFailedOnlyModelSync() {
  const resultFailed = await modelSyncScheduler.executeFailedOnly()
  return { success: true as const, data: resultFailed }
}

/**
 * Load the last model-sync execution result from storage.
 */
export async function getModelSyncLastExecution() {
  const lastExecution = await managedSiteModelSyncStorage.getLastExecution()
  return { success: true as const, data: lastExecution }
}

/**
 * Read the in-memory model-sync execution progress snapshot.
 */
export function getModelSyncProgress() {
  const progress = modelSyncScheduler.getProgress()
  return { success: true as const, data: progress }
}

/**
 * Persist model-sync scheduler settings and update its schedule.
 */
export async function updateModelSyncSettings(
  settings: ModelSyncUpdateSettingsRequest["settings"],
) {
  await modelSyncScheduler.updateSettings(settings)
  return { success: true as const }
}

/**
 * Load persisted model-sync preferences.
 */
export async function getModelSyncPreferences() {
  const prefs = await managedSiteModelSyncStorage.getPreferences()
  return { success: true as const, data: prefs }
}

/**
 * Load upstream model options used by managed-site model sync settings.
 */
export async function getModelSyncChannelUpstreamModelOptions() {
  const upstreamOptions =
    await managedSiteModelSyncStorage.getChannelUpstreamModelOptions()
  return { success: true as const, data: upstreamOptions }
}

/**
 * List channels available to model-sync UI flows.
 */
export async function listModelSyncChannels() {
  const channels = await modelSyncScheduler.listChannels()
  return { success: true as const, data: channels }
}

/**
 * Convert model-sync listener errors into runtime responses.
 */
function toModelSyncFailure(error: unknown) {
  logger.error("Message handling failed", error)
  return {
    success: false as const,
    error:
      getErrorMessage(error) || t("settings:messages.runtimeRequestFailed"),
  }
}

let modelSyncMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for model-sync runtime messages.
 */
export function setupManagedSiteModelSyncMessagingListeners() {
  if (modelSyncMessagingCleanup) {
    return
  }

  modelSyncMessagingCleanup = [
    onModelSyncMessage(ModelSyncMessageTypes.GetNextRun, async () => {
      try {
        return await getModelSyncNextRun()
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
    onModelSyncMessage(ModelSyncMessageTypes.TriggerAll, async () => {
      try {
        return await triggerAllModelSync()
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
    onModelSyncMessage(
      ModelSyncMessageTypes.TriggerSelected,
      async ({ data }) => {
        try {
          return await triggerSelectedModelSync(data.channelIds)
        } catch (error) {
          return toModelSyncFailure(error)
        }
      },
    ),
    onModelSyncMessage(ModelSyncMessageTypes.TriggerFailedOnly, async () => {
      try {
        return await triggerFailedOnlyModelSync()
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
    onModelSyncMessage(ModelSyncMessageTypes.GetLastExecution, async () => {
      try {
        return await getModelSyncLastExecution()
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
    onModelSyncMessage(ModelSyncMessageTypes.GetProgress, async () => {
      try {
        return getModelSyncProgress()
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
    onModelSyncMessage(
      ModelSyncMessageTypes.UpdateSettings,
      async ({ data }) => {
        try {
          return await updateModelSyncSettings(data.settings)
        } catch (error) {
          return toModelSyncFailure(error)
        }
      },
    ),
    onModelSyncMessage(ModelSyncMessageTypes.GetPreferences, async () => {
      try {
        return await getModelSyncPreferences()
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
    onModelSyncMessage(
      ModelSyncMessageTypes.GetChannelUpstreamModelOptions,
      async () => {
        try {
          return await getModelSyncChannelUpstreamModelOptions()
        } catch (error) {
          return toModelSyncFailure(error)
        }
      },
    ),
    onModelSyncMessage(ModelSyncMessageTypes.ListChannels, async () => {
      try {
        return await listModelSyncChannels()
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
  ]
}
