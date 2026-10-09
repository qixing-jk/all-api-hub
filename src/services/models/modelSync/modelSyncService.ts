import { union } from "lodash-es"

import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { type ManagedSiteRuntimeConfig } from "~/services/managedSites/configuration/runtimeConfig"
import { assertManagedResourceRefForSite } from "~/services/managedSites/managedResourceIdentity"
import { consumeManagedSiteMutationResult } from "~/services/managedSites/mutations/consumption"
import { type ManagedSiteMutationResult } from "~/services/managedSites/mutations/contracts"
import {
  MANAGED_SITE_MUTATION_RETRY_DECISIONS,
  type ManagedSiteMutationRetryDecision,
} from "~/services/managedSites/mutations/retryPolicy"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/resourceSecrets"
import { runModelSyncBatch } from "~/services/models/modelSync/runModelSyncBatch"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ChannelResourceConfigMap } from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  type ManagedModelChannel,
  type ManagedModelChannelListData,
} from "~/types/managedResourceModels"
import {
  type BatchExecutionOptions,
  type ExecutionItemResult,
  type ExecutionResult,
} from "~/types/managedSiteModelSync"
import { createLogger } from "~/utils/core/logger"

import { ProbeFilterUnavailableError } from "./channelModelFilterEvaluator"
import { ChannelModelSelection } from "./channelModelSelection"
import { runWithChannelProcessingTimeout } from "./channelProcessingTimeout"
import { RateLimiter } from "./rateLimiter"
import {
  createModelSyncWriteFailureBoundary,
  type ModelSyncWriteFailureBoundary,
} from "./writeFailureBoundary"

type ModelSyncChannelListCapability = ManagedResourceModelsCapability & {
  list: NonNullable<ManagedResourceModelsCapability["list"]>
}

type ModelSyncChannelCapabilities = ManagedResourceModelsCapability & {
  fetchModels: NonNullable<ManagedResourceModelsCapability["fetchModels"]>
  updateModels: NonNullable<ManagedResourceModelsCapability["updateModels"]>
  updateModelMapping: NonNullable<
    ManagedResourceModelsCapability["updateModelMapping"]
  >
}

/**
 * Unified logger scoped to managed-site model synchronization.
 */
const logger = createLogger("ManagedSiteModelSync")

class ModelSyncMutationError extends Error {
  constructor(
    message: string,
    readonly retryDecision: ManagedSiteMutationRetryDecision,
  ) {
    super(message)
    this.name = "ModelSyncMutationError"
  }
}

const consumeModelSyncMutationResult = async (
  result: unknown,
  options: {
    knownSecrets: readonly string[]
    knownSecretsComplete: boolean
    reconcile: () => Promise<void>
  },
): Promise<void> =>
  consumeManagedSiteMutationResult(result, {
    idempotent: true,
    retryableRejection: true,
    knownSecrets: options.knownSecrets,
    knownSecretsComplete: options.knownSecretsComplete,
    reconcile: options.reconcile,
    rejectedFallbackMessage: "Model update was rejected",
    ambiguousFallbackMessage: "Model update requires reconciliation",
    createError: (message, retryDecision) =>
      new ModelSyncMutationError(message, retryDecision),
  })

/**
 * Stop channel work before writeback when its timeout cancellation has fired.
 */
function throwIfAborted(abortSignal?: AbortSignal) {
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new Error("Channel processing aborted")
  }
}

/**
 * Runs shared model-list and redirect workflows through the selected provider.
 */
export class ModelSyncService {
  get knownSecrets(): readonly string[] {
    return Object.freeze(
      collectManagedConfigSecrets(this.managedSiteConfig.config),
    )
  }

  get knownSecretsComplete(): boolean {
    return true
  }

  async reconcileChannel(): Promise<void> {
    await this.reconcileChannelMutation()
  }

  private managedSiteConfig: ManagedSiteRuntimeConfig
  private rateLimiter: RateLimiter | null = null
  private readonly modelSelection: ChannelModelSelection

