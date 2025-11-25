import { union } from "lodash-es"

import { ApiError } from "~/services/apiService/common/errors"
import { fetchAllItems } from "~/services/apiService/common/pagination"
import { fetchApi } from "~/services/apiService/common/utils"
import {
  NewApiChannel,
  NewApiChannelListData,
  UpdateChannelPayload
} from "~/types"
import type { ChannelConfigMap } from "~/types/channelConfig"
import type { ChannelFilterRule } from "~/types/channelFilters"
import {
  BatchExecutionOptions,
  ExecutionItemResult,
  ExecutionResult,
  ExecutionStatistics
} from "~/types/newApiModelSync"

import { RateLimiter } from "./RateLimiter"

/**
 * New API Model Sync Service
 * Handles channel operations for model synchronization
 */
export class NewApiModelSyncService {
  private baseUrl: string
  private token: string
  private userId?: string
  private rateLimiter: RateLimiter | null = null
  private allowedModelSet: Set<string> | null = null
  private channelConfigs: ChannelConfigMap | null = null

  constructor(
    baseUrl: string,
    token: string,
    userId?: string,
    rateLimitConfig?: { requestsPerMinute: number; burst: number },
    allowedModels?: string[],
    channelConfigs?: ChannelConfigMap | null
  ) {
    this.baseUrl = baseUrl
    this.token = token
    this.userId = userId
    if (rateLimitConfig) {
      this.rateLimiter = new RateLimiter(
        rateLimitConfig.requestsPerMinute,
        rateLimitConfig.burst
      )
    }
    if (allowedModels && allowedModels.length > 0) {
      this.allowedModelSet = new Set(
        allowedModels.map((model) => model.trim()).filter(Boolean)
      )
    }
    if (channelConfigs) {
      this.channelConfigs = channelConfigs
    }
  }

  setChannelConfigs(configs: ChannelConfigMap | null) {
    this.channelConfigs = configs
  }

