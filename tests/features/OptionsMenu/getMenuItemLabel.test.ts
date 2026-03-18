import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  type OptionsPageMenuItemId,
} from "~/constants/optionsMenuIds"
import { getMenuItemLabel } from "~/features/OptionsMenu/getMenuItemLabel"

const t = ((key: string) => key) as unknown as TFunction

describe("getMenuItemLabel", () => {
  it("returns translation keys for known production and dev menu ids", () => {
    expect(getMenuItemLabel(t, MENU_ITEM_IDS.BASIC)).toBe("ui:navigation.basic")
    expect(getMenuItemLabel(t, DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB)).toBe(
      "ui:navigation.meshGradientLab",
    )
  })

  it("throws for unexpected runtime menu ids", () => {
    expect(() =>
      getMenuItemLabel(t, "legacy-menu-id" as OptionsPageMenuItemId),
    ).toThrow("Unexpected menu item id: legacy-menu-id")
  })
})
