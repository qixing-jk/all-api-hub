import type { ManagedSiteMessagesKey } from "~/services/accountSiteDefinitions/contracts"
import type {
  ManagedResourceModelSyncBatchOptions,
  ManagedResourceModelSyncWorkflow,
} from "~/services/apiAdapters/contracts/managedResourceModelSync"
import {
  isManagedResourceRef,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/legacyChannelConfigMigration"
import {
  assertManagedResourceRefForSite,
  getManagedResourceRefKey,
  toManagedUpstreamResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteRuntimeConfigFingerprint,
  resolveCurrentManagedSiteRuntimeConfig,
} from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteContext,
  getManagedSiteNoChannelsToSyncMessage,
  getManagedSiteUnsupportedModelSyncMessage,
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
import {
  createAutomaticProtectionBypassExecution,
  INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  isManualModelSyncProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassAutomaticTrigger,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type {
  ManagedModelChannel,
  ManagedModelChannelSummaryListData,
} from "~/types/managedResourceModels"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
} from "~/types/managedSiteModelRedirect"
import {
  type ExecutionItemResult,
  type ExecutionResult,
  type ScopedExecutionProgress,
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
import { managedSiteModelSyncStorage } from "./storage"

const logger = createLogger("ManagedSiteModelSync")

const MODEL_SYNC_BACKGROUND_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.ScheduledManagedSiteModelSync,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
} as const

const resolveModelSyncProtectionExecution = (
  trigger: ProtectionBypassAutomaticTrigger,
  execution?: ProtectionBypassExecution,
): ProtectionBypassExecution =>
  execution ??
  createAutomaticProtectionBypassExecution(
    PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
    trigger,
    PROTECTION_BYPASS_SURFACES.Background,
  )

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

interface ProgressOwner {
  sequence: number
  configFingerprint: string
}

/**
 * Scheduler for managed-site model sync.
 * Responsibilities:
 * - Sets up alarms to run sync on a fixed cadence (when alarms API is available).
 * - Orchestrates execution with user preferences (interval, concurrency, retries).
 * - Applies model redirect mappings immediately after successful channel syncs.
 */
class ModelSyncScheduler {
  static readonly ALARM_NAME = "managedSiteModelSync"
  private isInitialized = false
  private currentProgress: ScopedExecutionProgress | null = null
  private executionSequence = 0
  private latestProgressSequence = 0

  /**
   * Build a ModelSyncService instance using persisted preferences and channel configs.
   * @throws {Error} When New API config is missing.
   */
  private async createService(
    trigger: ProtectionBypassAutomaticTrigger = PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    protectionBypassExecution?: ProtectionBypassExecution,
    preferencesSnapshot?: Awaited<
      ReturnType<typeof userPreferences.getPreferences>
    >,
  ): Promise<ModelSyncService> {
    const userPrefs =
      preferencesSnapshot ?? (await userPreferences.getPreferences())

    const { messagesKey } = getManagedSiteContext(userPrefs)
    const managedConfig = resolveCurrentManagedSiteRuntimeConfig(userPrefs)

    if (!managedConfig) {
      throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
    }

    const config =
      userPrefs.managedSiteModelSync ??
      DEFAULT_PREFERENCES.managedSiteModelSync!

    const channelConfigs = await channelConfigStorage.getConfigsForScope({
      managedSiteType: managedConfig.siteType,
      scopeKey: managedConfig.config.baseUrl,
    })

    return new ModelSyncService(
      managedConfig,
      config.rateLimit,
      config.allowedModels,
      channelConfigs,
      sanitizeChannelFiltersForStorage(config.globalChannelModelFilters, {
        idPrefix: "global-channel-filter",
      }),
      resolveModelSyncProtectionExecution(trigger, protectionBypassExecution),
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
              const result = await this.executeSync(
                undefined,
                PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
              )
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

  async listChannels(): Promise<ManagedModelChannelSummaryListData> {
    const userPrefs = await userPreferences.getPreferences()
    const { siteType, messagesKey } = getManagedSiteContext(userPrefs)

    if (!supportsManagedSiteModelSync(siteType)) {
      throw new Error(getManagedSiteUnsupportedModelSyncMessage(t, siteType))
    }

    const createSync =
      getSiteTypeCapabilities(siteType).managedSites?.models?.createSync
    if (createSync) {
      const runtimeConfig = resolveCurrentManagedSiteRuntimeConfig(userPrefs)
      if (!runtimeConfig) {
        throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
      }
      return createSync(
        runtimeConfig.config,
        resolveModelSyncProtectionExecution(
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
        ),
      ).listChannels()
    }

    const service = await this.createService(undefined, undefined, userPrefs)
    const list = await service.listChannels()
    return {
      items: list.items.map(({ ref, name }) => ({ ref, name })),
      total: list.total,
    }
  }

  /**
   * Execute model sync for all channels (or a filtered subset).
   * Also generates model redirect mappings immediately after successful channel syncs.
   * @param resourceRefs Optional subset of scoped channel references; defaults to all.
   * @returns ExecutionResult with per-channel outcomes and statistics.
   */
  async executeSync(
    resourceRefs?: ManagedResourceRef[],
    trigger: ProtectionBypassAutomaticTrigger = PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    protectionBypassExecution?: ProtectionBypassExecution,
  ): Promise<ExecutionResult> {
    const executionSequence = ++this.executionSequence
    logger.info("Starting execution")

    // Get preferences from userPreferences
    const prefs = await userPreferences.getPreferences()
    const { siteType, messagesKey } = getManagedSiteContext(prefs)
    const progressOwner: ProgressOwner = {
      sequence: executionSequence,
      configFingerprint: getManagedSiteRuntimeConfigFingerprint(
        prefs,
        siteType,
      ),
    }
    const selectedTarget = resolveCurrentManagedSiteRuntimeConfig(prefs)
    if (resourceRefs !== undefined) {
      if (
        !selectedTarget ||
        !Array.isArray(resourceRefs) ||
        resourceRefs.length === 0
      ) {
        throw new Error(
          "A configured managed site and non-empty resource selection are required",
        )
      }
      for (const ref of resourceRefs)
        assertManagedResourceRefForSite(ref, selectedTarget)
    }

    const config =
      prefs.managedSiteModelSync ?? DEFAULT_PREFERENCES.managedSiteModelSync!
    const concurrency = Math.max(1, config.concurrency)
    const { maxRetries } = config
    const channelProcessingTimeout = normalizeChannelProcessingTimeout(
      config.channelProcessingTimeout,
    )

    const createSync =
      getSiteTypeCapabilities(siteType).managedSites?.models?.createSync
    if (createSync) {
      if (!selectedTarget) {
        throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
      }
      return this.executeSyncWithProvider(
        createSync(
          selectedTarget.config,
          resolveModelSyncProtectionExecution(
            trigger,
            protectionBypassExecution,
          ),
        ),
        selectedTarget,
        resourceRefs,
        messagesKey,
        { concurrency, maxRetries, channelProcessingTimeout },
        progressOwner,
        protectionBypassExecution,
      )
    }

    if (!supportsManagedSiteModelSync(siteType)) {
      throw new Error(getManagedSiteUnsupportedModelSyncMessage(t, siteType))
    }

    // Initialize the shared runner for providers with individual model operations.
    if (!selectedTarget) {
      throw new Error(getManagedSiteConfigMissingMessage(t, messagesKey))
    }
    const service = await this.createService(
      trigger,
      protectionBypassExecution,
      prefs,
    )

    const modelRedirectConfig =
      prefs.modelRedirect ?? DEFAULT_MODEL_REDIRECT_PREFERENCES

    // List channels
    const channelListResponse = await service.listChannels()
    const allChannels = channelListResponse.items

    // Match selected resources within the captured managed-site scope.
    let channels: ManagedModelChannel[]
    if (resourceRefs && resourceRefs.length > 0) {
      channels = allChannels.filter((c) =>
        resourceRefs.some(
          (ref) =>
            getManagedResourceRefKey(ref) === getManagedResourceRefKey(c.ref),
        ),
      )
    } else {
      channels = allChannels
    }

    if (channels.length === 0) {
      throw new Error(getManagedSiteNoChannelsToSyncMessage(t, messagesKey))
    }

    await ensureLegacyChannelConfigMigrationReady({
      resourceRefs: channels.map(({ ref }) =>
        toManagedUpstreamResourceRef(ref),
      ),
      bypassBackoff: isManualModelSyncProtectionBypassExecution(
        protectionBypassExecution,
      ),
    })
    // Migration may have resolved selected rules; reload before model writeback.
    service.setChannelConfigs(
      await channelConfigStorage.getConfigsForScope({
        managedSiteType: selectedTarget.siteType,
        scopeKey: selectedTarget.config.baseUrl,
      }),
    )

    const standardModels =
      modelRedirectConfig.standardModels.length > 0
        ? modelRedirectConfig.standardModels
        : ALL_PRESET_STANDARD_MODELS

    const progress = this.startProgress(progressOwner, channels.length)

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
                  (c) =>
                    getManagedResourceRefKey(c.ref) ===
                    getManagedResourceRefKey(payload.lastResult.resourceRef),
                )
                if (!channel) {
                  logger.warn("Channel not found", {
                    resourceRef: payload.lastResult.resourceRef,
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
                            modelMappingPolicy:
                              getSiteTypeCapabilities(siteType).managedSites
                                ?.models?.modelMappingPolicy,
                          }
                        : undefined,
                    )
                  mappingSuccessCount++
                  logger.info("Applied model redirects to channel", {
                    resourceRef: channel.ref,
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
                  resourceRef: payload.lastResult.resourceRef,
                  channelName: payload.lastResult.channelName,
                  error,
                })
                mappingErrorCount++
              }
            }
          }

          progress.update(payload.completed, payload.lastResult, failureCount)
        },
      })

      // Save execution result
      await managedSiteModelSyncStorage.saveLastExecution(result)

      // Cache upstream model options for allow-list selection, only if full sync
      if (!resourceRefs) {
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
      progress.finish()
    }
  }

  /** Runs a provider-owned sync batch using only scoped selection and result facts. */
  private async executeSyncWithProvider(
    workflow: ManagedResourceModelSyncWorkflow,
    runtimeConfig: ManagedSiteRuntimeConfig,
    resourceRefs: ManagedResourceRef[] | undefined,
    messagesKey: ManagedSiteMessagesKey,
    options: ManagedResourceModelSyncBatchOptions,
    progressOwner: ProgressOwner,
    protectionBypassExecution?: ProtectionBypassExecution,
  ): Promise<ExecutionResult> {
    const batch = await workflow.prepareBatch(resourceRefs)
    if (batch.resources.length === 0) {
      throw new Error(getManagedSiteNoChannelsToSyncMessage(t, messagesKey))
    }

    const progress = this.startProgress(progressOwner, batch.resources.length)

    let failureCount = 0

    let result
    try {
      await ensureLegacyChannelConfigMigrationReady({
        resourceRefs: batch.resources.map(({ ref }) =>
          toManagedUpstreamResourceRef(ref),
        ),
        bypassBackoff: isManualModelSyncProtectionBypassExecution(
          protectionBypassExecution,
        ),
      })
      const channelConfigs = await channelConfigStorage.getConfigsForScope({
        managedSiteType: runtimeConfig.siteType,
        scopeKey: runtimeConfig.config.baseUrl,
      })
      result = await batch.run({
        ...options,
        channelConfigs,
        onProgress: async (payload) => {
          if (!payload.lastResult.ok) {
            failureCount += 1
          }

          progress.update(payload.completed, payload.lastResult, failureCount)
        },
      })

      // Save execution result
      await managedSiteModelSyncStorage.saveLastExecution(result)

      // Cache upstream model options for allow-list selection, only if full sync
      if (!resourceRefs) {
        const collectedModels = collectModelsFromExecution(result)
        if (collectedModels.length > 0) {
          await managedSiteModelSyncStorage.saveChannelUpstreamModelOptions(
            collectedModels,
          )
        }
      }

      logger.info("Provider execution completed", {
        successCount: result.statistics.successCount,
        total: result.statistics.total,
      })

      return result
    } finally {
      progress.finish()
    }
  }

  /**
   * Execute sync for failed channels only
   * @returns ExecutionResult for retry batch.
   * @throws {Error} When no previous execution exists or no failed channels are found.
   */
  async executeFailedOnly(
    protectionBypassExecution?: ProtectionBypassExecution,
  ): Promise<ExecutionResult> {
    const lastExecution = await managedSiteModelSyncStorage.getLastExecution()
    if (!lastExecution) {
      throw new Error("No previous execution found")
    }

    const failedResourceRefs = lastExecution.items
      .filter((item) => !item.ok)
      .flatMap((item) => (item.resourceRef ? [item.resourceRef] : []))

    if (failedResourceRefs.length === 0) {
      throw new Error("No failed channels to retry")
    }

    return protectionBypassExecution
      ? this.executeSync(
          failedResourceRefs,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
          protectionBypassExecution,
        )
      : this.executeSync(failedResourceRefs)
  }

  /**
   * Get current execution progress
   * @returns Latest progress snapshot or null when idle.
   */
  getProgress(): ScopedExecutionProgress | null {
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

  /** Captures run ownership so older callbacks cannot overwrite or clear newer progress. */
  private startProgress(owner: ProgressOwner, total: number) {
    let progress: ScopedExecutionProgress = {
      configFingerprint: owner.configFingerprint,
      isRunning: true,
      total,
      completed: 0,
      failed: 0,
    }
    // Preserve invocation order even when an earlier inventory request finishes later.
    if (owner.sequence > this.latestProgressSequence) {
      this.latestProgressSequence = owner.sequence
      this.currentProgress = progress
      this.notifyProgress(progress)
    }

    return {
      update: (
        completed: number,
        lastResult: ExecutionItemResult,
        failed: number,
      ) => {
        if (this.currentProgress !== progress) return

        progress = {
          ...progress,
          completed,
          lastResult,
          currentChannel: lastResult.channelName,
          failed,
        }
        this.currentProgress = progress
        this.notifyProgress(progress)
      },
      finish: () => {
        if (this.currentProgress !== progress) return

        this.currentProgress = null
        this.notifyProgress({ ...progress, isRunning: false })
      },
    }
  }

  /**
   * Notify frontend about progress.
   * Swallows missing-receiver errors because UI may not be open.
   */
  private notifyProgress(progress: ScopedExecutionProgress) {
    try {
      void sendRuntimeMessage(
        {
          type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
          payload: progress,
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

/** Builds the controlled runtime response for invalid manual model-sync intent. */
function createInvalidModelSyncExecutionFailure() {
  return {
    success: false as const,
    error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  }
}

/**
 * Run model sync for all eligible managed-site channels.
 */
export async function triggerAllModelSync(
  protectionBypassExecution?: ProtectionBypassExecution,
) {
  if (
    protectionBypassExecution !== undefined &&
    !isManualModelSyncProtectionBypassExecution(protectionBypassExecution)
  ) {
    return createInvalidModelSyncExecutionFailure()
  }
  const resultAll = protectionBypassExecution
    ? await modelSyncScheduler.executeSync(
        undefined,
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
        protectionBypassExecution,
      )
    : await modelSyncScheduler.executeSync()
  return { success: true as const, data: resultAll }
}

/**
 * Run model sync for the selected managed-site channels.
 */
export async function triggerSelectedModelSync(
  resourceRefs?: ManagedResourceRef[],
  protectionBypassExecution?: ProtectionBypassExecution,
) {
  if (
    protectionBypassExecution !== undefined &&
    !isManualModelSyncProtectionBypassExecution(protectionBypassExecution)
  ) {
    return createInvalidModelSyncExecutionFailure()
  }
  if (
    !Array.isArray(resourceRefs) ||
    resourceRefs.length === 0 ||
    !resourceRefs.every(isManagedResourceRef)
  ) {
    return {
      success: false as const,
      error: "resourceRefs must be a non-empty array for selected sync",
    }
  }

  const resultSelected = protectionBypassExecution
    ? await modelSyncScheduler.executeSync(
        resourceRefs,
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
        protectionBypassExecution,
      )
    : await modelSyncScheduler.executeSync(resourceRefs)
  return { success: true as const, data: resultSelected }
}

/**
 * Retry model sync only for channels from the last failed execution.
 */
export async function triggerFailedOnlyModelSync(
  protectionBypassExecution?: ProtectionBypassExecution,
) {
  if (
    protectionBypassExecution !== undefined &&
    !isManualModelSyncProtectionBypassExecution(protectionBypassExecution)
  ) {
    return createInvalidModelSyncExecutionFailure()
  }
  const resultFailed = protectionBypassExecution
    ? await modelSyncScheduler.executeFailedOnly(protectionBypassExecution)
    : await modelSyncScheduler.executeFailedOnly()
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

/** Validates manual model-sync intent before executing the awaited batch. */
async function resolveVerifiedModelSyncMessage<T>(
  execution: unknown,
  resolve: () => Promise<T>,
) {
  if (!isManualModelSyncProtectionBypassExecution(execution)) {
    return createInvalidModelSyncExecutionFailure()
  }
  return await resolve()
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
    onModelSyncMessage(ModelSyncMessageTypes.TriggerAll, async (message) => {
      try {
        const execution = message?.data.protectionBypassExecution
        return await resolveVerifiedModelSyncMessage(execution, () =>
          triggerAllModelSync(execution),
        )
      } catch (error) {
        return toModelSyncFailure(error)
      }
    }),
    onModelSyncMessage(
      ModelSyncMessageTypes.TriggerSelected,
      async (message) => {
        try {
          const execution = message?.data.protectionBypassExecution
          return await resolveVerifiedModelSyncMessage(execution, () =>
            triggerSelectedModelSync(message?.data.resourceRefs, execution),
          )
        } catch (error) {
          return toModelSyncFailure(error)
        }
      },
    ),
    onModelSyncMessage(
      ModelSyncMessageTypes.TriggerFailedOnly,
      async (message) => {
        try {
          const execution = message?.data.protectionBypassExecution
          return await resolveVerifiedModelSyncMessage(execution, () =>
            triggerFailedOnlyModelSync(execution),
          )
        } catch (error) {
          return toModelSyncFailure(error)
        }
      },
    ),
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
