import type { ManagedSiteMessagesKey } from "~/services/accountSiteDefinitions/contracts"
import type {
  ManagedResourceModelSyncBatchOptions,
  ManagedResourceModelSyncWorkflow,
} from "~/services/apiAdapters/contracts/managedResourceModelSync"
import { type ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
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
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  createAutomaticProtectionBypassExecution,
  isManualModelSyncProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassAutomaticTrigger,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import type {
  ManagedModelChannel,
  ManagedModelChannelSummaryListData,
} from "~/types/managedResourceModels"
import { DEFAULT_MODEL_REDIRECT_PREFERENCES } from "~/types/managedSiteModelRedirect"
import {
  type ExecutionItemResult,
  type ExecutionResult,
  type ScopedExecutionProgress,
} from "~/types/managedSiteModelSync"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { channelConfigStorage } from "../../managedSites/channelConfigStorage"
import { sanitizeChannelFiltersForStorage } from "../../managedSites/channelModelFilterRules"
import { userPreferences } from "../../preferences/userPreferences"
import { normalizeChannelProcessingTimeout } from "./channelProcessingTimeout"
import { saveModelSyncExecution } from "./executionResults"
import { ModelSyncService } from "./modelSyncService"
import { createModelSyncRedirectUpdater } from "./redirectUpdater"
import { managedSiteModelSyncStorage } from "./storage"

const logger = createLogger("ManagedSiteModelSync")
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

interface ProgressOwner {
  sequence: number
  configFingerprint: string
}

/** Owns resource selection, execution, progress identity and completion for model sync. */
export class ModelSyncExecution {
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

    const redirectUpdater = createModelSyncRedirectUpdater({
      allChannels,
      service,
      siteType,
      modelRedirectConfig,
    })

    const progress = this.startProgress(progressOwner, channels.length)

    let failureCount = 0

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
            await redirectUpdater.applySuccessfulResult(payload.lastResult)
          }

          progress.update(payload.completed, payload.lastResult, failureCount)
        },
      })

      await saveModelSyncExecution(result, !resourceRefs)

      logger.info("Execution completed", {
        successCount: result.statistics.successCount,
        total: result.statistics.total,
      })

      redirectUpdater.logSummary()

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

      await saveModelSyncExecution(result, !resourceRefs)

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
