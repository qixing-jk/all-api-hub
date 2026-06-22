import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  getAccountSiteDefinition,
  type AccountSiteType,
} from "~/services/accountSiteDefinitions"

import { aihubmixAdapter } from "./aihubmix"
import type { SiteAdapter } from "./contracts/siteAdapter"
import { createNewApiAdapter } from "./newApi"
import { sub2ApiAdapter } from "./sub2api"

const createNewApiFamilyAdapter = (siteType: AccountSiteType): SiteAdapter =>
  createNewApiAdapter(siteType)

const createUnsupportedAdapter = (siteType: AccountSiteType): SiteAdapter => ({
  siteType,
})

/**
 * Resolve the narrow capability adapter for an account site type.
 */
export function getSiteAdapter(siteType: AccountSiteType): SiteAdapter {
  const adapterFamily =
    getAccountSiteDefinition(siteType)?.adapterFamily ??
    ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported

  if (adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api) {
    return sub2ApiAdapter
  }

  if (adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix) {
    return aihubmixAdapter
  }

  if (adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily) {
    return createNewApiFamilyAdapter(siteType)
  }

  return createUnsupportedAdapter(siteType)
}
