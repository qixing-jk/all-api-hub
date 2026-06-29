import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  getAccountSiteDefinition,
  type AccountSiteType,
} from "~/services/accountSiteDefinitions"

import { aihubmixCapabilities } from "./aihubmix"
import type {
  SiteType,
  SiteTypeCapabilities,
} from "./contracts/siteTypeCapabilities"
import { axonHubManagedSiteCapabilities } from "./managedSites/axonHub"
import { claudeCodeHubManagedSiteCapabilities } from "./managedSites/claudeCodeHub"
import { doneHubManagedSiteCapabilities } from "./managedSites/doneHub"
import { newApiManagedSiteCapabilities } from "./managedSites/newApi"
import { octopusManagedSiteCapabilities } from "./managedSites/octopus"
import { veloeraManagedSiteCapabilities } from "./managedSites/veloera"
import { createNewApiCapabilities } from "./newApi"
import { sub2ApiCapabilities } from "./sub2api"

type ManagedSiteCapabilities = NonNullable<SiteTypeCapabilities["managedSites"]>

const managedSitesBySiteType = {
  [SITE_TYPES.NEW_API]: newApiManagedSiteCapabilities,
  [SITE_TYPES.VELOERA]: veloeraManagedSiteCapabilities,
  [SITE_TYPES.DONE_HUB]: doneHubManagedSiteCapabilities,
  [SITE_TYPES.OCTOPUS]: octopusManagedSiteCapabilities,
  [SITE_TYPES.AXON_HUB]: axonHubManagedSiteCapabilities,
  [SITE_TYPES.CLAUDE_CODE_HUB]: claudeCodeHubManagedSiteCapabilities,
} satisfies Record<ManagedSiteType, ManagedSiteCapabilities>

const withManagedSites = (
  capabilities: SiteTypeCapabilities,
): SiteTypeCapabilities => {
  const managedSites = isManagedSiteCapabilityType(capabilities.siteType)
    ? managedSitesBySiteType[capabilities.siteType]
    : undefined

  if (!managedSites) {
    return capabilities
  }

  return {
    ...capabilities,
    managedSites: {
      ...capabilities.managedSites,
      ...managedSites,
    },
  }
}

const isManagedSiteCapabilityType = (
  siteType: SiteType,
): siteType is ManagedSiteType =>
  Object.hasOwn(managedSitesBySiteType, siteType)

/**
 * Returns the capability groups supported by the selected site type.
 */
export function getSiteTypeCapabilities(
  siteType: SiteType,
): SiteTypeCapabilities {
  const adapterFamily =
    getAccountSiteDefinition(siteType as AccountSiteType)?.adapterFamily ??
    ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported

  if (siteType === SITE_TYPES.SUB2API) return sub2ApiCapabilities
  if (siteType === SITE_TYPES.AIHUBMIX) return aihubmixCapabilities

  if (adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily) {
    return withManagedSites(
      createNewApiCapabilities(siteType as AccountSiteType),
    )
  }

  if (isManagedSiteCapabilityType(siteType)) {
    return {
      siteType,
      managedSites: managedSitesBySiteType[siteType],
    }
  }

  return { siteType }
}
