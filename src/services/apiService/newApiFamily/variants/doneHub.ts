import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  fetchAccountQuota,
  fetchCheckInStatus,
  fetchTodayIncome as fetchTodayIncomeFromNewApiFamily,
  fetchTodayUsage as fetchTodayUsageFromNewApiFamily,
  resolveCheckInSiteStatus,
} from "~/services/apiService/newApiFamily/default/accountData"
import {
  getTodayTimestampRange,
  type TodayTimestampRange,
} from "~/services/apiService/newApiFamily/default/accountDataUtils"
import type { TodayLogQueryConfig } from "~/services/history/usageHistory/usageLogModel"
import { CheckInConfig, SiteHealthStatus } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamily.DoneHub")

/**
 * DoneHub uses custom pagination and response field names for user log queries.
 */
const DONE_HUB_TODAY_LOG_QUERY_CONFIG: TodayLogQueryConfig = {
  endpoint: "/api/log/self",
  pageParamName: "page",
  pageSizeParamName: "size",
  logTypeParamName: "log_type",
  itemsField: "data",
  totalField: "total_count",
  includeGroupParam: false,
}

/**
 * Fetch DoneHub today's usage through New API-family today-log helpers.
 */
export async function fetchTodayUsage(
  request: ApiServiceAccountRequest,
  timestampRange: TodayTimestampRange = getTodayTimestampRange(),
) {
  return await fetchTodayUsageFromNewApiFamily(
    request,
    DONE_HUB_TODAY_LOG_QUERY_CONFIG,
    timestampRange,
  )
}

/**
 * Fetch DoneHub today's income through New API-family today-log helpers.
 */
export async function fetchTodayIncome(
  request: ApiServiceAccountRequest,
  timestampRange: TodayTimestampRange = getTodayTimestampRange(),
) {
  return await fetchTodayIncomeFromNewApiFamily(
    request,
    DONE_HUB_TODAY_LOG_QUERY_CONFIG,
    timestampRange,
  )
}

/**
 * Fetch a full DoneHub account snapshot.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const resolvedCheckIn: CheckInConfig = request.checkIn
  const timestampRange = getTodayTimestampRange()

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request, timestampRange)
  const todayIncomePromise = fetchTodayIncome(request, timestampRange)
  const checkInPromise = resolvedCheckIn?.enableDetection
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
      ...resolvedCheckIn,
      siteStatus: resolveCheckInSiteStatus(resolvedCheckIn, canCheckIn),
    },
  }
}

/**
 * Refresh a DoneHub account and convert failures to health status metadata.
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
    logger.error("DoneHub 刷新账号数据失败", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
