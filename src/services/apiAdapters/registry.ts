import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  getAccountSiteDefinition,
  type AccountSiteType,
} from "~/services/accountSiteDefinitions"
import type { ManagedSiteRuntimeConfigValueForType } from "~/services/managedSites/runtimeConfig"

import { aihubmixCapabilities } from "./aihubmix"
import type { ManagedSiteCapabilities } from "./contracts/managedSiteCapabilities"
import type {
  SiteType,
  SiteTypeCapabilities,
} from "./contracts/siteTypeCapabilities"
import { axonHubManagedSiteCapabilities } from "./managedSites/axonHub"
import { claudeCodeHubManagedSiteCapabilities } from "./managedSites/claudeCodeHub"
import { cliProxyApiCapabilities } from "./managedSites/cliProxyApi"
import { doneHubManagedSiteCapabilities } from "./managedSites/doneHub"
import { newApiManagedSiteCapabilities } from "./managedSites/newApi"
import { octopusManagedSiteCapabilities } from "./managedSites/octopus"
import { sub2ApiManagedSiteCapabilities } from "./managedSites/sub2api"
import { veloeraManagedSiteCapabilities } from "./managedSites/veloera"
import { createNewApiCapabilities } from "./newApi"
import { openRouterCapabilities } from "./openrouter"
import { sharedChatCapabilities } from "./sharedchat"
import { sub2ApiCapabilities } from "./sub2api"
import { voApiV2Capabilities } from "./voapiV2"

const managedSitesBySiteType = {
  [SITE_TYPES.CLI_PROXY_API]: cliProxyApiCapabilities,
  [SITE_TYPES.NEW_API]: newApiManagedSiteCapabilities,
  [SITE_TYPES.VELOERA]: veloeraManagedSiteCapabilities,
  [SITE_TYPES.DONE_HUB]: doneHubManagedSiteCapabilities,
  [SITE_TYPES.OCTOPUS]: octopusManagedSiteCapabilities,
  [SITE_TYPES.AXON_HUB]: axonHubManagedSiteCapabilities,
  [SITE_TYPES.CLAUDE_CODE_HUB]: claudeCodeHubManagedSiteCapabilities,
  [SITE_TYPES.SUB2API]: sub2ApiManagedSiteCapabilities,
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
    managedSites,
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

  if (siteType === SITE_TYPES.SUB2API) {
    return withManagedSites(sub2ApiCapabilities)
  }
  if (siteType === SITE_TYPES.VO_API_V2) return voApiV2Capabilities
  if (siteType === SITE_TYPES.AIHUBMIX) return aihubmixCapabilities
  if (siteType === SITE_TYPES.SHAREDCHAT) return sharedChatCapabilities
  if (siteType === SITE_TYPES.OPENROUTER) return openRouterCapabilities

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

/** Returns the registered managed-site capabilities without remapping their interfaces. */
export function getManagedSiteCapabilities<TSiteType extends ManagedSiteType>(
  siteType: TSiteType,
): ManagedSiteCapabilities<
  ManagedSiteRuntimeConfigValueForType<TSiteType>,
  TSiteType
> {
  const capabilities = managedSitesBySiteType[siteType]
  if (!capabilities) {
    throw new Error(
      `managedSites capabilities are not implemented for ${siteType}`,
    )
  }
  return capabilities as ManagedSiteCapabilities<
    ManagedSiteRuntimeConfigValueForType<TSiteType>,
    TSiteType
  >
}
