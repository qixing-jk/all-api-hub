import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { UI_CONSTANTS } from "~/constants/ui"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"
import { sub2ApiAccountBootstrap } from "./accountBootstrap"

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

    return {
      username: helpers.trimString(detected.user?.username),
      siteName: await helpers.fetchSiteName(siteStatus),
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate:
        sub2ApiAccountBootstrap.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: false,
        autoCheckInEnabled: false,
      }),
      ...(detected.sub2apiAuth ? { sub2apiAuth: detected.sub2apiAuth } : {}),
    }
  },
}
