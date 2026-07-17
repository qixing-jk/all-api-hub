import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteMigrationCapability } from "~/types/managedSiteMigrationCapability"

const registrations: readonly {
  siteType: ManagedSiteType
  capability: ManagedSiteMigrationCapability
}[] = []

/** Returns the canonical migration capability registered for a managed site. */
export function resolveManagedSiteMigrationCapability(
  siteType: ManagedSiteType,
): ManagedSiteMigrationCapability | null {
  return (
    registrations.find((entry) => entry.siteType === siteType)?.capability ??
    null
  )
}
