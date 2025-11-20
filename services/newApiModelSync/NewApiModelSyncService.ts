import { union } from "lodash-es"

import { ApiError } from "~/services/apiService/common/errors"
import { fetchAllItems } from "~/services/apiService/common/pagination"
import { fetchApi } from "~/services/apiService/common/utils"
import {
  NewApiChannel,
  NewApiChannelListData,
  UpdateChannelPayload
} from "~/types"
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

  constructor(
    baseUrl: string,
    token: string,
    userId?: string,
    rateLimitConfig?: { requestsPerMinute: number; burst: number },
    allowedModels?: string[]
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
      attempts++

      try {
        // Fetch new models
        const fetchedModels = await this.fetchChannelModels(channel.id)
        const newModels = this.filterAllowedModels(fetchedModels)

        // Update channel if models changed
        if (
          JSON.stringify(oldModels.sort()) !== JSON.stringify(newModels.sort())
        ) {
          await this.updateChannelModels(channel, newModels)
        }

        // Success
        return {
          channelId: channel.id,
          channelName: channel.name,
          ok: true,
          attempts,
          finishedAt: Date.now(),
          oldModels,
          newModels,
          message: "Success"
        }
      } catch (error: any) {
        lastError = error

        // If this is not the last attempt, wait with exponential backoff
        if (attempts <= maxRetries) {
          const backoffMs = Math.pow(2, attempts - 1) * 1000
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
        }
      }
    }

    // All retries failed
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
}
