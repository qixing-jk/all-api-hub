import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteChannel } from "~/types/managedSite"

/** Returns a stable deep-link identity; process-local projections cannot identify a native resource. */
export function getManagedSiteChannelNavigationId(
  managedSiteType: ManagedSiteType,
  channel: { id: number | string },
): string | number | undefined {
  if (managedSiteType === SITE_TYPES.AXON_HUB) {
    if (typeof channel.id === "string") return channel.id
    const nativeId = (
      channel as ManagedSiteChannel & {
        _axonHubData?: { id?: string | number }
      }
    )._axonHubData?.id
    if (nativeId !== undefined && nativeId !== null) {
      return nativeId
    }
    return undefined
  }

  return channel.id
}
