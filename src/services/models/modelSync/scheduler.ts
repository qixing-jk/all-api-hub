import {
  isManagedResourceRef,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { resolveCurrentManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import { getManagedSiteContext } from "~/services/managedSites/utils/managedSite"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
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
  INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  isManualModelSyncProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { type ExecutionResult } from "~/types/managedSiteModelSync"
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
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { sanitizeChannelFiltersForStorage } from "../../managedSites/channelModelFilterRules"
import { userPreferences } from "../../preferences/userPreferences"
import { normalizeChannelProcessingTimeout } from "./channelProcessingTimeout"
import { ModelSyncExecution } from "./execution"
import {
  onModelSyncMessage,
  type ModelSyncUpdateSettingsRequest,
} from "./messaging"
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
 * Scheduler for managed-site model sync.
 * Responsibilities:
 * - Sets up alarms to run sync on a fixed cadence (when alarms API is available).
 * - Delegates scoped model-sync execution and progress to its execution owner.
 * - Persists settings and reschedules the next alarm.
 */
class ModelSyncScheduler {
  static readonly ALARM_NAME = "managedSiteModelSync"
  private isInitialized = false
  private readonly execution = new ModelSyncExecution()

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

              // A scheduled run without a configured managed-site target can
              // never do useful work; treat it as not-applicable instead of
              // executing a doomed sync and reporting a failure.
              if (!resolveCurrentManagedSiteRuntimeConfig(prefs)) {
                logger.info(
                  "Skipping scheduled model sync; managed site not configured",
                )
                tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
                  durationMs: Date.now() - startedAt,
                  insights: {
                    sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
                    ...(managedSiteType ? { managedSiteType } : {}),
                  },
                })
                return
              }

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
  listChannels(...args: Parameters<ModelSyncExecution["listChannels"]>) {
    return this.execution.listChannels(...args)
  }

  executeSync(...args: Parameters<ModelSyncExecution["executeSync"]>) {
    return this.execution.executeSync(...args)
  }

  executeFailedOnly(
    ...args: Parameters<ModelSyncExecution["executeFailedOnly"]>
  ) {
    return this.execution.executeFailedOnly(...args)
  }

  getProgress(...args: Parameters<ModelSyncExecution["getProgress"]>) {
    return this.execution.getProgress(...args)
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
