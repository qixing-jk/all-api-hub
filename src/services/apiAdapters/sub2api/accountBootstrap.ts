import { SITE_TYPES } from "~/constants/siteType"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  fetchSub2ApiPublicSettings,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/sub2api"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("Sub2ApiAccountBootstrap")

export const sub2ApiAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: (request) => fetchUserInfo(request),
  getOrCreateAccessToken: (request) => getOrCreateAccessToken(request),
  async loadBootstrapFacts(request) {
    try {
      // Sub2API public settings own the deployment name, not /api/status.
      // https://github.com/Wei-Shaw/sub2api/blob/2bc139ab527b4a687546d145dc7bb9063cf14510/backend/internal/handler/dto/settings.go
      const settings = await fetchSub2ApiPublicSettings(request)
      const displayName =
        typeof settings?.site_name === "string" ? settings.site_name.trim() : ""
      return {
        ...(displayName ? { displayName } : {}),
        checkInSupported: false,
      }
    } catch (error) {
      logger.warn("Failed to fetch optional Sub2API site name", {
        error: getSafeErrorMessage(error),
      })
      return { checkInSupported: false }
    }
  },
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.SUB2API },
      route,
    ),
}
