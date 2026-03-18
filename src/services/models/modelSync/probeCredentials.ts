import type { ChannelConfig } from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProbeCredentials")

export interface ResolvedProbeCredentials {
  baseUrl: string
  apiKey: string
  apiType: string
}

export interface ResolveProbeCredentialsParams {
  channel: ManagedSiteChannel
  rule: ChannelModelFilterRule
  channelConfig?: ChannelConfig
}

/**
 * Resolve probe credentials with fallback chain.
 *
 * Priority:
 * 1. Rule-specific credentials (verificationBaseUrl, verificationApiKey, apiType)
 * 2. ChannelConfig.verificationCredentials
 * 3. Channel credentials (base_url, key) - if available
 * 4. Return null if any required field is missing
 * @param params Resolution parameters
 * @returns Resolved credentials or null if incomplete
 */
export function resolveProbeCredentials(
  params: ResolveProbeCredentialsParams,
): ResolvedProbeCredentials | null {
  const { channel, rule, channelConfig } = params

  if (rule.ruleType !== "probe") {
    logger.warn("Attempted to resolve credentials for non-probe rule", {
      ruleId: rule.id,
      ruleType: rule.ruleType,
    })
    return null
  }

  let baseUrl: string | undefined
  let apiKey: string | undefined
  let apiType: string | undefined

  if (
    rule.verificationBaseUrl?.trim() &&
    rule.verificationApiKey?.trim() &&
    rule.apiType?.trim()
  ) {
    baseUrl = rule.verificationBaseUrl.trim()
    apiKey = rule.verificationApiKey.trim()
    apiType = rule.apiType.trim()
    logger.debug("Using rule-specific credentials", {
      ruleId: rule.id,
      source: "rule",
    })
  } else if (channelConfig?.verificationCredentials) {
    const creds = channelConfig.verificationCredentials
    if (creds.baseUrl?.trim() && creds.apiKey?.trim() && creds.apiType?.trim()) {
      baseUrl = creds.baseUrl.trim()
      apiKey = creds.apiKey.trim()
      apiType = creds.apiType.trim()
      logger.debug("Using channel config credentials", {
        ruleId: rule.id,
        source: "channelConfig",
      })
    }
  } else if (channel.base_url?.trim() && channel.key?.trim() && rule.apiType?.trim()) {
    baseUrl = channel.base_url.trim()
    apiKey = channel.key.trim()
    apiType = rule.apiType.trim()
    logger.debug("Using channel credentials", {
      ruleId: rule.id,
      source: "channel",
    })
  }

  if (!baseUrl || !apiKey || !apiType) {
    logger.warn("Incomplete credentials for probe rule", {
      ruleId: rule.id,
      ruleName: rule.name,
      hasBaseUrl: Boolean(baseUrl),
      hasApiKey: Boolean(apiKey),
      hasApiType: Boolean(apiType),
    })
    return null
  }

  return { baseUrl, apiKey, apiType }
}
