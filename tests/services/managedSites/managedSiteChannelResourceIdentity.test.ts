import { describe, expect, it } from "vitest"

import {
  getManagedSiteChannelNavigationId,
  getManagedSiteChannelResourceId,
  getStableLegacyChannelId,
} from "~/services/managedSites/managedSiteChannelResourceIdentity"
import type { ManagedSiteChannel } from "~/types/managedSite"

describe("managed-site channel resource identity", () => {
  it("uses the AxonHub native id but never treats its numeric projection as legacy evidence", () => {
    const channel = {
      id: 42,
      _axonHubData: { id: "native-provider-id" },
    } as unknown as ManagedSiteChannel

    expect(getManagedSiteChannelResourceId("axonhub", channel)).toBe(
      "native-provider-id",
    )
    expect(getStableLegacyChannelId("axonhub", channel)).toBeNull()
    expect(getManagedSiteChannelNavigationId("axonhub", channel)).toBe(
      "native-provider-id",
    )
  })

  it("falls back to the row id when AxonHub native detail is unavailable", () => {
    const channel = { id: 42 } as ManagedSiteChannel

    expect(getManagedSiteChannelResourceId("axonhub", channel)).toBe(42)
    expect(
      getManagedSiteChannelNavigationId("axonhub", channel),
    ).toBeUndefined()
  })

  it.each([
    "new-api",
    "Veloera",
    "done-hub",
    "octopus",
    "claude-code-hub",
    "sub2api",
  ] as const)("uses the stable row id for %s", (siteType) => {
    const channel = { id: 9 } as ManagedSiteChannel

    expect(getManagedSiteChannelResourceId(siteType, channel)).toBe(9)
    expect(getStableLegacyChannelId(siteType, channel)).toBe(9)
    expect(getManagedSiteChannelNavigationId(siteType, channel)).toBe(9)
  })
})
