import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { AIMLAPI_ENDPOINTS } from "~/services/apiService/aimlapi/constants"
import {
  AimlApiCredentialScopeError,
  ensureAimlApiKey,
  fetchAimlApiJson,
  invalidAimlApiResponse,
} from "~/services/apiService/aimlapi/transport"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricAvailability,
  type AccountTodayStatsAvailability,
} from "~/types"
import { isRecord } from "~/utils/core/object"

/** Reads one finite, non-negative number or rejects the payload. */
function finiteNumber(value: unknown, endpoint: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    invalidAimlApiResponse(endpoint)
  if (value < 0) invalidAimlApiResponse(endpoint)
  return value
}

export type AimlApiBilling = {
  currentBalance: number
  currency: string
}

/** `GET /v2/billing` — the account's spendable balance, in USD. */
async function fetchAimlApiBilling(
  request: ApiServiceAccountRequest,
): Promise<AimlApiBilling> {
  const body = await fetchAimlApiJson<unknown>(
    request,
    AIMLAPI_ENDPOINTS.Billing,
    { credential: "regular-api-key" },
  )
  if (!isRecord(body)) invalidAimlApiResponse(AIMLAPI_ENDPOINTS.Billing)
  const currency = body.currency
  if (currency !== "USD") invalidAimlApiResponse(AIMLAPI_ENDPOINTS.Billing)
  return {
    currentBalance: finiteNumber(
      body.current_balance,
      AIMLAPI_ENDPOINTS.Billing,
    ),
    currency,
  }
}

export type AimlApiBillingDetail = AimlApiBilling & {
  userId: number
  email: string | null
}

/** `GET /v2/billing/detail` — the verified account identity and balance. */
export async function fetchAimlApiBillingDetail(
  request: ApiServiceAccountRequest,
): Promise<AimlApiBillingDetail> {
  const endpoint = AIMLAPI_ENDPOINTS.BillingDetail
  const body = await fetchAimlApiJson<unknown>(request, endpoint, {
    credential: "regular-api-key",
  })
  if (!isRecord(body)) invalidAimlApiResponse(endpoint)
  if (body.currency !== "USD") invalidAimlApiResponse(endpoint)
  const userId = finiteNumber(body.user_id, endpoint)
  if (!Number.isSafeInteger(userId)) invalidAimlApiResponse(endpoint)
  if (body.email !== null && typeof body.email !== "string")
    invalidAimlApiResponse(endpoint)
  return {
    currentBalance: finiteNumber(body.current_balance, endpoint),
    currency: "USD",
    userId,
    email: body.email,
  }
}

export type AimlApiTodayUsage = {
  spendUsd: number
  inputTokens: number
  outputTokens: number
  requests: number
}

const COMPLETE: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
}

const UNAVAILABLE = (
  reason: (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS],
): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason,
})

/**
 * Reads today's charged spend and token counts from the day-grouped usage
 * report. `/v2/usage` answers UTC day boundaries unless `tz` says otherwise, so
 * the window is resolved as one UTC calendar day.
 */
export async function fetchAimlApiTodayUsage(
  request: ApiServiceAccountRequest,
  now: Date = new Date(),
): Promise<AimlApiTodayUsage> {
  const endpoint = AIMLAPI_ENDPOINTS.UsageDetail
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const body = await fetchAimlApiJson<unknown>(request, endpoint, {
    credential: "regular-api-key",
    query: {
      start: start.toISOString(),
      end: end.toISOString(),
      group_by: "day",
      tz: "UTC",
    },
  })
  if (!isRecord(body)) invalidAimlApiResponse(endpoint)
  const spend = finiteNumber(body.spend, endpoint)
  const requests = finiteNumber(body.requests, endpoint)
  const groups = body.groups
  if (!Array.isArray(groups)) invalidAimlApiResponse(endpoint)

  let inputTokens = 0
  let outputTokens = 0
  for (const group of groups) {
    if (!isRecord(group) || !isRecord(group.tokens)) continue
    inputTokens += finiteNumber(group.tokens.input, endpoint)
    outputTokens += finiteNumber(group.tokens.output, endpoint)
  }

  return { spendUsd: spend, inputTokens, outputTokens, requests }
}

/** Projects one provider balance into the shared account model. */
function toAccountBalance(
  billing: AimlApiBilling,
): AccountData["nativeBalance"] {
  return {
    unit: "USD",
    permanent: billing.currentBalance,
    daily: 0,
    total: billing.currentBalance,
    components: [{ kind: "permanent", amount: billing.currentBalance }],
  }
}

const createUnavailableTodayStats = (
  reason: (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS],
): AccountTodayStatsAvailability => ({
  consumption: UNAVAILABLE(reason),
  requests: UNAVAILABLE(reason),
  tokens: UNAVAILABLE(reason),
  income: UNAVAILABLE(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
})

/**
 * Reads the account dashboard.
 *
 * Balance and today's usage both require the regular API key, which the
 * management key cannot substitute. Without that key the account stays usable
 * for key management, but every monetary metric reports itself unavailable
 * instead of collapsing to zero.
 */
export async function fetchAimlApiAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const apiKey = await ensureAimlApiKey(request)
  if (!apiKey) {
    return {
      quota: 0,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: createUnavailableTodayStats(
        ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      ),
      checkIn: request.checkIn,
    }
  }

  const scoped: ApiServiceAccountRequest = { ...request, aimlApiKey: apiKey }
  const billing = await fetchAimlApiBilling(scoped)

  let today: AimlApiTodayUsage | undefined
  let todayFailureReason:
    | (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS]
    | undefined
  try {
    today = await fetchAimlApiTodayUsage(scoped)
  } catch (error) {
    if (error instanceof AimlApiCredentialScopeError) throw error
    todayFailureReason = ACCOUNT_TODAY_METRIC_REASONS.RequestFailed
  }

  const todayStatsAvailability: AccountTodayStatsAvailability = today
    ? {
        consumption: COMPLETE,
        requests: COMPLETE,
        tokens: COMPLETE,
        income: UNAVAILABLE(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      }
    : createUnavailableTodayStats(
        todayFailureReason ?? ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      )

  return {
    quota: billing.currentBalance * QUOTA_PER_USD,
    nativeBalance: toAccountBalance(billing),
    today_quota_consumption: (today?.spendUsd ?? 0) * QUOTA_PER_USD,
    today_prompt_tokens: today?.inputTokens ?? 0,
    today_completion_tokens: today?.outputTokens ?? 0,
    today_requests_count: today?.requests ?? 0,
    today_income: 0,
    todayStatsAvailability,
    checkIn: request.checkIn,
  }
}

export const aimlApiAccountData: AccountDataCapability = {
  fetchData: fetchAimlApiAccountData,
}
