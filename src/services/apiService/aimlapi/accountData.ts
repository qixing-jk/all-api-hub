import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountBalanceObservation,
  accountBalanceScope,
  accountReportingScope,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { compareDecimal, parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
} from "~/services/amounts/financialConstants"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
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
  currentBalance?: string
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
  if (currency !== CURRENCIES.USD)
    invalidAimlApiResponse(AIMLAPI_ENDPOINTS.Billing)
  return {
    currentBalance: parseDecimal(body.current_balance),
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
  if (body.currency !== CURRENCIES.USD) invalidAimlApiResponse(endpoint)
  const userId = finiteNumber(body.user_id, endpoint)
  if (!Number.isSafeInteger(userId)) invalidAimlApiResponse(endpoint)
  if (body.email !== null && typeof body.email !== "string")
    invalidAimlApiResponse(endpoint)
  return {
    currentBalance: parseDecimal(body.current_balance),
    currency: CURRENCIES.USD,
    userId,
    email: body.email,
  }
}

export type AimlApiTodayUsage = {
  spendUsd?: string
  observedAt: number
  window: FinancialConsumptionFact["window"]
  inputTokens: number
  outputTokens: number
  requests?: number
  tokensComplete: boolean
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
  const observedAt = Date.now()
  const parsedSpend = parseDecimal(body.spend)
  const spend =
    parsedSpend !== undefined && compareDecimal(parsedSpend, "0") >= 0
      ? parsedSpend
      : undefined
  const counter = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : undefined
  const requests = counter(body.requests)
  const groups = body.groups

  let inputTokens = 0
  let outputTokens = 0
  let tokensComplete = Array.isArray(groups)
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!isRecord(group) || !isRecord(group.tokens)) {
      tokensComplete = false
      continue
    }
    const input = counter(group.tokens.input)
    const output = counter(group.tokens.output)
    inputTokens += input ?? 0
    outputTokens += output ?? 0
    if (input === undefined || output === undefined) tokensComplete = false
  }

  return {
    spendUsd: spend,
    inputTokens,
    outputTokens,
    requests,
    tokensComplete,
    observedAt,
    window: { start: start.getTime(), end: end.getTime(), timeZone: "UTC" },
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
  const scope = accountBalanceScope(request)
  const snapshot = (value: unknown) => {
    const capturedAt = Date.now()
    return accountBalanceObservation(
      scope,
      [
        balancePosition({
          id: "balance",
          scope,
          value,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          nature: BALANCE_NATURES.Prepaid,
          observedAt: capturedAt,
          source: {
            adapter: "aimlapi",
            operation: AIMLAPI_ENDPOINTS.Billing,
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
            inputs: ["current_balance"],
          },
        }),
      ],
      capturedAt,
      FINANCIAL_ENUMERATION.Complete,
    )
  }
  const apiKey = await ensureAimlApiKey(request)
  if (!apiKey) {
    return {
      ...snapshot(undefined),
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
  const balance = snapshot(billing.currentBalance)

  let today: AimlApiTodayUsage | undefined
  let todayFailureReason:
    | (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS]
    | undefined
  try {
    if (request.includeTodayCashflow !== false)
      today = await fetchAimlApiTodayUsage(scoped)
  } catch (error) {
    if (error instanceof AimlApiCredentialScopeError) throw error
    todayFailureReason = ACCOUNT_TODAY_METRIC_REASONS.RequestFailed
  }

  const todayStatsAvailability: AccountTodayStatsAvailability = today
    ? {
        consumption:
          today.spendUsd === undefined
            ? UNAVAILABLE(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload)
            : COMPLETE,
        requests:
          today.requests === undefined
            ? UNAVAILABLE(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload)
            : COMPLETE,
        tokens: today.tokensComplete
          ? COMPLETE
          : UNAVAILABLE(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
        income: UNAVAILABLE(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      }
    : createUnavailableTodayStats(
        todayFailureReason ?? ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      )

  return {
    ...balance,
    ...(today
      ? {
          settledConsumption: [
            {
              scope: accountReportingScope(request),
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              amount: observeAmount(
                today.spendUsd,
                {
                  adapter: "aimlapi",
                  operation: AIMLAPI_ENDPOINTS.UsageDetail,
                  // Billing and charged usage share the reported USD contract;
                  // the UTC billing period remains explicit in the window.
                  contractVersion: "1",
                  kind: EVIDENCE_KINDS.Reported,
                },
                today.observedAt,
              ),
              window: today.window,
              settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
              coverage: FINANCIAL_COVERAGE.Complete,
              cumulative: true,
            },
          ],
        }
      : {}),
    today_quota_consumption: Number(today?.spendUsd ?? 0) * QUOTA_PER_USD,
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
