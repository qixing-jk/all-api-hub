import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { axonHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/axonHubMigration"
import type { ManagedSiteMigrationCapability } from "~/types/managedSiteMigrationCapability"

const registrations: readonly {
  siteType: ManagedSiteType
  capability: ManagedSiteMigrationCapability
}[] = [
  {
    siteType: SITE_TYPES.AXON_HUB,
    capability: axonHubManagedSiteMigrationCapability,
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
