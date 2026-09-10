import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"

type ManagedSiteModelRedirectCapabilities = Pick<
  ManagedResourceModelsCapability<ManagedSiteRuntimeConfigValue>,
  "list" | "updateModelMapping"
> & {
  list: NonNullable<
    ManagedResourceModelsCapability<ManagedSiteRuntimeConfigValue>["list"]
  >
  updateModelMapping: NonNullable<
    ManagedResourceModelsCapability<ManagedSiteRuntimeConfigValue>["updateModelMapping"]
  >
}

type ManagedSiteModelRedirectCapabilityResolution =
  | {
      supported: true
      capabilities: ManagedSiteModelRedirectCapabilities
    }
  | { supported: false }

/** Resolves model redirect support exclusively from registered operations. */
export function resolveManagedSiteModelRedirectCapabilities(
  siteType: ManagedSiteType,
): ManagedSiteModelRedirectCapabilityResolution {
  const channels = getSiteTypeCapabilities(siteType).managedSites?.models

  if (!channels?.list || !channels.updateModelMapping) {
    return { supported: false }
  }

  return {
    supported: true,
    capabilities: {
      list: channels.list,
      updateModelMapping: channels.updateModelMapping,
    },
  }
}

export const supportsManagedSiteModelRedirect = (siteType: ManagedSiteType) =>
  resolveManagedSiteModelRedirectCapabilities(siteType).supported
