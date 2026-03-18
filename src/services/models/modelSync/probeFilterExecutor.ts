import {
  runApiVerificationProbe,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import type { ChannelConfig } from "~/types/channelConfig"
import type {
  ChannelFilterProbeId,
  ChannelModelFilterRule,
} from "~/types/channelModelFilters"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { createLogger } from "~/utils/core/logger"

import { resolveProbeCredentials } from "./probeCredentials"
import type { RateLimiter } from "./rateLimiter"

const logger = createLogger("ProbeFilterExecutor")

const DEFAULT_PROBE_TIMEOUT_MS = 30000

export interface RunProbeForModelParams {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  probeId: ChannelFilterProbeId
  timeout?: number
}

/**
 * Run a single probe for a single model.
 * @param params Probe execution parameters
 * @returns true if probe passed, false if failed or unsupported
 */
export async function runProbeForModel(
  params: RunProbeForModelParams,
): Promise<boolean> {
  const timeout = params.timeout ?? DEFAULT_PROBE_TIMEOUT_MS

  try {
    const result = await Promise.race([
      runApiVerificationProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType as ApiVerificationApiType,
        modelId: params.modelId,
        probeId: params.probeId,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Probe timeout")), timeout),
      ),
    ])

    return result.status === "pass"
  } catch (error) {
    logger.warn("Probe failed for model", {
      modelId: params.modelId,
      probeId: params.probeId,
      error,
    })
    return false
  }
}

export interface FilterModelsByProbeRulesParams {
  models: string[]
  channel: ManagedSiteChannel
  probeRules: ChannelModelFilterRule[]
  channelConfig?: ChannelConfig
  rateLimiter?: RateLimiter
  onProgress?: (model: string, done: number, total: number) => void
}

/**
 * Apply probe rules to filter models.
 *
 * Steps:
 * 1. Normalize model list
 * 2. For each enabled probe rule:
 *    - Resolve credentials (rule -> channelConfig -> channel)
 *    - Skip if credentials incomplete
 *    - Run probe for each model
 *    - Apply include/exclude logic based on probe results
 * @param params Filter parameters
 * @returns Filtered model list
 */
export async function filterModelsByProbeRules(
  params: FilterModelsByProbeRulesParams,
): Promise<string[]> {
  const { models, channel, probeRules, channelConfig, rateLimiter, onProgress } =
    params

  const normalized = Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean)),
  )

  if (!normalized.length) {
    return normalized
  }

  const enabledProbeRules = probeRules.filter(
    (rule) => rule.enabled && rule.ruleType === "probe",
  )

  if (!enabledProbeRules.length) {
    return normalized
  }

  const includeRules = enabledProbeRules.filter(
    (rule) => rule.action === "include",
  )
  const excludeRules = enabledProbeRules.filter(
    (rule) => rule.action === "exclude",
  )

  let result = normalized

  if (includeRules.length > 0) {
    const includedModels: string[] = []
    let processed = 0

    for (const model of result) {
      let shouldInclude = false

      for (const rule of includeRules) {
        const credentials = resolveProbeCredentials({
          channel,
          rule,
          channelConfig,
        })

        if (!credentials) {
          logger.warn("Skipping probe rule due to missing credentials", {
            ruleId: rule.id,
            ruleName: rule.name,
            channelId: channel.id,
          })
          continue
        }

        if (rateLimiter) {
          await rateLimiter.acquire()
        }

        const passed = await runProbeForModel({
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          apiType: credentials.apiType as ApiVerificationApiType,
          modelId: model,
          probeId: rule.probeId!,
        })

        if (passed) {
          shouldInclude = true
          break
        }
      }

      if (shouldInclude) {
        includedModels.push(model)
      }

      processed++
      onProgress?.(model, processed, result.length)
    }

    result = includedModels
  }

  if (result.length === 0) {
    return result
  }

  if (excludeRules.length > 0) {
    const keptModels: string[] = []
    let processed = 0

    for (const model of result) {
      let shouldExclude = false

      for (const rule of excludeRules) {
        const credentials = resolveProbeCredentials({
          channel,
          rule,
          channelConfig,
        })

        if (!credentials) {
          logger.warn("Skipping probe rule due to missing credentials", {
            ruleId: rule.id,
            ruleName: rule.name,
            channelId: channel.id,
          })
          continue
        }

        if (rateLimiter) {
          await rateLimiter.acquire()
        }

        const passed = await runProbeForModel({
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          apiType: credentials.apiType as ApiVerificationApiType,
          modelId: model,
          probeId: rule.probeId!,
        })

        if (passed) {
          shouldExclude = true
          break
        }
      }

      if (!shouldExclude) {
        keptModels.push(model)
      }

      processed++
      onProgress?.(model, processed, result.length)
    }

    result = keptModels
  }

  return result
}
