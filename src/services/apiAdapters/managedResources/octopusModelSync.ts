/**
 * Octopus 模型同步服务
 * 实现 Octopus 站点的模型同步功能
 */
import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedResourceModelSyncBatchOptions,
  ManagedResourceModelSyncWorkflow,
} from "~/services/apiAdapters/contracts/managedResourceModelSync"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { octopusManagedResourceModels } from "~/services/apiAdapters/managedResources/octopusOperations"
import { requireManagedResourceChannelId } from "~/services/apiAdapters/managedResources/resourceIds"
import * as octopusApi from "~/services/apiService/octopus"
import { ApiError } from "~/services/apiTransport/errors"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  consumeManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_RETRY_DECISIONS,
  type ManagedSiteMutationRetryDecision,
} from "~/services/managedSites/mutations"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/resourceSecrets"
import {
  applyChannelModelFilters,
  getChannelModelFilterRulesForResource,
  ProbeFilterUnavailableError,
} from "~/services/models/modelSync/channelModelFilterEvaluator"
import { runWithChannelProcessingTimeout } from "~/services/models/modelSync/channelProcessingTimeout"
import { runModelSyncBatch } from "~/services/models/modelSync/runModelSyncBatch"
import {
  createModelSyncWriteFailureBoundary,
  type ModelSyncWriteFailureBoundary,
} from "~/services/models/modelSync/writeFailureBoundary"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ChannelResourceConfigMap } from "~/types/channelConfig"
import {
  type ExecutionItemResult,
  type ExecutionResult,
} from "~/types/managedSiteModelSync"
import type { OctopusChannel, OctopusFetchModelInput } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("OctopusModelSync")

const createOctopusModelSyncClient = (
  config: OctopusConfig,
  protectionBypassExecution: ProtectionBypassExecution,
) => {
  const requestOptions = (signal?: AbortSignal) =>
    signal
      ? { signal, protectionBypassExecution }
      : { protectionBypassExecution }

  return {
    listChannels: async (signal?: AbortSignal) =>
      await octopusApi.listChannels(config, requestOptions(signal)),
    fetchRemoteModels: async (
      request: OctopusFetchModelInput,
      signal?: AbortSignal,
    ) =>
      await octopusApi.fetchRemoteModels(
        config,
        request,
        requestOptions(signal),
      ),
    updateModels: async (
      channelId: number,
      models: string[],
      signal?: AbortSignal,
    ) =>
      await octopusManagedResourceModels.updateModels(
        config,
        createManagedChannelResourceRef(
          SITE_TYPES.OCTOPUS,
          config.baseUrl,
          channelId,
        ),
        models,
        requestOptions(signal),
      ),
  }
}

type OctopusModelSyncClient = ReturnType<typeof createOctopusModelSyncClient>

class OctopusModelSyncMutationError extends Error {
  constructor(
    message: string,
    readonly retryDecision: ManagedSiteMutationRetryDecision,
  ) {
    super(message)
    this.name = "OctopusModelSyncMutationError"
  }
}

/**
 * Stop Octopus channel work before writeback when timeout cancellation has fired.
 */
function throwIfAborted(abortSignal?: AbortSignal) {
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new Error("Channel processing aborted")
  }
}

const getOctopusChannelModels = (channel: OctopusChannel): string[] =>
  channel.model
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)

/**
 * 获取渠道的上游模型列表
 */
async function fetchChannelModels(
  client: OctopusModelSyncClient,
  channel: OctopusChannel,
  abortSignal?: AbortSignal,
): Promise<string[]> {
  const baseUrl = channel.base_urls[0]?.url ?? ""
  const key = channel.keys[0]?.channel_key ?? ""
  const request: OctopusFetchModelInput = {
    type: channel.type,
    baseUrl,
    key,
    proxy: channel.proxy,
    source: channel,
  }

  throwIfAborted(abortSignal)
  return await client.fetchRemoteModels(request, abortSignal)
}

/**
 * 更新渠道的模型列表
 */
async function updateChannelModels(
  config: OctopusConfig,
  client: OctopusModelSyncClient,
  channel: OctopusChannel,
  models: string[],
  abortSignal?: AbortSignal,
): Promise<void> {
  throwIfAborted(abortSignal)
  const result = await client.updateModels(channel.id, models, abortSignal)
  await consumeManagedSiteMutationResult(result, {
    idempotent: true,
    retryableRejection: true,
    knownSecrets: collectManagedConfigSecrets(config),
    knownSecretsComplete: true,
    reconcile: async () => {
      await client.listChannels(abortSignal)
    },
    rejectedFallbackMessage: "Model update was rejected",
    ambiguousFallbackMessage: "Model update requires reconciliation",
    createError: (message, retryDecision) =>
      new OctopusModelSyncMutationError(message, retryDecision),
  })
}

/**
 * 比较两个模型列表是否有变化
 */
