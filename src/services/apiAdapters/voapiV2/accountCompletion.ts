import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { AccountCompletionCapability } from "~/services/apiAdapters/contracts/accountCompletion"
import { voApiV2AccountBootstrap } from "~/services/apiAdapters/voapiV2/accountBootstrap"
import { fetchVoApiV2UserInfo } from "~/services/apiService/voapiV2"
import { AuthTypeEnum } from "~/types"

export const voApiV2AccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request
    const accessToken = helpers.trimString(detected.accessToken)

    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("VoAPI v2 dashboard JWT missing"),
      )
    }

    const serviceRequest = helpers.createServiceRequest({
      baseUrl: url,
      context,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken,
        userId: detected.userId,
      },
    })
    let userInfo
    try {
      userInfo = await fetchVoApiV2UserInfo(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    const detectedUser = detected.user as Record<string, unknown> | undefined
    const userId = helpers.trimString(detected.userId) || String(userInfo.id)
    const username =
      helpers.trimString(detectedUser?.username) ||
      helpers.trimString(detectedUser?.display_name) ||
      helpers.trimString(detectedUser?.email) ||
      helpers.trimString(userInfo.username) ||
      helpers.trimString(userInfo.nickname) ||
      userId
    helpers.captureRecoveryData({
      username,
      accessToken,
      userId,
      authType: AuthTypeEnum.AccessToken,
    })

    const facts =
      await voApiV2AccountBootstrap.loadBootstrapFacts(serviceRequest)
    return {
      username,
      siteName: await helpers.fetchSiteName(facts),
      accessToken,
      userId,
      exchangeRate: facts.defaultExchangeRate ?? DEFAULT_USD_TO_CNY_RATE,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        supported: facts.checkInSupported === true,
      }),
    }
  },
}
