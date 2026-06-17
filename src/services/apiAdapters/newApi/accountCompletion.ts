import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

export const newApiAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, requestedAuthType, detected, context } = request
    const apiService = getApiService(detected.siteType)

    const createRequest = (
      auth: Parameters<typeof helpers.createServiceRequest>[0]["auth"],
    ) =>
      helpers.createServiceRequest({
        baseUrl: url,
        auth,
        context,
      })

    const fetchTokenInfo = () => {
      if (requestedAuthType === AuthTypeEnum.Cookie) {
        return apiService.fetchUserInfo(
          createRequest({
            authType: AuthTypeEnum.Cookie,
            userId: detected.userId,
          }),
        )
      }

      if (requestedAuthType === AuthTypeEnum.AccessToken) {
        return apiService.getOrCreateAccessToken(
          createRequest({
            authType: AuthTypeEnum.Cookie,
            userId: detected.userId,
          }),
        )
      }

      return Promise.resolve(null)
    }

    const tokenPromise = fetchTokenInfo()

    const siteStatusPromise = apiService
      .fetchSiteStatus(
        createRequest({
          authType: requestedAuthType || AuthTypeEnum.None,
        }),
      )
      .catch((error) => {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
          error,
        )
      })

    const checkSupportPromise = siteStatusPromise.then((siteStatus) =>
      typeof siteStatus?.checkin_enabled === "boolean"
        ? siteStatus.checkin_enabled
        : apiService
            .fetchSupportCheckIn(
              createRequest({
                authType: AuthTypeEnum.None,
              }),
            )
            .catch(helpers.handleCheckInSupportFetchFailure),
    )

    const [tokenInfo, siteStatus, checkSupport, siteName] = await Promise.all([
      tokenPromise.catch((error) => {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          error,
        )
      }),
      siteStatusPromise,
      checkSupportPromise,
      siteStatusPromise.then(helpers.fetchSiteName),
    ])

    const tokenData =
      tokenInfo && typeof tokenInfo === "object"
        ? (tokenInfo as { username?: unknown; access_token?: unknown })
        : {}
    const username = helpers.trimString(tokenData.username)
    const accessToken = helpers.trimString(tokenData.access_token)

    if (requestedAuthType === AuthTypeEnum.AccessToken && !accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("Access token is missing"),
      )
    }

    if (!username) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error("Username is missing"),
      )
    }

    return {
      username,
      siteName,
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate:
        apiService.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: requestedAuthType,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: checkSupport ?? false,
        autoCheckInEnabled: true,
      }),
    }
  },
}
