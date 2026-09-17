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
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/refresh"
import { SiteHealthStatus, type CheckInConfig } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamily.Veloera")

export { fetchSupportCheckIn } from "./veloeraCheckIn"

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
