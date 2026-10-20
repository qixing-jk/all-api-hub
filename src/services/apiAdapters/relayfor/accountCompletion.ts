import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { AccountCompletionCapability } from "~/services/apiAdapters/contracts/accountCompletion"
import { relayForAccountBootstrap } from "~/services/apiAdapters/relayfor/accountBootstrap"
import { AuthTypeEnum } from "~/types"

export const relayForAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request

    const candidateToken =
      helpers.trimString(detected.accessToken) ||
      helpers.trimString(request.existingAccessToken)
    if (!candidateToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("relayfor access token missing"),
      )
    }

    const serviceRequest = helpers.createServiceRequest({
      baseUrl: url,
      context,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: candidateToken,
      },
    })

    let userInfo
    try {
      userInfo = await relayForAccountBootstrap.fetchUserInfo(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    const username = helpers.trimString(
      userInfo.username || detected.user?.username,
    )
    const accessToken = helpers.trimString(userInfo.access_token)
    helpers.captureRecoveryData({
      ...(username ? { username } : {}),
      ...(accessToken ? { accessToken } : {}),
      authType: AuthTypeEnum.AccessToken,
    })

    if (!username) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error("relayfor username missing"),
      )
    }
    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("relayfor account token missing"),
      )
    }

    let bootstrapFacts = null
    try {
      bootstrapFacts =
        await relayForAccountBootstrap.loadBootstrapFacts(serviceRequest)
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

    const checkSupport = await relayForAccountBootstrap
      .fetchCheckInSupport(serviceRequest, bootstrapFacts ?? {})
      .catch(helpers.handleCheckInSupportFetchFailure)

    return {
      username,
      siteName,
      accessToken,
      userId: String(userInfo.id),
      exchangeRate,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        supported: Boolean(checkSupport),
      }),
    }
  },
}
