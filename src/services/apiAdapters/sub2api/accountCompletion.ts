import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { UI_CONSTANTS } from "~/constants/ui"
import { sub2ApiAccountBootstrap } from "~/services/apiAdapters/sub2api/accountBootstrap"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

export const sub2ApiAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request

    const accessToken = helpers.trimString(detected.accessToken)
    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("access token missing"),
      )
    }

    let siteStatus = null
    try {
      siteStatus = await sub2ApiAccountBootstrap.fetchSiteStatus(
        helpers.createServiceRequest({
          baseUrl: url,
          context,
          auth: {
            authType: AuthTypeEnum.AccessToken,
          },
        }),
      )
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    const exchangeRate =
      sub2ApiAccountBootstrap.extractDefaultExchangeRate(siteStatus) ??
      UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
    helpers.captureRecoveryData({ exchangeRate })
    const siteName = await helpers.fetchSiteName(siteStatus)
    helpers.captureRecoveryData({ siteName })

    return {
      username: helpers.trimString(detected.user?.username),
      siteName,
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        supported: false,
      }),
      ...(detected.sub2apiAuth ? { sub2apiAuth: detected.sub2apiAuth } : {}),
    }
  },
}
