import { UI_CONSTANTS } from "~/constants/ui"
import {
  TELEMETRY_PROVIDER_PROTOCOL,
  type TelemetryPatch,
} from "~/services/apiCredentialProfiles/telemetryContracts"
import type { ApiCredentialTelemetryJsonPathMap } from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES } from "~/types/apiCredentialProfiles"

const OPENAI_BILLING_LIMIT_BALANCE_MAX_USD = 1_000_000

/**
 * Checks whether an unknown value can be safely read as a plain object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

/**
 * Unwraps common response envelopes so telemetry parsers can read fields.
 */
export function dataLike(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  if (isRecord(value.data)) return value.data
  return value
}

/**
 * Reads a finite number from numeric or numeric-string response fields.
 */
export function readNumber(value: unknown): number | undefined {
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
export function nonNegativeQuotaToUsd(
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined
  return quotaToUsd(Math.max(0, value))
}

/**
 * Normalizes second or millisecond timestamps into milliseconds.
 */
export function normalizeTimestamp(value: unknown): number | undefined {
  const parsed = readNumber(value)
  if (parsed === undefined || parsed <= 0) return undefined
  return parsed < 1e12 ? Math.round(parsed * 1000) : Math.round(parsed)
}

/** Normalizes the provider-native DeepSeek balance response. */
export function parseDeepSeekBalance(json: unknown): TelemetryPatch {
  const record = dataLike(json)
  if (!Array.isArray(record.balance_infos)) return {}
  const infos = record.balance_infos.filter(isRecord)
  if (record.balance_infos.length === 0) {
    return {
      balance: {
        amount: 0,
        currency: TELEMETRY_PROVIDER_PROTOCOL.currencies.Cny,
        isAvailable: record.is_available === true,
      },
    }
  }

  const balances = infos.flatMap((item) => {
    const amount = readNumber(item.total_balance)
    if (amount === undefined) return []
    const grantedAmount = readNumber(item.granted_balance)
    const toppedUpAmount = readNumber(item.topped_up_balance)
    const currency =
      typeof item.currency === "string" && item.currency.trim()
        ? item.currency.trim()
        : TELEMETRY_PROVIDER_PROTOCOL.currencies.Cny
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

  // Without an explicit limit, derive one from the remaining capacity so a
  // window that only reports `remaining` does not collapse to fully exhausted.
  const normalizedLimit = Math.max(
    0,
    limit ??
      (percentUsed !== undefined
        ? 100
        : used !== undefined || remaining !== undefined
          ? (used ?? 0) + (remaining ?? 0)
          : 0),
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
export function parseGlmQuota(json: unknown): TelemetryPatch {
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
      row.type !== TELEMETRY_PROVIDER_PROTOCOL.glm.limitTypes.Tokens &&
      row.type !== TELEMETRY_PROVIDER_PROTOCOL.glm.limitTypes.Credits &&
      row.type !== TELEMETRY_PROVIDER_PROTOCOL.glm.limitTypes.Time
    )
      continue
    if (row.type === TELEMETRY_PROVIDER_PROTOCOL.glm.limitTypes.Time) {
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
      row.unit === TELEMETRY_PROVIDER_PROTOCOL.glm.fiveHourUnit &&
      row.number === TELEMETRY_PROVIDER_PROTOCOL.glm.fiveHourNumber
        ? API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour
        : row.unit === TELEMETRY_PROVIDER_PROTOCOL.glm.weeklyUnit
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

  // Fallback windows keep their provider order but must adopt the slot type
  // they fill; otherwise two windows can share one type and mislabel a slot.
  if (!fiveHour) {
    const candidate = fallback.shift()
    if (candidate) {
      fiveHour = {
        ...candidate,
        type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour,
      }
    }
  }
  if (!weekly) {
    const candidate = fallback.shift()
    if (candidate) {
      weekly = {
        ...candidate,
        type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly,
      }
    }
  }
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
export function parseKimiQuota(json: unknown): TelemetryPatch {
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
    (entry) =>
      isRecord(entry.window) &&
      entry.window.duration ===
        TELEMETRY_PROVIDER_PROTOCOL.kimi.fiveHourDurationMinutes,
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
  const balance = TELEMETRY_PROVIDER_PROTOCOL.kimi.boosterStatuses.includes(
    boosterStatus as (typeof TELEMETRY_PROVIDER_PROTOCOL.kimi.boosterStatuses)[number],
  )
    ? boosterBalance !== undefined
      ? {
          amount: Math.max(
            0,
            boosterBalance /
              TELEMETRY_PROVIDER_PROTOCOL.kimi.boosterCreditsPerUnit,
          ),
          currency: TELEMETRY_PROVIDER_PROTOCOL.currencies.Cny,
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
export function parseOpenCodeGoUsage(json: unknown): TelemetryPatch {
  const record = isRecord(json) ? json : {}
  const usage = isRecord(record.usage) ? record.usage : {}
  const windows: NonNullable<ReturnType<typeof buildQuotaWindow>>[] = []
  const windowDefinitions = [
    [
      TELEMETRY_PROVIDER_PROTOCOL.openCodeGo.windows[0],
      API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour,
    ],
    [
      TELEMETRY_PROVIDER_PROTOCOL.openCodeGo.windows[1],
      API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly,
    ],
    [
      TELEMETRY_PROVIDER_PROTOCOL.openCodeGo.windows[2],
      API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Monthly,
    ],
  ] as const

  for (const [key, type] of windowDefinitions) {
    const item = isRecord(usage[key]) ? usage[key] : undefined
    const percent = item ? readNumber(item.percent) : undefined
    if (
      item?.status !== TELEMETRY_PROVIDER_PROTOCOL.openCodeGo.usageStatus ||
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
export function parseKimiOpenPlatformBalance(
  json: unknown,
  currency:
    | typeof TELEMETRY_PROVIDER_PROTOCOL.currencies.Cny
    | typeof TELEMETRY_PROVIDER_PROTOCOL.currencies.Usd,
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
 * Parses OpenAI-compatible subscription and usage responses into telemetry.
 */
export function parseOpenAiBillingUsage(
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

/** Maps provider token counters to the normalized upload/download contract. */
export function mapTodayTokenUsage(input: {
  prompt?: number
  completion?: number
  total?: number
}): { upload?: number; download?: number; total?: number } | undefined {
  if (
    input.prompt === undefined &&
    input.completion === undefined &&
    input.total === undefined
  ) {
    return undefined
  }
  return {
    ...(input.prompt !== undefined ? { upload: input.prompt } : {}),
    ...(input.completion !== undefined ? { download: input.completion } : {}),
    ...(input.total !== undefined ? { total: input.total } : {}),
  }
}

/**
 * Maps a custom telemetry JSON response through configured JSON paths.
 */
export function mapCustomJson(
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
  const todayTokens = mapTodayTokenUsage({
    prompt: todayPromptTokens,
    completion: todayCompletionTokens,
    total: todayTotalTokens,
  })

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
    ...(todayTokens ? { todayTokens } : {}),
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
