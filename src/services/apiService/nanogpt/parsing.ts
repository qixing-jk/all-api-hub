import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { isRecord } from "~/utils/core/object"

/** Amounts arrive as decimal strings; a missing or malformed amount is never zero. */
function readNanoGptAmount(value: unknown): number | undefined {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return amount
}

const invalid = (endpoint: string) =>
  new ApiError(
    "Invalid NanoGPT response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

export type NanoGptBalance = {
  usdBalance: number
  nanoBalance?: number
  /** Per-account Nano deposit address; the stable identity a key can prove. */
  depositAddress: string
}

/**
 * Reads `POST /api/check-balance` (evidence/probe-02, documented BalanceResponse).
 * The documented schema is `{ usd_balance, nano_balance, nanoDepositAddress }`
 * with string amounts.
 */
export function parseNanoGptBalance(
  value: unknown,
  endpoint: string,
): NanoGptBalance {
  if (!isRecord(value)) throw invalid(endpoint)
  const usdBalance = readNanoGptAmount(value.usd_balance)
  if (usdBalance === undefined) throw invalid(endpoint)
  const depositAddress =
    typeof value.nanoDepositAddress === "string"
      ? value.nanoDepositAddress.trim()
      : ""
  if (!depositAddress) throw invalid(endpoint)
  const nanoBalance = readNanoGptAmount(value.nano_balance)
  return {
    usdBalance,
    ...(nanoBalance === undefined ? {} : { nanoBalance }),
    depositAddress,
  }
}

export type NanoGptUsageAggregate = {
  requests: number
  totalTokens: number
  /** Net of refunds when the provider reports it; otherwise the gross charge. */
  costUsd: number
}

/**
 * Reads the `totals` block of `GET /api/v1/usage` (documented response shape).
 * The endpoint is key-scoped and defaults to the last 30 UTC days.
 */
export function parseNanoGptUsageAggregate(
  value: unknown,
  endpoint: string,
): NanoGptUsageAggregate {
  if (!isRecord(value) || !isRecord(value.totals)) throw invalid(endpoint)
  const totals = value.totals
  const requests = readNanoGptAmount(totals.requests)
  const totalTokens = readNanoGptAmount(totals.totalTokens)
  const costUsd =
    readNanoGptAmount(totals.netCostUsd) ?? readNanoGptAmount(totals.costUsd)
  if (
    requests === undefined ||
    totalTokens === undefined ||
    costUsd === undefined
  )
    throw invalid(endpoint)
  return { requests, totalTokens, costUsd }
}

export type NanoGptQuotaWindow = {
  used?: number
  remaining?: number
  resetAt?: string
}

export type NanoGptSubscriptionSnapshot = {
  active: boolean
  state?: string
  dailyInputTokens?: NanoGptQuotaWindow
  weeklyInputTokens?: NanoGptQuotaWindow
  dailyImages?: NanoGptQuotaWindow
}

const readQuotaWindow = (value: unknown): NanoGptQuotaWindow | undefined => {
  if (!isRecord(value)) return undefined
  const used = readNanoGptAmount(value.used)
  const remaining = readNanoGptAmount(value.remaining)
  const resetAtMs = readNanoGptAmount(value.resetAt)
  // Documented as UNIX epoch milliseconds; an unusable instant is dropped
  // rather than surfaced as an invalid date.
  let resetAt: string | undefined
  if (resetAtMs !== undefined && resetAtMs > 0) {
    const instant = new Date(resetAtMs)
    if (Number.isFinite(instant.getTime())) resetAt = instant.toISOString()
  }
  const window: NanoGptQuotaWindow = {
    ...(used === undefined ? {} : { used }),
    ...(remaining === undefined ? {} : { remaining }),
    ...(resetAt === undefined ? {} : { resetAt }),
  }
  return Object.keys(window).length ? window : undefined
}

/**
 * Reads `GET /api/subscription/v1/usage` (evidence/probe-02, probe-20).
 *
 * Counters are null when unknown or not configured (`degraded: true`); a null
 * counter is unknown, not a full or zero allowance, so it is omitted here.
 * `dailyInputTokens` and `weeklyInputTokens` are independent quotas, and an
 * account may configure only one of them.
 */
export function parseNanoGptSubscription(
  value: unknown,
  endpoint: string,
): NanoGptSubscriptionSnapshot {
  if (!isRecord(value) || typeof value.active !== "boolean")
    throw invalid(endpoint)
  const dailyInputTokens = readQuotaWindow(value.dailyInputTokens)
  const weeklyInputTokens = readQuotaWindow(value.weeklyInputTokens)
  const dailyImages = readQuotaWindow(value.dailyImages)
  return {
    active: value.active,
    ...(typeof value.state === "string" ? { state: value.state } : {}),
    ...(dailyInputTokens ? { dailyInputTokens } : {}),
    ...(weeklyInputTokens ? { weeklyInputTokens } : {}),
    ...(dailyImages ? { dailyImages } : {}),
  }
}
