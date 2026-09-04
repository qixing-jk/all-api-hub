import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { buildPageSectionDefinition } from "~/entrypoints/options/search/registryHelpers"

import { PRODUCT_TOUR_REPLAY_TARGET_ID } from "./constants"

export const productTourSearchSections = [
  buildPageSectionDefinition(
    "section:about:product-tour",
    MENU_ITEM_IDS.ABOUT,
    PRODUCT_TOUR_REPLAY_TARGET_ID,
    "productTour:replay.title",
    1900,
    {
      descriptionKey: "productTour:replay.description",
      keywordKeys: [
        "productTour:search.keywords.guide",
        "productTour:search.keywords.introduction",
        "productTour:search.keywords.tour",
      ],
    },
  ),
]
