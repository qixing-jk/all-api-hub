import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapRouteTarget,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { createNewApiAccountBootstrap } from "~/services/apiAdapters/newApi/account/accountBootstrap"
import { AuthTypeEnum } from "~/types"

const {
  anyrouterFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
  mockFetchCheckInSupport,
  mockFetchSiteStatus,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
  wongFetchSupportCheckIn,
} = vi.hoisted(() => ({
  anyrouterFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchCheckInSupport: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
  wongFetchSupportCheckIn: vi.fn(),
}))

vi.mock(
  "~/services/apiService/newApiFamily/default/accountBootstrap",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/default/accountBootstrap")
    >()),
    defaultAccountBootstrapImplementation: {
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchSupportCheckIn: mockFetchCheckInSupport,
      fetchSiteStatus: mockFetchSiteStatus,
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
    },
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/anyrouter",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/anyrouter")
    >()),
    fetchSupportCheckIn: anyrouterFetchSupportCheckIn,
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/wong",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/wong")
    >()),
    fetchSupportCheckIn: wongFetchSupportCheckIn,
  }),
)

const request = {
  baseUrl: "https://bootstrap.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

describe("createNewApiAccountBootstrap", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each([
    {
      username: "",
      displayName: "  Account label  ",
      expected: "Account label",
    },
    {
      username: "  login-name  ",
      displayName: "Account label",
      expected: "login-name",
    },
  ])(
    "normalizes ModelFlare credential labels at the bootstrap interface: $expected",
    async ({ username, displayName, expected }) => {
      const payload = {
        id: "user-1",
        username,
        access_token: "account-token",
        user: { display_name: displayName },
      }
      mockFetchUserInfo.mockResolvedValueOnce(payload)
      const bootstrap = createNewApiAccountBootstrap(SITE_TYPES.MODELFLARE)
      await expect(bootstrap.fetchUserInfo(request)).resolves.toMatchObject({
        username: expected,
        access_token: "account-token",
      })
    },
  )

  it("normalizes ModelFlare token labels from the acquisition transport", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "  login-name  ",
      access_token: "account-token",
    })
    const bootstrap = createNewApiAccountBootstrap(SITE_TYPES.MODELFLARE)

    await expect(bootstrap.getOrCreateAccessToken(request)).resolves.toEqual({
      username: "login-name",
      access_token: "account-token",
    })
  })

  it("delegates New API-family bootstrap operations through the New API-family implementation", async () => {
    const userInfo = {
      id: "user-1",
      username: "Example User",
      access_token: "access-token",
    }
    const accessToken = {
      username: "Example User",
      access_token: "created-token",
    }
    const siteStatus = {
      system_name: "Example API",
      checkin_enabled: true,
      price: 7.2,
    }
    mockFetchUserInfo.mockResolvedValueOnce(userInfo)
    mockGetOrCreateAccessToken.mockResolvedValueOnce(accessToken)
    mockFetchSiteStatus.mockResolvedValueOnce(siteStatus)
    mockFetchCheckInSupport.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(7.2)

    const accountBootstrap = createNewApiAccountBootstrap(SITE_TYPES.NEW_API)

    await expect(accountBootstrap.fetchUserInfo(request)).resolves.toBe(
      userInfo,
    )
    await expect(
      accountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toBe(accessToken)
    await expect(accountBootstrap.loadBootstrapFacts(request)).resolves.toEqual(
      {
        displayName: "Example API",
        defaultExchangeRate: 7.2,
        checkInSupported: true,
      },
    )
    await expect(
      accountBootstrap.fetchCheckInSupport(request, { checkInSupported: true }),
    ).resolves.toBe(true)

    expect(mockFetchUserInfo).toHaveBeenCalledWith(request)
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith(request)
    expect(mockFetchSiteStatus).toHaveBeenCalledWith(request)
    expect(mockFetchCheckInSupport).not.toHaveBeenCalled()
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith(siteStatus)
  })

  it("keeps account route resolution on the static account route helper", async () => {
    const accountBootstrap = createNewApiAccountBootstrap(SITE_TYPES.NEW_API)
    const target: AccountBootstrapRouteTarget = {
      baseUrl: "https://new.example.invalid",
      siteType: SITE_TYPES.NEW_API,
    }

    await expect(
      accountBootstrap.resolveRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login,
      ),
    ).resolves.toBe("/login")
  })

  it("forwards the expected account identity through the factory closure", async () => {
    const accessToken = {
      username: "Example User",
      access_token: "created-token",
    }
    const expectedUserId = "user-1"
    mockGetOrCreateAccessToken.mockResolvedValueOnce(accessToken)

    const accountBootstrap = createNewApiAccountBootstrap(SITE_TYPES.NEW_API, {
      expectedUserId,
    })

    await expect(
      accountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toBe(accessToken)
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith(request, {
      expectedUserId,
    })
  })

  it.each([
    [SITE_TYPES.ANYROUTER, anyrouterFetchSupportCheckIn],
    [SITE_TYPES.WONG_GONGYI, wongFetchSupportCheckIn],
  ])(
    "uses the adapter-level support probe override for %s",
    async (siteType, supportProbe) => {
      supportProbe.mockResolvedValueOnce(true)

      const accountBootstrap = createNewApiAccountBootstrap(siteType)

      await expect(
        accountBootstrap.fetchCheckInSupport(request, {}),
      ).resolves.toBe(true)

      expect(supportProbe).toHaveBeenCalledWith(request)
      expect(mockFetchCheckInSupport).not.toHaveBeenCalled()
    },
  )
})
