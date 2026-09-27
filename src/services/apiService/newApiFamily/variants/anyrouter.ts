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
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/refresh"
import { SiteHealthStatus, type CheckInConfig } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamily.AnyRouter")

/**
 * AnyRouter always supports the check-in workflow.
 */
export async function fetchSupportCheckIn(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return true
}

/**
 * Fetch complete AnyRouter account data.
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
  const [quota, todayUsage, todayIncome] = await Promise.all([
    quotaPromise,
    todayUsagePromise,
    todayIncomePromise,
  ])

  return {
    quota,
    ...todayUsage,
    ...todayIncome,
    todayStatsAvailability: {
      ...todayUsage.todayStatsAvailability,
      ...todayIncome.todayStatsAvailability,
    },
    // AnyRouter has no verified read-only status operation. Its apparent
    // status endpoint mutates by signing in, so ordinary refresh is a no-op.
    checkIn: await refreshSelectedStatus({
      config: checkIn,
      siteType: request.siteType ?? SITE_TYPES.ANYROUTER,
      readStatus: async () => undefined,
    }),
  }
}

/**
 * Refresh AnyRouter account data with normalized health status.
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
