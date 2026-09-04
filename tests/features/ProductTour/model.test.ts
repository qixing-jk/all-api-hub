import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import {
  PRODUCT_TOUR_MOBILE_STEP_IDS,
  PRODUCT_TOUR_STEP_IDS,
  PRODUCT_TOUR_TARGET_ATTRIBUTE,
  PRODUCT_TOUR_TARGETS,
  PRODUCT_TOUR_VERSIONS,
} from "~/features/ProductTour/constants"
import {
  buildProductTourSteps,
  shouldOfferProductTour,
} from "~/features/ProductTour/model"
import {
  PRODUCT_TOUR_OUTCOMES,
  PRODUCT_TOUR_VARIANTS,
} from "~/services/featureGuidance/featureGuidanceState"

describe("product tour model", () => {
  it("offers the current tour only until it is completed or dismissed", () => {
    expect(
      shouldOfferProductTour(undefined, PRODUCT_TOUR_VARIANTS.Expanded),
    ).toBe(true)
    expect(
      shouldOfferProductTour(
        {
          expanded: {
            handledVersion: PRODUCT_TOUR_VERSIONS.expanded - 1,
            outcome: PRODUCT_TOUR_OUTCOMES.Completed,
            handledAt: 1,
          },
        },
        PRODUCT_TOUR_VARIANTS.Expanded,
      ),
    ).toBe(true)
    expect(
      shouldOfferProductTour(
        {
          expanded: {
            handledVersion: PRODUCT_TOUR_VERSIONS.expanded,
            outcome: PRODUCT_TOUR_OUTCOMES.Completed,
            handledAt: 1,
          },
        },
        PRODUCT_TOUR_VARIANTS.Expanded,
      ),
    ).toBe(false)
    expect(
      shouldOfferProductTour(
        {
          compact: {
            handledVersion: PRODUCT_TOUR_VERSIONS.compact,
            outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
            handledAt: 1,
          },
        },
        PRODUCT_TOUR_VARIANTS.Expanded,
      ),
    ).toBe(true)
  })

  it("builds an explanatory step for every options module group", () => {
    const t = vi.fn((key: string) => key)

    const steps = buildProductTourSteps(t as unknown as TFunction, {
      isCompact: false,
    })

    expect(steps.map((step) => step.id)).toEqual(PRODUCT_TOUR_STEP_IDS)
    expect(steps).toHaveLength(7)
    expect(steps[0]).toMatchObject({ placement: "bottom" })
    expect(steps.slice(1).every((step) => step.placement === "right")).toBe(
      true,
    )
  })

  it("builds a three-step compact tour that prepares real mobile surfaces", async () => {
    const t = vi.fn((key: string) => key)
    const prepareMobileSurface = vi.fn().mockResolvedValue(undefined)

    const steps = buildProductTourSteps(t as unknown as TFunction, {
      isCompact: true,
      prepareMobileSurface,
    })

    expect(steps.map((step) => step.id)).toEqual(PRODUCT_TOUR_MOBILE_STEP_IDS)
    expect(steps.map((step) => step.target)).toEqual([
      `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.MobileMenu}"]`,
      `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.Navigation}"]`,
      `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${PRODUCT_TOUR_TARGETS.Content}"]`,
    ])

    await steps[0]!.before?.({} as never)
    await steps[1]!.before?.({} as never)
    await steps[2]!.before?.({} as never)

    expect(prepareMobileSurface.mock.calls).toEqual([
      ["content"],
      ["navigation"],
      ["content"],
    ])
  })
})
