/**
 * Veloera Check-in Provider
 * Handles check-in operations for Veloera sites
 */

import { fetchApi } from "~/services/apiService/common/utils"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import type { CheckinResultStatus } from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./index"

export interface CheckinResult {
  status: CheckinResultStatus
  message: string
  data?: any
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
      options: { method: "POST" }
    })) as { success: boolean; message?: string; data?: any }

    const responseMessage =
      typeof response.message === "string" ? response.message : ""

    // Check if response.message indicates already checked in
    if (responseMessage.includes("已签到")) {
      return {
        status: "already_checked",
        message: responseMessage || "Already checked in today"
      }
    }

    // Success case
    if (response.success) {
      return {
        status: "success",
        message: responseMessage || "Check-in successful",
        data: response.data
      }
    }

    // Other failure cases
    return {
      status: "failed",
      message: responseMessage || "Check-in failed"
    }
  } catch (error: any) {
    // Handle specific error cases
    const errorMessage = error?.message || String(error)

    // Check if already checked in based on error message
    if (
      errorMessage.includes("已签到") ||
      errorMessage.includes("already checked in")
    ) {
      return {
        status: "already_checked",
        message: errorMessage
      }
    }

    // Handle 404 or endpoint not found
    if (error?.statusCode === 404 || errorMessage.includes("404")) {
      return {
        status: "failed",
        message: "Check-in endpoint not supported"
      }
    }

    // General failure
    return {
      status: "failed",
      message: errorMessage || "Unknown error occurred"
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
  checkIn: checkinVeloera
}
