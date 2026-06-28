import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/apiService/common"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchApiData } from "~/services/apiService/common/utils"
import {
  fetchAccountQuota,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/newApiFamily/default/accountData"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { CheckInConfig, SiteHealthStatus } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamily.Veloera")

/**
 * Fetch Veloera check-in capability for the user.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  try {
    const checkInData = await fetchApiData<{ can_check_in?: boolean }>(
      request,
      {
        endpoint: "/api/user/check_in_status",
      },
    )
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
