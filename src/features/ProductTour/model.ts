import type { TFunction } from "i18next"
import type { Step } from "react-joyride"

import type { ProductTourPreferences } from "~/services/preferences/userPreferences"

import {
  getProductTourTargetSelector,
  PRODUCT_TOUR_MOBILE_STEP_IDS,
  PRODUCT_TOUR_STEP_IDS,
  PRODUCT_TOUR_TARGETS,
  PRODUCT_TOUR_VERSION,
  type ProductTourStepId,
} from "./constants"

export type ProductTourMobileSurface = "content" | "navigation"

interface BuildProductTourStepsOptions {
  isCompact: boolean
  prepareMobileSurface?: (surface: ProductTourMobileSurface) => Promise<void>
}

/** Return whether the current tour version should still be offered automatically. */
export function shouldOfferProductTour(
  preferences?: ProductTourPreferences,
): boolean {
  return (
    (preferences?.completedVersion ?? 0) < PRODUCT_TOUR_VERSION &&
    (preferences?.dismissedVersion ?? 0) < PRODUCT_TOUR_VERSION
  )
}

/** Create one responsive Joyride step from localized copy and target metadata. */
function createDesktopStep(
  id: ProductTourStepId,
  target: string,
  placement: "bottom" | "right",
  title: string,
  content: string,
): Step {
  return {
    id,
    target: getProductTourTargetSelector(target),
    placement,
    title,
    content,
  }
}

/** Build the localized, non-operational module introduction sequence. */
export function buildProductTourSteps(
  t: TFunction,
  { isCompact, prepareMobileSurface }: BuildProductTourStepsOptions,
): Step[] {
  if (isCompact) {
    const prepare = (surface: ProductTourMobileSurface) => async () => {
      await prepareMobileSurface?.(surface)
    }

    return [
      {
        id: PRODUCT_TOUR_MOBILE_STEP_IDS[0],
        target: getProductTourTargetSelector(PRODUCT_TOUR_TARGETS.MobileMenu),
        placement: "bottom-start",
        title: t("productTour:steps.mobileMenu.title"),
        content: t("productTour:steps.mobileMenu.description"),
        before: prepare("content"),
      },
      {
        id: PRODUCT_TOUR_MOBILE_STEP_IDS[1],
        target: getProductTourTargetSelector(PRODUCT_TOUR_TARGETS.Navigation),
        placement: "center",
        title: t("productTour:steps.mobileNavigation.title"),
        content: t("productTour:steps.mobileNavigation.description"),
        before: prepare("navigation"),
        spotlightPadding: 0,
      },
      {
        id: PRODUCT_TOUR_MOBILE_STEP_IDS[2],
        target: getProductTourTargetSelector(PRODUCT_TOUR_TARGETS.Content),
        placement: "center",
        title: t("productTour:steps.mobileContent.title"),
        content: t("productTour:steps.mobileContent.description"),
        before: prepare("content"),
      },
    ]
  }

  return [
    createDesktopStep(
      PRODUCT_TOUR_STEP_IDS[0],
      PRODUCT_TOUR_TARGETS.Workspace,
      "bottom",
      t("productTour:steps.workspace.title"),
      t("productTour:steps.workspace.description"),
    ),
    createDesktopStep(
      PRODUCT_TOUR_STEP_IDS[1],
      PRODUCT_TOUR_TARGETS.General,
      "right",
      t("productTour:steps.general.title"),
      t("productTour:steps.general.description"),
    ),
    createDesktopStep(
      PRODUCT_TOUR_STEP_IDS[2],
      PRODUCT_TOUR_TARGETS.Api,
      "right",
      t("productTour:steps.api.title"),
      t("productTour:steps.api.description"),
    ),
    createDesktopStep(
      PRODUCT_TOUR_STEP_IDS[3],
      PRODUCT_TOUR_TARGETS.Automation,
      "right",
      t("productTour:steps.automation.title"),
      t("productTour:steps.automation.description"),
    ),
    createDesktopStep(
      PRODUCT_TOUR_STEP_IDS[4],
      PRODUCT_TOUR_TARGETS.Insights,
      "right",
      t("productTour:steps.insights.title"),
      t("productTour:steps.insights.description"),
    ),
    createDesktopStep(
      PRODUCT_TOUR_STEP_IDS[5],
      PRODUCT_TOUR_TARGETS.SiteManagement,
      "right",
      t("productTour:steps.siteManagement.title"),
      t("productTour:steps.siteManagement.description"),
    ),
    createDesktopStep(
      PRODUCT_TOUR_STEP_IDS[6],
      PRODUCT_TOUR_TARGETS.System,
      "right",
      t("productTour:steps.system.title"),
      t("productTour:steps.system.description"),
    ),
  ]
}
