import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"

describe("supportsManagedSiteBaseUrlChannelLookup", () => {
  it("returns true for managed-site providers with reliable base-url lookup", () => {
    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.NEW_API)).toBe(
      true,
    )
    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.DONE_HUB)).toBe(
      true,
    )
    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.OCTOPUS)).toBe(
      true,
    )
    expect(
      supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.CLAUDE_CODE_HUB),
    ).toBe(true)
  })

  it("supports Veloera through its registered inventory matching", () => {
    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.VELOERA)).toBe(
      true,
    )
  })
})
