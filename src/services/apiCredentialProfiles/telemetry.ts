import { UI_CONSTANTS } from "~/constants/ui"
import {
  apiCredentialProfilesStorage,
  coerceApiCredentialTelemetryConfig,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { fetchApiCredentialModelIds } from "~/services/apiCredentialProfiles/modelCatalog"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchApi } from "~/services/apiService/common/utils"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetryJsonPathMap,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"

type TelemetryPatch = Partial<
  Pick<
    ApiCredentialTelemetrySnapshot,
    | "balanceUsd"
    | "todayCostUsd"
    | "todayRequests"
    | "todayTokens"
    | "unlimitedQuota"
    | "totalUsedUsd"
    | "totalGrantedUsd"
    | "totalAvailableUsd"
    | "expiresAt"
  >
>

type AdapterSuccess = {
  source: ApiCredentialTelemetryCapabilityMode
  endpoint: string
  data: TelemetryPatch
}

type JsonFetchResult = {
  endpoint: string
  json: unknown
}

const OPENAI_BILLING_LIMIT_BALANCE_MAX_USD = 1_000_000
const REDACTED_QUERY_VALUE = "[REDACTED]"

const TELEMETRY_ENDPOINTS = {
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
    public statusCode?: number,
    public unsupported: boolean = false,
  ) {
    super(message)
    this.name = "TelemetryEndpointError"
  }
}

/**
 * Checks whether an unknown value can be safely read as a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

/**
 * Unwraps common response envelopes so telemetry parsers can read fields.
 */
function dataLike(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  if (isRecord(value.data)) return value.data
  return value
}

/**
 * Reads a finite number from numeric or numeric-string response fields.
 */
function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Converts One API quota units into USD.
 */
function quotaToUsd(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return value / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
}

/**
 * Converts quota units into a non-negative USD amount.
 */
function nonNegativeQuotaToUsd(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return quotaToUsd(Math.max(0, value))
}

/**
 * Normalizes second or millisecond timestamps into milliseconds.
 */
function normalizeTimestamp(value: unknown): number | undefined {
  const parsed = readNumber(value)
  if (parsed === undefined || parsed <= 0) return undefined
  return parsed < 1e12 ? Math.round(parsed * 1000) : Math.round(parsed)
}

/**
 * Reads a nested value from an object using a dot-separated path.
 */
function getPathValue(input: unknown, path: string): unknown {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean)
  let current = input

  for (const segment of segments) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }

  return current
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
 * Resolves the model catalog endpoint used for telemetry attempts.
 */
function getModelsEndpoint(profile: ApiCredentialProfile): string {
  return profile.apiType === "google"
    ? TELEMETRY_ENDPOINTS.models.google
    : TELEMETRY_ENDPOINTS.models.openAiCompatible
}

/**
 * Builds the OpenAI-compatible billing usage endpoint for the current date range.
 */
function createOpenAiBillingUsageEndpoint(start: string, end: string): string {
  return `${TELEMETRY_ENDPOINTS.openAiBilling.usage}?start_date=${start}&end_date=${end}`
}

/**
 * Fetches a read-only telemetry endpoint with bearer-token authentication.
 */
