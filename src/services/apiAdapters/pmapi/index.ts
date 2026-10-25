import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { PMAPI_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { fetchAccountData } from "~/services/apiService/pmapi"
import { fetchPmApiAff } from "~/services/apiService/pmapi/aff"
import { fetchPmApiUserInfo } from "~/services/apiService/pmapi/identity"
import { fetchPmApiStatus } from "~/services/apiService/pmapi/status"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { pmApiAnnouncements } from "./announcements"
import { pmApiKeyResources } from "./keyResources"
import { pmApiModelPricing } from "./modelCatalog"
import { pmApiRedemption } from "./redemption"

export const pmApiCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.PMAPI,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Pmapi,
  site: { announcements: pmApiAnnouncements },
  account: {
    redemption: pmApiRedemption,
    modelPricing: pmApiModelPricing,
    bootstrap: {
      fetchUserInfo: fetchPmApiUserInfo,
      // The console token is the only credential; it is acquired by the
      // content-session extractor after the user logs in on the site.
      getOrCreateAccessToken: async () => {
        throw new ApiError(
          "PM-API credentials are acquired through the console login",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
      loadBootstrapFacts: async (request) => {
        const status = await fetchPmApiStatus(request)
        return {
          displayName: status.name || PMAPI_DISPLAY_NAME,
          checkInSupported: status.autoCheckinSupported,
          defaultExchangeRate:
            status.usdRate > 0 ? status.usdRate : DEFAULT_USD_TO_CNY_RATE,
        }
      },
      // Per-deployment support: `checkin_enabled` differs between installs,
      // while a captcha-enforced scene still permits read-only detection.
      fetchCheckInSupport: async (request, facts) =>
        facts.checkInSupported ??
        (await fetchPmApiStatus(request)).autoCheckinSupported,
      resolveRoutePath: async (target, route) =>
        resolveStaticAccountRoutePath(
          { ...target, siteType: SITE_TYPES.PMAPI },
          route,
        ),
    },
    completion: {
      async complete(request, helpers) {
        const accessToken = helpers.trimString(request.detected.accessToken)
        if (!accessToken)
          throw helpers.createCompletionError(
            AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
            new Error("PM-API console token missing"),
          )
        const user = await fetchPmApiUserInfo(
          helpers.createServiceRequest({
            baseUrl: request.url,
            auth: {
              authType: AuthTypeEnum.AccessToken,
              userId: request.detected.userId,
              accessToken,
            },
            context: request.context,
          }),
        )
        const status = await fetchPmApiStatus(
          helpers.createServiceRequest({
            baseUrl: request.url,
            auth: { authType: AuthTypeEnum.AccessToken, userId: user.id },
            context: request.context,
          }),
        )
        const siteName = status.name || PMAPI_DISPLAY_NAME
        helpers.captureRecoveryData({
          userId: user.id,
          username: user.username,
          authType: AuthTypeEnum.AccessToken,
        })
        return {
          userId: user.id,
          username: user.username,
          accessToken,
          siteName,
          exchangeRate:
            status.usdRate > 0 ? status.usdRate : DEFAULT_USD_TO_CNY_RATE,
          authType: AuthTypeEnum.AccessToken,
          checkIn: helpers.createInitialCheckInConfig({
            supported: status.autoCheckinSupported,
            // A captcha-gated check-in cannot finish unattended, so new
            // accounts start with automatic execution off; the operator can
            // still enable it (and the click-on-verification preference).
            ...(status.requiresManualVerification
              ? { automaticExecutionEnabled: false }
              : {}),
          }),
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
    keyResourceManagement: pmApiKeyResources,
    inviteLink: {
      fetchInviteLink: async ({ request }) =>
        (await fetchPmApiAff(request)).inviteUrl,
    },
  },
}
