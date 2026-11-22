import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  accountBalanceObservation,
  accountBalanceScope,
  accountReportingScope,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { addDecimal, parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_LABEL_KEYS,
  BALANCE_NATURES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import { fetchVoApiV2Data } from "~/services/apiService/voapiV2/dashboardRequest"
import {
  amountToQuota,
  isVoApiV2AuthExpiredError,
} from "~/services/apiService/voapiV2/parsing"
import { resyncVoApiV2AuthToken } from "~/services/apiService/voapiV2/tokenResync"
import {
  VOAPI_V2_ENDPOINTS,
  type VoApiV2DashboardStatistics,
  type VoApiV2UserInfo,
} from "~/services/apiService/voapiV2/type"
import { type ApiServiceRequest } from "~/services/apiTransport/type"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configuration/configCodec"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  SiteHealthStatus,
  type AccountTodayMetricAvailability,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { toOptionalFiniteNumber } from "~/utils/core/number"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.VoAPIV2")

const STATISTICS_RESULTS = {
  Success: "success",
  Failed: "failed",
  Skipped: "skipped",
} as const

type VoApiV2AccountDataRequest = ApiServiceRequest &
  Partial<
    Pick<
      ApiServiceAccountRequest,
      "checkIn" | "includeTodayCashflow" | "siteType"
    >
  >

const buildTodayStatisticsQuery = () => {
  const frozenNow = new Date()
  const start = new Date(frozenNow.getTime())
  start.setHours(0, 0, 0, 0)

  const end = new Date(frozenNow.getTime())
  end.setHours(23, 59, 59, 999)

  return {
    endpoint: `${VOAPI_V2_ENDPOINTS.DashboardStatistics}?t=h&s=${start.getTime()}&e=${end.getTime()}`,
    window: {
      start: start.getTime(),
      end: end.getTime() + 1,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  }
}

const completeAvailability = (): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
})

const unavailableAvailability = (
  reason: AccountTodayMetricAvailability["reason"],
): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason,
})

/**
 * Fetches the authenticated VoAPI v2 account profile.
 */
export const fetchVoApiV2UserInfo = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2UserInfo>(request, VOAPI_V2_ENDPOINTS.UserInfo, {
    cache: "no-store",
  })

/**
 * Reports check-in support for VoAPI v2 accounts.
 */
export const fetchSupportCheckIn = async (
  _request: ApiServiceRequest,
): Promise<boolean | undefined> => true

/**
 * Maps VoAPI v2 balances and current-day statistics into account dashboard data.
 */
