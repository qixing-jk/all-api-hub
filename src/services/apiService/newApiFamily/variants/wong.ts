import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  fetchTokenSecretKeyByIdWithMethod,
  resolveApiTokenKeyWithFetcher,
} from "~/services/accountTokens/tokenKeyResolver"
import {
  fetchAccountQuota,
  fetchTodayIncome,
  fetchTodayUsage,
  resolveCheckInSiteStatus,
} from "~/services/apiService/newApiFamily/default/accountData"
import { getTodayTimestampRange } from "~/services/apiService/newApiFamily/default/accountDataUtils"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type CheckInConfig,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamily.Wong")
const ENDPOINT = "/api/user/checkin"

export type WongCheckinStatusData = {
  checked_at: number
  checked_in: boolean
  enabled: boolean
  max_quota: number
  min_quota: number
  quota: number
}

export type WongCheckinApiResponse = {
  success: boolean
  message: string
  data?: WongCheckinStatusData
}

/**
 * Whether the current WONG-compatible site supports check-in.
 */
export async function fetchSupportCheckIn(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const siteStatus = await fetchCheckInStatus(request)
  return siteStatus !== undefined
}

const fetchWongTokenSecretKeyById = (
  request: ApiServiceRequest,
  tokenId: number,
) => fetchTokenSecretKeyByIdWithMethod(request, tokenId, "GET")

const normalizeMessage = (message: unknown): string =>
  typeof message === "string" ? message : ""

const isAlreadyCheckedMessage = (message: string): boolean => {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("今天已经签到") ||
    normalized.includes("已签到") ||
    normalized.includes("already")
  )
}

/**
 * Fetch today's WONG check-in status.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const normalizedRequest: ApiServiceRequest =
    request.auth.authType === AuthTypeEnum.None
      ? {
          ...request,
          auth: {
            ...request.auth,
            authType: AuthTypeEnum.AccessToken,
          },
        }
      : request

  try {
    const response = await fetchApi<WongCheckinStatusData | undefined>(
      normalizedRequest,
      {
        endpoint: ENDPOINT,
        options: {
          method: "GET",
          cache: "no-store",
        },
      },
      false,
    )

    const responseMessage = normalizeMessage(response.message)

    if (responseMessage && isAlreadyCheckedMessage(responseMessage)) {
      return false
    }

    if (response.data?.enabled === false) {
      return undefined
    }

    if (!response.success) {
      if (response.data?.checked_in === true) {
        return false
      }
      return undefined
    }

    if (typeof response.data?.checked_in === "boolean") {
      return !response.data.checked_in
    }

    return undefined
  } catch (error) {
    logger.warn("Failed to fetch check-in status", error)
    return undefined
  }
}

/**
 * Fetch WONG account data by composing default account data helpers and
 * WONG-specific check-in detection.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const checkIn: CheckInConfig = request.checkIn
  const timestampRange = getTodayTimestampRange()

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request, undefined, timestampRange)
  const todayIncomePromise = fetchTodayIncome(
    request,
    undefined,
    timestampRange,
  )
  const checkInPromise = checkIn?.enableDetection
    ? fetchCheckInStatus(request)
    : Promise.resolve<boolean | undefined>(undefined)

  const [quota, todayUsage, todayIncome, canCheckIn] = await Promise.all([
    quotaPromise,
    todayUsagePromise,
    todayIncomePromise,
    checkInPromise,
  ])

  return {
    quota,
    ...todayUsage,
    ...todayIncome,
    todayStatsAvailability: {
      ...todayUsage.todayStatsAvailability,
      ...todayIncome.todayStatsAvailability,
    },
    checkIn: {
      ...checkIn,
      siteStatus: resolveCheckInSiteStatus(checkIn, canCheckIn),
    },
  }
}

/**
 * Refresh WONG account data with normalized health status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchAccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    logger.error("Failed to refresh account data", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}

/**
 * WONG reveals masked token secrets with GET `/api/token/{id}/key`.
 */
export async function resolveApiTokenKey(
  request: ApiServiceRequest,
  token: Pick<ApiToken, "id" | "key">,
): Promise<string> {
  return resolveApiTokenKeyWithFetcher(
    request,
    token,
    fetchWongTokenSecretKeyById,
  )
}
