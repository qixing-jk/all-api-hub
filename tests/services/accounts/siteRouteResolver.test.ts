import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  clearSiteRouteThemeCacheForTests,
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"

describe("siteRouteResolver", () => {
  beforeEach(() => {
    clearSiteRouteThemeCacheForTests()
    vi.restoreAllMocks()
  })

  it("uses New API default frontend routes when /api/status reports the default theme", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { theme: "default" },
      }),
    } as Response)

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
})
