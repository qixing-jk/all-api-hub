import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildManagedSiteChannelConsoleUrl } from "~/services/managedSites/managedSiteConsoleRoutes"

describe("managed site console routes", () => {
  it.each([
    [SITE_TYPES.NEW_API, "/channels"],
    [SITE_TYPES.SUB2API, "/admin/accounts"],
    [SITE_TYPES.VELOERA, "/admin/channels"],
    [SITE_TYPES.DONE_HUB, "/panel/channel"],
    [SITE_TYPES.OCTOPUS, "/model"],
    [SITE_TYPES.AXON_HUB, "/channels"],
    [SITE_TYPES.CLAUDE_CODE_HUB, "/settings/providers"],
  ])("builds the verified channel route for %s", (siteType, path) => {
    expect(
      buildManagedSiteChannelConsoleUrl(
        "https://gateway.example.invalid/root/",
        siteType,
      ),
    ).toBe(`https://gateway.example.invalid/root${path}`)
  })

  it("preserves HTTP LAN deployments and their configured base paths", () => {
    expect(
      buildManagedSiteChannelConsoleUrl(
        "http://192.168.1.2:3000/root/",
        SITE_TYPES.SUB2API,
      ),
    ).toBe("http://192.168.1.2:3000/root/admin/accounts")
  })

  it("normalizes a configured host that omits the URL scheme", () => {
    expect(
      buildManagedSiteChannelConsoleUrl(
        "gateway.example.invalid",
        SITE_TYPES.NEW_API,
      ),
    ).toBe("https://gateway.example.invalid/channels")
  })

  it.each(["", "   ", "/relative/path", "javascript:alert(1)"])(
    "does not build console routes from an invalid base URL %j",
    (baseUrl) => {
      expect(
        buildManagedSiteChannelConsoleUrl(baseUrl, SITE_TYPES.NEW_API),
      ).toBeNull()
    },
  )

  it("fails loudly when a managed site has no registered console routes", () => {
    expect(() =>
      buildManagedSiteChannelConsoleUrl(
        "https://gateway.example.invalid",
        SITE_TYPES.AIHUBMIX as never,
      ),
    ).toThrow("Managed site AIHubMix is missing console routes")
  })
})
