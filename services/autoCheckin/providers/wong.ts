/**
 * WONG公益站 auto check-in provider.
 *
 * Responsibilities:
 * - Perform daily check-in directly via POST `/api/user/checkin`.
 * - Interpret backend variations (success flags, `checked_in`, and message strings)
 *   to map the result into the project-wide `CheckinResultStatus` shape.
 * - Normalize backend variations (success flags, `checked_in`, and message strings)
 *   into the project-wide `CheckinResultStatus` shape.
 */
import { fetchApi } from "~/services/apiService/common/utils"
import type {
  WongCheckinApiResponse,
  WongCheckinStatusData,
} from "~/services/apiService/wong"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./index"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "./shared"
import type { AutoCheckinProviderResult } from "./types"

/**
 * WONG daily check-in endpoint.
 *
 * - GET: fetch current day's check-in status.
 * - POST: perform check-in.
 */
const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT

/**
 * Call POST /api/user/checkin to perform the daily check-in.
 */
async function performCheckin(
  account: SiteAccount,
): Promise<WongCheckinApiResponse> {
  const { site_url, account_info, authType } = account

  return await fetchApi<WongCheckinStatusData | undefined>(
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
    false,
  )
}

/**
 * Provider entry: execute check-in directly and normalize the response.
 */
async function checkinWongGongyi(
  account: SiteAccount,
): Promise<AutoCheckinProviderResult> {
  try {
    const checkinResponse = await performCheckin(account)
    const responseMessage = normalizeCheckinMessage(checkinResponse.message)

    if (checkinResponse.data?.enabled === false) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: "autoCheckin:providerWong.checkinDisabled",
        rawMessage: responseMessage || undefined,
        data: checkinResponse.data,
      }
    }

    if (
      (responseMessage && isAlreadyCheckedMessage(responseMessage)) ||
      checkinResponse.data?.checked_in === true
    ) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        data: checkinResponse.data,
      }
    }

    if (checkinResponse.success) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: checkinResponse.data,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: checkinResponse ?? undefined,
    }
  } catch (error: any) {
    return resolveProviderErrorResult({ error })
  }
}

/**
 * Determine whether this account has the required configuration for WONG check-in.
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
 * Exported provider implementation for `site_type = wong-gongyi`.
 */
export const wongGongyiProvider: AutoCheckinProvider = {
  canCheckIn,
  checkIn: checkinWongGongyi,
}
