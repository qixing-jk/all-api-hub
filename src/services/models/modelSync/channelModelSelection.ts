import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/configuration/runtimeConfig"
import { toManagedUpstreamResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  applyChannelModelFilters,
  getChannelModelFilterRulesForResource,
  type ProbeFilterContext,
} from "~/services/models/modelSync/channelModelFilterEvaluator"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ChannelResourceConfigMap } from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedModelChannel } from "~/types/managedResourceModels"

const PROBE_FILTER_TIMEOUT_MS = 30_000

/** Owns ordered model selection and the probe evidence shared by one attempt. */
export class ChannelModelSelection {
  private readonly allowedModelSet: Set<string> | null
  private channelConfigs: ChannelResourceConfigMap | null
  private readonly globalRules: ChannelModelFilterRule[] | null

  constructor(
    private readonly managedConfig: ManagedSiteRuntimeConfig,
    allowedModels?: string[],
    channelConfigs?: ChannelResourceConfigMap | null,
    globalRules?: ChannelModelFilterRule[] | null,
    private readonly protectionBypassExecution?: ProtectionBypassExecution,
  ) {
    this.allowedModelSet = allowedModels?.length
      ? new Set(allowedModels.map((model) => model.trim()).filter(Boolean))
      : null
    this.channelConfigs = channelConfigs ?? null
    this.globalRules = globalRules?.length ? globalRules : null
  }

  setChannelConfigs(configs: ChannelResourceConfigMap | null) {
    this.channelConfigs = configs
  }

  /** Resolves allow-list, global and resource rules with one private probe context. */
  async select(
    channel: ManagedModelChannel,
    fetchedModels: string[],
  ): Promise<string[]> {
    const normalized = Array.from(
      new Set(fetchedModels.map((model) => model.trim()).filter(Boolean)),
    )
    const allowedModels = this.allowedModelSet?.size
      ? normalized.filter((model) => this.allowedModelSet!.has(model))
      : normalized
    const capabilities = getSiteTypeCapabilities(
      this.managedConfig.siteType,
    ).managedSites
    const deadline = this.createProbeDeadline()
    const context: ProbeFilterContext = {
      channel,
      managedConfig: this.managedConfig,
      matching: capabilities?.matching,
      models: capabilities?.models,
      cache: new Map<string, boolean>(),
      abortSignal: deadline.signal,
      protectionBypassExecution: this.protectionBypassExecution,
    }
    try {
      const globalModels = await applyChannelModelFilters(
        this.globalRules,
        allowedModels,
        context,
      )
      const resourceRules = getChannelModelFilterRulesForResource(
        this.channelConfigs,
        toManagedUpstreamResourceRef(channel.ref),
      )
      return await applyChannelModelFilters(
        resourceRules,
        globalModels,
        context,
      )
    } finally {
      deadline.cleanup()
    }
  }

  private createProbeDeadline(): { signal: AbortSignal; cleanup: () => void } {
    if (typeof AbortSignal.timeout === "function") {
      return {
        signal: AbortSignal.timeout(PROBE_FILTER_TIMEOUT_MS),
        cleanup: () => {},
      }
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      PROBE_FILTER_TIMEOUT_MS,
    )
    return { signal: controller.signal, cleanup: () => clearTimeout(timeoutId) }
  }
}
