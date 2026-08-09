import { describe, expect, it } from "vitest"

import {
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
  })

  it("falls back to the row id when AxonHub native detail is unavailable", () => {
    const channel = { id: 42 } as ManagedSiteChannel

    expect(getManagedSiteChannelResourceId("axonhub", channel)).toBe(42)
  })

  it("uses the stable row id for managed-site families with native numeric ids", () => {
    const channel = { id: 9 } as ManagedSiteChannel

    expect(getManagedSiteChannelResourceId("new-api", channel)).toBe(9)
    expect(getStableLegacyChannelId("new-api", channel)).toBe(9)
  })
})
