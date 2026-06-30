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
  resolveCheckInSiteStatus,
} from "~/services/apiService/newApiFamily/default/accountData"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { anyrouterProvider } from "~/services/checkin/autoCheckin/providers/anyrouter"
import { SiteHealthStatus, type CheckInConfig } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
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
 * Fetch AnyRouter check-in capability for the user.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  try {
    const userId = request.auth.userId
    const numericUserId =
      typeof userId === "number" ? userId : Number(String(userId))
    if (!Number.isFinite(numericUserId)) {
      return undefined
    }

    const checkInData = await anyrouterProvider.checkIn({
      site_url: request.baseUrl,
      id: request.accountId,
      cookieAuthSessionCookie:
        request.cookieAuthSessionCookie ?? request.auth.cookie,
      account_info: { id: numericUserId },
    })
    return checkInData.status !== CHECKIN_RESULT_STATUS.ALREADY_CHECKED
  } catch (error) {
    logger.warn("获取签到状态失败", error)
    return undefined
  }
}

/**
 * Fetch complete AnyRouter account data.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const checkIn: CheckInConfig = request.checkIn

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request)
  const todayIncomePromise = fetchTodayIncome(request)
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
    checkIn: {
      ...checkIn,
      siteStatus: resolveCheckInSiteStatus(checkIn, canCheckIn),
    },
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
