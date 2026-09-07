import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { DoneHubChannelType } from "~/constants/doneHub"
import { ChannelType as NewApiChannelType } from "~/constants/newApi"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { VeloeraChannelType } from "~/constants/veloera"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { isSafeChannelModelFilterRegex } from "~/services/managedSites/channelModelFilterRules"
import {
  assertManagedResourceRefForSite,
  getManagedResourceRefKey,
} from "~/services/managedSites/managedResourceIdentity"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
  runApiVerificationProbe,
  toSanitizedErrorSummary,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification"
import type { ChannelResourceConfigMap } from "~/types/channelConfig"
import {
  isPatternChannelModelFilterRule,
  isProbeChannelModelFilterRule,
  type ChannelModelFilterRule,
} from "~/types/channelModelFilters"
import type { ManagedModelChannel } from "~/types/managedResourceModels"
import {
  createManagedUpstreamResourceRef,
  getManagedUpstreamResourceRefKey,
} from "~/types/managedUpstreamResource"
import { OctopusOutboundType } from "~/types/octopus"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ManagedSiteModelSyncProbeFilters")

type ProbeFilterUnavailableReason =
  | "base-url-missing"
  | "channel-type-unsupported"
  | "key-unavailable"
  | "provider-unsupported"

/**
 * Non-destructive blocker for probe-backed filtering prerequisites.
 */
export class ProbeFilterUnavailableError extends Error {
  constructor(
    public readonly reason: ProbeFilterUnavailableReason,
    message: string,
  ) {
    super(message)
    this.name = "ProbeFilterUnavailableError"
  }
}

/**
 * Per-channel context required to run probe-backed model filters.
 */
export interface ProbeFilterContext {
  channel: Pick<ManagedModelChannel, "ref" | "type" | "baseUrl" | "credential">
  managedConfig: ManagedSiteRuntimeConfig
  cache: Map<string, boolean>
  resolvedKey?: string
  abortSignal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
}

interface ProbeExecutionInput {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
}

// Type ids come from each provider's pinned channel constants. Equal numbers
// across New API, DoneHub and Octopus do not identify the same upstream protocol.
const CHANNEL_VERIFICATION_PROTOCOLS: Partial<
  Record<ManagedSiteType, Readonly<Record<string, ApiVerificationApiType>>>