  /**
   * Create a model sync service bound to a specific managed-site runtime config.
   * @param managedSiteConfig Managed-site runtime config object.
   * @param rateLimitConfig Optional RPM/burst limits for upstream calls.
   * @param rateLimitConfig.requestsPerMinute Maximum allowed requests per minute.
   * @param rateLimitConfig.burst Maximum burst size before throttling kicks in.
   * @param allowedModels Optional allow-list to constrain synced models.
   * @param channelConfigs Optional per-channel filter/settings cache.
   * @param globalChannelModelFilters Optional global include/exclude rules.
   */
  constructor(
    managedSiteConfig: ManagedSiteRuntimeConfig,
    rateLimitConfig?: { requestsPerMinute: number; burst: number },
    allowedModels?: string[],
    channelConfigs?: ChannelResourceConfigMap | null,
    globalChannelModelFilters?: ChannelModelFilterRule[] | null,
    protectionBypassExecution?: ProtectionBypassExecution,
  ) {
    this.managedSiteConfig = managedSiteConfig
    if (rateLimitConfig) {
      this.rateLimiter = new RateLimiter(
        rateLimitConfig.requestsPerMinute,
        rateLimitConfig.burst,
      )
    }
    this.modelSelection = new ChannelModelSelection(
      managedSiteConfig,
      allowedModels,
      channelConfigs,
      globalChannelModelFilters,
      protectionBypassExecution,
    )
  }

  /**
   * Update in-memory channel configs to be used by per-channel filters.
   * @param configs Cached channel configuration map; null clears cache.
   */
  setChannelConfigs(configs: ChannelResourceConfigMap | null) {
    this.modelSelection.setChannelConfigs(configs)
  }

