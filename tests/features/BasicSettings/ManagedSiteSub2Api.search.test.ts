import { describe, expect, it } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  managedSiteSub2ApiSearchControls,
  managedSiteSub2ApiSearchSections,
} from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteSub2Api.search"

describe("Sub2API managed-site settings search definitions", () => {
  it("maps every rendered setting to its shared target ID", () => {
    expect(managedSiteSub2ApiSearchSections[0].targetId).toBe(
      SETTINGS_ANCHORS.SUB2API,
    )
    expect(
      managedSiteSub2ApiSearchControls.map((definition) => definition.targetId),
    ).toEqual([
      SETTINGS_ANCHORS.SUB2API_BASE_URL,
      SETTINGS_ANCHORS.SUB2API_ADMIN_API_KEY,
      SETTINGS_ANCHORS.SUB2API_VALIDATE,
      SETTINGS_ANCHORS.SUB2API_DEFAULT_SCOPE,
    ])
  })

  it("shows the entries only for the Sub2API managed-site selection", () => {
    const visibility = managedSiteSub2ApiSearchControls[0].isVisible!
    expect(visibility({ managedSiteType: SITE_TYPES.SUB2API } as any)).toBe(
      true,
    )
    expect(visibility({ managedSiteType: SITE_TYPES.NEW_API } as any)).toBe(
      false,
    )
  })
})
