import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { DAYA_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { fetchAccountData } from "~/services/apiService/daya"
import { fetchDayaUserInfo } from "~/services/apiService/daya/identity"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { dayaAnnouncements } from "./announcements"
import { dayaKeyResources } from "./keyResources"
import { dayaModelPricing } from "./modelCatalog"
import { dayaRedemption } from "./redemption"

export const dayaCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.DAYA,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Daya,
  site: { announcements: dayaAnnouncements },
  account: {
    redemption: dayaRedemption,
    modelPricing: dayaModelPricing,
    bootstrap: {
      fetchUserInfo: fetchDayaUserInfo,
      getOrCreateAccessToken: async () => {
        throw new ApiError(
          "Daya API requires console Cookie authentication",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
      loadBootstrapFacts: async () => ({
        displayName: DAYA_DISPLAY_NAME,
        // The 任务中心 exposes the daily grant to every ordinary account.
        checkInSupported: true,
      }),
      fetchCheckInSupport: async (_request, facts) => facts.checkInSupported,
      resolveRoutePath: async (target, route) =>
        resolveStaticAccountRoutePath(
          { ...target, siteType: SITE_TYPES.DAYA },
          route,
        ),
    },
    completion: {
      async complete(request, helpers) {
        const user = await fetchDayaUserInfo(
          helpers.createServiceRequest({
            baseUrl: request.url,
            auth: {
              authType: request.requestedAuthType,
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
          siteName: DAYA_DISPLAY_NAME,
          exchangeRate: DEFAULT_USD_TO_CNY_RATE,
          authType: AuthTypeEnum.Cookie,
          checkIn: helpers.createInitialCheckInConfig({ supported: true }),
        }
      },
    },
    data: { fetchData: fetchAccountData },
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
    keyResourceManagement: dayaKeyResources,
  },
}
