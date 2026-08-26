import { fetchApiCredentialModelIds } from "~/services/apiCredentialProfiles/modelCatalog"
import {
  attemptFromError,
  createAttempt,
} from "~/services/apiCredentialProfiles/telemetryAttempts"
import { resolveApiCredentialTelemetryRequestTarget } from "~/services/apiCredentialProfiles/telemetryConfig"
import {
  TELEMETRY_PROVIDER_PROTOCOL,
  type TelemetryPatch,
} from "~/services/apiCredentialProfiles/telemetryContracts"
import { API_CREDENTIAL_TELEMETRY_ENDPOINTS } from "~/services/apiCredentialProfiles/telemetryEndpoints"
import {
  dataLike,
  isRecord,
  mapCustomJson,
  mapTodayTokenUsage,
  nonNegativeQuotaToUsd,
  normalizeTimestamp,
  parseDeepSeekBalance,
  parseGlmQuota,
  parseKimiOpenPlatformBalance,
  parseKimiQuota,
  parseOpenAiBillingUsage,
  parseOpenCodeGoUsage,
  readNumber,
} from "~/services/apiCredentialProfiles/telemetryParsers"
import { fetchTelemetryJson } from "~/services/apiCredentialProfiles/telemetryTransport"
import { API_AUTH_TOKEN_MODES } from "~/services/apiTransport/type"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_MODES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

export type AdapterSuccess = {
  source: ApiCredentialTelemetrySource
  endpoint: string
  data: TelemetryPatch
}

/**
 * Resolves the model catalog endpoint used for telemetry attempts.
 */
function getModelsEndpoint(profile: ApiCredentialProfile): string {
  return profile.apiType === "google"
    ? API_CREDENTIAL_TELEMETRY_ENDPOINTS.models.google
    : API_CREDENTIAL_TELEMETRY_ENDPOINTS.models.openAiCompatible
}

/** Resolves provider-owned telemetry routes from the provider origin. */
function getTelemetryOrigin(baseUrl: string): string {
  return new URL(baseUrl).origin
}

/**
 * Builds the OpenAI-compatible billing usage endpoint for the current date range.
 */
function createOpenAiBillingUsageEndpoint(start: string, end: string): string {
  return `${API_CREDENTIAL_TELEMETRY_ENDPOINTS.openAiBilling.usage}?start_date=${start}&end_date=${end}`
}

/**
 * Queries OpenAI-compatible billing endpoints for balance and usage data.
 */
