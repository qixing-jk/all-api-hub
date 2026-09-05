import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteChannelsCapability } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"

type ManagedSiteModelRedirectCapabilities = Pick<
  ManagedSiteChannelsCapability<ManagedSiteRuntimeConfigValue>,
  "list" | "updateModelMapping"
> & {
  list: NonNullable<
    ManagedSiteChannelsCapability<ManagedSiteRuntimeConfigValue>["list"]
  >
  updateModelMapping: NonNullable<
    ManagedSiteChannelsCapability<ManagedSiteRuntimeConfigValue>["updateModelMapping"]
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
  const channels = getSiteTypeCapabilities(siteType).managedSites?.channels

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
