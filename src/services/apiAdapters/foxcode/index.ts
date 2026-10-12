import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { fetchAccountData, fetchUserInfo } from "~/services/apiService/foxcode"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { foxCodeAnnouncements } from "./announcements"
import { foxCodeInviteLink } from "./inviteLink"
import { foxCodeKeyResources } from "./keyResources"
import { foxCodeModelCatalog, foxCodeModelPricing } from "./modelCatalog"

export const foxCodeCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.FOXCODE,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.FoxCode,
  account: {
    inviteLink: foxCodeInviteLink,
    announcements: foxCodeAnnouncements,
    keyResourceManagement: foxCodeKeyResources,
    modelCatalog: foxCodeModelCatalog,
    modelPricing: foxCodeModelPricing,
    bootstrap: {
      fetchUserInfo,
      getOrCreateAccessToken: async () => {
        throw new ApiError(
          "FoxCode requires console Cookie authentication",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
      loadBootstrapFacts: async () => ({
        displayName: "FoxCode",
        checkInSupported: false,
      }),
      fetchCheckInSupport: async () => false,
      resolveRoutePath: async (target, route) =>
        resolveStaticAccountRoutePath(
          { ...target, siteType: SITE_TYPES.FOXCODE },
          route,
        ),
    },
    completion: {
      async complete(request, helpers) {
        const user = await fetchUserInfo(
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
          userId: String(user.id),
          username: user.username,
          authType: AuthTypeEnum.Cookie,
        })
        return {
          userId: user.id,
          username: user.username,
          accessToken: "",
          siteName: "FoxCode",
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
  },
}
