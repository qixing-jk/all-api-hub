import { describe, expect, it } from "vitest"

import {
  MENU_ITEM_IDS,
  OPTIONS_MENU_CATEGORY_IDS,
} from "~/constants/optionsMenuIds"
import { menuItems } from "~/entrypoints/options/constants"

describe("options menu items", () => {
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
})