export async function fetchVoApiV2AccountData(
  request: VoApiV2AccountDataRequest,
): Promise<AccountData> {
  const resolvedCheckIn = normalizeCheckInConfigV7(request.checkIn)
  const statisticsQuery = buildTodayStatisticsQuery()
  const userInfoPromise = fetchVoApiV2UserInfo(request).then((userInfo) => ({
    userInfo,
    observedAt: Date.now(),
  }))
  // VoAPI v2 dashboard statistics accept one millisecond date range and return
  // requests plus separate basic/bound usage. Source: https://github.com/VoAPI/VoAPI
  const statsPromise =
    request.includeTodayCashflow !== false
      ? fetchVoApiV2Data<VoApiV2DashboardStatistics>(
          request,
          statisticsQuery.endpoint,
          { cache: "no-store" },
        )
          .then((data) => ({
            kind: STATISTICS_RESULTS.Success,
            data,
            observedAt: Date.now(),
          }))
          .catch((error: unknown) => {
            logger.warn("Failed to fetch VoAPI v2 dashboard statistics", error)
            return { kind: STATISTICS_RESULTS.Failed }
          })
      : Promise.resolve({ kind: STATISTICS_RESULTS.Skipped })

  const [{ userInfo, observedAt }, statsResult] = await Promise.all([
    userInfoPromise,
    statsPromise,
  ])

  const scope = accountBalanceScope(request)
  const balance = accountBalanceObservation(
    scope,
    (["basicBalance", "bindBalance"] as const).map((field) =>
      balancePosition({
        id: field,
        labelKey:
          field === "basicBalance"
            ? BALANCE_LABEL_KEYS.Basic
            : BALANCE_LABEL_KEYS.Bound,
        collectionKey: WALLET_BALANCE_COLLECTION_KEY,
        scope,
        observedAt,
        value: userInfo?.[field],
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        nature:
          field === "basicBalance"
            ? BALANCE_NATURES.Prepaid
            : BALANCE_NATURES.Unknown,
        source: {
          adapter: SITE_TYPES.VO_API_V2,
          operation: VOAPI_V2_ENDPOINTS.UserInfo,
          inputs: [field],
          contractVersion: "usd/v1",
          kind: EVIDENCE_KINDS.Reported,
        },
      }),
    ),
    observedAt,
    FINANCIAL_ENUMERATION.Complete,
  )
  const stats =
    statsResult.kind === STATISTICS_RESULTS.Success
      ? statsResult.data
      : undefined
  for (const position of balance.balance.positions) {
    if (position.amount.status === OBSERVATION_STATUSES.Known)
      balance.balanceRefreshParts.push({
        collectionKey: WALLET_BALANCE_COLLECTION_KEY,
        source: {
          ...position.amount.source,
          operation: `${VOAPI_V2_ENDPOINTS.UserInfo}:${position.id}`,
        },
        enumeration: FINANCIAL_ENUMERATION.Complete,
        positions: [],
      })
  }
  const usedBasicBalance = parseDecimal(stats?.d?.usedBasicBalance)
  const usedBindBalance = parseDecimal(stats?.d?.usedBindBalance)
  let nativeConsumption: string | undefined
  try {
    nativeConsumption =
      usedBasicBalance !== undefined && usedBindBalance !== undefined
        ? addDecimal(usedBasicBalance, usedBindBalance)
        : (usedBasicBalance ?? usedBindBalance)
  } catch {
    nativeConsumption = undefined
  }
  const requests = toOptionalFiniteNumber(stats?.d?.requests)
  const validConsumptionSourceCount =
    Number(usedBasicBalance !== undefined) +
    Number(usedBindBalance !== undefined)
  const requestFailure = unavailableAvailability(
    ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
  )
  const invalidPayload = unavailableAvailability(
    ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
  )
  const notCollected = unavailableAvailability(
    ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
  )
  const todayStatsAvailability =
    statsResult.kind === STATISTICS_RESULTS.Skipped
      ? {
          consumption: notCollected,
          requests: notCollected,
        }
      : statsResult.kind === STATISTICS_RESULTS.Failed
        ? {
            consumption: requestFailure,
            requests: requestFailure,
          }
        : {
            consumption:
              validConsumptionSourceCount === 2
                ? completeAvailability()
                : invalidPayload,
            requests:
              requests === undefined ? invalidPayload : completeAvailability(),
          }

  return {
    ...balance,
    ...(statsResult.kind === STATISTICS_RESULTS.Success
      ? {
          settledConsumption: [
            {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              scope: accountReportingScope(request),
              window: statisticsQuery.window,
              settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
              coverage:
                validConsumptionSourceCount === 2
                  ? FINANCIAL_COVERAGE.Complete
                  : FINANCIAL_COVERAGE.Partial,
              amount: observeAmount(
                nativeConsumption,
                {
                  adapter: SITE_TYPES.VO_API_V2,
                  operation: `${VOAPI_V2_ENDPOINTS.DashboardStatistics}:consumption`,
                  contractVersion: "usd/v1",
                  kind: EVIDENCE_KINDS.Derived,
                  inputs: ["usedBasicBalance", "usedBindBalance"],
                  amountInputs: {
                    ...(usedBasicBalance === undefined
                      ? {}
                      : { usedBasicBalance }),
                    ...(usedBindBalance === undefined
                      ? {}
                      : { usedBindBalance }),
                  },
                },
                statsResult.observedAt,
              ),
            },
          ],
        }
      : {}),
    today_quota_consumption:
      nativeConsumption !== undefined &&
      validConsumptionSourceCount === 2 &&
      parseDecimal(Number(nativeConsumption)) === nativeConsumption
        ? amountToQuota(Number(nativeConsumption))
        : 0,
    today_requests_count: Math.max(0, Math.trunc(requests ?? 0)),
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_income: 0,
    todayStatsAvailability: {
      ...todayStatsAvailability,
      tokens: unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    checkIn: resolvedCheckIn,
  }
}

/**
 * Refreshes VoAPI v2 account data with a site-specific expired-session status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchVoApiV2AccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    if (isVoApiV2AuthExpiredError(error)) {
      const resynced = await resyncVoApiV2AuthToken(
        request.baseUrl,
        request.tempWindowRequestSource || undefined,
        request.protectionBypassExecution,
      )
      if (resynced) {
        const resyncedRequest: ApiServiceAccountRequest = {
          ...request,
          auth: {
            ...request.auth,
            accessToken: resynced.accessToken,
            userId: resynced.userId,
          },
        }

        try {
          const data = await fetchVoApiV2AccountData(resyncedRequest)
          return {
            success: true,
            data,
            authUpdate: {
              accessToken: resynced.accessToken,
              userId: resynced.userId,
              ...(resynced.username ? { username: resynced.username } : {}),
            },
            healthStatus: {
              status: SiteHealthStatus.Healthy,
              message: t("account:healthStatus.normal"),
            },
          }
        } catch (retryError) {
          if (isVoApiV2AuthExpiredError(retryError)) {
            return {
              success: false,
              healthStatus: {
                status: SiteHealthStatus.Warning,
                message: t("account:healthStatus.httpError", {
                  statusCode: 401,
                  message: retryError.message,
                }),
              },
            }
          }

          return {
            success: false,
            healthStatus: determineHealthStatus(retryError),
          }
        }
      }

      return {
        success: false,
        healthStatus: {
          status: SiteHealthStatus.Warning,
          message: t("account:healthStatus.httpError", {
            statusCode: 401,
            message: error.message,
          }),
        },
      }
    }

    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
