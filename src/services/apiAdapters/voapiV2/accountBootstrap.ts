import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  fetchSupportCheckIn,
  fetchVoApiV2UserInfo,
} from "~/services/apiService/voapiV2"
import { VOAPI_V2_SYSTEM_NAME } from "~/services/apiService/voapiV2/type"

export const voApiV2AccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: async (request) => {
    const userInfo = await fetchVoApiV2UserInfo(request)
    const id = userInfo.id
    const username =
      userInfo.username?.trim() || userInfo.nickname?.trim() || String(id)

    return {
      id: String(id),
      username,
      access_token: request.auth.accessToken ?? null,
    }
  },
  getOrCreateAccessToken: async (request) => ({
    username: String(request.auth.userId ?? ""),
    access_token: request.auth.accessToken ?? "",
  }),
  loadBootstrapFacts: async () => ({
    displayName: VOAPI_V2_SYSTEM_NAME,
    defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
    checkInSupported: true,
  }),
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.VO_API_V2 },
      route,
    ),
}
