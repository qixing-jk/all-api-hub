/**
 * Redemption Service
 * Handles redemption code operations via API
 */

import { t } from "i18next"

import { accountStorage } from "~/services/accountStorage"
import type { ApiResponse } from "~/services/apiService/common/type"
import { AuthTypeEnum, type RedemptionResult } from "~/types"

import { fetchApi } from "./apiService/common/utils"

/**
 * Redeem a code for a specific account
 * @param accountId - The ID of the account to redeem for
 * @param code - The redemption code
 * @returns Result of the redemption operation
 */
export async function redeemCodeForAccount(
  accountId: string,
  code: string
): Promise<RedemptionResult> {
  try {
    // Get the account
    const account = await accountStorage.getAccountById(accountId)

    if (!account) {
      return {
        status: "error",
        message: t("redemptionAssist:errors.accountNotFound")
      }
    }

    // Validate account has necessary credentials
    if (
      account.authType === AuthTypeEnum.AccessToken &&
      !account.account_info.access_token
    ) {
      return {
        status: "error",
        message: t("redemptionAssist:errors.noAccessToken")
      }
    }

    // Call the redemption API
    const response = (await fetchApi<{ message?: string }>(
      {
        baseUrl: account.site_url,
        endpoint: "/api/user/topup",
        userId: account.account_info.id,
        token: account.account_info.access_token,
        authType: account.authType,
        options: {
          method: "POST",
          body: JSON.stringify({ key: code })
        }
      },
      false
    )) as ApiResponse<{ message?: string }>

    if (!response.success) {
      const errorMessage =
        response.message || t("redemptionAssist:errors.redeemFailed")

      return {
        status: "error",
        message: t("redemptionAssist:errors.redeemFailed"),
        siteError: errorMessage
      }
    }

    return {
      status: "success",
      message: t("redemptionAssist:messages.redeemSuccess", {
        siteName: account.site_name
      })
    }
  } catch (error) {
    console.error("[RedeemService] Error redeeming code:", error)

    const errorMessage =
      error instanceof Error
        ? error.message
        : t("redemptionAssist:errors.unknownError")

    return {
      status: "error",
      message: t("redemptionAssist:errors.redeemFailed"),
      siteError: errorMessage
    }
  }
}

/**
 * Check if a code matches the expected redemption code format
 * @param code - The code to check
 * @returns True if the code matches the expected format
 */
export function isPossibleRedemptionCode(code: string): boolean {
  if (!code || typeof code !== "string") {
    return false
  }

  // Match 32-character hexadecimal codes
  return /^[a-f0-9]{32}$/i.test(code.trim())
}
