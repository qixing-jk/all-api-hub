import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  fetchSupportCheckIn,
  fetchVoApiV2UserInfo,
} from "~/services/apiService/voapiV2"

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
  fetchSiteStatus: async () => ({
    system_name: "VoAPI",
    checkin_enabled: true,
  }),
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  extractDefaultExchangeRate: () => UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.VO_API_V2 },
      route,
    ),
}
