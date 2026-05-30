import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  clearSiteRouteThemeCacheForTests,
  getBestEffortLoginUrl,
  resolveAccountSiteLoginUrl,
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"

describe("siteRouteResolver", () => {
  beforeEach(() => {
    clearSiteRouteThemeCacheForTests()
    vi.restoreAllMocks()
  })

  const mockDefaultNewApiThemeStatus = () =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "",
          data: { theme: "default" },
        }),
        {
          headers: { "content-type": "application/json" },
        },
      ),
    )

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
  })

  it("keeps classic New API routes when /api/status is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))

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
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(
      resolveAccountSiteRouteUrl(
        { baseUrl: "https://veloera.example", siteType: SITE_TYPES.VELOERA },
        SITE_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("https://veloera.example/app/me")

    expect(fetchSpy).not.toHaveBeenCalled()
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
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(
      resolveAccountSiteLoginUrl("https://unknown.example/dashboard"),
    ).resolves.toBe("https://unknown.example/login")
    expect(getBestEffortLoginUrl("not-a-url")).toBe("not-a-url")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("bounds cached New API theme probes for many account sites", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"))

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

    expect(fetchSpy).toHaveBeenCalledTimes(102)
  })

  it("keeps AIHubMix login routing centralized in the route resolver", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(
      resolveAccountSiteLoginUrl(
        "https://aihubmix.com/statistics",
        SITE_TYPES.AIHUBMIX,
      ),
    ).resolves.toBe("https://console.aihubmix.com/sign-in")
    expect(
      getBestEffortLoginUrl("https://console.aihubmix.com/statistics"),
    ).toBe("https://console.aihubmix.com/sign-in")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
