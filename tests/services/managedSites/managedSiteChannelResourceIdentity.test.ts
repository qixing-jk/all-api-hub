import { describe, expect, it } from "vitest"

import { getManagedSiteChannelNavigationId } from "~/services/managedSites/managedSiteChannelResourceIdentity"

describe("managed-site channel resource identity", () => {
  it("uses the AxonHub native id directly for navigation", () => {
    const channel = {
      id: "native-provider-id",
    }

    expect(getManagedSiteChannelNavigationId("axonhub", channel)).toBe(
      "native-provider-id",
    )
  })

  it("rejects an AxonHub numeric projection even when it contains legacy metadata", () => {
    const channel = { id: 42, _axonHubData: { id: "native-provider-id" } }

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
    const channel = { id: 9 }

    expect(getManagedSiteChannelNavigationId(siteType, channel)).toBe(9)
  })
})
