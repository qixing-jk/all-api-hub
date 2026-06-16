import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

import type { SiteAdapter } from "./contracts/siteAdapter"
import { newApiAdapter } from "./newApi"
import { sub2ApiAdapter } from "./sub2api"

const newApiFamilySiteTypes = new Set<AccountSiteType>([
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.V_API,
  SITE_TYPES.VO_API,
  SITE_TYPES.SUPER_API,
  SITE_TYPES.RIX_API,
  SITE_TYPES.NEO_API,
  SITE_TYPES.WONG_GONGYI,
  SITE_TYPES.UNKNOWN,
])

const createNewApiFamilyAdapter = (siteType: AccountSiteType): SiteAdapter => ({
  ...newApiAdapter,
  siteType,
})

const createUnsupportedAdapter = (siteType: AccountSiteType): SiteAdapter => ({
  siteType,
})

/**
 * Resolve the narrow capability adapter for an account site type.
 */
export function getSiteAdapter(siteType: AccountSiteType): SiteAdapter {
  if (siteType === SITE_TYPES.SUB2API) {
    return sub2ApiAdapter
  }

  if (newApiFamilySiteTypes.has(siteType)) {
    return createNewApiFamilyAdapter(siteType)
  }

  return createUnsupportedAdapter(siteType)
}
