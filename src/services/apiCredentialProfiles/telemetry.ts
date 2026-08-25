import {
  apiCredentialProfilesStorage,
  coerceApiCredentialTelemetryConfig,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { fetchApiCredentialModelIds } from "~/services/apiCredentialProfiles/modelCatalog"
import { resolveApiCredentialTelemetryRequestTarget } from "~/services/apiCredentialProfiles/telemetryConfig"
import type { TelemetryPatch } from "~/services/apiCredentialProfiles/telemetryContracts"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetryFacts"
import {
  dataLike,
  isRecord,
  mapCustomJson,
  nonNegativeQuotaToUsd,
  normalizeTimestamp,
  parseDeepSeekBalance,
  parseGlmQuota,
  parseKimiOpenPlatformBalance,
  parseKimiQuota,
  parseOpenAiBillingUsage,
  parseOpenCodeGoUsage,
  readNumber,
  TELEMETRY_PROVIDER_PROTOCOL,
} from "~/services/apiCredentialProfiles/telemetryParsers"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import {
  API_AUTH_TOKEN_MODES,
  type ApiAuthTokenMode,
} from "~/services/apiTransport/type"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetrySnapshot,
  ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_HEALTH_REASONS,
  API_CREDENTIAL_TELEMETRY_MODES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"

const REDACTED_QUERY_VALUE = "[REDACTED]"

type AdapterSuccess = {
  source: ApiCredentialTelemetrySource
  endpoint: string
  data: TelemetryPatch
}

type JsonFetchResult = {
  endpoint: string
  json: unknown
}

const TELEMETRY_ENDPOINTS = {
  deepSeekBalance: "/user/balance",
  glmQuota: "/api/monitor/usage/quota/limit",
  kimiQuota: "/coding/v1/usages",
  kimiOpenPlatformBalance: "/v1/users/me/balance",
  openCodeGoUsage: "/v1/usage",
  models: {
    google: "/v1beta/models",
    openAiCompatible: "/v1/models",
  },
  openAiBilling: {
    subscription: "/v1/dashboard/billing/subscription",
    usage: "/v1/dashboard/billing/usage",
  },
  newApiTokenUsage: "/api/usage/token/",
  sub2ApiUsage: "/v1/usage",
} as const

class TelemetryEndpointError extends Error {
  constructor(
    message: string,
    public endpoint: string,
    public unsupported: boolean = false,
  ) {
    super(message)
    this.name = "TelemetryEndpointError"
  }
}

/**
 * Redacts sensitive query values before attempts are persisted with snapshots.
 */
function sanitizeTelemetryEndpoint(
  endpoint: string,
  secrets: string[],
): string {
  const redactedEndpoint = toSanitizedErrorSummary(endpoint, secrets)
  try {
    const parsed = new URL(redactedEndpoint, "https://telemetry.local")

    for (const key of Array.from(parsed.searchParams.keys())) {
      parsed.searchParams.set(key, REDACTED_QUERY_VALUE)
    }

    return `${parsed.pathname}${parsed.search}`
  } catch {
    return redactedEndpoint
  }
}

/**
 * Removes duplicate secrets and orders overlapping values for full redaction.
 */
function prepareTelemetrySecrets(secrets: Array<string | undefined>): string[] {
  return Array.from(
    new Set(secrets.filter((secret): secret is string => !!secret)),
  ).sort((first, second) => second.length - first.length)
}

/**
 * Resolves the model catalog endpoint used for telemetry attempts.
 */
function getModelsEndpoint(profile: ApiCredentialProfile): string {
  return profile.apiType === "google"
    ? TELEMETRY_ENDPOINTS.models.google
    : TELEMETRY_ENDPOINTS.models.openAiCompatible
}

/** Resolves provider-owned telemetry routes from the provider origin. */
function getTelemetryOrigin(baseUrl: string): string {
  return new URL(baseUrl).origin
}

/** Detects the documented Z.AI Coding Plan endpoints. */
function isGlmCodingPlanBaseUrl(baseUrl: string): boolean {
  const pathname = new URL(baseUrl).pathname.toLowerCase()
  return (
    pathname.includes("/api/coding/") || pathname.startsWith("/api/anthropic")
  )
}

/** Detects OpenCode Go's provider API origin and path. */
function isOpenCodeGoBaseUrl(baseUrl: string): boolean {
  const url = new URL(baseUrl)
  return (
    url.hostname === "opencode.ai" &&
    (url.pathname === "/zen/go" || url.pathname.startsWith("/zen/go/"))
  )
}

/**
 * Builds the OpenAI-compatible billing usage endpoint for the current date range.
 */
function createOpenAiBillingUsageEndpoint(start: string, end: string): string {
  return `${TELEMETRY_ENDPOINTS.openAiBilling.usage}?start_date=${start}&end_date=${end}`
}

/**
 * Fetches a read-only telemetry endpoint with optional token authentication.
 */
async function fetchJson(params: {
  baseUrl: string
  endpoint: string
  bearerToken?: string
  authTokenMode?: ApiAuthTokenMode
}): Promise<JsonFetchResult> {
  try {
    const json = await fetchApi<unknown>(
      {
        baseUrl: params.baseUrl,
        auth: {
          authType: params.bearerToken
            ? AuthTypeEnum.AccessToken
            : AuthTypeEnum.None,
          accessToken: params.bearerToken,
        },
      },
      {
        endpoint: params.endpoint,
        options: {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
        ...(params.authTokenMode
          ? { authTokenMode: params.authTokenMode }
          : {}),
      },
      true,
    )

    return {
      endpoint: params.endpoint,
      json,
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw new TelemetryEndpointError(
        error.message,
        error.endpoint ?? params.endpoint,
        error.statusCode === 404 || error.statusCode === 405,
      )
    }

    if (error instanceof SyntaxError) {
      throw new TelemetryEndpointError("Non-JSON response", params.endpoint)
    }

    throw new TelemetryEndpointError(
      `Network request failed: ${getErrorMessage(error)}`,
      params.endpoint,
    )
  }
}

/**
 * Creates a normalized telemetry attempt entry for the profile snapshot.
 */
function createAttempt(
  source: ApiCredentialTelemetryAttempt["source"],
  endpoint: string,
  status: ApiCredentialTelemetryAttempt["status"],
  message?: string,
  secrets: string[] = [],
): ApiCredentialTelemetryAttempt {
  return {
    source,
    endpoint: sanitizeTelemetryEndpoint(endpoint, secrets),
    status,
    ...(message ? { message } : {}),
  }
}

/**
 * Converts thrown endpoint errors into sanitized telemetry attempt entries.
 */
function attemptFromError(
  source: ApiCredentialTelemetryAttempt["source"],
  endpoint: string,
  error: unknown,
  secrets: string[],
): ApiCredentialTelemetryAttempt {
  if (error instanceof TelemetryEndpointError) {
    return createAttempt(
      source,
      error.endpoint || endpoint,
      error.unsupported
        ? API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported
        : API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
      toSanitizedErrorSummary(error, secrets),
      secrets,
    )
  }

  return createAttempt(
    source,
    endpoint,
    API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
    toSanitizedErrorSummary(error, secrets),
    secrets,
  )
}

/**
 * Queries OpenAI-compatible billing endpoints for balance and usage data.
 */
async function queryOpenAiBilling(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const subscription = await fetchJson({
    baseUrl: profile.baseUrl,
    endpoint: TELEMETRY_ENDPOINTS.openAiBilling.subscription,
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
  const start = `${now.getFullYear()}-01-01`
  const end = now.toISOString().slice(0, 10)
  const usageEndpoint = createOpenAiBillingUsageEndpoint(start, end)
  const usage = await fetchJson({
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
  const result = await fetchJson({
    baseUrl: profile.baseUrl,
    endpoint: TELEMETRY_ENDPOINTS.deepSeekBalance,
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
  const result = await fetchJson({
    baseUrl: getTelemetryOrigin(profile.baseUrl),
    endpoint: TELEMETRY_ENDPOINTS.glmQuota,
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
  const result = await fetchJson({
    baseUrl: getTelemetryOrigin(profile.baseUrl),
    endpoint: TELEMETRY_ENDPOINTS.kimiQuota,
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
  const result = await fetchJson({
    baseUrl: getTelemetryOrigin(profile.baseUrl),
    endpoint: TELEMETRY_ENDPOINTS.kimiOpenPlatformBalance,
    bearerToken: profile.apiKey,
  })

  return {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.KimiOpenPlatformBalance,
    endpoint: result.endpoint,
    data: parseKimiOpenPlatformBalance(
      result.json,
      new URL(profile.baseUrl).hostname === "api.moonshot.ai"
        ? TELEMETRY_PROVIDER_PROTOCOL.currencies.Usd
        : TELEMETRY_PROVIDER_PROTOCOL.currencies.Cny,
    ),
  }
}

/** Queries OpenCode Go's provider-owned plan quota windows. */
async function queryOpenCodeGoUsage(
  profile: ApiCredentialProfile,
): Promise<AdapterSuccess> {
  const result = await fetchJson({
    baseUrl: profile.baseUrl,
    endpoint: TELEMETRY_ENDPOINTS.openCodeGoUsage,
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
  const result = await fetchJson({
    baseUrl: profile.baseUrl,
    endpoint: TELEMETRY_ENDPOINTS.newApiTokenUsage,
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
  const result = await fetchJson({
    baseUrl: profile.baseUrl,
    endpoint: TELEMETRY_ENDPOINTS.sub2ApiUsage,
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
      ...(todayPromptTokens !== undefined ||
      todayCompletionTokens !== undefined ||
      todayTotalTokens !== undefined
        ? {
            todayTokens: {
              upload: todayPromptTokens ?? todayTotalTokens ?? 0,
              download: todayCompletionTokens ?? 0,
            },
          }
        : {}),
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
  const result = await fetchJson({
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
async function queryModels(
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
    defaultEndpoint: TELEMETRY_ENDPOINTS.deepSeekBalance,
    query: (profile) => queryDeepSeekBalance(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.GlmQuota]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota,
    defaultEndpoint: TELEMETRY_ENDPOINTS.glmQuota,
    query: (profile) => queryGlmQuota(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.KimiQuota]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.KimiQuota,
    defaultEndpoint: TELEMETRY_ENDPOINTS.kimiQuota,
    query: (profile) => queryKimiQuota(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.KimiOpenPlatformBalance,
    defaultEndpoint: TELEMETRY_ENDPOINTS.kimiOpenPlatformBalance,
    query: (profile) => queryKimiOpenPlatformBalance(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage,
    defaultEndpoint: TELEMETRY_ENDPOINTS.openCodeGoUsage,
    query: (profile) => queryOpenCodeGoUsage(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling,
    defaultEndpoint: TELEMETRY_ENDPOINTS.openAiBilling.subscription,
    query: (profile) => queryOpenAiBilling(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage,
    defaultEndpoint: TELEMETRY_ENDPOINTS.newApiTokenUsage,
    query: (profile) => queryNewApiTokenUsage(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage,
    defaultEndpoint: TELEMETRY_ENDPOINTS.sub2ApiUsage,
    query: (profile) => querySub2ApiUsage(profile),
  },
  [API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint]: {
    source: API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
    defaultEndpoint: "custom",
    query: (profile, config) => queryCustomReadOnlyEndpoint(profile, config),
  },
}

/** Resolves one executable mode from the telemetry adapter registry. */
function getTelemetryAdapter(
  mode: ApiCredentialTelemetryCapabilityMode,
): TelemetryAdapterDefinition {
  const adapter = TELEMETRY_ADAPTERS[mode]
  if (!adapter) throw new Error(`Unsupported telemetry mode: ${mode}`)
  return adapter
}

/** Ordered compatibility fallbacks used after provider-specific probes. */
const AUTO_TELEMETRY_FALLBACK_MODES = [
  API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
  API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
  API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
] as const

/** Hostname groups that select provider-specific automatic telemetry. */
const AUTO_TELEMETRY_HOSTS = {
  deepSeek: "api.deepseek.com",
  glm: ["open.bigmodel.cn", "dev.bigmodel.cn"] as readonly string[],
  kimi: "api.kimi.com",
  zAi: "api.z.ai",
  moonshot: ["api.moonshot.cn", "api.moonshot.ai"] as readonly string[],
} as const

/**
 * Runs the selected telemetry adapter for a profile.
 */
async function runUsageAdapter(
  profile: ApiCredentialProfile,
  mode: ApiCredentialTelemetryCapabilityMode,
  config: ApiCredentialTelemetryConfig,
): Promise<AdapterSuccess> {
  return await getTelemetryAdapter(mode).query(profile, config)
}

/**
 * Expands the configured telemetry mode into concrete adapter attempts.
 */
function resolveModes(
  profile: ApiCredentialProfile,
  config: ApiCredentialTelemetryConfig,
): ApiCredentialTelemetryCapabilityMode[] {
  if (config.mode === API_CREDENTIAL_TELEMETRY_MODES.Disabled) return []
  if (config.mode === API_CREDENTIAL_TELEMETRY_MODES.Auto) {
    try {
      const hostname = new URL(profile.baseUrl).hostname
      if (hostname === AUTO_TELEMETRY_HOSTS.deepSeek) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (AUTO_TELEMETRY_HOSTS.glm.includes(hostname)) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.GlmQuota,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (hostname === AUTO_TELEMETRY_HOSTS.kimi) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.KimiQuota,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (
        hostname === AUTO_TELEMETRY_HOSTS.zAi &&
        isGlmCodingPlanBaseUrl(profile.baseUrl)
      ) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.GlmQuota,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (AUTO_TELEMETRY_HOSTS.moonshot.includes(hostname)) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (isOpenCodeGoBaseUrl(profile.baseUrl)) {
        return [API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage]
      }
    } catch {
      // The profile storage boundary already validates base URLs. Keep the
      // generic fallback for legacy or partially migrated data.
    }

    // Prefer provider-specific key telemetry. OpenAI billing endpoints often
    // expose compatibility limits, not spendable gateway balance.
    return [...AUTO_TELEMETRY_FALLBACK_MODES]
  }
  return [config.mode]
}

/** Maps an executable telemetry mode to its concrete persisted source. */
function sourceForMode(
  mode: ApiCredentialTelemetryCapabilityMode,
): ApiCredentialTelemetrySource {
  return getTelemetryAdapter(mode).source
}

/**
 * Checks whether an adapter returned user-facing usage data.
 */
function hasUsageData(data: TelemetryPatch): boolean {
  return (
    data.balance !== undefined ||
    data.balances !== undefined ||
    data.quota !== undefined ||
    data.balanceUsd !== undefined ||
    data.todayCostUsd !== undefined ||
    data.todayRequests !== undefined ||
    data.todayTokens !== undefined ||
    data.unlimitedQuota === true ||
    data.totalUsedUsd !== undefined ||
    data.totalGrantedUsd !== undefined ||
    data.totalAvailableUsd !== undefined ||
    data.expiresAt !== undefined
  )
}

/**
 * Refreshes and persists telemetry for one API credential profile.
 */
export async function refreshApiCredentialProfileTelemetry(
  profileId: string,
): Promise<ApiCredentialTelemetrySnapshot> {
  const profile = await apiCredentialProfilesStorage.getProfileById(profileId)
  if (!profile) {
    throw new Error("Profile not found.")
  }

  const config = coerceApiCredentialTelemetryConfig(profile.telemetryConfig, {
    baseUrl: profile.baseUrl,
  })
  const secrets = prepareTelemetrySecrets([
    profile.apiKey,
    config.customEndpoint?.bearerToken,
  ])
  const modes = resolveModes(profile, config)
  const attempts: ApiCredentialTelemetryAttempt[] = []
  const now = Date.now()
  const models =
    modes.length > 0 ? await queryModels(profile, attempts) : undefined
  let usageResult: AdapterSuccess | null = null

  for (const mode of modes) {
    try {
      const result = await runUsageAdapter(profile, mode, config)
      if (hasUsageData(result.data)) {
        usageResult = result
        attempts.push(
          createAttempt(
            result.source,
            result.endpoint,
            API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success,
            "Fetched usage",
            secrets,
          ),
        )
        break
      }

      attempts.push(
        createAttempt(
          result.source,
          result.endpoint,
          API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported,
          "No usage fields returned",
          secrets,
        ),
      )
    } catch (error) {
      const endpoint =
        mode === API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint
          ? config.customEndpoint?.endpoint || "custom"
          : getTelemetryAdapter(mode).defaultEndpoint
      attempts.push(
        attemptFromError(sourceForMode(mode), endpoint, error, secrets),
      )
    }
  }

  const modelSucceeded = Boolean(models && models.count > 0)
  const usageSucceeded = Boolean(usageResult)
  const usageFacts = usageResult
    ? normalizeTelemetryPatchToFacts(usageResult.data, usageResult.source)
    : {}
  const usageUnavailable = Boolean(
    usageFacts.balances?.some((balance) => balance.isAvailable === false),
  )
  const customEndpointError = attempts.find(
    (attempt) =>
      attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error &&
      attempt.source ===
        API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
  )?.message
  const lastError =
    usageSucceeded || modelSucceeded
      ? undefined
      : customEndpointError ||
        attempts.find(
          (attempt) =>
            attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
        )?.message ||
        "No supported telemetry endpoint returned data"

  const snapshot: ApiCredentialTelemetrySnapshot = {
    health:
      usageSucceeded || modelSucceeded
        ? usageUnavailable
          ? {
              status: SiteHealthStatus.Warning,
              reason:
                API_CREDENTIAL_TELEMETRY_HEALTH_REASONS.InsufficientBalance,
            }
          : { status: SiteHealthStatus.Healthy }
        : {
            status: SiteHealthStatus.Warning,
            reason: lastError,
          },
    lastSyncTime: now,
    ...(usageSucceeded || modelSucceeded ? { lastSuccessTime: now } : {}),
    ...(lastError ? { lastError } : {}),
    ...(usageResult?.source ? { source: usageResult.source } : {}),
    facts: {
      ...usageFacts,
      ...(models ? { models } : {}),
    },
    attempts,
  }

  await apiCredentialProfilesStorage.updateTelemetrySnapshot(
    profile.id,
    snapshot,
  )
  return snapshot
}
