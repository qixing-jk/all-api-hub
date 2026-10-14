import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import {
  fetchAccountData,
  fetchIdentity,
  fetchUserInfo,
} from "~/services/apiService/xiaoen"
import { XIAOEN_ENDPOINTS } from "~/services/apiService/xiaoen/constants"
import {
  invalidXiaoenResponse,
  readXiaoen,
  withXiaoenSession,
} from "~/services/apiService/xiaoen/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { xiaoenAnnouncements } from "./announcements"
import { xiaoenModelCatalog, xiaoenModelPricing } from "./modelCatalog"

export const xiaoenCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.XIAOEN,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Xiaoen,
  site: { announcements: xiaoenAnnouncements },
  account: {
    modelCatalog: xiaoenModelCatalog,
    modelPricing: xiaoenModelPricing,
    inviteLink: {
      fetchInviteLink: ({ request }) =>
        withXiaoenSession(request, async (request) => {
          const { data } = await fetchIdentity(request)
          const config = await readXiaoen(request, XIAOEN_ENDPOINTS.Config)
          if (
            typeof data.inviteCode !== "string" ||
            !data.inviteCode.trim() ||
            !isRecord(config.externalLinks) ||
            typeof config.externalLinks.siteUrl !== "string"
          )
            throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Config)
          const url = new URL(config.externalLinks.siteUrl)
          if (url.protocol !== "https:" || url.username || url.password)
            throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Config)
          url.pathname = "/register"
          url.search = ""
          url.hash = ""
          url.searchParams.set("code", data.inviteCode)
          return url.href
        }),
    },
    serviceCredential: {
      async fetch(request) {
        const { data } = await fetchIdentity(request)
        if (
          typeof data.apiKey !== "string" ||
          !/^sk-[A-Za-z0-9_-]+$/.test(data.apiKey) ||
          typeof data.apiBaseUrl !== "string"
        )
          throw new ApiError(
            "肖恩 AI inference credential unavailable",
            undefined,
            undefined,
            API_ERROR_CODES.JSON_PARSE_ERROR,
          )
        const url = new URL(data.apiBaseUrl)
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new ApiError(
            "Invalid 肖恩 AI inference route",
            undefined,
            undefined,
            API_ERROR_CODES.JSON_PARSE_ERROR,
          )
        return {
          kind: "singleton_service_key",
          service: "xiaoen",
          label: "肖恩 AI",
          key: data.apiKey,
          isAuthenticated: true,
          baseUrl: `${url.href.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
        }
      },
    },
    bootstrap: {
      fetchUserInfo,
      getOrCreateAccessToken: async () => {
        throw new ApiError(
          "肖恩 AI requires console Cookie authentication",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
      loadBootstrapFacts: async (request) => {
        await fetchUserInfo(request)
        return { displayName: "肖恩 AI", checkInSupported: true }
      },
      fetchCheckInSupport: async (_request, facts) => facts.checkInSupported,
      resolveRoutePath: async (target, route) =>
        resolveStaticAccountRoutePath(
          { ...target, siteType: SITE_TYPES.XIAOEN },
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
          userId: user.id,
          username: user.username,
          authType: AuthTypeEnum.Cookie,
        })
        return {
          userId: user.id,
          username: user.username,
          accessToken: "",
          siteName: "肖恩 AI",
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
  },
}
