/**
 * Veloera auto check-in provider.
 *
 * Endpoint: POST `/api/user/check_in`.
 */

import { fetchApi } from "~/services/apiService/common/utils"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./index"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "./shared"
import type { AutoCheckinProviderResult } from "./types"

export type CheckinResult = AutoCheckinProviderResult

const ENDPOINT = "/api/user/check_in"

/**
 * Perform check-in for a Veloera account
 * @param account - The site account to check in
 * @returns Check-in result with status and message
 */
async function checkinVeloera(account: SiteAccount): Promise<CheckinResult> {
  const { site_url, account_info, authType } = account

  try {
    // Call the check-in API endpoint
    const response = await fetchApi<any>(
      {
        baseUrl: site_url,
        auth: {
          authType: authType || AuthTypeEnum.AccessToken,
          userId: account_info.id,
          accessToken: account_info.access_token,
        },
      },
      {
        endpoint: ENDPOINT,
        options: { method: "POST" },
      },
    )

    const responseMessage = normalizeCheckinMessage(response?.message)

    // Check if response.message indicates already checked in
    if (responseMessage && isAlreadyCheckedMessage(responseMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        data: response.data ?? undefined,
      }
    }

    // Success case
    if (response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: response.data,
      }
    }

    // Other failure cases
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: response ?? undefined,
    }
  } catch (error: any) {
    return resolveProviderErrorResult({ error })
  }
}

/**
 * Check if an account can be checked in
 * @param account - The site account to check
 * @returns true if account meets check-in requirements
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
    return Boolean(account.account_info?.access_token)
  }

  return true
}

export const veloeraProvider: AutoCheckinProvider = {
  canCheckIn,
  checkIn: checkinVeloera,
}
