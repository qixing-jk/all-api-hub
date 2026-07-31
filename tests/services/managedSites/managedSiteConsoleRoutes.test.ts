import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildManagedSiteChannelConsoleUrl,
  buildManagedSiteTokenConsoleUrl,
} from "~/services/managedSites/managedSiteConsoleRoutes"

describe("managed site console routes", () => {
  it.each([
    [SITE_TYPES.NEW_API, "/channels"],
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

  it.each([
    [SITE_TYPES.NEW_API, "/keys"],
    [SITE_TYPES.VELOERA, "/app/tokens"],
    [SITE_TYPES.DONE_HUB, "/panel/token"],
    [SITE_TYPES.OCTOPUS, "/keys"],
    [SITE_TYPES.AXON_HUB, "/api-keys"],
    [SITE_TYPES.CLAUDE_CODE_HUB, "/dashboard/users"],
  ])("builds the verified token route for %s", (siteType, path) => {
    expect(
      buildManagedSiteTokenConsoleUrl(
        "https://gateway.example.invalid",
        siteType,
      ),
    ).toBe(`https://gateway.example.invalid${path}`)
  })

  it("normalizes a configured host that omits the URL scheme", () => {
    expect(
      buildManagedSiteChannelConsoleUrl(
        "gateway.example.invalid",
        SITE_TYPES.NEW_API,
      ),
    ).toBe("https://gateway.example.invalid/channels")
  })
})
