import { describe, expect, it, vi } from "vitest"

import {
  MENU_ITEM_IDS,
  type OptionsPageMenuItemId,
} from "~/constants/optionsMenuIds"
import { preloadOptionsPage } from "~/entrypoints/options/constants"

vi.mock("~/entrypoints/options/pages/AccountManagement", () => ({
  default: () => null,
}))

describe("preloadOptionsPage", () => {
  it("starts loading a registered lazy page", async () => {
    await expect(
      preloadOptionsPage(MENU_ITEM_IDS.ACCOUNT),
    ).resolves.toBeTruthy()
  })

  it("resolves when the selected page has no lazy preload", async () => {
    await expect(
      preloadOptionsPage(MENU_ITEM_IDS.BASIC),
    ).resolves.toBeUndefined()
  })

  it("resolves without loading a page for an unknown route", async () => {
    await expect(
      preloadOptionsPage("unknown-menu-id" as OptionsPageMenuItemId),
    ).resolves.toBeUndefined()
  })
})
