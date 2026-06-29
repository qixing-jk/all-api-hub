import { union } from "lodash-es"

import type { ManagedSiteChannelsCapability } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { type ManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import type { ChannelConfigMap } from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  isPatternChannelModelFilterRule,
  isProbeChannelModelFilterRule,
} from "~/types/channelModelFilters"
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
import { createLogger } from "~/utils/core/logger"

import {
  matchesProbeFilterRule,
  ProbeFilterUnavailableError,
  type ProbeFilterContext,
} from "./channelModelFilterEvaluator"
import { runWithChannelProcessingTimeout } from "./channelProcessingTimeout"
import { RateLimiter } from "./rateLimiter"

const PROBE_FILTER_TIMEOUT_MS = 30_000

type ModelSyncChannelListCapability = ManagedSiteChannelsCapability & {
  list: NonNullable<ManagedSiteChannelsCapability["list"]>
}

type ModelSyncChannelCapabilities = ManagedSiteChannelsCapability & {
  fetchModels: NonNullable<ManagedSiteChannelsCapability["fetchModels"]>
  updateModels: NonNullable<ManagedSiteChannelsCapability["updateModels"]>
  updateModelMapping: NonNullable<
    ManagedSiteChannelsCapability["updateModelMapping"]
  >
}

/**
 * Unified logger scoped to managed-site model synchronization.
 */
const logger = createLogger("ManagedSiteModelSync")

/**
 * Stop channel work before writeback when its timeout cancellation has fired.
 */
function throwIfAborted(abortSignal?: AbortSignal) {
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new Error("Channel processing aborted")
  }
}

/**
 * New API Model Sync Service
 * Handles channel operations for model synchronization
 */
