import { t } from "i18next"

import {
  determineHealthStatus,
  fetchAccountQuota,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/common"
import type {
  AccountData,
  ApiServiceAccountRequest,
  ApiServiceRequest,
  RefreshAccountResult,
} from "~/services/apiService/common/type"
import { anyrouterProvider } from "~/services/autoCheckin/providers/anyrouter"
import { SiteHealthStatus, type CheckInConfig } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to AnyRouter site API overrides.
 */
const logger = createLogger("ApiService.AnyRouter")

/**
 * Check if site supports check-in based on status info.
 * @returns Whether check-in is enabled (undefined when unknown).
 */
export async function fetchSupportCheckIn(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return true
}

/**
 * Fetch check-in capability for the user.
 * @returns True/false when available; undefined if unsupported or errors.
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
      account_info: { id: numericUserId },
    })
    return checkInData.status !== CHECKIN_RESULT_STATUS.ALREADY_CHECKED
  } catch (error) {
    logger.warn("获取签到状态失败", error)
    return undefined // 其他错误也视为不支持
  }
}

/**
 * Fetch complete account data.
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
      siteStatus: {
        ...(checkIn.siteStatus ?? {}),
        isCheckedInToday: !(canCheckIn ?? true),
      },
    },
  }
}

/**
 * Refresh account data with error handling.
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
