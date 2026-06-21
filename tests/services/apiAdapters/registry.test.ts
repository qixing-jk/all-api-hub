import { describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

const { getAccountSiteAdapterFamilyMock, redeemCodeMock } = vi.hoisted(() => ({
  getAccountSiteAdapterFamilyMock: vi.fn((siteType: AccountSiteType) => {
    if (siteType === SITE_TYPES.SUB2API) {
      return ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api
    }

    if (siteType === SITE_TYPES.AIHUBMIX) {
      return ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix
    }

    if (
      [
        SITE_TYPES.ONE_API,
        SITE_TYPES.NEW_API,
        SITE_TYPES.ANYROUTER,
        SITE_TYPES.VELOERA,
        SITE_TYPES.ONE_HUB,
        SITE_TYPES.DONE_HUB,
        SITE_TYPES.V_API,
        SITE_TYPES.VO_API,
        SITE_TYPES.SUPER_API,
        SITE_TYPES.RIX_API,
        SITE_TYPES.NEO_API,
        SITE_TYPES.WONG_GONGYI,
        SITE_TYPES.UNKNOWN,
      ].includes(siteType)
    ) {
      return ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
    }

    return ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported
  }),
  redeemCodeMock: vi.fn(),
}))

vi.mock(
  "~/services/accountSiteOnboarding/registry",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/accountSiteOnboarding/registry")
    >()),
    getAccountSiteAdapterFamily: getAccountSiteAdapterFamilyMock,
  }),
)

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    redeemCode: redeemCodeMock,
  })),
}))

const expectTokenProvisioningCapability = (
  adapter: ReturnType<typeof getSiteAdapter>,
) => {
  expect(adapter.tokenProvisioning).toEqual({
    resolveDefaultTokenCreation: expect.any(Function),
    classifyCreatedToken: expect.any(Function),
    isInventoryTokenUsable: expect.any(Function),
    getRepairPolicy: expect.any(Function),
  })
}