> = {
  [SITE_TYPES.NEW_API]: {
    [NewApiChannelType.OpenAI]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.Azure]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.OpenAIMax]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.OhMyGPT]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.Custom]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.AILS]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.AIProxy]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.API2GPT]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.AIGC2D]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.OpenRouter]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.Moonshot]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.SiliconFlow]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.DeepSeek]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.VolcEngine]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.Xai]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.Mistral]: API_TYPES.OPENAI_COMPATIBLE,
    [NewApiChannelType.Anthropic]: API_TYPES.ANTHROPIC,
    [NewApiChannelType.Gemini]: API_TYPES.GOOGLE,
    [NewApiChannelType.VertexAi]: API_TYPES.GOOGLE,
    [NewApiChannelType.PaLM]: API_TYPES.GOOGLE,
  },
  [SITE_TYPES.VELOERA]: {
    [VeloeraChannelType.OpenAI]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.Azure]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.Custom]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.OpenRouter]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.Moonshot]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.SiliconFlow]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.DeepSeek]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.VolcEngine]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.Xai]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.Mistral]: API_TYPES.OPENAI_COMPATIBLE,
    [VeloeraChannelType.Anthropic]: API_TYPES.ANTHROPIC,
    [VeloeraChannelType.Gemini]: API_TYPES.GOOGLE,
    [VeloeraChannelType.VertexAi]: API_TYPES.GOOGLE,
    [VeloeraChannelType.PaLM]: API_TYPES.GOOGLE,
  },
  [SITE_TYPES.DONE_HUB]: {
    [DoneHubChannelType.OpenAI]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.AzureOpenAI]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.Custom]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.OpenRouter]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.Moonshot]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.SiliconFlow]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.DeepSeek]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.XAI]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.Mistral]: API_TYPES.OPENAI_COMPATIBLE,
    [DoneHubChannelType.Anthropic]: API_TYPES.ANTHROPIC,
    [DoneHubChannelType.Gemini]: API_TYPES.GOOGLE,
    [DoneHubChannelType.VertexAI]: API_TYPES.GOOGLE,
    [DoneHubChannelType.PaLM2]: API_TYPES.GOOGLE,
  },
  // https://github.com/bestruirui/octopus: native OutboundType distinguishes
  // Chat Completions, Responses, Anthropic and Gemini; embeddings lack chat probes.
  [SITE_TYPES.OCTOPUS]: {
    [OctopusOutboundType.OpenAIChat]: API_TYPES.OPENAI_COMPATIBLE,
    [OctopusOutboundType.OpenAIResponse]: API_TYPES.OPENAI,
    [OctopusOutboundType.Anthropic]: API_TYPES.ANTHROPIC,
    [OctopusOutboundType.Gemini]: API_TYPES.GOOGLE,
    [OctopusOutboundType.Volcengine]: API_TYPES.OPENAI_COMPATIBLE,
  },
  [SITE_TYPES.AXON_HUB]: {
    [AXON_HUB_CHANNEL_TYPE.OPENAI]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES]: API_TYPES.OPENAI,
    [AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.DEEPSEEK]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.OPENROUTER]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.XAI]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.SILICONFLOW]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.VOLCENGINE]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.NANOGPT]: API_TYPES.OPENAI_COMPATIBLE,
    [AXON_HUB_CHANNEL_TYPE.ANTHROPIC]: API_TYPES.ANTHROPIC,
    [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS]: API_TYPES.ANTHROPIC,
    [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP]: API_TYPES.ANTHROPIC,
    [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC]: API_TYPES.ANTHROPIC,
    [AXON_HUB_CHANNEL_TYPE.GEMINI]: API_TYPES.GOOGLE,
    [AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX]: API_TYPES.GOOGLE,
  },
  [SITE_TYPES.CLAUDE_CODE_HUB]: {
    [CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE]:
      API_TYPES.OPENAI_COMPATIBLE,
    [CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX]: API_TYPES.OPENAI,
    [CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE]: API_TYPES.ANTHROPIC,
    [CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI]: API_TYPES.GOOGLE,
  },
}

/**
 * Maps only channel types whose protocol is represented by API Verification.
 * Image/video/search-only providers and provider-specific protocols remain
 * unsupported until reusable verification probes exist for those surfaces.
 */
export function resolveApiVerificationTypeForChannelType(
  siteType: ManagedSiteType,
  channelType: unknown,
): ApiVerificationApiType | null {
  const rawType =
    typeof channelType === "number" || typeof channelType === "string"
      ? String(channelType).trim()
      : ""
  const type = /^\d+$/.test(rawType) ? String(Number(rawType)) : rawType
  const protocols = CHANNEL_VERIFICATION_PROTOCOLS[siteType]
  return protocols && Object.hasOwn(protocols, type) ? protocols[type] : null
}

/**
 * Build an in-memory cache key without embedding raw channel keys.
 */
function createCacheKey(params: {
  resourceKey: string
  keyHash: string
  apiType: ApiVerificationApiType
  modelId: string
  probeId: ApiVerificationProbeId
}) {
  return [
    params.resourceKey,
    params.keyHash,
    params.apiType,
    params.modelId,
    params.probeId,
  ].join("\u001f")
}

/**
 * Create a non-reversible in-memory key identity for per-run probe caching.
 */
