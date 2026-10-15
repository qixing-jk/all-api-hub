import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { KRILL_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import {
  fetchAccountData,
  fetchKrillInviteLink,
  fetchKrillUserInfo,
  redeemKrillCode,
} from "~/services/apiService/krill"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { krillAnnouncements } from "./announcements"
import { krillKeyResources } from "./keyResources"
import { krillModelCatalog, krillModelPricing } from "./modelCatalog"

export const krillCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.KRILL,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Krill,
  site: { announcements: krillAnnouncements },
  account: {
    bootstrap: {
      fetchUserInfo: fetchKrillUserInfo,
      getOrCreateAccessToken: async () => {
        throw new ApiError(
          "Krill AI requires console Cookie authentication",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
      // Static facts only: the identity check happens during completion.
      loadBootstrapFacts: async () => ({
        displayName: KRILL_DISPLAY_NAME,
        checkInSupported: false,
      }),
      // The console has no check-in; `/api/wheel/*` is a disabled lottery.
      fetchCheckInSupport: async () => false,
      resolveRoutePath: async (target, route) =>
        resolveStaticAccountRoutePath(
          { ...target, siteType: SITE_TYPES.KRILL },
          route,
        ),
    },
    completion: {
      async complete(request, helpers) {
        const user = await fetchKrillUserInfo(
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
          siteName: KRILL_DISPLAY_NAME,
          exchangeRate: DEFAULT_USD_TO_CNY_RATE,
          authType: AuthTypeEnum.Cookie,
          checkIn: helpers.createInitialCheckInConfig({ supported: false }),
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
    keyResourceManagement: krillKeyResources,
    modelCatalog: krillModelCatalog,
    modelPricing: krillModelPricing,
    inviteLink: {
      fetchInviteLink: ({ request }) => fetchKrillInviteLink(request),
    },
    redemption: {
      redeem: ({ request, code }) => redeemKrillCode(request, code),
    },
  },
}
