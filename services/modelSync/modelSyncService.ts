import { union } from "lodash-es"

import { NEW_API, type ManagedSiteType } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"
import type { ChannelConfigMap } from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  type ManagedSiteChannel,
  type ManagedSiteChannelListData,
} from "~/types/managedSite"
import {
  BatchExecutionOptions,
  ExecutionItemResult,
  ExecutionResult,
  ExecutionStatistics,
} from "~/types/managedSiteModelSync"

import { RateLimiter } from "./rateLimiter"

/**
 * New API Model Sync Service
 * Handles channel operations for model synchronization
 */
export class ModelSyncService {
  private baseUrl: string
  private token: string
  private userId?: string
  private siteType: ManagedSiteType
  private rateLimiter: RateLimiter | null = null
  private allowedModelSet: Set<string> | null = null
  private channelConfigs: ChannelConfigMap | null = null
  private globalChannelModelFilters: ChannelModelFilterRule[] | null = null

  /**
   * Create a model sync service bound to a specific New API instance.
   * @param baseUrl New API base URL.
   * @param token Admin token for channel operations.
   * @param userId Optional user id for header injection.
   * @param rateLimitConfig Optional RPM/burst limits for upstream calls.
   * @param rateLimitConfig.requestsPerMinute Maximum allowed requests per minute.
   * @param rateLimitConfig.burst Maximum burst size before throttling kicks in.
   * @param allowedModels Optional allow-list to constrain synced models.
   * @param channelConfigs Optional per-channel filter/settings cache.
   * @param globalChannelModelFilters Optional global include/exclude rules.
   */
  constructor(
    baseUrl: string,
    token: string,
    userId?: string,
    rateLimitConfig?: { requestsPerMinute: number; burst: number },
    allowedModels?: string[],
    channelConfigs?: ChannelConfigMap | null,
    globalChannelModelFilters?: ChannelModelFilterRule[] | null,
    siteType: ManagedSiteType = NEW_API,
  ) {
    this.baseUrl = baseUrl
    this.token = token
    this.userId = userId
    this.siteType = siteType
    if (rateLimitConfig) {
      this.rateLimiter = new RateLimiter(
        rateLimitConfig.requestsPerMinute,
        rateLimitConfig.burst,
      )
    }
    if (allowedModels && allowedModels.length > 0) {
      this.allowedModelSet = new Set(
        allowedModels.map((model) => model.trim()).filter(Boolean),
      )
    }
    if (channelConfigs) {
      this.channelConfigs = channelConfigs
    }
    if (globalChannelModelFilters && globalChannelModelFilters.length > 0) {
      this.globalChannelModelFilters = globalChannelModelFilters
    }
  }

  /**
   * Update in-memory channel configs to be used by per-channel filters.
   * @param configs Cached channel configuration map; null clears cache.
   */
  setChannelConfigs(configs: ChannelConfigMap | null) {
    this.channelConfigs = configs
  }

