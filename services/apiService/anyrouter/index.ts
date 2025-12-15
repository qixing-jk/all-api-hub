import { t } from "i18next"

import {
  determineHealthStatus,
  fetchAccountQuota,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/common"
import type {
  AccountData,
  RefreshAccountResult,
} from "~/services/apiService/common/type"
import { anyrouterProvider } from "~/services/autoCheckin/providers/anyrouter"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

/**
 * Check if site supports check-in based on status info.
 * @returns Whether check-in is enabled (undefined when unknown).
 */
export const fetchSupportCheckIn = async (): Promise<boolean | undefined> => {
  return true
}

/**
 * Fetch check-in capability for the user.
 * @param baseUrl Site base URL.
 * @param userId Target user id.
 * @param accessToken Access token for the user.
 * @param authType Optional auth mode override.
 * @returns True/false when available; undefined if unsupported or errors.
 */
export const fetchCheckInStatus = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  authType?: AuthTypeEnum,
): Promise<boolean | undefined> => {
  try {
    void accessToken
    void authType

    const checkInData = await anyrouterProvider.checkIn({
      site_url: baseUrl,
      account_info: { id: userId },
    })
    return checkInData.status !== CHECKIN_RESULT_STATUS.ALREADY_CHECKED
  } catch (error) {
    console.warn("获取签到状态失败:", error)
    return undefined // 其他错误也视为不支持
  }
}

export const fetchAccountData = async (
  baseUrl: string,
  userId: number,
  token: string,
  checkIn: CheckInConfig,
  authType?: AuthTypeEnum,
): Promise<AccountData> => {
  const params = { baseUrl, userId, token, authType, checkIn }
  const quotaPromise = fetchAccountQuota(baseUrl, userId, token, authType)
  const todayUsagePromise = fetchTodayUsage(params)
  const todayIncomePromise = fetchTodayIncome(params)
  const checkInPromise =
    checkIn?.enableDetection && !checkIn.customCheckInUrl
      ? fetchCheckInStatus(baseUrl, userId, token, authType)
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
      isCheckedInToday: !(canCheckIn ?? true),
    },
  }
}

export const refreshAccountData = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  checkIn: CheckInConfig,
  authType?: AuthTypeEnum,
): Promise<RefreshAccountResult> => {
  try {
    const data = await fetchAccountData(
      baseUrl,
      userId,
      accessToken,
      checkIn,
      authType,
    )
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    console.error("刷新账号数据失败:", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
