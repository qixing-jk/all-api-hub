import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import type { ConfirmedAward } from "~/services/amounts/awards"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import {
  acceptsRedemptionCode,
  resolveAutomaticRedemptionAvailability,
} from "~/services/redemption/accountSupport"
import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  REDEMPTION_RESULT_CODES,
} from "~/services/redemption/contracts"
import { RedemptionOutcomeUncertainError } from "~/services/redemption/errors"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { formatAssetAmount, getAssetLabel } from "~/utils/core/money"
import { t } from "~/utils/i18n/core"

export { REDEMPTION_RESULT_CODES } from "./contracts"

interface RedeemResult {
  success: boolean
  message: string
  code?: (typeof REDEMPTION_RESULT_CODES)[keyof typeof REDEMPTION_RESULT_CODES]
  awards?: ConfirmedAward[]
  account?: DisplaySiteData
  retryable?: boolean
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
      const account = await accountQueries.getAccountById(accountId)
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

      const redemptionAvailability = resolveAutomaticRedemptionAvailability({
        siteType: account.site_type,
      })
      if (
        redemptionAvailability.status ===
        REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported
      ) {
        return {
          success: false,
          code: REDEMPTION_RESULT_CODES.UnsupportedSiteType,
          message: t("redemptionAssist:messages.unsupportedSiteType"),
        }
      }

      if (!acceptsRedemptionCode({ siteType: account.site_type }, code)) {
        return {
          success: false,
          code: REDEMPTION_RESULT_CODES.IncompatibleCodeKind,
          message: t("redemptionAssist:messages.incompatibleCodeKind"),
        }
      }

      const redemption = await redemptionAvailability.capability.redeem({
        request: createAccountApiRequestFromStoredAccount(account).request,
        code,
      })

      const displayAccount =
        (await accountReadModels
          .getDisplayDataById(accountId)
          .catch(() => undefined)) ??
        accountPresentation.convertToDisplayData(account)

      const amountStr = redemption.awards
        .map(({ asset, amount }) => {
          if (isKnownOrStaleObservation(amount))
            return asset.kind === ASSET_KINDS.Unknown
              ? `${amount.value} ${t("common:labels.unknown")}`
              : formatAssetAmount({ asset, value: amount.value })
          const unit = getAssetLabel(asset)
          return [t("common:labels.unknown"), unit].filter(Boolean).join(" ")
        })
        .join(" + ")

      const message = redemption.message
        ? redemption.message
        : t("redemptionAssist:messages.redeemSuccess", {
            amount: amountStr,
          })

      return {
        success: true,
        message,
        awards: redemption.awards,
        account: displayAccount,
      }
    } catch (error) {
      const message =
        getErrorMessage(error) || t("redemptionAssist:messages.redeemFailed")

      return {
        success: false,
        message,
        ...(error instanceof RedemptionOutcomeUncertainError
          ? { retryable: false, code: REDEMPTION_RESULT_CODES.OutcomeUncertain }
          : {}),
      }
    }
  }
}

export const redeemService = new RedeemService()
