import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { PRODUCT_TOUR_REPLAY_TARGET_ID } from "~/features/ProductTour/constants"
import { productTourSearchSections } from "~/features/ProductTour/ProductTour.search"

describe("product tour search definitions", () => {
  it("routes feature-tour search results to the replay control on About", () => {
    expect(productTourSearchSections).toEqual([
      expect.objectContaining({
        kind: "section",
        pageId: MENU_ITEM_IDS.ABOUT,
        targetId: PRODUCT_TOUR_REPLAY_TARGET_ID,
        titleKey: "productTour:replay.title",
      }),
    ])
  })
})
