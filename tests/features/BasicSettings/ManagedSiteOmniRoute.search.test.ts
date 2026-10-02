import { describe, expect, it } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  managedSiteOmniRouteSearchControls,
  managedSiteOmniRouteSearchSections,
} from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteOmniRoute.search"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("OmniRoute managed-site settings search definitions", () => {
  it("maps every rendered setting to its shared target ID", () => {
    expect(atIndex(managedSiteOmniRouteSearchSections, 0).targetId).toBe(
      SETTINGS_ANCHORS.OMNIROUTE,
    )
    expect(
      managedSiteOmniRouteSearchControls.map(
        (definition) => definition.targetId,
      ),
    ).toEqual([
      SETTINGS_ANCHORS.OMNIROUTE_BASE_URL,
      SETTINGS_ANCHORS.OMNIROUTE_CREDENTIAL,
      SETTINGS_ANCHORS.OMNIROUTE_TOKENS_LINK,
      SETTINGS_ANCHORS.OMNIROUTE_VALIDATE,
    ])
  })

  it("shows the entries only for the OmniRoute managed-site selection", () => {
    const visibility = atIndex(managedSiteOmniRouteSearchControls, 0).isVisible!
    expect(visibility({ managedSiteType: SITE_TYPES.OMNIROUTE } as any)).toBe(
      true,
    )
    expect(visibility({ managedSiteType: SITE_TYPES.NEW_API } as any)).toBe(
      false,
    )
  })
})
