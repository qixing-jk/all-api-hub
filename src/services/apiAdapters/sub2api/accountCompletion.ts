import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

export const sub2ApiAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const service = getApiService(SITE_TYPES.SUB2API)
    const { url, detected, context } = request

    let siteStatus = null
    try {
      siteStatus = await service.fetchSiteStatus(
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

    const accessToken = helpers.trimString(detected.accessToken)
    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("access token missing"),
      )
    }

    return {
      username: helpers.trimString(detected.user?.username),
      siteName: await helpers.fetchSiteName(siteStatus),
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate:
        service.extractDefaultExchangeRate(siteStatus) ??
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