  /**
   * Respect optional rate limiter before issuing upstream requests.
   */
  private async throttle() {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire()
    }
  }

  /**
   * List all channels from New API
   *
   * Aggregates totals/type_counts across paginated results.
   */
  /**
   * Fetch all channels from New API with pagination aggregation.
   * @returns Channel list data including totals and type counts.
   */
  async listChannels(): Promise<ManagedSiteChannelListData> {
    try {
      return await getApiService(this.siteType).listAllChannels(
        {
          baseUrl: this.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: this.token,
            userId: this.userId,
          },
        },
        {
          beforeRequest: async () => {
            await this.throttle()
          },
        },
      )
    } catch (error) {
      console.error("[ManagedSiteModelSync] Failed to list channels:", error)
      throw error
    }
  }

  /**
   * Fetch raw model list for a given channel.
   * @param channelId Target channel id.
   * @returns Model identifiers returned by upstream.
   */
  async fetchChannelModels(channelId: number): Promise<string[]> {
    try {
      await this.throttle()

      return await getApiService(this.siteType).fetchChannelModels(
        {
          baseUrl: this.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: this.token,
            userId: this.userId,
          },
        },
        channelId,
      )
    } catch (error: any) {
      console.error("[ManagedSiteModelSync] Failed to fetch models:", error)
      throw error
    }
  }

  /**
   * Persist models field for a channel (model_mapping handled separately).
   * @param channel Channel to update.
   * @param models Canonical model list to write.
   */
  async updateChannelModels(
    channel: ManagedSiteChannel,
    models: string[],
  ): Promise<void> {
    try {
      await this.throttle()

      await getApiService(this.siteType).updateChannelModels(
        {
          baseUrl: this.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: this.token,
            userId: this.userId,
          },
        },
        channel.id,
        models.join(","),
      )
    } catch (error: any) {
      console.error("[ManagedSiteModelSync] Failed to update channel:", error)
      throw error
    }
  }

  /**
   * Persist model_mapping while ensuring models contains all mapped keys.
   * @param channel Channel to update.
   * @param modelMapping Standard→actual mapping to write.
   */
  async updateChannelModelMapping(
    channel: ManagedSiteChannel,
    modelMapping: Record<string, string>,
  ): Promise<void> {
    try {
      const updateModels = union(
        channel.models.split(","),
        Object.keys(modelMapping),
      ).join(",")
      await this.throttle()

      await getApiService(this.siteType).updateChannelModelMapping(
        {
          baseUrl: this.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: this.token,
            userId: this.userId,
          },
        },
        channel.id,
        updateModels,
        JSON.stringify(modelMapping),
      )
    } catch (error) {
      console.error(
        `[ManagedSiteModelSync] Failed to update channel mapping for channel ${channel.id}:`,
        error,
      )
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
    channel: ManagedSiteChannel,
    maxRetries: number = 2,
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
      try {
        const fetchedModels = await this.fetchChannelModels(channel.id)
        const allowListedModels = this.filterAllowedModels(fetchedModels)
        const globallyScopedModels = this.applyFilters(
          this.globalChannelModelFilters,
          allowListedModels,
        )
        const channelScopedModels = this.applyChannelFilters(
          channel.id,
          globallyScopedModels,
        )

        if (this.haveModelsChanged(oldModels, channelScopedModels)) {
          // Only push an update when model sets differ to avoid unnecessary writes
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
          message: "Success",
        }
      } catch (error: any) {
        lastError = error
        console.error(
          `[ManagedSiteModelSync] Unexpected error for channel ${channel.id}:`,
          error,
        )

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
        nextIndex++ // single shared index for lightweight work stealing

        const channel = channels[currentIndex]
        let result: ExecutionItemResult

        try {
          result = await this.runForChannel(channel, maxRetries)
        } catch (error: any) {
          console.error(
            `[ManagedSiteModelSync] Unexpected error for channel ${channel.id}:`,
            error,
          )
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

  /**
   * Apply optional allow-list and dedupe/trim models.
   * @param models Models fetched upstream.
   * @returns Normalized models limited by allow-list when present.
   */
  private filterAllowedModels(models: string[]): string[] {
    if (!this.allowedModelSet || this.allowedModelSet.size === 0) {
      return Array.from(
        new Set(models.map((model) => model.trim()).filter(Boolean)),
      )
    }

    const filtered = models
      .map((model) => model.trim())
      .filter((model) => model && this.allowedModelSet!.has(model))

    return Array.from(new Set(filtered))
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

  /**
   * Applies a list of include/exclude rules to the provided model list.
   *
   * Steps:
   * 1. Normalize incoming model names (trim + dedupe).
   * 2. If no enabled filters exist, return normalized models as-is.
   * 3. Apply include rules (OR logic). At least one include must match when
   *    include rules are present; otherwise the model is dropped.
   * 4. Apply exclude rules (OR logic). Any match removes the model.
   */
  private applyFilters(
    rules: ChannelModelFilterRule[] | null | undefined,
    models: string[],
  ): string[] {
    const normalized = Array.from(
      new Set(models.map((model) => model.trim()).filter(Boolean)),
    )
    if (!normalized.length) {
      return normalized
    }

    const filters = rules?.filter((rule) => rule.enabled)
    if (!filters || filters.length === 0) {
      return normalized
    }

    const includeRules = filters.filter((rule) => rule.action === "include")
    const excludeRules = filters.filter((rule) => rule.action === "exclude")

    let result = normalized

    if (includeRules.length > 0) {
      result = result.filter((model) =>
        includeRules.some((rule) => this.matchesFilter(rule, model)),
      )
    }

    if (result.length === 0) {
      return result
    }

    if (excludeRules.length > 0) {
      result = result.filter(
        (model) =>
          !excludeRules.some((rule) => this.matchesFilter(rule, model)),
      )
    }

    return result
  }

  /**
   * Applies the per-channel include/exclude filters defined in channel configs
   * to the provided models.
   * @param channelId Channel id for looking up config rules.
   * @param models Models after global filtering.
   */
  private applyChannelFilters(channelId: number, models: string[]): string[] {
    const rules =
      this.channelConfigs?.[channelId]?.modelFilterSettings?.rules ?? []
    return this.applyFilters(rules, models)
  }

  /**
   * Evaluates a model name against a filter rule. Regex patterns are compiled
   * with `new RegExp(pattern, "i")`, enforcing case-insensitive matching and
   * avoiding custom flags for predictability across browsers.
   * @param rule Filter rule.
   * @param model Model name to test.
   * @returns Whether the model matches the rule.
   */
  private matchesFilter(rule: ChannelModelFilterRule, model: string): boolean {
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
        `[ManagedSiteModelSync] Invalid channel filter pattern for channel rule ${rule.id}:`,
        error,
      )
      return false
    }
  }
}
