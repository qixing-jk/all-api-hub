/**
 * Octopus 模型同步服务
 * 实现 Octopus 站点的模型同步功能
 */
import { SITE_TYPES } from "~/constants/siteType"
import { octopusManagedResourceModels } from "~/services/apiAdapters/managedSites/octopus"
import * as octopusApi from "~/services/apiService/octopus"
import { ApiError } from "~/services/apiTransport/errors"
import {
  consumeManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_RETRY_DECISIONS,
  type ManagedSiteMutationRetryDecision,
} from "~/services/managedSites/mutations"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/managedSite"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ChannelResourceConfigMap } from "~/types/channelConfig"
import {
  type BatchExecutionOptions,
  type ExecutionItemResult,
  type ExecutionResult,
  type ExecutionStatistics,
} from "~/types/managedSiteModelSync"
import type { OctopusChannel, OctopusFetchModelInput } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  applyChannelModelFilters,
  getChannelModelFilterRulesForResource,
  ProbeFilterUnavailableError,
} from "./channelModelFilterEvaluator"
import { runWithChannelProcessingTimeout } from "./channelProcessingTimeout"
import {
  createModelSyncWriteFailureBoundary,
  type ModelSyncWriteFailureBoundary,
} from "./writeFailureBoundary"

const logger = createLogger("OctopusModelSync")

type OctopusModelSyncBatchOptions = BatchExecutionOptions & {
  channelConfigs?: ChannelResourceConfigMap
}

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
        channelId,
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
            id: channel.id,
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
        channelId: channel.id,
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
          channelId: channel.id,
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
        channelId: channel.id,
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
    channelId: channel.id,
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
  options: OctopusModelSyncBatchOptions,
): Promise<ExecutionResult> {
  const {
    concurrency,
    maxRetries,
    channelProcessingTimeout,
    channelConfigs,
    onProgress,
  } = options
  const startedAt = Date.now()
  const total = channels.length
  const results: (ExecutionItemResult | undefined)[] = new Array(total)

  let completed = 0
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= total) {
        return
      }
      nextIndex++

      const channel = channels[currentIndex]
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
            channelId: channel.id,
            channelName: channel.name,
            oldModels: getOctopusChannelModels(channel),
          },
          maxRetries,
          channelProcessingTimeout,
        )
      } catch (error: any) {
        if (writeFailureBoundary.matches(error)) throw error
        logger.error("Unexpected error for channel", {
          channelId: channel.id,
          error,
        })
        result = {
          channelId: channel.id,
          channelName: channel.name,
          ok: false,
          message: error?.message || "Unexpected error",
          attempts: maxRetries + 1,
          finishedAt: Date.now(),
        }
      }

      results[currentIndex] = result
      completed++

      await onProgress?.({
        completed,
        total,
        lastResult: result,
      })
    }
  }

  // Cap workers to total channels to avoid spinning idle workers
  const workerCount = Math.max(1, Math.min(concurrency, total))
  const workers = Array.from({ length: workerCount }, () => worker())
  await Promise.all(workers)

  const items = results.filter((item): item is ExecutionItemResult => !!item)

  const endedAt = Date.now()
  const successCount = items.filter((item) => item.ok).length
  const failureCount = total - successCount

  const statistics: ExecutionStatistics = {
    total,
    successCount,
    failureCount,
    durationMs: endedAt - startedAt,
    startedAt,
    endedAt,
  }

  return {
    items,
    statistics,
  }
}

/** Binds one Octopus config and protection intent to the complete sync workflow. */
export function createOctopusModelSyncCapability(
  config: OctopusConfig,
  protectionBypassExecution: ProtectionBypassExecution,
) {
  const client = createOctopusModelSyncClient(config, protectionBypassExecution)
  return {
    listChannels: client.listChannels,
    runBatch: async (
      channels: OctopusChannel[],
      options: OctopusModelSyncBatchOptions,
    ) => await runOctopusBatchWithClient(config, client, channels, options),
  }
}
