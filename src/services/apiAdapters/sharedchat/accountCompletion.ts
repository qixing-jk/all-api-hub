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

    return {
      username: userInfo.username,
      siteName: await helpers.fetchSiteName(null),
      accessToken: userInfo.access_token,
      userId: userInfo.id,
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.Cookie,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: false,
        autoCheckInEnabled: false,
      }),
    }
  },
}
