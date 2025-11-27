import { t } from "i18next"

import { accountStorage } from "~/services/accountStorage"
import { redeemCode } from "~/services/apiService"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"

export interface RedeemResult {
  success: boolean
  message: string
  creditedAmount?: number
  account?: DisplaySiteData
}

export class RedeemService {
  async redeemCodeForAccount(
    accountId: string,
    code: string
  ): Promise<RedeemResult> {
    try {
      const account = await accountStorage.getAccountById(accountId)
      if (!account) {
        return {
          success: false,
          message: t("messages:storage.accountNotFound", { id: accountId })
        }
      }

      const creditedAmount = await redeemCode(
        account.site_url,
        account.account_info.id,
        account.account_info.access_token,
        code,
        account.authType
      )

      const displayAccount =
        (accountStorage.convertToDisplayData(account) as DisplaySiteData) ||
        undefined

      const amountStr =
        typeof creditedAmount === "number"
          ? (creditedAmount / 100000).toFixed(2)
          : ""

      const message = t("redemptionAssist:messages.redeemSuccess", {
        defaultValue: "兑换成功，到账额度：{{amount}}",
        amount: amountStr
      })

      return {
        success: true,
        message,
        creditedAmount,
        account: displayAccount
      }
    } catch (error) {
      const message =
        (error as any)?.message ||
        getErrorMessage(error) ||
        t("redemptionAssist:messages.redeemFailed", {
          defaultValue: "兑换失败，请稍后重试"
        })

      return {
        success: false,
        message
      }
    }
  }
}

export const redeemService = new RedeemService()
