import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { UI_CONSTANTS } from "~/constants/ui"
import type { AccountCompletionCapability } from "~/services/apiAdapters/contracts/accountCompletion"
import { fetchVoApiV2UserInfo } from "~/services/apiService/voapiV2"
import { VOAPI_V2_SYSTEM_NAME } from "~/services/apiService/voapiV2/type"
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

    let userInfo
    try {
      userInfo = await fetchVoApiV2UserInfo(
        helpers.createServiceRequest({
          baseUrl: url,
          context,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken,
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

    const detectedUser = detected.user as Record<string, unknown> | undefined
    const userId = helpers.trimString(detected.userId) || String(userInfo.id)
    const username =
      helpers.trimString(detectedUser?.username) ||
      helpers.trimString(detectedUser?.display_name) ||
      helpers.trimString(detectedUser?.email) ||
      helpers.trimString(userInfo.username) ||
      helpers.trimString(userInfo.nickname) ||
      userId

    return {
      username,
      siteName: await helpers.fetchSiteName({
        system_name: VOAPI_V2_SYSTEM_NAME,
      }),
      accessToken,
      userId,
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: true,
        autoCheckInEnabled: true,
      }),
    }
  },
}
