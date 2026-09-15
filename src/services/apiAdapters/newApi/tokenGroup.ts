import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"

/**
 * New API's empty key group inherits the account group; One API has no key group.
 * https://github.com/QuantumNous/new-api/blob/main/relay/common/relay_info.go
 */
export const tokenGroupFollowsAccount = (siteType: AccountSiteType): boolean =>
  siteType !== SITE_TYPES.ONE_API &&
  getAccountSiteDefinition(siteType)?.adapterFamily ===
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