  /**
   * Respect optional rate limiter before issuing upstream requests.
   */
  private async throttle() {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire()
    }
  }

  private getChannelListCapability(): ModelSyncChannelListCapability {
    const channels = getSiteTypeCapabilities(this.managedSiteConfig.siteType)
      .managedSites?.models

    if (!channels?.list) {
      throw new Error(
        `managed-site channel listing is not implemented for ${this.managedSiteConfig.siteType}`,
      )
    }

    return channels as ModelSyncChannelListCapability
  }

  private getModelSyncChannelCapabilities(): ModelSyncChannelCapabilities {
    const channels = getSiteTypeCapabilities(this.managedSiteConfig.siteType)
      .managedSites?.models

    if (
      !channels?.fetchModels ||
      !channels.updateModels ||
      !channels.updateModelMapping
    ) {
      throw new Error(
        `managed-site model sync is not implemented for ${this.managedSiteConfig.siteType}`,
      )
    }

    return channels as ModelSyncChannelCapabilities
  }

  private createChannelRequestOptions(abortSignal?: AbortSignal) {
    if (!abortSignal && !this.rateLimiter) {
      return undefined
    }

    return {
      ...(abortSignal ? { signal: abortSignal } : {}),
      ...(this.rateLimiter ? { bypassSiteRequestLimit: true } : {}),
    }
  }

  private async reconcileChannelMutation(abortSignal?: AbortSignal) {
    await this.getChannelListCapability().list(this.managedSiteConfig.config, {
      beforeRequest: async () => this.throttle(),
      ...(abortSignal ? { signal: abortSignal } : {}),
      ...(this.rateLimiter ? { bypassSiteRequestLimit: true } : {}),
    })
  }

  /** Lists complete model-task inputs through the selected provider. */
  async listChannels(): Promise<ManagedModelChannelListData> {
    try {
      const result = await this.getChannelListCapability().list(
        this.managedSiteConfig.config,
        {
          beforeRequest: async () => this.throttle(),
          ...(this.rateLimiter ? { bypassSiteRequestLimit: true } : {}),
        },
      )
      for (const channel of result.items) {
        assertManagedResourceRefForSite(channel.ref, this.managedSiteConfig)
      }
      return result
    } catch (error) {
      logger.error("Failed to list channels", error)
      throw error
    }
  }

  /**
   * Fetch raw model list for a given channel.
   * @param resourceRef Complete identity of the target channel.
   * @returns Model identifiers returned by upstream.
   */
  async fetchChannelModels(
    resourceRef: ManagedResourceRef,
    abortSignal?: AbortSignal,
  ): Promise<string[]> {
    assertManagedResourceRefForSite(resourceRef, this.managedSiteConfig)
    try {
      await this.throttle()
      throwIfAborted(abortSignal)

      return await this.getModelSyncChannelCapabilities().fetchModels(
        this.managedSiteConfig.config,
        resourceRef,
        this.createChannelRequestOptions(abortSignal),
      )
    } catch (error: any) {
      logger.error("Failed to fetch models", { resourceRef, error })
      throw error
    }
  }

  /**
   * Persist models field for a channel (model_mapping handled separately).
   * @param channel Channel to update.
   * @param models Canonical model list to write.
   */
  async updateChannelModels(
    channel: ManagedModelChannel,
    models: string[],
    abortSignal?: AbortSignal,
  ): Promise<void> {
    assertManagedResourceRefForSite(channel.ref, this.managedSiteConfig)
    try {
      await this.throttle()
      throwIfAborted(abortSignal)
      const knownSecrets = Object.freeze(
        collectManagedConfigSecrets(this.managedSiteConfig.config),
      )

      const result = await this.getModelSyncChannelCapabilities().updateModels(
        this.managedSiteConfig.config,
        channel.ref,
        models,
        this.createChannelRequestOptions(abortSignal),
      )
      await consumeModelSyncMutationResult(result, {
        knownSecrets,
        knownSecretsComplete: true,
        reconcile: () => this.reconcileChannelMutation(abortSignal),
      })
    } catch (error: any) {
      logger.error("Failed to update channel", {
        resourceRef: channel.ref,
        ...(error instanceof ModelSyncMutationError ? { error } : {}),
      })
      throw error
    }
  }

  /**
   * Persist model_mapping while ensuring models contains all mapped keys.
   * @param channel Channel to update.
   * @param modelMapping Standard→actual mapping to write.
   */
  async updateChannelModelMapping(
    channel: ManagedModelChannel,
    modelMapping: Record<string, string>,
    abortSignal?: AbortSignal,
  ): Promise<ManagedSiteMutationResult<unknown>> {
    assertManagedResourceRefForSite(channel.ref, this.managedSiteConfig)
    try {
      const updateModels = union(channel.models, Object.keys(modelMapping))
      await this.throttle()
      throwIfAborted(abortSignal)
      const knownSecrets = Object.freeze(
        collectManagedConfigSecrets(this.managedSiteConfig.config),
      )

      const result =
        await this.getModelSyncChannelCapabilities().updateModelMapping(
          this.managedSiteConfig.config,
          channel.ref,
          updateModels,
          modelMapping,
          this.createChannelRequestOptions(abortSignal),
        )
      await consumeModelSyncMutationResult(result, {
        knownSecrets,
        knownSecretsComplete: true,
        reconcile: () => this.reconcileChannelMutation(abortSignal),
      })
      return result
    } catch (error) {
      logger.error("Failed to update channel mapping", {
        resourceRef: channel.ref,
        ...(error instanceof ModelSyncMutationError ? { error } : {}),
      })
      throw error
    }
  }

  /**
   * Execute sync for a single channel with retry/backoff.
   * @param channel Channel to sync.
   * @param maxRetries Max retry attempts (default 2) with exponential backoff.
   * @returns Outcome including old/new models and status.
   */
  async runForChannel(
    channel: ManagedModelChannel,
    maxRetries: number = 2,
    abortSignal?: AbortSignal,
    writeFailureBoundary: ModelSyncWriteFailureBoundary = createModelSyncWriteFailureBoundary(),
  ): Promise<ExecutionItemResult> {
    assertManagedResourceRefForSite(channel.ref, this.managedSiteConfig)
    let attempts = 0
    let lastError: any = null

    const oldModels = [...channel.models]

    while (attempts <= maxRetries) {
      try {
        throwIfAborted(abortSignal)
        const fetchedModels = await this.fetchChannelModels(
          channel.ref,
          abortSignal,
        )
        throwIfAborted(abortSignal)
        const channelScopedModels = await this.modelSelection.select(
          channel,
          fetchedModels,
        )
        throwIfAborted(abortSignal)

        if (this.haveModelsChanged(oldModels, channelScopedModels)) {
          // Only push an update when model sets differ to avoid unnecessary writes
          try {
            await this.updateChannelModels(
              channel,
              channelScopedModels,
              abortSignal,
            )
          } catch (error) {
            if (!(error instanceof ModelSyncMutationError)) {
              writeFailureBoundary.capture(error)
            }
            throw error
          }
          channel.models = channelScopedModels
        }

        return {
          resourceRef: channel.ref,
          channelName: channel.name,
          ok: true,
          attempts,
          finishedAt: Date.now(),
          oldModels,
          newModels: channelScopedModels,
          message: "Success",
        }
      } catch (error: any) {
        if (writeFailureBoundary.matches(error)) throw error
        if (abortSignal?.aborted) {
          throw error
        }

        if (error instanceof ProbeFilterUnavailableError) {
          logger.warn("Probe-backed channel filter skipped model update", {
            resourceRef: channel.ref,
            reason: error.reason,
          })
          return {
            resourceRef: channel.ref,
            channelName: channel.name,
            ok: false,
            attempts: attempts + 1,
            finishedAt: Date.now(),
            oldModels,
            message: error.message,
          }
        }

        lastError = error
        logger.error("Unexpected error for channel", {
          resourceRef: channel.ref,
          error,
        })

        attempts += 1
        if (
          error instanceof ModelSyncMutationError &&
          error.retryDecision !==
            MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryAllowed
        ) {
          break
        }
        if (attempts > maxRetries) {
          break
        }

        // Exponential backoff: 1s, 2s, 4s, ...
        const backoffMs = Math.pow(2, attempts - 1) * 1000
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }

    return {
      resourceRef: channel.ref,
      channelName: channel.name,
      ok: false,
      httpStatus: lastError?.httpStatus,
      message: lastError?.message || "Unknown error",
      attempts,
      finishedAt: Date.now(),
      oldModels,
    }
  }

  /**
   * Run sync across multiple channels with concurrency control.
   * @param channels Channels to process.
   * @param options Concurrency, retry limit, and progress callback.
   * @returns Aggregate execution result and statistics.
   */
  async runBatch(
    channels: ManagedModelChannel[],
    options: BatchExecutionOptions,
  ): Promise<ExecutionResult> {
    for (const channel of channels) {
      assertManagedResourceRefForSite(channel.ref, this.managedSiteConfig)
    }
    const { concurrency, maxRetries, channelProcessingTimeout, onProgress } =
      options
    return await runModelSyncBatch(
      channels,
      { concurrency, onProgress },
      async (channel) => {
        let result: ExecutionItemResult
        const writeFailureBoundary = createModelSyncWriteFailureBoundary()

        try {
          result = await runWithChannelProcessingTimeout(
            (abortSignal) =>
              this.runForChannel(
                channel,
                maxRetries,
                abortSignal,
                writeFailureBoundary,
              ),
            {
              resourceRef: channel.ref,
              channelName: channel.name,
              oldModels: [...channel.models],
            },
            maxRetries,
            channelProcessingTimeout,
          )
        } catch (error: any) {
          if (writeFailureBoundary.matches(error)) throw error
          logger.error("Unexpected error for channel", {
            resourceRef: channel.ref,
            error,
          })
          result = {
            resourceRef: channel.ref,
            channelName: channel.name,
            ok: false,
            message: error?.message || "Unexpected error",
            attempts: maxRetries + 1,
            finishedAt: Date.now(),
          }
        }
        return result
      },
    )
  }

  /**
   * Compare two model lists ignoring order to detect changes.
   */
  private haveModelsChanged(previous: string[], next: string[]): boolean {
    if (previous.length !== next.length) {
      return true
    }

    const prevSorted = [...previous].sort()
    const nextSorted = [...next].sort()

    for (let index = 0; index < prevSorted.length; index += 1) {
      if (prevSorted[index] !== nextSorted[index]) {
        return true
      }
    }

    return false
  }
}
