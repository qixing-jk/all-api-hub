import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/apiService/common"
import {
  fetchAccountQuota,
  fetchCheckInStatus,
  fetchTodayIncome as fetchTodayIncomeFromNewApiFamily,
  fetchTodayUsage as fetchTodayUsageFromNewApiFamily,
} from "~/services/apiService/newApiFamily/default/accountData"
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
export async function fetchTodayUsage(request: ApiServiceAccountRequest) {
  return await fetchTodayUsageFromNewApiFamily(
    request,
    DONE_HUB_TODAY_LOG_QUERY_CONFIG,
  )
}

/**
 * Fetch DoneHub today's income through New API-family today-log helpers.
 */
export async function fetchTodayIncome(request: ApiServiceAccountRequest) {
  return await fetchTodayIncomeFromNewApiFamily(
    request,
    DONE_HUB_TODAY_LOG_QUERY_CONFIG,
  )
}

/**
 * Fetch a full DoneHub account snapshot.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const resolvedCheckIn: CheckInConfig = request.checkIn

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request)
  const todayIncomePromise = fetchTodayIncome(request)
  const checkInPromise = resolvedCheckIn?.enableDetection
    ? fetchCheckInStatus(request)
    : Promise.resolve<boolean | undefined>(undefined)

  const [quota, todayUsage, todayIncome, canCheckIn] = await Promise.all([
    quotaPromise,
    todayUsagePromise,
    todayIncomePromise,
    checkInPromise,
  ])

  const didDetectCheckInStatus = resolvedCheckIn?.enableDetection === true
  const checkInDetectedAt = didDetectCheckInStatus
    ? Date.now()
    : resolvedCheckIn.siteStatus?.lastDetectedAt

  return {
    quota,
    ...todayUsage,
    ...todayIncome,
    checkIn: {
      ...resolvedCheckIn,
      siteStatus: {
        ...(resolvedCheckIn.siteStatus ?? {}),
        isCheckedInToday: didDetectCheckInStatus
          ? canCheckIn === undefined
            ? undefined
            : !canCheckIn
          : resolvedCheckIn.siteStatus?.isCheckedInToday,
        lastDetectedAt: checkInDetectedAt,
      },
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
