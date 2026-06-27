import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accounts/accountStorage"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { formatMoneyFixed } from "~/utils/core/money"
import { t } from "~/utils/i18n/core"

interface RedeemResult {
  success: boolean
  message: string
  creditedAmount?: unknown
  account?: DisplaySiteData
}

/**
 * Encapsulates redemption flows that convert codes into account credits while
 * handling storage lookups, API invocation, and success/error localization.
 */
class RedeemService {
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
      if (account.disabled === true) {
        return {
          success: false,
          message: t("messages:storage.accountDisabled", { id: accountId }),
        }
      }

      const redemption = getSiteAdapter(account.site_type).redemption
      if (!redemption) {
        return {
          success: false,
          message: t("redemptionAssist:messages.redeemFailed"),
        }
      }

      const creditedAmount = await redemption.redeem({
        request: createAccountApiRequestFromStoredAccount(account).request,
        code,
      })

      const displayAccount =
        (await accountStorage.getDisplayDataById(accountId)) ??
        accountStorage.convertToDisplayData(account)

      const amountStr =
        typeof creditedAmount === "number"
          ? formatMoneyFixed(
              creditedAmount / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
            )
          : ""

      const message = t("redemptionAssist:messages.redeemSuccess", {
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
        t("redemptionAssist:messages.redeemFailed")

      return {
        success: false,
        message,
      }
    }
  }
}

export const redeemService = new RedeemService()
