import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  fetchAccountQuota,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/newApiFamily/default/accountData"
import { getTodayTimestampRange } from "~/services/apiService/newApiFamily/default/accountDataUtils"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/refresh"
import { SiteHealthStatus, type CheckInConfig } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamily.Veloera")

export { fetchSupportCheckIn } from "./veloeraCheckIn"

/**
 * Fetch Veloera check-in capability for the user.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  try {
    const checkInData = await newApiFamilyRequests.data<{
      can_check_in?: boolean
    }>(request, {
      endpoint: "/api/user/check_in_status",
    })
    if (typeof checkInData.can_check_in === "boolean") {
      return checkInData.can_check_in
    }
    return undefined
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.statusCode === 404 || error.statusCode === 500)
    ) {
      return undefined
    }
    logger.warn("获取签到状态失败:", error)
    return undefined
  }
}

/**
 * Fetch and aggregate all Veloera account data.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const resolvedCheckIn: CheckInConfig = request.checkIn
  const timestampRange = getTodayTimestampRange()

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request, undefined, timestampRange)
  const todayIncomePromise = fetchTodayIncome(
    request,
    undefined,
    timestampRange,
  )
  const checkInPromise = refreshSelectedStatus({
    config: resolvedCheckIn,
    siteType: request.siteType ?? SITE_TYPES.VELOERA,
    request,
  })

  const [quota, todayUsage, todayIncome, checkIn] = await Promise.all([
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
    checkIn,
  }
}

/**
 * Refresh Veloera account data with normalized health status.
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
    logger.error("刷新账号数据失败", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
