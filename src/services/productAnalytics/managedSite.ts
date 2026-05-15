import type { ManagedSiteType } from "~/constants/siteType"

import { PRODUCT_ANALYTICS_MANAGED_SITE_TYPES } from "./events"
import type { ProductAnalyticsManagedSiteType } from "./events"

const MANAGED_SITE_TYPE_TO_PRODUCT_ANALYTICS_TYPE = {
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Veloera]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Veloera,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.DoneHub]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.DoneHub,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.ClaudeCodeHub]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.ClaudeCodeHub,
} satisfies Record<ManagedSiteType, ProductAnalyticsManagedSiteType>

/**
 * Resolves a site type to the fixed managed-site analytics enum.
 */
export function resolveProductAnalyticsManagedSiteType(
  siteType: unknown,
): ProductAnalyticsManagedSiteType | undefined {
  if (typeof siteType !== "string") return undefined

  return MANAGED_SITE_TYPE_TO_PRODUCT_ANALYTICS_TYPE[
    siteType as ManagedSiteType
  ]
}
