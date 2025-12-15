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
  message: string
  data?: any
}

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
  account: SiteAccount,
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
        endpoint: "/api/user/sign_in",
        userId: account_info.id,
        authType: AuthTypeEnum.Cookie,
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

    const responseMessage =
      typeof response.message === "string" ? response.message.toLowerCase() : ""

    if (!response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        message: responseMessage || "Check-in failed",
        data: response ?? undefined,
      }
    }

    if (response.ret === 1 || response.code === 0 || response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        message: responseMessage || "Check-in successful",
        data: response,
      }
    }

    if (responseMessage.includes("success")) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        message: responseMessage || "Check-in successful",
      }
    }

    if (isAlreadyChecked(responseMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        message: responseMessage || "Already checked in today",
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      message: responseMessage || "Check-in failed",
      data: response ?? undefined,
    }
  } catch (error: any) {
    const errorMessage = error?.message || String(error)

    if (errorMessage && isAlreadyChecked(errorMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        message: errorMessage,
      }
    }

    if (error?.statusCode === 404 || errorMessage.includes("404")) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        message: "Check-in endpoint not supported",
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      message: errorMessage || "Unknown error occurred",
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
