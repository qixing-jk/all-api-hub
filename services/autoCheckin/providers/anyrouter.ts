import { fetchApi } from "~/services/apiService/common/utils"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./index"

type CheckinResult = {
  status: CheckinResultStatus
  messageKey?: string
  messageParams?: Record<string, any>
  rawMessage?: string
  data?: any
}

export type AnyrouterCheckInParams = {
  site_url: string
  account_info: {
    id: number
  }
}

/**
 * Check if the message indicates already checked in
 * Actual returned data:
 *  - when check in success: {"message":"签到成功，获得 $25 额度","success":true}
 *  - when already checked: {"message":"","success":true}
 * @param message - The message to check
 * @returns true if already checked in
 */
const isAlreadyChecked = (message: string): boolean => {
  const normalized = message.toLowerCase()
  return (
    normalized === "" ||
    normalized.includes("已签到") ||
    normalized.includes("already checked") ||
    normalized.includes("already signed")
  )
}

const checkinAnyRouter = async (
  account: SiteAccount | AnyrouterCheckInParams,
): Promise<CheckinResult> => {
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

    const rawResponseMessage =
      typeof response.message === "string" ? response.message : ""
    const normalizedResponseMessage = rawResponseMessage.toLowerCase()

    if (!response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        rawMessage: rawResponseMessage || undefined,
        messageKey: rawResponseMessage
          ? undefined
          : "autoCheckin:providerFallback.checkinFailed",
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
          : "autoCheckin:providerFallback.checkinSuccessful",
        data: response,
      }
    }

    if (isAlreadyChecked(normalizedResponseMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: rawResponseMessage || undefined,
        messageKey: rawResponseMessage
          ? undefined
          : "autoCheckin:providerFallback.alreadyCheckedToday",
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: rawResponseMessage || undefined,
      messageKey: rawResponseMessage
        ? undefined
        : "autoCheckin:providerFallback.checkinFailed",
      data: response ?? undefined,
    }
  } catch (error: any) {
    const errorMessage = error?.message || String(error)

    if (errorMessage && isAlreadyChecked(errorMessage)) {
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
