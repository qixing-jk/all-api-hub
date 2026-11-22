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
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
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
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"
import { toOptionalFiniteNumber } from "~/utils/core/number"
import { isRecord } from "~/utils/core/object"

import { DAYA_ENDPOINTS, DAYA_TODAY_TIME_ZONE } from "./constants"
import { fetchDayaIdentity } from "./identity"
import {
  fetchDayaEnvelope,
  invalidDayaResponse,
  withDayaSession,
} from "./transport"

/**
 * Wallet balance is pay-as-you-go USD credit. The API subscription allowance
 * (`/subscriptions/*`) is a separate quota concept and is not merged into it.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withDayaSession(request, async (request) => {
    const identity = await fetchDayaIdentity(request)
    const endpoint = DAYA_ENDPOINTS.Identity
    const scope = accountBalanceScope(request, {
      walletId: String(identity.id),
    })
    const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
    const observedAt = Date.now()
    const result: AccountData = {
      ...accountBalanceObservation(
        scope,
        [
          balancePosition({
            id: "balance",
            collectionKey: WALLET_BALANCE_COLLECTION_KEY,
            scope,
            asset,
            nature: BALANCE_NATURES.Prepaid,
            value: identity.balanceUsd,
            observedAt,
            source: {
              adapter: "daya",
              operation: endpoint,
              contractVersion: "wallet-usd/v1",
              kind: EVIDENCE_KINDS.Reported,
              inputs: ["balance"],
            },
          }),
        ],
        observedAt,
        FINANCIAL_ENUMERATION.Complete,
      ),
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
    // Rewards have no income concept; only consumption, requests and tokens are
    // reported by the dashboard statistics route.
    result.todayStatsAvailability!.income = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    }
    if (request.includeTodayCashflow === false) return result
    const statsEndpoint = `${DAYA_ENDPOINTS.TodayStats}?timezone=${encodeURIComponent(DAYA_TODAY_TIME_ZONE)}`
    const requestedDay = getDayKeyFromUnixSeconds(
      Date.now() / 1000,
      DAYA_TODAY_TIME_ZONE,
    )
    try {
      const body = await fetchDayaEnvelope(request, statsEndpoint)
      const stats = body.data
      if (!isRecord(stats)) return invalidDayaResponse(statsEndpoint)
      const counter = (key: string) => {
        const value = toOptionalFiniteNumber(stats[key])
        return value !== undefined && value >= 0 ? value : undefined
      }
      const input = counter("today_input_tokens"),
        cacheCreation = counter("today_cache_creation_tokens"),
        cacheRead = counter("today_cache_read_tokens"),
        output = counter("today_output_tokens"),
        requests = counter("today_requests")
      const parsedCost = parseDecimal(stats.today_cost)
      const cost = parsedCost?.startsWith("-") ? undefined : parsedCost
      result.today_quota_consumption =
        cost === undefined ? 0 : Number(cost) * QUOTA_PER_USD
      result.today_requests_count = requests ?? 0
      const tokenParts = [input, cacheCreation, cacheRead, output]
      const completeTokens = tokenParts.every((value) => value !== undefined)
      result.today_prompt_tokens = completeTokens
        ? input! + cacheCreation! + cacheRead!
        : 0
      result.today_completion_tokens = output ?? 0
      const costObservedAt = Date.now()
      const day = getDayKeyFromUnixSeconds(
        costObservedAt / 1000,
        DAYA_TODAY_TIME_ZONE,
      )
      const start = Date.parse(`${day}T00:00:00+08:00`)
      const sameDay = day === requestedDay
      const costAmount = observeAmount(
        cost,
        {
          adapter: "daya",
          operation: DAYA_ENDPOINTS.TodayStats,
          // Wallet and settled charges use the same reported USD denomination.
          contractVersion: "wallet-usd/v1",
          kind: EVIDENCE_KINDS.Reported,
          inputs: ["today_cost"],
        },
        costObservedAt,
      )
      const reportingScope = accountReportingScope(request, {
        walletId: String(identity.id),
      })
      if (sameDay && costObservedAt > start)
        result.settledConsumption = [
          {
            asset,
            scope: reportingScope,
            amount: costAmount,
            window: {
              start,
              end: costObservedAt,
              timeZone: DAYA_TODAY_TIME_ZONE,
            },
            settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
            coverage: FINANCIAL_COVERAGE.Complete,
            cumulative: true,
          },
        ]
      result.usage = {
        scope: sameDay ? "today" : "current_period",
        cost: {
          asset,
          scope: reportingScope,
          amount: costAmount,
          ...(sameDay && costObservedAt > start
            ? {
                window: {
                  start,
                  end: costObservedAt,
                  timeZone: DAYA_TODAY_TIME_ZONE,
                },
              }
            : {}),
        },
        totalRequests: requests,
        ...(completeTokens
          ? {
              totalTokens:
                result.today_prompt_tokens + result.today_completion_tokens,
            }
          : {}),
      }
      for (const [key, known] of [
        ["consumption", cost !== undefined],
        ["requests", requests !== undefined],
        ["tokens", completeTokens],
      ] as const)
        result.todayStatsAvailability![key] = !sameDay
          ? {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
            }
          : known
            ? { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete }
            : {
                status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
                reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
              }
    } catch (error) {
      if (
        request.abortSignal?.aborted ||
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
