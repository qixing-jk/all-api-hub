import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { PMPLAN_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { fetchAccountData, fetchUserInfo } from "~/services/apiService/pmplan"
import { fetchPmplanAnnouncements } from "~/services/apiService/pmplan/announcements"
import { fetchPmplanCheckInStatus } from "~/services/apiService/pmplan/checkIn"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { pmplanKeyResources } from "./keyResources"
import { pmplanModelCatalog, pmplanModelPricing } from "./modelCatalog"

export const pmplanCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.PMPLAN,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Pmplan,
  account: {
    announcements: { fetch: fetchPmplanAnnouncements },
    modelCatalog: pmplanModelCatalog,
    modelPricing: pmplanModelPricing,
    keyResourceManagement: pmplanKeyResources,
    data: { fetchData: fetchAccountData },
    bootstrap: {
      fetchUserInfo,
      async getOrCreateAccessToken() {
        throw new ApiError(
          "PM-Plan requires console Cookie authentication",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
      async loadBootstrapFacts(request) {
        await fetchUserInfo(request)
        await fetchPmplanCheckInStatus(request)
        return { displayName: PMPLAN_DISPLAY_NAME, checkInSupported: true }
      },
      async fetchCheckInSupport(_request, facts) {
        return facts.checkInSupported
      },
      async resolveRoutePath(target, route) {
        return resolveStaticAccountRoutePath(target, route)
      },
    },
    completion: {
      async complete(request, helpers) {
        // Unknown deployments initially use the generic auth default. Preserve
        // Cookie recovery before the first permission-dependent console read.
        helpers.captureRecoveryData({ authType: AuthTypeEnum.Cookie })
        const user = await fetchUserInfo(
          helpers.createServiceRequest({
            baseUrl: request.url,
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId: request.detected.userId,
            },
            context: request.context,
          }),
        )
        helpers.captureRecoveryData({
          userId: user.id,
          username: user.username,
          authType: AuthTypeEnum.Cookie,
        })
        return {
          userId: user.id,
          username: user.username,
          accessToken: "",
          siteName: PMPLAN_DISPLAY_NAME,
          exchangeRate: DEFAULT_USD_TO_CNY_RATE,
          authType: AuthTypeEnum.Cookie,
          checkIn: helpers.createInitialCheckInConfig({
            supported: true,
            automaticExecutionEnabled: false,
          }),
        }
      },
    },
    refresh: {
      async refreshAccount(request) {
        try {
          return {
            success: true,
            data: await fetchAccountData(request),
            healthStatus: {
              status: SiteHealthStatus.Healthy,
              message: t("account:healthStatus.normal"),
            },
          }
        } catch (error) {
          return { success: false, healthStatus: determineHealthStatus(error) }
        }
      },
    },
  },
}
