import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { NOVITA_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountCompletionCapability } from "~/services/apiAdapters/contracts/accountCompletion"
import { verifyNovitaCredentials } from "~/services/apiService/novita"
import { AuthTypeEnum } from "~/types"

export const novitaAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const candidateToken =
      helpers.trimString(request.detected.accessToken) ||
      helpers.trimString(request.existingAccessToken)
    if (!candidateToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("novita api key missing"),
      )
    }

    const serviceRequest = helpers.createServiceRequest({
      baseUrl: request.url,
      context: request.context,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: candidateToken,
      },
    })

    let userInfo
    try {
      userInfo = await verifyNovitaCredentials(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    const userId = helpers.trimString(userInfo.id)
    const username = helpers.trimString(userInfo.username)
    if (!userId) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
        new Error("novita user identity missing"),
      )
    }
    helpers.captureRecoveryData({
      userId,
      ...(username ? { username } : {}),
      accessToken: candidateToken,
      authType: AuthTypeEnum.AccessToken,
    })

    helpers.captureRecoveryData({
      siteName: NOVITA_DISPLAY_NAME,
      exchangeRate: DEFAULT_USD_TO_CNY_RATE,
    })

    return {
      userId,
      username: username || userId,
      accessToken: candidateToken,
      siteName: NOVITA_DISPLAY_NAME,
      // Novita prices USD credit; no site-specific CNY anchor is published.
      exchangeRate: DEFAULT_USD_TO_CNY_RATE,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({ supported: false }),
    }
  },
}
