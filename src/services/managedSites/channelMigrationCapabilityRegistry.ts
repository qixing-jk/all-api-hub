import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { axonHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/axonHub/migration"
import { claudeCodeHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/claudeCodeHub/migration"
import { cliProxyApiManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/cliProxyApi/migration"
import { doneHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/doneHub/migration"
import { gptLoadManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/gptLoad/migration"
import { newApiManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/newApi/migration"
import { octopusManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/octopus/migration"
import { omniRouteManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/omniRoute/migration"
import { sub2ApiManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/sub2api/migration"
import { veloeraManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/veloera/migration"
import type { ManagedSiteMigrationCapability } from "~/types/managedSiteMigrationCapability"

const registrations: readonly {
  siteType: ManagedSiteType
  capability: ManagedSiteMigrationCapability
}[] = [
  {
    siteType: SITE_TYPES.CLI_PROXY_API,
    capability: cliProxyApiManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.SUB2API,
    capability: sub2ApiManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.OCTOPUS,
    capability: octopusManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.NEW_API,
    capability: newApiManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.VELOERA,
    capability: veloeraManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.DONE_HUB,
    capability: doneHubManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.AXON_HUB,
    capability: axonHubManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    capability: claudeCodeHubManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.OMNIROUTE,
    capability: omniRouteManagedSiteMigrationCapability,
  },
  {
    siteType: SITE_TYPES.GPT_LOAD,
    capability: gptLoadManagedSiteMigrationCapability,
  },
]

/** Returns the canonical migration capability registered for a managed site. */
export function resolveManagedSiteMigrationCapability(
  siteType: ManagedSiteType,
): ManagedSiteMigrationCapability | null {
  return (
    registrations.find((entry) => entry.siteType === siteType)?.capability ??
    null
  )
}
