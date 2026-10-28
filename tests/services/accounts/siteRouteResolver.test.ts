import { beforeEach, describe, expect, it, vi } from "vitest"

import { getAccountSiteApiRouter, SITE_TYPES } from "~/constants/siteType"
import {
  getBestEffortLoginUrl,
  getStaticAccountSiteRouteUrl,
  resolveAccountSiteLoginUrl,
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import {
  clearSiteRouteFactsCacheForTests,
  resolveNewApiAccountRoutePath,
} from "~/services/apiAdapters/newApi/account/accountRoutes"
import { AuthTypeEnum } from "~/types"

const {
  mockFetchApi,
  mockLoadBootstrapFacts,
  mockgetSiteTypeCapabilities,
  mockResolveRoutePath,
} = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
  mockLoadBootstrapFacts: vi.fn(),
  mockgetSiteTypeCapabilities: vi.fn(),
  mockResolveRoutePath: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({ fetchApi: mockFetchApi }))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: mockgetSiteTypeCapabilities,
}))

describe("siteRouteResolver", () => {
  it("resolves account token acquisition separately from administrator credentials when pages differ", async () => {
    await expect(
      resolveAccountSiteRouteUrl(
        {
          baseUrl: "https://vercel.com",
          siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
        },
        SITE_ROUTE_KINDS.AccessToken,
      ),
    ).resolves.toBe("https://vercel.com/account/settings/tokens")
  })
  beforeEach(() => {
    mockFetchApi.mockReset().mockRejectedValue(new Error("unavailable"))
    clearSiteRouteFactsCacheForTests()
    vi.restoreAllMocks()
    mockLoadBootstrapFacts.mockReset()
    mockgetSiteTypeCapabilities.mockReset()
    mockResolveRoutePath.mockReset()
    mockResolveRoutePath.mockImplementation((target, route) =>
      resolveNewApiAccountRoutePath(target, route, {
        loadBootstrapFacts: mockLoadBootstrapFacts,
      }),
    )
    mockgetSiteTypeCapabilities.mockReturnValue({
      account: {
        bootstrap: {
          loadBootstrapFacts: mockLoadBootstrapFacts,
          resolveRoutePath: mockResolveRoutePath,
        },
      },
    })
  })

  it.each([
    [SITE_TYPES.ONE_API, SITE_ROUTE_KINDS.Redeem, "/topup"],
    [SITE_TYPES.ONE_API, SITE_ROUTE_KINDS.Usage, "/log"],
    [SITE_TYPES.ONE_API, SITE_ROUTE_KINDS.AdminCredentials, "/user/edit"],
    [SITE_TYPES.APIYI, SITE_ROUTE_KINDS.Redeem, "/account/topup/recharge"],
    [SITE_TYPES.OPENROUTER, SITE_ROUTE_KINDS.Login, "/sign-in"],
    [SITE_TYPES.OPENROUTER, SITE_ROUTE_KINDS.Usage, "/activity"],
    [SITE_TYPES.OPENROUTER, SITE_ROUTE_KINDS.Redeem, "/settings/credits"],
  ])(
    "resolves %s %s using its registered page",
    async (siteType, route, path) => {
      await expect(
        resolveAccountSiteRouteUrl(
          { baseUrl: "https://site.example/", siteType },
          route,
        ),
      ).resolves.toBe(`https://site.example${path}`)
      expect(mockLoadBootstrapFacts).not.toHaveBeenCalled()
    },
  )

  it("provides static navigation destinations without probing the site", () => {
    const target = {
      baseUrl: " https://new-api.example/// ",
      siteType: SITE_TYPES.NEW_API,
    }
    expect(getStaticAccountSiteRouteUrl(target, SITE_ROUTE_KINDS.CheckIn)).toBe(
      "https://new-api.example/console/personal",
    )
    expect(
      getStaticAccountSiteRouteUrl(
        { ...target, siteType: SITE_TYPES.SHAREDCHAT },
        SITE_ROUTE_KINDS.Redeem,
      ),
    ).toBeNull()
    expect(mockgetSiteTypeCapabilities).not.toHaveBeenCalled()
  })

  it.each([SITE_ROUTE_KINDS.CheckIn, SITE_ROUTE_KINDS.Redeem])(
    "honors the same custom destination for static and resolved %s navigation",
    async (route) => {
      const target = {
        baseUrl: "https://sharedchat.example",
        siteType: SITE_TYPES.SHAREDCHAT,
      }
      const customUrl = "https://custom.example/action"
      expect(getStaticAccountSiteRouteUrl(target, route, customUrl)).toBe(
        customUrl,
      )
      await expect(
        resolveAccountSiteRouteUrl(target, route, customUrl),
      ).resolves.toBe(customUrl)
      expect(mockgetSiteTypeCapabilities).not.toHaveBeenCalled()
    },
  )

  it("keeps dynamic route resolution when the custom destination is empty", async () => {
    mockResolveRoutePath.mockResolvedValueOnce("/wallet")
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.Redeem,
        "",
      ),
    ).resolves.toBe("https://new-api.example/wallet")
  })

  it("keeps best-effort canonical-host routing independent of the supplied protocol", () => {
    expect(getBestEffortLoginUrl("ftp://aihubmix.com/path")).toBe(
      "https://console.aihubmix.com/sign-in",
    )
  })

  const mockDefaultNewApiThemeStatus = () =>
    mockLoadBootstrapFacts.mockResolvedValue({
      frontendTheme: "default",
    })

  it("shares New API's declared token page with administrator credential acquisition", async () => {
    mockDefaultNewApiThemeStatus()
    const target = {
      baseUrl: "https://new-api.example",
      siteType: SITE_TYPES.NEW_API,
    }
    const routes = getAccountSiteApiRouter(SITE_TYPES.NEW_API)
    expect(routes.accessTokenPath).toBe(routes.adminCredentialsPath)
    expect(
      getStaticAccountSiteRouteUrl(target, SITE_ROUTE_KINDS.AdminCredentials),
    ).toBe("https://new-api.example/security#security-access")
    await expect(
      resolveAccountSiteRouteUrl(target, SITE_ROUTE_KINDS.AdminCredentials),
    ).resolves.toBe("https://new-api.example/security#security-access")
  })

  it.each([SITE_ROUTE_KINDS.AdminCredentials, SITE_ROUTE_KINDS.AccessToken])(
    "detects the registered profile route for %s on an arbitrary deployment",
    async (route) => {
      mockFetchApi
        .mockResolvedValueOnce(
          '<script src="/static/js/index.123.js"></script>',
        )
        .mockResolvedValueOnce('createFileRoute("/_authenticated/profile/")')
      await expect(
        resolveAccountSiteRouteUrl(
          { baseUrl: "https://custom.example", siteType: SITE_TYPES.NEW_API },
          route,
        ),
      ).resolves.toBe("https://custom.example/profile")
    },
  )

  it("prefers the registered security page when the frontend also has a profile page", async () => {
    mockFetchApi
      .mockResolvedValueOnce(
        '<script type="module" src="/assets/index.123.js"></script>',
      )
      .mockResolvedValueOnce(
        'createFileRoute("/_authenticated/profile/");createFileRoute("/_authenticated/security/")',
      )
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://custom.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe("https://custom.example/security#security-access")
  })

  it("does not treat a 200 SPA shell or unrelated security route as page evidence", async () => {
    mockFetchApi
      .mockResolvedValueOnce('<script src="/assets/index.js"></script>')
      .mockResolvedValueOnce('path:"/security/"; text:"profile"')
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://custom.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe("https://custom.example/security#security-access")
    expect(mockFetchApi).toHaveBeenCalledTimes(2)
  })

  it("reuses confirmed page evidence for the same deployment", async () => {
    mockFetchApi
      .mockResolvedValueOnce('<script src="/assets/index.js"></script>')
      .mockResolvedValueOnce('"/_authenticated/profile/"')
    const target = {
      baseUrl: "https://cached.example",
      siteType: SITE_TYPES.NEW_API,
    }
    await expect(
      resolveAccountSiteRouteUrl(target, SITE_ROUTE_KINDS.AdminCredentials),
    ).resolves.toBe("https://cached.example/profile")
    await expect(
      resolveAccountSiteRouteUrl(target, SITE_ROUTE_KINDS.AdminCredentials),
    ).resolves.toBe("https://cached.example/profile")
    expect(mockFetchApi).toHaveBeenCalledTimes(2)
    expect(mockFetchApi).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseUrl: "https://cached.example" }),
      expect.objectContaining({ endpoint: "/assets/index.js" }),
      true,
    )
  })

  it("ignores external entry scripts and does not cache inconclusive evidence", async () => {
    mockFetchApi.mockResolvedValue(
      '<script src="https://cdn.example/index.js"></script>',
    )
    const target = {
      baseUrl: "https://unknown.example",
      siteType: SITE_TYPES.NEW_API,
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        resolveAccountSiteRouteUrl(target, SITE_ROUTE_KINDS.AdminCredentials),
      ).resolves.toBe("https://unknown.example/security#security-access")
    }
    expect(mockFetchApi).toHaveBeenCalledTimes(2)
    expect(
      mockFetchApi.mock.calls.every(
        ([request]) => request.baseUrl === "https://unknown.example",
      ),
    ).toBe(true)
  })

  it("keeps credential navigation independent of an unavailable theme probe", async () => {
    mockLoadBootstrapFacts.mockRejectedValue(new Error("offline"))
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe("https://new-api.example/security#security-access")
    expect(mockLoadBootstrapFacts).not.toHaveBeenCalled()
  })

  it("does not apply the Gemai page override to a hostname with a similar prefix", async () => {
    await expect(
      resolveAccountSiteRouteUrl(
        {
          baseUrl: "https://api2.gemai.cc.example.invalid",
          siteType: SITE_TYPES.NEW_API,
        },
        SITE_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe(
      "https://api2.gemai.cc.example.invalid/security#security-access",
    )
  })

  it("does not turn an unsupported SharedChat redemption page into a default URL", async () => {
    await expect(
      resolveAccountSiteRouteUrl(
        {
          baseUrl: "https://new.sharedchat.cc",
          siteType: SITE_TYPES.SHAREDCHAT,
        },
        SITE_ROUTE_KINDS.Redeem,
      ),
    ).resolves.toBeNull()
  })

  it("does not restore an unsupported page through a frontend theme fallback", async () => {
    mockResolveRoutePath.mockResolvedValueOnce(null)
    mockDefaultNewApiThemeStatus()
    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
        SITE_ROUTE_KINDS.Redeem,
      ),
    ).resolves.toBeNull()
    expect(mockLoadBootstrapFacts).not.toHaveBeenCalled()
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
    ).resolves.toBe("https://new-api.example/security#security-access")
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
    expect(mockLoadBootstrapFacts).toHaveBeenCalledWith({
      baseUrl: "https://new-api.example",
      auth: { authType: AuthTypeEnum.None },
    })
    expect(mockResolveRoutePath).toHaveBeenCalledWith(
      { baseUrl: "https://new-api.example", siteType: SITE_TYPES.NEW_API },
      SITE_ROUTE_KINDS.CheckIn,
    )
  })

  it("keeps classic New API routes when /api/status is unavailable", async () => {
    mockLoadBootstrapFacts.mockRejectedValue(new Error("offline"))

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

    expect(mockLoadBootstrapFacts).not.toHaveBeenCalled()
  })

  it("falls back to static route config when account bootstrap is missing", async () => {
    mockgetSiteTypeCapabilities.mockReturnValueOnce({})

    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://veloera.example", siteType: SITE_TYPES.VELOERA },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://veloera.example/app/me")
  })

  it("falls back to static route config when account bootstrap has no route resolver", async () => {
    mockgetSiteTypeCapabilities.mockReturnValueOnce({
      account: {
        bootstrap: {
          loadBootstrapFacts: mockLoadBootstrapFacts,
        },
      },
    })

    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://veloera.example", siteType: SITE_TYPES.VELOERA },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://veloera.example/app/me")
    expect(mockResolveRoutePath).not.toHaveBeenCalled()
    expect(mockLoadBootstrapFacts).not.toHaveBeenCalled()
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
    expect(mockLoadBootstrapFacts).not.toHaveBeenCalled()
  })

  it("bounds cached New API theme probes for many account sites", async () => {
    mockLoadBootstrapFacts.mockRejectedValue(new Error("offline"))

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

    expect(mockLoadBootstrapFacts).toHaveBeenCalledTimes(102)
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
    expect(mockLoadBootstrapFacts).not.toHaveBeenCalled()
  })
})
