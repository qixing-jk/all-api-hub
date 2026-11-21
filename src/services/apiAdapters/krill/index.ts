import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import { KRILL_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { confirmedAward } from "~/services/amounts/awards"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  EVIDENCE_KINDS,
} from "~/services/amounts/financialConstants"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import {
  fetchAccountData,
  fetchKrillInviteLink,
  fetchKrillUserInfo,
  redeemKrillCode,
} from "~/services/apiService/krill"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

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
      refreshAccount: (request) =>
        readAccountRefreshResult(() => fetchAccountData(request)),
    },
    keyResourceManagement: krillKeyResources,
    modelCatalog: krillModelCatalog,
    modelPricing: krillModelPricing,
    inviteLink: {
      fetchInviteLink: ({ request }) => fetchKrillInviteLink(request),
    },
    redemption: {
      async redeem({ request, code }) {
        await redeemKrillCode(request, code)
        return {
          awards: [
            confirmedAward({
              id: "grant",
              asset: { kind: ASSET_KINDS.Unknown },
              value: undefined,
              source: {
                adapter: "krill",
                operation: "redeem",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
                inputs: ["code_type"],
              },
              scope: accountBalanceScope(request),
              observedAt: Date.now(),
              fulfillment: AWARD_FULFILLMENT.Credited,
            }),
          ],
        }
      },
    },
  },
}
