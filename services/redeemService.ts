import { t } from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accountStorage"
import { getApiService } from "~/services/apiService"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"

export interface RedeemResult {
  success: boolean
  message: string
  creditedAmount?: number
  account?: DisplaySiteData
}

/**
 * Encapsulates redemption flows that convert codes into account credits while
 * handling storage lookups, API invocation, and success/error localization.
 */
export class RedeemService {
  /**
   * Redeems a code for the specified account, returning localized results with
   * credited amount and display-ready account info when successful.
   * @param accountId - Identifier of the account to credit.
   * @param code - Redemption code provided by the user.
   * @returns Outcome describing success, message, and optional metadata.
   */
  async redeemCodeForAccount(
    accountId: string,
    code: string,
  ): Promise<RedeemResult> {
    try {
      const account = await accountStorage.getAccountById(accountId)
      if (!account) {
        return {
          success: false,
          message: t("messages:storage.accountNotFound", { id: accountId }),
        }
      }

      const creditedAmount = await getApiService(account.site_type).redeemCode(
        {
          baseUrl: account.site_url,
          accountId,
          auth: {
            authType: account.authType,
            userId: account.account_info.id,
            accessToken: account.account_info.access_token,
          },
        },
        code,
      )

      const displayAccount =
        (accountStorage.convertToDisplayData(account) as DisplaySiteData) ||
        undefined

      const amountStr =
        typeof creditedAmount === "number"
          ? (
              creditedAmount / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
            ).toFixed(2)
          : ""

      const message = t("redemptionAssist:messages.redeemSuccess", {
        defaultValue: "兑换成功，到账额度：{{amount}}",
        amount: amountStr,
      })

      return {
        success: true,
        message,
        creditedAmount,
        account: displayAccount,
      }
    } catch (error) {
      const message =
        (error as any)?.message ||
        getErrorMessage(error) ||
        t("redemptionAssist:messages.redeemFailed", {
          defaultValue: "兑换失败，请稍后重试",
        })

      return {
        success: false,
        message,
      }
    }
  }
}

export const redeemService = new RedeemService()
