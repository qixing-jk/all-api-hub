import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import {
  KIMI_DISPLAY_NAME,
  KIMI_GLOBAL_DISPLAY_NAME,
} from "~/services/accountSiteDefinitions/identifiers"
import { kimiOpenPlatformAccountCompletion } from "~/services/apiAdapters/kimiOpenPlatform/accountCompletion"
import { readKimiAuthState } from "~/services/apiService/kimiOpenPlatform/transport"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

import { createAccountCompletionHelpersMock } from "../checkInFixtures"

const { mockFetchUserInfo, mockLoadBootstrapFacts } = vi.hoisted(() => ({
  mockFetchUserInfo: vi.fn(),
  mockLoadBootstrapFacts: vi.fn(),
}))

vi.mock(
  "~/services/apiAdapters/kimiOpenPlatform/accountBootstrap",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("~/services/apiAdapters/kimiOpenPlatform/accountBootstrap")
      >()
    return {
      ...original,
      kimiOpenPlatformAccountBootstrap: {
        ...original.kimiOpenPlatformAccountBootstrap,
        fetchUserInfo: mockFetchUserInfo,
        loadBootstrapFacts: mockLoadBootstrapFacts,
      },
    }
  },
)

const currentTabFetchContext = {
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 101,
  origin: "https://platform.kimi.com",
}

const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
  SITE_TYPES.KIMI,
  { automaticExecutionEnabled: false },
)

describe("kimiOpenPlatformAccountBootstrap", () => {
  it("provides defaultExchangeRate and display names for CN and Global", async () => {
    const { kimiOpenPlatformAccountBootstrap: actualBootstrap } =
      await vi.importActual<
        typeof import("~/services/apiAdapters/kimiOpenPlatform/accountBootstrap")
      >("~/services/apiAdapters/kimiOpenPlatform/accountBootstrap")

    const factsCn = await actualBootstrap.loadBootstrapFacts({
      baseUrl: "https://platform.kimi.com/console",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    expect(factsCn.defaultExchangeRate).toBe(DEFAULT_USD_TO_CNY_RATE)
    expect(factsCn.displayName).toBe(KIMI_DISPLAY_NAME)

    const factsGlobal = await actualBootstrap.loadBootstrapFacts({
      baseUrl: "https://platform.kimi.ai/console",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    expect(factsGlobal.defaultExchangeRate).toBe(DEFAULT_USD_TO_CNY_RATE)
    expect(factsGlobal.displayName).toBe(KIMI_GLOBAL_DISPLAY_NAME)
  })
})

describe("kimiOpenPlatformAccountCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the rotated console session from onboarding verification", async () => {
    mockFetchUserInfo.mockImplementationOnce(async (request) => {
      const state = readKimiAuthState(request)
      expect(state).toBeDefined()
      Object.assign(state!, {
        accessToken: "rotated-access",
        refreshToken: "rotated-refresh",
        tokenExpiresAt: 1900000000000,
      })
      return { id: "user-1", organizationId: "org-1" }
    })
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: KIMI_DISPLAY_NAME,
      defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
    })
    const result = await kimiOpenPlatformAccountCompletion.complete(
      {
        url: "https://platform.kimi.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          siteType: SITE_TYPES.KIMI,
          accessToken: "expired-access",
          userId: "user-1",
          kimiOpenPlatformAuth: {
            refreshToken: "old-refresh",
            organizationId: "org-1",
          },
        },
        context: { fetchContext: currentTabFetchContext },
      },
      helpers,
    )
    expect(result.accessToken).toBe("rotated-access")
    expect(result.kimiOpenPlatformAuth).toEqual({
      refreshToken: "rotated-refresh",
      organizationId: "org-1",
      tokenExpiresAt: 1900000000000,
    })
    expect(captureRecoveryData).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "rotated-access" }),
    )
  })

  it("populates defaultExchangeRate and captures it in recovery data", async () => {
    mockFetchUserInfo.mockResolvedValueOnce({
      id: "kimi-user-1",
      username: "kimi-tester",
      organizationId: "kimi-org-1",
    })
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: "Kimi 开放平台",
      defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
      checkInSupported: false,
    })

    const result = await kimiOpenPlatformAccountCompletion.complete(
      {
        url: "https://platform.kimi.com/console/api-keys",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          siteType: SITE_TYPES.KIMI,
          accessToken: "sample-access-jwt",
          userId: "kimi-user-1",
          kimiOpenPlatformAuth: {
            refreshToken: "sample-refresh-jwt",
            organizationId: "kimi-org-1",
            tokenExpiresAt: 1800000000000,
          },
        },
        context: {
          fetchContext: currentTabFetchContext,
        },
      },
      helpers,
    )

    expect(result.exchangeRate).toBe(DEFAULT_USD_TO_CNY_RATE)
    expect(result.username).toBe("kimi-tester")
    expect(result.userId).toBe("kimi-user-1")
    expect(result.siteName).toBe("Kimi 开放平台")
    expect(result.kimiOpenPlatformAuth).toEqual({
      refreshToken: "sample-refresh-jwt",
      organizationId: "kimi-org-1",
      tokenExpiresAt: 1800000000000,
    })

    expect(captureRecoveryData).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeRate: DEFAULT_USD_TO_CNY_RATE,
      }),
    )
  })
})