export class ModelSyncService {
  private managedSiteConfig: ManagedSiteRuntimeConfig
  private rateLimiter: RateLimiter | null = null
  private allowedModelSet: Set<string> | null = null
  private channelConfigs: ChannelConfigMap | null = null
  private globalChannelModelFilters: ChannelModelFilterRule[] | null = null

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
    channelConfigs?: ChannelConfigMap | null,
    globalChannelModelFilters?: ChannelModelFilterRule[] | null,
  ) {
    this.managedSiteConfig = managedSiteConfig
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

  private createProbeFilterAbortSignal(): {
    signal: AbortSignal
    cleanup: () => void
  } {
    if (typeof AbortSignal.timeout === "function") {
      return {
        signal: AbortSignal.timeout(PROBE_FILTER_TIMEOUT_MS),
        cleanup: () => {},
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, PROBE_FILTER_TIMEOUT_MS)

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeoutId)
      },
    }
  }

  private getChannelListCapability(): ModelSyncChannelListCapability {
    const channels = getSiteTypeCapabilities(this.managedSiteConfig.siteType)
      .managedSites?.channels

    if (!channels?.list) {
      throw new Error(
        `managed-site channel listing is not implemented for ${this.managedSiteConfig.siteType}`,
      )
    }

    return channels as ModelSyncChannelListCapability
  }

  private getModelSyncChannelCapabilities(): ModelSyncChannelCapabilities {
    const channels = getSiteTypeCapabilities(this.managedSiteConfig.siteType)
      .managedSites?.channels

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
      return await this.getChannelListCapability().list(
        this.managedSiteConfig.config,
        {
          beforeRequest: async () => this.throttle(),
          ...(this.rateLimiter ? { bypassSiteRequestLimit: true } : {}),
        },
      )
    } catch (error) {
      logger.error("Failed to list channels", error)
      throw error
    }
  }

  /**
   * Fetch raw model list for a given channel.
   * @param channelId Target channel id.
   * @returns Model identifiers returned by upstream.
   */
  async fetchChannelModels(
    channelId: number,
    abortSignal?: AbortSignal,
  ): Promise<string[]> {
    try {
      await this.throttle()
      throwIfAborted(abortSignal)

      return await this.getModelSyncChannelCapabilities().fetchModels(
        this.managedSiteConfig.config,
        channelId,
        this.createChannelRequestOptions(abortSignal),
      )
    } catch (error: any) {
      logger.error("Failed to fetch models", { channelId, error })
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
    abortSignal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.throttle()
      throwIfAborted(abortSignal)

      await this.getModelSyncChannelCapabilities().updateModels(
        this.managedSiteConfig.config,
        channel.id,
        models,
        this.createChannelRequestOptions(abortSignal),
      )
    } catch (error: any) {
      logger.error("Failed to update channel", { channelId: channel.id, error })
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
    abortSignal?: AbortSignal,
  ): Promise<void> {
    try {
      const updateModels = union(
        channel.models
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean),
        Object.keys(modelMapping),
      )
      await this.throttle()
      throwIfAborted(abortSignal)

      await this.getModelSyncChannelCapabilities().updateModelMapping(
        this.managedSiteConfig.config,
        channel.id,
        updateModels,
        modelMapping,
        this.createChannelRequestOptions(abortSignal),
      )
    } catch (error) {
      logger.error("Failed to update channel mapping", {
        channelId: channel.id,
        error,
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
    channel: ManagedSiteChannel,
    maxRetries: number = 2,
    abortSignal?: AbortSignal,
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
        throwIfAborted(abortSignal)
        const fetchedModels = await this.fetchChannelModels(
          channel.id,
          abortSignal,
        )
        throwIfAborted(abortSignal)
        const allowListedModels = this.filterAllowedModels(fetchedModels)
        const probeFilterCache = new Map<string, boolean>()
        const probeFilterAbort = this.createProbeFilterAbortSignal()
        const probeContext: ProbeFilterContext = {
          channel,
          managedConfig: this.managedSiteConfig,
          cache: probeFilterCache,
          abortSignal: probeFilterAbort.signal,
        }
        try {
          const globallyScopedModels = await this.applyFilters(
            this.globalChannelModelFilters,
            allowListedModels,
            probeContext,
          )
          const channelScopedModels = await this.applyChannelFilters(
            channel.id,
            globallyScopedModels,
            probeContext,
          )
          throwIfAborted(abortSignal)

          if (this.haveModelsChanged(oldModels, channelScopedModels)) {
            // Only push an update when model sets differ to avoid unnecessary writes
            await this.updateChannelModels(
              channel,
              channelScopedModels,
              abortSignal,
            )
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
        } finally {
          probeFilterAbort.cleanup()
        }
      } catch (error: any) {
        if (abortSignal?.aborted) {
          throw error
        }

        if (error instanceof ProbeFilterUnavailableError) {
          logger.warn("Probe-backed channel filter skipped model update", {
            channelId: channel.id,
            reason: error.reason,
          })
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
    const { concurrency, maxRetries, channelProcessingTimeout, onProgress } =
      options
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
          result = await runWithChannelProcessingTimeout(
            (abortSignal) =>
              this.runForChannel(channel, maxRetries, abortSignal),
            channel,
            maxRetries,
            channelProcessingTimeout,
          )
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
  private async applyFilters(
    rules: ChannelModelFilterRule[] | null | undefined,
    models: string[],
    probeContext?: ProbeFilterContext,
  ): Promise<string[]> {
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
      result = await this.filterByRuleMatches(
        result,
        includeRules,
        true,
        probeContext,
      )
    }

    if (result.length === 0) {
      return result
    }

    if (excludeRules.length > 0) {
      result = await this.filterByRuleMatches(
        result,
        excludeRules,
        false,
        probeContext,
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
  private applyChannelFilters(
    channelId: number,
    models: string[],
    probeContext: ProbeFilterContext,
  ): Promise<string[]> {
    const rules =
      this.channelConfigs?.[channelId]?.modelFilterSettings?.rules ?? []
    return this.applyFilters(rules, models, probeContext)
  }

  private async filterByRuleMatches(
    models: string[],
    rules: ChannelModelFilterRule[],
    keepMatchingModels: boolean,
    probeContext?: ProbeFilterContext,
  ): Promise<string[]> {
    const result: string[] = []

    for (const model of models) {
      const matched = await this.anyRuleMatches(rules, model, probeContext)
      if (matched === keepMatchingModels) {
        result.push(model)
      }
    }

    return result
  }

  private async anyRuleMatches(
    rules: ChannelModelFilterRule[],
    model: string,
    probeContext?: ProbeFilterContext,
  ): Promise<boolean> {
    for (const rule of rules) {
      if (await this.matchesFilter(rule, model, probeContext)) {
        return true
      }
    }

    return false
  }

  /**
   * Evaluates a model name against a filter rule. Regex patterns are compiled
   * with `new RegExp(pattern, "i")`, enforcing case-insensitive matching and
   * avoiding custom flags for predictability across browsers.
   * @param rule Filter rule.
   * @param model Model name to test.
   * @returns Whether the model matches the rule.
   */
  private async matchesFilter(
    rule: ChannelModelFilterRule,
    model: string,
    probeContext?: ProbeFilterContext,
  ): Promise<boolean> {
    if (isProbeChannelModelFilterRule(rule)) {
      if (!probeContext) {
        throw new ProbeFilterUnavailableError(
          "provider-unsupported",
          "Probe filtering cannot run without a managed-site channel context.",
        )
      }
      return matchesProbeFilterRule(rule, model, probeContext)
    }

    if (!isPatternChannelModelFilterRule(rule)) {
      return false
    }

    const pattern = rule.pattern?.trim()
    if (!pattern) return false

    try {
      if (rule.isRegex) {
        const regex = new RegExp(pattern, "i")
        return regex.test(model)
      }

      return model.toLowerCase().includes(pattern.toLowerCase())
    } catch (error) {
      logger.warn("Invalid channel filter pattern for channel rule", {
        ruleId: rule.id,
        error,
      })
      return false
    }
  }
}
