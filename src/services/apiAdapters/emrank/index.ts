import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import { EMRANK_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { confirmedAward } from "~/services/amounts/awards"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  EVIDENCE_KINDS,
} from "~/services/amounts/financialConstants"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { fetchAccountData } from "~/services/apiService/emrank/accountData"
import { fetchAnnouncements } from "~/services/apiService/emrank/announcements"
import { EMRANK_TOKEN_ASSET } from "~/services/apiService/emrank/constants"
import { fetchEmRankUserInfo } from "~/services/apiService/emrank/identity"
import {
  fetchCheckInSupport,
  redeemCode,
} from "~/services/apiService/emrank/surfaces"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { emRankKeyResources } from "./keyResources"
import { fetchEmRankPricing } from "./modelCatalog"

export const emRankCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.EMRANK,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Emrank,
  // The console needs a live session for its announcement list as well.
  site: {
    announcements: {
      async fetch(request) {
        return fetchAnnouncements(request)
      },
    },
  },
  account: {
    bootstrap: {
      fetchUserInfo: fetchEmRankUserInfo,
      getOrCreateAccessToken: async () => {
        throw new ApiError(
          "EMRank requires console Cookie authentication",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
      // Static facts only: the live identity check happens during completion.
      loadBootstrapFacts: async () => ({
        displayName: EMRANK_DISPLAY_NAME,
        // `/api/account` reports check-in availability for this account.
        checkInSupported: true,
      }),
      async fetchCheckInSupport(request) {
        // An explicit probe always outranks the optimistic static fact.
        if (request.auth.authType !== AuthTypeEnum.Cookie) return undefined
        return fetchCheckInSupport(request)
      },
      resolveRoutePath: async (target, route) =>
        resolveStaticAccountRoutePath(
          { ...target, siteType: SITE_TYPES.EMRANK },
          route,
        ),
    },
    completion: {
      async complete(request, helpers) {
        const user = await fetchEmRankUserInfo(
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
          siteName: EMRANK_DISPLAY_NAME,
          // The site prices credit in M Token, not dollars; keep the shared
          // placeholder rate rather than inventing a site-specific one.
          exchangeRate: DEFAULT_USD_TO_CNY_RATE,
          authType: AuthTypeEnum.Cookie,
          checkIn: helpers.createInitialCheckInConfig({ supported: true }),
        }
      },
    },
    data: { fetchData: fetchAccountData },
    refresh: {
      refreshAccount: (request) =>
        readAccountRefreshResult(() => fetchAccountData(request)),
    },
    keyResourceManagement: emRankKeyResources,
    modelPricing: { fetchPricing: fetchEmRankPricing },
    redemption: {
      async redeem({ request, code }) {
        const delta = await redeemCode(request, code)
        return {
          awards: [
            confirmedAward({
              id: "credit",
              asset: { kind: ASSET_KINDS.Quota, ...EMRANK_TOKEN_ASSET },
              value: delta,
              source: {
                adapter: "emrank",
                operation: "redeem",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
                inputs: ["delta"],
              },
              scope: accountBalanceScope(request),
              observedAt: Date.now(),
              fulfillment: AWARD_FULFILLMENT.Credited,
              target: AWARD_TARGETS.Wallet,
            }),
          ],
        }
      },
    },
  },
}
