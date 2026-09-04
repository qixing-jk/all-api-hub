import { OPTIONS_MENU_CATEGORY_IDS } from "~/constants/optionsMenuIds"

export const PRODUCT_TOUR_VERSION = 1

export const PRODUCT_TOUR_STEP_IDS = [
  "workspace",
  "general",
  "api",
  "automation",
  "insights",
  "siteManagement",
  "system",
] as const

export const PRODUCT_TOUR_MOBILE_STEP_IDS = [
  "mobileMenu",
  "mobileNavigation",
  "mobileContent",
] as const

export type ProductTourStepId =
  | (typeof PRODUCT_TOUR_STEP_IDS)[number]
  | (typeof PRODUCT_TOUR_MOBILE_STEP_IDS)[number]

export const PRODUCT_TOUR_TARGETS = {
  Workspace: "workspace",
  MobileMenu: "mobile-menu",
  Navigation: "navigation",
  Content: "content",
  General: "category-general",
  Api: "category-api",
  Automation: "category-automation",
  Insights: "category-insights",
  SiteManagement: "category-site-management",
  System: "category-system",
} as const

export const PRODUCT_TOUR_TARGET_ATTRIBUTE = "data-product-tour-target"
export const PRODUCT_TOUR_FOCUS_RETURN_ATTRIBUTE =
  "data-product-tour-focus-return"

/** Build the selector shared by tour steps and presentation preparation. */
export function getProductTourTargetSelector(target: string) {
  return `[${PRODUCT_TOUR_TARGET_ATTRIBUTE}="${target}"]`
}

export const PRODUCT_TOUR_CATEGORY_TARGETS = {
  [OPTIONS_MENU_CATEGORY_IDS.GENERAL]: PRODUCT_TOUR_TARGETS.General,
  [OPTIONS_MENU_CATEGORY_IDS.API]: PRODUCT_TOUR_TARGETS.Api,
  [OPTIONS_MENU_CATEGORY_IDS.AUTOMATION]: PRODUCT_TOUR_TARGETS.Automation,
  [OPTIONS_MENU_CATEGORY_IDS.INSIGHTS]: PRODUCT_TOUR_TARGETS.Insights,
  [OPTIONS_MENU_CATEGORY_IDS.SITE_MANAGEMENT]:
    PRODUCT_TOUR_TARGETS.SiteManagement,
  [OPTIONS_MENU_CATEGORY_IDS.SYSTEM]: PRODUCT_TOUR_TARGETS.System,
} as const

export const PRODUCT_TOUR_REPLAY_TARGET_ID = "product-tour-replay"

export const PRODUCT_TOUR_SOURCES = {
  Overview: "overview",
  About: "about",
} as const

export type ProductTourSource =
  (typeof PRODUCT_TOUR_SOURCES)[keyof typeof PRODUCT_TOUR_SOURCES]
