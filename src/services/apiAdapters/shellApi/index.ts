import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  type AccountSiteType,
} from "~/constants/siteType"
import { createCompatibleAccountCapabilities } from "~/services/apiAdapters/compatibleCapabilities"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"

/** Tries the common Shell account protocol, with explicit deployment overrides. */
export function createShellApiCapabilities(
  siteType: AccountSiteType,
): SiteTypeCapabilities {
  return {
    siteType,
    family: ACCOUNT_SITE_ADAPTER_FAMILIES.ShellApiFamily,
    ...createCompatibleAccountCapabilities(siteType),
  }
}
