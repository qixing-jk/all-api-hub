import { describe, expect, it } from "vitest"

import { DONE_HUB, NEW_API, OCTOPUS, VELOERA } from "~/constants/siteType"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"

describe("supportsManagedSiteBaseUrlChannelLookup", () => {
  it("returns true for managed-site providers with reliable base-url lookup", () => {
    expect(supportsManagedSiteBaseUrlChannelLookup(NEW_API)).toBe(true)
    expect(supportsManagedSiteBaseUrlChannelLookup(DONE_HUB)).toBe(true)
    expect(supportsManagedSiteBaseUrlChannelLookup(OCTOPUS)).toBe(true)
  })

  it("returns false for Veloera", () => {
    expect(supportsManagedSiteBaseUrlChannelLookup(VELOERA)).toBe(false)
  })
})
