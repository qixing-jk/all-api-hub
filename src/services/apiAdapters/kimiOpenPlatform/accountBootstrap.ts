import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { KIMI_GLOBAL_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchKimiUserInfo } from "~/services/apiService/kimiOpenPlatform"
import { resolveKimiOpenPlatformDeployment } from "~/services/kimiOpenPlatform/deployments"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

export const kimiOpenPlatformAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: async (request) => fetchKimiUserInfo(request),
  getOrCreateAccessToken: async (request) => ({
    username: "",
    access_token: request.auth.accessToken?.trim() ?? "",
  }),
  loadBootstrapFacts: async (request) => {
    const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
    return {
      displayName: deployment?.displayName ?? KIMI_GLOBAL_DISPLAY_NAME,
      defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
      checkInSupported: false,
    }
  },
  fetchCheckInSupport: async () => false,
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(target, route),
}
