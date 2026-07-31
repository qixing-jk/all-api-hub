import { afterEach, describe, expect, it, vi } from "vitest"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  OPTIONS_MENU_CATEGORY_IDS,
} from "~/constants/optionsMenuIds"
import { menuItems } from "~/entrypoints/options/constants"

describe("options menu items", () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock("~/utils/core/environment")
  })

  it("places Settings before Import/Export in the System section", () => {
    const systemMenuItemIds = menuItems
      .filter((item) => item.category === OPTIONS_MENU_CATEGORY_IDS.SYSTEM)
      .map((item) => item.id)

    expect(systemMenuItemIds).toEqual([
      MENU_ITEM_IDS.BASIC,
      MENU_ITEM_IDS.IMPORT_EXPORT,
      MENU_ITEM_IDS.ABOUT,
    ])
  })

  it("adds developer preview pages only in development mode", async () => {
    vi.resetModules()
    vi.doMock("~/utils/core/environment", async (importOriginal) => ({
      ...(await importOriginal<typeof import("~/utils/core/environment")>()),
      isDevelopmentMode: () => true,
    }))

    const { menuItems: developmentMenuItems } = await import(
      "~/entrypoints/options/constants"
    )

    expect(developmentMenuItems.map((item) => item.id)).toContain(
      DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB,
    )
    expect(developmentMenuItems.map((item) => item.id)).toContain(
      DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW,
    )
  })

  it("keeps developer preview pages out of production menu items", async () => {
    vi.resetModules()
    vi.doMock("~/utils/core/environment", async (importOriginal) => ({
      ...(await importOriginal<typeof import("~/utils/core/environment")>()),
      isDevelopmentMode: () => false,
    }))

    const { menuItems: productionMenuItems } = await import(
      "~/entrypoints/options/constants"
    )

    expect(productionMenuItems.map((item) => item.id)).not.toContain(
      DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB,
    )
    expect(productionMenuItems.map((item) => item.id)).not.toContain(
      DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW,
    )
  })
})
