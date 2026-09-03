import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { UI_CONSTANTS } from "~/constants/ui"
import { fetchUserInfo } from "~/services/apiService/sharedchat"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

export const sharedChatAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, requestedAuthType, detected, context } = request

    if (requestedAuthType !== AuthTypeEnum.Cookie) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("SharedChat requires cookie authentication"),
      )
    }

    const userInfo = await fetchUserInfo(
      helpers.createServiceRequest({
        baseUrl: url,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: detected.userId,
        },
        context,
      }),
    ).catch((error) => {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
        error,
      )
    })

    const recoveredUsername = helpers.trimString(userInfo.username)
    const recoveredAccessToken = helpers.trimString(userInfo.access_token)
    const recoveredUserId = helpers.trimString(userInfo.id)
    helpers.captureRecoveryData({
      ...(recoveredUsername ? { username: recoveredUsername } : {}),
      ...(recoveredAccessToken ? { accessToken: recoveredAccessToken } : {}),
      ...(recoveredUserId ? { userId: recoveredUserId } : {}),
      authType: AuthTypeEnum.Cookie,
    })

    return {
      username: userInfo.username,
      siteName: await helpers.fetchSiteName(null),
      accessToken: userInfo.access_token,
      userId: userInfo.id,
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.Cookie,
      checkIn: helpers.createInitialCheckInConfig({
        supported: false,
      }),
    }
  },
}
