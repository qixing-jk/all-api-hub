import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { aimlApiAccountBootstrap } from "~/services/apiAdapters/aimlapi/accountBootstrap"
import type { AccountCompletionCapability } from "~/services/apiAdapters/contracts/accountCompletion"
import { AuthTypeEnum } from "~/types"

/**
 * Completes AI/ML API account detection.
 *
 * This completion capability verifies a supplied management key against
 * `GET /v1/key`. Explicit console-session credential acquisition belongs to
 * `aimlApiAccountOnboarding`; neither path saves the short-lived console JWT.
 */
export const aimlApiAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request

    const candidateToken =
      helpers.trimString(detected.accessToken) ||
      helpers.trimString(request.existingAccessToken)
    if (!candidateToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("aimlapi management key missing"),
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
      userInfo = await aimlApiAccountBootstrap.fetchUserInfo(serviceRequest)
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
    const userId = helpers.trimString(userInfo.id)
    helpers.captureRecoveryData({
      ...(username ? { username } : {}),
      ...(accessToken ? { accessToken } : {}),
      authType: AuthTypeEnum.AccessToken,
    })

    if (!username) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error("aimlapi account name missing"),
      )
    }
    if (!userId) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
        new Error("aimlapi account id missing"),
      )
    }

    const bootstrapFacts =
      await aimlApiAccountBootstrap.loadBootstrapFacts(serviceRequest)
    const exchangeRate =
      bootstrapFacts.defaultExchangeRate ?? DEFAULT_USD_TO_CNY_RATE
    helpers.captureRecoveryData({ exchangeRate })
    const siteName = await helpers.fetchSiteName(bootstrapFacts)
    helpers.captureRecoveryData({ siteName })

    return {
      username,
      siteName,
      accessToken,
      userId,
      exchangeRate,
      authType: AuthTypeEnum.AccessToken,
      // No check-in programme exists on this deployment.
      checkIn: helpers.createInitialCheckInConfig({ supported: false }),
    }
  },
}
