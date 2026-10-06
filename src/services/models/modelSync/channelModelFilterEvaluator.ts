import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import { isSafeChannelModelFilterRegex } from "~/services/managedSites/channelModelFilterRules"
import {
  assertManagedResourceRefForSite,
  getManagedResourceRefKey,
} from "~/services/managedSites/managedResourceIdentity"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/resourceSecrets"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
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
  matching?: Pick<ManagedResourceMatchingCapability, "fetchSecretKey">
  models?: Pick<ManagedResourceModelsCapability, "resolveVerificationProtocol">
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

  const matching = context.matching
  if (!matching?.fetchSecretKey) {
    throw new ProbeFilterUnavailableError(
      "provider-unsupported",
      "Probe filtering is unsupported because this managed-site provider cannot resolve hidden channel keys.",
    )
  }

  try {
    const key = context.protectionBypassExecution
      ? await matching.fetchSecretKey(
          context.managedConfig.config,
          context.channel.ref,
          { protectionBypassExecution: context.protectionBypassExecution },
        )
      : await matching.fetchSecretKey(
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
      ...collectManagedConfigSecrets(context.managedConfig.config),
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
  const apiType = context.models?.resolveVerificationProtocol?.(
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
