import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteConfigCapability } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  getManagedSiteRuntimeConfigForType,
  type ManagedSiteRuntimeConfigValueForType,
} from "~/services/managedSites/runtimeConfig"

/**
 * Builds the managed-site config capability for a concrete runtime config type.
 */
export function createManagedSiteConfigCapability<
  TSiteType extends ManagedSiteType,
>(
  siteType: TSiteType,
  checkValid: () => Promise<boolean>,
): ManagedSiteConfigCapability<
  ManagedSiteRuntimeConfigValueForType<TSiteType>
> {
  return {
    checkValid,
    get: async () => {
      const runtimeConfig = await getManagedSiteRuntimeConfigForType(siteType)
      return (
        (runtimeConfig?.config as
          | ManagedSiteRuntimeConfigValueForType<TSiteType>
          | undefined) ?? null
      )
    },
  }
}
