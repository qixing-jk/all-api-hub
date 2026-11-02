import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { AIMLAPI_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import { fetchAimlApiUserInfo } from "~/services/apiAdapters/aimlapi/accountIdentity"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchAimlApiLatestKey } from "~/services/apiService/aimlapi/keys"

export const aimlApiAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: fetchAimlApiUserInfo,
  getOrCreateAccessToken: async (request) => {
    // This bootstrap reuses a verified credential. Explicit issuance is owned
    // by aimlApiAccountOnboarding rather than implicit account refresh.
    const latest = await fetchAimlApiLatestKey(request)
    return {
      username: latest.name?.trim() || latest.prefix,
      access_token: request.auth.accessToken ?? "",
    }
  },
  loadBootstrapFacts: async () => ({
    displayName: AIMLAPI_DISPLAY_NAME,
    // AI/ML API has no check-in programme.
    checkInSupported: false,
    // Balances are USD; the CNY figure is the shared display conversion only.
    defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
  }),
  fetchCheckInSupport: async () => false,
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.AIMLAPI },
      route,
    ),
}