async function queryOpenAiBilling(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const subscription = await fetchTelemetryJson({
    baseUrl: profile.baseUrl,
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.openAiBilling.subscription,
    bearerToken: profile.apiKey,
  })
  const subscriptionData = dataLike(subscription.json)
  const directBalance = readNumber(subscriptionData.balance)
  if (directBalance !== undefined) {
    return {
      source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling,
      endpoint: subscription.endpoint,
      data: { balanceUsd: directBalance },
    }
  }

  const now = new Date()
  // Both range bounds derive from UTC so the year boundary cannot disagree
  // with the ISO end date around New Year in positive UTC offsets.
  const end = now.toISOString().slice(0, 10)
  const start = `${end.slice(0, 4)}-01-01`
  const usageEndpoint = createOpenAiBillingUsageEndpoint(start, end)
  const usage = await fetchTelemetryJson({
    baseUrl: profile.baseUrl,
    endpoint: usageEndpoint,
    bearerToken: profile.apiKey,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling,
    endpoint: subscription.endpoint,
    data: parseOpenAiBillingUsage(subscription.json, usage.json),
  }
}

// DeepSeek Open Platform contract: https://api.deepseek.com/user/balance
// returns balance_infos with string-or-number currency amounts.
/** Queries DeepSeek's provider-native balance endpoint. */
async function queryDeepSeekBalance(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchTelemetryJson({
    baseUrl: profile.baseUrl,
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.deepSeekBalance,
    bearerToken: profile.apiKey,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
    endpoint: result.endpoint,
    data: parseDeepSeekBalance(result.json),
  }
}

// GLM Coding Plan contract:
// https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs
// Both open.bigmodel.cn and api.z.ai expose this path. The official usage
// plugin sends the API token as a raw Authorization value (not Bearer).
/** Queries GLM's provider-native quota endpoint. */
async function queryGlmQuota(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchTelemetryJson({
    baseUrl: getTelemetryOrigin(profile.baseUrl),
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.glmQuota,
    bearerToken: profile.apiKey,
    authTokenMode: API_AUTH_TOKEN_MODES.Raw,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota,
    endpoint: result.endpoint,
    data: parseGlmQuota(result.json),
  }
}

// Kimi Coding Plan contract: https://api.kimi.com/coding/v1/usages
// exposes weekly/5-hour/total windows and an optional booster wallet.
/** Queries Kimi's provider-native quota endpoint using an API key. */
async function queryKimiQuota(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchTelemetryJson({
    baseUrl: getTelemetryOrigin(profile.baseUrl),
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.kimiQuota,
    bearerToken: profile.apiKey,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.KimiQuota,
    endpoint: result.endpoint,
    data: parseKimiQuota(result.json),
  }
}

/** Queries Kimi Open Platform's pay-as-you-go wallet endpoint. */
async function queryKimiOpenPlatformBalance(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchTelemetryJson({
    baseUrl: getTelemetryOrigin(profile.baseUrl),
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.kimiOpenPlatformBalance,
    bearerToken: profile.apiKey,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.KimiOpenPlatformBalance,
    endpoint: result.endpoint,
    data: parseKimiOpenPlatformBalance(
      result.json,
      new URL(profile.baseUrl).hostname ===
        TELEMETRY_PROVIDER_PROTOCOL.kimi.moonshotAiHost
        ? TELEMETRY_PROVIDER_PROTOCOL.currencies.Usd
        : TELEMETRY_PROVIDER_PROTOCOL.currencies.Cny,
    ),
  }
}

/** Queries OpenCode Go's provider-owned plan quota windows. */
async function queryOpenCodeGoUsage(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchTelemetryJson({
    baseUrl: profile.baseUrl,
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.openCodeGoUsage,
    bearerToken: profile.apiKey,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage,
    endpoint: result.endpoint,
    data: parseOpenCodeGoUsage(result.json),
  }
}

/**
 * Queries New API token usage endpoints for quota-based usage data.
 */
async function queryNewApiTokenUsage(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchTelemetryJson({
    baseUrl: profile.baseUrl,
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.newApiTokenUsage,
    bearerToken: profile.apiKey,
  })
  const data = dataLike(result.json)
  const totalGranted = readNumber(data.total_granted)
  const totalUsed = readNumber(data.total_used)
  const totalAvailable = readNumber(data.total_available)
  const unlimitedQuota =
    data.unlimited_quota === true ||
    (totalGranted !== undefined && totalGranted < 0)
  const balanceUsd = unlimitedQuota
    ? undefined
    : nonNegativeQuotaToUsd(totalAvailable)
  const totalUsedUsd = nonNegativeQuotaToUsd(totalUsed)
  const totalGrantedUsd = unlimitedQuota
    ? undefined
    : nonNegativeQuotaToUsd(totalGranted)
  const totalAvailableUsd = unlimitedQuota
    ? undefined
    : nonNegativeQuotaToUsd(totalAvailable)

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage,
    endpoint: result.endpoint,
    data: {
      ...(unlimitedQuota ? { unlimitedQuota: true } : {}),
      ...(balanceUsd !== undefined ? { balanceUsd } : {}),
      ...(totalUsedUsd !== undefined ? { totalUsedUsd } : {}),
      ...(totalGrantedUsd !== undefined ? { totalGrantedUsd } : {}),
      ...(totalAvailableUsd !== undefined ? { totalAvailableUsd } : {}),
      ...(normalizeTimestamp(data.expires_at) !== undefined
        ? { expiresAt: normalizeTimestamp(data.expires_at) }
        : {}),
    },
  }
}

/**
 * Queries Sub2API usage endpoints for balance and daily usage data.
 */
async function querySub2ApiUsage(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchTelemetryJson({
    baseUrl: profile.baseUrl,
    endpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.sub2ApiUsage,
    bearerToken: profile.apiKey,
  })
  const data = dataLike(result.json)
  const usage = isRecord(data.usage) ? data.usage : {}
  const today = isRecord(usage.today) ? usage.today : {}
  const total = isRecord(usage.total) ? usage.total : {}
  const balance = readNumber(data.balance) ?? readNumber(data.remaining)
  const todayPromptTokens = readNumber(today.prompt_tokens)
  const todayCompletionTokens = readNumber(today.completion_tokens)
  const todayTotalTokens =
    readNumber(today.tokens) ?? readNumber(today.total_tokens)
  const todayTokens = mapTodayTokenUsage({
    prompt: todayPromptTokens,
    completion: todayCompletionTokens,
    total: todayTotalTokens,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage,
    endpoint: result.endpoint,
    data: {
      ...(balance !== undefined ? { balanceUsd: balance } : {}),
      ...(readNumber(today.cost) !== undefined
        ? { todayCostUsd: readNumber(today.cost) }
        : {}),
      ...(readNumber(today.requests) !== undefined
        ? { todayRequests: readNumber(today.requests) }
        : {}),
      ...(todayTokens ? { todayTokens } : {}),
      ...(readNumber(total.cost) !== undefined
        ? { totalUsedUsd: readNumber(total.cost) }
        : {}),
    },
  }
}

/**
 * Queries a configured custom read-only endpoint for telemetry data.
 */
async function queryCustomReadOnlyEndpoint(
  profile: ApiCredentialProfile,
  config: ApiCredentialTelemetryConfig,
): Promise<AdapterSuccess> {
  if (!config.customEndpoint) {
    throw new Error("Custom endpoint is not configured")
  }

  const requestTarget = resolveApiCredentialTelemetryRequestTarget(
    profile.baseUrl,
    config.customEndpoint.endpoint,
  )
  const result = await fetchTelemetryJson({
    baseUrl: requestTarget.baseUrl,
    endpoint: requestTarget.endpoint,
    bearerToken:
      config.customEndpoint.bearerToken ??
      (requestTarget.isCrossOrigin ? undefined : profile.apiKey),
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
    endpoint: result.endpoint,
    data: mapCustomJson(result.json, config.customEndpoint.jsonPaths),
  }
}

/**
 * Queries the profile's model endpoint and records the outcome as telemetry.
 */
export async function queryModels(
  profile: ApiCredentialProfile,
  attempts: ApiCredentialTelemetryAttempt[],
) {
  try {
    const modelIds = await fetchApiCredentialModelIds({
      apiType: profile.apiType,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
    })
    attempts.push(
      createAttempt(
        API_CREDENTIAL_TELEMETRY_SOURCES.Models,
        getModelsEndpoint(profile),
        modelIds.length > 0
          ? API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success
          : API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported,
        modelIds.length > 0
          ? `Fetched ${modelIds.length} models`
          : "No models returned",
        [profile.apiKey],
      ),
    )
    return {
      count: modelIds.length,
      preview: modelIds.slice(0, 20),
    }
  } catch (error) {
    attempts.push(
      attemptFromError(
        API_CREDENTIAL_TELEMETRY_SOURCES.Models,
        getModelsEndpoint(profile),
        error,
        [profile.apiKey],
      ),
    )
    return undefined
  }
}

type TelemetryAdapterDefinition = {
  source: ApiCredentialTelemetrySource
  defaultEndpoint: string
  query: (
    profile: ApiCredentialProfile,
    config: ApiCredentialTelemetryConfig,
  ) => Promise<AdapterSuccess>
}

/** Single registry for executable modes, source labels, endpoints, and queries. */
const TELEMETRY_ADAPTERS: Partial<
  Record<ApiCredentialTelemetryCapabilityMode, TelemetryAdapterDefinition>
> = {
  [API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
    defaultEndpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.deepSeekBalance,
    query: (profile) => queryDeepSeekBalance(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.GlmQuota]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota,
    defaultEndpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.glmQuota,
    query: (profile) => queryGlmQuota(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.KimiQuota]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.KimiQuota,
    defaultEndpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.kimiQuota,
    query: (profile) => queryKimiQuota(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.KimiOpenPlatformBalance,
    defaultEndpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.kimiOpenPlatformBalance,
    query: (profile) => queryKimiOpenPlatformBalance(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage,
    defaultEndpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.openCodeGoUsage,
    query: (profile) => queryOpenCodeGoUsage(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling,
    defaultEndpoint:
      API_CREDENTIAL_TELEMETRY_ENDPOINTS.openAiBilling.subscription,
    query: (profile) => queryOpenAiBilling(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage,
    defaultEndpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.newApiTokenUsage,
    query: (profile) => queryNewApiTokenUsage(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage,
    defaultEndpoint: API_CREDENTIAL_TELEMETRY_ENDPOINTS.sub2ApiUsage,
    query: (profile) => querySub2ApiUsage(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
    defaultEndpoint: "custom",
    query: (profile, config) => queryCustomReadOnlyEndpoint(profile, config),
  },
}

/** Resolves one executable mode from the telemetry adapter registry. */
export function getTelemetryAdapter(
  mode: ApiCredentialTelemetryCapabilityMode,
): TelemetryAdapterDefinition {
  const adapter = TELEMETRY_ADAPTERS[mode]
  if (!adapter) throw new Error(`Unsupported telemetry mode: ${mode}`)
  return adapter
}

/**
 * Runs the selected telemetry adapter for a profile.
 */
export async function runUsageAdapter(
  profile: ApiCredentialProfile,
  mode: ApiCredentialTelemetryCapabilityMode,
  config: ApiCredentialTelemetryConfig,
): Promise<AdapterSuccess> {
  return await getTelemetryAdapter(mode).query(profile, config)
}

/** Maps an executable telemetry mode to its concrete persisted source. */
export function sourceForMode(
  mode: ApiCredentialTelemetryCapabilityMode,
): ApiCredentialTelemetrySource {
  return getTelemetryAdapter(mode).source
}
