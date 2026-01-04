/**
 * WONG公益站 API overrides.
 *
 * This module plugs into `services/apiService/index.ts` as a site override.
 * It provides WONG-specific implementations for:
 * - Check-in support and daily check-in status (GET `/api/user/checkin`).
 * - Account refresh composition while preserving common quota/usage calls.
 */
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
import { fetchApi } from "~/services/apiService/common/utils"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"

/**
 * Payload under `data` returned by WONG `/api/user/checkin`.
 *
 * Example (GET status, already checked in today):
 * ```json
 * {
 *   "success": true,
 *   "message": "",
 *   "data": {
 *     "enabled": true,
 *     "checked_in": true,
 *     "checked_at": 1734393600,
 *     "quota": 250000,
 *     "min_quota": 0,
 *     "max_quota": 500000
 *   }
 * }
 * ```
 */
export type WongCheckinStatusData = {
  checked_at: number
  checked_in: boolean
  enabled: boolean
  max_quota: number
  min_quota: number
  quota: number
}

/**
 * Response envelope returned by WONG `/api/user/checkin`.
 *
 * Example (POST check-in success):
 * ```json
 * {
 *   "success": true,
 *   "message": "",
 *   "data": {
 *     "enabled": true,
 *     "checked_in": true,
 *     "checked_at": 1734393600,
 *     "quota": 250000,
 *     "min_quota": 0,
 *     "max_quota": 500000
 *   }
 * }
 * ```
 *
 * Example (already checked today):
 * ```json
 * {
 *   "success": false,
 *   "message": "今天已经签到过啦"
 * }
 * ```
 *
 */
export type WongCheckinApiResponse = {
  success: boolean
  message: string
  data?: WongCheckinStatusData
}

/**
 * WONG daily check-in endpoint.
 *
 * - GET: fetch current day's check-in status.
 * - POST: perform check-in.
 */
const ENDPOINT = "/api/user/checkin"

/**
 * Whether the current site supports check-in.
 * @returns `true` or `false` when check-in is supported, `undefined` when not supported,
 * @param baseUrl base URL of the WONG site
 * @param userId user ID
 * @param accessToken access token
 * @param authType authentication type (optional, defaults to AccessToken)
 */
export async function fetchSupportCheckIn(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const siteStatus = await fetchCheckInStatus(request)
  return siteStatus !== undefined
}

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
 * Fetch today's check-in status for WONG account.
 * @returns
 * - `true` when the user can check in today (not yet checked in).
 * - `false` when the user has already checked in today.
 * - `undefined` when the status is unknown or check-in is not supported.
 * @param baseUrl base URL of the WONG site
 * @param userId user ID
 * @param accessToken access token
 * @param authType authentication type (optional, defaults to AccessToken)
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
    const response = (await fetchApi<WongCheckinApiResponse>(
      normalizedRequest,
      {
        endpoint: ENDPOINT,
        options: {
          method: "GET",
          cache: "no-store",
        },
      },
      true,
    )) as WongCheckinApiResponse

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
    console.warn("[WONG] Failed to fetch check-in status:", error)
    return undefined
  }
}

/**
 * Fetch WONG account data by composing common quota/usage/income calls and
 * optionally probing daily check-in status.
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
 * Refresh account data for WONG and return a normalized `RefreshAccountResult`.
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
    console.error("[WONG] Failed to refresh account data:", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
