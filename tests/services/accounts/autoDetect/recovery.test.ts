import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createDetectedAccountRecoveryData,
  mergeAccountAutoDetectRecoveryData,
} from "~/services/accounts/autoDetect/recovery"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

describe("account auto-detect recovery", () => {
  it("keeps a known site type when a later partial update is unknown", () => {
    expect(
      mergeAccountAutoDetectRecoveryData(
        { siteType: SITE_TYPES.NEW_API, username: "first-user" },
        { siteType: SITE_TYPES.UNKNOWN, accessToken: "later-token" },
      ),
    ).toEqual({
      siteType: SITE_TYPES.NEW_API,
      username: "first-user",
      accessToken: "later-token",
    })
  })

  it("omits blank detected identity fields", () => {
    expect(
      createDetectedAccountRecoveryData({
        detected: {
          siteType: SITE_TYPES.NEW_API,
          userId: "  ",
          user: { username: "  " },
          accessToken: "  ",
        },
        requestedAuthType: AuthTypeEnum.AccessToken,
      }),
    ).toEqual({
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
    })
  })

  it("replaces Sub2API refresh credentials atomically", () => {
    expect(
      mergeAccountAutoDetectRecoveryData(
        {
          sub2apiAuth: {
            refreshToken: "old-refresh-token",
            tokenExpiresAt: 100,
          },
        },
        {
          sub2apiAuth: {
            refreshToken: "new-refresh-token",
            tokenExpiresAt: 200,
          },
        },
      )?.sub2apiAuth,
    ).toEqual({
      refreshToken: "new-refresh-token",
      tokenExpiresAt: 200,
    })
  })

  it("ignores undefined patches while preserving null as recovery data", () => {
    expect(
      mergeAccountAutoDetectRecoveryData(
        {
          username: "first-user",
          sub2apiAuth: { refreshToken: "first-refresh-token" },
          fetchContext: {
            kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 7,
            origin: "https://panel.example.invalid",
          },
          exchangeRate: 7,
        },
        {
          username: undefined,
          sub2apiAuth: undefined,
          fetchContext: undefined,
          exchangeRate: null,
        },
      ),
    ).toEqual({
      username: "first-user",
      sub2apiAuth: { refreshToken: "first-refresh-token" },
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 7,
        origin: "https://panel.example.invalid",
      },
      exchangeRate: null,
    })
  })
})
