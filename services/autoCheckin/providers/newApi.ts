import { NewApiCheckinResponse } from "~/services/apiService/common/type"
import { fetchApi } from "~/services/apiService/common/utils"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./index"

/**
 * Provider result that the scheduler/UI understands.
 *
 * - `messageKey` should be an i18n key (e.g. `autoCheckin:providerFallback.*`).
 * - `rawMessage` is kept when the backend returns a human readable message.
 */
export interface CheckinResult {
  status: CheckinResultStatus
  messageKey?: string
  messageParams?: Record<string, any>
  rawMessage?: string
  data?: any
}

/**
 * daily check-in endpoint.
 *
 * - GET: fetch current day's check-in status.
 * - POST: perform check-in.
 */
const ENDPOINT = "/api/user/checkin"

/**
 * Normalize unknown message payloads to a string.
 */
function normalizeMessage(message: unknown): string {
  return typeof message === "string" ? message : ""
}

/**
 * Determine whether a message indicates the user has already checked in today.
 */
function isAlreadyCheckedMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("今天已经签到") ||
    normalized.includes("已签到") ||
    normalized.includes("already")
  )
}

/**
 * Call POST /api/user/checkin to perform the daily check-in.
 */
async function performCheckin(
  account: SiteAccount,
): Promise<NewApiCheckinResponse> {
  const { site_url, account_info, authType } = account

  return await fetchApi<NewApiCheckinResponse>(
    {
      baseUrl: site_url,
      auth: {
        authType: authType ?? AuthTypeEnum.AccessToken,
        userId: account_info.id,
        accessToken: account_info.access_token,
      },
    },
    {
      endpoint: ENDPOINT,
      options: {
        method: "POST",
        body: "{}",
      },
    },
    true,
  )
}

/**
 * Provider entry: execute check-in directly and normalize the response.
 */
async function checkinnewApi(account: SiteAccount): Promise<CheckinResult> {
  try {
    const checkinResponse = await performCheckin(account)
    const responseMessage = normalizeMessage(checkinResponse.message)

    // Already checked-in today
    if (
      responseMessage &&
      isAlreadyCheckedMessage(responseMessage) &&
      !checkinResponse.success
    ) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : "autoCheckin:providerFallback.alreadyCheckedToday",
        data: checkinResponse.data,
      }
    }

    // Successful check-in
    if (checkinResponse.success && checkinResponse.data) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : "autoCheckin:providerFallback.checkinSuccessful",
        data: checkinResponse.data,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : "autoCheckin:providerFallback.checkinFailed",
      data: checkinResponse ?? undefined,
    }
  } catch (error: any) {
    const errorMessage = error?.message || String(error)

    if (errorMessage && isAlreadyCheckedMessage(errorMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: errorMessage,
      }
    }

    if (error?.statusCode === 404 || errorMessage.includes("404")) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: errorMessage || undefined,
      messageKey: errorMessage
        ? undefined
        : "autoCheckin:providerFallback.unknownError",
    }
  }
}

/**
 * Determine whether this account has the required configuration for check-in.
 */
function canCheckIn(account: SiteAccount): boolean {
  if (!account.checkIn?.enableDetection) {
    return false
  }

  if (!account.account_info?.id) {
    return false
  }

  const authType = account.authType || AuthTypeEnum.AccessToken

  if (authType === AuthTypeEnum.AccessToken) {
    return !!account.account_info?.access_token
  }

  return true
}

/**
 * Exported provider implementation for `site_type = new-api`.
 */
export const newApiProvider: AutoCheckinProvider = {
  canCheckIn,
  checkIn: checkinnewApi,
}
