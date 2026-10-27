import { SITE_TYPES } from "~/constants/siteType"
import { NOVITA_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchNovitaUserInfo } from "~/services/apiService/novita"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

export const novitaAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: fetchNovitaUserInfo,
  getOrCreateAccessToken: async () => {
    // Novita's OpenAPI has no key-creation endpoint; keys are created in the
    // console key-management page only (docs + verified 404 on 2026-10-25).
    throw new ApiError(
      "Novita API keys are created in the console only",
      undefined,
      undefined,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
  },
  loadBootstrapFacts: async () => ({
    displayName: NOVITA_DISPLAY_NAME,
    // Novita's console has no check-in feature.
    checkInSupported: false,
  }),
  fetchCheckInSupport: async () => false,
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.NOVITA },
      route,
    ),
}
