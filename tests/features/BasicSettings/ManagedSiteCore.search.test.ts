import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  managedSiteCoreSearchControls,
  managedSiteCoreSearchSections,
} from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteCore.search"

describe("managed-site core settings search definitions", () => {
  it("keeps the model-sync section discoverable while hiding unsupported controls", () => {
    const section = managedSiteCoreSearchSections.find(
      (definition) => definition.id === "section:managed-site-model-sync",
    )
    const enableControl = managedSiteCoreSearchControls.find(
      (definition) =>
        definition.id === "control:managed-site-model-sync-enable",
    )

    expect(section?.isVisible).toBeUndefined()
    expect(
      enableControl?.isVisible?.({
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      } as any),
    ).toBe(false)
  })
})
