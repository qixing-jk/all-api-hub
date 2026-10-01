import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import {
  readKimiAuthState,
  withKimiOpenPlatformAuth,
} from "~/services/apiService/kimiOpenPlatform/transport"
import {
  getKimiOpenPlatformAuthConfig,
  normalizeKimiOpenPlatformAuth,
} from "~/services/kimiOpenPlatform/auth"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"
import { kimiOpenPlatformAccountBootstrap } from "./accountBootstrap"

/**
 * Verifies the console JWT and keeps the refresh token with the account.
 * The access token is not an API key; API keys are created later and shown once.
 */
export const kimiOpenPlatformAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const detectedAuth = normalizeKimiOpenPlatformAuth(
      request.detected.kimiOpenPlatformAuth,
    )
    const accessToken =
      helpers.trimString(request.detected.accessToken) ||
      helpers.trimString(request.existingAccessToken)
    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("kimi access token missing"),
      )
    }

    const initialAuthState = {
      accessToken,
      refreshToken: detectedAuth?.refreshToken ?? "",
      organizationId: detectedAuth?.organizationId ?? "",
      ...(detectedAuth?.tokenExpiresAt !== undefined
        ? { tokenExpiresAt: detectedAuth.tokenExpiresAt }
        : {}),
    }
    const serviceRequest = withKimiOpenPlatformAuth(
      helpers.createServiceRequest({
        baseUrl: request.url,
        context: request.context,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken,
          ...(detectedAuth ? { refreshToken: detectedAuth.refreshToken } : {}),
        },
      }),
      initialAuthState,
    )
    // Transport rotates its attached session during verification.
    const authState = readKimiAuthState(serviceRequest) ?? initialAuthState
    const authFields = () => {
      return authState.refreshToken && authState.organizationId
        ? { kimiOpenPlatformAuth: getKimiOpenPlatformAuthConfig(authState) }
        : {}
    }

    const initialUserId = helpers.trimString(request.detected.userId)
    helpers.captureRecoveryData({
      ...(initialUserId ? { userId: initialUserId } : {}),
      accessToken: authState.accessToken,
      authType: AuthTypeEnum.AccessToken,
      exchangeRate: DEFAULT_USD_TO_CNY_RATE,
      ...authFields(),
    })

    let userInfo
    try {
      userInfo =
        await kimiOpenPlatformAccountBootstrap.fetchUserInfo(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    const username = helpers.trimString(userInfo.username)
    const userId = helpers.trimString(userInfo.id)
    const organizationId = helpers.trimString(
      (userInfo as { organizationId?: string }).organizationId,
    )
    if (organizationId) authState.organizationId = organizationId
    helpers.captureRecoveryData({
      ...(username ? { username } : {}),
      accessToken: authState.accessToken,
      authType: AuthTypeEnum.AccessToken,
      exchangeRate: DEFAULT_USD_TO_CNY_RATE,
      ...authFields(),
    })
    if (!userId) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
        new Error("kimi user id missing"),
      )
    }

    let bootstrapFacts = null
    try {
      bootstrapFacts =
        await kimiOpenPlatformAccountBootstrap.loadBootstrapFacts(
          serviceRequest,
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
      username: username || userId,
      siteName,
      accessToken: authState.accessToken,
      userId,
      exchangeRate,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({ supported: false }),
      ...authFields(),
    }
  },
}
