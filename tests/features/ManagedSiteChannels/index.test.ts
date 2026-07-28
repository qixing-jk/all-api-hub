import { describe, expect, it } from "vitest"

import ManagedSiteChannelsRoute, {
  LegacyManagedSiteChannels,
  ManagedSiteChannelsRoute as NamedManagedSiteChannelsRoute,
} from "~/features/ManagedSiteChannels"

describe("ManagedSiteChannels public entrypoint", () => {
  it("keeps route as the default while preserving named route and legacy exports", () => {
    expect(ManagedSiteChannelsRoute).toBe(NamedManagedSiteChannelsRoute)
    expect(typeof LegacyManagedSiteChannels).toBe("function")
  })
})
