import { describe, expect, it } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  managedSiteCoreSearchControls,
  managedSiteCoreSearchSections,
} from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteCore.search"

describe("managed-site core settings search definitions", () => {
  it("routes deployment searches to documentation rather than the type selector", () => {
    const docs = managedSiteCoreSearchControls.find(
      (item) => item.id === "control:managed-site-deployment-docs",
    )
    const selector = managedSiteCoreSearchControls.find(
      (item) => item.id === "control:managed-site-type",
    )
    expect(docs?.titleKey).toBe("settings:managedSite.deploymentDocs")
    expect(docs?.targetId).toBe(SETTINGS_ANCHORS.MANAGED_SITE_DEPLOYMENT_DOCS)
    expect(
      BASIC_SETTINGS_ANCHOR_TO_TAB[
        SETTINGS_ANCHORS.MANAGED_SITE_DEPLOYMENT_DOCS
      ],
    ).toBe("managedSite")
    expect(docs?.keywords).toEqual(expect.arrayContaining(["deploy", "部署"]))
    for (const keyword of ["deploy", "部署", "get started", "入门"]) {
      expect(selector?.keywords).not.toContain(keyword)
    }
    expect(docs?.keywords).not.toContain("入门")
    expect(docs?.keywords).not.toContain("get started")
  })

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
