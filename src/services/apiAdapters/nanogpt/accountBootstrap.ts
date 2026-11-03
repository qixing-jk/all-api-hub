import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { NANOGPT_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchUserInfo } from "~/services/apiService/nanogpt"

export const nanoGptAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo,
  getOrCreateAccessToken: async (request) => {
    // The console issues keys only through an email step-up challenge, so this
    // integration never mints a credential; the user pastes an existing key.
    const user = await fetchUserInfo(request)
    return {
      username: user.username,
      access_token: request.auth?.accessToken ?? "",
    }
  },
  loadBootstrapFacts: async () => ({
    displayName: NANOGPT_DISPLAY_NAME,
    checkInSupported: false,
    defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
  }),
  fetchCheckInSupport: async () => false,
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.NANOGPT },
      route,
    ),
}
