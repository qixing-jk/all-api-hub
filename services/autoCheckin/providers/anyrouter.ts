import { fetchApi } from "~/services/apiService/common/utils"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "~/services/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./index"

export type AnyrouterCheckInParams = {
  site_url: string
  account_info: {
    id: number
  }
}

/**
 * AnyRouter returns an empty message string when the user has already checked in.
 * This helper treats that case as already-checked, and falls back to the shared
 * detection heuristics for non-empty strings.
 * @param message - Message to evaluate.
 * @returns true if the user is already checked in.
 */
function isAnyrouterAlreadyCheckedMessage(message: string): boolean {
  const normalized = normalizeCheckinMessage(message).trim()
  if (!normalized) return true
  return isAlreadyCheckedMessage(normalized)
}

const checkinAnyRouter = async (
  account: SiteAccount | AnyrouterCheckInParams,
): Promise<AutoCheckinProviderResult> => {
  const { site_url, account_info } = account

  try {
    const response = await fetchApi<{
      code: number
      ret: number
      success: boolean
      message: string
    }>(
      {
        baseUrl: site_url,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: account_info.id,
        },
      },
      {
        endpoint: "/api/user/sign_in",
        options: {
          method: "POST",
          body: "{}",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        },
      },
      true,
    )

    const rawResponseMessage = normalizeCheckinMessage(response.message)
    const normalizedResponseMessage = rawResponseMessage.toLowerCase()

    if (!response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        rawMessage: rawResponseMessage || undefined,
        messageKey: rawResponseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
        data: response ?? undefined,
      }
    }

    if (
      normalizedResponseMessage.includes("success") ||
      normalizedResponseMessage.includes("签到成功")
    ) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: rawResponseMessage || undefined,
        messageKey: rawResponseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: response,
      }
    }

    if (isAnyrouterAlreadyCheckedMessage(rawResponseMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: rawResponseMessage || undefined,
        messageKey: rawResponseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: rawResponseMessage || undefined,
      messageKey: rawResponseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: response ?? undefined,
    }
  } catch (error: unknown) {
    return resolveProviderErrorResult({
      error,
      isAlreadyChecked: isAnyrouterAlreadyCheckedMessage,
    })
  }
}

const canCheckIn = (account: SiteAccount): boolean => {
  if (!account.checkIn?.enableDetection) {
    return false
  }

  if (!account.account_info?.id) {
    return false
  }

  return true
}

export const anyrouterProvider: AutoCheckinProvider = {
  canCheckIn,
  checkIn: checkinAnyRouter,
}