function hashSecret(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Extracts managed-site secrets that must be redacted from probe diagnostics.
 */
function getRuntimeConfigSecrets(config: ManagedSiteRuntimeConfig): string[] {
  if (config.siteType === SITE_TYPES.OCTOPUS) {
    return [config.config.password]
  }

  if (config.siteType === SITE_TYPES.AXON_HUB) {
    return [config.config.password]
  }

  return [config.config.adminToken]
}

/**
 * Resolve the usable channel key from the channel row or provider capability.
 */
async function resolveChannelKey(context: ProbeFilterContext): Promise<string> {
  assertManagedResourceRefForSite(context.channel.ref, context.managedConfig)
  if (context.resolvedKey !== undefined) {
    return context.resolvedKey
  }

  const directKey = context.channel.credential?.trim() ?? ""
  if (hasUsableManagedSiteChannelKey(directKey)) {
    context.resolvedKey = directKey
    return directKey
  }

  const managedSite = getManagedSiteCapabilities(context.managedConfig.siteType)
  if (!managedSite.matching?.fetchSecretKey) {
    throw new ProbeFilterUnavailableError(
      "provider-unsupported",
      "Probe filtering is unsupported because this managed-site provider cannot resolve hidden channel keys.",
    )
  }

  try {
    const key = context.protectionBypassExecution
      ? await managedSite.matching.fetchSecretKey(
          context.managedConfig.config,
          context.channel.ref,
          { protectionBypassExecution: context.protectionBypassExecution },
        )
      : await managedSite.matching.fetchSecretKey(
          context.managedConfig.config,
          context.channel.ref,
        )
    if (!hasUsableManagedSiteChannelKey(key)) {
      throw new Error("channel_key_unavailable")
    }
    context.resolvedKey = key.trim()
    return context.resolvedKey
  } catch (error) {
    const diagnostic = toSanitizedErrorSummary(error, [
      ...getRuntimeConfigSecrets(context.managedConfig),
      directKey,
    ])
    logger.warn("Probe filter channel key resolution failed", {
      resourceKey: getManagedResourceRefKey(context.channel.ref),
      reason: diagnostic,
    })
    throw new ProbeFilterUnavailableError(
      "key-unavailable",
      "Probe filtering could not run because the channel key is unavailable or requires managed-site verification.",
    )
  }
}

/**
 * Build the inputs required by an API verification probe for this channel.
 */
async function getProbeExecutionInput(
  context: ProbeFilterContext,
): Promise<ProbeExecutionInput> {
  const apiType = resolveApiVerificationTypeForChannelType(
    context.managedConfig.siteType,
    context.channel.type,
  )
  if (!apiType) {
    throw new ProbeFilterUnavailableError(
      "channel-type-unsupported",
      "Probe filtering is unsupported for this channel type.",
    )
  }

  const baseUrl = context.channel.baseUrl.trim()
  if (!baseUrl) {
    throw new ProbeFilterUnavailableError(
      "base-url-missing",
      "Probe filtering could not run because the channel base URL is missing.",
    )
  }

  const apiKey = await resolveChannelKey(context)
  return {
    baseUrl,
    apiKey,
    apiType,
  }
}

/**
 * Evaluate whether all selected probes for a rule match the candidate model.
 */
export async function matchesProbeFilterRule(
  rule: Extract<ChannelModelFilterRule, { kind: "probe" }>,
  modelId: string,
  context: ProbeFilterContext,
): Promise<boolean> {
  if (rule.probeIds.length === 0) {
    return false
  }

  const executionInput = await getProbeExecutionInput(context)
  const keyHash = hashSecret(executionInput.apiKey)

  const probeMatches = await Promise.all(
    rule.probeIds.map(async (probeId) => {
      const cacheKey = createCacheKey({
        resourceKey: getManagedResourceRefKey(context.channel.ref),
        keyHash,
        apiType: executionInput.apiType,
        modelId,
        probeId,
      })
      const cached = context.cache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      try {
        const result = await runApiVerificationProbe({
          ...executionInput,
          modelId,
          probeId,
          abortSignal: context.abortSignal,
        })
        const matched = result.status === API_VERIFICATION_PROBE_STATUSES.Pass
        context.cache.set(cacheKey, matched)
        return matched
      } catch (error) {
        const diagnostic = toSanitizedErrorSummary(error, [
          executionInput.apiKey,
        ])
        logger.warn("Probe filter execution failed", {
          resourceKey: getManagedResourceRefKey(context.channel.ref),
          modelId,
          probeId,
          diagnostic,
        })
        context.cache.set(cacheKey, false)
        return false
      }
    }),
  )

  return rule.match === "any"
    ? probeMatches.some(Boolean)
    : probeMatches.every(Boolean)
}

type CachedChannelModelFilterRegex = {
  pattern: string
  regex: RegExp | null
}

const channelModelFilterRegexCache = new WeakMap<
  ChannelModelFilterRule,
  CachedChannelModelFilterRegex
>()

/** Validates and compiles a regex once for each rule and pattern value. */
function getChannelModelFilterRegex(
  rule: ChannelModelFilterRule,
  pattern: string,
): RegExp | null {
  const cached = channelModelFilterRegexCache.get(rule)
  if (cached?.pattern === pattern) {
    return cached.regex
  }

  let regex: RegExp | null = null
  try {
    if (!isSafeChannelModelFilterRegex(pattern)) {
      throw new Error("Invalid or unsafe regex pattern")
    }
    regex = new RegExp(pattern, "i")
  } catch (error) {
    logger.warn("Invalid channel filter pattern for channel rule", {
      ruleId: rule.id,
      error,
    })
  }

  channelModelFilterRegexCache.set(rule, { pattern, regex })
  return regex
}

/** Evaluates one pattern or probe rule against a model name. */
async function matchesChannelModelFilterRule(
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

  if (!rule.isRegex) {
    return model.toLowerCase().includes(pattern.toLowerCase())
  }

  return getChannelModelFilterRegex(rule, pattern)?.test(model) ?? false
}

/** Keeps or removes models according to whether any supplied rule matches. */
async function filterByRuleMatches(
  models: string[],
  rules: ChannelModelFilterRule[],
  keepMatchingModels: boolean,
  probeContext?: ProbeFilterContext,
): Promise<string[]> {
  const result: string[] = []

  for (const model of models) {
    let matched = false
    for (const rule of rules) {
      if (await matchesChannelModelFilterRule(rule, model, probeContext)) {
        matched = true
        break
      }
    }

    if (matched === keepMatchingModels) {
      result.push(model)
    }
  }

  return result
}

/** Resolves model-filter rules through the canonical resource identity. */
export function getChannelModelFilterRulesForResource(
  configs: ChannelResourceConfigMap | null | undefined,
  identity: Parameters<typeof createManagedUpstreamResourceRef>[0],
): ChannelModelFilterRule[] {
  const resourceRef = createManagedUpstreamResourceRef(identity)
  return (
    configs?.[getManagedUpstreamResourceRefKey(resourceRef)]
      ?.modelFilterSettings.rules ?? []
  )
}

/**
 * Applies enabled include/exclude rules to a normalized model collection.
 */
export async function applyChannelModelFilters(
  rules: ChannelModelFilterRule[] | null | undefined,
  models: string[],
  probeContext?: ProbeFilterContext,
): Promise<string[]> {
  const normalized = Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean)),
  )
  if (!normalized.length) return normalized

  const enabledRules = rules?.filter((rule) => rule.enabled) ?? []
  if (!enabledRules.length) return normalized

  const includeRules = enabledRules.filter((rule) => rule.action === "include")
  const excludeRules = enabledRules.filter((rule) => rule.action === "exclude")
  let result = normalized

  if (includeRules.length) {
    result = await filterByRuleMatches(result, includeRules, true, probeContext)
  }

  if (result.length && excludeRules.length) {
    result = await filterByRuleMatches(
      result,
      excludeRules,
      false,
      probeContext,
    )
  }

  return result
}
