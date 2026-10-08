import { describe, expect, it } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { sub2ApiSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteSub2Api.search"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("Sub2API managed-site settings search definitions", () => {
  it("maps every rendered setting to its shared target ID", () => {
    expect(atIndex(sub2ApiSettingsSearch.sections, 0).targetId).toBe(
      SETTINGS_ANCHORS.SUB2API,
    )
    expect(
      sub2ApiSettingsSearch.controls.map((definition) => definition.targetId),
    ).toEqual([
      SETTINGS_ANCHORS.SUB2API_BASE_URL,
      SETTINGS_ANCHORS.SUB2API_ADMIN_CREDENTIALS_LINK,
      SETTINGS_ANCHORS.SUB2API_ADMIN_API_KEY,
      SETTINGS_ANCHORS.SUB2API_VALIDATE,
      SETTINGS_ANCHORS.SUB2API_DEFAULT_SCOPE,
    ])
  })

  it("shows the entries only for the Sub2API managed-site selection", () => {
    const visibility = atIndex(sub2ApiSettingsSearch.controls, 0).isVisible!
    expect(visibility({ managedSiteType: SITE_TYPES.SUB2API } as any)).toBe(
      true,
    )
    expect(visibility({ managedSiteType: SITE_TYPES.NEW_API } as any)).toBe(
      false,
    )
  })
})