  private async throttle() {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire()
    }
  }

  /**
   * List all channels from New API
   */
  async listChannels(): Promise<NewApiChannelListData> {
    try {
      let total = 0
      const typeCounts: Record<string, number> = {}

      const items = await fetchAllItems<NewApiChannel>(async (page) => {
        const params = new URLSearchParams({
          p: page.toString(),
          page_size: "100"
        })

        await this.throttle()

        const response = await fetchApi<NewApiChannelListData>(
          {
            baseUrl: this.baseUrl,
            endpoint: `/api/channel/?${params.toString()}`,
            userId: this.userId,
            token: this.token
          },
          false
        )

        if (!response.success || !response.data) {
          throw new ApiError(
            response.message || "Failed to fetch channels",
            undefined,
            "/api/channel/"
          )
        }

        const data = response.data
        if (page === 1) {
          total = data.total || data.items.length || 0
          Object.assign(typeCounts, data.type_counts || {})
        } else if (data.type_counts) {
          for (const [key, value] of Object.entries(data.type_counts)) {
            typeCounts[key] = (typeCounts[key] || 0) + value
          }
        }

        return {
          items: data.items || [],
          total: data.total || 0
        }
      })

      return {
        items,
        total,
        type_counts: typeCounts
      }
    } catch (error) {
      console.error("[NewApiModelSync] Failed to list channels:", error)
      throw error
    }
  }

  /**
   * Fetch models for a specific channel
   */
  async fetchChannelModels(channelId: number): Promise<string[]> {
    try {
      await this.throttle()

      const response = await fetchApi<string[]>(
        {
          baseUrl: this.baseUrl,
          endpoint: `/api/channel/fetch_models/${channelId}`,
          userId: this.userId,
          token: this.token
        },
        false
      )

      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(response.message || "Failed to fetch models")
      }

      return response.data
    } catch (error: any) {
      console.error("[NewApiModelSync] Failed to fetch models:", error)
      throw error
    }
  }

  /**
   * Update channel models
   * Strategy: Update models field (model_mapping handled separately)
   */
  async updateChannelModels(
    channel: NewApiChannel,
    models: string[]
  ): Promise<void> {
    try {
      // Prepare the update payload
      const updatePayload: UpdateChannelPayload = {
        id: channel.id,
        models: models.join(",")
      }

      await this.throttle()

      const response = await fetchApi<void>(
        {
          baseUrl: this.baseUrl,
          endpoint: "/api/channel/",
          userId: this.userId,
          token: this.token,
          options: {
            method: "PUT",
            body: JSON.stringify(updatePayload)
          }
        },
        false
      )

      if (!response.success) {
        throw new Error(response.message || "Failed to update channel")
      }
    } catch (error: any) {
      console.error("[NewApiModelSync] Failed to update channel:", error)
      throw error
    }
  }

  /**
   * Update channel model_mapping
   */
  async updateChannelModelMapping(
    channel: NewApiChannel,
    modelMapping: Record<string, string>
  ): Promise<void> {
    try {
      const updateModels = union(
        channel.models.split(","),
        Object.keys(modelMapping)
      ).join(",")

      const updatePayload: UpdateChannelPayload = {
        id: channel.id,
        models: updateModels,
        model_mapping: JSON.stringify(modelMapping)
      }

      await this.throttle()

      const response = await fetchApi<void>(
        {
          baseUrl: this.baseUrl,
          endpoint: "/api/channel/",
          userId: this.userId,
          token: this.token,
          options: {
            method: "PUT",
            body: JSON.stringify(updatePayload)
          }
        },
        false
      )

      if (!response.success) {
        throw new Error(response.message || "Failed to update channel mapping")
      }
    } catch (error) {
      console.error(
        `[NewApiModelSync] Failed to update channel mapping for channel ${channel.id}:`,
        error
      )
      throw error
    }
  }

  /**
   * Execute sync for a single channel with retry logic
   */
  async runForChannel(
    channel: NewApiChannel,
    maxRetries: number = 2
  ): Promise<ExecutionItemResult> {
    let attempts = 0
    let lastError: any = null

    const oldModels = channel.models
      ? channel.models
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean)
      : []

    while (attempts <= maxRetries) {
      attempts += 1

      try {
        const fetchedModels = await this.fetchChannelModels(channel.id)
        const allowListedModels = this.filterAllowedModels(fetchedModels)
        const channelScopedModels = this.applyChannelFilters(
          channel.id,
          allowListedModels
        )

        if (this.haveModelsChanged(oldModels, channelScopedModels)) {
          await this.updateChannelModels(channel, channelScopedModels)
          channel.models = channelScopedModels.join(",")
        }

        return {
          channelId: channel.id,
          channelName: channel.name,
          ok: true,
          attempts,
          finishedAt: Date.now(),
          oldModels,
          newModels: channelScopedModels,
          message: "Success"
        }
      } catch (error: any) {
        lastError = error
        console.error(
          `[NewApiModelSync] Unexpected error for channel ${channel.id}:`,
          error
        )

        if (attempts > maxRetries) {
          break
        }

        const backoffMs = Math.pow(2, attempts - 1) * 1000
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }

    return {
      channelId: channel.id,
      channelName: channel.name,
      ok: false,
      httpStatus: lastError?.httpStatus,
      message: lastError?.message || "Unknown error",
      attempts,
      finishedAt: Date.now(),
      oldModels
    }
  }

  /**
   * Execute sync for multiple channels with concurrency control
   */
  async runBatch(
    channels: NewApiChannel[],
    options: BatchExecutionOptions
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
          result = await this.runForChannel(channel, maxRetries)
        } catch (error: any) {
          console.error(
            `[NewApiModelSync] Unexpected error for channel ${channel.id}:`,
            error
          )
          result = {
            channelId: channel.id,
            channelName: channel.name,
            ok: false,
            message: error?.message || "Unexpected error",
            attempts: maxRetries + 1,
            finishedAt: Date.now()
          }
        }

        results[currentIndex] = result
        completed++

        await onProgress?.({
          completed,
          total,
          lastResult: result
        })
      }
    }

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
      endedAt
    }

    return {
      items,
      statistics
    }
  }

  /**
   * Apply the optional allow-list to the fetched model set.
   * Always trims/normalizes input and removes duplicates so channel updates
   * receive a clean, deterministic list.
   */
  private filterAllowedModels(models: string[]): string[] {
    if (!this.allowedModelSet || this.allowedModelSet.size === 0) {
      return Array.from(
        new Set(models.map((model) => model.trim()).filter(Boolean))
      )
    }

    const filtered = models
      .map((model) => model.trim())
      .filter((model) => model && this.allowedModelSet!.has(model))

    return Array.from(new Set(filtered))
  }

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

  /**
   * Applies the per-channel include/exclude filters defined in channel configs.
   *
   * Steps:
   * 1. Normalize incoming model names (trim + dedupe).
   * 2. If no filters exist, return normalized models as-is.
   * 3. Apply include rules (OR logic). At least one include must match when
   *    include rules are present; otherwise the model is dropped.
   * 4. Apply exclude rules (OR logic). Any match removes the model.
   */
  private applyChannelFilters(channelId: number, models: string[]): string[] {
    const normalized = Array.from(
      new Set(models.map((model) => model.trim()).filter(Boolean))
    )
    if (!normalized.length) {
      return normalized
    }

    const filters = this.channelConfigs?.[channelId]?.filters?.filter(
      (rule) => rule.enabled
    )
    if (!filters || filters.length === 0) {
      return normalized
    }

    const includeRules = filters.filter((rule) => rule.action === "include")
    const excludeRules = filters.filter((rule) => rule.action === "exclude")

    let result = normalized

    if (includeRules.length > 0) {
      result = result.filter((model) =>
        includeRules.some((rule) => this.matchesFilter(rule, model))
      )
    }

    if (result.length === 0) {
      return result
    }

    if (excludeRules.length > 0) {
      result = result.filter(
        (model) => !excludeRules.some((rule) => this.matchesFilter(rule, model))
      )
    }

    return result
  }

  /**
   * Evaluates a model name against a filter rule. Regex patterns are compiled
   * with `new RegExp(pattern, "i")`, enforcing case-insensitive matching and
   * avoiding custom flags for predictability across browsers.
   */
  private matchesFilter(rule: ChannelFilterRule, model: string): boolean {
    const pattern = rule.pattern?.trim()
    if (!pattern) return false

    try {
      if (rule.isRegex) {
        const regex = new RegExp(pattern, "i")
        return regex.test(model)
      }

      return model.toLowerCase().includes(pattern.toLowerCase())
    } catch (error) {
      console.warn(
        `[NewApiModelSync] Invalid channel filter pattern for channel rule ${rule.id}:`,
        error
      )
      return false
    }
  }
}
