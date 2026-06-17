import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

const getDetectedTokenInfo = (
  detected: Parameters<AccountCompletionCapability["complete"]>[0]["detected"],
  trimString: (value: unknown) => string,
) =>
  typeof detected.accessToken === "string"
    ? {
        username: trimString(detected.user?.username),
        access_token: trimString(detected.accessToken),
      }
    : null

export const aihubmixAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const service = getApiService(SITE_TYPES.AIHUBMIX)
    const { url, detected, context } = request

    let tokenInfo: unknown = getDetectedTokenInfo(detected, helpers.trimString)
    if (!tokenInfo) {
      try {
        tokenInfo = await service.getOrCreateAccessToken(
          helpers.createServiceRequest({
            baseUrl: url,
            context,
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId: detected.userId,
            },
          }),
        )
      } catch (error) {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          error,
        )
      }
    }

    let siteStatus = null
    try {
      siteStatus = await service.fetchSiteStatus(
        helpers.createServiceRequest({
          baseUrl: url,
          context,
          auth: {
            authType: AuthTypeEnum.Cookie,
          },
        }),
      )
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    const checkSupport =
      typeof siteStatus?.checkin_enabled === "boolean"
        ? siteStatus.checkin_enabled
        : await service
            .fetchSupportCheckIn(
              helpers.createServiceRequest({
                baseUrl: url,
                context,
                auth: {
                  authType: AuthTypeEnum.None,
                },
              }),
            )
            .catch(helpers.handleCheckInSupportFetchFailure)

    const tokenData =
      tokenInfo && typeof tokenInfo === "object"
        ? (tokenInfo as { username?: unknown; access_token?: unknown })
        : {}
    const username = helpers.trimString(tokenData.username)
    const accessToken = helpers.trimString(tokenData.access_token)

    if (!username || !accessToken) {
      throw helpers.createCompletionError(
        !accessToken
          ? AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing
          : AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error(!accessToken ? "access token missing" : "username missing"),
      )
    }

    return {
      username,
      siteName: await helpers.fetchSiteName(siteStatus),
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate:
        service.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: checkSupport ?? false,
        autoCheckInEnabled: true,
      }),
    }
  },
}
