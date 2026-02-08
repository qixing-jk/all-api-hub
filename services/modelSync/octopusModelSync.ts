/**
 * Octopus 模型同步服务
 * 实现 Octopus 站点的模型同步功能
 */
import { ApiError } from "~/services/apiService/common/errors"
import * as octopusApi from "~/services/apiService/octopus"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  BatchExecutionOptions,
  ExecutionItemResult,
  ExecutionResult,
  ExecutionStatistics,
} from "~/types/managedSiteModelSync"
import type { OctopusChannel, OctopusFetchModelRequest } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const logger = createLogger("OctopusModelSync")

/**
 * 从 ManagedSiteChannel 中提取 Octopus 原始数据
 */
function getOctopusChannelData(
  channel: ManagedSiteChannel,
): OctopusChannel | null {
  const octopusData = (
    channel as ManagedSiteChannel & { _octopusData?: OctopusChannel }
  )._octopusData
  return octopusData ?? null
}

/**
 * 获取渠道的上游模型列表
 */
async function fetchChannelModels(
  config: OctopusConfig,
  channel: ManagedSiteChannel,
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

  return await octopusApi.fetchRemoteModels(config, request)
}

/**
 * 更新渠道的模型列表
 */
async function updateChannelModels(
  config: OctopusConfig,
  channel: ManagedSiteChannel,
  models: string[],
): Promise<void> {
  await octopusApi.updateChannel(config, {
    id: channel.id,
    model: models.join(","),
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
      const fetchedModels = await fetchChannelModels(config, channel)
      const normalizedModels = Array.from(
        new Set(fetchedModels.map((model) => model.trim()).filter(Boolean)),
      )

      if (haveModelsChanged(oldModels, normalizedModels)) {
        await updateChannelModels(config, channel, normalizedModels)
      }

      return {
        channelId: channel.id,
        channelName: channel.name,
        ok: true,
        attempts,
        finishedAt: Date.now(),
        oldModels,
        newModels: normalizedModels,
        message: "Success",
      }
    } catch (error: unknown) {
      lastError = error
      logger.error("Unexpected error for channel", {
        channelId: channel.id,
        error,
      })

      attempts += 1
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
  options: BatchExecutionOptions,
): Promise<ExecutionResult> {
  const { concurrency, maxRetries, onProgress } = options
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

      try {
        result = await runForChannel(config, channel, maxRetries)
      } catch (error: any) {
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
