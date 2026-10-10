import type { ManagedSiteType } from "~/constants/siteType"
import { PRODUCT_ANALYTICS_MANAGED_SITE_TYPES } from "~/services/productAnalytics/contracts"
import type { ProductAnalyticsManagedSiteType } from "~/services/productAnalytics/contracts"

const MANAGED_SITE_TYPE_TO_PRODUCT_ANALYTICS_TYPE = {
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.CliProxyApi]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.CliProxyApi,
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
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Sub2Api]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Sub2Api,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.OmniRoute]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.OmniRoute,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.GptLoad]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.GptLoad,
  [PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Magpie]:
    PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Magpie,
} satisfies Record<ManagedSiteType, ProductAnalyticsManagedSiteType>

/**
 * Resolves a site type to the fixed managed-site analytics enum.
 */
export function resolveProductAnalyticsManagedSiteType(
  siteType: unknown,
): ProductAnalyticsManagedSiteType | undefined {
  if (
    typeof siteType !== "string" ||
    !Object.hasOwn(MANAGED_SITE_TYPE_TO_PRODUCT_ANALYTICS_TYPE, siteType)
  )
    return undefined

  return MANAGED_SITE_TYPE_TO_PRODUCT_ANALYTICS_TYPE[
    siteType as ManagedSiteType
  ]
}
