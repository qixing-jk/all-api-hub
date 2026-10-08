import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
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
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configCodec"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/refresh"
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

type VoApiV2AccountDataRequest = ApiServiceRequest &
  Partial<
    Pick<
      ApiServiceAccountRequest,
      "checkIn" | "includeTodayCashflow" | "siteType"
    >
  >

const buildTodayStatisticsEndpoint = () => {
  const frozenNow = new Date()
  const start = new Date(frozenNow.getTime())
  start.setHours(0, 0, 0, 0)

  const end = new Date(frozenNow.getTime())
  end.setHours(23, 59, 59, 999)

  return `${VOAPI_V2_ENDPOINTS.DashboardStatistics}?t=h&s=${start.getTime()}&e=${end.getTime()}`
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

const partialAvailability = (): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
  reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
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
  const userInfoPromise = fetchVoApiV2UserInfo(request)
  // VoAPI v2 dashboard statistics accept one millisecond date range and return
  // requests plus separate basic/bound usage. Source: https://github.com/VoAPI/VoAPI
  const statsPromise =
    request.includeTodayCashflow !== false
      ? fetchVoApiV2Data<VoApiV2DashboardStatistics>(
          request,
          buildTodayStatisticsEndpoint(),
          { cache: "no-store" },
        )
          .then((data) => ({ kind: "success" as const, data }))
          .catch((error: unknown) => {
            logger.warn("Failed to fetch VoAPI v2 dashboard statistics", error)
            return { kind: "failed" as const }
          })
      : Promise.resolve({ kind: "skipped" as const })
  const checkInPromise = refreshSelectedStatus({
    config: resolvedCheckIn,
    siteType: request.siteType ?? SITE_TYPES.VO_API_V2,
    request,
  })

  const [userInfo, statsResult, checkIn] = await Promise.all([
    userInfoPromise,
    statsPromise,
    checkInPromise,
  ])

  const quota =
    amountToQuota(userInfo.basicBalance) + amountToQuota(userInfo.bindBalance)
  const stats = statsResult.kind === "success" ? statsResult.data : undefined
  const usedBasicBalance = toOptionalFiniteNumber(stats?.d?.usedBasicBalance)
  const usedBindBalance = toOptionalFiniteNumber(stats?.d?.usedBindBalance)
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
    statsResult.kind === "skipped"
      ? {
          consumption: notCollected,
          requests: notCollected,
        }
      : statsResult.kind === "failed"
        ? {
            consumption: requestFailure,
            requests: requestFailure,
          }
        : {
            consumption:
              validConsumptionSourceCount === 2
                ? completeAvailability()
                : validConsumptionSourceCount === 1
                  ? partialAvailability()
                  : invalidPayload,
            requests:
              requests === undefined ? invalidPayload : completeAvailability(),
          }

  return {
    quota,
    today_quota_consumption:
      amountToQuota(usedBasicBalance) + amountToQuota(usedBindBalance),
    today_requests_count: Math.max(0, Math.trunc(requests ?? 0)),
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_income: 0,
    todayStatsAvailability: {
      ...todayStatsAvailability,
      tokens: unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    checkIn,
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
