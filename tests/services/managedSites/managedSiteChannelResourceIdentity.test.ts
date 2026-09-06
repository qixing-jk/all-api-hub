import { describe, expect, it } from "vitest"

import { getManagedSiteChannelNavigationId } from "~/services/managedSites/managedSiteChannelResourceIdentity"
import type { ManagedSiteChannel } from "~/types/managedSite"

describe("managed-site channel resource identity", () => {
  it("uses the embedded AxonHub native id for navigation", () => {
    const channel = {
      id: 42,
      _axonHubData: { id: "native-provider-id" },
    } as unknown as ManagedSiteChannel

    expect(getManagedSiteChannelNavigationId("axonhub", channel)).toBe(
      "native-provider-id",
    )
  })

  it("rejects an AxonHub numeric projection without native detail", () => {
    const channel = { id: 42 } as ManagedSiteChannel

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

    expect(getManagedSiteChannelNavigationId(siteType, channel)).toBe(9)
  })
})