function haveModelsChanged(previous: string[], next: string[]): boolean {
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

/**
 * 对单个渠道执行模型同步
 */
async function runForChannel(
  config: OctopusConfig,
  client: OctopusModelSyncClient,
  channel: OctopusChannel,
  maxRetries: number = 2,
  abortSignal?: AbortSignal,
  writeFailureBoundary: ModelSyncWriteFailureBoundary = createModelSyncWriteFailureBoundary(),
  channelConfigs?: ChannelResourceConfigMap,
): Promise<ExecutionItemResult> {
  let attempts = 0
  let lastError: unknown = null

  const oldModels = getOctopusChannelModels(channel)

  while (attempts <= maxRetries) {
    try {
      throwIfAborted(abortSignal)
      const fetchedModels = await fetchChannelModels(
        client,
        channel,
        abortSignal,
      )
      throwIfAborted(abortSignal)
      const normalizedModels = Array.from(
        new Set(fetchedModels.map((model) => model.trim()).filter(Boolean)),
      )
      const rules = getChannelModelFilterRulesForResource(channelConfigs, {
        managedSiteType: SITE_TYPES.OCTOPUS,
        scopeKey: config.baseUrl,
        resourceId: channel.id,
      })
      const channelScopedModels = await applyChannelModelFilters(
        rules,
        normalizedModels,
        {
          channel: {
            ref: createManagedChannelResourceRef(
              SITE_TYPES.OCTOPUS,
              config.baseUrl,
              channel.id,
            ),
            type: channel.type,
            baseUrl: channel.base_urls[0]?.url ?? "",
            credential: channel.keys[0]?.channel_key,
          },
          managedConfig: { siteType: SITE_TYPES.OCTOPUS, config },
          cache: new Map(),
          abortSignal,
        },
      )

      if (haveModelsChanged(oldModels, channelScopedModels)) {
        try {
          await updateChannelModels(
            config,
            client,
            channel,
            channelScopedModels,
            abortSignal,
          )
        } catch (error) {
          if (!(error instanceof OctopusModelSyncMutationError)) {
            writeFailureBoundary.capture(error)
          }
          throw error
        }
      }

      return {
        resourceRef: createManagedChannelResourceRef(
          SITE_TYPES.OCTOPUS,
          config.baseUrl,
          channel.id,
        ),
        channelName: channel.name,
        ok: true,
        attempts,
        finishedAt: Date.now(),
        oldModels,
        newModels: channelScopedModels,
        message: "Success",
      }
    } catch (error: unknown) {
      if (writeFailureBoundary.matches(error)) throw error
      if (abortSignal?.aborted) {
        throw error
      }

      if (error instanceof ProbeFilterUnavailableError) {
        return {
          resourceRef: createManagedChannelResourceRef(
            SITE_TYPES.OCTOPUS,
            config.baseUrl,
            channel.id,
          ),
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
        resourceRef: createManagedChannelResourceRef(
          SITE_TYPES.OCTOPUS,
          config.baseUrl,
          channel.id,
        ),
        error,
      })

      attempts += 1
      if (
        error instanceof OctopusModelSyncMutationError &&
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
    resourceRef: createManagedChannelResourceRef(
      SITE_TYPES.OCTOPUS,
      config.baseUrl,
      channel.id,
    ),
    channelName: channel.name,
    ok: false,
    httpStatus:
      lastError instanceof ApiError ? lastError.statusCode : undefined,
    message: getErrorMessage(lastError),
    attempts,
    finishedAt: Date.now(),
    oldModels,
  }
}

/**
 * 批量执行 Octopus 模型同步
 */
async function runOctopusBatchWithClient(
  config: OctopusConfig,
  client: OctopusModelSyncClient,
  channels: OctopusChannel[],
  options: ManagedResourceModelSyncBatchOptions,
): Promise<ExecutionResult> {
  const {
    concurrency,
    maxRetries,
    channelProcessingTimeout,
    channelConfigs,
    onProgress,
  } = options
  return await runModelSyncBatch(
    channels,
    { concurrency, onProgress },
    async (channel) => {
      let result: ExecutionItemResult
      const writeFailureBoundary = createModelSyncWriteFailureBoundary()

      try {
        result = await runWithChannelProcessingTimeout(
          (abortSignal) =>
            runForChannel(
              config,
              client,
              channel,
              maxRetries,
              abortSignal,
              writeFailureBoundary,
              channelConfigs,
            ),
          {
            resourceRef: createManagedChannelResourceRef(
              SITE_TYPES.OCTOPUS,
              config.baseUrl,
              channel.id,
            ),
            channelName: channel.name,
            oldModels: getOctopusChannelModels(channel),
          },
          maxRetries,
          channelProcessingTimeout,
        )
      } catch (error: any) {
        if (writeFailureBoundary.matches(error)) throw error
        logger.error("Unexpected error for channel", {
          resourceRef: createManagedChannelResourceRef(
            SITE_TYPES.OCTOPUS,
            config.baseUrl,
            channel.id,
          ),
          error,
        })
        result = {
          resourceRef: createManagedChannelResourceRef(
            SITE_TYPES.OCTOPUS,
            config.baseUrl,
            channel.id,
          ),
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

/** Binds one Octopus config and protection intent to the complete sync workflow. */
export function createOctopusModelSyncCapability(
  config: OctopusConfig,
  protectionBypassExecution: ProtectionBypassExecution,
): ManagedResourceModelSyncWorkflow {
  const client = createOctopusModelSyncClient(config, protectionBypassExecution)
  const summarize = (channel: OctopusChannel) => ({
    ref: createManagedChannelResourceRef(
      SITE_TYPES.OCTOPUS,
      config.baseUrl,
      channel.id,
    ),
    name: channel.name,
  })
  return {
    listChannels: async () => {
      const channels = await client.listChannels()
      return { items: channels.map(summarize), total: channels.length }
    },
    prepareBatch: async (resourceRefs) => {
      if (
        resourceRefs !== undefined &&
        (!Array.isArray(resourceRefs) || resourceRefs.length === 0)
      ) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        })
      }
      const selectedIds = resourceRefs
        ? new Set(
            resourceRefs.map((ref) =>
              requireManagedResourceChannelId(SITE_TYPES.OCTOPUS, config, ref),
            ),
          )
        : undefined
      const inventory = await client.listChannels()
      const channels = selectedIds
        ? inventory.filter((channel) => selectedIds.has(channel.id))
        : inventory
      return {
        resources: channels.map(summarize),
        run: async (options) =>
          await runOctopusBatchWithClient(config, client, channels, options),
      }
    },
  }
}
