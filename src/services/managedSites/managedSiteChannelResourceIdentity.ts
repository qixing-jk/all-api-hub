import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"

/** Returns a stable deep-link identity; process-local projections cannot identify a native resource. */
export function getManagedSiteChannelNavigationId(
  managedSiteType: ManagedSiteType,
  channel: { id: number | string },
): string | number | undefined {
  if (managedSiteType === SITE_TYPES.AXON_HUB) {
    return typeof channel.id === "string" ? channel.id : undefined
  }

  return channel.id
}
