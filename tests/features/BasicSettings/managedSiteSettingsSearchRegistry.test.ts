import { describe, expect, it } from "vitest"

import { MANAGED_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import { defineManagedSiteSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/defineManagedSiteSettingsSearch"
import {
  managedSiteSearchControls,
  managedSiteSearchSections,
} from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSite.search"
import {
  managedSiteSettingsSearchModules,
  resolveManagedSiteSettingsPanelId,
} from "~/features/BasicSettings/components/tabs/ManagedSite/managedSiteSettingsSearchRegistry"
import type { OptionsSearchContext } from "~/features/OptionsSearch/types"

const context: OptionsSearchContext = {
  autoCheckinEnabled: false,
  hasOptionalPermissions: false,
  managedSiteType: SITE_TYPES.NEW_API,
  modelRedirectEnabled: false,
  sidePanelSupported: false,
  showTodayCashflow: false,
  webdavAutoSyncEnabled: false,
}

describe("managed-site settings ownership", () => {
  it("selects exactly one settings owner for every managed site type", () => {
    const modules = Object.values(managedSiteSettingsSearchModules)
    expect(modules.map((module) => module.siteType).sort()).toEqual(
      [...MANAGED_SITE_TYPES].sort(),
    )
    for (const siteType of MANAGED_SITE_TYPES) {
      const selected =
        managedSiteSettingsSearchModules[
          resolveManagedSiteSettingsPanelId(siteType)
        ]
      expect(selected.siteType).toBe(siteType)
      for (const module of modules) {
        for (const item of [...module.sections, ...module.controls]) {
          expect(
            item.isVisible({ ...context, managedSiteType: siteType }),
          ).toBe(module === selected)
        }
      }
    }
  })

  it("publishes each declared panel's search targets exactly once", () => {
    const items = [...managedSiteSearchSections, ...managedSiteSearchControls]
    const ids = items.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const module of Object.values(managedSiteSettingsSearchModules)) {
      for (const item of [...module.sections, ...module.controls]) {
        expect(items).toContain(item)
      }
    }
  })

  it("preserves additional visibility conditions within the selected settings owner", () => {
    const module = defineManagedSiteSettingsSearch(
      SITE_TYPES.NEW_API,
      [],
      [
        {
          id: "control:conditional",
          kind: "control",
          pageId: "basicSettings",
          titleKey: "test",
          breadcrumbsKeys: [],
          keywords: [],
          order: 1,
          isVisible: (state) => state.modelRedirectEnabled,
        },
      ],
    )
    const item = module.controls[0]!
    expect(item.isVisible(context)).toBe(false)
    expect(item.isVisible({ ...context, modelRedirectEnabled: true })).toBe(
      true,
    )
    expect(
      item.isVisible({
        ...context,
        modelRedirectEnabled: true,
        managedSiteType: SITE_TYPES.DONE_HUB,
      }),
    ).toBe(false)
  })
})
