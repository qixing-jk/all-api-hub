import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
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

    let bootstrapFacts = null
    try {
      bootstrapFacts = await sub2ApiAccountBootstrap.loadBootstrapFacts(
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
      bootstrapFacts?.defaultExchangeRate ?? DEFAULT_USD_TO_CNY_RATE
    helpers.captureRecoveryData({ exchangeRate })
    const siteName = await helpers.fetchSiteName(bootstrapFacts)
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
