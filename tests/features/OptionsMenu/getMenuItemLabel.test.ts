import { describe, expect, it } from "vitest"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  OPTIONS_MENU_CATEGORY_IDS,
} from "~/constants/optionsMenuIds"
import {
  getMenuCategoryLabel,
  getMenuItemLabel,
} from "~/features/OptionsMenu/getMenuItemLabel"

describe("getMenuItemLabel", () => {
  const t = (key: string) => key

  it("returns the expected translation key for every stable menu item", () => {
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.OVERVIEW)).toBe(
      "ui:navigation.overview",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.BASIC)).toBe(
      "ui:navigation.basic",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.ACCOUNT)).toBe(
      "ui:navigation.account",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.BOOKMARK)).toBe(
      "ui:navigation.bookmark",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.AUTO_CHECKIN)).toBe(
      "ui:navigation.autoCheckin",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.USAGE_ANALYTICS)).toBe(
      "ui:navigation.usageAnalytics",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.BALANCE_HISTORY)).toBe(
      "ui:navigation.balanceHistory",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.MODELS)).toBe(
      "ui:navigation.models",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.KEYS)).toBe(
      "ui:navigation.keys",
    )
    expect(
      getMenuItemLabel(t as any, MENU_ITEM_IDS.API_CREDENTIAL_PROFILES),
    ).toBe("ui:navigation.apiCredentialProfiles")
    expect(
      getMenuItemLabel(t as any, MENU_ITEM_IDS.MANAGED_SITE_CHANNELS),
    ).toBe("ui:navigation.managedSiteChannels")
    expect(
      getMenuItemLabel(t as any, MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC),
    ).toBe("ui:navigation.managedSiteModelSync")
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.IMPORT_EXPORT)).toBe(
      "ui:navigation.importExport",
    )
    expect(getMenuItemLabel(t as any, MENU_ITEM_IDS.ABOUT)).toBe(
      "ui:navigation.about",
    )
    expect(
      getMenuItemLabel(t as any, DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB),
    ).toBe("ui:navigation.meshGradientLab")
  })

  it("throws for unexpected menu ids so new routes must be wired explicitly", () => {
    expect(() =>
      getMenuItemLabel(t as any, "unknown-menu-item" as any),
    ).toThrow("Unexpected menu item id: unknown-menu-item")
  })
})

describe("getMenuCategoryLabel", () => {
  const t = (key: string) => key

  it("returns the expected translation key for every menu category", () => {
    expect(
      getMenuCategoryLabel(t as any, OPTIONS_MENU_CATEGORY_IDS.GENERAL),
    ).toBe("ui:navigation.categories.general")
    expect(getMenuCategoryLabel(t as any, OPTIONS_MENU_CATEGORY_IDS.API)).toBe(
      "ui:navigation.categories.api",
    )
    expect(
      getMenuCategoryLabel(t as any, OPTIONS_MENU_CATEGORY_IDS.AUTOMATION),
    ).toBe("ui:navigation.categories.automation")
    expect(
      getMenuCategoryLabel(t as any, OPTIONS_MENU_CATEGORY_IDS.INSIGHTS),
    ).toBe("ui:navigation.categories.insights")
    expect(
      getMenuCategoryLabel(t as any, OPTIONS_MENU_CATEGORY_IDS.SITE_MANAGEMENT),
    ).toBe("ui:navigation.categories.siteManagement")
    expect(
      getMenuCategoryLabel(t as any, OPTIONS_MENU_CATEGORY_IDS.SYSTEM),
    ).toBe("ui:navigation.categories.system")
  })

  it("throws for unexpected category ids so categories must be wired explicitly", () => {
    expect(() =>
      getMenuCategoryLabel(t as any, "unknown-category" as any),
    ).toThrow("Unexpected menu category id: unknown-category")
  })
})
