import { describe, expect, it } from "vitest"

import ManagedSiteChannelsRoute, {
  ManagedSiteChannelsRoute as NamedManagedSiteChannelsRoute,
} from "~/features/ManagedSiteChannels"

describe("ManagedSiteChannels public entrypoint", () => {
  it("keeps route as the default with the same named route export", () => {
    expect(ManagedSiteChannelsRoute).toBe(NamedManagedSiteChannelsRoute)
  })
})
