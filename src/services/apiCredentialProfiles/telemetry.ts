import { UI_CONSTANTS } from "~/constants/ui"
import {
  apiCredentialProfilesStorage,
  coerceApiCredentialTelemetryConfig,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { fetchApiCredentialModelIds } from "~/services/apiCredentialProfiles/modelCatalog"
import { resolveApiCredentialTelemetryRequestTarget } from "~/services/apiCredentialProfiles/telemetryConfig"
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
  ApiCredentialTelemetryAmount,
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryBalance,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetryFacts,
  ApiCredentialTelemetryJsonPathMap,
  ApiCredentialTelemetrySnapshot,
  ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_HEALTH_REASONS,
  API_CREDENTIAL_TELEMETRY_MODES,
  API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"

type TelemetryPatch = Partial<
  Pick<
    ApiCredentialTelemetrySnapshot,
    | "balance"
    | "quota"
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
> & {
  /** Provider-native balances when a response contains multiple currencies. */
  balances?: ApiCredentialTelemetryBalance[]
}

type AdapterSuccess = {
  source: ApiCredentialTelemetrySource
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

/** Parses DeepSeek's string-or-number balance fields without accepting NaN. */
function parseDeepSeekAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** Normalizes the provider-native DeepSeek balance response. */
function parseDeepSeekBalance(json: unknown): TelemetryPatch {
  const record = dataLike(json)
  if (!Array.isArray(record.balance_infos)) return {}
  const infos = record.balance_infos.filter(isRecord)
  if (record.balance_infos.length === 0) {
    return {
      balance: {
        amount: 0,
        currency: "CNY",
        isAvailable: record.is_available === true,
      },
    }
  }

  const balances = infos.flatMap((item) => {
    const amount = parseDeepSeekAmount(item.total_balance)
    if (amount === undefined) return []
    const grantedAmount = parseDeepSeekAmount(item.granted_balance)
    const toppedUpAmount = parseDeepSeekAmount(item.topped_up_balance)
    const currency =
      typeof item.currency === "string" && item.currency.trim()
        ? item.currency.trim()
        : "CNY"
    return [
      {
        amount,
        currency,
        ...(grantedAmount !== undefined ? { grantedAmount } : {}),
        ...(toppedUpAmount !== undefined ? { toppedUpAmount } : {}),
        isAvailable: record.is_available === true,
      },
    ]
  })

  return balances.length > 0 ? { balances } : {}
}

type QuotaWindowInput = {
  type: (typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES)[keyof typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES]
  unit?: "percent" | "provider"
  limit?: unknown
  used?: unknown
  remaining?: unknown
  percentUsed?: unknown
  resetTime?: unknown
}

/** Normalizes provider quota values into a finite remaining-capacity window. */
function buildQuotaWindow(input: QuotaWindowInput) {
  const limit = readNumber(input.limit)
  const used = readNumber(input.used)
  const remaining = readNumber(input.remaining)
  const percentUsed = readNumber(input.percentUsed)
  if (
    limit === undefined &&
    used === undefined &&
    remaining === undefined &&
    percentUsed === undefined
  ) {
    return undefined
  }

  const normalizedLimit = Math.max(
    0,
    limit ?? (percentUsed === undefined ? 0 : 100),
  )
  const normalizedUsed = Math.min(
    normalizedLimit,
    Math.max(
      0,
      used ??
        (percentUsed === undefined
          ? Math.max(0, normalizedLimit - (remaining ?? 0))
          : (normalizedLimit * Math.min(100, Math.max(0, percentUsed))) / 100),
    ),
  )
  const normalizedRemaining = Math.min(
    normalizedLimit,
    Math.max(0, remaining ?? normalizedLimit - normalizedUsed),
  )
  const resetTime = normalizeTimestamp(input.resetTime)

  return {
    type: input.type,
    ...(input.unit ? { unit: input.unit } : {}),
    used: normalizedUsed,
    limit: normalizedLimit,
    remaining: normalizedRemaining,
    percentRemaining:
      normalizedLimit > 0 ? (normalizedRemaining / normalizedLimit) * 100 : 0,
    ...(resetTime !== undefined ? { resetTime } : {}),
  }
}

/** Parses an ISO timestamp from provider quota responses. */
function parseIsoTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

/**
 * Parses GLM Coding Plan's five-hour, weekly, and monthly quota response.
 * TIME_LIMIT is the official plugin's one-month MCP usage window:
 * https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs
 */
function parseGlmQuota(json: unknown): TelemetryPatch {
  const envelope = isRecord(json) ? json : {}
  if (envelope.success !== true || !isRecord(envelope.data)) return {}

  const rows = Array.isArray(envelope.data.limits)
    ? envelope.data.limits.filter(isRecord)
    : []
  let fiveHour: ReturnType<typeof buildQuotaWindow>
  let weekly: ReturnType<typeof buildQuotaWindow>
  let monthly: ReturnType<typeof buildQuotaWindow>
  const fallback: NonNullable<ReturnType<typeof buildQuotaWindow>>[] = []

  for (const row of rows) {
    if (
      row.type !== "TOKENS_LIMIT" &&
      row.type !== "CREDIT_LIMIT" &&
      row.type !== "TIME_LIMIT"
    )
      continue
    if (row.type === "TIME_LIMIT") {
      const window = buildQuotaWindow({
        type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Monthly,
        unit:
          row.usage !== undefined ||
          row.currentValue !== undefined ||
          row.remaining !== undefined
            ? "provider"
            : "percent",
        limit: row.usage,
        used: row.currentValue,
        remaining: row.remaining,
        percentUsed: row.percentage,
        resetTime: row.nextResetTime,
      })
      if (window) monthly ??= window
      continue
    }
    const windowType =
      row.unit === 3 && row.number === 5
        ? API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour
        : row.unit === 6
          ? API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly
          : undefined
    const window = buildQuotaWindow({
      type: windowType ?? API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour,
      unit:
        row.usage !== undefined ||
        row.currentValue !== undefined ||
        row.remaining !== undefined
          ? "provider"
          : "percent",
      limit: row.usage,
      used: row.currentValue,
      remaining: row.remaining,
      percentUsed: row.percentage,
      resetTime: row.nextResetTime,
    })
    if (!window) continue
    if (windowType === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour) {
      fiveHour ??= window
    } else if (
      windowType === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly
    ) {
      weekly ??= window
    } else {
      fallback.push(window)
    }
  }

  fiveHour ??= fallback.shift()
  weekly ??= fallback.shift()
  const windows = [fiveHour, weekly, monthly].filter(
    (window): window is NonNullable<typeof window> => Boolean(window),
  )
  if (windows.length === 0) return {}

  const membershipLevel =
    typeof envelope.data.level === "string" && envelope.data.level.trim()
      ? envelope.data.level.trim()
      : undefined
  return {
    quota: {
      windows,
      ...(membershipLevel ? { membershipLevel } : {}),
    },
  }
}

/** Parses Kimi Coding Plan's weekly, five-hour, total and booster facts. */
function parseKimiQuota(json: unknown): TelemetryPatch {
  const record = dataLike(json)
  const windows: NonNullable<ReturnType<typeof buildQuotaWindow>>[] = []
  const usage = isRecord(record.usage) ? record.usage : undefined
  const weekly = usage
    ? buildQuotaWindow({
        type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly,
        unit: "provider",
        limit: usage.limit,
        used: usage.used,
        remaining: usage.remaining,
        resetTime: parseIsoTimestamp(usage.resetTime),
      })
    : undefined
  if (weekly) windows.push(weekly)

  const limits = Array.isArray(record.limits)
    ? record.limits.filter(isRecord)
    : []
  const fiveHourEntry = limits.find(
    (entry) => isRecord(entry.window) && entry.window.duration === 300,
  )
  const fiveHourDetail =
    fiveHourEntry && isRecord(fiveHourEntry.detail)
      ? fiveHourEntry.detail
      : undefined
  const fiveHour = fiveHourDetail
    ? buildQuotaWindow({
        type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour,
        unit: "provider",
        limit: fiveHourDetail.limit,
        used: fiveHourDetail.used,
        remaining: fiveHourDetail.remaining,
        resetTime: parseIsoTimestamp(fiveHourDetail.resetTime),
      })
    : undefined
  if (fiveHour) windows.push(fiveHour)

  const totalQuota = isRecord(record.totalQuota) ? record.totalQuota : undefined
  const total = totalQuota
    ? buildQuotaWindow({
        type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Total,
        unit: "provider",
        limit: totalQuota.limit,
        remaining: totalQuota.remaining,
      })
    : undefined
  if (total) windows.push(total)

  const user = isRecord(record.user) ? record.user : undefined
  const membership =
    user && isRecord(user.membership) ? user.membership : undefined
  const membershipLevel =
    membership &&
    typeof membership.level === "string" &&
    membership.level.trim()
      ? membership.level.trim()
      : undefined

  const boosterWallet = isRecord(record.boosterWallet)
    ? record.boosterWallet
    : undefined
  const boosterStatus =
    typeof boosterWallet?.status === "string"
      ? boosterWallet.status.toUpperCase()
      : ""
  const boosterBalance =
    boosterWallet && isRecord(boosterWallet.balance)
      ? readNumber(boosterWallet.balance.amountLeft)
      : undefined
  const balance =
    boosterStatus === "STATUS_ACTIVE" || boosterStatus === "STATUS_ENABLED"
      ? boosterBalance !== undefined
        ? {
            amount: Math.max(0, boosterBalance / 100_000_000),
            currency: "CNY",
            isAvailable: true,
          }
        : undefined
      : undefined

  if (windows.length === 0 && !balance) return {}
  return {
    ...(windows.length > 0
      ? {
          quota: {
            windows,
            ...(membershipLevel ? { membershipLevel } : {}),
          },
        }
      : {}),
    ...(balance ? { balance } : {}),
  }
}

/**
 * Parses OpenCode Go's official usage contract.
 *
 * Source: https://dev.opencode.ai/docs/go/ and
 * https://opencode.ai/zen/go/v1/usage. The endpoint reports *used* percent
 * for rolling (5 hour), weekly, and monthly windows; the product quota model
 * intentionally stores remaining capacity, so this adapter converts
 * `percent` to `100 - percent`. Dollar balances and costs are not exposed by
 * this endpoint and are deliberately not inferred.
 */
function parseOpenCodeGoUsage(json: unknown): TelemetryPatch {
  const record = isRecord(json) ? json : {}
  const usage = isRecord(record.usage) ? record.usage : {}
  const windows: NonNullable<ReturnType<typeof buildQuotaWindow>>[] = []
  const windowDefinitions = [
    ["rolling", API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour],
    ["weekly", API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly],
    ["monthly", API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Monthly],
  ] as const

  for (const [key, type] of windowDefinitions) {
    const item = isRecord(usage[key]) ? usage[key] : undefined
    const percent = item ? readNumber(item.percent) : undefined
    if (
      item?.status !== "ok" ||
      percent === undefined ||
      percent < 0 ||
      percent > 100
    )
      continue

    const window = buildQuotaWindow({
      type,
      unit: "percent",
      percentUsed: percent,
      resetTime: parseIsoTimestamp(item?.resetsAt),
    })
    if (window) windows.push(window)
  }

  return windows.length > 0 ? { quota: { windows } } : {}
}

// Kimi Open Platform contract:
// https://platform.kimi.com/docs/api/balance and
// https://platform.kimi.ai/docs/api/balance
/** Parses Kimi Open Platform's wallet response. */
function parseKimiOpenPlatformBalance(
  json: unknown,
  currency: "CNY" | "USD",
): TelemetryPatch {
  const envelope = isRecord(json) ? json : {}
  if (
    envelope.status !== true ||
    (envelope.code !== 0 && envelope.code !== "0")
  )
    return {}
  const record = dataLike(json)
  const available = readNumber(record.available_balance)
  if (available === undefined) return {}

  const voucher = readNumber(record.voucher_balance)
  const cash = readNumber(record.cash_balance)
  return {
    balance: {
      amount: available,
      currency,
      ...(voucher !== undefined ? { grantedAmount: voucher } : {}),
      ...(cash !== undefined ? { toppedUpAmount: cash } : {}),
      isAvailable: available > 0,
    },
  }
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
      new URL(profile.baseUrl).hostname === "api.moonshot.ai" ? "USD" : "CNY",
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

/** Converts provider parser output into the unit-aware v6 product facts. */
function normalizeTelemetryPatchToFacts(
  data: TelemetryPatch,
  source: ApiCredentialTelemetrySource,
): ApiCredentialTelemetryFacts {
  const facts: ApiCredentialTelemetryFacts = {}
  const budgetSource =
    source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
    source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
  const balances: NonNullable<ApiCredentialTelemetryFacts["balances"]> = []
  const balancesToNormalize =
    data.balances ?? (data.balance ? [data.balance] : [])
  for (const balance of balancesToNormalize) {
    const decimalPlaces = balance.currency === "JPY" ? 0 : 2
    balances.push({
      amount: balance.amount,
      unit: {
        kind: "money",
        currency: balance.currency,
        decimalPlaces,
      },
      semantics:
        source === API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance
          ? "cash"
          : "provider-wallet",
      ...(balance.grantedAmount !== undefined
        ? { grantedAmount: balance.grantedAmount }
        : {}),
      ...(balance.toppedUpAmount !== undefined
        ? { toppedUpAmount: balance.toppedUpAmount }
        : {}),
      ...(balance.isAvailable !== undefined
        ? { isAvailable: balance.isAvailable }
        : {}),
    })
  }

  if (data.balanceUsd !== undefined) {
    balances.push({
      amount: data.balanceUsd,
      unit: budgetSource
        ? {
            kind: "quota",
            code: "usd-equivalent",
            label: "USD-equivalent budget",
          }
        : { kind: "money", currency: "USD", decimalPlaces: 2 },
      semantics: budgetSource
        ? "budget-equivalent"
        : source === API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling
          ? "cash"
          : "legacy",
    })
  }
  if (balances.length > 0) facts.balances = balances

  if (data.quota) {
    facts.quota = {
      windows: data.quota.windows.map((window) => ({
        type: window.type,
        unit:
          window.unit === "percent"
            ? { kind: "percent" }
            : {
                kind: "quota",
                code:
                  source === API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota
                    ? "glm-credit"
                    : "provider-quota",
                label:
                  source === API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota
                    ? "GLM credits"
                    : "Provider quota",
              },
        ...(window.unit === "percent"
          ? {}
          : {
              used: window.used,
              limit: window.limit,
              remaining: window.remaining,
            }),
        remainingPercent: window.percentRemaining,
        ...(window.resetTime !== undefined
          ? { resetTime: window.resetTime }
          : {}),
      })),
      ...(data.quota.membershipLevel
        ? { membershipLevel: data.quota.membershipLevel }
        : {}),
    }
  }

  const budgetUnit: ApiCredentialTelemetryAmount["unit"] = budgetSource
    ? { kind: "quota", code: "usd-equivalent", label: "USD-equivalent budget" }
    : { kind: "money", currency: "USD", decimalPlaces: 2 }
  const usage: NonNullable<ApiCredentialTelemetryFacts["usage"]> = {}
  if (data.todayCostUsd !== undefined) {
    usage.todayCost = {
      value: data.todayCostUsd,
      unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
    }
  }
  if (data.todayRequests !== undefined) {
    usage.todayRequests = {
      value: data.todayRequests,
      unit: { kind: "count", code: "requests" },
    }
  }
  if (data.todayTokens) {
    usage.todayTokens = {
      ...data.todayTokens,
      unit: { kind: "count", code: "tokens" },
    }
  }
  if (data.totalUsedUsd !== undefined) {
    usage.totalUsed = { value: data.totalUsedUsd, unit: budgetUnit }
  }
  if (data.totalGrantedUsd !== undefined) {
    usage.totalGranted = { value: data.totalGrantedUsd, unit: budgetUnit }
  }
  if (data.totalAvailableUsd !== undefined) {
    usage.totalAvailable = { value: data.totalAvailableUsd, unit: budgetUnit }
  }
  if (data.expiresAt !== undefined) usage.expiresAt = data.expiresAt
  if (data.unlimitedQuota !== undefined) usage.unlimited = data.unlimitedQuota
  if (Object.keys(usage).length > 0) facts.usage = usage

  return facts
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

/**
 * Runs the selected telemetry adapter for a profile.
 */
async function runUsageAdapter(
  profile: ApiCredentialProfile,
  mode: ApiCredentialTelemetryCapabilityMode,
  config: ApiCredentialTelemetryConfig,
): Promise<AdapterSuccess> {
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance) {
    return await queryDeepSeekBalance(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.GlmQuota) {
    return await queryGlmQuota(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.KimiQuota) {
    return await queryKimiQuota(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance) {
    return await queryKimiOpenPlatformBalance(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage) {
    return await queryOpenCodeGoUsage(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling) {
    return await queryOpenAiBilling(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage) {
    return await queryNewApiTokenUsage(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage) {
    return await querySub2ApiUsage(profile)
  }
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint) {
    return await queryCustomReadOnlyEndpoint(profile, config)
  }

  throw new Error(`Unsupported telemetry mode: ${mode}`)
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
      if (hostname === "api.deepseek.com") {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance,
          API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
          API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
          API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
        ]
      }
      if (hostname === "open.bigmodel.cn" || hostname === "dev.bigmodel.cn") {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.GlmQuota,
          API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
          API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
          API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
        ]
      }
      if (hostname === "api.kimi.com") {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.KimiQuota,
          API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
          API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
          API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
        ]
      }
      if (hostname === "api.z.ai" && isGlmCodingPlanBaseUrl(profile.baseUrl)) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.GlmQuota,
          API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
          API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
          API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
        ]
      }
      if (hostname === "api.moonshot.cn" || hostname === "api.moonshot.ai") {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance,
          API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
          API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
          API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
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
    return [
      API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
      API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
      API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
    ]
  }
  return [config.mode]
}

/** Maps an executable telemetry mode to its concrete persisted source. */
function sourceForMode(
  mode: ApiCredentialTelemetryCapabilityMode,
): ApiCredentialTelemetrySource {
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance)
    return API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.GlmQuota)
    return API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.KimiQuota)
    return API_CREDENTIAL_TELEMETRY_SOURCES.KimiQuota
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance)
    return API_CREDENTIAL_TELEMETRY_SOURCES.KimiOpenPlatformBalance
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage)
    return API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling)
    return API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage)
    return API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage)
    return API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
  if (mode === API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint)
    return API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint
  throw new Error(`Unsupported telemetry source mode: ${mode}`)
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
        mode === API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance
          ? TELEMETRY_ENDPOINTS.deepSeekBalance
          : mode === API_CREDENTIAL_TELEMETRY_MODES.GlmQuota
            ? TELEMETRY_ENDPOINTS.glmQuota
            : mode === API_CREDENTIAL_TELEMETRY_MODES.KimiQuota
              ? TELEMETRY_ENDPOINTS.kimiQuota
              : mode === API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance
                ? TELEMETRY_ENDPOINTS.kimiOpenPlatformBalance
                : mode === API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage
                  ? TELEMETRY_ENDPOINTS.openCodeGoUsage
                  : mode === API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling
                    ? TELEMETRY_ENDPOINTS.openAiBilling.subscription
                    : mode === API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage
                      ? TELEMETRY_ENDPOINTS.newApiTokenUsage
                      : mode === API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage
                        ? TELEMETRY_ENDPOINTS.sub2ApiUsage
                        : config.customEndpoint?.endpoint || "custom"
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
