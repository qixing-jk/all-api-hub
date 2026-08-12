/**
 * Octopus 模型同步服务
 * 实现 Octopus 站点的模型同步功能
 */
import { SITE_TYPES } from "~/constants/siteType"
import { octopusManagedSiteChannels } from "~/services/apiAdapters/managedSites/octopus"
import * as octopusApi from "~/services/apiService/octopus"
import { ApiError } from "~/services/apiTransport/errors"
import {
  consumeManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_RETRY_DECISIONS,
  type ManagedSiteMutationRetryDecision,
} from "~/services/managedSites/mutations"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/managedSite"
import type { ChannelResourceConfigMap } from "~/types/channelConfig"
import type {
  ManagedSiteChannel,
  OctopusChannelWithData,
} from "~/types/managedSite"
import {
  type BatchExecutionOptions,
  type ExecutionItemResult,
  type ExecutionResult,
  type ExecutionStatistics,
} from "~/types/managedSiteModelSync"
import type { OctopusChannel, OctopusFetchModelRequest } from "~/types/octopus"
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

/**
 * 类型守卫：检查 channel 是否为 OctopusChannelWithData
 */
function isOctopusChannelWithData(
  channel: ManagedSiteChannel,
): channel is OctopusChannelWithData {
  return "_octopusData" in channel && channel._octopusData != null
}

/**
 * 从 ManagedSiteChannel 中提取 Octopus 原始数据
 */
function getOctopusChannelData(
  channel: ManagedSiteChannel,
): OctopusChannel | null {
  if (isOctopusChannelWithData(channel)) {
    return channel._octopusData
  }
  return null
}

/**
 * 获取渠道的上游模型列表
 */
async function fetchChannelModels(
  config: OctopusConfig,
  channel: ManagedSiteChannel,
  abortSignal?: AbortSignal,
): Promise<string[]> {
  const octopusData = getOctopusChannelData(channel)
  if (!octopusData) {
    throw new Error("Missing Octopus channel data")
  }

  const request: OctopusFetchModelRequest = {
    type: octopusData.type,
    base_urls: octopusData.base_urls,
    keys: octopusData.keys,
    proxy: octopusData.proxy,
  }

  throwIfAborted(abortSignal)
  return abortSignal
    ? await octopusApi.fetchRemoteModels(config, request, {
        signal: abortSignal,
      })
    : await octopusApi.fetchRemoteModels(config, request)
}

/**
 * 更新渠道的模型列表
 */
async function updateChannelModels(
  config: OctopusConfig,
  channel: ManagedSiteChannel,
  models: string[],
  abortSignal?: AbortSignal,
): Promise<void> {
  throwIfAborted(abortSignal)
  const result = await octopusManagedSiteChannels.updateModels!(
    config,
    channel.id,
    models,
    abortSignal ? { signal: abortSignal } : undefined,
  )
  await consumeManagedSiteMutationResult(result, {
    idempotent: true,
    retryableRejection: true,
    knownSecrets: collectManagedConfigSecrets(config),
    knownSecretsComplete: true,
    reconcile: async () => {
      await octopusManagedSiteChannels.list?.(
        config,
        abortSignal ? { signal: abortSignal } : undefined,
      )
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
  channel: ManagedSiteChannel,
  maxRetries: number = 2,
  abortSignal?: AbortSignal,
  writeFailureBoundary: ModelSyncWriteFailureBoundary = createModelSyncWriteFailureBoundary(),
  channelConfigs?: ChannelResourceConfigMap,
): Promise<ExecutionItemResult> {
  let attempts = 0
  let lastError: unknown = null

  const oldModels = channel.models
    ? channel.models
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    : []

  while (attempts <= maxRetries) {
    try {
      throwIfAborted(abortSignal)
      const fetchedModels = await fetchChannelModels(
        config,
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
          channel,
          managedConfig: { siteType: SITE_TYPES.OCTOPUS, config },
          cache: new Map(),
          abortSignal,
        },
      )

      if (haveModelsChanged(oldModels, channelScopedModels)) {
        try {
          await updateChannelModels(
            config,
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
export async function runOctopusBatch(
  config: OctopusConfig,
  channels: ManagedSiteChannel[],
  options: BatchExecutionOptions & {
    channelConfigs?: ChannelResourceConfigMap
  },
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
              channel,
              maxRetries,
              abortSignal,
              writeFailureBoundary,
              channelConfigs,
            ),
          channel,
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
