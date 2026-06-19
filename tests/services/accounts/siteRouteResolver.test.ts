import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  clearSiteRouteThemeCacheForTests,
  getBestEffortLoginUrl,
  resolveAccountSiteLoginUrl,
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import { AuthTypeEnum } from "~/types"

const { mockFetchSiteStatus, mockGetSiteAdapter, mockResolveRoutePath } =
  vi.hoisted(() => ({
    mockFetchSiteStatus: vi.fn(),
    mockGetSiteAdapter: vi.fn(),
    mockResolveRoutePath: vi.fn(),
  }))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: mockGetSiteAdapter,
}))

describe("siteRouteResolver", () => {
  beforeEach(() => {
    clearSiteRouteThemeCacheForTests()
    vi.restoreAllMocks()
    mockFetchSiteStatus.mockReset()
    mockGetSiteAdapter.mockReset()
    mockResolveRoutePath.mockReset()
    mockResolveRoutePath.mockImplementation((target, route) =>
      Promise.resolve(resolveStaticAccountRoutePath(target, route)),
    )
    mockGetSiteAdapter.mockReturnValue({
      accountBootstrap: {
        fetchSiteStatus: mockFetchSiteStatus,
        resolveRoutePath: mockResolveRoutePath,
      },
    })
  })

  const mockDefaultNewApiThemeStatus = () =>
    mockFetchSiteStatus.mockResolvedValue({
      theme: "default",
    })

  it("uses New API default frontend routes when /api/status reports the default theme", async () => {
    mockDefaultNewApiThemeStatus()

    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://new-api.example/profile")
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe("https://new-api.example/profile")
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.Redeem,
      ),
    ).resolves.toBe("https://new-api.example/wallet")
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.Usage,
      ),
    ).resolves.toBe("https://new-api.example/usage-logs")
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.Login,
      ),
    ).resolves.toBe("https://new-api.example/sign-in")
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://new-api.example",
      auth: { authType: AuthTypeEnum.None },
    })
    expect(mockResolveRoutePath).toHaveBeenCalledWith(
      { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
      SITE_ROUTE_KINDS.CheckIn,
    )
  })

  it("keeps classic New API routes when /api/status is unavailable", async () => {
    mockFetchSiteStatus.mockRejectedValue(new Error("offline"))

    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://new-api.example/console/personal")
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.Redeem,
      ),
    ).resolves.toBe("https://new-api.example/console/topup")
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.Usage,
      ),
    ).resolves.toBe("https://new-api.example/console/log")
  })

  it("uses static route config for non-New API sites without probing /api/status", async () => {
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://veloera.example", siteType: SITE_TYPES.VELOERA },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://veloera.example/app/me")

    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })

  it("falls back to static route config when account bootstrap is missing", async () => {
    mockGetSiteAdapter.mockReturnValueOnce({})

    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://veloera.example", siteType: SITE_TYPES.VELOERA },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://veloera.example/app/me")
  })

  it("falls back to static route config when account bootstrap has no route resolver", async () => {
    mockGetSiteAdapter.mockReturnValueOnce({
      accountBootstrap: {
        fetchSiteStatus: mockFetchSiteStatus,
      },
    })

    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://veloera.example", siteType: SITE_TYPES.VELOERA },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://veloera.example/app/me")
    expect(mockResolveRoutePath).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })

  it("resolves login URLs through the route resolver when a site type hint is available", async () => {
    mockDefaultNewApiThemeStatus()

    await expect(
      resolveAccountSiteLoginUrl(
        "https://new-api.example/dashboard",
        SITE_TYPES.NEW_API,
      ),
    ).resolves.toBe("https://new-api.example/sign-in")
  })

  it("uses best-effort login routing when no site type hint is available", async () => {
    await expect(
      resolveAccountSiteLoginUrl("https://unknown.example/dashboard"),
    ).resolves.toBe("https://unknown.example/login")
    expect(getBestEffortLoginUrl("not-a-url")).toBe("not-a-url")
    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })

  it("bounds cached New API theme probes for many account sites", async () => {
    mockFetchSiteStatus.mockRejectedValue(new Error("offline"))

    for (let index = 0; index < 101; index += 1) {
      await resolveAccountSiteRouteUrl(
        {
          baseUrl: `https://new-api-${index}.example`,
          siteType: SITE_TYPES.NEW_API,
        },
        SITE_ROUTE_KINDS.Usage,
      )
    }

    await resolveAccountSiteRouteUrl(
      { baseUrl: "https://new-api-0.example", siteType: SITE_TYPES.NEW_API },
      SITE_ROUTE_KINDS.Usage,
    )
    await resolveAccountSiteRouteUrl(
      { baseUrl: "https://new-api-100.example", siteType: SITE_TYPES.NEW_API },
      SITE_ROUTE_KINDS.Usage,
    )

    expect(mockFetchSiteStatus).toHaveBeenCalledTimes(102)
  })

  it("keeps AIHubMix login routing centralized in the route resolver", async () => {
    await expect(
      resolveAccountSiteLoginUrl(
        "https://aihubmix.com/statistics",
        SITE_TYPES.AIHUBMIX,
      ),
    ).resolves.toBe("https://console.aihubmix.com/sign-in")
    expect(
      getBestEffortLoginUrl("https://console.aihubmix.com/statistics"),
    ).toBe("https://console.aihubmix.com/sign-in")
    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })
})