describe("apiAdapters registry", () => {
  it("routes compatible account sites through the onboarding adapter-family projection", () => {
    getAccountSiteAdapterFamilyMock.mockReturnValueOnce(
      ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    )

    const adapter = getSiteAdapter(SITE_TYPES.OCTOPUS as AccountSiteType)

    expect(getAccountSiteAdapterFamilyMock).toHaveBeenCalledWith(
      SITE_TYPES.OCTOPUS,
    )
    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.OCTOPUS,
      family: "newApiFamily",
    })
  })

  it("returns a Sub2API Adapter with account-scoped siteAnnouncements", () => {
    const adapter = getSiteAdapter(SITE_TYPES.SUB2API)

    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.SUB2API,
      family: "sub2api",
    })
    expect(adapter.siteAnnouncements).toEqual({
      fetch: expect.any(Function),
      markRead: expect.any(Function),
    })
    expect(adapter.modelCatalog).toEqual({
      fetchModels: expect.any(Function),
    })
    expect(adapter.accountCompletion).toEqual({
      complete: expect.any(Function),
    })
    expect(adapter.keyManagement).toEqual({
      fetchTokens: expect.any(Function),
      createToken: expect.any(Function),
      updateToken: expect.any(Function),
      resolveTokenKey: expect.any(Function),
      deleteToken: expect.any(Function),
      fetchAvailableModels: expect.any(Function),
      userGroups: {
        fetch: expect.any(Function),
      },
    })
    expect(adapter.accountRefresh).toEqual({
      fetchCheckInSupport: expect.any(Function),
      refreshAccount: expect.any(Function),
    })
    expect(adapter.accountBootstrap).toEqual({
      fetchUserInfo: expect.any(Function),
      getOrCreateAccessToken: expect.any(Function),
      fetchSiteStatus: expect.any(Function),
      fetchCheckInSupport: expect.any(Function),
      extractDefaultExchangeRate: expect.any(Function),
      resolveRoutePath: expect.any(Function),
    })
    expect(adapter.accountData).toEqual({
      fetchData: expect.any(Function),
    })
    expectTokenProvisioningCapability(adapter)
    expect(adapter.modelPricing).toBeUndefined()
    expect(adapter.redemption).toBeUndefined()
    expect(adapter.siteNotice).toBeUndefined()
  })

  it("returns New API family Adapters with siteNotice for compatible account sites", () => {
    for (const siteType of [
      SITE_TYPES.ONE_API,
      SITE_TYPES.NEW_API,
      SITE_TYPES.ANYROUTER,
      SITE_TYPES.VELOERA,
      SITE_TYPES.ONE_HUB,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.V_API,
      SITE_TYPES.VO_API,
      SITE_TYPES.SUPER_API,
      SITE_TYPES.RIX_API,
      SITE_TYPES.NEO_API,
      SITE_TYPES.WONG_GONGYI,
      SITE_TYPES.UNKNOWN,
    ]) {
      const adapter = getSiteAdapter(siteType)

      expect(adapter).toMatchObject({
        siteType,
        family: "newApiFamily",
      })
      expect(adapter.siteNotice).toEqual({
        fetch: expect.any(Function),
      })
      expect(adapter.accountCompletion).toEqual({
        complete: expect.any(Function),
      })
      expect(adapter.keyManagement).toEqual({
        fetchTokens: expect.any(Function),
        createToken: expect.any(Function),
        updateToken: expect.any(Function),
        resolveTokenKey: expect.any(Function),
        deleteToken: expect.any(Function),
        fetchAvailableModels: expect.any(Function),
        userGroups: {
          fetch: expect.any(Function),
        },
      })
      expect(adapter.accountRefresh).toEqual({
        fetchCheckInSupport: expect.any(Function),
        refreshAccount: expect.any(Function),
      })
      expect(adapter.accountBootstrap).toEqual({
        fetchUserInfo: expect.any(Function),
        getOrCreateAccessToken: expect.any(Function),
        fetchSiteStatus: expect.any(Function),
        fetchCheckInSupport: expect.any(Function),
        extractDefaultExchangeRate: expect.any(Function),
        resolveRoutePath: expect.any(Function),
      })
      expect(adapter.accountData).toEqual({
        fetchData: expect.any(Function),
      })
      expectTokenProvisioningCapability(adapter)
      expect(adapter.modelPricing).toEqual({
        fetchPricing: expect.any(Function),
      })
      expect(adapter.redemption).toEqual({
        redeem: expect.any(Function),
      })
      expect(adapter.siteAnnouncements).toBeUndefined()
      expect(adapter.modelCatalog).toBeUndefined()
    }
  })

  it("binds New API family redemption to the selected site type", async () => {
    redeemCodeMock.mockResolvedValueOnce(500)

    const adapter = getSiteAdapter(SITE_TYPES.VELOERA)
    const request = {
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "user-1",
        accessToken: "access-token",
      },
    }

    await expect(
      adapter.redemption?.redeem({
        request,
        code: "example-code",
      }),
    ).resolves.toBe(500)

    expect(getApiService).toHaveBeenCalledWith(SITE_TYPES.VELOERA)
    expect(redeemCodeMock).toHaveBeenCalledWith(request, "example-code")
  })

  it("returns an AIHubMix Adapter with account completion and key management", () => {
    const adapter = getSiteAdapter(SITE_TYPES.AIHUBMIX)

    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
    })
    expect(adapter.accountCompletion).toEqual({
      complete: expect.any(Function),
    })
    expect(adapter.keyManagement).toEqual({
      fetchTokens: expect.any(Function),
      createToken: expect.any(Function),
      updateToken: expect.any(Function),
      resolveTokenKey: expect.any(Function),
      deleteToken: expect.any(Function),
      fetchAvailableModels: expect.any(Function),
    })
    expect(adapter.keyManagement?.userGroups).toBeUndefined()
    expect(adapter.accountRefresh).toEqual({
      fetchCheckInSupport: expect.any(Function),
      refreshAccount: expect.any(Function),
    })
    expect(adapter.accountBootstrap).toEqual({
      fetchUserInfo: expect.any(Function),
      getOrCreateAccessToken: expect.any(Function),
      fetchSiteStatus: expect.any(Function),
      fetchCheckInSupport: expect.any(Function),
      extractDefaultExchangeRate: expect.any(Function),
      resolveRoutePath: expect.any(Function),
    })
    expect(adapter.accountData).toEqual({
      fetchData: expect.any(Function),
    })
    expectTokenProvisioningCapability(adapter)
    expect(adapter.modelPricing).toEqual({
      fetchPricing: expect.any(Function),
    })
    expect(adapter.redemption).toBeUndefined()
    expect(adapter.siteNotice).toBeUndefined()
    expect(adapter.siteAnnouncements).toBeUndefined()
    expect(adapter.modelCatalog).toBeUndefined()
  })

  it("returns unsupported adapters without account capabilities", () => {
    for (const siteType of [
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ]) {
      const adapter = getSiteAdapter(siteType as AccountSiteType)

      expect(adapter).toEqual({
        siteType,
      })
      expect(adapter.accountBootstrap).toBeUndefined()
      expect(adapter.tokenProvisioning).toBeUndefined()
    }
  })
})
