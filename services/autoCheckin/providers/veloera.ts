/**
 * Veloera Check-in Provider
 * Handles check-in operations for Veloera sites
 */

import { fetchApi } from "~/services/apiService/common/utils"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS, CheckinResultStatus } from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./index"

export interface CheckinResult {
  status: CheckinResultStatus
  messageKey?: string
  messageParams?: Record<string, any>
  rawMessage?: string
  data?: any
}

/**
 * Check if the message indicates already checked in
 * @param message - The message to check
 * @returns true if already checked in
 */
const isAlreadyChecked = (message: string): boolean => {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("已签到") ||
    normalized.includes("已经签到") ||
    normalized.includes("already checked")
  )
}

/**
 * Perform check-in for a Veloera account
 * @param account - The site account to check in
 * @returns Check-in result with status and message
 */
async function checkinVeloera(account: SiteAccount): Promise<CheckinResult> {
  const { site_url, account_info, authType } = account

  try {
    // Call the check-in API endpoint
    const response = (await fetchApi<{
      success: boolean
      message?: string
      data?: any
    }>({
      baseUrl: site_url,
      endpoint: "/api/user/check_in",
      userId: account_info.id,
      token: account_info.access_token,
      authType: authType || AuthTypeEnum.AccessToken,
      options: { method: "POST" },
    })) as { success: boolean; message?: string; data?: any }

    const responseMessage =
      typeof response.message === "string" ? response.message : ""
    const normalizedMessage = responseMessage.toLowerCase()

    // Check if response.message indicates already checked in
    if (isAlreadyChecked(normalizedMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : "autoCheckin:providerFallback.alreadyCheckedToday",
      }
    }

    // Success case
    if (response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : "autoCheckin:providerFallback.checkinSuccessful",
        data: response.data,
      }
    }

    // Other failure cases
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : "autoCheckin:providerFallback.checkinFailed",
    }
  } catch (error: any) {
    // Handle specific error cases
    const errorMessage = error?.message || String(error)
    const normalizedErrorMessage = errorMessage.toLowerCase()

    // Check if already checked in based on error message
    if (isAlreadyChecked(normalizedErrorMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: errorMessage,
      }
    }

    // Handle 404 or endpoint not found
    if (error?.statusCode === 404 || errorMessage.includes("404")) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      }
    }

    // General failure
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
 * Check if an account can be checked in
 * @param account - The site account to check
 * @returns true if account meets check-in requirements
 */
function canCheckIn(account: SiteAccount): boolean {
  // Must have enableDetection enabled
  if (!account.checkIn?.enableDetection) {
    return false
  }

  // Must have valid credentials
  if (!account.account_info?.access_token || !account.account_info?.id) {
    return false
  }

  // Veloera sites should have site_type set (but we'll be lenient)
  // For now, we'll allow any account that meets the above criteria
  return true
}

export const veloeraProvider: AutoCheckinProvider = {
  canCheckIn,
  checkIn: checkinVeloera,
}
