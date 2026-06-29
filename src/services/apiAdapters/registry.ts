import { SITE_TYPES } from "~/constants/siteType"
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

const managedSitesBySiteType = {
  [SITE_TYPES.NEW_API]: newApiManagedSiteCapabilities,
  [SITE_TYPES.VELOERA]: veloeraManagedSiteCapabilities,
  [SITE_TYPES.DONE_HUB]: doneHubManagedSiteCapabilities,
  [SITE_TYPES.OCTOPUS]: octopusManagedSiteCapabilities,
  [SITE_TYPES.AXON_HUB]: axonHubManagedSiteCapabilities,
  [SITE_TYPES.CLAUDE_CODE_HUB]: claudeCodeHubManagedSiteCapabilities,
} as const

const withManagedSites = (
  capabilities: SiteTypeCapabilities,
): SiteTypeCapabilities => {
  const managedSites =
    managedSitesBySiteType[
      capabilities.siteType as keyof typeof managedSitesBySiteType
    ]

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

  const managedSites =
    managedSitesBySiteType[siteType as keyof typeof managedSitesBySiteType]
  if (managedSites) {
    return {
      siteType,
      managedSites,
    }
  }

  return { siteType }
}