async function fetchJson(params: {
  baseUrl: string
  endpoint: string
  apiKey: string
}): Promise<JsonFetchResult> {
  try {
    const json = await fetchApi<unknown>(
      {
        baseUrl: params.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: params.apiKey,
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
        error.statusCode,
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
      error.unsupported ? "unsupported" : "error",
      toSanitizedErrorSummary(error, secrets),
      secrets,
    )
  }

  return createAttempt(
    source,
    endpoint,
    "error",
    toSanitizedErrorSummary(error, secrets),
    secrets,
  )
}

/**
 * Parses OpenAI-compatible subscription and usage responses into telemetry.
 */
function parseOpenAiBillingUsage(
  subscription: unknown,
  usage: unknown,
): TelemetryPatch {
  const sub = dataLike(subscription)
  const usageRecord = dataLike(usage)
  const hardLimit = readNumber(sub.hard_limit_usd)
  const balance = readNumber(sub.balance)
  const totalUsageRaw = readNumber(usageRecord.total_usage)
  const usedUsd =
    totalUsageRaw === undefined
      ? readNumber(usageRecord.used_usd)
      : totalUsageRaw / 100

  if (balance !== undefined) {
    return { balanceUsd: balance }
  }

  // Many compatible gateways return huge hard limits as compatibility sentinels
  // rather than real user balance. Do not surface those as spendable balance.
  if (
    hardLimit !== undefined &&
    hardLimit >= OPENAI_BILLING_LIMIT_BALANCE_MAX_USD
  ) {
    return usedUsd !== undefined ? { totalUsedUsd: usedUsd } : {}
  }

  return {
    ...(hardLimit !== undefined && usedUsd !== undefined
      ? { balanceUsd: Math.max(0, hardLimit - usedUsd) }
      : {}),
    ...(hardLimit !== undefined ? { totalGrantedUsd: hardLimit } : {}),
    ...(usedUsd !== undefined ? { totalUsedUsd: usedUsd } : {}),
  }
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
    apiKey: profile.apiKey,
  })
  const subscriptionData = dataLike(subscription.json)
  const directBalance = readNumber(subscriptionData.balance)
  if (directBalance !== undefined) {
    return {
      source: "openaiBilling",
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
    apiKey: profile.apiKey,
  })

  return {
    source: "openaiBilling",
    endpoint: subscription.endpoint,
    data: parseOpenAiBillingUsage(subscription.json, usage.json),
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
    apiKey: profile.apiKey,
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
    source: "newApiTokenUsage",
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
    apiKey: profile.apiKey,
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
    source: "sub2apiUsage",
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
 * Resolves a custom endpoint while keeping it on the profile origin.
 */
function resolveCustomEndpoint(
  profile: ApiCredentialProfile,
  endpoint: string,
): string {
  const trimmed = endpoint.trim()
  if (!trimmed) throw new Error("Custom endpoint is empty")

  const base = new URL(profile.baseUrl)
  const resolved = new URL(trimmed, base.origin)
  if (resolved.origin !== base.origin) {
    throw new Error("Custom endpoint must stay on the profile base URL origin")
  }

  return `${resolved.pathname}${resolved.search}`
}

/**
 * Maps a custom telemetry JSON response through configured JSON paths.
 */
function mapCustomJson(
  json: unknown,
  paths: ApiCredentialTelemetryJsonPathMap,
): TelemetryPatch {
  const todayPromptTokens = paths.todayPromptTokens
    ? readNumber(getPathValue(json, paths.todayPromptTokens))
    : undefined
  const todayCompletionTokens = paths.todayCompletionTokens
    ? readNumber(getPathValue(json, paths.todayCompletionTokens))
    : undefined
  const todayTotalTokens = paths.todayTotalTokens
    ? readNumber(getPathValue(json, paths.todayTotalTokens))
    : undefined

  return {
    ...(paths.balanceUsd
      ? { balanceUsd: readNumber(getPathValue(json, paths.balanceUsd)) }
      : {}),
    ...(paths.todayCostUsd
      ? { todayCostUsd: readNumber(getPathValue(json, paths.todayCostUsd)) }
      : {}),
    ...(paths.todayRequests
      ? { todayRequests: readNumber(getPathValue(json, paths.todayRequests)) }
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
    ...(paths.totalUsedUsd
      ? { totalUsedUsd: readNumber(getPathValue(json, paths.totalUsedUsd)) }
      : {}),
    ...(paths.totalGrantedUsd
      ? {
          totalGrantedUsd: readNumber(
            getPathValue(json, paths.totalGrantedUsd),
          ),
        }
      : {}),
    ...(paths.totalAvailableUsd
      ? {
          totalAvailableUsd: readNumber(
            getPathValue(json, paths.totalAvailableUsd),
          ),
        }
      : {}),
    ...(paths.expiresAt
      ? { expiresAt: normalizeTimestamp(getPathValue(json, paths.expiresAt)) }
      : {}),
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

  const endpoint = resolveCustomEndpoint(
    profile,
    config.customEndpoint.endpoint,
  )
  const result = await fetchJson({
    baseUrl: profile.baseUrl,
    endpoint,
    apiKey: profile.apiKey,
  })

  return {
    source: "customReadOnlyEndpoint",
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
        "models",
        getModelsEndpoint(profile),
        modelIds.length > 0 ? "success" : "unsupported",
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
      attemptFromError("models", getModelsEndpoint(profile), error, [
        profile.apiKey,
      ]),
    )
    return undefined
  }
}

/**
 * Runs the selected telemetry adapter for a profile.
 */
async function runUsageAdapter(
  profile: ApiCredentialProfile,
  mode: ApiCredentialTelemetryCapabilityMode,
  config: ApiCredentialTelemetryConfig,
): Promise<AdapterSuccess> {
  if (mode === "openaiBilling") return await queryOpenAiBilling(profile)
  if (mode === "newApiTokenUsage") return await queryNewApiTokenUsage(profile)
  if (mode === "sub2apiUsage") return await querySub2ApiUsage(profile)
  if (mode === "customReadOnlyEndpoint") {
    return await queryCustomReadOnlyEndpoint(profile, config)
  }

  throw new Error(`Unsupported telemetry mode: ${mode}`)
}

/**
 * Expands the configured telemetry mode into concrete adapter attempts.
 */
function resolveModes(
  config: ApiCredentialTelemetryConfig,
): ApiCredentialTelemetryCapabilityMode[] {
  if (config.mode === "disabled") return []
  if (config.mode === "auto") {
    // Prefer provider-specific key telemetry. OpenAI billing endpoints often
    // expose compatibility limits, not spendable gateway balance.
    return ["newApiTokenUsage", "sub2apiUsage", "openaiBilling"]
  }
  return [config.mode]
}

/**
 * Checks whether an adapter returned user-facing usage data.
 */
function hasUsageData(data: TelemetryPatch): boolean {
  return (
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

  const config = coerceApiCredentialTelemetryConfig(profile.telemetryConfig)
  const modes = resolveModes(config)
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
            "success",
            "Fetched usage",
            [profile.apiKey],
          ),
        )
        break
      }

      attempts.push(
        createAttempt(
          result.source,
          result.endpoint,
          "unsupported",
          "No usage fields returned",
          [profile.apiKey],
        ),
      )
    } catch (error) {
      const endpoint =
        mode === "openaiBilling"
          ? TELEMETRY_ENDPOINTS.openAiBilling.subscription
          : mode === "newApiTokenUsage"
            ? TELEMETRY_ENDPOINTS.newApiTokenUsage
            : mode === "sub2apiUsage"
              ? TELEMETRY_ENDPOINTS.sub2ApiUsage
              : config.customEndpoint?.endpoint || "custom"
      attempts.push(attemptFromError(mode, endpoint, error, [profile.apiKey]))
    }
  }

  const modelSucceeded = Boolean(models && models.count > 0)
  const usageSucceeded = Boolean(usageResult)
  const lastError =
    usageSucceeded || modelSucceeded
      ? undefined
      : attempts.find((attempt) => attempt.status === "error")?.message ||
        "No supported telemetry endpoint returned data"

  const snapshot: ApiCredentialTelemetrySnapshot = {
    health:
      usageSucceeded || modelSucceeded
        ? { status: SiteHealthStatus.Healthy }
        : {
            status: SiteHealthStatus.Warning,
            reason: lastError,
          },
    lastSyncTime: now,
    ...(usageSucceeded || modelSucceeded ? { lastSuccessTime: now } : {}),
    ...(lastError ? { lastError } : {}),
    ...(usageResult?.source ? { source: usageResult.source } : {}),
    ...(usageResult?.data ?? {}),
    ...(models ? { models } : {}),
    attempts,
  }

  await apiCredentialProfilesStorage.updateTelemetrySnapshot(
    profile.id,
    snapshot,
  )
  return snapshot
}
