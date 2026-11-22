import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  parseAllowanceInstant,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import {
  accountBalanceObservation,
  accountBalanceScope,
  accountReportingScope,
} from "~/services/accounts/balanceSnapshot"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import {
  balancePosition,
  observeAmount,
  type UsageScope,
} from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import {
  KRILL_ENDPOINTS,
  KRILL_TODAY_TIME_ZONE_OFFSET_MINUTES,
} from "./constants"
import { fetchKrillIdentity } from "./identity"
import {
  invalidKrillResponse,
  readKrillEnvelope,
  withKrillSession,
} from "./transport"

/** The console's own "today" range, in the site's Asia/Shanghai day boundary. */
function todayRange(now = Date.now()) {
  const local = new Date(now + KRILL_TODAY_TIME_ZONE_OFFSET_MINUTES * 60_000)
  const day = local.toISOString().slice(0, 10)
  return { start: `${day}T00:00`, end: `${day}T23:59:59` }
}

/** Plan names come from the subscription rows; anything else stays unmapped. */
function subscriptionSummary(
  data: Record<string, unknown>,
  endpoint: string,
  scope: UsageScope,
  observedAt: number,
) {
  const hasSubscriptionList = Array.isArray(data.subscriptions)
  const subscriptions = Array.isArray(data.subscriptions)
    ? data.subscriptions
    : []
  const summary = isRecord(data.summary) ? data.summary : undefined
  const source = {
    adapter: "krill",
    operation: endpoint,
    contractVersion: "usd-plans/v1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const entries: AccountAllowanceEntry[] = []
  const summaryExpiresAt = parseAllowanceInstant(summary?.subscription_end_at)
  const summaryEnabled = subscriptions.some(
    (item) => isRecord(item) && item.status === "active",
  )
    ? true
    : hasSubscriptionList &&
        subscriptions.every(
          (item) => isRecord(item) && typeof item.status === "string",
        )
      ? false
      : undefined
  if (summary && (subscriptions.length || !hasSubscriptionList))
    entries.push({
      id: "summary",
      identityKind: ALLOWANCE_IDENTITY_KINDS.SourceSlot,
      collectionKey: "plans",
      validity:
        summaryExpiresAt === undefined
          ? { kind: BALANCE_VALIDITY_KINDS.Unknown }
          : { kind: BALANCE_VALIDITY_KINDS.Expires, at: summaryExpiresAt },
      ...(typeof summary.subscription_end_at === "string"
        ? { reportedTiming: { expiresAt: summary.subscription_end_at } }
        : {}),
      constraint: budgetConstraint({
        scope,
        source,
        observedAt,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        limitState: BUDGET_LIMIT_STATES.Finite,
        limit: summary.total_daily_quota_usd,
        used: summary.total_used_usd,
        remaining: summary.total_remaining_usd,
        enabled: summaryEnabled,
        window: {
          kind: BUDGET_WINDOW_KINDS.Periodic,
          period: BUDGET_PERIODS.Day,
        },
      }),
    })
  subscriptions.forEach((raw, index) => {
    if (!isRecord(raw)) return
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id
        : typeof raw.id === "number" && Number.isSafeInteger(raw.id)
          ? String(raw.id)
          : undefined
    const expiresAt = parseAllowanceInstant(raw.subscription_end_at)
    entries.push({
      id: id ?? `unidentified:${observedAt}:${index}`,
      identityKind: id
        ? ALLOWANCE_IDENTITY_KINDS.Upstream
        : ALLOWANCE_IDENTITY_KINDS.ObservationOnly,
      collectionKey: "plans",
      ...(isRecord(raw.plan) && typeof raw.plan.name === "string"
        ? { label: raw.plan.name }
        : {}),
      validity:
        expiresAt === undefined
          ? { kind: BALANCE_VALIDITY_KINDS.Unknown }
          : { kind: BALANCE_VALIDITY_KINDS.Expires, at: expiresAt },
      ...(typeof raw.subscription_end_at === "string"
        ? { reportedTiming: { expiresAt: raw.subscription_end_at } }
        : {}),
      constraint: budgetConstraint({
        scope,
        source,
        observedAt,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        limitState: BUDGET_LIMIT_STATES.Unknown,
        enabled:
          typeof raw.status === "string" ? raw.status === "active" : undefined,
        window: {
          kind: BUDGET_WINDOW_KINDS.Periodic,
          period: BUDGET_PERIODS.Day,
        },
      }),
    })
  })
  return accountAllowanceObservation(
    scope,
    [
      {
        source,
        collectionKey: "plans",
        enumeration: hasSubscriptionList
          ? subscriptions.every(isRecord)
            ? FINANCIAL_ENUMERATION.Complete
            : FINANCIAL_ENUMERATION.Partial
          : summary
            ? FINANCIAL_ENUMERATION.Partial
            : FINANCIAL_ENUMERATION.Unavailable,
        entries,
      },
    ],
    observedAt,
  )
}

/**
 * Cash balance is pay-as-you-go USD; plan allowance is a separate daily quota
 * that is consumed first, so the two are never merged. Welfare credit has no
 * verified cash value and is deliberately not added to the balance.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    const subscriptionBody = await readKrillEnvelope(
      scoped,
      KRILL_ENDPOINTS.Subscription,
    )
    const data = subscriptionBody.data
    if (!isRecord(data)) invalidKrillResponse(KRILL_ENDPOINTS.Subscription)
    const endpoint = KRILL_ENDPOINTS.Subscription
    const observedAt = Date.now()
    const scope = accountBalanceScope(scoped)
    const source = {
      adapter: "krill",
      operation: endpoint,
      contractVersion: "usd-wallet/v1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const result: AccountData = {
      ...accountBalanceObservation(
        scope,
        [
          balancePosition({
            id: "credit_balance_usd",
            collectionKey: WALLET_BALANCE_COLLECTION_KEY,
            scope,
            source,
            observedAt,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            value: data.credit_balance_usd,
            role: BALANCE_ROLES.Available,
            nature: BALANCE_NATURES.Prepaid,
          }),
        ],
        observedAt,
        FINANCIAL_ENUMERATION.Complete,
      ),
      ...subscriptionSummary(data, endpoint, scope, observedAt),
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_income: 0,
      todayStatsAvailability: createUnavailableTodayStatsAvailability(
        ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
      ),
      checkIn: request.checkIn,
    }
    result.todayStatsAvailability!.income = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    }
    if (request.includeTodayCashflow === false) return result
    try {
      const { start, end } = todayRange()
      const body = await readKrillEnvelope(scoped, KRILL_ENDPOINTS.TodayStats, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_time: start, end_time: end }),
      })
      const stats = body.data
      if (!isRecord(stats)) invalidKrillResponse(KRILL_ENDPOINTS.TodayStats)
      const cost = parseDecimal(stats.total_cost_usd)
      const costObservation = observeAmount(
        cost,
        { ...source, operation: KRILL_ENDPOINTS.TodayStats },
        Date.now(),
      )
      const rangeStart = parseAllowanceInstant(stats.range_start)
      const rangeEnd = parseAllowanceInstant(stats.range_end)
      if (
        rangeStart !== undefined &&
        rangeEnd !== undefined &&
        rangeStart <= rangeEnd
      )
        result.settledConsumption = [
          {
            scope: accountReportingScope(scoped),
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            amount: costObservation,
            window: {
              start: rangeStart,
              end: rangeEnd + 1000,
              timeZone: "Asia/Shanghai",
            },
            settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
            coverage: FINANCIAL_COVERAGE.Complete,
            cumulative: true,
          },
        ]
      else
        result.usage = {
          scope: ACCOUNT_USAGE_SCOPES.Unknown,
          cost: {
            scope: accountReportingScope(scoped),
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            amount: costObservation,
          },
        }
      const counter = (key: string) => {
        const value = stats[key]
        return typeof value === "number" && Number.isFinite(value) && value >= 0
          ? value
          : undefined
      }
      const input = counter("input_tokens"),
        output = counter("output_tokens"),
        cacheCreation = counter("cache_creation_input_tokens"),
        cacheRead = counter("cache_read_input_tokens"),
        requests = counter("total_requests")
      const completeTokens = [input, output, cacheCreation, cacheRead].every(
        (value) => value !== undefined,
      )
      result.today_quota_consumption = Number(cost ?? 0) * QUOTA_PER_USD
      result.today_requests_count = requests ?? 0
      result.today_prompt_tokens = completeTokens
        ? input! + cacheCreation! + cacheRead!
        : 0
      result.today_completion_tokens = output ?? 0
      for (const [key, known] of [
        ["consumption", cost !== undefined],
        ["requests", requests !== undefined],
        ["tokens", completeTokens],
      ] as const)
        result.todayStatsAvailability![key] = known
          ? { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete }
          : {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
            }
    } catch (error) {
      if (
        scoped.abortSignal?.aborted ||
        (error instanceof ApiError &&
          (error.statusCode === 401 ||
            error.statusCode === 403 ||
            error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH))
      )
        throw error
      const reason =
        error instanceof ApiError &&
        error.code === API_ERROR_CODES.JSON_PARSE_ERROR
          ? ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload
          : ACCOUNT_TODAY_METRIC_REASONS.RequestFailed
      for (const key of ["consumption", "requests", "tokens"] as const)
        result.todayStatsAvailability![key] = {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason,
        }
    }
    return result
  })
}

export { fetchKrillUserInfo } from "./identity"
export {
  fetchKrillAnnouncementItems,
  fetchKrillInviteLink,
  redeemKrillCode,
  type KrillAnnouncementItem,
} from "./surfaces"
export {
  fetchKrillModelIds,
  fetchKrillModelPricing,
  type KrillModelPricingEntry,
} from "./catalog"
