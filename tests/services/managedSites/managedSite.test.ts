import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteConfigRegistration } from "~/services/managedSites/configuration/configRegistration"
import {
  getManagedSiteNoChannelsToSyncMessage,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"

describe("supportsManagedSiteBaseUrlChannelLookup", () => {
  it("uses Magpie's own empty-sync message", () => {
    const t = ((key: string) => key) as TFunction
    expect(getManagedSiteNoChannelsToSyncMessage(t, "magpie")).toBe(
      "messages:magpie.noChannelsToSync",
    )
  })

  it.each(["not a URL", "file:///web", "https://user:password@magpie.test"])(
    "rejects an unsafe Magpie management address (%s)",
    (baseUrl) => {
      expect(
        getManagedSiteConfigRegistration("magpie")!.resolve({
          ...DEFAULT_PREFERENCES,
          magpie: { baseUrl, webKey: "web-key" },
        }),
      ).toBeNull()
    },
  )
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
